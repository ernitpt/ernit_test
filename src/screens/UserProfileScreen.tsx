import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Edit2, Users, Award, Gift, Heart } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { Goal, UserProfile, Experience, User, RootStackParamList } from '../types';
import { goalService } from '../services/GoalService';
import { userService } from '../services/userService';
import { experienceGiftService } from '../services/ExperienceGiftService';
import { notificationService } from '../services/NotificationService';
import MainScreen from './MainScreen';
import { storage, db } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, arrayRemove } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

type UserProfileNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Profile'>;

const UserProfileScreen: React.FC = () => {
  const { state, dispatch } = useApp();
  const navigation = useNavigation<UserProfileNavigationProp>();
  const [activeTab, setActiveTab] = useState<'goals' | 'achievements' | 'wishlist'>('goals');
  const [loading, setLoading] = useState(true);
  const [completedGoals, setCompletedGoals] = useState<Goal[]>([]);
  const [activeGoals, setActiveGoals] = useState<Goal[]>([]);
  const [wishlist, setWishlist] = useState<Experience[]>([]);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [unreadFriendRequests, setUnreadFriendRequests] = useState(0);
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: '',
    profileImageUrl: '',
  });

  const userId = state.user?.id || 'current_user';
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadProfileAndGoals();
  }, [userId]);

  useEffect(() => {
    if (userProfile) animateContent();
  }, [activeTab]);

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = notificationService.listenToUserNotifications(userId, (notifications) => {
      const friendRequestNotifications = notifications.filter(
        (n) => n.type === 'friend_request' && !n.read
      );
      setUnreadFriendRequests(friendRequestNotifications.length);
    });
    return unsubscribe;
  }, [userId]);

  const animateContent = () => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const loadProfileAndGoals = async () => {
    try {
      setLoading(true);
      const fetchedProfile = await userService.getUserProfile(userId);
      setUserProfile(fetchedProfile);

      const userGoals = await goalService.getUserGoals(userId);
      const active = userGoals.filter(
        (g) =>
          !g.isCompleted &&
          g.currentCount < g.targetCount &&
          (!g.startDate || new Date(g.startDate) <= new Date())
      );
      const completed = userGoals.filter(
        (g) => g.isCompleted || g.currentCount >= g.targetCount
      );

      setActiveGoals(active);
      setCompletedGoals(completed);

      const userWishlist = await userService.getWishlist(userId);
      setWishlist(userWishlist || []);
    } catch (error) {
      console.error('Error loading profile data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Unified image picker and upload for all platforms
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'We need camera roll permissions to upload photos!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const localUri = result.assets[0].uri;
      try {
        // 📤 Upload instantly so preview uses a valid Firebase URL (not blob:)
        const response = await fetch(localUri);
        const blob = await response.blob();
        const ext = localUri.split('.').pop()?.split('?')[0] || 'jpg';
        const filePath = `profile-images/${userId}/profile_${Date.now()}.${ext}`;
        const storageRef = ref(storage, filePath);
        await uploadBytes(storageRef, blob);
        const downloadUrl = await getDownloadURL(storageRef);

        setEditFormData((prev) => ({
          ...prev,
          profileImageUrl: downloadUrl,
        }));
      } catch (uploadErr) {
        console.error('Upload failed:', uploadErr);
        Alert.alert('Error', 'Could not upload profile image.');
      }
    }
  };

  const openEditModal = () => {
    setEditFormData({
      name: userProfile?.name || state.user?.displayName || '',
      description: userProfile?.description || state.user?.profile?.description || '',
      profileImageUrl: userProfile?.profileImageUrl || '',
    });
    setIsEditModalVisible(true);
  };

  const handleSaveProfile = async () => {
    if (editFormData.description.length > 300) {
      Alert.alert('Description too long', 'Please keep under 300 characters.');
      return;
    }

    try {
      setIsUpdating(true);
      const profileUpdates = {
        name: editFormData.name.trim() || userProfile?.name || '',
        description: editFormData.description.trim(),
        profileImageUrl: editFormData.profileImageUrl || '',
        updatedAt: new Date(),
      };

      const updatedProfile: UserProfile = {
        ...(userProfile as UserProfile),
        ...profileUpdates,
      };

      await userService.updateUserProfile(userId, { profile: updatedProfile });

      if (state.user) {
        const updatedUser: User = { ...state.user, profile: updatedProfile };
        dispatch({ type: 'SET_USER', payload: updatedUser });
      }

      setUserProfile(updatedProfile);
      setIsEditModalVisible(false);
      Alert.alert('Success', 'Profile updated!');
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile.');
    } finally {
      setIsUpdating(false);
    }
  };

  const GoalCard: React.FC<{ goal: Goal }> = ({ goal }) => {
    const [experienceGift, setExperienceGift] = useState<any>(null);
    const [empoweredName, setEmpoweredName] = useState<string | null>(null);

    useEffect(() => {
      if (goal.empoweredBy) {
        userService.getUserName(goal.empoweredBy).then(setEmpoweredName);
      }
      if (goal.isCompleted && goal.experienceGiftId) {
        experienceGiftService
          .getExperienceGiftById(goal.experienceGiftId)
          .then(setExperienceGift)
          .catch((err) => console.error('Error fetching experience gift:', err));
      }
    }, [goal.empoweredBy, goal.experienceGiftId]);

    const handlePress = () => {
      if (activeTab === 'achievements' && experienceGift) {
        navigation.navigate('Completion', { goal, experienceGift });
      }
    };

    return (
      <TouchableOpacity
        onPress={activeTab === 'achievements' ? handlePress : undefined}
        activeOpacity={activeTab === 'achievements' ? 0.7 : 1}
        style={styles.goalCard}
      >
        <Text style={styles.goalTitle}>{goal.title}</Text>
        {empoweredName && <Text style={styles.goalMeta}>⚡ Empowered by {empoweredName}</Text>}
        {activeTab === 'achievements' && experienceGift && (
          <Text style={styles.goalMeta}>🎁 {experienceGift.experience?.title}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const handleRemoveFromWishlist = async (experienceId: string) => {
    const auth = getAuth();
    const user = auth.currentUser;
    
    if (!user) {
      Alert.alert('Please log in to manage wishlist.');
      return;
    }

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { wishlist: arrayRemove(experienceId) });
      
      // Update local state
      setWishlist((prev) => prev.filter((exp) => exp.id !== experienceId));
      
      // Update context if needed
      if (state.user) {
        // Filter based on Experience type having an id property
        const updatedWishlist = (state.user.wishlist || []).filter(
          (exp) => typeof exp === 'string'
            ? exp !== experienceId
            : exp.id !== experienceId
        );
        dispatch({ type: 'SET_USER', payload: { ...state.user, wishlist: updatedWishlist } });
      }
    } catch (error) {
      console.error('Error removing from wishlist:', error);
      Alert.alert('Error', 'Failed to remove item from wishlist. Please try again.');
    }
  };

  const ExperienceCard: React.FC<{ experience: Experience }> = ({ experience }) => {
    const handlePress = () => {
      navigation.navigate('ExperienceDetails', { experience });
    };
    
    const experienceImage = Array.isArray(experience.imageUrl)
      ? experience.imageUrl[0]
      : experience.imageUrl;
    return (
      <TouchableOpacity activeOpacity={0.8} style={styles.experienceCard} onPress={handlePress}>
        <View style={styles.experienceImageContainer}>
          <Image source={{ uri: experienceImage }} style={styles.experienceImage} resizeMode="cover" />
          <TouchableOpacity
            onPress={() => handleRemoveFromWishlist(experience.id)}
            style={styles.wishlistHeartButton}
            activeOpacity={0.8}
          >
            <Heart fill="#ef4444" color="#ef4444" size={22} />
          </TouchableOpacity>
        </View>
        <View style={styles.experienceContent}>
          <Text style={styles.experienceTitle} numberOfLines={1}>
            {experience.title}
          </Text>
          <Text style={styles.experienceDescription} numberOfLines={2}>
            {experience.description}
          </Text>
          <Text style={styles.experiencePrice}>€{Number(experience.price || 0).toFixed(2)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderContent = () => {
    if (loading) {
      return <ActivityIndicator size="large" color="#8b5cf6" style={{ marginTop: 20 }} />;
    }

    let dataToRender: (Goal | Experience)[] = [];
    if (activeTab === 'goals') dataToRender = activeGoals;
    else if (activeTab === 'achievements') dataToRender = completedGoals;
    else dataToRender = wishlist;

    if (dataToRender.length === 0) {
      return <Text style={styles.emptyStateText}>No {activeTab} yet.</Text>;
    }

    return dataToRender.map((item: any) =>
      activeTab === 'wishlist' ? (
        <ExperienceCard key={item.id} experience={item} />
      ) : (
        <GoalCard key={item.id} goal={item} />
      )
    );
  };

  return (
    <MainScreen activeRoute="Profile">
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.profileImageContainer}>
            {userProfile?.profileImageUrl && userProfile.profileImageUrl.trim() !== '' ? (
              <Image source={{ uri: userProfile.profileImageUrl }} style={styles.profileImage} />
            ) : (
              <View style={styles.placeholderImage}>
                <Text style={styles.placeholderText}>
                  {state.user?.displayName?.[0]?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}
            <TouchableOpacity style={styles.editIconButton} onPress={openEditModal}>
              <Edit2 color="#8b5cf6" size={18} />
            </TouchableOpacity>
          </View>

          <Text style={styles.userName}>{userProfile?.name || state.user?.displayName || 'User'}</Text>
          {userProfile?.description && (
            <Text style={styles.userDescription}>{userProfile.description}</Text>
          )}

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{activeGoals.length}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{completedGoals.length}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{wishlist.length}</Text>
              <Text style={styles.statLabel}>Wishlist</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.friendsButton}
            onPress={() => navigation.navigate('FriendsList')}
          >
            <Users color="#8b5cf6" size={20} />
            <Text style={styles.friendsButtonText}>View Friends</Text>
            {unreadFriendRequests > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.badgeText}>{unreadFriendRequests}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {[
            { key: 'goals', label: 'Goals', icon: Gift },
            { key: 'achievements', label: 'Achievements', icon: Award },
            { key: 'wishlist', label: 'Wishlist', icon: Gift },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
              style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [
              { translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
            ],
          }}
        >
          {renderContent()}
        </Animated.View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={isEditModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setIsEditModalVisible(false)}
              style={styles.modalCancelButton}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <TouchableOpacity
              onPress={handleSaveProfile}
              disabled={isUpdating}
              style={[styles.modalSaveButton, isUpdating && styles.disabledButton]}
            >
              <Text style={[styles.modalSaveText, isUpdating && styles.disabledText]}>
                {isUpdating ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.imageSection}>
              <TouchableOpacity onPress={pickImage} style={styles.imagePickerButton}>
                {editFormData.profileImageUrl && editFormData.profileImageUrl.trim() !== '' ? (
                  <Image source={{ uri: editFormData.profileImageUrl }} style={styles.editProfileImage} />
                ) : (
                  <View style={styles.placeholderImage}>
                    <Text style={styles.placeholderText}>
                      {(editFormData.name?.[0] || 'U').toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.imageOverlay}>
                  <Text style={styles.imageOverlayText}>📷</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.imagePickerLabel}>Tap to change photo</Text>
            </View>

            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={editFormData.name}
                onChangeText={(text) => setEditFormData((prev) => ({ ...prev, name: text }))}
                placeholder="Enter your name"
                maxLength={50}
              />
            </View>

            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>
                About You ({editFormData.description.length}/300)
              </Text>
              <TextInput
                style={[styles.textInput, styles.descriptionInput]}
                value={editFormData.description}
                onChangeText={(text) => setEditFormData((prev) => ({ ...prev, description: text }))}
                placeholder="Tell us about yourself..."
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                maxLength={300}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </MainScreen>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  heroSection: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  profileImageContainer: { position: 'relative', marginBottom: 16 },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#f3f4f6',
  },
  placeholderImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { fontSize: 40, fontWeight: '700', color: '#fff' },
  editIconButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userName: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 4 },
  userDescription: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
    lineHeight: 22,
  },
  statsRow: { flexDirection: 'row', gap: 32, marginBottom: 24 },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: '700', color: '#8b5cf6', marginBottom: 4 },
  statLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  friendsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f5f3ff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9d5ff',
    position: 'relative',
  },
  friendsButtonText: { fontSize: 16, fontWeight: '600', color: '#8b5cf6' },
  notificationBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  tabsContainer: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, gap: 8 },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  tabButtonActive: { backgroundColor: '#8b5cf6' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#fff' },
  goalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  goalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  goalMeta: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  experienceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  experienceImageContainer: {
    position: 'relative',
  },
  experienceImage: { width: '100%', height: 140, backgroundColor: '#e5e7eb' },
  wishlistHeartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 6,
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  experienceContent: { padding: 16 },
  experienceTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 4 },
  experienceDescription: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 8 },
  experiencePrice: { fontSize: 18, fontWeight: '700', color: '#8b5cf6' },
  emptyStateText: { textAlign: 'center', marginTop: 40, color: '#9ca3af', fontSize: 16 },
  modalContainer: { flex: 1, backgroundColor: '#f9fafb' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalCancelButton: { paddingVertical: 8 },
  modalCancelText: { fontSize: 16, color: '#8b5cf6' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalSaveButton: { paddingVertical: 8 },
  modalSaveText: { fontSize: 16, color: '#8b5cf6', fontWeight: '600' },
  disabledButton: { opacity: 0.5 },
  disabledText: { color: '#9ca3af' },
  modalContent: { flex: 1, padding: 20 },
  imageSection: { alignItems: 'center', marginBottom: 32 },
  imagePickerButton: { position: 'relative', marginBottom: 12 },
  editProfileImage: { width: 100, height: 100, borderRadius: 50 },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#8b5cf6',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  imageOverlayText: { fontSize: 16 },
  imagePickerLabel: { fontSize: 14, color: '#6b7280' },
  inputSection: { marginBottom: 24 },
  inputLabel: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 8 },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  descriptionInput: { height: 120, textAlignVertical: 'top' },
});

export default UserProfileScreen;
