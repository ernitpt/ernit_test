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
} from 'firebase/firestore';
import { Notification } from '../types';
import { logger } from '../utils/logger';

export class NotificationService {
  /** Add a new notification */
  async createNotification(
    userId: string,
    type: string,
    title: string,
    message: string,
    data?: any,
    clearable: boolean = true
  ) {
    const docRef = await addDoc(collection(db, 'notifications'), {
      userId, // Fixed field name to match type definition
      type,
      title,
      message,
      read: false,
      clearable,
      createdAt: serverTimestamp(),
      data: data || {},
    });
    return docRef.id;
  }

  /** Create a friend request notification */
  async createFriendRequestNotification(
    recipientId: string,
    senderId: string,
    senderName: string,
    friendRequestId: string,
    senderProfileImageUrl?: string,
    senderCountry?: string
  ) {
    await this.createNotification(
      recipientId,
      'friend_request',
      'New Friend Request',
      `${senderName} wants to be your friend`,
      {
        friendRequestId,
        senderId,
        senderName,
        senderProfileImageUrl,
        senderCountry,
      },
      true // Allow clearing after responding
    );
  }

  /** 💝 Create notification when Valentine challenge starts (second partner joins) */
  async createValentineStartNotification(
    recipientId: string,
    partnerName: string,
    challengeId: string
  ) {
    await this.createNotification(
      recipientId,
      'valentine_start',
      'Valentine Challenge Started! 💘',
      `${partnerName} has joined your challenge! You're now linked and ready to go.`,
      {
        challengeId,
        partnerName,
      },
      true
    );
  }

  /** 💝 Create notification when Valentine reward unlocks (both finished) */
  async createValentineUnlockNotification(
    recipientId: string,
    partnerName: string,
    challengeId: string,
    experienceTitle?: string
  ) {
    await this.createNotification(
      recipientId,
      'valentine_unlock',
      'Reward Unlocked! 🎁',
      `You and ${partnerName} have both finished! Your ${experienceTitle || 'experience'} is ready to redeem.`,
      {
        challengeId,
        partnerName,
        experienceTitle,
      },
      false // Important! Don't let them accidentally clear this before clicking
    );
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
        where('data.postId', '==', postId)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        // Update existing notification
        const existingDoc = snapshot.docs[0];
        const existingData = existingDoc.data();
        const reactorNames = existingData.data?.reactorNames || [];

        // Add reactor if not already in the list
        if (!reactorNames.includes(reactorName)) {
          reactorNames.unshift(reactorName); // Add to beginning
        } else {
          // Move to front if already exists
          const index = reactorNames.indexOf(reactorName);
          reactorNames.splice(index, 1);
          reactorNames.unshift(reactorName);
        }

        const totalReactionCount = reactorNames.length;
        const message = totalReactionCount === 1
          ? `${reactorNames[0]} reacted to your post`
          : totalReactionCount === 2
            ? `${reactorNames[0]} and ${reactorNames[1]} reacted to your post`
            : `${reactorNames[0]} and ${totalReactionCount - 1} others reacted to your post`;

        await updateDoc(doc(db, 'notifications', existingDoc.id), {
          message,
          read: false, // Mark as unread
          createdAt: serverTimestamp(), // Update timestamp
          'data.reactorNames': reactorNames,
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
            reactorNames: [reactorName],
            totalReactionCount: 1,
            mostRecentReaction: reactionType,
            reactorProfileImageUrl,
          },
          true
        );
      }
    } catch (error) {
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
      where('userId', '==', userId), // Fixed field name to match type definition
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      })) as Notification[];
      callback(notifications);
    });

    return unsubscribe;
  };

  /** Mark as read */
  async markAsRead(notificationId: string) {
    const ref = doc(db, 'notifications', notificationId);
    await updateDoc(ref, { read: true });
  }

  /** Delete a single notification */
  async deleteNotification(notificationId: string, force: boolean = false) {
    if (!notificationId) {
      throw new Error('Notification ID is required');
    }
    const ref = doc(db, 'notifications', notificationId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const notificationData = snap.data();
      // Don't allow deletion of non-clearable notifications unless forced
      if (!force && notificationData.clearable === false) {
        throw new Error('This notification cannot be cleared');
      }
    }
    await deleteDoc(ref);
  }

  /** Clear all notifications for a user */
  async clearAllNotifications(userId: string) {
    try {
      const notificationsRef = collection(db, 'notifications');
      const q = query(notificationsRef, where('userId', '==', userId));
      const snapshot = await getDocs(q);

      // Only delete notifications that are clearable (clearable !== false)
      const deletePromises = snapshot.docs
        .filter(doc => {
          const data = doc.data();
          return data.clearable !== false && data.type !== 'friend_request' && data.type !== 'goal_approval_request' && data.type !== 'goal_change_suggested';
        })
        .map(doc => deleteDoc(doc.ref));

      await Promise.all(deletePromises);

      logger.log(`✅ Cleared ${deletePromises.length} clearable notifications for user ${userId}`);
    } catch (error) {
      logger.error('❌ Error clearing all notifications:', error);
      throw error;
    }
  }

  /** Clear all read notifications for a user */
  async clearReadNotifications(userId: string) {
    try {
      const notificationsRef = collection(db, 'notifications');
      const q = query(
        notificationsRef,
        where('userId', '==', userId),
        where('read', '==', true)
      );
      const snapshot = await getDocs(q);

      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      logger.log(`✅ Cleared ${snapshot.docs.length} read notifications for user ${userId}`);
    } catch (error) {
      logger.error('❌ Error clearing read notifications:', error);
      throw error;
    }
  }
  /** Mark old goal_progress notifications as stale when a new session is completed */
  async invalidateOldGoalProgressNotifications(goalId: string, currentSessionNumber: number) {
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
    } catch (error) {
      logger.error('❌ Error invalidating old goal_progress notifications:', error);
      // Don't throw - this is a cleanup operation
    }
  }
}

export const notificationService = new NotificationService();
