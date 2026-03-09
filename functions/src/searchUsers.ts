import { onCall } from "firebase-functions/v2/https";
import { allowedOrigins } from "./cors";

export const searchUsers = onCall(
  {
    region: "europe-west1",
    cors: allowedOrigins,
  },
  async (requestData) => {
    console.log("🔍 searchUsers called");

    // ✅ SECURITY: Authentication check
    const auth = requestData.auth;
    if (!auth?.uid) {
      throw new Error("User must be authenticated to search users.");
    }

    const userId = auth.uid;
    const data = (requestData?.data || requestData) as any;
    const { searchTerm } = data;

    // ✅ VALIDATION: searchTerm checks
    if (!searchTerm || typeof searchTerm !== "string") {
      throw new Error("searchTerm must be a non-empty string.");
    }

    const trimmedSearchTerm = searchTerm.trim();

    if (trimmedSearchTerm.length < 2) {
      throw new Error("searchTerm must be at least 2 characters long.");
    }

    if (trimmedSearchTerm.length > 50) {
      throw new Error("searchTerm cannot exceed 50 characters.");
    }

    // ✅ RATE LIMITING: Max 30 searches per minute
    const now = Date.now();
    const oneMinuteAgo = now - (60 * 1000);
    const RATE_LIMIT = 30; // Maximum searches per minute per user

    // Import test db from index
    const { db } = await import('./index.js');

    // Check rate limit using Firestore
    const rateLimitRef = db.collection('rateLimits').doc(`search_${userId}`);
    const rateLimitDoc = await rateLimitRef.get();

    if (rateLimitDoc.exists) {
      const rateLimitData = rateLimitDoc.data();
      const recentRequests = (rateLimitData?.requests || []).filter(
        (timestamp: number) => timestamp > oneMinuteAgo
      );

      if (recentRequests.length >= RATE_LIMIT) {
        console.warn(`⚠️ Search rate limit exceeded for user ${userId}`);
        throw new Error("Rate limit exceeded. Please try again in a minute.");
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

      // Fetch all users from test db
      const usersSnapshot = await db.collection('users').get();

      // Fetch current user's friends and pending requests
      const [friendsSnapshot, sentRequestsSnapshot, receivedRequestsSnapshot] = await Promise.all([
        db.collection('friends').where('userId', '==', userId).get(),
        db.collection('friendRequests').where('senderId', '==', userId).get(),
        db.collection('friendRequests').where('receiverId', '==', userId).get(),
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
          pendingRequestIds.add(reqData.receiverId);
        }
      });
      receivedRequestsSnapshot.forEach((doc) => {
        const reqData = doc.data();
        if (reqData.status === 'pending') {
          pendingRequestIds.add(reqData.senderId);
        }
      });

      // Filter and map users
      const results: any[] = [];

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

      console.log(`✅ Found ${limitedResults.length} users for search: "${trimmedSearchTerm}"`);

      return {
        users: limitedResults,
        count: limitedResults.length,
      };
    } catch (err: any) {
      console.error("searchUsers error:", err?.message || err);
      throw new Error("Failed to search users.");
    }
  }
);
