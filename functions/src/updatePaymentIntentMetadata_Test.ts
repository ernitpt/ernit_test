import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import * as admin from "firebase-admin";

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY_SANDBOX");

export const updatePaymentIntentMetadata_Test = onRequest(
    {
        region: "europe-west1",
        secrets: [STRIPE_SECRET],
    },
    async (req, res) => {
        const origin = req.headers.origin || "";

        // ✅ Test allowed origins only
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
            req.headers["access-control-request-headers"] || "Content-Type, Authorization"
        );
        res.set("Access-Control-Allow-Credentials", "true");
        res.set("Vary", "Origin");

        if (req.method === "OPTIONS") {
            res.status(204).send();
            return;
        }

        try {
            // ✅ Verify authentication token
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                res.status(401).json({ error: "Unauthorized: Missing token" });
                return;
            }

            const idToken = authHeader.split("Bearer ")[1];

            let decodedToken;
            try {
                decodedToken = await admin.auth().verifyIdToken(idToken);
            } catch (error: unknown) {
                logger.error("❌ Invalid token:", error);
                res.status(401).json({ error: "Unauthorized: Invalid token" });
                return;
            }

            const userId = decodedToken.uid;
            logger.info(`✅ [TEST] Authenticated user: ${userId}`);

            // ✅ Extract and validate request data
            const { paymentIntentId, personalizedMessage } = req.body || {};

            if (!paymentIntentId) {
                res.status(400).json({ error: "Missing paymentIntentId" });
                return;
            }

            if (typeof paymentIntentId !== 'string' || paymentIntentId.length > 100) {
                res.status(400).json({ error: 'Invalid paymentIntentId' });
                return;
            }
            if (personalizedMessage !== undefined && personalizedMessage !== null &&
                (typeof personalizedMessage !== 'string' || personalizedMessage.length > 1000)) {
                res.status(400).json({ error: 'personalizedMessage must be under 1000 characters' });
                return;
            }

            // Initialize Stripe with sandbox key
            const stripe = new Stripe(STRIPE_SECRET.value(), {
                apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
            });

            // ✅ SECURITY: Verify ownership before updating
            const existingIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            if (existingIntent.metadata?.giverId !== userId) {
                logger.error(`❌ Ownership mismatch: user ${userId} tried to update PI owned by ${existingIntent.metadata?.giverId}`);
                res.status(403).json({ error: "Forbidden: You do not own this payment intent" });
                return;
            }

            // ✅ Update payment intent metadata
            // Use giverId (not userId) to match the key expected by the webhook handler
            await stripe.paymentIntents.update(paymentIntentId, {
                metadata: {
                    personalizedMessage: personalizedMessage || "",
                    giverId: userId,
                },
            });

            logger.info(`✅ [TEST] Payment intent ${paymentIntentId} updated by user ${userId}`);
            res.status(200).json({ success: true });
        } catch (err: unknown) {
            logger.error("❌ Error updating metadata:", err);
            res.status(500).json({ error: "Failed to update payment metadata" });
        }
    }
);
