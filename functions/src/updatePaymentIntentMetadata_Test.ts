import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import * as admin from "firebase-admin";

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY_SANDBOX");

const db = admin.firestore();

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
      const { paymentIntentId, personalizedMessage } = req.body || {};
      
      if (!paymentIntentId) {
        res.status(400).json({ error: "Missing paymentIntentId" });
        return;
      }

      const stripe = new Stripe(STRIPE_SECRET.value(), {
        apiVersion: "2024-06-20" as any,
      });

      await stripe.paymentIntents.update(paymentIntentId, {
        metadata: {
          personalizedMessage: personalizedMessage || "",
        },
      });

      res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("❌ Error updating metadata:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  }
);

