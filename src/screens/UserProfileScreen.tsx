import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { commonStyles } from '../styles/commonStyles';
import { Edit2, Users, Award, Gift, Heart } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { Goal, UserProfile, Experience, User } from '../types';
import { useRootNavigation } from '../types/navigation';
import { goalService } from '../services/GoalService';
import { userService } from '../services/userService';
import { experienceGiftService } from '../services/ExperienceGiftService';
import { notificationService } from '../services/NotificationService';
import MainScreen from './MainScreen';
import { storage, db } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, arrayRemove, getDoc } from 'firebase/firestore';

//👇 you'll need these services in your project for partner & experience lookups
import { experienceService } from '../services/ExperienceService';
import { partnerService } from '../services/PartnerService';
import { logger } from '../utils/logger';
import { serializeNav } from '../utils/serializeNav';
import Colors from '../config/colors';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SkeletonBox } from '../components/SkeletonLoader';
import ErrorRetry from '../components/ErrorRetry';

// =========================
// Goal Card (Active goals)
// =========================
const CapsuleMini: React.FC<{ filled: boolean }> = ({ filled }) => (
  <View
    style={{
      flex: 1,
      height: 8,
      borderRadius: 50,
      backgroundColor: filled ? Colors.primary : Colors.border,
      marginHorizontal: 2,
    }}
  />
);

