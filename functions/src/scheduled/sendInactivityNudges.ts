import * as functions from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/**
 * Cloud Function: sendInactivityNudges
 * Scheduled function to send tiered inactivity nudges for active goals
 * Runs daily at 10 AM Europe/Lisbon time
 *
 * Sends tiered notifications based on days since last session:
 * - Day 2 (Level 1): "Keep going!" - gentle nudge
 * - Day 4 (Level 2): "Your goal misses you!" - stronger reminder
 * - Day 7+ (Level 3): "It's never too late!" - encouraging push
 *
 * Rules:
 * - Only nudges if lastNudgeLevel < currentLevel (no duplicate nudges)
 * - Skips if daily reminder already sent today (no stacking)
 */
export const sendInactivityNudges = functions.onSchedule(
    {
        schedule: "0 10 * * *", // Every day at 10 AM
        timeZone: "Europe/Lisbon",
        region: "europe-west1",
    },
    async (event) => {
        try {
            logger.info("🔍 [PROD] Starting inactivity nudges check...");

            // Import db from index.ts (production database)
            const db = require("../index").dbProd;
            const now = new Date();
            const todayISO = now.toISOString().split('T')[0]; // e.g., "2025-03-08"

            // Get all active goals that have started (weekStartAt != null, isCompleted == false)
            const goalsSnap = await db
                .collection("goals")
                .where("isCompleted", "==", false)
                .where("weekStartAt", "!=", null)
                .get();

            logger.info(`📊 [PROD] Found ${goalsSnap.size} active goals`);

            let notificationsSent = 0;

            for (const goalDoc of goalsSnap.docs) {
                const goal = goalDoc.data();
                const weeklyLogDates = goal.weeklyLogDates || [];
                const weekStartAt = goal.weekStartAt?.toDate();

                if (!weekStartAt) {
                    logger.info(
                        `⚠️ [PROD] Goal ${goalDoc.id} has no weekStartAt, skipping`
                    );
                    continue;
                }

                // Calculate last session date
                let lastSessionDate: Date;
                if (weeklyLogDates.length > 0) {
                    // Sort dates descending and take most recent
                    const sortedDates = weeklyLogDates
                        .map((dateStr: string) => new Date(dateStr + 'T00:00:00Z'))
                        .sort((a: Date, b: Date) => b.getTime() - a.getTime());
                    lastSessionDate = sortedDates[0];
                } else {
                    // No sessions yet, use weekStartAt as fallback
                    lastSessionDate = weekStartAt;
                }

                // Calculate days since last session
                const timeDiff = now.getTime() - lastSessionDate.getTime();
                const daysSinceLastSession = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

                logger.info(
                    `📅 [PROD] Goal ${goalDoc.id}: ${daysSinceLastSession} days since last session`
                );

                // Determine nudge level
                let currentLevel: number;
                let title: string;
                let message: string;

                if (daysSinceLastSession === 2) {
                    currentLevel = 1;
                    title = "Keep going!";
                    message = "You haven't logged a session in 2 days. Jump back in!";
                } else if (daysSinceLastSession === 4) {
                    currentLevel = 2;
                    title = "Your goal misses you!";
                    message = `It's been 4 days since your last ${goal.title?.replace("Attend ", "").replace(" Sessions", "")} session. Get back on track!`;
                } else if (daysSinceLastSession >= 7) {
                    currentLevel = 3;
                    title = "It's never too late!";
                    message = `One session is all it takes to get back on track with ${goal.title?.replace("Attend ", "").replace(" Sessions", "")}`;
                } else {
                    // Not in nudge window
                    logger.info(
                        `⏭️ [PROD] Goal ${goalDoc.id}: Not in nudge window (day ${daysSinceLastSession})`
                    );
                    continue;
                }

                // Check if already nudged at this level or higher
                const lastNudgeLevel = goal.lastNudgeLevel || 0;
                if (lastNudgeLevel >= currentLevel) {
                    logger.info(
                        `⏭️ [PROD] Goal ${goalDoc.id}: Already nudged at level ${lastNudgeLevel} (current: ${currentLevel}), skipping`
                    );
                    continue;
                }

                // Check if daily reminder already sent today (no stacking rule)
                try {
                    const userDoc = await db.collection("users").doc(goal.userId).get();
                    const userData = userDoc.data();
                    if (userData?.lastReminderSentDate === todayISO) {
                        logger.info(
                            `⏭️ [PROD] Goal ${goalDoc.id}: Daily reminder already sent today, skipping`
                        );
                        continue;
                    }
                } catch (userError) {
                    logger.warn(
                        `⚠️ [PROD] Could not check lastReminderSentDate for user ${goal.userId}:`,
                        userError
                    );
                    // Continue anyway - don't block nudge on user doc read failure
                }

                // Create notification + stamp dedup atomically
                try {
                    const batch = db.batch();
                    batch.set(db.collection("notifications").doc(), {
                        userId: goal.userId,
                        type: "session_reminder",
                        title,
                        message,
                        read: false,
                        clearable: true,
                        data: {
                            goalId: goalDoc.id,
                            daysSinceLastSession,
                            weeklyCount: goal.weeklyCount || 0,
                            sessionsPerWeek: goal.sessionsPerWeek || 0,
                        },
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    batch.update(goalDoc.ref, {
                        lastNudgeSentAt: admin.firestore.FieldValue.serverTimestamp(),
                        lastNudgeLevel: currentLevel,
                    });
                    await batch.commit();

                    notificationsSent++;
                    logger.info(
                        `✅ [PROD] Sent level-${currentLevel} nudge to user ${goal.userId} for goal ${goalDoc.id} (${daysSinceLastSession} days inactive)`
                    );
                } catch (notifError) {
                    logger.error(
                        `❌ [PROD] Failed to create notification for goal ${goalDoc.id}:`,
                        notifError
                    );
                }
            }

            logger.info(
                `✨ [PROD] Inactivity nudges check complete. Sent ${notificationsSent} notification(s).`
            );
        } catch (error) {
            logger.error("❌ [PROD] Error in sendInactivityNudges:", error);
        }
    }
);
