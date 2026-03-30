import * as functions from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Returns the ISO 8601 week number for a given date.
 * ISO 8601: week 1 is the week containing the first Thursday of the year.
 * This replaces the previous non-standard calculation which used getDay()+1
 * and produced incorrect week numbers near year boundaries.
 */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // treat Sunday (0) as 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // shift to Thursday of the same ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Cloud Function: sendWeeklyRecap_Test
 * Scheduled function to send weekly recap notifications to users with active goals
 * Runs every Sunday at 7 PM Europe/Lisbon time
 *
 * Aggregates weekly performance across all active goals and sends personalized recap:
 * - Total sessions completed vs required
 * - Number of goals on track
 * - Progress on primary goal (most sessions remaining)
 * - Motivational message based on performance
 */
export const sendWeeklyRecap_Test = functions.onSchedule(
    {
        schedule: "0 19 * * 0", // Every Sunday at 7 PM
        timeZone: "Europe/Lisbon",
        region: "europe-west1",
    },
    async (event) => {
        try {
            logger.info("🔍 [TEST] Starting weekly recap generation...");

            // Compute ISO 8601 week key for idempotency guard.
            // Uses getISOWeekNumber() which correctly handles year-boundary weeks
            // (e.g. Dec 31 may belong to week 1 of the next year under ISO 8601).
            const now = new Date();
            const isoWeek = getISOWeekNumber(now);
            // Use the ISO year (from the Thursday of the week, not necessarily now.getFullYear())
            const isoYearDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
            const dayNum = isoYearDate.getUTCDay() || 7;
            isoYearDate.setUTCDate(isoYearDate.getUTCDate() + 4 - dayNum);
            const isoYear = isoYearDate.getUTCFullYear();
            const weekKey = `${isoYear}-W${isoWeek}`;

            logger.info(`📅 [TEST] Week key: ${weekKey}`);

            // Get test db from shared index (ernitclone2 database)
            const db = require("../index").db;

            // Paginated fetch of all active goals (not completed), grouped by userId
            const PAGE_SIZE = 500;
            const userGoalsMap = new Map<string, any[]>();
            let lastDoc: FirebaseFirestore.DocumentSnapshot | undefined;
            let totalGoalsFetched = 0;

            while (true) {
                let goalsQuery = db
                    .collection("goals")
                    .where("isCompleted", "==", false)
                    .orderBy(admin.firestore.FieldPath.documentId())
                    .limit(PAGE_SIZE);

                if (lastDoc) {
                    goalsQuery = goalsQuery.startAfter(lastDoc);
                }

                const goalsSnap = await goalsQuery.get();
                if (goalsSnap.empty) break;

                for (const goalDoc of goalsSnap.docs) {
                    const goalData = goalDoc.data() as Record<string, any>;
                    const goal: Record<string, any> = { id: goalDoc.id, _ref: goalDoc.ref, ...goalData };
                    const userId = goalData.userId as string;

                    if (!userGoalsMap.has(userId)) {
                        userGoalsMap.set(userId, []);
                    }
                    userGoalsMap.get(userId)!.push(goal);
                }

                totalGoalsFetched += goalsSnap.docs.length;

                if (goalsSnap.docs.length < PAGE_SIZE) break;
                lastDoc = goalsSnap.docs[goalsSnap.docs.length - 1];
            }

            logger.info(`📊 [TEST] Fetched ${totalGoalsFetched} active goals across all users`);
            logger.info(`👥 [TEST] Processing recaps for ${userGoalsMap.size} users`);

            let recapsSent = 0;

            for (const [userId, goals] of userGoalsMap) {
                try {
                    // Aggregate across all active goals
                    let totalSessionsDone = 0;
                    let totalSessionsRequired = 0;
                    let goalsOnTrack = 0;
                    const totalGoals = goals.length;

                    for (const goal of goals) {
                        const weeklyCount = goal.weeklyCount || 0;
                        const sessionsPerWeek = goal.sessionsPerWeek || 0;

                        totalSessionsDone += weeklyCount;
                        totalSessionsRequired += sessionsPerWeek;

                        if (weeklyCount >= sessionsPerWeek) {
                            goalsOnTrack++;
                        }
                    }

                    // Find primary goal (most sessions remaining)
                    let primaryGoal = goals[0];
                    let maxSessionsRemaining = 0;

                    for (const goal of goals) {
                        const sessionsRemaining = (goal.sessionsPerWeek || 0) - (goal.weeklyCount || 0);
                        if (sessionsRemaining > maxSessionsRemaining) {
                            maxSessionsRemaining = sessionsRemaining;
                            primaryGoal = goal;
                        }
                    }

                    // Calculate primary goal progress (using snapshot values for message
                    // content — the transaction below will re-verify the guard field).
                    const currentCount = primaryGoal.currentCount || 0;
                    const targetCount = primaryGoal.targetCount || 1;
                    const sessionsPerWeek = primaryGoal.sessionsPerWeek || 0;
                    const weeklyCount = primaryGoal.weeklyCount || 0;

                    const totalCompletedSessions = (currentCount * sessionsPerWeek) + weeklyCount;
                    const totalSessions = targetCount * sessionsPerWeek;
                    const weeksRemaining = targetCount - currentCount;

                    // Extract category preference
                    const rewardCategory = primaryGoal.preferredRewardCategory as string | undefined;
                    const hasPledgedExperience = !!primaryGoal.pledgedExperience;

                    // Build personalized message
                    let message: string;

                    if (totalSessionsDone >= totalSessionsRequired && totalSessionsRequired > 0) {
                        // Hit all weekly targets
                        message = `Amazing week! You completed all ${totalSessionsDone} sessions across ${totalGoals} goal(s). Keep crushing it!`;
                        if (rewardCategory && !hasPledgedExperience) {
                            const categoryLabel = rewardCategory.charAt(0).toUpperCase() + rewardCategory.slice(1);
                            message += ` Check out ${categoryLabel} experiences as your dream reward!`;
                        }
                    } else if (totalSessionsDone > 0) {
                        // Hit some targets
                        message = `This week: ${totalSessionsDone}/${totalSessionsRequired} sessions. ${goalsOnTrack}/${totalGoals} goals on track. ${weeksRemaining} weeks to go on ${primaryGoal.title}!`;
                    } else {
                        // Hit none
                        message = `Fresh start tomorrow! You have ${totalGoals} active goal(s) waiting. One session is all it takes.`;
                    }

                    // Atomically guard + stamp using a transaction so two concurrent
                    // scheduler invocations cannot both pass the weekKey check and
                    // both send a duplicate recap notification.
                    const userRef = primaryGoal._ref as FirebaseFirestore.DocumentReference; // DocumentReference for the primary goal
                    let skipped = false;

                    await db.runTransaction(async (txn: FirebaseFirestore.Transaction) => {
                        const freshSnap = await txn.get(userRef);
                        if (!freshSnap.exists) {
                            skipped = true;
                            return;
                        }
                        const freshData = freshSnap.data()!;
                        if (freshData.lastWeeklyRecapWeek === weekKey) {
                            // Another invocation already sent the recap for this week.
                            skipped = true;
                            return;
                        }

                        // Stamp the guard field atomically — any concurrent transaction
                        // reading after this will see weekKey and skip.
                        txn.update(userRef, { lastWeeklyRecapWeek: weekKey });

                        // Write the notification inside the transaction so the stamp
                        // and the notification are committed in the same round-trip.
                        const notifRef = db.collection("notifications").doc();
                        txn.set(notifRef, {
                            userId: userId,
                            type: "weekly_recap",
                            title: "Your Weekly Recap",
                            message,
                            read: false,
                            clearable: true,
                            data: {
                                totalSessionsDone,
                                totalSessionsRequired,
                                goalsOnTrack,
                                totalGoals,
                                primaryGoalId: primaryGoal.id,
                                preferredRewardCategory: rewardCategory || null,
                            },
                            createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    });

                    if (skipped) {
                        logger.info(`⏭️ [TEST] Skipping user ${userId} — recap already sent for ${weekKey} (detected in transaction)`);
                        continue;
                    }

                    recapsSent++;
                    logger.info(
                        `✅ [TEST] Sent weekly recap to user ${userId} (${totalSessionsDone}/${totalSessionsRequired} sessions, ${goalsOnTrack}/${totalGoals} goals on track)`
                    );
                } catch (notifError: unknown) {
                    logger.error(
                        `❌ [TEST] Failed to create recap notification for user ${userId}:`,
                        notifError
                    );
                }
            }

            logger.info(
                `✨ [TEST] Weekly recap generation complete. Processed ${totalGoalsFetched} goals across ${userGoalsMap.size} users. Sent ${recapsSent} recap(s).`
            );
        } catch (error: unknown) {
            logger.error("❌ [TEST] Error in sendWeeklyRecap:", error);
        }
    }
);
