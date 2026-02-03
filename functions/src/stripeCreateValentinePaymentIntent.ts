import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY");

// ========== CREATE VALENTINE PAYMENT INTENT (NO AUTH REQUIRED) - PRODUCTION ==========
export const stripeCreateValentinePaymentIntent = onRequest(
    {
        region: "europe-west1",
        secrets: [STRIPE_SECRET],
        maxInstances: 10,
        memory: "256MiB",
        timeoutSeconds: 30,
    },
    async (req, res) => {
        const origin = req.headers.origin || "";

        const allowedOrigins: string[] = [
            "https://ernit.pt",
            "https://www.ernit.pt",
        ];

        const allowOrigin = allowedOrigins.includes(origin);
        if (allowOrigin) res.set("Access-Control-Allow-Origin", origin);

        res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        res.set("Access-Control-Allow-Credentials", "true");
        res.set("Vary", "Origin");

        if (req.method === "OPTIONS") {
            res.status(204).send();
            return;
        }

        // ✅ Validate request size
        const contentLength = parseInt(req.headers["content-length"] || "0");
        if (contentLength > 10000) {
            res.status(413).json({ error: "Payload too large" });
            return;
        }

        try {
            const { amount, currency, metadata } = req.body || {};

            // Validate required fields
            if (!amount || !currency || !metadata) {
                res.status(400).json({
                    error: "Missing required parameters",
                });
                return;
            }

            // Validate Valentine metadata
            if (metadata.type !== "valentine_challenge") {
                res.status(400).json({ error: "Invalid metadata type" });
                return;
            }

            if (
                !metadata.purchaserEmail ||
                !metadata.partnerEmail ||
                !metadata.experienceId
            ) {
                res.status(400).json({
                    error: "Missing required Valentine metadata",
                });
                return;
            }

            const stripe = new Stripe(STRIPE_SECRET.value(), {
                apiVersion: "2024-06-20" as any,
            });

            console.log("💘 [PROD] Creating Valentine PaymentIntent");

            // Create PaymentIntent
            const intent = await stripe.paymentIntents.create({
                amount: Math.round(amount * 100),
                currency,
                automatic_payment_methods: {
                    enabled: true,
                    allow_redirects: "always",
                },
                metadata,
            });

            res.status(200).json({
                clientSecret: intent.client_secret,
                paymentIntentId: intent.id,
            });
        } catch (err: any) {
            console.error("❌ [PROD] Stripe error:", err);
            res.status(500).json({
                error: "Payment processing failed",
            });
        }
    }
);
