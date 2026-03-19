import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import { getFirestore } from "firebase-admin/firestore";

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY");

// Production database (default) - initialized lazily to avoid issues before Firebase app init
const getDbProd = () => getFirestore();

// ========== CREATE PAYMENT INTENT WITH CART (PRODUCTION) ==========
export const stripeCreatePaymentIntent = onRequest(
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
            "https://ernit.app",
            "https://www.ernit.app",
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

        const db = getDbProd();

        // ✅ RATE LIMITING: Max 20 payment intent creations per hour per user
        const RATE_LIMIT = 20;
        const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
        const rateLimitRef = db.collection('rateLimits').doc(`createPaymentIntent_${userId}`);
        const rateLimitSnap = await rateLimitRef.get();
        const now = Date.now();

        if (rateLimitSnap.exists) {
            const requests = (rateLimitSnap.data()?.requests || []).filter((t: number) => now - t < RATE_WINDOW_MS);
            if (requests.length >= RATE_LIMIT) {
                console.warn(`⚠️ stripeCreatePaymentIntent rate limit exceeded for user ${userId}`);
                res.status(429).json({ error: 'Too many payment requests. Please try again later.' });
                return;
            }
            await rateLimitRef.set({ requests: [...requests, now], lastRequest: now });
        } else {
            await rateLimitRef.set({ requests: [now], lastRequest: now });
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

            // ✅ Validate cart structure and quantities
            if (cart.length === 0 || cart.length > 50) {
                res.status(400).json({ error: "Invalid cart size" });
                return;
            }

            let totalQuantity = 0;
            for (const item of cart) {
                if (!item.experienceId || typeof item.experienceId !== 'string') {
                    res.status(400).json({ error: "Invalid cart item: missing experienceId" });
                    return;
                }
                if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) {
                    res.status(400).json({ error: "Invalid cart item: quantity must be 1-10" });
                    return;
                }
                totalQuantity += item.quantity;
            }
            if (totalQuantity > 50) {
                res.status(400).json({ error: "Total quantity exceeds maximum" });
                return;
            }

            // ✅ Server-side price validation — never trust client-sent amount
            let serverTotal = 0;

            for (const item of cart) {
                const expDoc = await db.collection('experiences').doc(item.experienceId).get();
                if (!expDoc.exists) {
                    console.error(`❌ Experience not found: ${item.experienceId}`);
                    res.status(400).json({ error: "Experience not found in cart" });
                    return;
                }
                const expData = expDoc.data();
                if (!expData || typeof expData.price !== 'number' || expData.price <= 0) {
                    console.error(`❌ Invalid price for experience: ${item.experienceId}`);
                    res.status(400).json({ error: "Invalid experience price" });
                    return;
                }
                serverTotal += Math.round(expData.price * 100) * item.quantity;
            }

            // T2-3: Compare in cents to avoid floating-point errors
            const clientCents = Math.round(amount * 100);
            if (Math.abs(serverTotal - clientCents) > 1) {
                console.error(`❌ Price mismatch: client=${amount}, server=${serverTotal}`);
                res.status(400).json({ error: "Price mismatch — cart total does not match" });
                return;
            }

            const stripe = new Stripe(STRIPE_SECRET.value(), {
                apiVersion: "2024-06-20" as any,
            });

            console.log("🛒 [PROD] Creating PaymentIntent for cart:", cart);

            // Convert cart to metadata-safe format
            const cartJSON = JSON.stringify(cart);

            // Create PaymentIntent — use server-validated amount
            const intent = await stripe.paymentIntents.create({
                amount: serverTotal, // Already in cents from T2-3 fix
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
