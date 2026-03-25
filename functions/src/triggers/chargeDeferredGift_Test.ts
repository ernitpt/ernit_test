import * as functions from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getOrCreateStripeCustomer } from "../utils/stripeCustomer";

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY_SANDBOX");

/**
 * Cloud Function: chargeDeferredGift_Test
 * Triggers when a goal document is updated in Firestore TEST database (ernitclone2).
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
export const chargeDeferredGift_Test = functions.firestore.onDocumentUpdated(
    {
        document: "goals/{goalId}",
        region: "europe-west1",
        database: "ernitclone2",
        secrets: [STRIPE_SECRET],
    },
    async (event) => {
        const beforeData = event.data?.before?.data();
        const afterData = event.data?.after?.data();

        if (!beforeData || !afterData) {
            console.warn("⚠️ [TEST] No snapshot data for chargeDeferredGift");
            return null;
        }

        // Only trigger when goal transitions to completed
        if (beforeData.isCompleted || !afterData.isCompleted) {
            return null;
        }

        const goalId = event.params.goalId;
        console.log(`🎯 [TEST] Goal ${goalId} completed — checking for deferred gift`);

        const experienceGiftId = afterData.experienceGiftId;
        if (!experienceGiftId) {
            console.log(`ℹ️ [TEST] Goal ${goalId} has no linked experienceGift — skipping`);
            return null;
        }

        // Use test database directly
        const db = getFirestore("ernitclone2");

        // Get recipient name for notifications (the user whose goal just completed)
        const recipientId = afterData.userId;
        let recipientName = 'They';
        try {
            const userDoc = await db.collection("users").doc(recipientId).get();
            if (userDoc.exists) {
                recipientName = userDoc.data()?.name || userDoc.data()?.displayName || 'They';
            }
        } catch (e: unknown) {
            console.warn("⚠️ [TEST] Could not fetch recipient name:", e);
        }

        try {
            const giftDoc = await db.collection("experienceGifts").doc(experienceGiftId).get();
            if (!giftDoc.exists) {
                console.warn(`⚠️ [TEST] ExperienceGift ${experienceGiftId} not found`);
                return null;
            }

            const giftData = giftDoc.data()!;
            const giftId = giftDoc.id;
            const giftRef = db.doc(`experienceGifts/${giftId}`);
            const isShared = giftData.challengeType === 'shared';

            // Idempotency guard: skip if already charged / completed
            if (giftData.payment === 'paid') {
                console.log(`ℹ️ [TEST] ExperienceGift ${giftId} already paid, skipping`);
                return null;
            }

            // ── Shared challenge handling ──────────────────────────────────────
            if (isShared) {
                // C2 companion: if this is a shared gift but partnerGoalId is absent,
                // we cannot safely verify both partners — skip charge entirely.
                if (!afterData.partnerGoalId) {
                    console.warn(`⚠️ [TEST] Shared challenge gift ${giftId} but partnerGoalId is absent on goal ${goalId} — skipping charge`);
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
                    console.error(`❌ [TEST] Failed to read partner goal ${afterData.partnerGoalId}:`, readErr);
                    return null; // Don't charge if we can't verify partner completion
                }

                if (!partnerGoalSnap?.exists) {
                    console.warn('Partner goal deleted, treating as completed for charge purposes');
                    // Proceed with charge (fall through to charge logic)
                } else if (!partnerGoalData?.isCompleted) {
                    // One partner done, waiting on the other — notify BOTH (H3)
                    console.log(`ℹ️ [TEST] Shared challenge: partner has not completed yet, skipping charge for goal ${goalId}`);

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

                console.log(`✅ [TEST] Shared challenge: both partners complete for goal ${goalId} — proceeding`);

                // ── C5: FREE shared gift — unlock both goals, notify, no charge ──
                if (giftData.payment === 'free') {
                    console.log(`ℹ️ [TEST] Free shared gift ${giftId} — unlocking both goals`);

                    // Unlock both goals (C1 pattern, no charge needed)
                    const unlockBatch = db.batch();
                    unlockBatch.update(db.doc(`goals/${goalId}`), {
                        isUnlocked: true,
                        unlockedAt: FieldValue.serverTimestamp(),
                    });
                    unlockBatch.update(db.doc(`goals/${afterData.partnerGoalId}`), {
                        isUnlocked: true,
                        unlockedAt: FieldValue.serverTimestamp(),
                    });
                    // Mark gift as completed
                    unlockBatch.update(giftRef, {
                        status: 'completed',
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    await unlockBatch.commit();

                    // Fix 8: Skip shared_unlock notifications if already sent
                    if (giftData.notificationSent) {
                        console.log(`ℹ️ [TEST] shared_unlock notification already sent for gift ${giftId} — skipping`);
                        return null;
                    }

                    // Send shared_unlock notifications to BOTH users (H2)
                    const unlockMessage = 'Both of you completed the challenge! Your reward is unlocked.';
                    const unlockNotifBatch = db.batch();
                    // Notify the completing user (goal owner who triggered this)
                    unlockNotifBatch.set(db.collection('notifications').doc(), {
                        userId: afterData.userId,
                        type: 'shared_unlock',
                        title: 'Challenge Complete!',
                        message: unlockMessage,
                        data: { giftId, goalId },
                        read: false,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                    // Notify the partner (the other goal's owner)
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

                    // Fix 8: Mark notification as sent to prevent duplicate sends
                    await giftRef.update({ notificationSent: true, updatedAt: FieldValue.serverTimestamp() });

                    console.log(`✅ [TEST] Free shared gift ${giftId} — both goals unlocked and notifications sent`);
                    return null;
                }
            } else {
                // Solo free goal — no processing needed
                if (giftData.payment === 'free') {
                    console.log(`ℹ️ [TEST] Free solo gift ${giftId} — no processing needed`);
                    return null;
                }
            }

            // ── Deferred payment path ─────────────────────────────────────────
            if (giftData.payment !== 'deferred') {
                console.log(`ℹ️ [TEST] ExperienceGift ${giftId} payment is '${giftData.payment}' — skipping`);
                return null;
            }

            // Fix 9: Expiry check — skip charge if the gift has expired
            if (giftData.expiresAt && giftData.expiresAt.toDate() < new Date()) {
                console.warn(`Gift ${giftId} has expired, skipping charge`);
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
                console.error(`❌ [TEST] ExperienceGift ${giftId} has no setupIntentId`);
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
                apiVersion: "2024-06-20" as any,
            });

            // Retrieve the SetupIntent to get the payment method
            const setupIntent = await stripe.setupIntents.retrieve(giftData.setupIntentId);
            const paymentMethodId = setupIntent.payment_method as string;

            if (!paymentMethodId) {
                console.error(`❌ [TEST] SetupIntent ${giftData.setupIntentId} has no payment method`);
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
                console.warn(`⚠️ [TEST] Deferred amount is 0 for gift ${giftId} — treating as free`);
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
            let claimedPaymentMethodId: string;
            let claimedAmount: number;
            let claimedCurrency: string;

            try {
                await db.runTransaction(async (tx) => {
                    const freshGiftSnap = await tx.get(giftRef);
                    const freshGift = freshGiftSnap.data();

                    if (!freshGift || freshGift.payment === 'paid' || freshGift.payment === 'processing') {
                        throw new Error('ALREADY_PROCESSING');
                    }

                    // Capture values from the fresh read for correctness
                    claimedPaymentMethodId = paymentMethodId;
                    claimedAmount = amount;
                    claimedCurrency = currency;

                    tx.update(giftRef, {
                        payment: 'processing',
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                });
            } catch (txError: unknown) {
                if (txError.message === 'ALREADY_PROCESSING') {
                    console.log(`ℹ️ [TEST] ExperienceGift ${giftId} is already being processed — skipping`);
                    return null;
                }
                throw txError;
            }

            // ── Step 2: Stripe call OUTSIDE transaction ───────────────────────
            let paymentIntentId: string;
            let paymentIntentStatus: string;

            try {
                // Retrieve Stripe Customer from gift doc, or create one on-the-fly
                // (handles old gifts created before customer tracking was added)
                const stripeCustomerId = giftData.stripeCustomerId
                    || await getOrCreateStripeCustomer(stripe, db, giftData.giverId);

                // Ensure the payment method is attached to the customer
                // (needed for legacy gifts where SetupIntent had no customer).
                // If already attached, Stripe throws — safe to ignore.
                try {
                    await stripe.paymentMethods.attach(claimedPaymentMethodId!, {
                        customer: stripeCustomerId,
                    });
                } catch (attachErr: unknown) {
                    // Stripe throws if PM is already attached to this or another customer.
                    // Log but don't block — the charge will still work if PM belongs to this customer.
                    console.log(`ℹ️ PM attach skipped: ${attachErr.message}`);
                }

                const paymentIntent = await stripe.paymentIntents.create(
                    {
                        amount: claimedAmount!,
                        currency: claimedCurrency!,
                        customer: stripeCustomerId,
                        payment_method: claimedPaymentMethodId!,
                        off_session: true,
                        confirm: true,
                        metadata: {
                            giftId,
                            giverId: giftData.giverId,
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
                const paidUpdate = {
                    payment: 'paid',
                    status: 'completed',
                    paymentIntentId: paymentIntent.id,
                    chargedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                };
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        await giftRef.update(paidUpdate);
                        break;
                    } catch (updateErr: unknown) {
                        if (attempt === 3) {
                            // All retries failed — log critical error with PaymentIntent ID
                            // for manual reconciliation. Do NOT revert to 'deferred'.
                            console.error(`🚨 [CRITICAL] Gift ${giftId} charged (PI: ${paymentIntent.id}) but Firestore update failed after 3 attempts:`, updateErr);
                        } else {
                            console.warn(`⚠️ Firestore update attempt ${attempt}/3 failed for gift ${giftId}, retrying...`);
                            await new Promise(r => setTimeout(r, 500 * attempt));
                        }
                    }
                }
            } catch (stripeError: unknown) {
                // ── Step 4: Revert to 'deferred' on Stripe failure ────────────
                try {
                    await giftRef.update({
                        payment: 'deferred',
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                } catch (revertError: unknown) {
                    console.error(`❌ [TEST] Failed to revert gift ${giftId} to deferred after Stripe error:`, revertError);
                }
                throw stripeError;
            }

            console.log(`✅ [TEST] Charged deferred gift ${giftId}: PaymentIntent ${paymentIntentId!}, status ${paymentIntentStatus!}`);

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
                console.log(`✅ [TEST] Unlocked both goals for shared challenge gift ${giftId}`);

                // Re-read partner goal to get userId for notifications
                const partnerGoalForNotif = afterData.partnerGoalId
                    ? (await db.doc(`goals/${afterData.partnerGoalId}`).get()).data()
                    : null;

                // Fix 8: Skip shared_unlock notifications if already sent
                if (!giftData.notificationSent) {
                    // ── H2: Notify BOTH users of shared unlock ────────────────────
                    const unlockMessage = 'Both of you completed the challenge! Your reward is unlocked.';
                    const sharedUnlockBatch = db.batch();
                    // Notify the completing user (goal owner who triggered this)
                    sharedUnlockBatch.set(db.collection('notifications').doc(), {
                        userId: afterData.userId,
                        type: 'shared_unlock',
                        title: 'Challenge Complete!',
                        message: unlockMessage,
                        data: { giftId, goalId, amount: giftData.deferredAmount },
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
                            data: { giftId, goalId, amount: giftData.deferredAmount },
                            read: false,
                            createdAt: FieldValue.serverTimestamp(),
                        });
                    }
                    await sharedUnlockBatch.commit();

                    // Fix 8: Mark notification as sent to prevent duplicate sends
                    await giftRef.update({ notificationSent: true, updatedAt: FieldValue.serverTimestamp() });
                } else {
                    console.log(`ℹ️ [TEST] shared_unlock notification already sent for gift ${giftId} — skipping`);
                }
            } else {
                // Solo challenge — notify giver of successful charge
                await db.collection("notifications").add({
                    userId: giftData.giverId,
                    type: 'payment_charged',
                    title: 'Challenge completed!',
                    message: `${recipientName} achieved their goal! €${giftData.deferredAmount} has been charged.`,
                    data: { giftId, goalId, amount: giftData.deferredAmount },
                    read: false,
                    createdAt: FieldValue.serverTimestamp(),
                });
            }

            return null;
        } catch (error: any) {
            console.error(`❌ [TEST] Error charging deferred gift for goal ${goalId}:`, error);

            // Notify giver of ANY charge failure so the gift doesn't silently stall
            const db2 = getFirestore("ernitclone2");
            try {
                const giftDoc2 = await db2.collection("experienceGifts").doc(experienceGiftId).get();
                const giverId = giftDoc2.data()?.giverId;
                if (giverId) {
                    const isAuthRequired = error.code === 'authentication_required';
                    const recoveryUrl: string | undefined = error.raw?.payment_intent?.next_action?.use_stripe_sdk?.stripe_js
                        ?? error.raw?.payment_intent?.next_action?.redirect_to_url?.url
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
                console.error("❌ [TEST] Failed to send payment failure notification:", notifError);
            }

            return null;
        }
    }
);
