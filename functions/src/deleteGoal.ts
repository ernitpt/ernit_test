// ========== DELETE GOAL (PRODUCTION) ==========
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { FieldValue, DocumentData } from "firebase-admin/firestore";
import { allowedOrigins } from "./cors";

export const deleteGoal = onRequest(
    {
        region: "europe-west1",
        maxInstances: 10,
        memory: "256MiB",
        timeoutSeconds: 60,
    },
    async (req, res) => {
        // CORS handling
        const origin = req.headers.origin || "";
        if (allowedOrigins.includes(origin)) {
            res.set("Access-Control-Allow-Origin", origin);
        }
        res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.set("Access-Control-Allow-Credentials", "true");
        res.set("Vary", "Origin");

        if (req.method === "OPTIONS") {
            res.status(204).send();
            return;
        }

        logger.info("[deleteGoal] Function called");

        // SECURITY: Verify Firebase Auth token
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized: Missing token' });
            return;
        }

        let uid: string;
        try {
            const { getAuth } = await import('firebase-admin/auth');
            const token = authHeader.split('Bearer ')[1];
            const decodedToken = await getAuth().verifyIdToken(token);
            uid = decodedToken.uid;
        } catch (error) {
            logger.error('[deleteGoal] Token verification failed:', error);
            res.status(401).json({ error: 'Unauthorized: Invalid token' });
            return;
        }

        logger.info(`[deleteGoal] Authenticated user: ${uid}`);

        // VALIDATION: goalId must be a non-empty string
        const { goalId } = req.body?.data || req.body || {};
        if (!goalId || typeof goalId !== 'string') {
            res.status(400).json({ error: 'Missing or invalid goalId' });
            return;
        }

        const db = admin.firestore();

        try {
            // Step 3: Read goal document
            const goalRef = db.collection('goals').doc(goalId);
            const goalSnap = await goalRef.get();

            if (!goalSnap.exists) {
                logger.info(`[deleteGoal] Goal ${goalId} not found — returning success (idempotent)`);
                res.status(200).json({ success: true });
                return;
            }

            const goalData = goalSnap.data()!;

            // Step 4: Verify ownership
            if (goalData.userId !== uid) {
                logger.warn(`[deleteGoal] Permission denied: user ${uid} does not own goal ${goalId}`);
                res.status(403).json({ error: 'You do not have permission to delete this goal' });
                return;
            }

            // Step 5: Block if completed
            if (goalData.isCompleted === true) {
                res.status(400).json({ error: 'Completed goals cannot be removed' });
                return;
            }

            let giftData: DocumentData | null = null;

            // Step 6: Handle experienceGiftId
            if (goalData.experienceGiftId) {
                logger.info(`[deleteGoal] Goal has experienceGiftId: ${goalData.experienceGiftId}`);
                const giftRef = db.collection('experienceGifts').doc(goalData.experienceGiftId);
                const giftSnap = await giftRef.get();

                if (giftSnap.exists) {
                    giftData = giftSnap.data()!;

                    if (giftData.payment === 'processing') {
                        res.status(409).json({ error: 'A payment is being processed for this goal. Please try again shortly.' });
                        return;
                    }

                    if (giftData.payment === 'deferred') {
                        logger.info(`[deleteGoal] Cancelling deferred gift ${goalData.experienceGiftId}`);
                        await giftRef.update({
                            status: 'cancelled',
                            payment: 'cancelled',
                            cancelledAt: FieldValue.serverTimestamp(),
                            cancelReason: 'goal_removed',
                        });

                        if (giftData.giverId) {
                            let userName = 'Someone';
                            try {
                                const userSnap = await db.collection('users').doc(goalData.userId).get();
                                if (userSnap.exists) {
                                    userName = userSnap.data()?.displayName || 'Someone';
                                }
                            } catch (userErr) {
                                logger.warn(`[deleteGoal] Could not fetch user displayName:`, userErr);
                            }

                            await db.collection('notifications').add({
                                userId: giftData.giverId,
                                type: 'payment_cancelled',
                                title: 'Goal Removed',
                                message: `${userName} removed their goal "${goalData.title}". No charge will be made.`,
                                data: { goalId, giftId: goalData.experienceGiftId },
                                read: false,
                                createdAt: FieldValue.serverTimestamp(),
                            });
                            logger.info(`[deleteGoal] Sent payment_cancelled notification to giver ${giftData.giverId}`);
                        }
                    }

                    if (goalData.isFreeGoal && giftData.redeemedGoalId === goalId) {
                        logger.info(`[deleteGoal] Restoring free gift ${goalData.experienceGiftId} to active`);
                        await giftRef.update({
                            isRedeemed: false,
                            redeemedGoalId: null,
                            status: 'active',
                            updatedAt: FieldValue.serverTimestamp(),
                        });
                    }
                }
            }

            // Step 7: Handle shared goal (partnerGoalId)
            if (goalData.partnerGoalId) {
                logger.info(`[deleteGoal] Goal has partnerGoalId: ${goalData.partnerGoalId}`);
                const partnerGoalRef = db.collection('goals').doc(goalData.partnerGoalId);
                const partnerGoalSnap = await partnerGoalRef.get();

                if (partnerGoalSnap.exists) {
                    const partnerGoalData = partnerGoalSnap.data()!;

                    const partnerUpdate: Record<string, any> = {
                        partnerGoalId: FieldValue.delete(),
                        updatedAt: FieldValue.serverTimestamp(),
                    };

                    const isFreePayment = goalData.isFreeGoal || (giftData && giftData.payment === 'free');
                    if (isFreePayment) {
                        partnerUpdate.isUnlocked = true;
                        partnerUpdate.unlockedAt = FieldValue.serverTimestamp();
                    }

                    await partnerGoalRef.update(partnerUpdate);
                    logger.info(`[deleteGoal] Updated partner goal ${goalData.partnerGoalId}`);

                    let userName = 'Someone';
                    try {
                        const userSnap = await db.collection('users').doc(goalData.userId).get();
                        if (userSnap.exists) {
                            userName = userSnap.data()?.displayName || 'Someone';
                        }
                    } catch (userErr) {
                        logger.warn(`[deleteGoal] Could not fetch user displayName for partner notification:`, userErr);
                    }

                    await db.collection('notifications').add({
                        userId: partnerGoalData.userId,
                        type: 'shared_partner_removed',
                        title: 'Challenge Update',
                        message: `${userName} removed their goal "${goalData.title}" from your shared challenge.`,
                        data: { goalId, partnerGoalId: goalData.partnerGoalId },
                        read: false,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                    logger.info(`[deleteGoal] Sent shared_partner_removed notification to user ${partnerGoalData.userId}`);
                }
            }

            // Step 8: Archive goal to deletedGoals
            logger.info(`[deleteGoal] Archiving goal ${goalId} to deletedGoals`);
            await db.collection('deletedGoals').doc(goalId).set({
                ...goalData,
                deletedAt: FieldValue.serverTimestamp(),
                deletedBy: uid,
                originalGoalId: goalId,
            });

            // Step 9: Delete subcollections
            const subcollections = ['sessions', 'hints', 'motivations'];
            for (const subcollection of subcollections) {
                try {
                    let hasMore = true;
                    while (hasMore) {
                        const subSnap = await goalRef.collection(subcollection).limit(500).get();
                        if (subSnap.empty) {
                            hasMore = false;
                            break;
                        }
                        const batch = db.batch();
                        subSnap.docs.forEach((doc) => batch.delete(doc.ref));
                        await batch.commit();
                        logger.info(`[deleteGoal] Deleted ${subSnap.size} docs from ${subcollection}`);
                        if (subSnap.size < 500) hasMore = false;
                    }
                } catch (subErr) {
                    logger.error(`[deleteGoal] Error deleting subcollection ${subcollection}:`, subErr);
                }
            }

            // Step 10: Soft-delete feed posts
            try {
                let hasMoreFeed = true;
                while (hasMoreFeed) {
                    const feedSnap = await db.collection('feedPosts')
                        .where('goalId', '==', goalId)
                        .limit(500)
                        .get();
                    if (feedSnap.empty) {
                        hasMoreFeed = false;
                        break;
                    }
                    const batch = db.batch();
                    feedSnap.docs.forEach((doc) => {
                        batch.update(doc.ref, {
                            isDeleted: true,
                            deletedAt: FieldValue.serverTimestamp(),
                        });
                    });
                    await batch.commit();
                    logger.info(`[deleteGoal] Soft-deleted ${feedSnap.size} feed posts`);
                    if (feedSnap.size < 500) hasMoreFeed = false;
                }
            } catch (feedErr) {
                logger.error(`[deleteGoal] Error soft-deleting feed posts:`, feedErr);
            }

            // Step 11: Delete goal document
            await goalRef.delete();
            logger.info(`[deleteGoal] Goal ${goalId} deleted successfully`);

            // Step 12: Return result
            res.status(200).json({
                success: true,
                goalId,
                archivedAt: new Date().toISOString(),
            });
        } catch (error: unknown) {
            logger.error(`[deleteGoal] Unexpected error:`, error);
            res.status(500).json({ error: 'Failed to delete goal' });
        }
    }
);
