// ========== DELETE GOAL (PRODUCTION) ==========
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { FieldValue, DocumentData } from "firebase-admin/firestore";
import { allowedOrigins } from "./cors";
import { validateGiftTransition, GiftStatus } from "./utils/giftStateMachine";

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
        } catch (error: unknown) {
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
            let giftRef: FirebaseFirestore.DocumentReference | null = null;

            // Step 6: Handle experienceGiftId — read gift data for use in the transaction below.
            // NOTE: The payment: 'processing' guard is re-checked atomically INSIDE the
            // transaction (FIX 4) to eliminate the TOCTOU window between this read and the
            // batch commit. The outer read here is only to obtain giftData for building
            // notification messages; we do NOT gate on it for the processing check.
            if (goalData.experienceGiftId) {
                logger.info(`[deleteGoal] Goal has experienceGiftId: ${goalData.experienceGiftId}`);
                giftRef = db.collection('experienceGifts').doc(goalData.experienceGiftId);
                const giftSnap = await giftRef.get();

                if (giftSnap.exists) {
                    giftData = giftSnap.data()!;
                }
            }

            // Step 7: Read partner goal data if present (reads only — writes go into transaction below)
            let partnerGoalRef: FirebaseFirestore.DocumentReference | null = null;
            let partnerGoalData: DocumentData | null = null;
            if (goalData.partnerGoalId) {
                logger.info(`[deleteGoal] Goal has partnerGoalId: ${goalData.partnerGoalId}`);
                partnerGoalRef = db.collection('goals').doc(goalData.partnerGoalId);
                const partnerGoalSnap = await partnerGoalRef.get();
                if (partnerGoalSnap.exists) {
                    partnerGoalData = partnerGoalSnap.data()!;
                }
            }

            // Fetch displayName once for use in notifications below
            let userName = 'Someone';
            try {
                const userSnap = await db.collection('users').doc(goalData.userId).get();
                if (userSnap.exists) {
                    userName = userSnap.data()?.displayName || 'Someone';
                }
            } catch (userErr: unknown) {
                logger.warn(`[deleteGoal] Could not fetch user displayName:`, userErr);
            }

            // ── Atomic transaction: gift update/restore + partner goal update +
            //    notifications + goal archive + goal delete ─────────────────────
            // Using a transaction (rather than a batch) so the payment: 'processing'
            // guard is re-checked against the live document state atomically with
            // all the writes, eliminating the TOCTOU window that exists when the
            // check is a plain read before a batch.
            try {
                await db.runTransaction(async (tx) => {
                    // FIX 4: Re-read the gift document inside the transaction to get the
                    // authoritative current state. If chargeDeferredGift set it to
                    // 'processing' between our outer read and now, abort here.
                    let freshGiftData: DocumentData | null = giftData;
                    if (giftRef) {
                        const freshGiftSnap = await tx.get(giftRef);
                        if (freshGiftSnap.exists) {
                            freshGiftData = freshGiftSnap.data()!;
                            if (freshGiftData.payment === 'processing') {
                                throw new Error('GIFT_PROCESSING');
                            }
                        } else {
                            freshGiftData = null;
                        }
                    }

                    // Gift cancellation or free-gift restore
                    if (giftRef && freshGiftData) {
                        if (freshGiftData.payment === 'deferred') {
                            logger.info(`[deleteGoal] Cancelling deferred gift ${goalData.experienceGiftId}`);
                            validateGiftTransition(freshGiftData.status as GiftStatus, 'cancelled');
                            tx.update(giftRef, {
                                status: 'cancelled',
                                payment: 'cancelled',
                                cancelledAt: FieldValue.serverTimestamp(),
                                cancelReason: 'goal_removed',
                                updatedAt: FieldValue.serverTimestamp(),
                            });

                            if (freshGiftData.giverId) {
                                tx.set(db.collection('notifications').doc(), {
                                    userId: freshGiftData.giverId,
                                    type: 'payment_cancelled',
                                    title: 'Goal Removed',
                                    message: `${userName} removed their goal "${goalData.title}". No charge will be made.`,
                                    data: { goalId, giftId: goalData.experienceGiftId },
                                    read: false,
                                    createdAt: FieldValue.serverTimestamp(),
                                });
                                logger.info(`[deleteGoal] Queued payment_cancelled notification to giver ${freshGiftData.giverId}`);
                            }
                        } else if (goalData.isFreeGoal && freshGiftData.redeemedGoalId === goalId) {
                            logger.info(`[deleteGoal] Restoring free gift ${goalData.experienceGiftId} to active`);
                            validateGiftTransition(freshGiftData.status as GiftStatus, 'active');
                            tx.update(giftRef, {
                                isRedeemed: false,
                                redeemedGoalId: null,
                                status: 'active',
                                updatedAt: FieldValue.serverTimestamp(),
                            });
                        }
                    }

                    // Partner goal update and partner notification
                    if (partnerGoalRef && partnerGoalData) {
                        const partnerUpdate: Record<string, any> = {
                            partnerGoalId: FieldValue.delete(),
                            updatedAt: FieldValue.serverTimestamp(),
                        };

                        const isFreePayment = goalData.isFreeGoal || (freshGiftData && freshGiftData.payment === 'free');
                        if (isFreePayment) {
                            partnerUpdate.isUnlocked = true;
                            partnerUpdate.unlockedAt = FieldValue.serverTimestamp();
                        }

                        tx.update(partnerGoalRef, partnerUpdate);
                        logger.info(`[deleteGoal] Queued update for partner goal ${goalData.partnerGoalId}`);

                        tx.set(db.collection('notifications').doc(), {
                            userId: partnerGoalData.userId,
                            type: 'shared_partner_removed',
                            title: 'Challenge Update',
                            message: `${userName} removed their goal "${goalData.title}" from your shared challenge.`,
                            data: { goalId, partnerGoalId: goalData.partnerGoalId },
                            read: false,
                            createdAt: FieldValue.serverTimestamp(),
                        });
                        logger.info(`[deleteGoal] Queued shared_partner_removed notification to user ${partnerGoalData.userId}`);
                    }

                    // Step 8: Archive goal to deletedGoals
                    logger.info(`[deleteGoal] Archiving goal ${goalId} to deletedGoals`);
                    tx.set(db.collection('deletedGoals').doc(goalId), {
                        ...goalData,
                        deletedAt: FieldValue.serverTimestamp(),
                        deletedBy: uid,
                        originalGoalId: goalId,
                    });

                    // Step 11 (moved into transaction): Delete goal document atomically with
                    // the archive write and gift/partner updates above.
                    tx.delete(goalRef);

                    // Decrement the active goal counter only for goal types that actually
                    // incremented it on creation (mirrors the logic in GoalService.ts):
                    //   - createGoal skips the increment when isPaidGiftedGoal
                    //     (experienceGiftId is set AND isFreeGoal is false).
                    //   - createFreeGoal skips the increment when hasPaidCommitment
                    //     (paymentCommitment is truthy).
                    // Both those paths must also be skipped here to avoid double-decrement.
                    const isPaidGiftedGoal = !!goalData.experienceGiftId && !goalData.isFreeGoal;
                    const hasPaidCommitment = !!goalData.paymentCommitment;
                    const wasCountedInLimit = !isPaidGiftedGoal && !hasPaidCommitment;
                    if (wasCountedInLimit && goalData.userId) {
                        const goalCountRef = db.collection('users').doc(goalData.userId).collection('meta').doc('goalCount');
                        tx.set(goalCountRef, { active: FieldValue.increment(-1) }, { merge: true });
                    }
                });
            } catch (txError: unknown) {
                if ((txError as Error).message === 'GIFT_PROCESSING') {
                    res.status(409).json({ error: 'A payment is being processed for this goal. Please try again shortly.' });
                    return;
                }
                throw txError;
            }

            logger.info(`[deleteGoal] Atomic transaction committed for goal ${goalId}`);

            // Step 9: Delete subcollections (cannot go inside the batch above —
            // subcollection docs are enumerated dynamically and may exceed batch limits)
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
                } catch (subErr: unknown) {
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
            } catch (feedErr: unknown) {
                logger.error(`[deleteGoal] Error soft-deleting feed posts:`, feedErr);
            }

            // Step 11b: Clean up notifications referencing this goal
            try {
                const notifQuery = await db.collection('notifications')
                    .where('data.goalId', '==', goalId)
                    .where('userId', '==', goalData.userId)
                    .get();

                if (!notifQuery.empty) {
                    const notifBatch = db.batch();
                    notifQuery.docs.forEach(doc => notifBatch.delete(doc.ref));
                    await notifBatch.commit();
                    logger.info(`[deleteGoal] Deleted ${notifQuery.size} notifications for goal ${goalId}`);
                }
            } catch (cleanupError) {
                // Non-fatal: log but don't fail the deletion
                logger.error('[deleteGoal] Failed to cleanup goal notifications:', cleanupError);
            }

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
