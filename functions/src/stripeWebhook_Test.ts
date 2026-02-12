import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import { db } from './index';
import { GENERAL_EMAIL_USER, GENERAL_EMAIL_PASS } from './services/emailService.js';

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY_SANDBOX");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET_TEST");

// ========== STRIPE WEBHOOK HANDLER ==========
export const stripeWebhook_Test = onRequest(
  {
    region: "europe-west1",
    secrets: [STRIPE_SECRET, STRIPE_WEBHOOK_SECRET, GENERAL_EMAIL_USER, GENERAL_EMAIL_PASS],
  },
  async (req, res) => {
    console.log("🔔 Webhook received");

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

    console.log("✅ Webhook verified:", event.type);

    // Handle payment_intent.succeeded event
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log("💰 Payment succeeded:", paymentIntent.id);

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
      console.log("❌ Payment failed:", paymentIntent.id);
      // You could add logic here to notify the user or clean up
    }

    res.status(200).json({ received: true });
  }
);

// ========== HELPER: HANDLE SUCCESSFUL PAYMENT ==========
async function handleSuccessfulPayment(paymentIntent: Stripe.PaymentIntent) {
  const metadata = paymentIntent.metadata;
  const paymentIntentId = paymentIntent.id;

  console.log("📦 [TEST] Processing payment with FULL metadata:", JSON.stringify(metadata, null, 2));

  // ✅ ROUTE TO VALENTINE HANDLER
  if (metadata.type === 'valentine_challenge') {
    console.log("💘 [TEST] Detected Valentine's challenge payment");
    return await handleValentinePayment_Test(paymentIntent);
  }

  // ✅ STANDARD GIFT PURCHASE FLOW
  console.log("🧪 typeof cart metadata:", typeof metadata.cart);
  console.log("🧪 raw cart metadata:", metadata.cart);
  console.log("🧪 giverId metadata:", metadata.giverId);
  console.log("🧪 JSON.parse(metadata.cart)", JSON.parse(metadata.cart))


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

  // ✅ Use transaction for idempotency
  const processedRef = db.collection("processedPayments").doc(paymentIntentId);

  return await db.runTransaction(async (transaction) => {
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
    console.log(`✅ Created ${createdGifts.length} gifts for paymentIntent ${paymentIntentId}`);

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

    // Check for existing code
    const existing = await db
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

// ========== VALENTINE CHALLENGE HANDLER (TEST) ==========
async function handleValentinePayment_Test(paymentIntent: Stripe.PaymentIntent) {
  const metadata = paymentIntent.metadata;
  const paymentIntentId = paymentIntent.id;

  // Validate Valentine metadata
  if (!metadata.purchaserEmail || !metadata.experienceId) {
    throw new Error("Missing required Valentine metadata");
  }

  // Check idempotency
  const processedRef = db.collection("processedPayments").doc(paymentIntentId);
  const processedDoc = await processedRef.get();

  if (processedDoc.exists) {
    console.log("⚠️ [TEST] Valentine payment already processed");
    return;
  }

  // Generate unique codes for both partners
  // CRITICAL: Generate sequentially to avoid race condition where both get same code
  const purchaserCode = await generateUniqueValentineCode_Test();
  console.log(`✅ [TEST] Generated purchaser code: ${purchaserCode}`);

  let partnerCode = await generateUniqueValentineCode_Test();
  console.log(`✅ [TEST] Generated partner code (initial): ${partnerCode}`);

  // Ensure partner code is different from purchaser code
  let attempts = 0;
  while (partnerCode === purchaserCode && attempts < 10) {
    console.warn(`⚠️ [TEST] Partner code matched purchaser code, regenerating (attempt ${attempts + 1}/10)...`);
    partnerCode = await generateUniqueValentineCode_Test();
    console.log(`✅ [TEST] Generated partner code (attempt ${attempts + 1}): ${partnerCode}`);
    attempts++;
  }

  // CRITICAL: Validate codes are different BEFORE saving to Firestore
  if (partnerCode === purchaserCode) {
    console.error(`❌ [TEST] CRITICAL: Failed to generate distinct codes after 10 attempts!`);
    console.error(`   Purchaser code: ${purchaserCode}`);
    console.error(`   Partner code: ${partnerCode}`);
    throw new Error('[TEST] Failed to generate distinct codes for partners after 10 attempts');
  }

  console.log(`✅ [TEST] Final codes - Purchaser: ${purchaserCode}, Partner: ${partnerCode}`);
  console.log(`✅ [TEST] Codes are distinct: ${purchaserCode !== partnerCode}`);


  // Create Valentine challenge document
  const challengeId = db.collection("valentineChallenges").doc().id;
  const challengeData = {
    id: challengeId,
    purchaserEmail: metadata.purchaserEmail,
    experienceId: metadata.experienceId,
    experiencePrice: parseFloat(metadata.experiencePrice || "0"),
    mode: metadata.mode as 'revealed' | 'secret',
    goalType: metadata.goalType,
    weeks: parseInt(metadata.weeks),
    sessionsPerWeek: parseInt(metadata.sessionsPerWeek),
    paymentIntentId,
    purchaseDate: admin.firestore.Timestamp.now(),
    totalAmount: paymentIntent.amount / 100,
    purchaserCode,
    partnerCode,
    purchaserCodeRedeemed: false,
    partnerCodeRedeemed: false,
    status: 'pending_redemption',
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  };

  // Save to Firestore
  await db.collection("valentineChallenges").doc(challengeId).set(challengeData);

  // Mark as processed
  await processedRef.set({
    processed: true,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    type: 'valentine_challenge',
    challengeId,
  });

  // Send single email to purchaser with both codes
  try {
    const { sendEmail } = await import('./services/emailService.js');
    const { generateValentineEmail } = await import('./templates/valentineEmail.js');

    await sendEmail(
      metadata.purchaserEmail,
      "💕 Your Valentine's Challenge Codes",
      generateValentineEmail(
        metadata.purchaserEmail,
        purchaserCode,
        partnerCode
      )
    );

    console.log("✅ [TEST] Valentine email sent to purchaser:", metadata.purchaserEmail);
  } catch (emailError) {
    console.error("❌ [TEST] Failed to send email:", emailError);
    // Don't fail the webhook - codes are still saved in Firestore
  }

  console.log("✅ [TEST] Valentine challenge created:", challengeId);

  return { challengeId, purchaserCode, partnerCode };
}

// ========== GENERATE UNIQUE VALENTINE CODE (TEST) ==========
async function generateUniqueValentineCode_Test(): Promise<string> {
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateClaimCode();

    // Check for collisions in valentine challenges
    const existing = await db
      .collection('valentineChallenges')
      .where('purchaserCode', '==', code)
      .limit(1)
      .get();

    const existing2 = await db
      .collection('valentineChallenges')
      .where('partnerCode', '==', code)
      .limit(1)
      .get();

    if (existing.empty && existing2.empty) {
      return code;
    }

    console.warn(`⚠️ [TEST] Valentine code collision (attempt ${attempt + 1})`);
  }

  throw new Error('[TEST] Failed to generate unique Valentine code');
}