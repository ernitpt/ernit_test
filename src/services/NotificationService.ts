import { db } from './firebase';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  deleteDoc,
  getDocs,
  getDoc,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { Notification } from '../types';
import { toDateSafe } from '../utils/GoalHelpers';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { sanitizeText } from '../utils/sanitization';

export class NotificationService {
  /** Add a new notification */
  async createNotification(
    userId: string,
    type: Notification['type'],
    title: string,
    message: string,
    data?: Record<string, unknown>,
    clearable: boolean = true,
    senderId?: string
  ): Promise<string> {
    try {
      const docData: Record<string, unknown> = {
        userId,
        type,
        title: sanitizeText(title, 200),
        message: sanitizeText(message, 500),
        read: false,
        clearable,
        createdAt: serverTimestamp(),
        data: data || {},
      };
      if (senderId) {
        docData.senderId = senderId;
      }
      const docRef = await addDoc(collection(db, 'notifications'), docData);
      return docRef.id;
    } catch (error: unknown) {
      logger.warn('Failed to create notification:', error);
      // Don't rethrow — notification is non-critical
      return '';
    }
  }

  /** Create a friend request notification */
  async createFriendRequestNotification(
    recipientId: string,
    senderId: string,
    senderName: string,
    friendRequestId: string,
    senderProfileImageUrl?: string,
    senderCountry?: string
  ): Promise<void> {
    try {
      // Note: Firestore rules require data.requestId (not friendRequestId) and top-level senderId
      await this.createNotification(
        recipientId,
        'friend_request',
        'New Friend Request',
        `${senderName} wants to be your friend`,
        {
          requestId: friendRequestId,
          friendRequestId, // Keep for backward compat
          senderId,
          senderName,
          senderProfileImageUrl,
          senderCountry,
        },
        true, // Allow clearing after responding
        senderId // Pass senderId as top-level field
      );
    } catch (error: unknown) {
      logger.warn('Failed to create friend request notification:', error);
      // Don't rethrow — notification is non-critical
    }
  }

  /** Create a personalized hint notification */
  async createPersonalizedHintNotification(
    recipientId: string,
    giverId: string,
    giverName: string,
    goalId: string,
    goalTitle: string,
    sessionsPerWeek: number,
    totalWeeks: number,
    sessionNumber: number
  ): Promise<string> {
    return await this.createNotification(
      recipientId,
      'personalized_hint_left',
      `${giverName} left you a hint!`,
      `A special message awaits for "${goalTitle}" (${sessionsPerWeek} times/week for ${totalWeeks} weeks). Complete your next session to unlock it.`,
      {
        goalId,
        senderId: giverId,
        senderName: giverName,
      },
      true // Make clearable - user can dismiss these notifications
    );
  }

  /** Create or update a post reaction notification */
  async createOrUpdatePostReactionNotification(
    postOwnerId: string,
    postId: string,
    reactorId: string,
    reactorName: string,
    reactorProfileImageUrl: string | undefined,
    reactionType: 'muscle' | 'heart' | 'like'
  ): Promise<void> {
    try {
      // Find existing notification for this post
      const notificationsRef = collection(db, 'notifications');
      const q = query(
        notificationsRef,
        where('userId', '==', postOwnerId),
        where('type', '==', 'post_reaction'),
        where('data.postId', '==', postId),
        limit(1)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        // Update existing notification
        const existingDoc = snapshot.docs[0];
        const existingData = existingDoc.data();
        const existingReactorNames: string[] = existingData.data?.reactorNames || [];

        // Build updated reactor list (move reactor to front, cap at 5 stored names)
        const filteredNames = existingReactorNames.filter((n: string) => n !== reactorName);
        const updatedNames = [reactorName, ...filteredNames].slice(0, 5);
        const existingTotal = existingData.data?.totalReactionCount || existingReactorNames.length;
        const totalReactionCount = filteredNames.length < existingReactorNames.length
          ? existingTotal  // Reactor already counted, just moved to front
          : existingTotal + 1;  // New reactor

        const message = totalReactionCount === 1
          ? `${updatedNames[0]} reacted to your post`
          : totalReactionCount === 2
            ? `${updatedNames[0]} and ${updatedNames[1]} reacted to your post`
            : `${updatedNames[0]} and ${totalReactionCount - 1} others reacted to your post`;

        await updateDoc(doc(db, 'notifications', existingDoc.id), {
          message,
          read: false,
          createdAt: serverTimestamp(),
          'data.reactorNames': updatedNames,
          'data.totalReactionCount': totalReactionCount,
          'data.mostRecentReaction': reactionType,
          'data.reactorProfileImageUrl': reactorProfileImageUrl || existingData.data?.reactorProfileImageUrl,
        });
      } else {
        // Create new notification
        await this.createNotification(
          postOwnerId,
          'post_reaction',
          'New Reaction',
          `${reactorName} reacted to your post`,
          {
            postId,
            reactorId,
            reactorNames: [reactorName],
            totalReactionCount: 1,
            mostRecentReaction: reactionType,
            reactorProfileImageUrl,
          },
          true
        );
      }
    } catch (error: unknown) {
      logger.error('❌ Error creating/updating post reaction notification:', error);
      throw error;
    }
  }

