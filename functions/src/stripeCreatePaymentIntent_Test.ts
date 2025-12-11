import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY_SANDBOX");

// ========== CREATE PAYMENT INTENT WITH CART ==========
export const stripeCreatePaymentIntent_Test = onRequest(
  {
    region: "europe-west1",
    secrets: [STRIPE_SECRET],
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (req, res) => {
    const origin = req.headers.origin || "";
    console.log("stripeCreatePaymentIntentTest origin:", origin);

    const allowedOrigins: string[] = [
      "http://localhost:8081",
      "http://localhost:3000",
      "https://ernit-nine.vercel.app",
      "https://ernit981723498127658912765187923546.vercel.app",
    ];

    const allowOrigin = allowedOrigins.includes(origin);
    if (allowOrigin) res.set("Access-Control-Allow-Origin", origin);

    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.status(204).send();
      return;
    }

    // ✅ Verify Firebase Auth token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: Missing token' });
      return;
    }

    let userId: string;
    try {
      const { getAuth } = await import('firebase-admin/auth');
      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      userId = decodedToken.uid;
    } catch (error) {
      console.error('❌ Token verification failed:', error);
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }

    // ✅ Validate request size
    const contentLength = parseInt(req.headers['content-length'] || '0');
    if (contentLength > 10000) {
      res.status(413).json({ error: 'Payload too large' });
      return;
    }

    try {
      const {
        amount,
        giverId,
        giverName,
        cart,
        primaryPartnerId,
        personalizedMessage,
      } = req.body || {};

      // ✅ Verify giverId matches authenticated user
      if (giverId !== userId) {
        res.status(403).json({ error: 'Forbidden: User ID mismatch' });
        return;
      }

      // --- Validate ---
      if (!amount || !giverId || !cart || !Array.isArray(cart)) {
        res.status(400).json({
          error: "Missing required parameters",
        });
        return;
      }

      const stripe = new Stripe(STRIPE_SECRET.value(), {
        apiVersion: "2024-06-20" as any,
      });

      console.log("🛒 Creating PaymentIntent for cart:", cart);

      // Convert cart to metadata-safe format
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
          cart: cartJSON,
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
      // ✅ Generic error message to client
      res.status(500).json({
        error: "Payment processing failed",
      });
    }
  }
);
