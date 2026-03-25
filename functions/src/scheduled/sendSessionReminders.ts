import * as functions from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/**
 * Cloud Function: sendSessionReminders
 * Scheduled function to send session reminders to users
 * Runs every hour to check if users need reminders based on their timezone
 *
 * Logic:
 * - Checks users with reminderEnabled == true
 * - Converts user's reminderTime to their timezone
 * - Sends reminder if current hour matches their reminder hour
 * - Only sends once per day (checks lastReminderSentDate)
 * - Only sends if user has incomplete sessions today or hasn't met weekly target
 */
export const sendSessionReminders = functions.onSchedule(
    {
        schedule: "0 * * * *", // Every hour
        timeZone: "Europe/Lisbon",
        region: "europe-west1",
    },
    async (event) => {
        try {
            logger.info("🔔 [PROD] Starting session reminders check...");

            // Import db from index.ts (production database)
            const db = require("../index").dbProd;
            const now = new Date();

            // Get all users with reminders enabled
            const usersSnap = await db
                .collection("users")
                .where("profile.reminderEnabled", "==", true)
                .get();

            logger.info(`📊 [PROD] Found ${usersSnap.size} users with reminders enabled`);

            let notificationsSent = 0;

            for (const userDoc of usersSnap.docs) {
                const user = userDoc.data();
                const userTimezone = user.profile?.timezone || "Europe/Lisbon";
                const userReminderTime = user.profile?.reminderTime || "19:00";

                // Get current hour in user's timezone
                const currentHourInUserTz = parseInt(
                    new Intl.DateTimeFormat('en-US', {
                        timeZone: userTimezone,
                        hour: 'numeric',
                        hour12: false
                    }).format(now)
                );
                const reminderHour = parseInt(userReminderTime.split(':')[0]);

                // Check if current hour matches user's reminder hour
                if (currentHourInUserTz !== reminderHour) {
                    logger.info(
                        `⏭️ [PROD] User ${userDoc.id}: Not their reminder hour (current: ${currentHourInUserTz}, reminder: ${reminderHour})`
                    );
                    continue;
                }

                // Compute today's date in the user's own timezone for dedup key
                const userTz = user.profile?.timezone || 'UTC';
                const todayInUserTz = new Intl.DateTimeFormat('en-CA', { timeZone: userTz }).format(now);

                // Check if we already sent a reminder today
                if (user.lastReminderSentDate === todayInUserTz) {
                    logger.info(
                        `⏭️ [PROD] User ${userDoc.id}: Already sent reminder today`
                    );
                    continue;
                }

                // Get user's active goals
                const goalsSnap = await db
                    .collection("goals")
                    .where("userId", "==", userDoc.id)
                    .where("isCompleted", "==", false)
                    .get();

                if (goalsSnap.empty) {
                    logger.info(
                        `⏭️ [PROD] User ${userDoc.id}: No active goals`
                    );
                    continue;
                }

                // Check if user needs a reminder
                let needsReminder = false;
                interface BehindGoal {
                    id: string;
                    title: string;
                    goalDescription: string;
                    weeklyCount: number;
                    sessionsPerWeek: number;
                }
                let mostBehindGoal: BehindGoal | null = null;
                let lowestRatio = 1;
                let mostBehindDaysLeft = 7;

                for (const goalDoc of goalsSnap.docs) {
                    const goal = goalDoc.data();
                    const weeklyLogDates = goal.weeklyLogDates || [];
                    const weeklyCount = goal.weeklyCount || 0;
                    const sessionsPerWeek = goal.sessionsPerWeek || 3;

                    // Check if session logged today (in the user's local timezone)
                    const sessionLoggedToday = weeklyLogDates.includes(todayInUserTz);

                    // Check if weekly target not met
                    const weeklyTargetNotMet = weeklyCount < sessionsPerWeek;

                    // Calculate days left in this goal's anchored week
                    let daysLeft = 7;
                    if (goal.weekStartAt) {
                        const weekStart = goal.weekStartAt.toDate ? goal.weekStartAt.toDate() : new Date(goal.weekStartAt);
                        const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
                        daysLeft = Math.max(0, Math.ceil((weekEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                    }

                    // If either condition is true, user needs reminder
                    if (!sessionLoggedToday || weeklyTargetNotMet) {
                        needsReminder = true;

                        // Calculate how "behind" this goal is
                        const ratio = weeklyCount / sessionsPerWeek;
                        if (ratio < lowestRatio) {
                            lowestRatio = ratio;
                            mostBehindGoal = {
                                id: goalDoc.id,
                                title: goal.title,
                                goalDescription: goal.description || goal.title || 'your goal',
                                weeklyCount,
                                sessionsPerWeek,
                            };
                            mostBehindDaysLeft = daysLeft;
                        }
                    }
                }

                if (!needsReminder) {
                    logger.info(
                        `⏭️ [PROD] User ${userDoc.id}: All sessions done today and weekly targets met`
                    );
                    continue;
                }

                if (!mostBehindGoal) {
                    logger.info(
                        `⚠️ [PROD] User ${userDoc.id}: Needs reminder but no goal found`
                    );
                    continue;
                }

                // Build urgency-aware title and message with streak context
                const sessionsRemaining = mostBehindGoal.sessionsPerWeek - mostBehindGoal.weeklyCount;
                const streak = user.sessionStreak || 0;
                const hasStreak = streak >= 3; // Only mention streak if meaningful (3+)
                let title: string;
                let message: string;

                if (mostBehindDaysLeft <= 1 && sessionsRemaining > 0) {
                    // Critical: last day, still behind
                    if (hasStreak) {
                        title = `Your ${streak}-session streak is at risk!`;
                        message = `Last day — ${sessionsRemaining} session${sessionsRemaining > 1 ? 's' : ''} left for ${mostBehindGoal.goalDescription}. Don't break your streak!`;
                    } else {
                        title = "Last day!";
                        message = `${sessionsRemaining} session${sessionsRemaining > 1 ? 's' : ''} left to complete your week for ${mostBehindGoal.goalDescription}`;
                    }
                } else if (mostBehindDaysLeft <= 3 && sessionsRemaining > 0) {
                    // Urgent: 2-3 days left, still behind
                    if (hasStreak) {
                        title = `${mostBehindDaysLeft} day${mostBehindDaysLeft > 1 ? 's' : ''} left!`;
                        message = `Keep your ${streak}-session streak alive — ${sessionsRemaining} more session${sessionsRemaining > 1 ? 's' : ''} for ${mostBehindGoal.goalDescription}!`;
                    } else {
                        title = `${mostBehindDaysLeft} day${mostBehindDaysLeft > 1 ? 's' : ''} left!`;
                        message = `You still need ${sessionsRemaining} more session${sessionsRemaining > 1 ? 's' : ''} for ${mostBehindGoal.goalDescription} — you can do it!`;
                    }
                } else {
                    // Normal: plenty of time or on track
                    if (hasStreak) {
                        title = "Time for your session!";
                        message = `You're on a ${streak}-session streak! Your ${mostBehindGoal.goalDescription} goal is ${mostBehindGoal.weeklyCount}/${mostBehindGoal.sessionsPerWeek} this week`;
                    } else {
                        title = "Time for your session!";
                        message = `Your ${mostBehindGoal.goalDescription} goal is waiting — you're ${mostBehindGoal.weeklyCount}/${mostBehindGoal.sessionsPerWeek} sessions this week`;
                    }
                }

                // Create notification + stamp dedup atomically
                try {
                    const batch = db.batch();
                    batch.set(db.collection("notifications").doc(), {
                        userId: userDoc.id,
                        type: "session_reminder",
                        title,
                        message,
                        read: false,
                        clearable: true,
                        data: {
                            goalId: mostBehindGoal.id,
                            weeklyCount: mostBehindGoal.weeklyCount,
                            sessionsPerWeek: mostBehindGoal.sessionsPerWeek,
                            daysLeft: mostBehindDaysLeft,
                            sessionsRemaining,
                            sessionStreak: streak,
                        },
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    batch.update(db.collection("users").doc(userDoc.id), {
                        lastReminderSentDate: todayInUserTz,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    await batch.commit();

                    notificationsSent++;
                    logger.info(
                        `✅ [PROD] Sent reminder to user ${userDoc.id} for goal ${mostBehindGoal.id} (${mostBehindGoal.weeklyCount}/${mostBehindGoal.sessionsPerWeek})`
                    );
                } catch (notifError) {
                    logger.error(
                        `❌ [PROD] Failed to create notification for user ${userDoc.id}:`,
                        notifError
                    );
                }
            }

            logger.info(
                `✨ [PROD] Session reminders check complete. Sent ${notificationsSent} notification(s).`
            );
        } catch (error) {
            logger.error("❌ [PROD] Error in sendSessionReminders:", error);
        }
    }
);
