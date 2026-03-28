import * as functions from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const getDb = () => getFirestore();

/**
 * Cloud Function: retryFailedCharges
 * Scheduled daily function that reads the `failedCharges` collection and
 * retries the Firestore gift update for any charges where Stripe succeeded
 * but the gift document update failed after all retries in chargeDeferredGift.
 *
 * A record is eligible for retry when:
 *   - resolved = false
 *   - retryCount < 5
 *
 * On success the failedCharges doc is marked resolved = true.
 * On failure the retryCount is incremented and lastRetryError is recorded.
 * After 5 failures the record remains for manual investigation.
 */
export const retryFailedCharges = functions.onSchedule(
    {
        schedule: '0 3 * * *', // Every day at 3 AM UTC
        timeZone: 'Europe/Lisbon',
        region: 'europe-west1',
    },
    async (_event) => {
        logger.info('[retryFailedCharges] Starting daily retry run');

        const db = getDb();

        const snapshot = await db.collection('failedCharges')
            .where('resolved', '==', false)
            .where('retryCount', '<', 5)
            .get();

        if (snapshot.empty) {
            logger.info('[retryFailedCharges] No failed charges to retry');
            return;
        }

        const retryPromises = snapshot.docs.map(async (doc) => {
            const data = doc.data();
            const { giftId } = data;

            try {
                // Attempt to fix the gift document
                await db.collection('experienceGifts').doc(giftId).update({
                    payment: 'paid',
                    paidAt: FieldValue.serverTimestamp(),
                });

                // Mark as resolved
                await doc.ref.update({
                    resolved: true,
                    resolvedAt: FieldValue.serverTimestamp(),
                });
                logger.info(`[retryFailedCharges] Resolved gift ${giftId}`);
            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                logger.error(`[retryFailedCharges] Retry failed for gift ${giftId}:`, errorMessage);
                await doc.ref.update({
                    retryCount: FieldValue.increment(1),
                    lastRetryError: errorMessage,
                    lastRetryAt: FieldValue.serverTimestamp(),
                });
            }
        });

        await Promise.allSettled(retryPromises);
        logger.info(`[retryFailedCharges] Processed ${snapshot.docs.length} failed charges`);
    }
);
