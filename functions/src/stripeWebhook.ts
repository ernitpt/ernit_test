import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import { getFirestore, Transaction } from "firebase-admin/firestore";
import { sendEmail, GENERAL_EMAIL_USER, GENERAL_EMAIL_PASS } from "./services/emailService";
import crypto from 'crypto';

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

// Production database (default) - initialized lazily to avoid issues before Firebase app init
const getDbProd = () => getFirestore();

// ========== STRIPE WEBHOOK HANDLER (PRODUCTION) ==========
export const stripeWebhook = onRequest(
    {
        region: "europe-west1",
        secrets: [STRIPE_SECRET, STRIPE_WEBHOOK_SECRET, GENERAL_EMAIL_USER, GENERAL_EMAIL_PASS],
    },
    async (req, res) => {
        logger.info("🔔 [PROD] Webhook received");

        if (req.method !== "POST") {
            res.status(405).send("Method Not Allowed");
            return;
        }

        const stripe = new Stripe(STRIPE_SECRET.value(), {
            apiVersion: "2024-06-20" as any,
        });

        const sig = req.headers["stripe-signature"];
        if (!sig) {
            logger.error("❌ No Stripe signature");
            res.status(400).send("No signature");
            return;
        }

        let event: Stripe.Event;

        try {
            // Verify webhook signature
            event = stripe.webhooks.constructEvent(
                req.rawBody,
                sig,
                STRIPE_WEBHOOK_SECRET.value()
            );
        } catch (err: any) {
            logger.error("❌ Webhook signature verification failed:", err.message);
            res.status(400).send('Webhook signature verification failed');
            return;
        }

        logger.info("✅ [PROD] Webhook verified:", event.type);

        // Handle payment_intent.succeeded event
        if (event.type === "payment_intent.succeeded") {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            logger.info("💰 [PROD] Payment succeeded:", paymentIntent.id);

            try {
                await handleSuccessfulPayment(paymentIntent);
                res.status(200).json({ received: true });
            } catch (err: any) {
                logger.error("❌ Error handling payment:", err);
                // T1-2: Return 500 so Stripe retries — gifts must be created
                res.status(500).json({ error: "Payment processing failed" });
            }
            return;
        }

        // Handle payment_intent.payment_failed event
        if (event.type === "payment_intent.payment_failed") {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            logger.info("❌ [PROD] Payment failed:", paymentIntent.id);
            const metadata = paymentIntent.metadata;
            if (metadata?.giverId) {
                try {
                    await getDbProd().collection('notifications').add({
                        userId: metadata.giverId,
                        type: 'payment_failed',
                        title: 'Payment Failed',
                        message: 'Your payment method was declined. Please update your payment details.',
                        data: { giftId: metadata.giftId || '' },
                        read: false,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    logger.info(`✅ [PROD] Payment failed notification sent to giver ${metadata.giverId}`);
                } catch (notifError) {
                    logger.error("❌ [PROD] Failed to send payment failed notification:", notifError);
                }
            }
        }

        res.status(200).json({ received: true });
    }
);

// ========== HELPER: HANDLE SUCCESSFUL PAYMENT ==========
async function handleSuccessfulPayment(paymentIntent: Stripe.PaymentIntent) {
    const metadata = paymentIntent.metadata;
    const paymentIntentId = paymentIntent.id;

    logger.info("📦 [PROD] Processing payment with FULL metadata:", JSON.stringify(metadata, null, 2));

    // ✅ DEFERRED CHARGE — handled by chargeDeferredGift trigger, not here
    if (metadata?.type === 'deferred_charge') {
        logger.info('Deferred charge payment succeeded, handled by trigger');
        return;
    }

    // ✅ STANDARD GIFT PURCHASE FLOW
    if (!metadata.giverId || !metadata.cart) {
        logger.error("❌ Missing required metadata (giverId or cart)");
        throw new Error("Missing required metadata");
    }

    // Parse cart
    let cart: Array<{ experienceId: string; quantity: number }> = [];
    try {
        cart = JSON.parse(metadata.cart);
    } catch (err) {
        logger.error("❌ Cannot parse cart metadata:", err);
        throw new Error("Invalid cart metadata");
    }

    if (!Array.isArray(cart) || cart.length === 0) {
        throw new Error("Cart is empty or invalid");
    }

    let totalQuantity = 0;
    for (const item of cart) {
        if (!item.experienceId || typeof item.experienceId !== 'string' || item.experienceId.length > 100) {
            throw new Error("Invalid experienceId in cart");
        }
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50) {
            throw new Error("Invalid quantity in cart");
        }
        totalQuantity += item.quantity;
    }
    if (totalQuantity > 100) {
        throw new Error("Total cart quantity cannot exceed 100 gifts");
    }

    // ✅ Use transaction for idempotency (PRODUCTION DATABASE)
    const db = getDbProd();
    const processedRef = db.collection("processedPayments").doc(paymentIntentId);

    // Pre-generate claim codes outside the transaction to avoid external reads inside transaction
    const totalClaimCodes = cart.reduce((sum, item) => sum + item.quantity, 0);
    const claimCodes: string[] = [];
    for (let i = 0; i < totalClaimCodes; i++) {
        claimCodes.push(await generateUniqueClaimCode());
    }
    let claimCodeIndex = 0;

    return await db.runTransaction(async (transaction: Transaction) => {
        const processedDoc = await transaction.get(processedRef);

        if (processedDoc.exists) {
            logger.info("⚠️ Payment already processed - verifying existing gifts");
            const existingGiftIds = processedDoc.data()?.gifts || [];

            // Fetch and verify existing gifts still exist with valid status
            const existingGifts = await Promise.all(
                existingGiftIds.map(async (giftId: string) => {
                    const giftDoc = await db.collection("experienceGifts").doc(giftId).get();
                    if (!giftDoc.exists) {
                        logger.warn(`⚠️ Cached gift ${giftId} no longer exists`);
                        return null;
                    }
                    const giftData = giftDoc.data();
                    if (giftData?.status !== 'pending' && giftData?.status !== 'active' && giftData?.status !== 'claimed') {
                        logger.warn(`⚠️ Cached gift ${giftId} has unexpected status: ${giftData?.status}`);
                    }
                    return giftData;
                })
            );

            const validGifts = existingGifts.filter(Boolean);
            if (validGifts.length === 0) {
                logger.error(`❌ All cached gifts for ${paymentIntentId} are missing — this needs manual investigation`);
            }
            return validGifts;
        }

        // --- Create multiple experience gifts using transaction ---
        const createdGifts: any[] = [];

        for (const item of cart) {
            const { experienceId, quantity } = item;

            // We create N gifts for quantity
            for (let i = 0; i < quantity; i++) {
                const id = db.collection("experienceGifts").doc().id;
                const claimCode = claimCodes[claimCodeIndex++];

                // ✅ Set expiration date (365 days from now)
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 365);

                const newGift = {
                    id,
                    giverId: metadata.giverId,
                    giverName: metadata.giverName || "",
                    experienceId,
                    personalizedMessage: metadata.personalizedMessage || "",
                    partnerId: metadata.partnerId || "",
                    deliveryDate: admin.firestore.Timestamp.now(),
                    status: "pending",
                    payment: "paid",
                    paymentIntentId,
                    claimCode,
                    isMystery: metadata.isMystery === "true",
                    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                    createdAt: admin.firestore.Timestamp.now(),
                    updatedAt: admin.firestore.Timestamp.now(),
                };

                transaction.set(db.doc(`experienceGifts/${id}`), newGift);
                createdGifts.push(newGift);
            }
        }

        // Mark as processed
        transaction.set(processedRef, {
            processed: true,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            gifts: createdGifts.map(g => g.id),
        });

        logger.info(`✅ [PROD] Created ${createdGifts.length} gifts for paymentIntent ${paymentIntentId}`);

        return createdGifts;
    });
}


// ========== HELPER: GENERATE CLAIM CODE ==========
/**
 * Generate cryptographically secure claim code
 * 12 characters = ~3.2 quadrillion combinations
 */
function generateClaimCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';

    // Generate 12 random characters
    while (code.length < 12) {
        const bytes = crypto.randomBytes(1);
        // Rejection sampling to eliminate modulo bias
        // 252 is the largest multiple of 36 that fits in a byte (7 * 36 = 252)
        if (bytes[0] >= 252) continue;
        code += chars[bytes[0] % chars.length];
    }

    return code;
}

/**
 * Generate unique claim code with collision detection
 */
async function generateUniqueClaimCode(): Promise<string> {
    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const code = generateClaimCode();

        // Check for existing code (PRODUCTION DATABASE)
        const existing = await getDbProd()
            .collection('experienceGifts')
            .where('claimCode', '==', code)
            .limit(1)
            .get();

        if (existing.empty) {
            return code;
        }

        logger.warn(`⚠️ Claim code collision detected (attempt ${attempt + 1})`);
    }

    throw new Error('Failed to generate unique claim code after 10 attempts');
}
