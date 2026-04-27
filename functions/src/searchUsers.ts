import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { allowedOrigins } from "./cors";
import { getFirestore } from "firebase-admin/firestore";

export const searchUsers = onCall(
  {
    region: "europe-west1",
    cors: allowedOrigins,
  },
  async (requestData) => {
    logger.info("🔍 searchUsers called");

    // ✅ SECURITY: Authentication check
    const auth = requestData.auth;
    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = auth.uid;
    const data = requestData.data as { searchTerm?: unknown };
    const { searchTerm } = data;

    // ✅ VALIDATION: searchTerm checks
    if (!searchTerm || typeof searchTerm !== "string") {
      throw new HttpsError('invalid-argument', 'searchTerm must be a non-empty string');
    }

    const trimmedSearchTerm = searchTerm.trim();

    if (trimmedSearchTerm.length < 2) {
      throw new HttpsError('invalid-argument', 'searchTerm must be at least 2 characters');
    }

    if (trimmedSearchTerm.length > 50) {
      throw new HttpsError('invalid-argument', 'searchTerm cannot exceed 50 characters');
    }

    // ✅ RATE LIMITING: Max 10 searches per minute per user
    const now = Date.now();
    const oneMinuteAgo = now - (60 * 1000);
    const RATE_LIMIT = 10; // Maximum searches per minute per user

    // Use getFirestore() directly — avoids a circular import through index.js
    const db = getFirestore();

    // Check rate limit using Firestore (single doc read — fast)
    const rateLimitRef = db.collection('rateLimits').doc(`search_${userId}`);
    const rateLimitDoc = await rateLimitRef.get();

    let recentRequests: number[] = [];
    if (rateLimitDoc.exists) {
      const rateLimitData = rateLimitDoc.data();
      recentRequests = (rateLimitData?.requests || []).filter(
        (timestamp: number) => timestamp > oneMinuteAgo
      );

      if (recentRequests.length >= RATE_LIMIT) {
        logger.warn(`⚠️ Search rate limit exceeded for user ${userId}`);
        throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again in a minute.');
      }
    }

    try {
      // Scan the first 500 users and substring-match in memory. Good enough for
      // current scale; revisit with an index/search-service if user count grows.
      // `.select()` keeps per-doc payload small — without it, each user doc
      // ships wishlist/cart which can be many KB. Parallelizing the rate-limit
      // write with the queries cuts a full roundtrip from the critical path.
      const searchLower = trimmedSearchTerm.toLowerCase();

      const [
        _rateLimitWrite,
        usersSnapshot,
        friendsSnapshot,
        sentRequestsSnapshot,
        receivedRequestsSnapshot,
      ] = await Promise.all([
        rateLimitRef.set({ requests: [...recentRequests, now], lastRequest: now }),
        db.collection('users')
          .select('displayName', 'profile.name', 'profile.description', 'profile.profileImageUrl', 'profile.country')
          .limit(500)
          .get(),
        db.collection('friends').where('userId', '==', userId).get(),
        db.collection('friendRequests').where('senderId', '==', userId).get(),
        db.collection('friendRequests').where('recipientId', '==', userId).get(),
      ]);

      // Build friend and pending request sets
      const friendIds = new Set<string>();
      friendsSnapshot.forEach((doc) => {
        const friendData = doc.data();
        friendIds.add(friendData.friendId);
      });

      const pendingRequestIds = new Set<string>();
      sentRequestsSnapshot.forEach((doc) => {
        const reqData = doc.data();
        if (reqData.status === 'pending') {
          pendingRequestIds.add(reqData.recipientId);
        }
      });
      receivedRequestsSnapshot.forEach((doc) => {
        const reqData = doc.data();
        if (reqData.status === 'pending') {
          pendingRequestIds.add(reqData.senderId);
        }
      });

      interface UserSearchResult {
        id: string;
        name: string;
        profileImageUrl: string | null;
        country: string | null;
        description: string | null;
        isFriend: boolean;
        hasPendingRequest: boolean;
      }

      const results: UserSearchResult[] = [];
      usersSnapshot.forEach((doc) => {
        const docId = doc.id;
        if (docId === userId) return; // skip self

        const userData = doc.data();
        const displayName = (userData.displayName || '').toLowerCase();
        const profileName = (userData.profile?.name || '').toLowerCase();

        // Case-insensitive substring match on name fields (country dropped
        // intentionally — was low-value and doubled the fields to scan).
        if (!displayName.includes(searchLower) && !profileName.includes(searchLower)) {
          return;
        }

        results.push({
          id: docId,
          name: userData.displayName || userData.profile?.name || 'Unknown User',
          profileImageUrl: userData.profile?.profileImageUrl || null,
          country: userData.profile?.country || null,
          description: userData.profile?.description || null,
          isFriend: friendIds.has(docId),
          hasPendingRequest: pendingRequestIds.has(docId),
        });
      });

      const limitedResults = results.slice(0, 20);
      logger.info(`✅ Found ${limitedResults.length} users for search: "${trimmedSearchTerm}"`);

      return {
        users: limitedResults,
        count: limitedResults.length,
      };
    } catch (err: unknown) {
      logger.error("searchUsers error:", (err as Error).message ?? String(err));
      throw new HttpsError('internal', 'Failed to search users');
    }
  }
);
