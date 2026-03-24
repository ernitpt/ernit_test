import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
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

        const safeGiverName = sanitize(giverName, 100);
        const safePersonalizedMessage = sanitize(personalizedMessage, 1000);
        const safeGoalName = sanitize(goalName, 200);

        const db = getDbProd();

        // ✅ RATE LIMITING: Max 10 free gift creations per hour per user
        const RATE_LIMIT = 10;
        const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
        const rateLimitRef = db.collection('rateLimits').doc(`createFreeGift_${userId}`);
        const rateLimitSnap = await rateLimitRef.get();
        const now = Date.now();

        if (rateLimitSnap.exists) {
            const requests = (rateLimitSnap.data()?.requests || []).filter((t: number) => now - t < RATE_WINDOW_MS);
            if (requests.length >= RATE_LIMIT) {
                console.warn(`⚠️ createFreeGift rate limit exceeded for user ${userId}`);
                res.status(429).json({ error: 'Too many gift creation requests. Please try again later.' });
                return;
            }
            await rateLimitRef.set({ requests: [...requests, now], lastRequest: now });
        } else {
            await rateLimitRef.set({ requests: [now], lastRequest: now });
        }

        try {
            // Fetch the experience to snapshot its data
            const experienceDoc = await db.collection('experiences').doc(experienceId).get();
            if (!experienceDoc.exists) {
                res.status(404).json({ error: 'Experience not found' });
                return;
            }
            const experienceData = experienceDoc.data()!;

            // Generate unique claim code
            const claimCode = await generateUniqueClaimCode(db);

            // Set expiration date (365 days)
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 365);

            const giftId = db.collection("experienceGifts").doc().id;

            const newGift: Record<string, any> = {
                id: giftId,
                giverId: userId,
                giverName: safeGiverName,
                experienceId,
                personalizedMessage: safePersonalizedMessage,
                partnerId: experienceData.partnerId || "",
                deliveryDate: admin.firestore.Timestamp.now(),
                status: "pending",
                payment: "free",
                claimCode,
                expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                // Gift flow metadata
                challengeType,
                revealMode,
                isMystery: revealMode === 'secret',
                // Snapshot of the experience for display
                pledgedExperience: {
                    experienceId,
                    title: experienceData.title || "",
                    subtitle: experienceData.subtitle || "",
                    description: experienceData.description || "",
                    category: experienceData.category || "",
                    price: experienceData.price || 0,
                    coverImageUrl: experienceData.coverImageUrl || "",
                    imageUrl: experienceData.imageUrl || [],
                    partnerId: experienceData.partnerId || "",
                    location: experienceData.location || "",
                },
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
                    experienceId,
                };

                const batch = db.batch();
                batch.set(giftDocRef, newGift);
                batch.set(giverGoalRef, { ...giverGoalData, experienceGiftId: giftDocRef.id });
                await batch.commit();

                console.log(`✅ [PROD] Created giver goal ${giverGoalRef.id} for shared gift ${giftId}`);
            } else {
                await db.doc(`experienceGifts/${giftId}`).set(newGift);
            }

            console.log(`✅ [PROD] Created free gift ${giftId} with claimCode ${claimCode}`);

            // Optionally send email to recipient
            if (recipientEmail && typeof recipientEmail === 'string' && recipientEmail.includes('@')) {
                try {
                    const claimUrl = `https://ernit.app/recipient/redeem/${claimCode}`;
                    await sendEmail(
                        recipientEmail,
                        `${safeGiverName || 'Someone'} sent you an Ernit challenge!`,
                        buildGiftEmailHtml(safeGiverName || 'Someone', experienceData.title, claimUrl, revealMode)
                    );
                    console.log(`✅ Gift email sent to ${recipientEmail}`);
                } catch (emailErr) {
                    // Don't fail the whole request if email fails
                    console.error(`⚠️ Failed to send gift email:`, emailErr);
                }
            }

            res.status(200).json({
                success: true,
                gift: newGift,
                claimCode,
                claimUrl: `https://ernit.app/recipient/redeem/${claimCode}`,
            });
        } catch (err: any) {
            console.error("❌ Error creating free gift:", err);
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

async function generateUniqueClaimCode(db: FirebaseFirestore.Firestore): Promise<string> {
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const code = generateClaimCode();
        const existing = await db
            .collection('experienceGifts')
            .where('claimCode', '==', code)
            .limit(1)
            .get();
        if (existing.empty) return code;
        console.warn(`⚠️ Claim code collision (attempt ${attempt + 1})`);
    }
    throw new Error('Failed to generate unique claim code after 10 attempts');
}
