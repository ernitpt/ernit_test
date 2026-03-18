import {
    collection,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    doc,
    getDoc,
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
import { toDateSafe } from '../utils/GoalHelpers';
import { logger } from '../utils/logger';

class FeedService {
    private feedPostsCollection = collection(db, 'feedPosts');

    /**
     * Create a new feed post
     */
    async createFeedPost(post: Omit<FeedPost, 'id' | 'reactionCounts' | 'commentCount'>): Promise<string> {
        try {
            // Build post data object, only including fields that are defined
            const feedPost: Record<string, unknown> = {
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
            if (post.preferredRewardCategory !== undefined) {
                feedPost.preferredRewardCategory = post.preferredRewardCategory;
            }
            // Session media fields
            if (post.mediaUrl !== undefined) {
                feedPost.mediaUrl = post.mediaUrl;
            }
            if (post.mediaType !== undefined) {
                feedPost.mediaType = post.mediaType;
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
     * Helper: split array into chunks of given size
     */
    private chunk<T>(arr: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Get feed posts for current user (friends' posts + own posts)
     * Uses batched 'in' queries for efficient Firestore reads
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

            // Use batched 'in' queries (Firestore supports up to 30 per 'in' clause)
            const batches = this.chunk(allowedUserIds, 30);
            const allPosts: { post: FeedPost; docSnapshot: QueryDocumentSnapshot<DocumentData> }[] = [];

            for (const batch of batches) {
                let q = query(
                    this.feedPostsCollection,
                    where('userId', 'in', batch),
                    orderBy('createdAt', 'desc'),
                    limit(limitCount)
                );

                if (lastDoc) {
                    q = query(
                        this.feedPostsCollection,
                        where('userId', 'in', batch),
                        orderBy('createdAt', 'desc'),
                        startAfter(lastDoc),
                        limit(limitCount)
                    );
                }

                const snapshot = await getDocs(q);

                for (const docSnapshot of snapshot.docs) {
                    const data = docSnapshot.data();
                    allPosts.push({
                        post: {
                            id: docSnapshot.id,
                            ...data,
                            createdAt: toDateSafe(data.createdAt),
                        } as FeedPost,
                        docSnapshot,
                    });
                }
            }

            // Sort all results by createdAt descending and take limitCount
            allPosts.sort((a, b) => b.post.createdAt.getTime() - a.post.createdAt.getTime());
            const sliced = allPosts.slice(0, limitCount);

            const newLastDoc = sliced.length > 0
                ? sliced[sliced.length - 1].docSnapshot
                : undefined;

            return {
                posts: sliced.map(item => item.post),
                lastDoc: newLastDoc,
            };
        } catch (error) {
            logger.error('❌ Error fetching feed:', error);
            throw error;
        }
    }

    /**
     * Listen to real-time feed updates (friends' posts + own posts)
     * Returns unsubscribe function to prevent memory leaks
     */
    listenToFeed(
        userId: string,
        callback: (posts: FeedPost[]) => void,
        limitCount: number = 20
    ): () => void {
        let unsubscribe: (() => void) | null = null;
        let isCancelled = false;

        // Get friends first, then set up listener
        friendService.getFriends(userId).then(friends => {
            // Guard: if cleanup was called before getFriends resolved, don't set up listener
            if (isCancelled) return;

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
                            createdAt: toDateSafe(data.createdAt),
                        } as FeedPost);
                    }

                    if (posts.length >= limitCount) break;
                }

                callback(posts.slice(0, limitCount));
            }, (error) => {
                logger.error('[FeedService] Feed snapshot error:', error.message);
            });
        }).catch(error => {
            logger.error('❌ Error setting up feed listener:', error);
        });

        // Return cleanup function
        return () => {
            isCancelled = true;
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
     * Get a single feed post by direct document read
     */
    async getFeedPost(postId: string): Promise<FeedPost | null> {
        try {
            const postRef = doc(db, 'feedPosts', postId);
            const postDoc = await getDoc(postRef);

            if (!postDoc.exists()) return null;

            const data = postDoc.data();
            return {
                id: postDoc.id,
                ...data,
                createdAt: toDateSafe(data.createdAt),
            } as FeedPost;
        } catch (error) {
            logger.error('❌ Error fetching feed post:', error);
            throw error;
        }
    }
}

export const feedService = new FeedService();
