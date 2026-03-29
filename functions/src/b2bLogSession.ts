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

    // Wrap the entire session log in a transaction to prevent double-session race:
    // without a transaction, two concurrent requests could both read the stale snapshot
    // (before today's date appears in weeklyLogDates) and both proceed to log.
    let newWeeklyCount = 0;
    let newCurrentCount = 0;
    let newSessionStreak = 0;
    let newLongestStreak = 0;
    let isCompleted = false;
    let kpiId: string | undefined;
    let sessionsPerWeek = 0;

    try {
      await b2bDb.runTransaction(async (transaction) => {
        const goalDoc = await transaction.get(goalRef);

        if (!goalDoc.exists) {
          throw new HttpsError("not-found", "Goal not found.");
        }

        const goal = goalDoc.data()!;

        // Verify ownership inside the transaction
        if (goal.userId !== uid) {
          throw new HttpsError("permission-denied", "This goal does not belong to you.");
        }

        if (!goal.isActive || goal.isCompleted) {
          throw new HttpsError("failed-precondition", "This goal is no longer active.");
        }

        // Check if already logged today (inside transaction to prevent double-log race)
        const today = new Date().toISOString().split("T")[0];
        if ((goal.weeklyLogDates || []).includes(today)) {
          throw new HttpsError("already-exists", "Session already logged for today.");
        }

        // Calculate week boundaries
        const weekStartMs = goal.weekStartAt?.toMillis() || Date.now();
        const nowMs = Date.now();
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        const weekElapsed = nowMs - weekStartMs >= weekMs;

        newWeeklyCount = (goal.weeklyCount || 0) + 1;
        newCurrentCount = goal.currentCount || 0;
        newSessionStreak = (goal.sessionStreak || 0) + 1;
        newLongestStreak = goal.longestStreak || 0;
        kpiId = goal.kpiId;
        sessionsPerWeek = goal.sessionsPerWeek || 0;

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
            // Broke the streak — reset to 1
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

        // Use FieldValue.increment(1) for simple +1 fields; explicit values for
        // fields that may be reset (weeklyCount, sessionStreak) on week rollover.
        updates.weeklyCount = newWeeklyCount;
        updates.currentCount = FieldValue.increment(newCurrentCount - (goal.currentCount || 0));
        updates.sessionStreak = newSessionStreak;
        updates.longestStreak = newLongestStreak;

        transaction.update(goalRef, updates);
      });
    } catch (err: unknown) {
      // Re-throw HttpsError (validation gates) directly; wrap other errors
      if (err instanceof HttpsError) {
        throw err;
      }
      throw new HttpsError("internal", "Failed to log session.");
    }

    // If completed, increment completedCount on KPI (outside transaction — non-critical)
    if (isCompleted && kpiId) {
      await b2bDb.collection("companyKPIs").doc(kpiId).update({
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
        : `Session logged. ${newWeeklyCount}/${sessionsPerWeek} this week.`,
    };
  }
);
