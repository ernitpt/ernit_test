import {
    collection,
    addDoc,
    query,
    where,
    getDocs,
    deleteDoc,
    doc,
    getDoc,
    Timestamp,
    orderBy,
    limit as firestoreLimit,
    runTransaction,
    increment,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Reaction, ReactionType } from '../types';
import { notificationService } from './NotificationService';
import { toDateSafe } from '../utils/GoalHelpers';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { analyticsService } from './AnalyticsService';
import { sanitizeText } from '../utils/sanitization';
class ReactionService {
    /**
     * Add or toggle a reaction on a post (atomic via transaction)
     * Accepts userProfileImageUrl to avoid extra Firestore read
     */
    async addReaction(
        postId: string,
        userId: string,
        userName: string,
        type: ReactionType,
        userProfileImageUrl?: string
    ): Promise<void> {
        try {
            const postRef = doc(db, 'feedPosts', postId);
            const reactionsCollection = collection(db, 'feedPosts', postId, 'reactions');

            // Track what happened for notification logic (outside transaction)
            let reactionAdded = false;
            let postOwnerId: string | null = null;

            await runTransaction(db, async (transaction) => {
                // 1. Read the post doc (for owner ID and count updates)
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists()) {
                    throw new AppError('POST_NOT_FOUND', 'Post not found', 'not_found');
                }
                postOwnerId = postDoc.data().userId;

                // 2. T2-2: Use deterministic doc ID for transactional read
                const reactionDocId = `${postId}_${userId}`;
                const reactionRef = doc(db, 'feedPosts', postId, 'reactions', reactionDocId);
                const existingDoc = await transaction.get(reactionRef);

                if (existingDoc.exists()) {
                    const existingType = existingDoc.data().type as ReactionType;

                    if (existingType === type) {
                        // Same type → toggle off (remove)
                        transaction.delete(reactionRef);
                        transaction.update(postRef, {
                            [`reactionCounts.${type}`]: increment(-1),
                        });
                        reactionAdded = false;
                        return;
                    }

                    // Different type → remove old, add new
                    transaction.delete(reactionRef);
                    transaction.update(postRef, {
                        [`reactionCounts.${existingType}`]: increment(-1),
                    });
                }

                // 3. Add new reaction with deterministic ID
                const newReactionRef = reactionRef;
                const reactionData: Record<string, unknown> = {
                    postId,
                    userId,
                    userName: sanitizeText(userName, 100),
                    type,
                    createdAt: Timestamp.now(),
                };

                if (userProfileImageUrl) {
                    reactionData.userProfileImageUrl = userProfileImageUrl;
                }

                transaction.set(newReactionRef, reactionData);
                transaction.update(postRef, {
                    [`reactionCounts.${type}`]: increment(1),
                });
                reactionAdded = true;
            });

            // Create notification outside transaction (fire-and-forget, non-critical)
            if (reactionAdded && postOwnerId && postOwnerId !== userId) {
                try {
                    await notificationService.createOrUpdatePostReactionNotification(
                        postOwnerId,
                        postId,
                        userId,
                        userName,
                        userProfileImageUrl,
                        type
                    );
                } catch (error: unknown) {
                    logger.warn('Could not create reaction notification:', error);
                }
            }

            // Track reaction event when a new reaction is added (not removed)
            if (reactionAdded) {
                analyticsService.trackEvent('feed_reaction', 'engagement', { postId, reactionType: type });
            }

            logger.log('✅ Reaction toggled');
        } catch (error: unknown) {
            logger.error('❌ Error toggling reaction:', error);
            throw error;
        }
    }

    /**
     * Remove a user's reaction from a post
     * Uses a deterministic doc ID and reads inside the transaction to avoid TOCTOU races.
     */
    async removeReaction(postId: string, userId: string): Promise<void> {
        try {
            const postRef = doc(db, 'feedPosts', postId);
            // Deterministic ID matches the pattern used in addReaction
            const reactionDocId = `${postId}_${userId}`;
            const reactionRef = doc(db, 'feedPosts', postId, 'reactions', reactionDocId);

            await runTransaction(db, async (transaction) => {
                const reactionSnap = await transaction.get(reactionRef);
                // Already deleted by a concurrent call — nothing to do
                if (!reactionSnap.exists()) return;

                const reactionType = reactionSnap.data().type as ReactionType;
                transaction.delete(reactionRef);
                transaction.update(postRef, {
                    [`reactionCounts.${reactionType}`]: increment(-1),
                });
            });

            logger.log('✅ Reaction removed');
        } catch (error: unknown) {
            logger.error('❌ Error removing reaction:', error);
            throw error;
        }
    }

    /**
     * Get all reactions for a post
     */
    async getReactions(postId: string): Promise<Reaction[]> {
        try {
            const reactionsCollection = collection(db, 'feedPosts', postId, 'reactions');
            const q = query(reactionsCollection, orderBy('createdAt', 'desc'), firestoreLimit(50));
            const snapshot = await getDocs(q);

            return snapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: toDateSafe(data.createdAt),
                } as Reaction;
            });
        } catch (error: unknown) {
            logger.error('❌ Error fetching reactions:', error);
            throw error;
        }
    }

    /**
     * Get a specific user's reaction on a post
     */
    async getUserReaction(postId: string, userId: string): Promise<Reaction | null> {
        try {
            const reactionsCollection = collection(db, 'feedPosts', postId, 'reactions');
            const q = query(reactionsCollection, where('userId', '==', userId), firestoreLimit(1));
            const snapshot = await getDocs(q);

            if (snapshot.empty) return null;

            const reactionDoc = snapshot.docs[0];
            const data = reactionDoc.data();
            return {
                id: reactionDoc.id,
                ...data,
                createdAt: toDateSafe(data.createdAt),
            } as Reaction;
        } catch (error: unknown) {
            logger.error('❌ Error fetching user reaction:', error);
            throw error;
        }
    }
}

export const reactionService = new ReactionService();
