import { auth } from '../services/firebase';
import { db } from '../services/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';

export class FirebaseDebugger {
  /**
   * Check if user is authenticated
   */
  static checkAuth(): boolean {
    const user = auth.currentUser;
    console.log('🔐 Auth Status:', {
      isAuthenticated: !!user,
      userId: user?.uid,
      email: user?.email,
    });
    return !!user;
  }

  /**
   * Test basic Firestore access
   */
  static async testFirestoreAccess(): Promise<void> {
    try {
      console.log('🧪 Testing Firestore access...');
      
      // Test 1: Read user document
      const user = auth.currentUser;
      if (!user) {
        console.error('❌ No authenticated user');
        return;
      }

      console.log('📖 Testing user document read...');
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      console.log('✅ User document access:', userDoc.exists());

      // Test 2: Read notifications collection
      console.log('📖 Testing notifications collection...');
      const notificationsRef = collection(db, 'notifications');
      const notificationsSnapshot = await getDocs(notificationsRef);
      console.log('✅ Notifications collection access:', notificationsSnapshot.size, 'documents');

      // Test 3: Read friend requests collection
      console.log('📖 Testing friend requests collection...');
      const friendRequestsRef = collection(db, 'friendRequests');
      const friendRequestsSnapshot = await getDocs(friendRequestsRef);
      console.log('✅ Friend requests collection access:', friendRequestsSnapshot.size, 'documents');

      // Test 4: Read friends collection
      console.log('📖 Testing friends collection...');
      const friendsRef = collection(db, 'friends');
      const friendsSnapshot = await getDocs(friendsRef);
      console.log('✅ Friends collection access:', friendsSnapshot.size, 'documents');

      console.log('🎉 All Firestore tests passed!');

    } catch (error) {
      console.error('❌ Firestore access test failed:', error);
      
      if (error.code === 'permission-denied') {
        console.error('🚨 PERMISSION DENIED: Update your Firestore security rules!');
        console.error('📋 Go to Firebase Console → Firestore Database → Rules');
        console.error('📋 Replace with the rules from firestore.rules file');
      }
    }
  }

  /**
   * Test specific collection access
   */
  static async testCollectionAccess(collectionName: string): Promise<void> {
    try {
      console.log(`🧪 Testing ${collectionName} collection access...`);
      
      const user = auth.currentUser;
      if (!user) {
        console.error('❌ No authenticated user');
        return;
      }

      const collectionRef = collection(db, collectionName);
      const snapshot = await getDocs(collectionRef);
      console.log(`✅ ${collectionName} collection access:`, snapshot.size, 'documents');

    } catch (error) {
      console.error(`❌ ${collectionName} collection access failed:`, error);
    }
  }

  /**
   * Run all debug tests
   */
  static async runAllTests(): Promise<void> {
    console.log('🚀 Starting Firebase Debug Tests...');
    console.log('=====================================');
    
    // Check authentication
    const isAuthenticated = this.checkAuth();
    if (!isAuthenticated) {
      console.error('❌ User not authenticated. Please sign in first.');
      return;
    }

    // Test Firestore access
    await this.testFirestoreAccess();

    // Test individual collections
    await this.testCollectionAccess('users');
    await this.testCollectionAccess('notifications');
    await this.testCollectionAccess('friendRequests');
    await this.testCollectionAccess('friends');
    await this.testCollectionAccess('experienceGifts');

    console.log('=====================================');
    console.log('🏁 Debug tests completed!');
  }
}

// Export for easy debugging
export const firebaseDebugger = FirebaseDebugger;