const GoalCard: React.FC<{ goal: Goal }> = ({ goal }) => {
  const navigation = useRootNavigation();
  const [empoweredName, setEmpoweredName] = useState<string | null>(null);

  useEffect(() => {
    if (goal.empoweredBy) {
      userService.getUserName(goal.empoweredBy).then(setEmpoweredName);
    }
  }, [goal.empoweredBy]);

  // Sessions this week
  const weeklyFilled = Math.max(0, goal.weeklyCount || 0);
  const weeklyTotal = Math.max(1, goal.sessionsPerWeek || 1);

  // Weeks completed
  const finishedThisWeek = goal.weeklyCount >= goal.sessionsPerWeek;
  const totalWeeks = goal.targetCount || 1;
  const base = goal.currentCount || 0;
  const completedWeeks = goal.isCompleted
    ? totalWeeks
    : Math.min(base + (finishedThisWeek ? 1 : 0), totalWeeks);

  const handlePress = () => {
    navigation.navigate('Journey', { goal });
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      style={styles.goalCard}
    >
      <Text style={styles.goalTitle}>{goal.title}</Text>

      {empoweredName && goal.empoweredBy !== goal.userId && !goal.isFreeGoal && (
        <Text style={styles.goalMeta}>⚡ Empowered by {empoweredName}</Text>
      )}

      {/* Sessions this week */}
      <View style={{ marginTop: 12 }}>
        <View style={styles.progressHeaderRow}>
          <Text style={styles.progressHeaderLabel}>Sessions this week</Text>
          <Text style={styles.progressHeaderValue}>
            {weeklyFilled}/{weeklyTotal}
          </Text>
        </View>

        <View style={{ flexDirection: 'row' }}>
          {Array.from({ length: weeklyTotal }).map((_, i) => (
            <CapsuleMini key={i} filled={i < weeklyFilled} />
          ))}
        </View>
      </View>

      {/* Weeks completed */}
      <View style={{ marginTop: 14 }}>
        <View style={styles.progressHeaderRow}>
          <Text style={styles.progressHeaderLabel}>Weeks completed</Text>
          <Text style={styles.progressHeaderValue}>
            {completedWeeks}/{totalWeeks}
          </Text>
        </View>

        <View style={{ flexDirection: 'row' }}>
          {Array.from({ length: totalWeeks }).map((_, i) => (
            <CapsuleMini key={i} filled={i < completedWeeks} />
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ==================================
// Achievement Card (Completed goals)
// ==================================
const StatsRow: React.FC<{ sessions: number; weeks: number; completedAt: string | null }> = ({ sessions, weeks, completedAt }) => (
  <View style={styles.achStatsRow}>
    <View style={styles.achStatItem}>
      <Text style={styles.achStatValue}>{sessions}</Text>
      <Text style={styles.achStatLabel}>sessions</Text>
    </View>
    <View style={styles.achStatDivider} />
    <View style={styles.achStatItem}>
      <Text style={styles.achStatValue}>{weeks}</Text>
      <Text style={styles.achStatLabel}>weeks</Text>
    </View>
    {completedAt && (
      <>
        <View style={styles.achStatDivider} />
        <View style={styles.achStatItem}>
          <Text style={styles.achStatLabel}>{completedAt}</Text>
        </View>
      </>
    )}
  </View>
);

const AchievementCard: React.FC<{ goal: Goal }> = ({ goal }) => {
  const navigation = useRootNavigation();
  const [experience, setExperience] = useState<Experience | null>(null);
  const [partnerName, setPartnerName] = useState<string>('Partner');
  const [gift, setGift] = useState<any>(null);
  const [loadingCard, setLoadingCard] = useState<boolean>(true);

  const isSelfAchievement = goal.isFreeGoal && !goal.pledgedExperience && !goal.experienceGiftId;
  const hasPledgedExperience = goal.isFreeGoal && !!goal.pledgedExperience;

  useEffect(() => {
    const loadAchievementData = async () => {
      try {
        // Self-achievement or pledged: no remote data needed
        if (isSelfAchievement || hasPledgedExperience) {
          setLoadingCard(false);
          return;
        }

        // Standard goals
        if (!goal.experienceGiftId) { setLoadingCard(false); return; }
        try {
          const giftData = await experienceGiftService.getExperienceGiftById(goal.experienceGiftId);
          setGift(giftData);
          const exp = await experienceService.getExperienceById(giftData.experienceId);
          setExperience(exp || null);
          setPartnerName(exp?.subtitle || 'Partner')
        } catch (dataErr) {
          logger.warn('Error fetching gift/experience data:', dataErr);
        }
      } catch (err) {
        logger.error('Error loading achievement data:', err);
      } finally {
        setLoadingCard(false);
      }
    };
    loadAchievementData();
  }, [goal.experienceGiftId]);

  const weeks = goal.targetCount || 0;
  const sessions = (goal.targetCount || 0) * (goal.sessionsPerWeek || 0);

  const handlePress = () => {
    navigation.navigate('AchievementDetail', { goal });
  };

  // Completion date
  const completedAt = goal.completedAt
    ? new Date(typeof goal.completedAt === 'object' && 'toDate' in goal.completedAt
      ? (goal.completedAt as { toDate: () => Date }).toDate()
      : goal.completedAt
    ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // Self-achievement card
  if (isSelfAchievement) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8}
        style={styles.achievementCard}>
        <View style={styles.achSelfBanner}>
          <Text style={{ fontSize: 28 }}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.achSelfLabel}>Self-Achievement</Text>
            <Text style={styles.achSelfTitle} numberOfLines={2}>{goal.title}</Text>
          </View>
        </View>
        <View style={styles.achievementContent}>
          <StatsRow sessions={sessions} weeks={weeks} completedAt={completedAt} />
        </View>
      </TouchableOpacity>
    );
  }

  // Pledged experience card
  if (hasPledgedExperience && goal.pledgedExperience) {
    const pledged = goal.pledgedExperience;
    const cover = pledged.coverImageUrl;
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8} style={styles.achievementCard}>
        {cover ? (
          <View>
            <Image source={{ uri: cover }} style={styles.achievementImage} />
            <View style={styles.achCompletedBadge}>
              <Text style={styles.achCompletedBadgeText}>Completed</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.achColorBanner, { backgroundColor: Colors.primarySurface }]}>
            <Text style={{ fontSize: 36 }}>🎁</Text>
            <View style={styles.achCompletedBadge}>
              <Text style={styles.achCompletedBadgeText}>Completed</Text>
            </View>
          </View>
        )}
        <View style={styles.achievementContent}>
          <Text style={styles.achievementTitle} numberOfLines={1}>{goal.title}</Text>
          <Text style={styles.achGoalLabel} numberOfLines={1}>🎁 {pledged.title}</Text>
          <StatsRow sessions={sessions} weeks={weeks} completedAt={completedAt} />
        </View>
      </TouchableOpacity>
    );
  }

  // Standard/Valentine card
  const cover = experience?.coverImageUrl ||
    (experience?.imageUrl && experience.imageUrl.length > 0 ? experience.imageUrl[0] : undefined);

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8} style={styles.achievementCard}>
      {cover ? (
        <View>
          <Image source={{ uri: cover }} style={styles.achievementImage} />
          <View style={styles.achCompletedBadge}>
            <Text style={styles.achCompletedBadgeText}>Completed</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.achColorBanner, { backgroundColor: Colors.primarySurface }]}>
          <Text style={{ fontSize: 36 }}>🎁</Text>
          <View style={styles.achCompletedBadge}>
            <Text style={styles.achCompletedBadgeText}>Completed</Text>
          </View>
        </View>
      )}
      <View style={styles.achievementContent}>
        {loadingCard ? (
          <View style={styles.achSkeletonContainer}>
            <View style={[styles.achSkeletonLine, { width: '70%' }]} />
            <View style={[styles.achSkeletonLine, { width: '50%', height: 10 }]} />
            <View style={[styles.achSkeletonLine, { width: '90%', height: 10 }]} />
          </View>
        ) : (
          <>
            <Text style={styles.achievementTitle} numberOfLines={1}>
              {goal.title}
            </Text>
            <Text style={styles.achGoalLabel} numberOfLines={1}>🎁 {experience?.title || 'Experience'}</Text>
            <StatsRow sessions={sessions} weeks={weeks} completedAt={completedAt} />
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ==================================
// Experience Card (Wishlist)
// ==================================
type ExperienceCardProps = {
  experience: Experience;
  onRemoveFromWishlist: (experienceId: string) => void;
};

const ExperienceCard: React.FC<ExperienceCardProps> = ({ experience, onRemoveFromWishlist }) => {
  const navigation = useRootNavigation();

  const handlePress = () => {
    navigation.navigate('ExperienceDetails', { experience });
  };

  const experienceImage = Array.isArray(experience.imageUrl)
    ? experience.imageUrl[0]
    : experience.imageUrl;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.experienceCard}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`View ${experience.title} experience details`}
    >
      <View style={styles.experienceImageContainer}>
        <Image
          source={{ uri: experienceImage }}
          style={styles.experienceImage}
          resizeMode="cover"
          accessibilityLabel={`${experience.title} experience`}
        />
        <TouchableOpacity
          onPress={() => onRemoveFromWishlist(experience.id)}
          style={styles.wishlistHeartButton}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${experience.title} from wishlist`}
        >
          <Heart fill={Colors.error} color={Colors.error} size={22} />
        </TouchableOpacity>
      </View>
      <View style={styles.experienceContent}>
        <Text style={styles.experienceTitle} numberOfLines={1}>
          {experience.title}
        </Text>
        <Text style={styles.experienceDescription} numberOfLines={2}>
          {experience.description}
        </Text>
        <Text style={styles.experiencePrice}>
          €{Number(experience.price || 0).toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const UserProfileScreen: React.FC = () => {
  const { state, dispatch } = useApp();
  const navigation = useRootNavigation();
  const { showSuccess, showError, showInfo } = useToast();
  const [activeTab, setActiveTab] = useState<'goals' | 'achievements' | 'wishlist'>('goals');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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
  const [formErrors, setFormErrors] = useState<{ name?: string; description?: string }>({});

  const userId = state.user?.id || 'current_user';
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useModalAnimation(isEditModalVisible);

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
      setError(false);
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
        (g) => {
          return g.isCompleted || g.currentCount >= g.targetCount;
        }
      );

      setActiveGoals(active);
      setCompletedGoals(completed);

      const userWishlist = await userService.getWishlist(userId);
      setWishlist(userWishlist || []);
    } catch (error) {
      logger.error('Error loading profile data:', error);
      setError(true);
      showError('Could not load profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ✅ Unified image picker and upload for all platforms
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showError('We need camera roll permissions to upload photos!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
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
        logger.error('Upload failed:', uploadErr);
        showError('Could not upload profile image.');
      }
    }
  };

  const openEditModal = () => {
    setEditFormData({
      name: userProfile?.name || state.user?.displayName || '',
      description: userProfile?.description || state.user?.profile?.description || '',
      profileImageUrl: userProfile?.profileImageUrl || '',
    });
    setFormErrors({});
    setIsEditModalVisible(true);
  };

  const validateField = (field: 'name' | 'description', value: string) => {
    if (field === 'name') {
      if (!value.trim()) {
        setFormErrors(prev => ({ ...prev, name: 'Name is required' }));
      } else if (value.trim().length < 2) {
        setFormErrors(prev => ({ ...prev, name: 'Name must be at least 2 characters' }));
      } else {
        setFormErrors(prev => ({ ...prev, name: undefined }));
      }
    }
    if (field === 'description') {
      if (value.length > 280) {
        setFormErrors(prev => ({ ...prev, description: `${300 - value.length} characters remaining` }));
      } else {
        setFormErrors(prev => ({ ...prev, description: undefined }));
      }
    }
  };

  const handleSaveProfile = async () => {
    // Inline validation check
    const nameVal = editFormData.name.trim();
    if (!nameVal || nameVal.length < 2) {
      setFormErrors(prev => ({ ...prev, name: nameVal ? 'Name must be at least 2 characters' : 'Name is required' }));
      return;
    }
    if (editFormData.description.length > 300) {
      setFormErrors(prev => ({ ...prev, description: 'Please keep under 300 characters' }));
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
      showSuccess('Profile updated!');
    } catch (error) {
      logger.error('Error updating profile:', error);
      showError('Failed to update profile.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveFromWishlist = async (experienceId: string) => {
    if (!state.user) {
      showInfo('Please log in to manage wishlist.');
      return;
    }

    try {
      const userRef = doc(db, 'users', state.user.id);
      await updateDoc(userRef, { wishlist: arrayRemove(experienceId) });

      // Update local state
      setWishlist((prev) => prev.filter((exp) => exp.id !== experienceId));

      // Update context if needed
      if (state.user) {
        // Filter based on Experience type having an id property
        const updatedWishlist = (state.user.wishlist || []).filter((exp) =>
          typeof exp === 'string' ? exp !== experienceId : exp.id !== experienceId
        );
        dispatch({ type: 'SET_USER', payload: { ...state.user, wishlist: updatedWishlist } });
      }
    } catch (error) {
      logger.error('Error removing from wishlist:', error);
      showError('Failed to remove item from wishlist. Please try again.');
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={{ marginTop: 20, gap: 16, paddingHorizontal: 20 }}>
          <SkeletonBox width="100%" height={80} borderRadius={12} />
          <SkeletonBox width="60%" height={20} borderRadius={8} />
          <SkeletonBox width="100%" height={120} borderRadius={12} />
          <SkeletonBox width="80%" height={20} borderRadius={8} />
        </View>
      );
    }

    if (error) {
      return <ErrorRetry message="Could not load profile data" onRetry={loadProfileAndGoals} />;
    }

    if (activeTab === 'goals') {
      if (!activeGoals.length) {
        return <Text style={styles.emptyStateText}>No goals yet.</Text>;
      }
      return activeGoals.map((goal) => <GoalCard key={goal.id} goal={goal} />);
    }

    if (activeTab === 'achievements') {
      if (!completedGoals.length) {
        return <Text style={styles.emptyStateText}>No achievements yet.</Text>;
      }
      return completedGoals.map((goal) => (
        <AchievementCard key={goal.id} goal={goal} />
      ));
    }

    // wishlist
    if (!wishlist.length) {
      return <Text style={styles.emptyStateText}>No wishlist yet.</Text>;
    }

    return wishlist.map((exp) => (
      <ExperienceCard key={exp.id} experience={exp} onRemoveFromWishlist={handleRemoveFromWishlist} />
    ));
  };

  return (
    <ErrorBoundary screenName="UserProfileScreen" userId={userId}>
      <MainScreen activeRoute="Profile">
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <View style={styles.profileImageContainer}>
              {userProfile?.profileImageUrl && userProfile.profileImageUrl.trim() !== '' ? (
                <Image
                  source={{ uri: userProfile.profileImageUrl }}
                  style={styles.profileImage}
                  accessibilityLabel="Your profile picture"
                />
              ) : (
                <View style={styles.placeholderImage}>
                  <Text style={styles.placeholderText}>
                    {state.user?.displayName?.[0]?.toUpperCase() || 'U'}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.editIconButton}
                onPress={openEditModal}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
              >
                <Edit2 color={Colors.secondary} size={18} />
              </TouchableOpacity>
            </View>

            <Text style={styles.userName}>
              {userProfile?.name || state.user?.displayName || 'User'}
            </Text>
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
              accessibilityRole="button"
              accessibilityLabel="View friends list"
            >
              <Users color={Colors.secondary} size={20} />
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
            {([
              { key: 'goals' as const, label: 'Goals', icon: Gift },
              { key: 'achievements' as const, label: 'Achievements', icon: Award },
              { key: 'wishlist' as const, label: 'Wishlist', icon: Gift },
            ] as const).map((tab) => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[
                  styles.tabButton,
                  activeTab === tab.key && styles.tabButtonActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`View ${tab.label} tab`}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === tab.key && styles.tabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [
                {
                  translateY: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            }}
          >
            {renderContent()}
          </Animated.View>

          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Edit Modal */}
        <Modal
          visible={isEditModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setIsEditModalVisible(false)}
        >
          <TouchableOpacity
            style={commonStyles.modalOverlay}
            activeOpacity={1}
            onPress={() => setIsEditModalVisible(false)}
          >
            <Animated.View
              style={[
                styles.modalContainer,
                {
                  transform: [{ translateY: slideAnim }],
                  marginTop: 50, // Top offset
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  overflow: 'hidden',
                },
              ]}
            >
              <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ flex: 1 }}>
                <KeyboardAvoidingView
                  style={{ flex: 1 }}
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
                      <Text
                        style={[styles.modalSaveText, isUpdating && styles.disabledText]}
                      >
                        {isUpdating ? 'Saving...' : 'Save'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.modalContent}>
                    <View style={styles.imageSection}>
                      <TouchableOpacity onPress={pickImage} style={styles.imagePickerButton}>
                        {editFormData.profileImageUrl &&
                          editFormData.profileImageUrl.trim() !== '' ? (
                          <Image
                            source={{ uri: editFormData.profileImageUrl }}
                            style={styles.editProfileImage}
                          />
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
                        style={[styles.textInput, formErrors.name ? { borderColor: '#ef4444', borderWidth: 1.5 } : {}]}
                        value={editFormData.name}
                        onChangeText={(text) => {
                          setEditFormData((prev) => ({ ...prev, name: text }));
                          validateField('name', text);
                        }}
                        placeholder="Enter your name"
                        maxLength={50}
                      />
                      {formErrors.name && (
                        <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{formErrors.name}</Text>
                      )}
                    </View>

                    <View style={styles.inputSection}>
                      <Text style={styles.inputLabel}>
                        About You ({editFormData.description.length}/300)
                      </Text>
                      <TextInput
                        style={[styles.textInput, styles.descriptionInput, formErrors.description ? { borderColor: '#ef4444', borderWidth: 1.5 } : {}]}
                        value={editFormData.description}
                        onChangeText={(text) => {
                          setEditFormData((prev) => ({ ...prev, description: text }));
                          validateField('description', text);
                        }}
                        placeholder="Tell us about yourself..."
                        multiline
                        numberOfLines={6}
                        textAlignVertical="top"
                        maxLength={300}
                      />
                      {formErrors.description && (
                        <Text style={{ color: editFormData.description.length > 300 ? '#ef4444' : '#f59e0b', fontSize: 12, marginTop: 4 }}>{formErrors.description}</Text>
                      )}
                    </View>
                  </ScrollView>
                </KeyboardAvoidingView>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </Modal>
      </MainScreen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  heroSection: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },

  // progress headers (for mini capsules in goals)
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressHeaderLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  progressHeaderValue: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '600',
  },

  profileImageContainer: { position: 'relative', marginBottom: 16 },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: Colors.backgroundLight,
  },
  placeholderImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.secondary,
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
    borderColor: Colors.backgroundLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userName: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  userDescription: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
    lineHeight: 22,
  },
  statsRow: { flexDirection: 'row', gap: 32, marginBottom: 24 },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: '700', color: Colors.secondary, marginBottom: 4 },
  statLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  friendsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primaryTint,
    position: 'relative',
  },
  friendsButtonText: { fontSize: 16, fontWeight: '600', color: Colors.secondary },
  notificationBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: Colors.error,
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
  tabButtonActive: { backgroundColor: Colors.secondary },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: '#fff' },

  // Active goal card
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
  goalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  goalMeta: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },

  // Wishlist card
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
  experienceImage: { width: '100%', height: 140, backgroundColor: Colors.border },
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
  experienceTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  experienceDescription: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 8 },
  experiencePrice: { fontSize: 18, fontWeight: '700', color: Colors.secondary },

  // ACHIEVEMENT CARD
  achievementCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  achievementImage: {
    width: '100%',
    height: 150,
    backgroundColor: Colors.border,
  },
  achievementContent: {
    padding: 14,
  },
  achievementTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },

  // Stats row
  achStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.backgroundLight,
  },
  achStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  achStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  achStatLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textMuted,
    marginTop: 1,
  },
  achStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.backgroundLight,
  },

  // Self-achievement banner
  achSelfBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primaryBorder,
  },
  achSelfLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  achSelfTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },

  // Completed badge overlay
  achCompletedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(5, 150, 105, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  achCompletedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },

  // Color banner fallback (no image)
  achColorBanner: {
    width: '100%',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Goal label
  achGoalLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Partner label
  achPartnerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 4,
    marginBottom: 2,
  },

  // Skeleton loading
  achSkeletonContainer: {
    gap: 8,
  },
  achSkeletonLine: {
    height: 14,
    backgroundColor: Colors.backgroundLight,
    borderRadius: 4,
  },


  emptyStateText: { textAlign: 'center', marginTop: 40, color: Colors.textMuted, fontSize: 16 },
  modalContainer: { flex: 1, backgroundColor: Colors.surface },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalCancelButton: { paddingVertical: 8 },
  modalCancelText: { fontSize: 16, color: Colors.secondary },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  modalSaveButton: { paddingVertical: 8 },
  modalSaveText: { fontSize: 16, color: Colors.secondary, fontWeight: '600' },
  disabledButton: { opacity: 0.5 },
  disabledText: { color: Colors.textMuted },
  modalContent: { flex: 1, padding: 20 },
  imageSection: { alignItems: 'center', marginBottom: 32 },
  imagePickerButton: { position: 'relative', marginBottom: 12 },
  editProfileImage: { width: 100, height: 100, borderRadius: 50 },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.secondary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  imageOverlayText: { fontSize: 16 },
  imagePickerLabel: { fontSize: 14, color: Colors.textSecondary },
  inputSection: { marginBottom: 24 },
  inputLabel: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8 },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  descriptionInput: { height: 120, textAlignVertical: 'top' },
});

export default UserProfileScreen;
