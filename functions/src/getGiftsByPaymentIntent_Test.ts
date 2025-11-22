import { onRequest } from "firebase-functions/v2/https";
import { db } from './index'; 

// const db = admin.firestore();

export const getGiftsByPaymentIntent_Test = onRequest(
    {
      region: "europe-west1",
    },
    async (req, res) => {
      console.log('entrou')

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
    
        const snap = await db
        .collection("experienceGifts")
        .where("paymentIntentId", "==", paymentIntentId)
        .get();
    
        const gifts = snap.docs.map(d => ({
          ...d.data(),
          id: d.id, // Ensure document ID is included
        }));
    
        res.status(200).json(gifts);
        } catch (err: any) {
            console.error("❌ Error fetching gift:", err);
            res.status(500).json({ error: err.message || "Internal error" });
        }
    }
);
  