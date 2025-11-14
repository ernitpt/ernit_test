import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import * as admin from "firebase-admin";

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY_SANDBOX");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ========== CREATE PAYMENT INTENT WITH CART ==========
export const stripeCreatePaymentIntent_Test = onRequest(
  {
    region: "europe-west1",
    secrets: [STRIPE_SECRET],
  },
  async (req, res) => {
    const origin = req.headers.origin || "";
    console.log("stripeCreatePaymentIntentTest origin:", origin);

    const allowedOrigins: (string | RegExp)[] = [
      "http://localhost:8081",
      "http://localhost:3000",
      /^https:\/\/.*\.vercel\.app$/,
      "https://ernit-nine.vercel.app",
      "https://ernit981723498127658912765187923546.vercel.app",
    ];

    const allowOrigin = allowedOrigins.some((entry) =>
      entry instanceof RegExp ? entry.test(origin) : entry === origin
    );
    if (allowOrigin) res.set("Access-Control-Allow-Origin", origin);

    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] ||
        "Content-Type, Authorization"
    );
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.status(204).send();
      return;
    }

    try {
      const {
        amount,
        giverId,
        giverName,
        cart, // <--- array of items
        primaryPartnerId, // needed for Stripe dashboard
        personalizedMessage,
      } = req.body || {};

      // --- Validate ---
      if (!amount || !giverId || !cart || !Array.isArray(cart)) {
        res.status(400).json({
          error: "Missing required parameters: amount, giverId, cart[]",
        });
        return;
      }

      const stripe = new Stripe(STRIPE_SECRET.value(), {
        apiVersion: "2024-06-20" as any,
      });

      console.log("🛒 Creating PaymentIntent for cart:", cart);

      // Convert cart to metadata-safe format
      // Stripe metadata must be strings, so stringify cart
      const cartJSON = JSON.stringify(cart);

      // Create PaymentIntent
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "eur",
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "always",
        },
        metadata: {
          type: "multiple_experience_gifts",
          giverId,
          giverName: giverName || "",
          primaryPartnerId: primaryPartnerId || "",
          cart: cartJSON, // <--- this is the important part
          personalizedMessage: personalizedMessage || "",
          source: "ernit_experience_gift",
        },
      });

      res.status(200).json({
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
      });
    } catch (err: any) {
      console.error("❌ Stripe error:", err);
      res.status(500).json({
        error: err.message || "Internal error",
      });
    }
  }
);
