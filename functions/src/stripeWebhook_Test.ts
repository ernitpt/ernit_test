import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import { db } from './index'; 

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY_SANDBOX");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET_TEST");

// const db = admin.firestore();


// ========== STRIPE WEBHOOK HANDLER ==========
export const stripeWebhook_Test = onRequest(
  {
    region: "europe-west1",
    secrets: [STRIPE_SECRET, STRIPE_WEBHOOK_SECRET],
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

  console.log("📦 Processing payment with FULL metadata:", JSON.stringify(metadata, null, 2));
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

  // Check existing gifts to avoid duplicates
  const existing = await db
    .collection("experienceGifts")
    .where("paymentIntentId", "==", paymentIntentId)
    .get();

  if (!existing.empty) {
    console.log("⚠️ Gifts already created for this PaymentIntent — returning existing");
    return existing.docs.map((d) => d.data());
  }

  // --- Create multiple experience gifts ---
  const batch = db.batch();
  const createdGifts: any[] = [];

  for (const item of cart) {
    const { experienceId, quantity } = item;

    // We create N gifts for quantity
    for (let i = 0; i < quantity; i++) {
      const id = db.collection("experienceGifts").doc().id;
      const claimCode = generateClaimCode();

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
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      };

      batch.set(db.collection("experienceGifts").doc(id), newGift);
      createdGifts.push(newGift);
    }
  }

  await batch.commit();
  console.log(`✅ Created ${createdGifts.length} gifts for paymentIntent ${paymentIntentId}`);

  return createdGifts;
}


// ========== HELPER: GENERATE CLAIM CODE ==========
function generateClaimCode(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}