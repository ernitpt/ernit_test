import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore, DocumentData } from "firebase-admin/firestore";

// Production database (default) - initialized lazily
const getDbProd = () => getFirestore();

export const getGiftsByPaymentIntent = onRequest(
    {
        region: "europe-west1",
    },
    async (req, res) => {
        const origin = req.headers.origin || "";

        // ✅ Production allowed origins only
        const allowedOrigins: string[] = [
            "https://ernit.app",
            "https://www.ernit.app",
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
            } catch (error) {
                console.error("❌ Invalid token:", error);
                res.status(401).json({ error: "Unauthorized: Invalid token" });
                return;
            }

            const userId = decodedToken.uid;
            console.log(`✅ [PROD] Authenticated user: ${userId}`);

            // ✅ Validate payment intent ID
            const paymentIntentId = req.query.paymentIntentId as string;

            if (!paymentIntentId) {
                res.status(400).json({ error: "Missing paymentIntentId parameter" });
                return;
            }

            // ✅ Fetch gifts from production Firestore
            const db = getDbProd();
            const snap = await db
                .collection("experienceGifts")
                .where("paymentIntentId", "==", paymentIntentId)
                .get();

            // ✅ Only return gifts belonging to the authenticated user
            const gifts = snap.docs
                .map((d: admin.firestore.QueryDocumentSnapshot<DocumentData>) => ({
                    ...(d.data() as any),
                    id: d.id,
                }))
                .filter((gift: any) => gift.giverId === userId);

            if (gifts.length === 0) {
                console.log(`No gifts found for user ${userId} with payment intent ${paymentIntentId}`);
                res.status(404).json({ error: "No gifts found or access denied" });
                return;
            }

            console.log(`✅ [PROD] Returning ${gifts.length} gifts for user ${userId}`);
            res.status(200).json(gifts);
        } catch (err: any) {
            console.error("❌ Error fetching gifts:", err);
            res.status(500).json({ error: "Internal error" });
        }
    }
);
