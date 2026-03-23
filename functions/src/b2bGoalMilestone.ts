import { onDocumentUpdated } from "firebase-functions/v2/firestore";
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
    }> = [];

    // Goal completed
    if (!before.isCompleted && after.isCompleted) {
      posts.push({
        type: "goal_completed",
        content: `${userName} completed "${title}"! 🎉`,
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
      });
    }

    // Week completed (currentCount increased)
    const beforeCount = before.currentCount || 0;
    const afterCount = after.currentCount || 0;
    if (afterCount > beforeCount && !after.isCompleted) {
      posts.push({
        type: "goal_progress",
        content: `${userName} completed week ${afterCount}/${after.targetCount} on "${title}" 💪`,
      });
    }

    // Batch-write all feed posts
    if (posts.length > 0) {
      const batch = b2bDb.batch();
      for (const post of posts) {
        const ref = b2bDb.collection("feedPosts").doc();
        batch.set(ref, {
          companyId,
          userId,
          userName,
          type: post.type,
          content: post.content,
          goalId: event.params.goalId,
          reactions: {},
          commentCount: 0,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
  }
);
