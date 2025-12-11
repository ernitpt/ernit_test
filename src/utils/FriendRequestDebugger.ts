import { friendService } from '../services/FriendService';
import { auth } from '../services/firebase';

export class FriendRequestDebugger {
  /**
   * Test friend request functionality with proper validation
   */
  static async testFriendRequestFlow(): Promise<void> {
    try {
      console.log('🧪 Testing Friend Request Flow...');
      
      const user = auth.currentUser;
      if (!user) {
        console.error('❌ No authenticated user');
        return;
      }

      console.log('✅ User authenticated:', user.uid);

      // Test 1: Check if we can search users
      console.log('🔍 Testing user search...');
      const searchResults = await friendService.searchUsers('test', user.uid);
      console.log('✅ User search works:', searchResults.length, 'results');

      // Test 2: Check if we can get friends
      console.log('👥 Testing get friends...');
      const friends = await friendService.getFriends(user.uid);
      console.log('✅ Get friends works:', friends.length, 'friends');

      // Test 3: Check if we can get pending requests
      console.log('📬 Testing get pending requests...');
      const pendingRequests = await friendService.getPendingFriendRequests(user.uid);
      console.log('✅ Get pending requests works:', pendingRequests.length, 'requests');

      // Test 4: Check if we can get sent requests
      console.log('📤 Testing get sent requests...');
      const sentRequests = await friendService.getSentFriendRequests(user.uid);
      console.log('✅ Get sent requests works:', sentRequests.length, 'requests');

      console.log('🎉 All friend request tests passed!');

    } catch (error) {
      console.error('❌ Friend request test failed:', error);
      
      if (error.message.includes('undefined')) {
        console.error('🚨 UNDEFINED VALUE ERROR: Check parameter validation in FriendService');
      }
      
      if (error.code === 'permission-denied') {
        console.error('🚨 PERMISSION DENIED: Update Firestore security rules');
      }
    }
  }

  /**
   * Test sending a friend request with validation
   */
  static async testSendFriendRequest(
    recipientId: string,
    recipientName: string
  ): Promise<void> {
    try {
      console.log('📤 Testing send friend request...');
      
      const user = auth.currentUser;
      if (!user) {
        console.error('❌ No authenticated user');
        return;
      }

      // Validate parameters before sending
      if (!recipientId || !recipientName) {
        console.error('❌ Invalid parameters:', { recipientId, recipientName });
        return;
      }

      console.log('✅ Parameters validated:', {
        senderId: user.uid,
        senderName: user.displayName || 'Unknown',
        recipientId,
        recipientName,
      });

      // This would normally send the request, but we'll just validate
      console.log('✅ Friend request parameters are valid');

    } catch (error) {
      console.error('❌ Send friend request test failed:', error);
    }
  }

  /**
   * Debug current user state
   */
  static debugUserState(): void {
    const user = auth.currentUser;
    console.log('👤 Current User State:', {
      isAuthenticated: !!user,
      uid: user?.uid,
      email: user?.email,
      displayName: user?.displayName,
      photoURL: user?.photoURL,
    });
  }
}

export const friendRequestDebugger = FriendRequestDebugger;
