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

    // Check rate limit using Firestore
    const rateLimitRef = db.collection('rateLimits').doc(`search_${userId}`);
    const rateLimitDoc = await rateLimitRef.get();

    if (rateLimitDoc.exists) {
      const rateLimitData = rateLimitDoc.data();
      const recentRequests = (rateLimitData?.requests || []).filter(
        (timestamp: number) => timestamp > oneMinuteAgo
      );

      if (recentRequests.length >= RATE_LIMIT) {
        logger.warn(`⚠️ Search rate limit exceeded for user ${userId}`);
        throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again in a minute.');
      }

      // Update with new request
      await rateLimitRef.set({
        requests: [...recentRequests, now],
        lastRequest: now,
      });
    } else {
      // Create new rate limit document
      await rateLimitRef.set({
        requests: [now],
        lastRequest: now,
      });
    }

    try {
      // 🔍 SEARCH LOGIC
      const searchLower = trimmedSearchTerm.toLowerCase();

      // TODO: Implement proper search index (Algolia/Typesense) for scalable user search.
      // Current implementation: server-side filter over first 500 users — will miss
      // users beyond position 500. For prefix search via Firestore without a third-party
      // index, add a `displayNameLower` field and deploy a composite index, then use:
      //   .where('displayNameLower', '>=', searchLower)
      //   .where('displayNameLower', '<=', searchLower + '\uf8ff')
      //   .limit(20)
      // (firebase deploy --only firestore:indexes)
      const usersSnapshot = await db.collection('users').limit(500).get();

      // Fetch current user's friends and pending requests
      const [friendsSnapshot, sentRequestsSnapshot, receivedRequestsSnapshot] = await Promise.all([
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
      // Filter and map users
      const results: UserSearchResult[] = [];

      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        const docId = doc.id;

        // Skip current user
        if (docId === userId) {
          return;
        }

        // Extract fields
        const displayName = userData.displayName || '';
        const profileName = userData.profile?.name || '';
        const profileCountry = userData.profile?.country || '';

        // Case-insensitive substring match
        const matchesSearch =
          displayName.toLowerCase().includes(searchLower) ||
          profileName.toLowerCase().includes(searchLower) ||
          profileCountry.toLowerCase().includes(searchLower);

        if (matchesSearch) {
          // Build SAFE result object (NO email or sensitive data)
          const isFriend = friendIds.has(docId);
          const hasPendingRequest = pendingRequestIds.has(docId);

          results.push({
            id: docId,
            name: userData.displayName || userData.profile?.name || 'Unknown User',
            profileImageUrl: userData.profile?.profileImageUrl || null,
            country: userData.profile?.country || null,
            description: userData.profile?.description || null,
            isFriend,
            hasPendingRequest,
          });
        }
      });

      // Limit to 20 results
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
