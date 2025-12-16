import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import { getFirestore, Transaction } from "firebase-admin/firestore";

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

// Production database (default) - initialized lazily to avoid issues before Firebase app init
const getDbProd = () => getFirestore();

// ========== STRIPE WEBHOOK HANDLER (PRODUCTION) ==========
export const stripeWebhook = onRequest(
    {
        region: "europe-west1",
        secrets: [STRIPE_SECRET, STRIPE_WEBHOOK_SECRET],
    },
    async (req, res) => {
        console.log("🔔 [PROD] Webhook received");

        if (req.method !== "POST") {
            res.status(405).send("Method Not Allowed");
            return;
        }

        const stripe = new Stripe(STRIPE_SECRET.value(), {
            apiVersion: "2024-06-20" as any,
        });

        const sig = req.headers["stripe-signature"];
        if (!sig) {
            console.error("❌ No Stripe signature");
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
            console.error("❌ Webhook signature verification failed:", err.message);
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }

        console.log("✅ [PROD] Webhook verified:", event.type);

        // Handle payment_intent.succeeded event
        if (event.type === "payment_intent.succeeded") {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            console.log("💰 [PROD] Payment succeeded:", paymentIntent.id);

            try {
                await handleSuccessfulPayment(paymentIntent);
                res.status(200).json({ received: true });
            } catch (err: any) {
                console.error("❌ Error handling payment:", err);
                // Still return 200 to acknowledge receipt, but log error
                res.status(200).json({ received: true, error: err.message });
            }
            return;
        }

        // Handle payment_intent.payment_failed event
        if (event.type === "payment_intent.payment_failed") {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            console.log("❌ [PROD] Payment failed:", paymentIntent.id);
            // You could add logic here to notify the user or clean up
        }

        res.status(200).json({ received: true });
    }
);

// ========== HELPER: HANDLE SUCCESSFUL PAYMENT ==========
async function handleSuccessfulPayment(paymentIntent: Stripe.PaymentIntent) {
    const metadata = paymentIntent.metadata;
    const paymentIntentId = paymentIntent.id;

    console.log("📦 [PROD] Processing payment with FULL metadata:", JSON.stringify(metadata, null, 2));

    if (!metadata.giverId || !metadata.cart) {
        console.error("❌ Missing required metadata (giverId or cart)");
        throw new Error("Missing required metadata");
    }

    // Parse cart
    let cart: Array<{ experienceId: string; quantity: number }> = [];
    try {
        cart = JSON.parse(metadata.cart);
    } catch (err) {
        console.error("❌ Cannot parse cart metadata:", err);
        throw new Error("Invalid cart metadata");
    }

    if (!Array.isArray(cart) || cart.length === 0) {
        throw new Error("Cart is empty or invalid");
    }

    // ✅ Use transaction for idempotency (PRODUCTION DATABASE)
    const db = getDbProd();
    const processedRef = db.collection("processedPayments").doc(paymentIntentId);

    return await db.runTransaction(async (transaction: Transaction) => {
        const processedDoc = await transaction.get(processedRef);

        if (processedDoc.exists) {
            console.log("⚠️ Payment already processed - returning existing gifts");
            const existingGiftIds = processedDoc.data()?.gifts || [];

            // Fetch and return existing gifts
            const existingGifts = await Promise.all(
                existingGiftIds.map(async (giftId: string) => {
                    const giftDoc = await db.collection("experienceGifts").doc(giftId).get();
                    return giftDoc.data();
                })
            );

            return existingGifts.filter(Boolean);
        }

        // --- Create multiple experience gifts ---
        const createdGifts: any[] = [];
        const batch = db.batch();

        for (const item of cart) {
            const { experienceId, quantity } = item;

            // We create N gifts for quantity
            for (let i = 0; i < quantity; i++) {
                const id = db.collection("experienceGifts").doc().id;
                const claimCode = await generateUniqueClaimCode();

                // ✅ Set expiration date (30 days from now)
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 30);

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
                    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                    createdAt: admin.firestore.Timestamp.now(),
                    updatedAt: admin.firestore.Timestamp.now(),
                };

                batch.set(db.collection("experienceGifts").doc(id), newGift);
                createdGifts.push(newGift);
            }
        }

        // Mark as processed
        transaction.set(processedRef, {
            processed: true,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            gifts: createdGifts.map(g => g.id),
        });

        await batch.commit();
        console.log(`✅ [PROD] Created ${createdGifts.length} gifts for paymentIntent ${paymentIntentId}`);

        return createdGifts;
    });
}


// ========== HELPER: GENERATE CLAIM CODE ==========
/**
 * Generate cryptographically secure claim code
 * 12 characters = ~3.2 quadrillion combinations
 */
function generateClaimCode(): string {
    const crypto = require('crypto');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';

    // Generate 12 random characters
    while (code.length < 12) {
        const bytes = crypto.randomBytes(1);
        const randomIndex = bytes[0] % chars.length;
        code += chars[randomIndex];
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

        console.warn(`⚠️ Claim code collision detected (attempt ${attempt + 1})`);
    }

    throw new Error('Failed to generate unique claim code after 10 attempts');
}
