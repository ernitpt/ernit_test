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
} from 'firebase/firestore';
import { db } from './firebase';
import type { Comment } from '../types';
import { feedService } from './FeedService';
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
            const commentData: any = {
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

            await addDoc(commentsCollection, commentData);

            // Increment comment count
            await feedService.updateCommentCount(postId, 1);

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
            let q = query(commentsCollection, orderBy('createdAt', 'desc'));

            if (limitCount) {
                q = query(commentsCollection, orderBy('createdAt', 'desc'), firestoreLimit(limitCount));
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
            const commentDoc = doc(db, 'feedPosts', postId, 'comments', commentId);
            await deleteDoc(commentDoc);

            // Decrement comment count
            await feedService.updateCommentCount(postId, -1);

            logger.log('✅ Comment deleted');
        } catch (error) {
            logger.error('❌ Error deleting comment:', error);
            throw error;
        }
    }
}

export const commentService = new CommentService();
