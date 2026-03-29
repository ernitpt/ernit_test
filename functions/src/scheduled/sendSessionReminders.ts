import * as functions from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

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

            // Get production db directly (avoids circular require("../index"))
            const db = getFirestore();
            const now = new Date();

            // Paginated fetch of all users with reminders enabled
            const PAGE_SIZE = 500;
            const allUserDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
            let usersLastDoc: FirebaseFirestore.DocumentSnapshot | undefined;

            while (true) {
                let usersQuery = db
                    .collection("users")
                    .where("profile.reminderEnabled", "==", true)
                    .orderBy(admin.firestore.FieldPath.documentId())
                    .limit(PAGE_SIZE);

                if (usersLastDoc) {
                    usersQuery = usersQuery.startAfter(usersLastDoc);
                }

                const usersPage = await usersQuery.get();
                if (usersPage.empty) break;

                allUserDocs.push(...usersPage.docs);

                if (usersPage.docs.length < PAGE_SIZE) break;
                usersLastDoc = usersPage.docs[usersPage.docs.length - 1];
            }

            logger.info(`📊 [PROD] Found ${allUserDocs.length} users with reminders enabled`);

            // Paginated prefetch of all active goals in a single pass, grouped by userId
            // in memory to eliminate the N+1 pattern (one query per user in the loop).
            const goalsByUser = new Map<string, FirebaseFirestore.DocumentData[]>();
            let goalsLastDoc: FirebaseFirestore.DocumentSnapshot | undefined;
            let totalGoalsFetched = 0;

            while (true) {
                let goalsQuery = db
                    .collection('goals')
                    .where('isCompleted', '==', false)
                    .orderBy(admin.firestore.FieldPath.documentId())
                    .limit(PAGE_SIZE);

                if (goalsLastDoc) {
                    goalsQuery = goalsQuery.startAfter(goalsLastDoc);
                }

                const goalsPage = await goalsQuery.get();
                if (goalsPage.empty) break;

                goalsPage.docs.forEach(doc => {
                    const data = doc.data();
                    const uid = data.userId as string;
                    if (!goalsByUser.has(uid)) goalsByUser.set(uid, []);
                    goalsByUser.get(uid)!.push({ id: doc.id, ...data });
                });

                totalGoalsFetched += goalsPage.docs.length;

                if (goalsPage.docs.length < PAGE_SIZE) break;
                goalsLastDoc = goalsPage.docs[goalsPage.docs.length - 1];
            }

            logger.info(`📊 [PROD] Prefetched ${totalGoalsFetched} active goals across all users`);

            let notificationsSent = 0;

            for (const userDoc of allUserDocs) {
                const user = userDoc.data();
                const userTimezone = user.profile?.timezone || "Europe/Lisbon";
                const userReminderTime = user.profile?.reminderTime || "19:00";

                // Get current hour in user's timezone.
                // Wrap in try/catch: an invalid timezone string throws a RangeError
                // in Intl.DateTimeFormat and would abort processing for all subsequent users.
                let currentHourInUserTz: number;
                try {
                    currentHourInUserTz = parseInt(
                        new Intl.DateTimeFormat('en-US', {
                            timeZone: userTimezone,
                            hour: 'numeric',
                            hour12: false
                        }).format(now)
                    );
                } catch (tzError: unknown) {
                    logger.warn(
                        `⚠️ [PROD] Invalid timezone "${userTimezone}" for user ${userDoc.id}, falling back to UTC`
                    );
                    currentHourInUserTz = now.getUTCHours();
                }
                const reminderHour = parseInt(userReminderTime.split(':')[0]);

                // Check if current hour matches user's reminder hour
                if (currentHourInUserTz !== reminderHour) {
                    logger.info(
                        `⏭️ [PROD] User ${userDoc.id}: Not their reminder hour (current: ${currentHourInUserTz}, reminder: ${reminderHour})`
                    );
                    continue;
                }

                // Compute today's date in the user's own timezone for dedup key.
                // Guard against invalid timezone strings to avoid crashing the entire run.
                const userTz = user.profile?.timezone || 'UTC';
                let todayInUserTz: string;
                try {
                    todayInUserTz = new Intl.DateTimeFormat('en-CA', { timeZone: userTz }).format(now);
                } catch (tzError2: unknown) {
                    logger.warn(
                        `⚠️ [PROD] Invalid timezone "${userTz}" for user ${userDoc.id} (dedup key), falling back to UTC date`
                    );
                    todayInUserTz = now.toISOString().split('T')[0];
                }

                // Check if we already sent a reminder today
                if (user.lastReminderSentDate === todayInUserTz) {
                    logger.info(
                        `⏭️ [PROD] User ${userDoc.id}: Already sent reminder today`
                    );
                    continue;
                }

                // Get user's active goals from the prefetched in-memory map
                const userGoals = goalsByUser.get(userDoc.id) ?? [];

                if (userGoals.length === 0) {
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

                for (const goal of userGoals) {
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
                                id: goal.id,
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

                // Create notification + stamp dedup atomically inside a transaction.
                // Re-read the user document inside the transaction to prevent a race
                // where two concurrent scheduler invocations both pass the outer dedup
                // check before either has written lastReminderSentDate.
                try {
                    const userRef = db.collection("users").doc(userDoc.id);
                    const notifRef = db.collection("notifications").doc();
                    let alreadySent = false;

                    await db.runTransaction(async (tx) => {
                        const freshUserSnap = await tx.get(userRef);
                        if (!freshUserSnap.exists) return;

                        const freshUser = freshUserSnap.data()!;
                        if (freshUser.lastReminderSentDate === todayInUserTz) {
                            alreadySent = true;
                            return;
                        }

                        tx.set(notifRef, {
                            userId: userDoc.id,
                            type: "session_reminder",
                            title,
                            message,
                            read: false,
                            clearable: true,
                            data: {
                                goalId: mostBehindGoal!.id,
                                weeklyCount: mostBehindGoal!.weeklyCount,
                                sessionsPerWeek: mostBehindGoal!.sessionsPerWeek,
                                daysLeft: mostBehindDaysLeft,
                                sessionsRemaining,
                                sessionStreak: streak,
                            },
                            createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        tx.update(userRef, {
                            lastReminderSentDate: todayInUserTz,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    });

                    if (alreadySent) {
                        logger.info(
                            `⏭️ [PROD] User ${userDoc.id}: Reminder already sent today (caught by transaction re-check)`
                        );
                        continue;
                    }

                    notificationsSent++;
                    logger.info(
                        `✅ [PROD] Sent reminder to user ${userDoc.id} for goal ${mostBehindGoal.id} (${mostBehindGoal.weeklyCount}/${mostBehindGoal.sessionsPerWeek})`
                    );
                } catch (notifError: unknown) {
                    logger.error(
                        `❌ [PROD] Failed to create notification for user ${userDoc.id}:`,
                        notifError
                    );
                }
            }

            logger.info(
                `✨ [PROD] Session reminders check complete. Processed ${allUserDocs.length} users, ${totalGoalsFetched} goals. Sent ${notificationsSent} notification(s).`
            );
        } catch (error: unknown) {
            logger.error("❌ [PROD] Error in sendSessionReminders:", error);
        }
    }
);
