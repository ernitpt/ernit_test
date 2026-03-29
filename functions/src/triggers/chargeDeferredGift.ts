import * as functions from "firebase-functions/v2";
import { logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getOrCreateStripeCustomer } from "../utils/stripeCustomer";
import { validateGiftTransition, GiftStatus } from "../utils/giftStateMachine";

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY");

// Production database
const getDbProd = () => getFirestore();

/**
 * Cloud Function: chargeDeferredGift
 * Triggers when a goal document is updated in Firestore PRODUCTION database.
 *
 * Handles three cases:
 *  1. Deferred payment (solo or shared): charges Stripe when goal(s) complete.
 *  2. Free shared challenge: when both partners complete, unlock both goals and
 *     send shared_unlock notifications (no charge).
 *  3. Free solo: no-op.
 *
 * Race-condition safety:
 *  - Step 1: Transaction atomically claims the charge slot by marking payment
 *    as 'processing'. External I/O (Stripe) is intentionally OUTSIDE the
 *    transaction to avoid non-deterministic retries.
 *  - Step 2: Stripe PaymentIntent is created outside the transaction with an
 *    idempotency key.
 *  - Step 3/4: Gift is updated to 'paid'/'completed' on success, or reverted
 *    to 'deferred' on failure.
 */
export const chargeDeferredGift = functions.firestore.onDocumentUpdated(
    {
        document: "goals/{goalId}",
        region: "europe-west1",
        secrets: [STRIPE_SECRET],
    },
    async (event) => {
        const beforeData = event.data?.before?.data();
        const afterData = event.data?.after?.data();

        if (!beforeData || !afterData) {
            logger.warn("⚠️ [PROD] No snapshot data for chargeDeferredGift");
            return null;
        }

        // Only trigger when goal transitions to completed
        if (beforeData.isCompleted || !afterData.isCompleted) {
            return null;
        }

        const goalId = event.params.goalId;
        logger.info(`🎯 [PROD] Goal ${goalId} completed — checking for deferred gift`);

        const experienceGiftId = afterData.experienceGiftId;
        if (!experienceGiftId) {
            logger.info(`ℹ️ [PROD] Goal ${goalId} has no linked experienceGift — skipping`);
            return null;
        }

        const db = getDbProd();

        // Get recipient name for notifications (the user whose goal just completed)
        const recipientId = afterData.userId;
        let recipientName = 'They';
        try {
            const userDoc = await db.collection("users").doc(recipientId).get();
            if (userDoc.exists) {
                recipientName = userDoc.data()?.name || userDoc.data()?.displayName || 'They';
            }
        } catch (e: unknown) {
            logger.warn("⚠️ [PROD] Could not fetch recipient name:", e);
        }

        try {
            const giftDoc = await db.collection("experienceGifts").doc(experienceGiftId).get();
            if (!giftDoc.exists) {
                logger.warn(`⚠️ [PROD] ExperienceGift ${experienceGiftId} not found`);
                return null;
            }

            const giftData = giftDoc.data()!;
            const giftId = giftDoc.id;
            const giftRef = db.doc(`experienceGifts/${giftId}`);
            const isShared = giftData.challengeType === 'shared';

            // Idempotency guard: skip if already charged / completed
            if (giftData.payment === 'paid') {
                logger.info(`ℹ️ [PROD] ExperienceGift ${giftId} already paid, skipping`);
                return null;
            }

            // ── Shared challenge handling ──────────────────────────────────────
            if (isShared) {
                // C2 companion: if this is a shared gift but partnerGoalId is absent,
                // we cannot safely verify both partners — skip charge entirely.
                if (!afterData.partnerGoalId) {
                    logger.warn(`⚠️ [PROD] Shared challenge gift ${giftId} but partnerGoalId is absent on goal ${goalId} — skipping charge`);
                    return null;
                }

                // Read partner goal to check completion and get their userId (H3)
                let partnerGoalSnap;
                let partnerGoalData;
                let partnerUserId: string | undefined;
                try {
                    partnerGoalSnap = await db.collection('goals').doc(afterData.partnerGoalId).get();
                    partnerGoalData = partnerGoalSnap.data();
                    partnerUserId = partnerGoalData?.userId;
                } catch (readErr: unknown) {
                    logger.error(`❌ [PROD] Failed to read partner goal ${afterData.partnerGoalId}:`, readErr);
                    return null; // Don't charge if we can't verify partner completion
                }

                if (!partnerGoalSnap?.exists) {
                    // C14: Partner goal was deleted after the shared challenge was set up.
                    // Do NOT charge the giver for a ghost partner gift — abort and mark failed.
                    logger.error(`Partner goal not found for gift ${giftId}, aborting charge`);
                    await giftRef.update({ payment: 'failed', failureReason: 'partner_goal_deleted', updatedAt: FieldValue.serverTimestamp() });
                    return null;
                } else if (!partnerGoalData?.isCompleted) {
                    // One partner done, waiting on the other — notify BOTH (H3)
                    logger.info(`ℹ️ [PROD] Shared challenge: partner has not completed yet, skipping charge for goal ${goalId}`);

                    const notifPayload = {
                        type: 'shared_completion',
                        title: 'Partner Progress',
                        message: `${recipientName} completed their goal! Waiting for both partners to finish before unlocking the reward.`,
                        data: { giftId, goalId },
                        read: false,
                        createdAt: FieldValue.serverTimestamp(),
                    };

                    const notifBatch = db.batch();
                    // Notify the completing user (the one whose goal just finished)
                    notifBatch.set(db.collection('notifications').doc(), {
                        ...notifPayload,
                        userId: afterData.userId,
                    });
                    // Notify the partner (the other user) if different from completing user
                    if (partnerUserId && partnerUserId !== afterData.userId) {
                        notifBatch.set(db.collection('notifications').doc(), {
                            ...notifPayload,
                            userId: partnerUserId,
                        });
                    }
                    await notifBatch.commit();
                    return null;
                }

                logger.info(`✅ [PROD] Shared challenge: both partners complete for goal ${goalId} — proceeding`);

                // ── C5: FREE shared gift — unlock both goals, notify, no charge ──
                if (giftData.payment === 'free') {
                    logger.info(`ℹ️ [PROD] Free shared gift ${giftId} — unlocking both goals`);

                    const goalRef1 = db.doc(`goals/${goalId}`);
                    const goalRef2 = db.doc(`goals/${afterData.partnerGoalId}`);

                    // Idempotency check FIRST, then unlock — all inside one transaction
                    // to prevent concurrent invocations from both running the unlock batch.
                    let alreadyNotified = false;
                    try {
                        await db.runTransaction(async (tx) => {
                            const freshGift = await tx.get(giftRef);
                            if (freshGift.data()?.notificationSent) {
                                alreadyNotified = true;
                                return; // nothing to write; transaction exits cleanly
                            }
                            // Mark as notified + completed atomically with goal unlocks
                            tx.update(giftRef, {
                                notificationSent: true,
                                status: 'completed',
                                updatedAt: FieldValue.serverTimestamp(),
                            });
                            tx.update(goalRef1, {
                                isUnlocked: true,
                                unlockedAt: FieldValue.serverTimestamp(),
                            });
                            tx.update(goalRef2, {
                                isUnlocked: true,
                                unlockedAt: FieldValue.serverTimestamp(),
                            });
                        });
                    } catch (txErr: unknown) {
                        logger.error(`❌ [PROD] Transaction failed for free shared gift ${giftId}:`, txErr);
                        return null;
                    }

                    if (alreadyNotified) {
                        logger.info(`ℹ️ [PROD] shared_unlock notification already sent for gift ${giftId} — skipping`);
                        return null;
                    }

                    // Send shared_unlock notifications to BOTH users AFTER the transaction (fire-and-forget)
                    const unlockMessage = 'Both of you completed the challenge! Your reward is unlocked.';
                    const unlockNotifBatch = db.batch();
                    unlockNotifBatch.set(db.collection('notifications').doc(), {
                        userId: afterData.userId,
                        type: 'shared_unlock',
                        title: 'Challenge Complete!',
                        message: unlockMessage,
                        data: { giftId, goalId },
                        read: false,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                    if (partnerUserId && partnerUserId !== afterData.userId) {
                        unlockNotifBatch.set(db.collection('notifications').doc(), {
                            userId: partnerUserId,
                            type: 'shared_unlock',
                            title: 'Challenge Complete!',
                            message: unlockMessage,
                            data: { giftId, goalId },
                            read: false,
                            createdAt: FieldValue.serverTimestamp(),
                        });
                    }
                    await unlockNotifBatch.commit();

                    logger.info(`✅ [PROD] Free shared gift ${giftId} — both goals unlocked and notifications sent`);
                    return null;
                }
            } else {
                // Solo free goal — no processing needed
                if (giftData.payment === 'free') {
                    logger.info(`ℹ️ [PROD] Free solo gift ${giftId} — no processing needed`);
                    return null;
                }
            }

            // ── Deferred payment path ─────────────────────────────────────────
            if (giftData.payment !== 'deferred') {
                logger.info(`ℹ️ [PROD] ExperienceGift ${giftId} payment is '${giftData.payment}' — skipping`);
                return null;
            }

            // Fix 9: Expiry check — skip charge if the gift has expired
            if (giftData.expiresAt && giftData.expiresAt.toDate() < new Date()) {
                logger.warn(`Gift ${giftId} has expired, skipping charge`);
                // Notify both parties
                const notifBatch = db.batch();
                notifBatch.set(db.collection('notifications').doc(), {
                    userId: giftData.giverId,
                    type: 'payment_failed',
                    title: 'Gift Expired',
                    message: 'The gift challenge has expired before the charge could be processed.',
                    data: { giftId, goalId: event.params.goalId },
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                });
                // Also notify recipient if known
                if (afterData.userId && afterData.userId !== giftData.giverId) {
                    notifBatch.set(db.collection('notifications').doc(), {
                        userId: afterData.userId,
                        type: 'payment_failed',
                        title: 'Gift Expired',
                        message: 'The gift attached to your completed goal has expired.',
                        data: { giftId, goalId: event.params.goalId },
                        read: false,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                }
                // Mark gift as expired
                notifBatch.update(giftRef, { status: 'expired', updatedAt: FieldValue.serverTimestamp() });
                await notifBatch.commit();
                return null;
            }

            if (!giftData.setupIntentId) {
                logger.error(`❌ [PROD] ExperienceGift ${giftId} has no setupIntentId`);
                await db.collection("notifications").add({
                    userId: giftData.giverId,
                    type: 'payment_failed',
                    title: 'Payment method needed',
                    message: `${recipientName} completed their goal! Please add a payment method to unlock their reward.`,
                    data: { giftId, goalId },
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                });
                return null;
            }

            const stripe = new Stripe(STRIPE_SECRET.value(), {
                apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
            });

            // Retrieve the SetupIntent to get the payment method
            const setupIntent = await stripe.setupIntents.retrieve(giftData.setupIntentId);
            const paymentMethodId = setupIntent.payment_method as string;

            if (!paymentMethodId) {
                logger.error(`❌ [PROD] SetupIntent ${giftData.setupIntentId} has no payment method`);
                await db.collection("notifications").add({
                    userId: giftData.giverId,
                    type: 'payment_failed',
                    title: 'Payment method needed',
                    message: `${recipientName} completed their goal! Please update your payment method to unlock their reward.`,
                    data: { giftId, goalId },
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                });
                return null;
            }

            const amount = Math.round((giftData.deferredAmount || 0) * 100); // cents
            const currency = giftData.deferredCurrency || 'eur';

            if (amount <= 0) {
                logger.warn(`⚠️ [PROD] Deferred amount is 0 for gift ${giftId} — treating as free`);
                await giftRef.update({
                    payment: 'paid',
                    status: 'completed',
                    updatedAt: FieldValue.serverTimestamp(),
                });
                return null;
            }

            // ── Step 1: Atomically claim the charge slot ──────────────────────
            // Mark as 'processing' inside a transaction so concurrent invocations
            // bail out immediately. No external I/O inside the transaction.
            // chargeData is returned from the transaction to avoid using variables
            // that were assigned inside the closure but declared outside — those
            // would be undefined if the transaction throws due to contention before
            // the assignment is reached.
            let chargeData: { paymentMethodId: string; amount: number; currency: string } | null = null;

            try {
                await db.runTransaction(async (tx) => {
                    const freshGiftSnap = await tx.get(giftRef);
                    const freshGift = freshGiftSnap.data();

                    if (!freshGift || freshGift.payment === 'paid' || freshGift.payment === 'processing') {
                        throw new Error('ALREADY_PROCESSING');
                    }

                    tx.update(giftRef, {
                        payment: 'processing',
                        updatedAt: FieldValue.serverTimestamp(),
                    });

                    // Capture charge values inside the transaction so they are only
                    // set when the transaction body actually executes successfully.
                    chargeData = { paymentMethodId, amount, currency };
                });
            } catch (txError: unknown) {
                if ((txError as Error).message === 'ALREADY_PROCESSING') {
                    logger.info(`ℹ️ [PROD] ExperienceGift ${giftId} is already being processed — skipping`);
                    return null;
                }
                throw txError;
            }

            if (!chargeData) {
                logger.error(`❌ [PROD] Transaction did not produce charge data for gift ${giftId}`);
                return null;
            }

            // Re-fetch the gift document after the transaction commits to get fresh
            // field values (paymentMethodId, amount, currency) for the Stripe call.
            // The pre-transaction giftData snapshot may be stale if concurrent
            // updates modified those fields between the initial read and now.
            const freshGiftSnap = await giftRef.get();
            const freshGiftData = freshGiftSnap.data();
            if (!freshGiftData) {
                logger.error(`❌ [PROD] Could not re-fetch gift ${giftId} after transaction`);
                return null;
            }

            // Derive the Stripe charge parameters from the fresh snapshot.
            // deferredAmount and deferredCurrency come from the fresh doc to pick up
            // any concurrent updates. paymentMethodId was already retrieved from Stripe
            // using the pre-transaction setupIntentId — re-use it unless the
            // setupIntentId itself changed (rare), in which case re-retrieve.
            const freshSetupIntentId = freshGiftData.setupIntentId as string | undefined;
            let freshPaymentMethodId: string = (chargeData as { paymentMethodId: string }).paymentMethodId;
            if (freshSetupIntentId && freshSetupIntentId !== giftData.setupIntentId) {
                const freshSetupIntent = await stripe.setupIntents.retrieve(freshSetupIntentId);
                freshPaymentMethodId = freshSetupIntent.payment_method as string;
            }
            const freshAmount = Math.round((freshGiftData.deferredAmount || 0) * 100);
            const freshCurrency = freshGiftData.deferredCurrency || 'eur';

            // ── Step 2: Stripe call OUTSIDE transaction ───────────────────────
            let paymentIntentId: string;
            let paymentIntentStatus: string;

            try {
                // Retrieve Stripe Customer from the fresh gift doc, or create one
                // on-the-fly (handles old gifts created before customer tracking was added)
                const stripeCustomerId = freshGiftData.stripeCustomerId
                    || await getOrCreateStripeCustomer(stripe, db, freshGiftData.giverId);

                // Ensure the payment method is attached to the customer
                // (needed for legacy gifts where SetupIntent had no customer).
                // If already attached, Stripe throws — safe to ignore.
                try {
                    await stripe.paymentMethods.attach(freshPaymentMethodId, {
                        customer: stripeCustomerId,
                    });
                } catch (attachErr: unknown) {
                    // Stripe throws if PM is already attached to this or another customer.
                    // Log but don't block — the charge will still work if PM belongs to this customer.
                    logger.info(`ℹ️ PM attach skipped: ${(attachErr as Error).message}`);
                }

                const paymentIntent = await stripe.paymentIntents.create(
                    {
                        amount: freshAmount,
                        currency: freshCurrency,
                        customer: stripeCustomerId,
                        payment_method: freshPaymentMethodId,
                        off_session: true,
                        confirm: true,
                        metadata: {
                            giftId,
                            giverId: freshGiftData.giverId,
                            goalId,
                            type: 'deferred_charge',
                        },
                    },
                    { idempotencyKey: giftId }
                );

                paymentIntentId = paymentIntent.id;
                paymentIntentStatus = paymentIntent.status;

                // ── Step 3: Mark as paid on success (retry up to 3 times) ────
                // Critical: Stripe charge succeeded — we MUST record it.
                // If this fails, gift stays in 'processing' with no way to retry.

                // Validate state machine transition before writing
                // Gift status should be 'claimed' at this point (recipient has a goal linked)
                const currentStatus = freshGiftData.status as GiftStatus | undefined;
                if (currentStatus) {
                    validateGiftTransition(currentStatus, 'completed');
                }

                const paidUpdate = {
                    payment: 'paid',
                    status: 'completed',
                    paymentIntentId: paymentIntent.id,
                    chargedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                };
                let lastError: Error | null = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        await giftRef.update(paidUpdate);
                        lastError = null;
                        break;
                    } catch (updateErr: unknown) {
                        lastError = updateErr as Error;
                        if (attempt === 3) {
                            // All retries failed — log critical error with PaymentIntent ID
                            // for manual reconciliation. Do NOT revert to 'deferred'.
                            logger.error(`🚨 [CRITICAL] Gift ${giftId} charged (PI: ${paymentIntent.id}) but Firestore update failed after 3 attempts:`, updateErr);
                        } else {
                            logger.warn(`⚠️ Firestore update attempt ${attempt}/3 failed for gift ${giftId}, retrying...`);
                            await new Promise(r => setTimeout(r, 500 * attempt));
                        }
                    }
                }

                // After all retries are exhausted — write to failedCharges for reconciliation
                if (lastError !== null) {
                    try {
                        await db.collection('failedCharges').doc(giftId).set({
                            giftId,
                            paymentIntentId: paymentIntent.id,
                            amount: freshGiftData.deferredAmount,
                            currency: freshGiftData.deferredCurrency || 'eur',
                            errorMessage: lastError.message || 'Unknown error',
                            timestamp: FieldValue.serverTimestamp(),
                            retryCount: 0,
                            resolved: false,
                            goalId: freshGiftData.goalId || null,
                            giverId: freshGiftData.giverId || null,
                            recipientId: freshGiftData.recipientId || null,
                        });
                        logger.error(`[chargeDeferredGift] Wrote to failedCharges/${giftId} after exhausting retries`);
                    } catch (failedChargeErr: unknown) {
                        logger.error(`[chargeDeferredGift] Failed to write to failedCharges/${giftId}:`, failedChargeErr);
                    }
                    // Gift is not reliably marked paid — do NOT unlock goals.
                    logger.error('All retries exhausted, gift stuck in processing');
                    return null;
                }
            } catch (stripeError: unknown) {
                // ── Step 4: Revert to 'deferred' on Stripe failure ────────────
                try {
                    await giftRef.update({
                        payment: 'deferred',
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                } catch (revertError: unknown) {
                    logger.error(`❌ [PROD] Failed to revert gift ${giftId} to deferred after Stripe error:`, revertError);
                }
                throw stripeError;
            }

            logger.info(`✅ [PROD] Charged deferred gift ${giftId}: PaymentIntent ${paymentIntentId!}, status ${paymentIntentStatus!}`);

            // ── C1: Unlock both goals for shared challenges ───────────────────
            if (isShared && afterData.partnerGoalId) {
                const goalUnlockBatch = db.batch();
                goalUnlockBatch.update(db.doc(`goals/${goalId}`), {
                    isUnlocked: true,
                    unlockedAt: FieldValue.serverTimestamp(),
                });
                goalUnlockBatch.update(db.doc(`goals/${afterData.partnerGoalId}`), {
                    isUnlocked: true,
                    unlockedAt: FieldValue.serverTimestamp(),
                });
                await goalUnlockBatch.commit();
                logger.info(`✅ [PROD] Unlocked both goals for shared challenge gift ${giftId}`);

                // Re-read partner goal to get userId for notifications (partnerGoalData was scoped to earlier block)
                const partnerGoalForNotif = afterData.partnerGoalId
                    ? (await db.doc(`goals/${afterData.partnerGoalId}`).get()).data()
                    : null;

                // Fix 8 (hardened): Atomically claim the right to send the shared_unlock
                // notification so concurrent invocations cannot both pass the check.
                // freshGiftData was read before the transaction committed and is stale —
                // we must re-read inside a new transaction.
                let shouldSendSharedUnlockNotification = false;
                await db.runTransaction(async (tx) => {
                    const latestGiftSnap = await tx.get(giftRef);
                    if (!latestGiftSnap.data()?.notificationSent) {
                        tx.update(giftRef, { notificationSent: true, updatedAt: FieldValue.serverTimestamp() });
                        shouldSendSharedUnlockNotification = true;
                    }
                });

                if (shouldSendSharedUnlockNotification) {
                    // ── H2: Notify BOTH users of shared unlock ────────────────────
                    const unlockMessage = 'Both of you completed the challenge! Your reward is unlocked.';
                    const sharedUnlockBatch = db.batch();
                    // Notify the completing user (goal owner who triggered this)
                    sharedUnlockBatch.set(db.collection('notifications').doc(), {
                        userId: afterData.userId,
                        type: 'shared_unlock',
                        title: 'Challenge Complete!',
                        message: unlockMessage,
                        data: { giftId, goalId, amount: freshGiftData.deferredAmount },
                        read: false,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                    // Notify the partner (the other goal's owner)
                    if (partnerGoalForNotif?.userId && partnerGoalForNotif.userId !== afterData.userId) {
                        sharedUnlockBatch.set(db.collection('notifications').doc(), {
                            userId: partnerGoalForNotif.userId,
                            type: 'shared_unlock',
                            title: 'Challenge Complete!',
                            message: unlockMessage,
                            data: { giftId, goalId, amount: freshGiftData.deferredAmount },
                            read: false,
                            createdAt: FieldValue.serverTimestamp(),
                        });
                    }
                    await sharedUnlockBatch.commit();
                } else {
                    logger.info(`ℹ️ [PROD] shared_unlock notification already sent for gift ${giftId} — skipping`);
                }
            } else {
                // Solo challenge — notify giver of successful charge
                await db.collection("notifications").add({
                    userId: freshGiftData.giverId,
                    type: 'payment_charged',
                    title: 'Challenge completed!',
                    message: `${recipientName} achieved their goal! €${freshGiftData.deferredAmount} has been charged.`,
                    data: { giftId, goalId, amount: freshGiftData.deferredAmount },
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                });
            }

            return null;
        } catch (error: unknown) {
            logger.error(`❌ [PROD] Error charging deferred gift for goal ${goalId}:`, error);

            // Notify giver of ANY charge failure so the gift doesn't silently stall
            const db2 = getDbProd();
            try {
                const giftDoc2 = await db2.collection("experienceGifts").doc(experienceGiftId).get();
                const giverId = giftDoc2.data()?.giverId;
                if (giverId) {
                    const stripeErr = error as Stripe.errors.StripeError;
                    const isAuthRequired = stripeErr.code === 'authentication_required';
                    const rawObj = stripeErr.raw as Record<string, any> | undefined;
                    const recoveryUrl: string | undefined = rawObj?.payment_intent?.next_action?.use_stripe_sdk?.stripe_js
                        ?? rawObj?.payment_intent?.next_action?.redirect_to_url?.url
                        ?? undefined;

                    let notifTitle = 'Payment failed';
                    let notifMessage = `${recipientName} completed their goal, but the charge failed. Please update your payment method.`;

                    if (isAuthRequired) {
                        notifTitle = 'Card Verification Required';
                        notifMessage = recoveryUrl
                            ? `Your card requires additional verification. Please visit ${recoveryUrl} to complete the payment.`
                            : 'Your card requires additional verification. Please open the app and update your payment method to complete the charge.';
                    }

                    await db2.collection("notifications").add({
                        userId: giverId,
                        type: 'payment_failed',
                        title: notifTitle,
                        message: notifMessage,
                        data: { giftId: experienceGiftId, goalId, recoveryUrl: recoveryUrl || '' },
                        read: false,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                }
            } catch (notifError: unknown) {
                logger.error("❌ [PROD] Failed to send payment failure notification:", notifError);
            }

            return null;
        }
    }
);
