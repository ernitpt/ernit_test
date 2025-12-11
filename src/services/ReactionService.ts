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
} from 'firebase/firestore';
import { db } from './firebase';
import type { Reaction, ReactionType } from '../types';
import { feedService } from './FeedService';
import { notificationService } from './NotificationService';

import { logger } from '../utils/logger';
class ReactionService {
    /**
     * Add or update a reaction to a post
     */
    async addReaction(
        postId: string,
        userId: string,
        userName: string,
        type: ReactionType
    ): Promise<void> {
        try {
            // First, check if user already has a reaction on this post
            const existingReaction = await this.getUserReaction(postId, userId);

            if (existingReaction) {
                // If same type, remove it (toggle off)
                if (existingReaction.type === type) {
                    await this.removeReaction(postId, userId);
                    return;
                }

                // If different type, remove old and add new
                await this.removeReaction(postId, userId);
            }

            // Fetch user profile image
            let userProfileImageUrl: string | undefined;
            try {
                const userDoc = await getDoc(doc(db, 'users', userId));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    userProfileImageUrl = userData?.profile?.profileImageUrl;
                }
            } catch (error) {
                logger.warn('Could not fetch user profile image:', error);
            }

            // Add new reaction
            const reactionsCollection = collection(db, 'feedPosts', postId, 'reactions');
            const reactionData: any = {
                postId,
                userId,
                userName,
                type,
                createdAt: Timestamp.now(),
            };

            // Only add userProfileImageUrl if it exists
            if (userProfileImageUrl) {
                reactionData.userProfileImageUrl = userProfileImageUrl;
            }

            await addDoc(reactionsCollection, reactionData);

            // Update reaction count
            await feedService.updateReactionCount(postId, type, 1);

            // Create notification for post owner (exclude self-reactions)
            try {
                const postDoc = await getDoc(doc(db, 'feedPosts', postId));
                if (postDoc.exists()) {
                    const postData = postDoc.data();
                    const postOwnerId = postData.userId;

                    // Don't notify if user is reacting to their own post
                    if (postOwnerId !== userId) {
                        await notificationService.createOrUpdatePostReactionNotification(
                            postOwnerId,
                            postId,
                            userId,
                            userName,
                            userProfileImageUrl,
                            type
                        );
                    }
                }
            } catch (error) {
                logger.warn('Could not create reaction notification:', error);
            }

            logger.log('✅ Reaction added');
        } catch (error) {
            logger.error('❌ Error adding reaction:', error);
            throw error;
        }
    }

    /**
     * Remove a user's reaction from a post
     */
    async removeReaction(postId: string, userId: string): Promise<void> {
        try {
            const reaction = await this.getUserReaction(postId, userId);
            if (!reaction) return;

            const reactionDoc = doc(db, 'feedPosts', postId, 'reactions', reaction.id);
            await deleteDoc(reactionDoc);

            // Decrement reaction count
            await feedService.updateReactionCount(postId, reaction.type, -1);

            logger.log('✅ Reaction removed');
        } catch (error) {
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
            const q = query(reactionsCollection, orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);

            return snapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate() || new Date(),
                } as Reaction;
            });
        } catch (error) {
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

            const doc = snapshot.docs[0];
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate() || new Date(),
            } as Reaction;
        } catch (error) {
            logger.error('❌ Error fetching user reaction:', error);
            throw error;
        }
    }
}

export const reactionService = new ReactionService();
