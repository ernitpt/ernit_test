import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * B2B Firestore trigger: Auto-post to team feed when goal milestones are hit.
 * Triggers on goal updates in the ernitxfi database.
 * Posts events: goal_completed, streak_milestone (every 5 sessions).
 */

const getB2bDb = () => getFirestore("ernitxfi");

export const b2bGoalMilestone = onDocumentUpdated(
  {
    document: "goals/{goalId}",
    database: "ernitxfi",
    region: "europe-west1",
  },
  async (event) => {
    if (!event.data) return;

    const before = event.data.before.data();
    const after = event.data.after.data();

    if (!before || !after) return;

    const b2bDb = getB2bDb();
    const { companyId, userId, title } = after;

    // Null guards: skip silently if required fields are missing on the document
    if (!companyId || !userId) {
      return;
    }

    // Get user display name
    let userName = "Team member";
    try {
      const userDoc = await b2bDb.collection("users").doc(userId).get();
      if (userDoc.exists) {
        userName = userDoc.data()?.displayName || userName;
      }
    } catch {
      // Fallback to default name
    }

    const posts: Array<{
      type: string;
      content: string;
      milestoneType: string;
    }> = [];

    const goalId = event.params.goalId;

    // Goal completed
    if (!before.isCompleted && after.isCompleted) {
      posts.push({
        type: "goal_completed",
        content: `${userName} completed "${title}"! 🎉`,
        milestoneType: "goal_completed",
      });
    }

    // Streak milestone (every 5 sessions)
    const beforeStreak = before.sessionStreak || 0;
    const afterStreak = after.sessionStreak || 0;
    if (
      afterStreak > beforeStreak &&
      afterStreak >= 5 &&
      afterStreak % 5 === 0
    ) {
      posts.push({
        type: "streak_milestone",
        content: `${userName} hit a ${afterStreak}-session streak on "${title}"! 🔥`,
        milestoneType: `streak_${afterStreak}`,
      });
    }

    // Week completed (currentCount increased)
    const beforeCount = before.currentCount || 0;
    const afterCount = after.currentCount || 0;
    if (afterCount > beforeCount && !after.isCompleted) {
      posts.push({
        type: "goal_progress",
        content: `${userName} completed week ${afterCount}/${after.targetCount} on "${title}" 💪`,
        milestoneType: `week_${afterCount}`,
      });
    }

    // Batch-write all feed posts using deterministic document IDs for idempotency.
    // If this trigger fires more than once for the same event (e.g., on retry), the
    // set() call on an existing doc is a no-op because the data is identical and
    // Firestore's create-or-overwrite semantics ensure the feed post is written exactly once.
    if (posts.length > 0) {
      const batch = b2bDb.batch();
      for (const post of posts) {
        // Deterministic ID: milestone_<goalId>_<milestoneType> — prevents duplicate feed posts on retry
        const feedPostId = `milestone_${goalId}_${post.milestoneType}`;
        const ref = b2bDb.collection("feedPosts").doc(feedPostId);
        batch.set(ref, {
          companyId,
          userId,
          userName,
          type: post.type,
          content: post.content,
          goalId,
          reactions: {},
          commentCount: 0,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      try {
        await batch.commit();
      } catch (commitErr: unknown) {
        logger.error(`[b2bGoalMilestone] batch.commit() failed for goal ${goalId}:`, commitErr);
        throw commitErr;
      }
    }
  }
);
