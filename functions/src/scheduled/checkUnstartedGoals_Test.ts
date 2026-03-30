import * as functions from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

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
            logger.info("🔍 [TEST] Starting unstarted goals check...");

            // Get test db from shared index (ernitclone2 database)
            const db = require("../index").db;
            const now = new Date();

            // Paginated fetch of all unstarted goals (weekStartAt == null, not completed)
            const PAGE_SIZE = 500;
            let lastDoc: FirebaseFirestore.DocumentSnapshot | undefined;
            let processed = 0;
            let notificationsSent = 0;

            while (true) {
                let goalsQuery = db
                    .collection("goals")
                    .where("weekStartAt", "==", null)
                    .where("isCompleted", "==", false)
                    .orderBy(admin.firestore.FieldPath.documentId())
                    .limit(PAGE_SIZE);

                if (lastDoc) {
                    goalsQuery = goalsQuery.startAfter(lastDoc);
                }

                const goalsSnap = await goalsQuery.get();
                if (goalsSnap.empty) break;

                logger.info(`📊 [TEST] Processing page of ${goalsSnap.size} unstarted goals (total so far: ${processed})`);

                for (const goalDoc of goalsSnap.docs) {
                    const goal = goalDoc.data();
                    const plannedStart = goal.plannedStartDate?.toDate();

                    if (!plannedStart) {
                        logger.info(
                            `⚠️ [TEST] Goal ${goalDoc.id} has no plannedStartDate, skipping`
                        );
                        continue;
                    }

                    // Calculate days since planned start
                    const timeDiff = now.getTime() - plannedStart.getTime();
                    const daysSincePlanned = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

                    logger.info(
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
                        logger.info(
                            `⏭️ [TEST] Goal ${goalDoc.id}: Not in notification window (day ${daysSincePlanned})`
                        );
                        continue;
                    }

                    // Dedup check: skip if we already sent a notification for this day
                    const sentDays: number[] = Array.isArray(goal.sentUnstartedNotificationDays)
                        ? goal.sentUnstartedNotificationDays
                        : [];

                    if (sentDays.includes(daysSincePlanned)) {
                        logger.info(
                            `⏭️ [TEST] Goal ${goalDoc.id}: already sent day-${daysSincePlanned} notification, skipping`
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
                            `✅ [TEST] Sent day-${daysSincePlanned} reminder to user ${goal.userId} for goal ${goalDoc.id}`
                        );
                    } catch (notifError: unknown) {
                        logger.error(
                            `❌ [TEST] Failed to create notification for goal ${goalDoc.id}:`,
                            notifError
                        );
                    }
                } // end for goalDoc

                processed += goalsSnap.docs.length;

                if (goalsSnap.docs.length < PAGE_SIZE) break;
                lastDoc = goalsSnap.docs[goalsSnap.docs.length - 1];
            } // end while pagination

            logger.info(
                `✨ [TEST] Unstarted goals check complete. Processed ${processed} goals. Sent ${notificationsSent} notification(s).`
            );
        } catch (error: unknown) {
            logger.error("❌ [TEST] Error in checkUnstartedGoals:", error);
        }
    }
);
