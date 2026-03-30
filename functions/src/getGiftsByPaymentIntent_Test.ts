import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { DocumentData, getFirestore } from "firebase-admin/firestore";

export const getGiftsByPaymentIntent_Test = onRequest(
    {
        region: "europe-west1",
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

        res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
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

            // ✅ Validate payment intent ID
            const paymentIntentId = req.query.paymentIntentId as string;

            if (!paymentIntentId) {
                res.status(400).json({ error: "Missing paymentIntentId parameter" });
                return;
            }

            if (typeof paymentIntentId !== 'string' || paymentIntentId.length > 100) {
                res.status(400).json({ error: 'Invalid paymentIntentId format' });
                return;
            }

            // ✅ Fetch gifts from test Firestore
            const db = getFirestore('ernitclone2');
            const snap = await db
                .collection("experienceGifts")
                .where("paymentIntentId", "==", paymentIntentId)
                .get();

            // ✅ Only return gifts belonging to the authenticated user
            const gifts = snap.docs
                .map((d: admin.firestore.QueryDocumentSnapshot<DocumentData>) => ({
                    ...d.data(),
                    id: d.id,
                }))
                .filter((gift) => (gift as { giverId?: string }).giverId === userId);

            if (gifts.length === 0) {
                logger.info(`No gifts found for user ${userId} with payment intent ${paymentIntentId}`);
                res.status(404).json({ error: "No gifts found or access denied" });
                return;
            }

            logger.info(`✅ [TEST] Returning ${gifts.length} gifts for user ${userId}`);
            res.status(200).json(gifts);
        } catch (err: unknown) {
            logger.error("❌ Error fetching gifts:", err);
            res.status(500).json({ error: "Internal error" });
        }
    }
);
