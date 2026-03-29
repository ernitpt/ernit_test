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
  increment,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from './firebase';
import { FriendRequest, Friend, UserSearchResult } from '../types';
import { notificationService } from './NotificationService';
import { logger } from '../utils/logger';
import { analyticsService } from './AnalyticsService';
import { toDateSafe } from '../utils/GoalHelpers';
import { AppError } from '../utils/AppError';
import { sanitizeText } from '../utils/sanitization';

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
      const result = await callable({ searchTerm });
      const users = (result?.data as { users?: Record<string, unknown>[] })?.users || [];

      // Map server response to UserSearchResult (email intentionally omitted for privacy)
      return users.map((u: Record<string, unknown>): UserSearchResult => ({
        id: u.id as string,
        name: (u.name as string) || 'Unknown User',
        email: '', // Not returned from server for privacy
        profileImageUrl: (u.profileImageUrl as string) || null,
        country: (u.country as string) || '',
        description: (u.description as string) || '',
        isFriend: !!u.isFriend,
        hasPendingRequest: !!u.hasPendingRequest,
      }));
    } catch (error: unknown) {
      logger.error('❌ Error searching users:', error);
      return [];
    }
  }

  /**
   * Check if user has exceeded friend request rate limit and atomically increment the counter.
   * Uses a transaction to prevent TOCTOU: two concurrent sends cannot both read count=9
   * and both write 10, bypassing the limit.
   * Limit: 10 requests per hour.
   * Returns true if rate-limited (should abort), false if allowed (counter already incremented).
   */
  private async checkRateLimit(userId: string): Promise<boolean> {
    const rateLimitRef = doc(db, 'users', userId, 'meta', 'rateLimits');
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(rateLimitRef);
      const data = snap.exists() ? snap.data() : null;

      // Reset window if it started more than an hour ago
      const windowStart: number = data?.friendRequestWindowStart ?? 0;
      const windowCount: number = (windowStart < oneHourAgo) ? 0 : (data?.friendRequestCount ?? 0);

      if (windowCount >= 10) {
        return true; // Rate-limited — do not increment
      }

      // Atomically record this attempt
      if (!snap.exists() || windowStart < oneHourAgo) {
        transaction.set(rateLimitRef, {
          friendRequestWindowStart: now,
          friendRequestCount: 1,
        }, { merge: true });
      } else {
        transaction.update(rateLimitRef, {
          friendRequestCount: increment(1),
        });
      }

      return false; // Allowed
    });
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
        throw new AppError('RATE_LIMIT', 'Rate limit exceeded. You can send up to 10 friend requests per hour. Please try again later.', 'rate_limit');
      }

      // Graceful defaults for missing names
      senderName = sanitizeText(senderName || 'Unknown', 100);
      recipientName = sanitizeText(recipientName || 'Unknown', 100);

      if (!senderId || !recipientId) {
        throw new AppError('INVALID_REQUEST', 'Missing required user IDs for friend request', 'validation');
      }

      // Prevent self-friending
      if (senderId === recipientId) {
        throw new AppError('SELF_REQUEST', 'You cannot send a friend request to yourself', 'validation');
      }

      const existingRequest = await this.getFriendRequest(senderId, recipientId);
      if (existingRequest) throw new AppError('DUPLICATE_REQUEST', 'Friend request already exists', 'business');

      // T3-2: Check reverse direction — prevent simultaneous cross-requests
      const reverseRequest = await this.getFriendRequest(recipientId, senderId);
      if (reverseRequest) throw new AppError('REVERSE_REQUEST', 'This person has already sent you a friend request', 'business');

      const alreadyFriends = await this.areFriends(senderId, recipientId);
      if (alreadyFriends) throw new AppError('ALREADY_FRIENDS', 'Users are already friends', 'business');

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
    } catch (error: unknown) {
      logger.error('❌ Error sending friend request:', error);
      throw error;
    }
  }

  /**
   * Accept a friend request AND remove it from DB
   */
  async acceptFriendRequest(requestId: string): Promise<void> {
    try {
      if (!requestId) throw new AppError('INVALID_REQUEST', 'Request ID is required', 'validation');

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
          throw new AppError('REQUEST_NOT_FOUND', 'Friend request not found or already processed', 'not_found');
        }

        const requestData = requestSnap.data();

        // Verify request is still pending (prevents double-accept or accept-after-cancel)
        if (requestData?.status !== 'pending') {
          throw new AppError('REQUEST_PROCESSED', `Friend request already ${requestData?.status || 'processed'}`, 'business');
        }

        senderId = requestData?.senderId;
        recipientId = requestData?.recipientId;
        senderName = requestData?.senderName || 'Unknown';
        recipientName = requestData?.recipientName || 'Unknown';
        const senderProfileImageUrl = requestData?.senderProfileImageUrl ?? null;

        if (!senderId || !recipientId) throw new AppError('INVALID_REQUEST', 'Invalid friend request data: missing user IDs', 'validation');

        // Fetch recipient's profile image
        const recipientDoc = await transaction.get(doc(db, 'users', recipientId));
        if (recipientDoc.exists()) {
          recipientProfileImageUrl = recipientDoc.data()?.profile?.profileImageUrl ?? null;
        }

        // Create bidirectional friend docs
        // SECURITY FIX (S2): Include requestId so Firestore rules can verify a prior
        // accepted friendRequest exists between these two users.
        const friendDoc1Ref = doc(collection(db, 'friends'));
        transaction.set(friendDoc1Ref, {
          userId: senderId,
          friendId: recipientId,
          friendName: recipientName,
          friendProfileImageUrl: recipientProfileImageUrl ?? null,
          createdAt: serverTimestamp(),
          addedAt: serverTimestamp(),
          requestId,
        });

        const friendDoc2Ref = doc(collection(db, 'friends'));
        transaction.set(friendDoc2Ref, {
          userId: recipientId,
          friendId: senderId,
          friendName: senderName,
          friendProfileImageUrl: senderProfileImageUrl ?? null,
          createdAt: serverTimestamp(),
          addedAt: serverTimestamp(),
          requestId,
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
      } catch (err: unknown) {
        logger.warn('Could not clean up friend request notifications:', err);
      }

      analyticsService.trackEvent('friend_request_accepted', 'social', { requestId, senderId, recipientId });
      logger.log(`✅ Friend request accepted and removed: ${senderName} ↔ ${recipientName}`);
    } catch (error: unknown) {
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

      // Verify the current user is the intended recipient before declining
      if (requestData?.recipientId !== auth.currentUser?.uid) {
        throw new AppError('UNAUTHORIZED', 'Not authorized to decline this friend request', 'auth');
      }

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
        } catch (err: unknown) {
          logger.warn('Could not clean up friend request notifications:', err);
        }
      }

      analyticsService.trackEvent('friend_request_declined', 'social', { requestId });
      logger.log(`❌ Friend request declined and removed: ${requestId}`);
    } catch (error: unknown) {
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
          createdAt: toDateSafe(data.createdAt),
          updatedAt: toDateSafe(data.updatedAt),
        };
      }) as FriendRequest[];
    } catch (error: unknown) {
      logger.error('❌ Error getting pending friend requests:', error);
      return [];
    }
  }

  async getSentFriendRequests(userId: string): Promise<FriendRequest[]> {
    if (!userId) return [];

    try {
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
        createdAt: toDateSafe(doc.data().createdAt),
        updatedAt: toDateSafe(doc.data().updatedAt),
      })) as FriendRequest[];
    } catch (error: unknown) {
      logger.error('Error getting sent friend requests:', error);
      return [];
    }
  }

  async getFriends(userId: string): Promise<Friend[]> {
    if (!userId) return [];

    try {
      const friendsRef = collection(db, 'friends');
      const q = query(friendsRef, where('userId', '==', userId));
      const snap = await getDocs(q);
      const friends = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: toDateSafe(doc.data().createdAt),
      })) as Friend[];

      return friends.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error: unknown) {
      logger.error('Error getting friends:', error);
      return [];
    }
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    if (!userId || !friendId) return;

    if (userId !== auth.currentUser?.uid) {
      throw new AppError('UNAUTHORIZED', 'Not authorized to remove friends for another user', 'auth');
    }

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
    } catch (error: unknown) {
      logger.error('❌ Error removing friend:', error);
      throw error;
    }
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    if (!userId1 || !userId2) return false;
    try {
      const q = query(collection(db, 'friends'), where('userId', '==', userId1), where('friendId', '==', userId2));
      const snap = await getDocs(q);
      return !snap.empty;
    } catch (error: unknown) {
      logger.error('Error checking areFriends:', error);
      return false;
    }
  }

  async hasPendingRequest(userId1: string, userId2: string): Promise<boolean> {
    if (!userId1 || !userId2) return false;
    try {
      const q = query(
        collection(db, 'friendRequests'),
        where('senderId', '==', userId1),
        where('recipientId', '==', userId2),
        where('status', '==', 'pending')
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch (error: unknown) {
      logger.error('Error checking hasPendingRequest:', error);
      return false;
    }
  }

  async getFriendRequest(senderId: string, recipientId: string): Promise<FriendRequest | null> {
    if (!senderId || !recipientId) return null;

    try {
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
        createdAt: toDateSafe(docSnap.data().createdAt),
        updatedAt: toDateSafe(docSnap.data().updatedAt),
      } as FriendRequest;
    } catch (error: unknown) {
      logger.error('Error getting friend request:', error);
      return null;
    }
  }

  private async addFriend(userId: string, friendId: string, friendName: string, friendProfileImageUrl?: string | null): Promise<void> {
    if (!userId || !friendId || !friendName) return;

    try {
      await addDoc(collection(db, 'friends'), {
        userId,
        friendId,
        friendName,
        friendProfileImageUrl: friendProfileImageUrl ?? null,
        createdAt: serverTimestamp(),
      });
    } catch (error: unknown) {
      logger.error('❌ Error adding friend:', error);
      throw error;
    }
  }

  async getFriendCount(userId: string): Promise<number> {
    if (!userId) return 0;
    try {
      const friendsRef = collection(db, 'friends');
      const q = query(friendsRef, where('userId', '==', userId));
      const snap = await getDocs(q);
      return snap.size;
    } catch (error: unknown) {
      logger.error('Error getting friend count:', error);
      return 0;
    }
  }
}

export const friendService = FriendService.getInstance();
