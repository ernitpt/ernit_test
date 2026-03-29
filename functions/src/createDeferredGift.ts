import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { sendEmail, GENERAL_EMAIL_USER, GENERAL_EMAIL_PASS } from "./services/emailService";
import { buildGiftEmailHtml } from "./utils/giftEmailTemplate";
import crypto from 'crypto';
import { getOrCreateStripeCustomer } from './utils/stripeCustomer';

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY");

// Production database
const getDbProd = () => getFirestore();

// ========== CREATE DEFERRED GIFT (PRODUCTION) ==========
// Creates a Stripe SetupIntent to save the giver's payment method,
// then creates an ExperienceGift with payment: 'deferred'.
// The actual charge happens when the recipient completes their goal.
export const createDeferredGift = onRequest(
    {
        region: "europe-west1",
        secrets: [STRIPE_SECRET, GENERAL_EMAIL_USER, GENERAL_EMAIL_PASS],
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
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.set("Access-Control-Allow-Credentials", "true");
        res.set("Vary", "Origin");

        if (req.method === "OPTIONS") {
            res.status(204).send();
            return;
        }

        if (req.method !== "POST") {
            res.status(405).json({ error: "Method Not Allowed" });
            return;
        }

        // ✅ Verify Firebase Auth token
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized: Missing token' });
            return;
        }

        const token = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(token);
        } catch {
            res.status(401).json({ error: 'Unauthorized: Invalid token' });
            return;
        }

        const userId = decodedToken.uid;

        // ✅ Validate input
        const {
            experienceId,
            challengeType,
            revealMode,
            recipientEmail,
            giverName,
            personalizedMessage,
            goalName,
            duration,
            frequency,
            sessionTime,
            goalType,
            customGoalText,
            sameExperienceForBoth,
            // Idempotency key (optional) — client supplies a UUID to prevent duplicate gifts on retry
            idempotencyKey,
        } = req.body;

        // Sanitize string inputs — strip HTML/script tags, limit length
        const sanitize = (s: unknown, maxLen = 500): string => {
            if (typeof s !== 'string') return '';
            return s.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim().slice(0, maxLen);
        };

        if (!experienceId || typeof experienceId !== 'string' || experienceId.length > 128) {
            res.status(400).json({ error: 'Invalid experienceId' });
            return;
        }

        if (!challengeType || !['solo', 'shared'].includes(challengeType)) {
            res.status(400).json({ error: 'challengeType must be "solo" or "shared"' });
            return;
        }

        if (!revealMode || !['revealed', 'secret'].includes(revealMode)) {
            res.status(400).json({ error: 'revealMode must be "revealed" or "secret"' });
            return;
        }

        // Sanitize user-provided text fields
        const safeGiverName = sanitize(giverName, 100);
        const safePersonalizedMessage = sanitize(personalizedMessage, 1000);
        const safeGoalName = sanitize(goalName, 200);

        const db = getDbProd();

        // ✅ IDEMPOTENCY: If the client provides a key, check for a prior completed
        // invocation before creating a Stripe SetupIntent or writing to Firestore.
        if (idempotencyKey !== undefined) {
            if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0 || idempotencyKey.length > 128) {
                res.status(400).json({ error: 'idempotencyKey must be a non-empty string of at most 128 characters' });
                return;
            }

            const idemRef = db.collection('idempotencyKeys').doc(`createDeferredGift_${idempotencyKey}`);

            // Use a transaction to atomically check-and-reserve the key so two
            // concurrent requests with the same key cannot both slip through.
            let alreadyCompleted = false;
            await db.runTransaction(async (txn) => {
                const snap = await txn.get(idemRef);
                if (snap.exists) {
                    alreadyCompleted = true;
                    return; // read-only — transaction commits cleanly
                }
                txn.set(idemRef, {
                    uid: userId,
                    functionName: 'createDeferredGift',
                    status: 'in_progress',
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            });

            if (alreadyCompleted) {
                logger.info(`[createDeferredGift] Idempotency key already used: ${idempotencyKey}`);
                res.status(200).json({ success: true, duplicate: true });
                return;
            }
        }

        // ✅ RATE LIMITING: Max 10 deferred gift creations per hour per user
        // Atomic transaction prevents TOCTOU race where concurrent requests both
        // pass the count check before either has written the updated counter.
        const RATE_LIMIT = 10;
        const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
        const rateLimitRef = db.collection('rateLimits').doc(`createDeferredGift_${userId}`);

        try {
            await db.runTransaction(async (transaction) => {
                const snap = await transaction.get(rateLimitRef);
                const data = snap.data() || { count: 0, windowStart: Date.now() };
                const windowExpired = Date.now() - (data.windowStart || 0) > RATE_WINDOW_MS;
                const currentCount = windowExpired ? 0 : (data.count || 0);

                if (currentCount >= RATE_LIMIT) {
                    throw new Error('RATE_LIMIT_EXCEEDED');
                }

                transaction.set(rateLimitRef, {
                    count: windowExpired ? 1 : (currentCount + 1),
                    windowStart: windowExpired ? Date.now() : data.windowStart,
                    userId,
                    updatedAt: new Date().toISOString(),
                }, { merge: !windowExpired });
            });
        } catch (rateLimitError: unknown) {
            if ((rateLimitError as Error).message === 'RATE_LIMIT_EXCEEDED') {
                logger.warn(`⚠️ createDeferredGift rate limit exceeded for user ${userId}`);
                res.status(429).json({ error: 'Too many gift creation requests. Please try again later.' });
                return;
            }
            throw rateLimitError;
        }

        const stripe = new Stripe(STRIPE_SECRET.value(), {
            apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
        });

        try {
            // Fetch the experience
            const experienceDoc = await db.collection('experiences').doc(experienceId).get();
            if (!experienceDoc.exists) {
                res.status(404).json({ error: 'Experience not found' });
                return;
            }
            const experienceData = experienceDoc.data()!;

            // Generate unique claim code
            const claimCode = await generateUniqueClaimCode(db);

            const giftId = db.collection("experienceGifts").doc().id;

            // Get or create a Stripe Customer for the giver so the saved
            // payment method can be charged off-session when the goal completes.
            const stripeCustomerId = await getOrCreateStripeCustomer(
                stripe, db, userId, { name: safeGiverName }
            );

            // Create Stripe SetupIntent to save the payment method.
            // Track the ID immediately so we can cancel it if the subsequent
            // Firestore write fails (FIX 6 — orphaned SetupIntent cleanup).
            let setupIntentId: string | null = null;
            let setupIntentClientSecret: string | null = null;
            const setupIntent = await stripe.setupIntents.create({
                customer: stripeCustomerId,
                metadata: {
                    giftId,
                    giverId: userId,
                    experienceId,
                    amount: String(Math.round((experienceData.price || 0) * 100)), // cents
                    currency: 'eur',
                },
                usage: 'off_session',
            });
            setupIntentId = setupIntent.id;
            setupIntentClientSecret = setupIntent.client_secret;

            // Set expiration date (365 days)
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 365);

            // C11a: Explicit type annotation so TypeScript enforces that numeric
            // fields (deferredAmount, price) cannot be silently assigned string values.
            const deferredAmount = Number(experienceData.price || 0);
            if (typeof deferredAmount !== 'number' || isNaN(deferredAmount)) {
                // SetupIntent was already created — cancel it before returning.
                try {
                    await stripe.setupIntents.cancel(setupIntentId);
                    logger.warn(`Cancelled orphaned SetupIntent ${setupIntentId} (invalid amount)`);
                } catch (cancelErr: unknown) {
                    logger.error(`Failed to cancel SetupIntent ${setupIntentId}:`, cancelErr);
                }
                res.status(400).json({ error: 'Invalid amount: experience price is not a valid number' });
                return;
            }

            const newGift: {
                id: string;
                giverId: string;
                giverName: string;
                experienceId: string;
                personalizedMessage: string;
                partnerId: string;
                deliveryDate: admin.firestore.Timestamp;
                status: string;
                payment: string;
                setupIntentId: string;
                stripeCustomerId: string;
                deferredAmount: number;
                deferredCurrency: string;
                claimCode: string;
                expiresAt: admin.firestore.Timestamp;
                createdAt: admin.firestore.FieldValue;
                updatedAt: admin.firestore.FieldValue;
                challengeType: string;
                revealMode: string;
                isMystery: boolean;
                pledgedExperience: {
                    experienceId: string;
                    title: string;
                    subtitle: string;
                    description: string;
                    category: string;
                    price: number;
                    coverImageUrl: string;
                    imageUrl: string[];
                    partnerId: string;
                    location: string;
                };
                togetherData?: {
                    goalName: string;
                    duration: string;
                    frequency: string;
                    sessionTime: string;
                    goalType: string;
                    sameExperienceForBoth: boolean;
                    giverGoalId?: string;
                };
            } = {
                id: giftId,
                giverId: userId,
                giverName: safeGiverName,
                experienceId,
                personalizedMessage: safePersonalizedMessage,
                partnerId: experienceData.partnerId || "",
                deliveryDate: admin.firestore.Timestamp.now(),
                status: "pending",
                payment: "deferred",
                setupIntentId: setupIntent.id,
                stripeCustomerId,
                deferredAmount,
                deferredCurrency: 'eur',
                claimCode,
                expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                challengeType,
                revealMode,
                isMystery: revealMode === 'secret',
                pledgedExperience: {
                    experienceId,
                    title: experienceData.title || "",
                    subtitle: experienceData.subtitle || "",
                    description: experienceData.description || "",
                    category: experienceData.category || "",
                    price: Number(experienceData.price || 0),
                    coverImageUrl: experienceData.coverImageUrl || "",
                    imageUrl: experienceData.imageUrl || [],
                    partnerId: experienceData.partnerId || "",
                    location: experienceData.location || "",
                },
            };

            if (challengeType === 'shared') {
                newGift.togetherData = {
                    goalName: safeGoalName,
                    duration: duration || "",
                    frequency: frequency || "",
                    sessionTime: sessionTime || "",
                    goalType: sanitize(goalType, 50) || 'custom',
                    sameExperienceForBoth: sameExperienceForBoth !== false,
                };
            }

            // Atomic batch: write gift and (for shared challenges) giver goal together.
            // Wrapped in try/catch so we can cancel the SetupIntent if Firestore fails
            // (FIX 6 — prevents orphaned SetupIntents when the write errors out).
            try {
                if (challengeType === 'shared' && newGift.togetherData) {
                    const td = newGift.togetherData;
                    const durationMatch = td.duration?.match(/(\d+)/);
                    const weeks = Math.min(Math.max(durationMatch ? parseInt(durationMatch[1]) : 4, 1), 52);
                    const freqMatch = td.frequency?.match(/(\d+)/);
                    const sessionsPerWeek = Math.min(Math.max(freqMatch ? parseInt(freqMatch[1]) : 3, 1), 7);
                    const timeMatch = td.sessionTime?.match(/(\d+)h\s*(\d+)m/);
                    const sessionHours = Math.min(Math.max(timeMatch ? parseInt(timeMatch[1]) : 0, 0), 24);
                    const sessionMinutes = Math.min(Math.max(timeMatch ? parseInt(timeMatch[2]) : 30, 0), 59);

                    const now = new Date();
                    const endDate = new Date(now);
                    endDate.setDate(endDate.getDate() + weeks * 7);

                    // Pre-generate both document references
                    const giftDocRef = db.collection('experienceGifts').doc(giftId);
                    const giverGoalRef = db.collection('goals').doc();

                    // Embed giverGoalId into the gift before writing
                    newGift.togetherData.giverGoalId = giverGoalRef.id;

                    const giverGoalData = {
                        userId,
                        experienceGiftId: giftId,
                        name: td.goalName || `${weeks}-week challenge`,
                        title: td.goalName || `${weeks}-week challenge`,
                        description: td.goalName || `${weeks}-week challenge`,
                        type: sanitize(goalType, 50) || 'custom',
                        customGoalText: goalType === 'custom' ? sanitize(customGoalText, 200) : undefined,
                        isCustom: true,
                        challengeType: 'shared',
                        frequency: 'weekly',
                        weeks,
                        sessionsPerWeek,
                        sessionHours,
                        sessionMinutes,
                        targetHours: sessionHours,
                        targetMinutes: sessionMinutes,
                        duration: weeks,
                        targetCount: weeks,
                        currentCount: 0,
                        weeklyCount: 0,
                        weeklyLogDates: [],
                        isCompleted: false,
                        isWeekCompleted: false,
                        isActive: true,
                        isRevealed: false,
                        startDate: admin.firestore.Timestamp.fromDate(now),
                        endDate: admin.firestore.Timestamp.fromDate(endDate),
                        plannedStartDate: admin.firestore.Timestamp.fromDate(now),
                        approvalStatus: 'approved',
                        giverActionTaken: true,
                        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        experienceId,
                    };

                    const batch = db.batch();
                    batch.set(giftDocRef, newGift);
                    batch.set(giverGoalRef, { ...giverGoalData, experienceGiftId: giftDocRef.id });
                    await batch.commit();

                    logger.info(`✅ [PROD] Created giver goal ${giverGoalRef.id} for shared gift ${giftId}`);
                } else {
                    await db.doc(`experienceGifts/${giftId}`).set(newGift);
                }
            } catch (firestoreErr: unknown) {
                // Firestore write failed — cancel the SetupIntent to avoid leaving an
                // orphaned saved payment method the giver never intentionally confirmed.
                if (setupIntentId) {
                    try {
                        await stripe.setupIntents.cancel(setupIntentId);
                        logger.warn(`Cancelled orphaned SetupIntent ${setupIntentId} after Firestore write failure`);
                    } catch (cancelErr: unknown) {
                        logger.error(`Failed to cancel SetupIntent ${setupIntentId}:`, cancelErr);
                    }
                }
                throw firestoreErr;
            }

            logger.info(`✅ [PROD] Created deferred gift ${giftId}, setupIntent ${setupIntentId}`);

            // Mark idempotency key as completed now that the gift is durably written.
            if (idempotencyKey !== undefined) {
                const idemRef = db.collection('idempotencyKeys').doc(`createDeferredGift_${idempotencyKey}`);
                await idemRef.set({
                    uid: userId,
                    functionName: 'createDeferredGift',
                    status: 'completed',
                    giftId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }

            // Optionally send email
            if (recipientEmail && typeof recipientEmail === 'string' && recipientEmail.includes('@')) {
                try {
                    const claimUrl = `https://ernit.app/recipient/redeem/${claimCode}`;
                    await sendEmail(
                        recipientEmail,
                        `${safeGiverName || 'Someone'} sent you an Ernit challenge!`,
                        buildGiftEmailHtml(safeGiverName || 'Someone', experienceData.title, claimUrl, revealMode)
                    );
                } catch (emailErr: unknown) {
                    logger.error(`⚠️ Failed to send gift email:`, emailErr);
                }
            }

            res.status(200).json({
                success: true,
                gift: newGift,
                claimCode,
                claimUrl: `https://ernit.app/recipient/redeem/${claimCode}`,
                setupIntentClientSecret,
            });
        } catch (err: unknown) {
            logger.error("❌ Error creating deferred gift:", err);
            res.status(500).json({ error: "Failed to create deferred gift" });
        }
    }
);


function generateClaimCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    while (code.length < 12) {
        const bytes = crypto.randomBytes(1);
        if (bytes[0] >= 252) continue;
        code += chars[bytes[0] % chars.length];
    }
    return code;
}

async function generateUniqueClaimCode(db: Firestore): Promise<string> {
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const code = generateClaimCode();
        const existing = await db
            .collection('experienceGifts')
            .where('claimCode', '==', code)
            .limit(1)
            .get();
        if (existing.empty) return code;
        logger.warn(`⚠️ Claim code collision (attempt ${attempt + 1})`);
    }
    throw new Error('Failed to generate unique claim code after 10 attempts');
}
