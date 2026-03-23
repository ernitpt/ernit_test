import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * B2B Cloud Function: Log a session for an employee's goal.
 * Increments weekly count, updates streak, and checks for week/goal completion.
 * All data in ernitxfi database.
 */

const getB2bDb = () => getFirestore("ernitxfi");

export const b2bLogSession = onCall(
  {
    region: "europe-west1",
    maxInstances: 10,
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const uid = request.auth.uid;
    const { goalId } = request.data;

    if (!goalId || typeof goalId !== "string") {
      throw new HttpsError("invalid-argument", "goalId is required.");
    }

    const b2bDb = getB2bDb();
    const goalRef = b2bDb.collection("goals").doc(goalId);
    const goalDoc = await goalRef.get();

    if (!goalDoc.exists) {
      throw new HttpsError("not-found", "Goal not found.");
    }

    const goal = goalDoc.data()!;

    // Verify ownership
    if (goal.userId !== uid) {
      throw new HttpsError("permission-denied", "This goal does not belong to you.");
    }

    if (!goal.isActive || goal.isCompleted) {
      throw new HttpsError("failed-precondition", "This goal is no longer active.");
    }

    // Check if already logged today
    const today = new Date().toISOString().split("T")[0];
    if (goal.weeklyLogDates && goal.weeklyLogDates.includes(today)) {
      throw new HttpsError("already-exists", "Session already logged for today.");
    }

    // Calculate week boundaries
    const weekStartMs = goal.weekStartAt?.toMillis() || Date.now();
    const nowMs = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weekElapsed = nowMs - weekStartMs >= weekMs;

    let newWeeklyCount = (goal.weeklyCount || 0) + 1;
    let newCurrentCount = goal.currentCount || 0;
    let newSessionStreak = (goal.sessionStreak || 0) + 1;
    let newLongestStreak = goal.longestStreak || 0;
    let isCompleted = false;

    const updates: Record<string, unknown> = {
      weeklyLogDates: FieldValue.arrayUnion(today),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Check if we need to roll over to a new week
    if (weekElapsed) {
      // Check if previous week met the sessions requirement
      const prevWeekMet = goal.weeklyCount >= goal.sessionsPerWeek;
      if (prevWeekMet) {
        newCurrentCount += 1;
      } else {
        // Broke the streak
        newSessionStreak = 1;
      }

      // Reset for new week
      newWeeklyCount = 1;
      updates.weekStartAt = FieldValue.serverTimestamp();
      updates.weeklyLogDates = [today]; // reset log dates for new week
    }

    // Check if this session completes the current week
    if (newWeeklyCount >= goal.sessionsPerWeek && !weekElapsed) {
      // Week is complete! Increment currentCount
      newCurrentCount += 1;
    }

    // Check if goal is complete
    if (newCurrentCount >= goal.targetCount) {
      isCompleted = true;
      updates.isCompleted = true;
      updates.isActive = false;
    }

    // Update streak records
    if (newSessionStreak > newLongestStreak) {
      newLongestStreak = newSessionStreak;
    }

    updates.weeklyCount = newWeeklyCount;
    updates.currentCount = newCurrentCount;
    updates.sessionStreak = newSessionStreak;
    updates.longestStreak = newLongestStreak;

    await goalRef.update(updates);

    // If completed, increment completedCount on KPI
    if (isCompleted && goal.kpiId) {
      await b2bDb.collection("companyKPIs").doc(goal.kpiId).update({
        completedCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      weeklyCount: newWeeklyCount,
      currentCount: newCurrentCount,
      sessionStreak: newSessionStreak,
      longestStreak: newLongestStreak,
      isCompleted,
      message: isCompleted
        ? "Congratulations! Goal completed!"
        : `Session logged. ${newWeeklyCount}/${goal.sessionsPerWeek} this week.`,
    };
  }
);
