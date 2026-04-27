import * as functions from "firebase-functions/v2";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const getDbTest = () => getFirestore('ernitclone2');

/**
 * Cloud Function: onGoalCreated_Test
 * Mirrors onGoalCreated.ts against the ernitclone2 test database.
 */
export const onGoalCreated_Test = functions.firestore.onDocumentCreated(
    {
        document: "goals/{goalId}",
        database: "ernitclone2",
        region: "europe-west1",
    },
    async (event) => {
        const goalData = event.data?.data();
        const goalId = event.params.goalId;

        if (!goalData) {
            logger.warn(`[onGoalCreated_Test] No snapshot data for goal ${goalId}`);
            return null;
        }

        if (goalData.experienceGiftId) {
            return null;
        }

        const userId = goalData.userId;
        if (!userId || typeof userId !== 'string') {
            logger.warn(`[onGoalCreated_Test] Goal ${goalId} missing userId — skipping`);
            return null;
        }

        const db = getDbTest();

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

            logger.info(`[onGoalCreated_Test] Notified user ${userId} of ${pendingGifts.length} pending gifts for goal ${goalId}`);
            return null;
        } catch (err: unknown) {
            logger.error(`[onGoalCreated_Test] Failed to check pending gifts for goal ${goalId}:`, err);
            return null;
        }
    }
);
