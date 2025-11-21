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

      console.log(`✅ Cleared ${deletePromises.length} clearable notifications for user ${userId}`);
    } catch (error) {
      console.error('❌ Error clearing all notifications:', error);
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

      console.log(`✅ Cleared ${snapshot.docs.length} read notifications for user ${userId}`);
    } catch (error) {
      console.error('❌ Error clearing read notifications:', error);
      throw error;
    }
  }
}

export const notificationService = new NotificationService();
