import * as functions from "firebase-functions/v2/scheduler";
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
            console.log("🔔 [PROD] Starting booking reminders check...");

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

            console.log(`📊 [PROD] Found ${goalsSnap.size} recently completed goals`);

            let notificationsSent = 0;

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
                    console.log(
                        `⏭️ [PROD] Goal ${goalDoc.id}: Day-${daysSinceCompletion} reminder already sent`
                    );
                    continue;
                }

                // Fetch experience name for the notification message
                let experienceName = "your experience";
                try {
                    if (goal.experienceGiftId) {
                        const giftDoc = await db
                            .collection("experienceGifts")
                            .doc(goal.experienceGiftId)
                            .get();
                        if (giftDoc.exists()) {
                            const giftData = giftDoc.data();
                            if (giftData?.experience?.name) {
                                experienceName = giftData.experience.name;
                            } else if (giftData?.experienceId) {
                                const expDoc = await db
                                    .collection("experiences")
                                    .doc(giftData.experienceId)
                                    .get();
                                if (expDoc.exists()) {
                                    experienceName = expDoc.data()?.name || experienceName;
                                }
                            }
                        }
                    }
                } catch (expError) {
                    console.error(
                        `⚠️ [PROD] Could not fetch experience name for goal ${goalDoc.id}:`,
                        expError
                    );
                }

                const content = getReminderContent(daysSinceCompletion, experienceName);
                if (!content) continue;

                // Create notification
                try {
                    await db.collection("notifications").add({
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
                    await goalDoc.ref.update({
                        bookingReminderDays: admin.firestore.FieldValue.arrayUnion(daysSinceCompletion),
                    });

                    notificationsSent++;
                    console.log(
                        `✅ [PROD] Sent day-${daysSinceCompletion} booking reminder to user ${goal.userId} for goal ${goalDoc.id}`
                    );
                } catch (notifError) {
                    console.error(
                        `❌ [PROD] Failed to create booking reminder for goal ${goalDoc.id}:`,
                        notifError
                    );
                }
            }

            console.log(
                `✨ [PROD] Booking reminders check complete. Sent ${notificationsSent} notification(s).`
            );
        } catch (error) {
            console.error("❌ [PROD] Error in sendBookingReminders:", error);
        }
    }
);
