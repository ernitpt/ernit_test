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
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { FriendRequest, Friend, UserSearchResult } from '../types';
import { notificationService } from './NotificationService';

export class FriendService {
  private static instance: FriendService;

  static getInstance(): FriendService {
    if (!FriendService.instance) {
      FriendService.instance = new FriendService();
    }
    return FriendService.instance;
  }

  /**
   * 🔍 Search users by displayName, profile.name, email, or country (case-insensitive)
   */
  async searchUsers(searchTerm: string, currentUserId: string): Promise<UserSearchResult[]> {
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const lowerSearch = searchTerm.toLowerCase();

      const users: UserSearchResult[] = [];

      for (const userDoc of snapshot.docs) {
        const userData = userDoc.data();
        if (userDoc.id === currentUserId) continue;

        const profile = userData.profile || {};
        const displayName = (userData.displayName || '').toLowerCase();
        const name = (profile.name || '').toLowerCase();
        const country = (profile.country || '').toLowerCase();

        const matches =
          displayName.includes(lowerSearch) ||
          name.includes(lowerSearch) ||
          country.includes(lowerSearch);

        if (matches) {
          const isFriend = await this.areFriends(currentUserId, userDoc.id);
          const hasPendingRequest = await this.hasPendingRequest(currentUserId, userDoc.id);

          users.push({
            id: userDoc.id,
            name: userData.displayName || profile.name || 'Unknown User',
            email: userData.email || '',
            profileImageUrl: profile.profileImageUrl || null,
            country: profile.country || '',
            description: profile.description || '',
            isFriend,
            hasPendingRequest,
          });
        }
      }

      return users;
    } catch (error) {
      console.error('❌ Error searching users:', error);
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
      console.error('❌ Error sending friend request:', error);
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
      const requestDoc = await getDoc(requestRef);

      if (!requestDoc.exists()) {
        throw new Error('Friend request not found');
      }

      const requestData = requestDoc.data();

      const senderId = requestData?.senderId;
      const recipientId = requestData?.recipientId;
      const senderName = requestData?.senderName || 'Unknown';
      const recipientName = requestData?.recipientName || 'Unknown';
      const senderProfileImageUrl = requestData?.senderProfileImageUrl ?? null;

      if (!senderId || !recipientId) throw new Error('Invalid friend request data: missing user IDs');

      // Create bidirectional friendship
      await Promise.all([
        this.addFriend(senderId, recipientId, recipientName, senderProfileImageUrl),
        this.addFriend(recipientId, senderId, senderName, senderProfileImageUrl),
      ]);

      // Delete the friend request
      await deleteDoc(requestRef);

      console.log(`✅ Friend request accepted and removed: ${senderName} ↔ ${recipientName}`);
    } catch (error) {
      console.error('❌ Error accepting friend request:', error);
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
      await deleteDoc(requestRef);

      console.log(`❌ Friend request declined and removed: ${requestId}`);
    } catch (error) {
      console.error('❌ Error declining friend request:', error);
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
      console.error('❌ Error getting pending friend requests:', error);
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

      const deletions = [
        ...userToFriend.docs.map(doc => deleteDoc(doc.ref)),
        ...friendToUser.docs.map(doc => deleteDoc(doc.ref)),
      ];

      if (deletions.length > 0) await Promise.all(deletions);
    } catch (error) {
      console.error('❌ Error removing friend:', error);
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
      console.error('❌ Error adding friend:', error);
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
