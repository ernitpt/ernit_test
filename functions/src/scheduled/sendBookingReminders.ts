import * as functions from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/**
 * Cloud Function: sendBookingReminders
 * Scheduled function to remind users to book their experience after completing a goal.
 * Runs daily at 10 AM Europe/Lisbon time.
 *
 * Sends notifications based on days since goal completion:
 * - Day 1: "You earned it! Don't forget to book your experience!"
 * - Day 3: "Your experience is waiting"
 * - Day 7: "Still haven't booked?"
 * - Day 14: "Last reminder"
 *
 * Tracks sent reminders via `bookingReminderDays` array on the goal doc to prevent duplicates.
 */

const REMINDER_SCHEDULE = [1, 3, 7, 14];

function getReminderContent(daysSinceCompletion: number, experienceName: string) {
    switch (daysSinceCompletion) {
        case 1:
            return {
                title: "You earned it! 🎉",
                message: `You completed your goal — don't forget to book your ${experienceName} experience!`,
            };
        case 3:
            return {
                title: "Your experience is waiting ✨",
                message: `Ready to book ${experienceName}? Reach out to the partner to schedule your reward.`,
            };
        case 7:
            return {
                title: "Still haven't booked? 📅",
                message: `Your ${experienceName} reward is ready. Tap here to see booking details.`,
            };
        case 14:
            return {
                title: "Last reminder 💫",
                message: `Don't let your reward go to waste! Book ${experienceName} before it expires.`,
            };
        default:
            return null;
    }
}

export const sendBookingReminders = functions.onSchedule(
    {
        schedule: "0 10 * * *", // Every day at 10 AM
        timeZone: "Europe/Lisbon",
        region: "europe-west1",
    },
    async () => {
        try {
            logger.info("🔔 [PROD] Starting booking reminders check...");

            const db = require("../index").dbProd;
            const now = new Date();

            // Query completed goals that have an experience gift attached
            // Only look at goals completed within the last 30 days
            const thirtyDaysAgo = new Date(now);
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const goalsSnap = await db
                .collection("goals")
                .where("isCompleted", "==", true)
                .where("completedAt", ">=", thirtyDaysAgo)
                .get();

            logger.info(`📊 [PROD] Found ${goalsSnap.size} recently completed goals`);

            // Pre-fetch all unique experienceGift docs to avoid N+1 sequential reads
            const giftIds = new Set<string>();
            goalsSnap.docs.forEach((doc: any) => {
                const giftId = doc.data().experienceGiftId;
                if (giftId) giftIds.add(giftId);
            });

            const giftDocs = new Map<string, any>();
            await Promise.all(
                [...giftIds].map(async (id) => {
                    const snap = await db.collection("experienceGifts").doc(id).get();
                    giftDocs.set(id, snap);
                })
            );

            // Pre-fetch all unique experience docs referenced by the gift docs
            const experienceIds = new Set<string>();
            giftDocs.forEach((snap) => {
                const expId = snap.exists ? snap.data()?.experienceId : null;
                if (expId) experienceIds.add(expId);
            });

            const experienceDocs = new Map<string, any>();
            await Promise.all(
                [...experienceIds].map(async (id) => {
                    const snap = await db.collection("experiences").doc(id).get();
                    experienceDocs.set(id, snap);
                })
            );

            logger.info(`📦 [PROD] Pre-fetched ${giftDocs.size} gift doc(s) and ${experienceDocs.size} experience doc(s)`);

            let notificationsSent = 0;

            // Use batch writes for efficiency (Firestore limit: 500 ops per batch)
            let batch = db.batch();
            let batchCount = 0;
            const MAX_BATCH_OPS = 498; // 2 ops per iteration (set + update), safety margin

            for (const goalDoc of goalsSnap.docs) {
                const goal = goalDoc.data();

                // Skip goals without an experience gift (free goals without attached gift)
                if (!goal.experienceGiftId) {
                    continue;
                }

                const completedAt = goal.completedAt?.toDate?.() ?? new Date(goal.completedAt);
                if (!completedAt) {
                    continue;
                }

                // Calculate days since completion
                const timeDiff = now.getTime() - completedAt.getTime();
                const daysSinceCompletion = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

                // Check if this day is in the reminder schedule
                if (!REMINDER_SCHEDULE.includes(daysSinceCompletion)) {
                    continue;
                }

                // Check if this reminder was already sent
                const sentReminders: number[] = goal.bookingReminderDays || [];
                if (sentReminders.includes(daysSinceCompletion)) {
                    logger.info(
                        `⏭️ [PROD] Goal ${goalDoc.id}: Day-${daysSinceCompletion} reminder already sent`
                    );
                    continue;
                }

                // Resolve experience name from pre-fetched maps (no per-goal reads)
                let experienceName = "your experience";
                try {
                    const giftDoc = giftDocs.get(goal.experienceGiftId);
                    if (giftDoc?.exists) {
                        const giftData = giftDoc.data();
                        if (giftData?.experience?.name) {
                            experienceName = giftData.experience.name;
                        } else if (giftData?.experienceId) {
                            const expDoc = experienceDocs.get(giftData.experienceId);
                            if (expDoc?.exists) {
                                experienceName = expDoc.data()?.title || experienceName;
                            }
                        }
                    }
                } catch (expError) {
                    logger.error(
                        `⚠️ [PROD] Could not resolve experience name for goal ${goalDoc.id}:`,
                        expError
                    );
                }

                const content = getReminderContent(daysSinceCompletion, experienceName);
                if (!content) continue;

                // Stage notification and goal update in the batch
                try {
                    // Flush batch if approaching the 500-op limit (2 ops per iteration)
                    if (batchCount >= MAX_BATCH_OPS) {
                        await batch.commit();
                        batch = db.batch();
                        batchCount = 0;
                        logger.info("🔄 [PROD] Committed intermediate batch, starting new batch");
                    }

                    const notifRef = db.collection("notifications").doc();
                    batch.set(notifRef, {
                        userId: goal.userId,
                        type: "experience_booking_reminder",
                        title: content.title,
                        message: content.message,
                        read: false,
                        clearable: true,
                        data: {
                            goalId: goalDoc.id,
                            experienceGiftId: goal.experienceGiftId,
                            experienceName,
                        },
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });

                    // Mark this reminder day as sent on the goal doc
                    batch.update(goalDoc.ref, {
                        bookingReminderDays: admin.firestore.FieldValue.arrayUnion(daysSinceCompletion),
                    });

                    batchCount += 2;
                    notificationsSent++;
                    logger.info(
                        `✅ [PROD] Staged day-${daysSinceCompletion} booking reminder to user ${goal.userId} for goal ${goalDoc.id}`
                    );
                } catch (notifError) {
                    logger.error(
                        `❌ [PROD] Failed to stage booking reminder for goal ${goalDoc.id}:`,
                        notifError
                    );
                }
            }

            // Commit any remaining batch operations
            if (batchCount > 0) {
                await batch.commit();
                logger.info(`🔄 [PROD] Committed final batch (${batchCount} ops)`);
            }

            logger.info(
                `✨ [PROD] Booking reminders check complete. Sent ${notificationsSent} notification(s).`
            );
        } catch (error) {
            logger.error("❌ [PROD] Error in sendBookingReminders:", error);
        }
    }
);
