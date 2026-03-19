import * as functions from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

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
            console.log("🔍 [TEST] Starting weekly recap generation...");

            // Compute ISO week key for idempotency guard
            const now = new Date();
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            const weekNumber = Math.ceil(
                ((now.getTime() - startOfYear.getTime()) / 86400000 +
                    startOfYear.getDay() +
                    1) /
                    7
            );
            const weekKey = `${now.getFullYear()}-W${weekNumber}`;

            console.log(`📅 [TEST] Week key: ${weekKey}`);

            // Import db from index.ts (test database)
            const db = require("../index").db;

            // Get all active goals (not completed)
            const goalsSnap = await db
                .collection("goals")
                .where("isCompleted", "==", false)
                .get();

            console.log(`📊 [TEST] Found ${goalsSnap.size} active goals`);

            // Group goals by userId
            const userGoalsMap = new Map<string, any[]>();

            for (const goalDoc of goalsSnap.docs) {
                const goal = { id: goalDoc.id, _ref: goalDoc.ref, ...goalDoc.data() };
                const userId = goal.userId;

                if (!userGoalsMap.has(userId)) {
                    userGoalsMap.set(userId, []);
                }
                userGoalsMap.get(userId)!.push(goal);
            }

            console.log(`👥 [TEST] Processing recaps for ${userGoalsMap.size} users`);

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

                    // Idempotency guard: skip if this user already received a recap for this week.
                    // Must check primaryGoal (same doc that gets stamped below) to be consistent.
                    if (primaryGoal?.lastWeeklyRecapWeek === weekKey) {
                        console.log(`⏭️ [TEST] Skipping user ${userId} — recap already sent for ${weekKey}`);
                        continue;
                    }

                    // Calculate primary goal progress
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

                    // Create notification and stamp idempotency key atomically
                    const batch = db.batch();

                    const notifRef = db.collection("notifications").doc();
                    batch.set(notifRef, {
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

                    // Stamp the primary goal so this week's recap is not sent again
                    batch.update(primaryGoal._ref, { lastWeeklyRecapWeek: weekKey });

                    await batch.commit();

                    recapsSent++;
                    console.log(
                        `✅ [TEST] Sent weekly recap to user ${userId} (${totalSessionsDone}/${totalSessionsRequired} sessions, ${goalsOnTrack}/${totalGoals} goals on track)`
                    );
                } catch (notifError) {
                    console.error(
                        `❌ [TEST] Failed to create recap notification for user ${userId}:`,
                        notifError
                    );
                }
            }

            console.log(
                `✨ [TEST] Weekly recap generation complete. Sent ${recapsSent} recap(s).`
            );
        } catch (error) {
            console.error("❌ [TEST] Error in sendWeeklyRecap:", error);
        }
    }
);
