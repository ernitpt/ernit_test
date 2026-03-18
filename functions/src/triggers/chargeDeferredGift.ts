import * as functions from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import { getFirestore } from "firebase-admin/firestore";

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY");

// Production database
const getDbProd = () => getFirestore();

/**
 * Cloud Function: chargeDeferredGift
 * Triggers when a goal document is updated in Firestore PRODUCTION database.
 * If the goal is newly completed AND has a linked ExperienceGift with payment: 'deferred',
 * charges the giver's saved payment method via the stored SetupIntent.
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
            console.warn("⚠️ [PROD] No snapshot data for chargeDeferredGift");
            return null;
        }

        // Only trigger when goal transitions to completed
        if (beforeData.isCompleted || !afterData.isCompleted) {
            return null;
        }

        const goalId = event.params.goalId;
        console.log(`🎯 [PROD] Goal ${goalId} completed — checking for deferred gift`);

        const experienceGiftId = afterData.experienceGiftId;
        if (!experienceGiftId) {
            console.log(`ℹ️ [PROD] Goal ${goalId} has no linked experienceGift — skipping`);
            return null;
        }

        const db = getDbProd();

        // Get recipient name for notifications
        const recipientId = afterData.userId;
        let recipientName = 'They';
        try {
            const userDoc = await db.collection("users").doc(recipientId).get();
            if (userDoc.exists) {
                recipientName = userDoc.data()?.name || userDoc.data()?.displayName || 'They';
            }
        } catch (e) {
            console.warn("⚠️ [PROD] Could not fetch recipient name:", e);
        }

        try {
            const giftDoc = await db.collection("experienceGifts").doc(experienceGiftId).get();
            if (!giftDoc.exists) {
                console.warn(`⚠️ [PROD] ExperienceGift ${experienceGiftId} not found`);
                return null;
            }

            const giftData = giftDoc.data()!;

            // Only charge deferred gifts
            if (giftData.payment !== 'deferred') {
                console.log(`ℹ️ [PROD] ExperienceGift ${experienceGiftId} payment is '${giftData.payment}' — skipping`);
                return null;
            }

            if (!giftData.setupIntentId) {
                console.error(`❌ [PROD] ExperienceGift ${experienceGiftId} has no setupIntentId`);
                return null;
            }

            const stripe = new Stripe(STRIPE_SECRET.value(), {
                apiVersion: "2024-06-20" as any,
            });

            // Retrieve the SetupIntent to get the payment method
            const setupIntent = await stripe.setupIntents.retrieve(giftData.setupIntentId);
            const paymentMethodId = setupIntent.payment_method as string;

            if (!paymentMethodId) {
                console.error(`❌ [PROD] SetupIntent ${giftData.setupIntentId} has no payment method`);
                // Notify giver to update payment
                await db.collection("notifications").add({
                    userId: giftData.giverId,
                    type: 'payment_failed',
                    title: 'Payment method needed',
                    message: `${recipientName} completed their goal! Please update your payment method to unlock their reward.`,
                    data: { giftId: giftDoc.id, goalId },
                    read: false,
                    createdAt: new Date(),
                });
                return null;
            }

            const amount = Math.round((giftData.deferredAmount || 0) * 100); // cents
            const currency = giftData.deferredCurrency || 'eur';

            if (amount <= 0) {
                console.warn(`⚠️ [PROD] Deferred amount is 0 for gift ${giftDoc.id}`);
                return null;
            }

            // Create a PaymentIntent and charge the saved payment method
            const paymentIntent = await stripe.paymentIntents.create({
                amount,
                currency,
                payment_method: paymentMethodId,
                off_session: true,
                confirm: true,
                metadata: {
                    giftId: giftDoc.id,
                    giverId: giftData.giverId,
                    goalId,
                    type: 'deferred_charge',
                },
            });

            console.log(`✅ [PROD] Charged deferred gift ${giftDoc.id}: PaymentIntent ${paymentIntent.id}, status ${paymentIntent.status}`);

            // Update the gift to reflect payment
            await db.doc(`experienceGifts/${giftDoc.id}`).update({
                payment: 'paid',
                paymentIntentId: paymentIntent.id,
                chargedAt: new Date(),
                updatedAt: new Date(),
            });

            // Notify giver of successful charge
            await db.collection("notifications").add({
                userId: giftData.giverId,
                type: 'payment_charged',
                title: 'Challenge completed!',
                message: `${recipientName} achieved their goal! €${giftData.deferredAmount} has been charged.`,
                data: { giftId: giftDoc.id, goalId, amount: giftData.deferredAmount },
                read: false,
                createdAt: new Date(),
            });

            return null;
        } catch (error: any) {
            console.error(`❌ [PROD] Error charging deferred gift for goal ${goalId}:`, error);

            // If Stripe charge fails, notify giver
            if (error.type === 'StripeCardError' || error.code === 'payment_intent_authentication_failure') {
                const db2 = getDbProd();
                try {
                    const giftDoc2 = await db2.collection("experienceGifts").doc(experienceGiftId).get();
                    const giverId = giftDoc2.data()?.giverId;
                    if (giverId) {
                        await db2.collection("notifications").add({
                            userId: giverId,
                            type: 'payment_failed',
                            title: 'Payment failed',
                            message: `${recipientName} completed their goal, but the charge failed. Please update your payment method.`,
                            data: { giftId: experienceGiftId, goalId },
                            read: false,
                            createdAt: new Date(),
                        });
                    }
                } catch (notifError) {
                    console.error("❌ [PROD] Failed to send payment failure notification:", notifError);
                }
            }

            return null;
        }
    }
);
