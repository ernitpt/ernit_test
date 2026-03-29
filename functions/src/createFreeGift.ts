import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { sendEmail, GENERAL_EMAIL_USER, GENERAL_EMAIL_PASS } from "./services/emailService";
import { buildGiftEmailHtml } from "./utils/giftEmailTemplate";
import crypto from 'crypto';

// Production database (default) - initialized lazily
const getDbProd = () => getFirestore();

// ========== CREATE FREE GIFT (PRODUCTION) ==========
// Creates an ExperienceGift with payment: 'free' — no Stripe charge.
// The giver sends a challenge gift without paying. They (or anyone)
// can attach a paid experience later via the empower flow.
export const createFreeGift = onRequest(
    {
        region: "europe-west1",
        secrets: [GENERAL_EMAIL_USER, GENERAL_EMAIL_PASS],
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
            preferredRewardCategory,
            challengeType,
            revealMode,
            recipientEmail,
            giverName,
            personalizedMessage,
            // Together mode fields (optional)
            goalName,
            duration,
            frequency,
            sessionTime,
            goalType,
            sameExperienceForBoth,
            // Idempotency key (optional) — client supplies a UUID to prevent duplicate gifts on retry
            idempotencyKey,
        } = req.body;

        // Sanitize string inputs — strip HTML/script tags, limit length
        const sanitize = (s: unknown, maxLen = 500): string => {
            if (typeof s !== 'string') return '';
            return s.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim().slice(0, maxLen);
        };

        const hasExperience = experienceId && typeof experienceId === 'string' && experienceId.length <= 128;
        const hasCategory = preferredRewardCategory && typeof preferredRewardCategory === 'string' && preferredRewardCategory.length <= 64;

        if (!hasExperience && !hasCategory) {
            res.status(400).json({ error: 'Either experienceId or preferredRewardCategory is required.' });
            return;
        }

        if (!challengeType || !['solo', 'shared'].includes(challengeType)) {
            res.status(400).json({ error: 'challengeType must be "solo" or "shared"' });
            return;
        }

        const sanitizedRevealMode = revealMode && ['revealed', 'secret'].includes(revealMode) ? revealMode : 'secret';

        const safeGiverName = sanitize(giverName, 100);
        const safePersonalizedMessage = sanitize(personalizedMessage, 1000);
        const safeGoalName = sanitize(goalName, 200);

        const db = getDbProd();

        // ✅ IDEMPOTENCY: If the client provides a key, check for a prior completed
        // invocation before doing any Stripe or Firestore writes.  This prevents
        // duplicate gifts when a network drop causes the client to retry.
        if (idempotencyKey !== undefined) {
            if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0 || idempotencyKey.length > 128) {
                res.status(400).json({ error: 'idempotencyKey must be a non-empty string of at most 128 characters' });
                return;
            }

            const idemRef = db.collection('idempotencyKeys').doc(`createFreeGift_${idempotencyKey}`);

            // Use a transaction to atomically check-and-reserve the key so two
            // concurrent requests with the same key cannot both slip through.
            let alreadyCompleted = false;
            await db.runTransaction(async (txn) => {
                const snap = await txn.get(idemRef);
                if (snap.exists) {
                    alreadyCompleted = true;
                    return; // read-only — transaction commits cleanly
                }
                // Reserve the key immediately (mark as 'in_progress') so any
                // concurrent request that reads it sees the doc and waits/aborts.
                txn.set(idemRef, {
                    uid: userId,
                    functionName: 'createFreeGift',
                    status: 'in_progress',
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            });

            if (alreadyCompleted) {
                logger.info(`[createFreeGift] Idempotency key already used: ${idempotencyKey}`);
                res.status(200).json({ success: true, duplicate: true });
                return;
            }
        }

        // ✅ RATE LIMITING: Max 10 free gift creations per hour per user
        // Atomic transaction prevents TOCTOU race where concurrent requests both
        // pass the count check before either has written the updated counter.
        const RATE_LIMIT = 10;
        const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
        const rateLimitRef = db.collection('rateLimits').doc(`createFreeGift_${userId}`);

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
                logger.warn(`⚠️ createFreeGift rate limit exceeded for user ${userId}`);
                res.status(429).json({ error: 'Too many gift creation requests. Please try again later.' });
                return;
            }
            throw rateLimitError;
        }

        try {
            // Fetch the experience to snapshot its data (only when experienceId is provided)
            let experienceData: admin.firestore.DocumentData | null = null;
            if (hasExperience) {
                const experienceDoc = await db.collection('experiences').doc(experienceId).get();
                if (!experienceDoc.exists) {
                    res.status(404).json({ error: 'Experience not found' });
                    return;
                }
                experienceData = experienceDoc.data()!;
            }

            // Generate unique claim code
            const claimCode = await generateUniqueClaimCode(db);

            // Set expiration date (365 days)
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 365);

            const giftId = db.collection("experienceGifts").doc().id;

            // C11b: Explicit type annotation so TypeScript enforces that numeric
            // fields (price) cannot be silently assigned string values.
            let experiencePrice = 0;
            if (experienceData) {
                experiencePrice = Number(experienceData.price || 0);
                if (typeof experiencePrice !== 'number' || isNaN(experiencePrice)) {
                    res.status(400).json({ error: 'Invalid amount: experience price is not a valid number' });
                    return;
                }
            }

            const newGift: {
                id: string;
                giverId: string;
                giverName: string;
                experienceId: string | null;
                preferredRewardCategory: string | null;
                personalizedMessage: string;
                partnerId: string;
                deliveryDate: admin.firestore.Timestamp;
                status: string;
                payment: string;
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
                } | null;
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
                experienceId: hasExperience ? experienceId : null,
                preferredRewardCategory: hasCategory ? sanitize(preferredRewardCategory, 64) : null,
                personalizedMessage: safePersonalizedMessage,
                partnerId: experienceData?.partnerId || "",
                deliveryDate: admin.firestore.Timestamp.now(),
                status: "pending",
                payment: "free",
                claimCode,
                expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                // Gift flow metadata
                challengeType,
                revealMode: sanitizedRevealMode,
                isMystery: sanitizedRevealMode === 'secret',
                // Snapshot of the experience for display (null for category-only path)
                pledgedExperience: experienceData ? {
                    experienceId,
                    title: experienceData.title || "",
                    subtitle: experienceData.subtitle || "",
                    description: experienceData.description || "",
                    category: experienceData.category || "",
                    price: experiencePrice,
                    coverImageUrl: experienceData.coverImageUrl || "",
                    imageUrl: experienceData.imageUrl || [],
                    partnerId: experienceData.partnerId || "",
                    location: experienceData.location || "",
                } : null,
            };

            // Together mode: include giver's goal data so recipient can see it
            if (challengeType === 'shared') {
                newGift.togetherData = {
                    goalName: safeGoalName,
                    duration: duration || "",
                    frequency: frequency || "",
                    sessionTime: sessionTime || "",
                    goalType: goalType || "custom",
                    sameExperienceForBoth: sameExperienceForBoth !== false,
                };
            }

            // Atomic batch: write gift and (for shared challenges) giver goal together
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
                    type: 'custom',
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
                    experienceId: hasExperience ? experienceId : null,
                };

                const batch = db.batch();
                batch.set(giftDocRef, newGift);
                batch.set(giverGoalRef, { ...giverGoalData, experienceGiftId: giftDocRef.id });
                await batch.commit();

                logger.info(`✅ [PROD] Created giver goal ${giverGoalRef.id} for shared gift ${giftId}`);
            } else {
                await db.doc(`experienceGifts/${giftId}`).set(newGift);
            }

            logger.info(`✅ [PROD] Created free gift ${giftId} with claimCode ${claimCode}`);

            // Mark idempotency key as completed now that the gift is durably written.
            if (idempotencyKey !== undefined) {
                const idemRef = db.collection('idempotencyKeys').doc(`createFreeGift_${idempotencyKey}`);
                await idemRef.set({
                    uid: userId,
                    functionName: 'createFreeGift',
                    status: 'completed',
                    giftId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }

            // Optionally send email to recipient
            if (recipientEmail && typeof recipientEmail === 'string' && recipientEmail.includes('@')) {
                try {
                    const claimUrl = `https://ernit.app/recipient/redeem/${claimCode}`;
                    await sendEmail(
                        recipientEmail,
                        `${safeGiverName || 'Someone'} sent you an Ernit challenge!`,
                        buildGiftEmailHtml(safeGiverName || 'Someone', experienceData?.title ?? '', claimUrl, sanitizedRevealMode)
                    );
                    logger.info(`✅ Gift email sent to ${recipientEmail}`);
                } catch (emailErr: unknown) {
                    // Don't fail the whole request if email fails
                    logger.error(`⚠️ Failed to send gift email:`, emailErr);
                }
            }

            res.status(200).json({
                success: true,
                gift: newGift,
                claimCode,
                claimUrl: `https://ernit.app/recipient/redeem/${claimCode}`,
            });
        } catch (err: unknown) {
            logger.error("❌ Error creating free gift:", err);
            res.status(500).json({ error: "Failed to create gift" });
        }
    }
);


// ========== HELPER: GENERATE CLAIM CODE ==========
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
