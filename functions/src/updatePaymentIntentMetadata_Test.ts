import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import * as admin from "firebase-admin";

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY_SANDBOX");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

export const updatePaymentIntentMetadata_Test = onRequest(
  {
    region: "europe-west1",
    secrets: [STRIPE_SECRET],
  },
  async (req, res) => {
    const origin = req.headers.origin || "";

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
      req.headers["access-control-request-headers"] || "Content-Type, Authorization"
    );
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.status(204).send();
      return;
    }

    try {
      // ✅ SECURITY FIX: Verify authentication token
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized: Missing token" });
        return;
      }

      const idToken = authHeader.split("Bearer ")[1];

      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (error) {
        console.error("❌ Invalid token:", error);
        res.status(401).json({ error: "Unauthorized: Invalid token" });
        return;
      }

      const userId = decodedToken.uid;
      console.log(`✅ Authenticated user: ${userId}`);

      // ✅ Extract and validate request data
      const { paymentIntentId, personalizedMessage } = req.body || {};

      if (!paymentIntentId) {
        res.status(400).json({ error: "Missing paymentIntentId" });
        return;
      }

      // Initialize Stripe
      const stripe = new Stripe(STRIPE_SECRET.value(), {
        apiVersion: "2024-06-20" as any,
      });

      // ✅ Update payment intent metadata
      await stripe.paymentIntents.update(paymentIntentId, {
        metadata: {
          personalizedMessage: personalizedMessage || "",
          userId: userId, // ✅ Track which user made the update
        },
      });

      console.log(`✅ Payment intent ${paymentIntentId} updated by user ${userId}`);
      res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("❌ Error updating metadata:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  }
);
