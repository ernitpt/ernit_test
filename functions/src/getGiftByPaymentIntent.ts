// ========== GET GIFT BY PAYMENT INTENT ==========
// Optional: Endpoint to check if gift was created for a payment

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const db = admin.firestore();


export const getGiftByPaymentIntent = onRequest(
  {
    region: "europe-west1",
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

    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] || "Content-Type, Authorization"
    );
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Vary", "Origin");

    if (req.method === "OPTIONS") {     
      console.log('test 1')
      res.status(204).send();
      return;
    }
    console.log('entrou aqui')
    try {
      const paymentIntentId = req.query.paymentIntentId as string;
      console.log('paymentIntentId', paymentIntentId )
      
      if (!paymentIntentId) {
        console.log('test 2')
        res.status(400).json({ error: "Missing paymentIntentId" });
        return;
      }

      const gifts = await db
        .collection("experienceGifts")
        .where("paymentIntentId", "==", paymentIntentId)
        .limit(1)
        .get();

      if (gifts.empty) {
        res.status(404).json({ error: "Gift not found" });
        return;
      }

      const gift = gifts.docs[0].data();
      
      // Convert Firestore timestamps to ISO strings
      const giftData = {
        ...gift,
        createdAt: gift.createdAt?.toDate?.()?.toISOString() || gift.createdAt,
        updatedAt: gift.updatedAt?.toDate?.()?.toISOString() || gift.updatedAt,
        deliveryDate: gift.deliveryDate?.toDate?.()?.toISOString() || gift.deliveryDate,
      };

      res.status(200).json(giftData);
    } catch (err: any) {
      console.error("❌ Error fetching gift:", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  }
);