  /** Listen for real-time updates for one user */
  listenToUserNotifications = (
    userId: string,
    callback: (notifications: Notification[]) => void
  ) => {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: toDateSafe(doc.data().createdAt),
      })) as Notification[];
      callback(notifications);
    }, (error) => {
      logger.error('[NotificationService] Notification snapshot error:', error.message);
    });

    return unsubscribe;
  };

  /** Mark all unread notifications as read for a user (batch write, max 500) */
  async markAllAsRead(userId: string): Promise<void> {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false),
      limit(500)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  }

  /** Mark as read */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      const ref = doc(db, 'notifications', notificationId);
      await updateDoc(ref, { read: true });
    } catch (error: unknown) {
      logger.warn('Failed to mark notification as read:', error);
    }
  }

  /** Delete a single notification */
  async deleteNotification(notificationId: string, force: boolean = false): Promise<void> {
    if (!notificationId) {
      throw new AppError('INVALID_REQUEST', 'Notification ID is required', 'validation');
    }
    try {
      const ref = doc(db, 'notifications', notificationId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const notificationData = snap.data();
        if (!force && notificationData.clearable === false) {
          throw new AppError('NOT_CLEARABLE', 'This notification cannot be cleared', 'business');
        }
      }
      await deleteDoc(ref);
    } catch (error: unknown) {
      if (error instanceof AppError) throw error; // Re-throw business logic errors
      logger.warn('Failed to delete notification:', error);
    }
  }

  /** Clear all notifications for a user (bounded to 500 per call, uses batched delete) */
  async clearAllNotifications(userId: string): Promise<void> {
    try {
      const notificationsRef = collection(db, 'notifications');
      const q = query(notificationsRef, where('userId', '==', userId), limit(500));
      const snapshot = await getDocs(q);

      // Only delete notifications that are clearable (clearable !== false)
      const clearableDocs = snapshot.docs.filter(doc => {
        const data = doc.data();
        return data.clearable !== false && data.type !== 'friend_request' && data.type !== 'goal_approval_request' && data.type !== 'goal_change_suggested';
      });

      if (clearableDocs.length === 0) return;

      const batch = writeBatch(db);
      clearableDocs.forEach(d => batch.delete(d.ref));
      await batch.commit();

      logger.log(`✅ Cleared ${clearableDocs.length} clearable notifications for user ${userId}`);
    } catch (error: unknown) {
      logger.error('❌ Error clearing all notifications:', error);
      throw error;
    }
  }

  /** Clear all read notifications for a user (bounded to 500 per call, uses batched delete) */
  async clearReadNotifications(userId: string): Promise<void> {
    try {
      const notificationsRef = collection(db, 'notifications');
      const q = query(notificationsRef, where('userId', '==', userId), where('read', '==', true), limit(500));
      const snap = await getDocs(q);
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach(d => {
        if (d.data().clearable !== false) {
          batch.delete(d.ref);
        }
      });
      await batch.commit();

      logger.log(`✅ Cleared read clearable notifications for user ${userId}`);
    } catch (error: unknown) {
      logger.error('❌ Error clearing read notifications:', error);
      throw error;
    }
  }
  /** Mark old goal_progress notifications as stale when a new session is completed */
  async invalidateOldGoalProgressNotifications(goalId: string, currentSessionNumber: number): Promise<void> {
    try {
      const notificationsRef = collection(db, 'notifications');
      const q = query(
        notificationsRef,
        where('type', '==', 'goal_progress'),
        where('data.goalId', '==', goalId)
      );
      const snapshot = await getDocs(q);

      // Mark all goal_progress notifications for this goal as stale (non-actionable)
      // This prevents givers from leaving hints on old session notifications
      const updatePromises = snapshot.docs
        .filter(doc => {
          const data = doc.data();
          // Mark notifications from sessions before the current one as stale
          return data.data?.sessionNumber && data.data.sessionNumber < currentSessionNumber;
        })
        .map(doc => updateDoc(doc.ref, { isStale: true }));

      await Promise.all(updatePromises);

      logger.log(`✅ Marked ${updatePromises.length} old goal_progress notifications as stale for goal ${goalId}`);
    } catch (error: unknown) {
      logger.error('❌ Error invalidating old goal_progress notifications:', error);
      // Don't throw - this is a cleanup operation
    }
  }
}

export const notificationService = new NotificationService();
