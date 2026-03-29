// GDPR: Clean up all user data on account deletion
import * as functionsV1 from "firebase-functions/v1";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue, WriteBatch } from "firebase-admin/firestore";
import type { UserRecord } from "firebase-admin/auth";

/**
 * Cloud Function: onUserDeleted
 * Fires on Firebase Auth user deletion.
 *
 * Performs the following GDPR cleanup steps:
 *  1. Anonymizes the users/{uid} document (preserves referential integrity).
 *  2. Soft-deletes all goals owned by the user.
 *  3. Removes bidirectional friendship entries.
 *  4. Deletes all notifications in the user's subcollection.
 *  5. Deletes all feed posts authored by the user.
 *
 * Batch writes are committed every BATCH_LIMIT operations to stay safely
 * below the Firestore 500-write-per-batch hard limit.
 */

const BATCH_LIMIT = 450;
const QUERY_LIMIT = 200;

/**
 * Commit the current batch and return a fresh one if writeCount reached BATCH_LIMIT.
 * Returns [newBatch, newCount].
 */
async function maybeCommit(
    db: FirebaseFirestore.Firestore,
    batch: WriteBatch,
    count: number
): Promise<[WriteBatch, number]> {
    if (count >= BATCH_LIMIT) {
        await batch.commit();
        return [db.batch(), 0];
    }
    return [batch, count];
}

