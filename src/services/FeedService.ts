import {
    collection,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    doc,
    updateDoc,
    increment,
    onSnapshot,
    Timestamp,
    startAfter,
    QueryDocumentSnapshot,
    DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import type { FeedPost } from '../types';
import { friendService } from './FriendService';
import { logger } from '../utils/logger';

class FeedService {
    private feedPostsCollection = collection(db, 'feedPosts');

    /**
     * Create a new feed post
     */
    async createFeedPost(post: Omit<FeedPost, 'id' | 'reactionCounts' | 'commentCount'>): Promise<string> {
        try {
            // Build post data object, only including fields that are defined
            const feedPost: any = {
                userId: post.userId,
                userName: post.userName,
                goalId: post.goalId,
                goalDescription: post.goalDescription,
                type: post.type,
                createdAt: Timestamp.fromDate(post.createdAt),
                reactionCounts: {
                    muscle: 0,
                    heart: 0,
                    like: 0,
                },
                commentCount: 0,
            };

            // Only add optional fields if they exist and are not undefined
            if (post.userProfileImageUrl !== undefined) {
                feedPost.userProfileImageUrl = post.userProfileImageUrl;
            }
            if (post.sessionNumber !== undefined) {
                feedPost.sessionNumber = post.sessionNumber;
            }
            if (post.totalSessions !== undefined) {
                feedPost.totalSessions = post.totalSessions;
            }
            if (post.progressPercentage !== undefined) {
                feedPost.progressPercentage = post.progressPercentage;
            }
            if (post.weeklyCount !== undefined) {
                feedPost.weeklyCount = post.weeklyCount;
            }
            if (post.sessionsPerWeek !== undefined) {
                feedPost.sessionsPerWeek = post.sessionsPerWeek;
            }
            // Experience fields (for goal_completed posts)
            if (post.experienceTitle !== undefined) {
                feedPost.experienceTitle = post.experienceTitle;
            }
            if (post.experienceImageUrl !== undefined) {
                feedPost.experienceImageUrl = post.experienceImageUrl;
            }
            if (post.partnerName !== undefined) {
                feedPost.partnerName = post.partnerName;
            }
            if (post.experienceGiftId !== undefined) {
                feedPost.experienceGiftId = post.experienceGiftId;
            }
            // Free Goal fields
            if (post.isFreeGoal !== undefined) {
                feedPost.isFreeGoal = post.isFreeGoal;
            }
            if (post.pledgedExperienceId !== undefined) {
                feedPost.pledgedExperienceId = post.pledgedExperienceId;
            }
            if (post.pledgedExperiencePrice !== undefined) {
                feedPost.pledgedExperiencePrice = post.pledgedExperiencePrice;
            }

            const docRef = await addDoc(this.feedPostsCollection, feedPost);
            logger.log('✅ Feed post created:', docRef.id);
            return docRef.id;
        } catch (error) {
            logger.error('❌ Error creating feed post:', error);
            throw error;
        }
    }

    /**
     * Get feed posts for current user (friends' posts + own posts)
     * Uses client-side filtering to ensure privacy
     */
    async getFriendsFeed(
        userId: string,
        limitCount: number = 20,
        lastDoc?: QueryDocumentSnapshot<DocumentData>
    ): Promise<{ posts: FeedPost[]; lastDoc?: QueryDocumentSnapshot<DocumentData> }> {
        try {
            // Get user's friends
            const friends = await friendService.getFriends(userId);
            const friendIds = friends.map(f => f.friendId);

            // Include user's own posts
            const allowedUserIds = [userId, ...friendIds];

            // Fetch posts and filter client-side
            let q = query(
                this.feedPostsCollection,
                orderBy('createdAt', 'desc'),
                limit(100)
            );

            if (lastDoc) {
                q = query(
                    this.feedPostsCollection,
                    orderBy('createdAt', 'desc'),
                    startAfter(lastDoc),
                    limit(100)
                );
            }

            const snapshot = await getDocs(q);

            // Filter posts to only include friends and user
            const filteredPosts: FeedPost[] = [];
            for (const docSnapshot of snapshot.docs) {
                const data = docSnapshot.data();
                if (allowedUserIds.includes(data.userId)) {
                    filteredPosts.push({
                        id: docSnapshot.id,
                        ...data,
                        createdAt: data.createdAt?.toDate() || new Date(),
                    } as FeedPost);
                }

                // Stop once we have enough posts
                if (filteredPosts.length >= limitCount) break;
            }

            const newLastDoc = filteredPosts.length > 0
                ? snapshot.docs[snapshot.docs.findIndex((d: any) => d.id === filteredPosts[filteredPosts.length - 1].id)]
                : undefined;

            return { posts: filteredPosts.slice(0, limitCount), lastDoc: newLastDoc };
        } catch (error) {
            logger.error('❌ Error fetching feed:', error);
            throw error;
        }
    }

    /**
     * Listen to real-time feed updates (friends' posts + own posts)
     * ✅ FIX: Returns unsubscribe function to prevent memory leaks
     */
    listenToFeed(
        userId: string,
        callback: (posts: FeedPost[]) => void,
        limitCount: number = 20
    ): () => void {
        // Store unsubscribe function to return
        let unsubscribe: (() => void) | null = null;

        // Get friends first, then set up listener
        friendService.getFriends(userId).then(friends => {
            const friendIds = friends.map(f => f.friendId);
            const allowedUserIds = [userId, ...friendIds];

            const q = query(
                this.feedPostsCollection,
                orderBy('createdAt', 'desc'),
                limit(100)
            );

            unsubscribe = onSnapshot(q, (snapshot) => {
                const posts: FeedPost[] = [];

                for (const docSnapshot of snapshot.docs) {
                    const data = docSnapshot.data();
                    if (allowedUserIds.includes(data.userId)) {
                        posts.push({
                            id: docSnapshot.id,
                            ...data,
                            createdAt: data.createdAt?.toDate() || new Date(),
                        } as FeedPost);
                    }

                    if (posts.length >= limitCount) break;
                }

                callback(posts.slice(0, limitCount));
            });
        });

        // Return cleanup function
        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }

    /**
     * Update reaction count for a post
    */
    async updateReactionCount(postId: string, reactionType: 'muscle' | 'heart' | 'like', incrementValue: number) {
        try {
            const postRef = doc(db, 'feedPosts', postId);
            await updateDoc(postRef, {
                [`reactionCounts.${reactionType}`]: increment(incrementValue),
            });
        } catch (error) {
            logger.error('❌ Error updating reaction count:', error);
            throw error;
        }
    }

    /**
     * Update comment count for a post
     */
    async updateCommentCount(postId: string, incrementValue: number) {
        try {
            const postRef = doc(db, 'feedPosts', postId);
            await updateDoc(postRef, {
                commentCount: increment(incrementValue),
            });
        } catch (error) {
            logger.error('❌ Error updating comment count:', error);
            throw error;
        }
    }

    /**
     * Get a single feed post
     */
    async getFeedPost(postId: string): Promise<FeedPost | null> {
        try {
            const q = query(this.feedPostsCollection, where('__name__', '==', postId));
            const snapshot = await getDocs(q);

            if (snapshot.empty) return null;

            const docData = snapshot.docs[0];
            const data = docData.data();
            return {
                id: docData.id,
                ...data,
                createdAt: data.createdAt?.toDate() || new Date(),
            } as FeedPost;
        } catch (error) {
            logger.error('❌ Error fetching feed post:', error);
            throw error;
        }
    }
}

export const feedService = new FeedService();
