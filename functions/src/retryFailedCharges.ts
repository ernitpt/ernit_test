import * as functions from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { validateGiftTransition, GiftStatus } from './utils/giftStateMachine';

const STRIPE_SECRET = defineSecret('STRIPE_SECRET_KEY');

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
        secrets: [STRIPE_SECRET],
    },
    async (_event) => {
        logger.info('[retryFailedCharges] Starting daily retry run');

        const db = getDb();

        // C12: Initialise Stripe so we can re-verify PaymentIntent status before
        // writing payment: 'paid'. This prevents marking a gift as paid when the
        // original charge actually failed or was refunded.
        const stripe = new Stripe(STRIPE_SECRET.value(), {
            apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
        });

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
            const { giftId, paymentIntentId } = data;

            try {
                // C12: Re-verify the Stripe PaymentIntent status before writing
                // payment: 'paid'. A failedCharges record means Stripe succeeded
                // but the Firestore update failed — confirm Stripe still shows
                // 'succeeded' before reconciling, in case the charge was later
                // reversed or the record contains stale data.
                if (!paymentIntentId) {
                    logger.warn(`[retryFailedCharges] No paymentIntentId on failedCharges doc for gift ${giftId}, skipping`);
                    await doc.ref.update({
                        retryCount: FieldValue.increment(1),
                        lastRetryError: 'Missing paymentIntentId — cannot verify with Stripe',
                        lastRetryAt: FieldValue.serverTimestamp(),
                    });
                    return;
                }

                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                if (paymentIntent.status !== 'succeeded') {
                    logger.warn(`[retryFailedCharges] PaymentIntent ${paymentIntentId} not succeeded (${paymentIntent.status}), skipping gift ${giftId}`);
                    await doc.ref.update({
                        retryCount: FieldValue.increment(1),
                        lastRetryError: `PaymentIntent status is '${paymentIntent.status}', not 'succeeded'`,
                        lastRetryAt: FieldValue.serverTimestamp(),
                    });
                    return;
                }

                // BUG-13: Cross-check that the gift document still matches the
                // failedCharges record before writing. Between the original failure
                // and this retry, another code path may have already charged the
                // gift or the failedCharges doc may be stale (different PI).
                const giftSnap = await db.collection('experienceGifts').doc(giftId).get();

                if (!giftSnap.exists) {
                    logger.warn(`[retryFailedCharges] Gift document ${giftId} no longer exists — deleting stale failedCharges doc`);
                    await doc.ref.delete();
                    return;
                }

                const giftData = giftSnap.data()!;

                // Check 1: The PaymentIntent on the gift must match what we recorded.
                // If it differs, a different charge path already succeeded and the
                // failedCharges doc is stale — do not overwrite with wrong PI data.
                if (giftData.paymentIntentId && giftData.paymentIntentId !== paymentIntentId) {
                    logger.warn(
                        `[retryFailedCharges] PaymentIntent mismatch for gift ${giftId}: ` +
                        `failedCharges has '${paymentIntentId}' but gift doc has '${giftData.paymentIntentId}'. ` +
                        `Deleting stale failedCharges doc.`
                    );
                    await doc.ref.delete();
                    return;
                }

                // Check 2 (transactional): Atomically re-verify the payment status and
                // set it to 'processing' so a concurrent chargeDeferredGift invocation
                // cannot overwrite an in-progress charge.  The Stripe call happens
                // OUTSIDE the transaction because external I/O inside Firestore
                // transactions is not safe (they may be retried).
                const giftRef = db.collection('experienceGifts').doc(giftId);
                let shouldCharge = false;
                let shouldDeleteStale = false;
                let staleReason = '';

                await db.runTransaction(async (txn) => {
                    const freshGiftSnap = await txn.get(giftRef);

                    if (!freshGiftSnap.exists) {
                        shouldDeleteStale = true;
                        staleReason = 'gift document no longer exists';
                        return;
                    }

                    const freshGift = freshGiftSnap.data()!;

                    // Re-check PaymentIntent match on the fresh read.
                    if (freshGift.paymentIntentId && freshGift.paymentIntentId !== paymentIntentId) {
                        shouldDeleteStale = true;
                        staleReason = `PaymentIntent mismatch (fresh read): gift has '${freshGift.paymentIntentId}', failedCharges has '${paymentIntentId}'`;
                        return;
                    }

                    // The gift must still be 'processing' — if it is 'paid' or 'failed'
                    // another path already resolved it; the failedCharges doc is stale.
                    if (freshGift.payment === 'paid' || freshGift.payment === 'failed') {
                        shouldDeleteStale = true;
                        staleReason = `payment status is '${freshGift.payment}' (expected 'processing')`;
                        return;
                    }

                    if (freshGift.payment !== 'processing') {
                        shouldDeleteStale = true;
                        staleReason = `payment status is '${freshGift.payment}' (expected 'processing')`;
                        return;
                    }

                    // All checks pass — mark as processing (already is, but re-assert
                    // the update so the transaction has a write, preventing a no-op read
                    // transaction that could be retried without effect).
                    txn.update(giftRef, { payment: 'processing', updatedAt: FieldValue.serverTimestamp() });
                    shouldCharge = true;
                });

                if (shouldDeleteStale) {
                    logger.warn(`[retryFailedCharges] Deleting stale failedCharges doc for gift ${giftId}: ${staleReason}`);
                    await doc.ref.delete();
                    return;
                }

                if (!shouldCharge) {
                    // Transaction aborted for an unexpected reason — skip silently.
                    return;
                }

                // Stripe call is intentionally OUTSIDE the transaction.
                // The gift is already at payment: 'processing' (set above), so
                // chargeDeferredGift will skip it if it races with us here.
                validateGiftTransition(giftData.status as GiftStatus, 'completed');
                await db.collection('experienceGifts').doc(giftId).update({
                    payment: 'paid',
                    status: 'completed',
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
