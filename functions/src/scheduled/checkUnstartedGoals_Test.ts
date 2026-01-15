import * as functions from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

/**
 * Cloud Function: checkUnstartedGoals_Test
 * Scheduled function to check for unstarted goals and send forgiving reminders
 * Runs daily at 9 AM Europe/Lisbon time
 * 
 * Sends notifications based on days since planned start:
 * - Day 0: "Today's the day! 🎯"
 * - Day 1: "You planned to start yesterday, but that's fine! 💪"
 * - Day 3: "We're here when you're ready 🙌"
 */
export const checkUnstartedGoals_Test = functions.onSchedule(
    {
        schedule: "0 9 * * *", // Every day at 9 AM
        timeZone: "Europe/Lisbon",
        region: "europe-west1",
    },
    async (event) => {
        try {
            console.log("🔍 [TEST] Starting unstarted goals check...");

            // Import db from index.ts (test database)
            const db = require("../index").db;
            const now = new Date();

            // Get all goals where weekStartAt is null (not started) and not completed
            const goalsSnap = await db
                .collection("goals")
                .where("weekStartAt", "==", null)
                .where("isCompleted", "==", false)
                .get();

            console.log(`📊 [TEST] Found ${goalsSnap.size} unstarted goals`);

            let notificationsSent = 0;

            for (const goalDoc of goalsSnap.docs) {
                const goal = goalDoc.data();
                const plannedStart = goal.plannedStartDate?.toDate();

                if (!plannedStart) {
                    console.log(
                        `⚠️ [TEST] Goal ${goalDoc.id} has no plannedStartDate, skipping`
                    );
                    continue;
                }

                // Calculate days since planned start
                const timeDiff = now.getTime() - plannedStart.getTime();
                const daysSincePlanned = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

                console.log(
                    `📅 [TEST] Goal ${goalDoc.id}: ${daysSincePlanned} days since planned start`
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
                    console.log(
                        `⏭️ [TEST] Goal ${goalDoc.id}: Not in notification window (day ${daysSincePlanned})`
                    );
                    continue;
                }

                // Create notification
                try {
                    await db.collection("notifications").add({
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

                    notificationsSent++;
                    console.log(
                        `✅ [TEST] Sent day-${daysSincePlanned} reminder to user ${goal.userId} for goal ${goalDoc.id}`
                    );
                } catch (notifError) {
                    console.error(
                        `❌ [TEST] Failed to create notification for goal ${goalDoc.id}:`,
                        notifError
                    );
                }
            }

            console.log(
                `✨ [TEST] Unstarted goals check complete. Sent ${notificationsSent} notification(s).`
            );
        } catch (error) {
            console.error("❌ [TEST] Error in checkUnstartedGoals:", error);
        }
    }
);
