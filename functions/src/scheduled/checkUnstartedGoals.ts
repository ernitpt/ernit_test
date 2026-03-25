import * as functions from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/**
 * Cloud Function: checkUnstartedGoals
 * Scheduled function to check for unstarted goals and send forgiving reminders
 * Runs daily at 9 AM Europe/Lisbon time
 *
 * Sends notifications based on days since planned start:
 * - Day 0: "Today's the day! 🎯"
 * - Day 1: "You planned to start yesterday, but that's fine! 💪"
 * - Day 3: "We're here when you're ready 🙌"
 */
export const checkUnstartedGoals = functions.onSchedule(
    {
        schedule: "0 9 * * *", // Every day at 9 AM
        timeZone: "Europe/Lisbon",
        region: "europe-west1",
    },
    async (event) => {
        try {
            logger.info("🔍 [PROD] Starting unstarted goals check...");

            // Import db from index.ts (production database)
            const db = require("../index").dbProd;
            const now = new Date();

            // Get all goals where weekStartAt is null (not started) and not completed
            const goalsSnap = await db
                .collection("goals")
                .where("weekStartAt", "==", null)
                .where("isCompleted", "==", false)
                .get();

            logger.info(`📊 [PROD] Found ${goalsSnap.size} unstarted goals`);

            let notificationsSent = 0;

            for (const goalDoc of goalsSnap.docs) {
                const goal = goalDoc.data();
                const plannedStart = goal.plannedStartDate?.toDate();

                if (!plannedStart) {
                    logger.info(
                        `⚠️ [PROD] Goal ${goalDoc.id} has no plannedStartDate, skipping`
                    );
                    continue;
                }

                // Calculate days since planned start
                const timeDiff = now.getTime() - plannedStart.getTime();
                const daysSincePlanned = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

                logger.info(
                    `📅 [PROD] Goal ${goalDoc.id}: ${daysSincePlanned} days since planned start`
                );

                let title: string;
                let message: string;

                // Day of planned start
                if (daysSincePlanned === 0) {
                    title = "Today's the day! 🎯";
                    message = `Ready to start your ${goal.title?.replace("Attend ", "").replace(" Sessions", "")} goal? You've got this!`;
                }
                // Day after planned start
                else if (daysSincePlanned === 1) {
                    title = "No pressure! 💪";
                    message = `You planned to start yesterday, but that's totally fine! You can still begin today.`;
                }
                // 3 days after planned start
                else if (daysSincePlanned === 3) {
                    title = "We're here when you're ready 🙌";
                    message = `Still interested in ${goal.title?.replace("Attend ", "").replace(" Sessions", "")}? Start whenever feels right for you!`;
                }
                // Skip if outside notification windows
                else {
                    logger.info(
                        `⏭️ [PROD] Goal ${goalDoc.id}: Not in notification window (day ${daysSincePlanned})`
                    );
                    continue;
                }

                // Dedup check: skip if we already sent a notification for this day
                const sentDays: number[] = Array.isArray(goal.sentUnstartedNotificationDays)
                    ? goal.sentUnstartedNotificationDays
                    : [];

                if (sentDays.includes(daysSincePlanned)) {
                    logger.info(
                        `⏭️ [PROD] Goal ${goalDoc.id}: already sent day-${daysSincePlanned} notification, skipping`
                    );
                    continue;
                }

                // Create notification + stamp dedup atomically
                try {
                    const batch = db.batch();
                    const notifRef = db.collection("notifications").doc();
                    batch.set(notifRef, {
                        userId: goal.userId,
                        type: "goal_progress",
                        title,
                        message,
                        read: false,
                        clearable: true,
                        data: {
                            goalId: goalDoc.id,
                        },
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });

                    // Track that this day's notification has been sent
                    batch.update(goalDoc.ref, {
                        sentUnstartedNotificationDays: admin.firestore.FieldValue.arrayUnion(daysSincePlanned),
                    });

                    await batch.commit();

                    notificationsSent++;
                    logger.info(
                        `✅ [PROD] Sent day-${daysSincePlanned} reminder to user ${goal.userId} for goal ${goalDoc.id}`
                    );
                } catch (notifError: unknown) {
                    logger.error(
                        `❌ [PROD] Failed to create notification for goal ${goalDoc.id}:`,
                        notifError
                    );
                }
            }

            logger.info(
                `✨ [PROD] Unstarted goals check complete. Sent ${notificationsSent} notification(s).`
            );
        } catch (error: unknown) {
            logger.error("❌ [PROD] Error in checkUnstartedGoals:", error);
        }
    }
);
