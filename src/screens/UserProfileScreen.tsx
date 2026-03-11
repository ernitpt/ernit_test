import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Modal,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { TextInput } from '../components/TextInput';
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
import { useFocusEffect } from '@react-navigation/native';

//👇 you'll need these services in your project for partner & experience lookups
import { experienceService } from '../services/ExperienceService';
import { partnerService } from '../services/PartnerService';
import { logger } from '../utils/logger';
import { serializeNav } from '../utils/serializeNav';
import Colors from '../config/colors';
import { Typography } from '../config/typography';
import { Shadows } from '../config/shadows';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SkeletonBox } from '../components/SkeletonLoader';
import ClaimExperienceModal from '../components/ClaimExperienceModal';
import ErrorRetry from '../components/ErrorRetry';
import { EmptyState } from '../components/EmptyState';

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
      <Text style={styles.goalTitle} numberOfLines={2}>{goal.title}</Text>

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

      {/* Browse Experiences button for free goals without an experience */}
      {!goal.experienceGiftId && !goal.giftAttachedAt && goal.isFreeGoal && (
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            navigation.navigate('CategorySelection', {
              ...(goal.preferredRewardCategory ? { prefilterCategory: goal.preferredRewardCategory } : {}),
            });
          }}
          style={styles.browseButton}
          activeOpacity={0.7}
        >
          <Gift color={Colors.secondary} size={16} />
          <Text style={styles.browseButtonText}>Browse Experiences</Text>
        </TouchableOpacity>
      )}
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
  const [showClaimModal, setShowClaimModal] = useState(false);

  const isSelfAchievement = goal.isFreeGoal && !goal.pledgedExperience && !goal.experienceGiftId;
  const hasPledgedExperience = goal.isFreeGoal && !!goal.pledgedExperience;

  // Compute effective deadline: explicit field, or fallback to completedAt + 30 days
  const getEffectiveDeadline = (): Date | null => {
    if (goal.giftAttachDeadline) return new Date(goal.giftAttachDeadline);
    if (goal.completedAt) {
      const d = new Date(typeof goal.completedAt === 'object' && 'toDate' in goal.completedAt
        ? (goal.completedAt as any).toDate() : goal.completedAt);
      d.setDate(d.getDate() + 30);
      return d;
    }
    return null;
  };
  const effectiveDeadline = getEffectiveDeadline();

  const canClaimExperience = goal.isFreeGoal && !goal.giftAttachedAt && !goal.experienceGiftId
    && effectiveDeadline && effectiveDeadline > new Date();

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
    navigation.navigate('Journey', { goal });
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
          {canClaimExperience && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                setShowClaimModal(true);
              }}
              style={styles.claimExperienceButton}
              activeOpacity={0.7}
            >
              <Text style={styles.claimExperienceButtonText}>Claim Experience</Text>
            </TouchableOpacity>
          )}
        </View>

        <ClaimExperienceModal
          visible={showClaimModal}
          goalId={goal.id}
          preferredRewardCategory={goal.preferredRewardCategory}
          onClose={() => setShowClaimModal(false)}
        />
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
          {canClaimExperience && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                setShowClaimModal(true);
              }}
              style={styles.claimExperienceButton}
              activeOpacity={0.7}
            >
              <Text style={styles.claimExperienceButtonText}>Claim Experience</Text>
            </TouchableOpacity>
          )}
        </View>

        <ClaimExperienceModal
          visible={showClaimModal}
          goalId={goal.id}
          experienceTitle={pledged.title}
          experiencePrice={pledged.price}
          pledgedExperienceId={pledged.experienceId}
          preferredRewardCategory={goal.preferredRewardCategory}
          onClose={() => setShowClaimModal(false)}
        />
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

  useFocusEffect(
    React.useCallback(() => {
      loadProfileAndGoals();
    }, [userId])
  );

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

    // 1. Save previous state for rollback
    const previousProfile = userProfile;

    // 2. Prepare updated profile
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

    // 3. Update UI immediately
    setUserProfile(updatedProfile);
    if (state.user) {
      const updatedUser: User = { ...state.user, profile: updatedProfile };
      dispatch({ type: 'SET_USER', payload: updatedUser });
    }

    // 4. Close modal and show success immediately
    setIsEditModalVisible(false);
    showSuccess('Profile updated!');

    // 5. Call API in background
    try {
      await userService.updateUserProfile(userId, { profile: updatedProfile });
    } catch (error) {
      // 6. Rollback on failure
      logger.error('Error updating profile:', error);
      setUserProfile(previousProfile);
      if (state.user && previousProfile) {
        const revertedUser: User = { ...state.user, profile: previousProfile };
        dispatch({ type: 'SET_USER', payload: revertedUser });
      }
      showError('Failed to update profile. Please try again.');
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
        return <EmptyState icon="🎯" title="No Goals Yet" message="Start a goal to track your progress!" />;
      }
      return activeGoals.map((goal) => <GoalCard key={goal.id} goal={goal} />);
    }

    if (activeTab === 'achievements') {
      if (!completedGoals.length) {
        return <EmptyState icon="🏆" title="No Achievements Yet" message="Complete goals to earn achievements!" />;
      }
      return completedGoals.map((goal) => (
        <AchievementCard key={goal.id} goal={goal} />
      ));
    }

    // wishlist
    if (!wishlist.length) {
      return <EmptyState icon="⭐" title="No Wishlist Yet" message="Add experiences to your wishlist!" />;
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
              <Text style={styles.userDescription} numberOfLines={3}>{userProfile.description}</Text>
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
                      style={styles.modalSaveButton}
                    >
                      <Text style={styles.modalSaveText}>
                        Save
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

                    <TextInput
                      label="Name"
                      value={editFormData.name}
                      onChangeText={(text) => {
                        setEditFormData((prev) => ({ ...prev, name: text }));
                        validateField('name', text);
                      }}
                      placeholder="Enter your name"
                      maxLength={50}
                      error={formErrors.name}
                    />

                    <TextInput
                      label={`About You (${editFormData.description.length}/300)`}
                      value={editFormData.description}
                      onChangeText={(text) => {
                        setEditFormData((prev) => ({ ...prev, description: text }));
                        validateField('description', text);
                      }}
                      placeholder="Tell us about yourself..."
                      multiline
                      numberOfLines={6}
                      maxLength={300}
                      error={formErrors.description}
                      inputStyle={{ minHeight: 120 }}
                    />
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
    backgroundColor: Colors.white,
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
    ...Typography.small,
    color: Colors.textSecondary,
  },
  progressHeaderValue: {
    ...Typography.small,
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
  placeholderText: { fontSize: 40, fontWeight: '700', color: Colors.white },
  editIconButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.backgroundLight,
    ...Shadows.sm,
    shadowOpacity: 0.1,
  },
  userName: { ...Typography.heading1, color: Colors.textPrimary, marginBottom: 4 },
  userDescription: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  statsRow: { flexDirection: 'row', gap: 32, marginBottom: 24 },
  statItem: { alignItems: 'center' },
  statNumber: { ...Typography.heading1, color: Colors.secondary, marginBottom: 4 },
  statLabel: { ...Typography.small, color: Colors.textSecondary, fontWeight: '500' },
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
  friendsButtonText: { ...Typography.subheading, color: Colors.secondary },
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
    borderColor: Colors.white,
  },
  badgeText: { color: Colors.white, ...Typography.tiny },
  tabsContainer: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, gap: 8 },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.white,
    alignItems: 'center',
  },
  tabButtonActive: { backgroundColor: Colors.secondary },
  tabText: { ...Typography.smallBold, color: Colors.textSecondary },
  tabTextActive: { color: Colors.white },

  // Active goal card
  goalCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 12,
    ...Shadows.sm,
  },
  goalTitle: { ...Typography.heading3, color: Colors.textPrimary, marginBottom: 4 },
  goalMeta: { ...Typography.small, color: Colors.textSecondary, marginTop: 4 },

  // Wishlist card
  experienceCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 12,
    overflow: 'hidden',
    ...Shadows.sm,
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
  experienceTitle: { ...Typography.subheading, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  experienceDescription: { ...Typography.small, color: Colors.textSecondary, marginBottom: 8 },
  experiencePrice: { ...Typography.heading3, color: Colors.secondary },

  // ACHIEVEMENT CARD
  achievementCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 12,
    overflow: 'hidden',
    ...Shadows.md,
    shadowOpacity: 0.06,
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
    ...Typography.subheading,
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
    ...Typography.subheading,
    fontWeight: '700',
    color: Colors.primary,
  },
  achStatLabel: {
    ...Typography.tiny,
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
    ...Typography.tiny,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  achSelfTitle: {
    ...Typography.subheading,
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
    ...Typography.tiny,
    color: Colors.white,
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
    ...Typography.small,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Partner label
  achPartnerLabel: {
    ...Typography.captionBold,
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


  // Browse Experiences button (GoalCard)
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.primarySurface,
    borderWidth: 1,
    borderColor: Colors.primaryTint,
  },
  browseButtonText: {
    ...Typography.smallBold,
    color: Colors.secondary,
  },

  // Claim Experience button (AchievementCard)
  claimExperienceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.primarySurface,
    borderWidth: 1,
    borderColor: Colors.primaryTint,
  },
  claimExperienceButtonText: {
    ...Typography.smallBold,
    color: Colors.secondary,
  },

  emptyStateText: { textAlign: 'center', marginTop: 40, color: Colors.textMuted, ...Typography.subheading },
  modalContainer: { flex: 1, backgroundColor: Colors.surface },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalCancelButton: { paddingVertical: 8 },
  modalCancelText: { ...Typography.subheading, color: Colors.secondary },
  modalTitle: { ...Typography.heading3, color: Colors.textPrimary },
  modalSaveButton: { paddingVertical: 8 },
  modalSaveText: { ...Typography.subheading, color: Colors.secondary },
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
    borderColor: Colors.white,
  },
  imageOverlayText: { ...Typography.subheading },
  imagePickerLabel: { ...Typography.small, color: Colors.textSecondary },
});

export default UserProfileScreen;
