import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { FriendRequest, Friend, UserSearchResult } from '../types';
import { notificationService } from './NotificationService';
import { logger } from '../utils/logger';
import { analyticsService } from './AnalyticsService';

export class FriendService {
  private static instance: FriendService;

  static getInstance(): FriendService {
    if (!FriendService.instance) {
      FriendService.instance = new FriendService();
    }
    return FriendService.instance;
  }

  /**
   * 🔍 Search users via Cloud Function (server-side, no email exposure)
   */
  async searchUsers(searchTerm: string, _currentUserId: string): Promise<UserSearchResult[]> {
    try {
      const callable = httpsCallable(functions, 'searchUsers');
      const result: any = await callable({ searchTerm });
      const users = result?.data?.users || [];

      // Map server response to UserSearchResult (email intentionally omitted for privacy)
      return users.map((u: any) => ({
        id: u.id,
        name: u.name || 'Unknown User',
        email: '', // Not returned from server for privacy
        profileImageUrl: u.profileImageUrl || null,
        country: u.country || '',
        description: u.description || '',
        isFriend: u.isFriend || false,
        hasPendingRequest: u.hasPendingRequest || false,
      }));
    } catch (error) {
      logger.error('❌ Error searching users:', error);
      return [];
    }
  }

  /**
   * Check if user has exceeded friend request rate limit
   * Limit: 10 requests per hour
   */
  private async checkRateLimit(userId: string): Promise<boolean> {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    const recentRequests = await getDocs(
      query(
        collection(db, 'friendRequests'),
        where('senderId', '==', userId),
        where('createdAt', '>=', new Date(oneHourAgo))
      )
    );

    // Limit: 10 requests per hour
    return recentRequests.size >= 10;
  }

