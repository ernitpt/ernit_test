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
} from 'firebase/firestore';
import { db } from './firebase';
import type { Comment } from '../types';
import { feedService } from './FeedService';

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

            // Filter out undefined values
            const commentData: any = {
                postId,
                userId: comment.userId,
                userName: comment.userName,
                text: comment.text,
                createdAt: Timestamp.now(),
            };

            // Only add userProfileImageUrl if it's defined
            if (comment.userProfileImageUrl) {
                commentData.userProfileImageUrl = comment.userProfileImageUrl;
            }

            await addDoc(commentsCollection, commentData);

            // Increment comment count
            await feedService.updateCommentCount(postId, 1);

            console.log('✅ Comment added');
        } catch (error) {
            console.error('❌ Error adding comment:', error);
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
                    ...data,
                    createdAt: data.createdAt?.toDate() || new Date(),
                } as Comment;
            });
        } catch (error) {
            console.error('❌ Error fetching comments:', error);
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

            console.log('✅ Comment deleted');
        } catch (error) {
            console.error('❌ Error deleting comment:', error);
            throw error;
        }
    }
}

export const commentService = new CommentService();