export const onUserDeleted = functionsV1.auth.user().onDelete(async (user: UserRecord) => {
    const uid = user.uid;
    logger.info(`[onUserDeleted] Starting GDPR cleanup for uid=${uid}`);

    // Use getFirestore() directly to avoid circular require through index.ts
    const db = getFirestore();

    try {
        // ── Step 1: Anonymize the user document ──────────────────────────────
        // Do NOT delete — preserves referential integrity for givers' gift records.
        const userRef = db.collection("users").doc(uid);
        await userRef.update({
            displayName: "Deleted User",
            email: null,
            profileImageUrl: null,
            isDeleted: true,
            deletedAt: FieldValue.serverTimestamp(),
        });
        logger.info(`[onUserDeleted] Anonymized users/${uid}`);

        // ── Step 2: Soft-delete the user's goals ─────────────────────────────
        let goalBatch = db.batch();
        let goalCount = 0;
        let goalCursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
        let goalsDone = false;

        while (!goalsDone) {
            let goalQuery = db
                .collection("goals")
                .where("userId", "==", uid)
                .limit(QUERY_LIMIT);

            if (goalCursor) {
                goalQuery = goalQuery.startAfter(goalCursor);
            }

            const goalSnap = await goalQuery.get();

            if (goalSnap.empty) {
                goalsDone = true;
                break;
            }

            for (const doc of goalSnap.docs) {
                goalBatch.update(doc.ref, {
                    isDeleted: true,
                    deletedAt: FieldValue.serverTimestamp(),
                });
                goalCount++;
                [goalBatch, goalCount] = await maybeCommit(db, goalBatch, goalCount);
            }

            if (goalSnap.docs.length < QUERY_LIMIT) {
                goalsDone = true;
            } else {
                goalCursor = goalSnap.docs[goalSnap.docs.length - 1];
            }
        }

        if (goalCount > 0) {
            await goalBatch.commit();
        }
        logger.info(`[onUserDeleted] Soft-deleted goals for uid=${uid}`);

        // ── Step 3: Remove bidirectional friendships ──────────────────────────
        // a) For each friend of the user, delete the reverse entry: users/{friendId}/friends/{uid}
        // b) Then delete all of users/{uid}/friends/{*}
        let friendBatch = db.batch();
        let friendCount = 0;
        let friendCursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
        let friendsDone = false;

        while (!friendsDone) {
            let friendQuery = db
                .collection("users")
                .doc(uid)
                .collection("friends")
                .limit(QUERY_LIMIT) as FirebaseFirestore.Query;

            if (friendCursor) {
                friendQuery = friendQuery.startAfter(friendCursor);
            }

            const friendSnap = await friendQuery.get();

            if (friendSnap.empty) {
                friendsDone = true;
                break;
            }

            for (const doc of friendSnap.docs) {
                const friendId = doc.id;

                // Delete the reverse entry: users/{friendId}/friends/{uid}
                const reverseRef = db
                    .collection("users")
                    .doc(friendId)
                    .collection("friends")
                    .doc(uid);
                friendBatch.delete(reverseRef);
                friendCount++;
                [friendBatch, friendCount] = await maybeCommit(db, friendBatch, friendCount);

                // Delete this user's friend entry: users/{uid}/friends/{friendId}
                friendBatch.delete(doc.ref);
                friendCount++;
                [friendBatch, friendCount] = await maybeCommit(db, friendBatch, friendCount);
            }

            if (friendSnap.docs.length < QUERY_LIMIT) {
                friendsDone = true;
            } else {
                friendCursor = friendSnap.docs[friendSnap.docs.length - 1];
            }
        }

        if (friendCount > 0) {
            await friendBatch.commit();
        }
        logger.info(`[onUserDeleted] Removed friendships for uid=${uid}`);

        // ── Step 4: Delete user notifications subcollection ──────────────────
        let notifBatch = db.batch();
        let notifCount = 0;
        let notifCursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
        let notifsDone = false;

        while (!notifsDone) {
            let notifQuery = db
                .collection("users")
                .doc(uid)
                .collection("notifications")
                .limit(QUERY_LIMIT) as FirebaseFirestore.Query;

            if (notifCursor) {
                notifQuery = notifQuery.startAfter(notifCursor);
            }

            const notifSnap = await notifQuery.get();

            if (notifSnap.empty) {
                notifsDone = true;
                break;
            }

            for (const doc of notifSnap.docs) {
                notifBatch.delete(doc.ref);
                notifCount++;
                [notifBatch, notifCount] = await maybeCommit(db, notifBatch, notifCount);
            }

            if (notifSnap.docs.length < QUERY_LIMIT) {
                notifsDone = true;
            } else {
                notifCursor = notifSnap.docs[notifSnap.docs.length - 1];
            }
        }

        if (notifCount > 0) {
            await notifBatch.commit();
        }
        logger.info(`[onUserDeleted] Deleted notifications for uid=${uid}`);

        // ── Step 5: Delete user meta subcollection docs ───────────────────────
        let metaBatch = db.batch();
        let metaCount = 0;

        const metaSnap = await db
            .collection("users")
            .doc(uid)
            .collection("meta")
            .limit(QUERY_LIMIT)
            .get();

        for (const doc of metaSnap.docs) {
            metaBatch.delete(doc.ref);
            metaCount++;
            [metaBatch, metaCount] = await maybeCommit(db, metaBatch, metaCount);
        }

        if (metaCount > 0) {
            await metaBatch.commit();
        }
        logger.info(`[onUserDeleted] Deleted meta subcollection for uid=${uid}`);

        // ── Step 6: Remove the user's feed posts ─────────────────────────────
        let feedBatch = db.batch();
        let feedCount = 0;
        let feedCursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
        let feedDone = false;

        while (!feedDone) {
            let feedQuery = db
                .collection("feed")
                .where("userId", "==", uid)
                .limit(QUERY_LIMIT);

            if (feedCursor) {
                feedQuery = feedQuery.startAfter(feedCursor);
            }

            const feedSnap = await feedQuery.get();

            if (feedSnap.empty) {
                feedDone = true;
                break;
            }

            for (const doc of feedSnap.docs) {
                feedBatch.delete(doc.ref);
                feedCount++;
                [feedBatch, feedCount] = await maybeCommit(db, feedBatch, feedCount);
            }

            if (feedSnap.docs.length < QUERY_LIMIT) {
                feedDone = true;
            } else {
                feedCursor = feedSnap.docs[feedSnap.docs.length - 1];
            }
        }

        if (feedCount > 0) {
            await feedBatch.commit();
        }
        logger.info(`[onUserDeleted] Deleted feed posts for uid=${uid}`);

        logger.info(`[onUserDeleted] GDPR cleanup complete for uid=${uid}`);
        return null;
    } catch (error: unknown) {
        logger.error(`[onUserDeleted] GDPR cleanup failed for uid=${uid}:`, error);
        return null;
    }
});