  /**
   * 📤 Send a friend request (gracefully handles missing names)
   */
  async sendFriendRequest(
    senderId: string,
    senderName?: string,
    recipientId?: string,
    recipientName?: string,
    senderCountry?: string,
    senderProfileImageUrl?: string | null,
  ): Promise<string> {
    try {
      // ✅ Check rate limit
      const rateLimited = await this.checkRateLimit(senderId);
      if (rateLimited) {
        throw new Error('Rate limit exceeded. You can send up to 10 friend requests per hour. Please try again later.');
      }

      // Graceful defaults for missing names
      senderName = senderName || 'Unknown';
      recipientName = recipientName || 'Unknown';

      if (!senderId || !recipientId) {
        throw new Error('Missing required user IDs for friend request');
      }

      const existingRequest = await this.getFriendRequest(senderId, recipientId);
      if (existingRequest) throw new Error('Friend request already exists');

      // T3-2: Check reverse direction — prevent simultaneous cross-requests
      const reverseRequest = await this.getFriendRequest(recipientId, senderId);
      if (reverseRequest) throw new Error('This person has already sent you a friend request');

      const alreadyFriends = await this.areFriends(senderId, recipientId);
      if (alreadyFriends) throw new Error('Users are already friends');

      const friendRequest: Omit<FriendRequest, 'id'> = {
        senderId,
        senderName,
        senderProfileImageUrl: senderProfileImageUrl ?? null,
        recipientId,
        recipientName,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const docRef = await addDoc(collection(db, 'friendRequests'), {
        ...friendRequest,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // ✅ Create notification
      await notificationService.createFriendRequestNotification(
        recipientId,
        senderId,
        senderName,
        docRef.id,
        senderProfileImageUrl ?? null,
        senderCountry ?? null
      );

      return docRef.id;
    } catch (error) {
      logger.error('❌ Error sending friend request:', error);
      throw error;
    }
  }

  /**
   * Accept a friend request AND remove it from DB
   */
  async acceptFriendRequest(requestId: string): Promise<void> {
    try {
      if (!requestId) throw new Error('Request ID is required');

      const requestRef = doc(db, 'friendRequests', requestId);

      // Track IDs outside transaction for post-transaction cleanup
      let senderId = '';
      let recipientId = '';
      let senderName = 'Unknown';
      let recipientName = 'Unknown';
      let recipientProfileImageUrl: string | null = null;

      // Use a transaction to atomically verify status + create friends + delete request
      await runTransaction(db, async (transaction) => {
        const requestSnap = await transaction.get(requestRef);

        if (!requestSnap.exists()) {
          throw new Error('Friend request not found or already processed');
        }

        const requestData = requestSnap.data();

        // Verify request is still pending (prevents double-accept or accept-after-cancel)
        if (requestData?.status !== 'pending') {
          throw new Error(`Friend request already ${requestData?.status || 'processed'}`);
        }

        senderId = requestData?.senderId;
        recipientId = requestData?.recipientId;
        senderName = requestData?.senderName || 'Unknown';
        recipientName = requestData?.recipientName || 'Unknown';
        const senderProfileImageUrl = requestData?.senderProfileImageUrl ?? null;

        if (!senderId || !recipientId) throw new Error('Invalid friend request data: missing user IDs');

        // Fetch recipient's profile image
        const recipientDoc = await transaction.get(doc(db, 'users', recipientId));
        if (recipientDoc.exists()) {
          recipientProfileImageUrl = recipientDoc.data()?.profile?.profileImageUrl ?? null;
        }

        // Create bidirectional friend docs
        const friendDoc1Ref = doc(collection(db, 'friends'));
        transaction.set(friendDoc1Ref, {
          userId: senderId,
          friendId: recipientId,
          friendName: recipientName,
          friendProfileImageUrl: recipientProfileImageUrl ?? null,
          createdAt: Timestamp.now(),
        });

        const friendDoc2Ref = doc(collection(db, 'friends'));
        transaction.set(friendDoc2Ref, {
          userId: recipientId,
          friendId: senderId,
          friendName: senderName,
          friendProfileImageUrl: senderProfileImageUrl ?? null,
          createdAt: Timestamp.now(),
        });

        // Delete the friend request
        transaction.delete(requestRef);
      });

      // T3-3: Clean up friend request notifications
      try {
        const notifsRef = collection(db, 'notifications');
        const notifQuery = query(notifsRef,
          where('userId', '==', recipientId),
          where('type', '==', 'friend_request'),
          where('data.senderId', '==', senderId)
        );
        const notifSnap = await getDocs(notifQuery);
        const deletePromises = notifSnap.docs.map(d => deleteDoc(d.ref));
        if (deletePromises.length > 0) await Promise.all(deletePromises);
      } catch (err) {
        logger.warn('Could not clean up friend request notifications:', err);
      }

      analyticsService.trackEvent('friend_request_accepted', 'social', { requestId, senderId, recipientId });
      logger.log(`✅ Friend request accepted and removed: ${senderName} ↔ ${recipientName}`);
    } catch (error) {
      logger.error('❌ Error accepting friend request:', error);
      throw error;
    }
  }

  /**
   * Decline a friend request AND remove it from DB
   */
  async declineFriendRequest(requestId: string): Promise<void> {
    try {
      if (!requestId) return;

      const requestRef = doc(db, 'friendRequests', requestId);

      // T3-3: Read request data before deleting to clean up notifications
      const requestDoc = await getDoc(requestRef);
      const requestData = requestDoc.exists() ? requestDoc.data() : null;

      await deleteDoc(requestRef);

      // T3-3: Clean up friend request notifications
      if (requestData?.senderId && requestData?.recipientId) {
        try {
          const notifsRef = collection(db, 'notifications');
          const notifQuery = query(notifsRef,
            where('userId', '==', requestData.recipientId),
            where('type', '==', 'friend_request'),
            where('data.senderId', '==', requestData.senderId)
          );
          const notifSnap = await getDocs(notifQuery);
          const deletePromises = notifSnap.docs.map(d => deleteDoc(d.ref));
          if (deletePromises.length > 0) await Promise.all(deletePromises);
        } catch (err) {
          logger.warn('Could not clean up friend request notifications:', err);
        }
      }

      analyticsService.trackEvent('friend_request_declined', 'social', { requestId });
      logger.log(`❌ Friend request declined and removed: ${requestId}`);
    } catch (error) {
      logger.error('❌ Error declining friend request:', error);
      throw error;
    }
  }

  // --- Remaining methods (getFriends, removeFriend, areFriends, etc.) ---
  async getPendingFriendRequests(userId: string): Promise<FriendRequest[]> {
    if (!userId) return [];

    try {
      const requestsRef = collection(db, 'friendRequests');
      const q = query(
        requestsRef,
        where('recipientId', '==', userId),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          senderId: data.senderId || '',
          senderName: data.senderName || 'Unknown',
          senderProfileImageUrl: data.senderProfileImageUrl ?? null,
          recipientId: data.recipientId || '',
          recipientName: data.recipientName || 'Unknown',
          status: data.status || 'pending',
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        };
      }) as FriendRequest[];
    } catch (error) {
      logger.error('❌ Error getting pending friend requests:', error);
      return [];
    }
  }

  async getSentFriendRequests(userId: string): Promise<FriendRequest[]> {
    if (!userId) return [];

    const requestsRef = collection(db, 'friendRequests');
    const q = query(
      requestsRef,
      where('senderId', '==', userId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as FriendRequest[];
  }

  async getFriends(userId: string): Promise<Friend[]> {
    if (!userId) return [];

    const friendsRef = collection(db, 'friends');
    const q = query(friendsRef, where('userId', '==', userId));
    const snap = await getDocs(q);
    const friends = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    })) as Friend[];

    return friends.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    if (!userId || !friendId) return;

    try {
      const friendsRef = collection(db, 'friends');
      const [userToFriend, friendToUser] = await Promise.all([
        getDocs(query(friendsRef, where('userId', '==', userId), where('friendId', '==', friendId))),
        getDocs(query(friendsRef, where('userId', '==', friendId), where('friendId', '==', userId))),
      ]);

      // T2-1: Atomic batch for bidirectional friend deletion
      const allDocs = [...userToFriend.docs, ...friendToUser.docs];
      if (allDocs.length > 0) {
        const batch = writeBatch(db);
        allDocs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      analyticsService.trackEvent('friend_removed', 'social', { userId, friendId });
    } catch (error) {
      logger.error('❌ Error removing friend:', error);
      throw error;
    }
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    if (!userId1 || !userId2) return false;
    const q = query(collection(db, 'friends'), where('userId', '==', userId1), where('friendId', '==', userId2));
    const snap = await getDocs(q);
    return !snap.empty;
  }

  async hasPendingRequest(userId1: string, userId2: string): Promise<boolean> {
    if (!userId1 || !userId2) return false;
    const q = query(
      collection(db, 'friendRequests'),
      where('senderId', '==', userId1),
      where('recipientId', '==', userId2),
      where('status', '==', 'pending')
    );
    const snap = await getDocs(q);
    return !snap.empty;
  }

  async getFriendRequest(senderId: string, recipientId: string): Promise<FriendRequest | null> {
    if (!senderId || !recipientId) return null;

    const q = query(
      collection(db, 'friendRequests'),
      where('senderId', '==', senderId),
      where('recipientId', '==', recipientId)
    );

    const snap = await getDocs(q);
    if (snap.empty) return null;

    const docSnap = snap.docs[0];
    return {
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: docSnap.data().createdAt?.toDate() || new Date(),
      updatedAt: docSnap.data().updatedAt?.toDate() || new Date(),
    } as FriendRequest;
  }

  private async addFriend(userId: string, friendId: string, friendName: string, friendProfileImageUrl?: string | null) {
    if (!userId || !friendId || !friendName) return;

    try {
      await addDoc(collection(db, 'friends'), {
        userId,
        friendId,
        friendName,
        friendProfileImageUrl: friendProfileImageUrl ?? null,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      logger.error('❌ Error adding friend:', error);
      throw error;
    }
  }

  async getFriendCount(userId: string): Promise<number> {
    if (!userId) return 0;
    const friendsRef = collection(db, 'friends');
    const q = query(friendsRef, where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.size;
  }
}

export const friendService = FriendService.getInstance();
