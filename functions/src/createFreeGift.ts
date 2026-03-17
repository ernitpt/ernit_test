import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { sendEmail, GENERAL_EMAIL_USER, GENERAL_EMAIL_PASS } from "./services/emailService";
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
            sameExperienceForBoth,
        } = req.body;

        if (!experienceId || typeof experienceId !== 'string') {
            res.status(400).json({ error: 'experienceId is required' });
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

        const db = getDbProd();

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
                giverName: giverName || "",
                experienceId,
                personalizedMessage: personalizedMessage || "",
                partnerId: experienceData.partnerId || "",
                deliveryDate: admin.firestore.Timestamp.now(),
                status: "pending",
                payment: "free",
                claimCode,
                expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                createdAt: admin.firestore.Timestamp.now(),
                updatedAt: admin.firestore.Timestamp.now(),
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
                    goalName: goalName || "",
                    duration: duration || "",
                    frequency: frequency || "",
                    sessionTime: sessionTime || "",
                    sameExperienceForBoth: sameExperienceForBoth !== false,
                };
            }

            await db.doc(`experienceGifts/${giftId}`).set(newGift);

            console.log(`✅ [PROD] Created free gift ${giftId} with claimCode ${claimCode}`);

            // Optionally send email to recipient
            if (recipientEmail && typeof recipientEmail === 'string' && recipientEmail.includes('@')) {
                try {
                    const claimUrl = `https://ernit.app/recipient/redeem/${claimCode}`;
                    await sendEmail(
                        recipientEmail,
                        `${giverName || 'Someone'} sent you an Ernit challenge!`,
                        buildGiftEmailHtml(giverName || 'Someone', experienceData.title, claimUrl, revealMode)
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


// ========== HELPER: BUILD GIFT EMAIL HTML ==========
function buildGiftEmailHtml(
    giverName: string,
    experienceTitle: string,
    claimUrl: string,
    revealMode: string,
): string {
    const rewardText = revealMode === 'secret'
        ? 'a mystery reward (hints will be revealed as you progress!)'
        : `<strong>${experienceTitle}</strong>`;

    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
            <span style="font-size: 36px; font-weight: 900; font-style: italic; color: #111827;">ernit<span style="color: #10B981;">.</span></span>
        </div>
        <div style="background: linear-gradient(135deg, #FFF7ED, #FFFBEB); border-radius: 16px; padding: 32px; text-align: center;">
            <p style="font-size: 24px; margin: 0 0 8px;">🎁</p>
            <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 12px;">
                ${giverName} sent you a challenge!
            </h1>
            <p style="font-size: 15px; color: #6B7280; line-height: 1.6; margin: 0 0 24px;">
                Set a goal, work towards it, and earn ${rewardText} when you succeed.
            </p>
            <a href="${claimUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #F59E0B, #D97706); color: #fff; font-size: 16px; font-weight: 700; border-radius: 12px; text-decoration: none;">
                Accept Challenge
            </a>
        </div>
        <p style="font-size: 12px; color: #9CA3AF; text-align: center; margin-top: 24px;">
            © ${new Date().getFullYear()} Ernit. All rights reserved.
        </p>
    </div>
    `;
}


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
