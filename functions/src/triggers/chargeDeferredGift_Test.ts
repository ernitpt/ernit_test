import * as functions from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";

const STRIPE_SECRET = defineSecret("STRIPE_SECRET_KEY_SANDBOX");

/**
 * Cloud Function: chargeDeferredGift_Test
 * Triggers when a goal document is updated in Firestore TEST database (ernitclone2).
 * If the goal is newly completed AND has a linked ExperienceGift with payment: 'deferred',
 * charges the giver's saved payment method via the stored SetupIntent.
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

        // Import db from index.ts (test database)
        const db = require("../index").db;

        try {
            const giftDoc = await db.collection("experienceGifts").doc(experienceGiftId).get();
            if (!giftDoc.exists) {
                console.warn(`⚠️ [TEST] ExperienceGift ${experienceGiftId} not found`);
                return null;
            }

            const giftData = giftDoc.data()!;

            if (giftData.payment !== 'deferred') {
                console.log(`ℹ️ [TEST] ExperienceGift ${experienceGiftId} payment is '${giftData.payment}' — skipping`);
                return null;
            }

            if (!giftData.setupIntentId) {
                console.error(`❌ [TEST] ExperienceGift ${experienceGiftId} has no setupIntentId`);
                return null;
            }

            const stripe = new Stripe(STRIPE_SECRET.value(), {
                apiVersion: "2024-06-20" as any,
            });

            const setupIntent = await stripe.setupIntents.retrieve(giftData.setupIntentId);
            const paymentMethodId = setupIntent.payment_method as string;

            if (!paymentMethodId) {
                console.error(`❌ [TEST] SetupIntent ${giftData.setupIntentId} has no payment method`);
                await db.collection("notifications").add({
                    userId: giftData.giverId,
                    type: 'payment_failed',
                    title: 'Payment method needed',
                    message: 'Your loved one completed their goal! Please update your payment method.',
                    data: { giftId: giftDoc.id, goalId },
                    read: false,
                    createdAt: new Date(),
                });
                return null;
            }

            const amount = Math.round((giftData.deferredAmount || 0) * 100);
            const currency = giftData.deferredCurrency || 'eur';

            if (amount <= 0) {
                console.warn(`⚠️ [TEST] Deferred amount is 0 for gift ${giftDoc.id}`);
                return null;
            }

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

            console.log(`✅ [TEST] Charged deferred gift ${giftDoc.id}: PaymentIntent ${paymentIntent.id}`);

            await db.doc(`experienceGifts/${giftDoc.id}`).update({
                payment: 'paid',
                paymentIntentId: paymentIntent.id,
                chargedAt: new Date(),
                updatedAt: new Date(),
            });

            await db.collection("notifications").add({
                userId: giftData.giverId,
                type: 'payment_charged',
                title: 'Challenge completed!',
                message: `Your loved one achieved their goal! €${giftData.deferredAmount} has been charged.`,
                data: { giftId: giftDoc.id, goalId, amount: giftData.deferredAmount },
                read: false,
                createdAt: new Date(),
            });

            return null;
        } catch (error: any) {
            console.error(`❌ [TEST] Error charging deferred gift for goal ${goalId}:`, error);

            if (error.type === 'StripeCardError' || error.code === 'payment_intent_authentication_failure') {
                try {
                    const giftDoc2 = await db.collection("experienceGifts").doc(experienceGiftId).get();
                    const giverId = giftDoc2.data()?.giverId;
                    if (giverId) {
                        await db.collection("notifications").add({
                            userId: giverId,
                            type: 'payment_failed',
                            title: 'Payment failed',
                            message: 'The charge failed. Please update your payment method.',
                            data: { giftId: experienceGiftId, goalId },
                            read: false,
                            createdAt: new Date(),
                        });
                    }
                } catch (notifError) {
                    console.error("❌ [TEST] Failed to send payment failure notification:", notifError);
                }
            }

            return null;
        }
    }
);
