import * as functions from "firebase-functions/v2";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const getDbProd = () => getFirestore();

/**
 * Cloud Function: onGoalCreated (PRODUCTION)
 *
 * When a new goal is created, check whether the owner has any already-claimed
 * gifts that are not yet attached to a goal. If so, fire a
 * `pending_gift_available` notification so the UI can prompt the user to
 * attach one. We do NOT auto-attach, because a user may hold multiple
 * unattached gifts from different givers and we cannot pick for them.
 *
 * Skips when:
 *  - the new goal already has experienceGiftId set (came in from a claim flow
 *    or paid-experience-gift flow — nothing to recover),
 *  - the goal has no userId (malformed),
 *  - no pending gifts exist for the user.
 */
export const onGoalCreated = functions.firestore.onDocumentCreated(
    {
        document: "goals/{goalId}",
        region: "europe-west1",
    },
    async (event) => {
        const goalData = event.data?.data();
        const goalId = event.params.goalId;

        if (!goalData) {
            logger.warn(`[onGoalCreated] No snapshot data for goal ${goalId}`);
            return null;
        }

        if (goalData.experienceGiftId) {
            return null;
        }

        const userId = goalData.userId;
        if (!userId || typeof userId !== 'string') {
            logger.warn(`[onGoalCreated] Goal ${goalId} missing userId — skipping`);
            return null;
        }

        const db = getDbProd();

        try {
            const giftsSnap = await db.collection('experienceGifts')
                .where('recipientId', '==', userId)
                .limit(20)
                .get();

            if (giftsSnap.empty) return null;

            const pendingGifts = giftsSnap.docs.filter((doc) => {
                const g = doc.data();
                if (g.isRedeemed === true) return false;
                if (g.redeemedGoalId) return false;
                return g.status === 'claimed' || g.status === 'active';
            });

            if (pendingGifts.length === 0) return null;

            const giftIds = pendingGifts.map((d) => d.id);
            const firstGiverId = pendingGifts[0].data().giverId || '';

            await db.collection('notifications').add({
                userId,
                type: 'pending_gift_available',
                title: pendingGifts.length === 1 ? 'You have a gift waiting' : `You have ${pendingGifts.length} gifts waiting`,
                message: pendingGifts.length === 1
                    ? 'Attach it to your new goal to unlock the reward when you complete it.'
                    : 'Choose which gift to attach to your new goal.',
                data: {
                    goalId,
                    giftIds,
                    giftId: giftIds[0],
                    giverId: firstGiverId,
                },
                read: false,
                createdAt: FieldValue.serverTimestamp(),
            });

            logger.info(`[onGoalCreated] Notified user ${userId} of ${pendingGifts.length} pending gifts for goal ${goalId}`);
            return null;
        } catch (err: unknown) {
            logger.error(`[onGoalCreated] Failed to check pending gifts for goal ${goalId}:`, err);
            return null;
        }
    }
);
