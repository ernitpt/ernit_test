import {
    collection,
    addDoc,
    query,
    orderBy,
    getDocs,
    deleteDoc,
    doc,
    Timestamp,
    limit as firestoreLimit,
    updateDoc,
    writeBatch,
    increment,
    arrayUnion,
    arrayRemove,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Comment } from '../types';
import { sanitizeComment, sanitizeText } from '../utils/sanitization';

import { logger } from '../utils/logger';
class CommentService {
    /**
     * Add a comment to a post
     */
    async addComment(
        postId: string,
        comment: Omit<Comment, 'id' | 'createdAt' | 'postId'>
    ): Promise<void> {
        try {
            const commentsCollection = collection(db, 'feedPosts', postId, 'comments');

            // ✅ SECURITY: Sanitize comment text before storing
            const sanitizedText = sanitizeComment(comment.text);
            const sanitizedUserName = sanitizeText(comment.userName, 100);

            // Filter out undefined values
            const commentData: Record<string, unknown> = {
                postId,
                userId: comment.userId,
                userName: sanitizedUserName,
                text: sanitizedText,
                createdAt: Timestamp.now(),
            };

            // Only add userProfileImageUrl if it's defined
            if (comment.userProfileImageUrl) {
                commentData.userProfileImageUrl = comment.userProfileImageUrl;
            }

            // T2-2: Atomic comment add + count increment
            const batch = writeBatch(db);
            const newCommentRef = doc(commentsCollection);
            batch.set(newCommentRef, commentData);
            const postRef = doc(db, 'feedPosts', postId);
            batch.update(postRef, { commentCount: increment(1) });
            await batch.commit();

            logger.log('✅ Comment added');
        } catch (error) {
            logger.error('❌ Error adding comment:', error);
            throw error;
        }
    }

    /**
     * Update a comment
     */
    async updateComment(postId: string, commentId: string, newText: string): Promise<void> {
        try {
            // ✅ SECURITY: Sanitize comment text before updating
            const sanitizedText = sanitizeComment(newText);

            const commentRef = doc(db, 'feedPosts', postId, 'comments', commentId);
            await updateDoc(commentRef, {
                text: sanitizedText,
                updatedAt: Timestamp.now(),
            });
            logger.log('✅ Comment updated');
        } catch (error) {
            logger.error('❌ Error updating comment:', error);
            throw error;
        }
    }

    /**
     * Get comments for a post
     */
    async getComments(postId: string, limitCount?: number): Promise<Comment[]> {
        try {
            const commentsCollection = collection(db, 'feedPosts', postId, 'comments');
            let q = query(commentsCollection, orderBy('createdAt', 'asc'));

            if (limitCount) {
                q = query(commentsCollection, orderBy('createdAt', 'asc'), firestoreLimit(limitCount));
            }

            const snapshot = await getDocs(q);

            return snapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    postId: data.postId,
                    userId: data.userId,
                    userName: data.userName,
                    userProfileImageUrl: data.userProfileImageUrl,
                    text: data.text,
                    createdAt: data.createdAt?.toDate() || new Date(),
                    updatedAt: data.updatedAt?.toDate(),
                    likedBy: data.likedBy || [],
                } as Comment;
            });
        } catch (error) {
            logger.error('❌ Error fetching comments:', error);
            throw error;
        }
    }

    /**
     * Delete a comment
     */
    async deleteComment(postId: string, commentId: string): Promise<void> {
        try {
            // T2-2: Atomic comment delete + count decrement
            const batch = writeBatch(db);
            const commentRef = doc(db, 'feedPosts', postId, 'comments', commentId);
            batch.delete(commentRef);
            const postRef = doc(db, 'feedPosts', postId);
            batch.update(postRef, { commentCount: increment(-1) });
            await batch.commit();

            logger.log('✅ Comment deleted');
        } catch (error) {
            logger.error('❌ Error deleting comment:', error);
            throw error;
        }
    }

    /**
     * Like a comment
     */
    async likeComment(postId: string, commentId: string, userId: string): Promise<void> {
        try {
            const commentRef = doc(db, 'feedPosts', postId, 'comments', commentId);
            await updateDoc(commentRef, {
                likedBy: arrayUnion(userId),
            });
        } catch (error) {
            logger.error('❌ Error liking comment:', error);
            throw error;
        }
    }

    /**
     * Unlike a comment
     */
    async unlikeComment(postId: string, commentId: string, userId: string): Promise<void> {
        try {
            const commentRef = doc(db, 'feedPosts', postId, 'comments', commentId);
            await updateDoc(commentRef, {
                likedBy: arrayRemove(userId),
            });
        } catch (error) {
            logger.error('❌ Error unliking comment:', error);
            throw error;
        }
    }
}

export const commentService = new CommentService();
