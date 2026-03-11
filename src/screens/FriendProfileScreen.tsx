import React, { useState, useEffect, useRef } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Animated,
  Platform,
  Modal,
} from 'react-native';
import { ProfileSkeleton } from '../components/SkeletonLoader';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, UserPlus, UserMinus, Clock, MessageSquare, Heart, Gift } from 'lucide-react-native';
import { RootStackParamList, UserProfile, Goal, Experience } from '../types';
import EmpowerChoiceModal from '../components/EmpowerChoiceModal';
import MotivationModal from '../components/MotivationModal';
import { userService } from '../services/userService';
import { friendService } from '../services/FriendService';
import { goalService } from '../services/GoalService';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import MainScreen from './MainScreen';
import { experienceGiftService } from '../services/ExperienceGiftService';
import { experienceService } from '../services/ExperienceService';
import { partnerService } from '../services/PartnerService';
import AudioPlayer from '../components/AudioPlayer';
import ImageViewer from '../components/ImageViewer';
import { db } from '../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { logger } from '../utils/logger';
import Colors from '../config/colors';
import { Typography } from '../config/typography';
import { Shadows } from '../config/shadows';
import { EmptyState } from '../components/EmptyState';

type FriendProfileNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'FriendProfile'
>;
type FriendProfileRouteProp = RouteProp<RootStackParamList, 'FriendProfile'>;

// ------------------------------------------------------------------
// Helper Components (moved outside parent for performance)
// ------------------------------------------------------------------

const CapsuleMini = ({ filled }: { filled: boolean }) => (
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

const GoalCard = ({ goal, currentUserId, userName }: { goal: Goal; currentUserId: string | undefined; userName: string | null }) => {
  const [giverName, setGiverName] = useState<string | null>(null);
  const [showHintHistory, setShowHintHistory] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [showEmpowerModal, setShowEmpowerModal] = useState(false);
  const [showMotivateModal, setShowMotivateModal] = useState(false);
  const isGiver = currentUserId === goal.empoweredBy;
  const hasExperience = !!goal.experienceGiftId || !!goal.giftAttachedAt;
  const nextSession = (goal.currentCount || 0) * (goal.sessionsPerWeek || 1) + (goal.weeklyCount || 0) + 1;

  useEffect(() => {
    if (goal.empoweredBy) {
      userService.getUserName(goal.empoweredBy).then(setGiverName);
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

  return (
    <View style={styles.goalCard}>
      <Text style={styles.goalTitle} numberOfLines={2}>{goal.title}</Text>

      {giverName && (
        <Text style={styles.goalMeta}>⚡ Empowered by {giverName}</Text>
      )}

      {/* Sessions this week */}
      <View style={{ marginTop: 12 }}>
        <View style={styles.progressHeaderRow}>
          <Text style={styles.progressHeaderLabel}>Sessions this week</Text>
          <Text style={styles.progressHeaderValue}>
            {weeklyFilled}/{weeklyTotal}
          </Text>
        </View>

        <View style={{ flexDirection: "row" }}>
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

        <View style={{ flexDirection: "row" }}>
          {Array.from({ length: totalWeeks }).map((_, i) => (
            <CapsuleMini key={i} filled={i < completedWeeks} />
          ))}
        </View>
      </View>

      {/* Action Buttons: Empower + Motivate */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        {!hasExperience && (
          <TouchableOpacity
            onPress={() => setShowEmpowerModal(true)}
            style={styles.empowerActionButton}
            activeOpacity={0.8}
          >
            <Gift color={Colors.white} size={16} />
            <Text style={styles.empowerActionButtonText}>Empower</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setShowMotivateModal(true)}
          style={styles.motivateActionButton}
          activeOpacity={0.8}
        >
          <Heart color={Colors.primary} size={16} />
          <Text style={styles.motivateActionButtonText}>Motivate</Text>
        </TouchableOpacity>
      </View>

      {/* View Hints Button (only for giver) */}
      {isGiver && (
        <TouchableOpacity
          onPress={() => setShowHintHistory(true)}
          style={{
            marginTop: 8,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 8,
            backgroundColor: Colors.backgroundLight,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
          activeOpacity={0.7}
        >
          <Text style={{ ...Typography.smallBold, color: Colors.textSecondary, textAlign: 'center' }}>
            View Hint History
          </Text>
        </TouchableOpacity>
      )}

      {/* Hint History Modal */}
      {showHintHistory && (
        <Modal
          visible={showHintHistory}
          transparent
          animationType="fade"
          onRequestClose={() => setShowHintHistory(false)}
        >
          <TouchableOpacity
            style={historyModalStyles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowHintHistory(false)}
          >
            <View style={historyModalStyles.modalContainer}>
              <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                <View style={historyModalStyles.modalHeader}>
                  <Text style={historyModalStyles.modalTitle}>Hint History</Text>
                  <TouchableOpacity onPress={() => setShowHintHistory(false)}>
                    <Text style={historyModalStyles.closeButton}>×</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={historyModalStyles.scrollView}>
                  {goal?.hints && goal.hints.length > 0 ? (
                    [...goal.hints].reverse().map((hint: any, index: number) => {
                      const isAudio = hint.type === 'audio' || hint.type === 'mixed';
                      const hasImage = hint.imageUrl;
                      const text = hint.text || hint.hint;

                      // Handle date
                      let dateMs = 0;
                      if (hint.createdAt) {
                        if (typeof hint.createdAt.toMillis === 'function') {
                          dateMs = hint.createdAt.toMillis();
                        } else if (hint.createdAt instanceof Date) {
                          dateMs = hint.createdAt.getTime();
                        } else {
                          dateMs = new Date(hint.createdAt).getTime();
                        }
                      } else if (hint.date) {
                        dateMs = hint.date;
                      }

                      return (
                        <View key={hint.id || index} style={historyModalStyles.hintItem}>
                          <View style={historyModalStyles.hintHeader}>
                            <Text style={historyModalStyles.sessionLabel}>
                              Session {hint.session || index + 1}
                            </Text>
                            <Text style={historyModalStyles.dateLabel}>
                              {new Date(dateMs).toLocaleDateString()}
                            </Text>
                          </View>

                          {text && (
                            <Text style={historyModalStyles.hintText}>{text}</Text>
                          )}

                          {hasImage && (
                            <TouchableOpacity
                              onPress={() => setSelectedImageUri(hint.imageUrl)}
                              activeOpacity={0.9}
                            >
                              <Image
                                source={{ uri: hint.imageUrl }}
                                style={historyModalStyles.hintImage}
                              />
                            </TouchableOpacity>
                          )}

                          {isAudio && hint.audioUrl && (
                            <View style={historyModalStyles.audioContainer}>
                              <AudioPlayer uri={hint.audioUrl} duration={hint.duration} />
                            </View>
                          )}
                        </View>
                      );
                    })
                  ) : (
                    <Text style={historyModalStyles.emptyText}>
                      No hints have been sent yet.
                    </Text>
                  )}
                </ScrollView>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Fullscreen Image Viewer */}
      {selectedImageUri && (
        <ImageViewer
          visible={!!selectedImageUri}
          imageUri={selectedImageUri}
          onClose={() => setSelectedImageUri(null)}
        />
      )}

      {/* Empower Modal */}
      <EmpowerChoiceModal
        visible={showEmpowerModal}
        userName={userName || 'this user'}
        goalId={goal.id}
        goalUserId={goal.userId}
        pledgedExperienceId={goal.pledgedExperience?.experienceId}
        experienceTitle={goal.pledgedExperience?.title}
        experiencePrice={goal.pledgedExperience?.price}
        preferredRewardCategory={goal.preferredRewardCategory}
        onClose={() => setShowEmpowerModal(false)}
      />

      {/* Motivate Modal */}
      <MotivationModal
        visible={showMotivateModal}
        recipientName={userName || 'this user'}
        goalId={goal.id}
        targetSession={nextSession}
        onClose={() => setShowMotivateModal(false)}
      />
    </View>
  );
};

const AchievementCard: React.FC<{ goal: Goal; userName: string | null }> = ({ goal, userName }) => {
  const [experience, setExperience] = useState<Experience | null>(null);
  const [partnerName, setPartnerName] = useState<string>("Partner");
  const [loadingCard, setLoadingCard] = useState<boolean>(true);
  const [showEmpowerModal, setShowEmpowerModal] = useState(false);

  const hasReward = !!goal.experienceGiftId || !!goal.giftAttachedAt;
  const isSelfAchievement = !hasReward && !goal.pledgedExperience;
  const hasPledgedNotBought = !hasReward && !!goal.pledgedExperience;
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
  const withinDeadline = effectiveDeadline && effectiveDeadline > new Date();

  const canEmpower = hasPledgedNotBought && withinDeadline;
  const canEmpowerSelf = isSelfAchievement && withinDeadline;

  useEffect(() => {
    const loadAchievementData = async () => {
      try {
        if (isSelfAchievement || hasPledgedNotBought) {
          setLoadingCard(false);
          return;
        }
        if (!goal.experienceGiftId) { setLoadingCard(false); return; }
        try {
          const giftData = await experienceGiftService.getExperienceGiftById(goal.experienceGiftId);
          const exp = await experienceService.getExperienceById(giftData.experienceId);
          setExperience(exp || null);
          setPartnerName(exp?.subtitle || 'Partner');
        } catch (dataErr) {
          logger.warn('Error fetching gift/experience data:', dataErr);
        }
      } catch (err) {
        logger.error("Error loading achievement data:", err);
      } finally {
        setLoadingCard(false);
      }
    };
    loadAchievementData();
  }, [goal.experienceGiftId]);

  const weeks = goal.targetCount || 0;
  const sessions = (goal.targetCount || 0) * (goal.sessionsPerWeek || 0);

  // Self-achievement card
  if (isSelfAchievement) {
    return (
      <View style={styles.achievementCard}>
        <View style={styles.achSelfBanner}>
          <Text style={{ fontSize: 28 }}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.achSelfLabel}>Self-Achievement</Text>
            <Text style={styles.achSelfTitle} numberOfLines={2}>{goal.title}</Text>
          </View>
        </View>
        <View style={styles.achievementContent}>
          <Text style={styles.achievementMeta}>
            {sessions} sessions completed • {weeks} weeks
          </Text>
          {canEmpowerSelf && (
            <TouchableOpacity
              onPress={() => setShowEmpowerModal(true)}
              style={styles.empowerButton}
              activeOpacity={0.7}
            >
              <Gift color={Colors.white} size={16} />
              <Text style={styles.empowerButtonText}>Empower</Text>
            </TouchableOpacity>
          )}
        </View>

        <EmpowerChoiceModal
          visible={showEmpowerModal}
          userName={userName || 'this user'}
          goalId={goal.id}
          goalUserId={goal.userId}
          preferredRewardCategory={goal.preferredRewardCategory}
          onClose={() => setShowEmpowerModal(false)}
        />
      </View>
    );
  }

  // Pledged but not bought card
  if (hasPledgedNotBought && goal.pledgedExperience) {
    const pledged = goal.pledgedExperience;
    const cover = pledged.coverImageUrl;
    return (
      <View style={styles.achievementCard}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.achievementImage} />
        ) : (
          <View style={[styles.achievementImage, styles.achievementImagePlaceholder]}>
            <Text style={styles.achievementImagePlaceholderText}>🎁</Text>
          </View>
        )}
        <View style={styles.achievementContent}>
          <Text style={styles.achievementTitle} numberOfLines={1}>{goal.title}</Text>
          <Text style={styles.achievementGoal} numberOfLines={1}>🎁 {pledged.title}</Text>
          <Text style={styles.achievementMeta}>
            {sessions} sessions completed • {weeks} weeks
          </Text>
          {canEmpower && (
            <TouchableOpacity
              onPress={() => setShowEmpowerModal(true)}
              style={styles.empowerButton}
              activeOpacity={0.7}
            >
              <Gift color={Colors.white} size={16} />
              <Text style={styles.empowerButtonText}>Empower</Text>
            </TouchableOpacity>
          )}
        </View>

        <EmpowerChoiceModal
          visible={showEmpowerModal}
          userName={userName || 'this user'}
          goalId={goal.id}
          goalUserId={goal.userId}
          pledgedExperienceId={pledged.experienceId}
          experienceTitle={pledged.title}
          experiencePrice={pledged.price}
          preferredRewardCategory={goal.preferredRewardCategory}
          onClose={() => setShowEmpowerModal(false)}
        />
      </View>
    );
  }

  // Standard card (has reward / experience gift)
  const cover =
    experience?.coverImageUrl ||
    (experience?.imageUrl && experience.imageUrl.length > 0
      ? experience.imageUrl[0]
      : undefined);

  return (
    <View style={styles.achievementCard}>
      {cover ? (
        <Image source={{ uri: cover }} style={styles.achievementImage} />
      ) : (
        <View style={[styles.achievementImage, styles.achievementImagePlaceholder]}>
          <Text style={styles.achievementImagePlaceholderText}>🎁</Text>
        </View>
      )}

      <View style={styles.achievementContent}>
        {loadingCard ? (
          <Text style={styles.achievementLoadingText}>Loading...</Text>
        ) : (
          <>
            <Text style={styles.achievementTitle} numberOfLines={1}>
              🎁 {experience?.title || "Experience unlocked"}
            </Text>
            <Text style={styles.achievementPartner} numberOfLines={1}>
              👤 {partnerName}
            </Text>
            <Text style={styles.achievementGoal} numberOfLines={2}>
              Goal: {goal.title}
            </Text>
            <Text style={styles.achievementMeta}>
              {sessions} sessions completed • {weeks} weeks
            </Text>
          </>
        )}
      </View>
    </View>
  );
};

const ExperienceCard = ({ experience }: { experience: Experience }) => {
  const navigation = useNavigation<FriendProfileNavigationProp>();

  const handlePress = () =>
    navigation.navigate('ExperienceDetails', { experience });

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
      <Image
        source={{ uri: experienceImage }}
        style={styles.experienceImage}
        resizeMode="cover"
        accessibilityLabel={`${experience.title} experience`}
      />
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

const FriendProfileScreen: React.FC = () => {
  const navigation = useNavigation<FriendProfileNavigationProp>();
  const route = useRoute<FriendProfileRouteProp>();
  const { state } = useApp();
  const { showError } = useToast();

  const { userId } = route.params as { userId: string };

  const currentUserId = state.user?.id;
  const currentUserName =
    state.user?.displayName || state.user?.profile?.name || 'User';
  const currentUserProfileImageUrl = state.user?.profile?.profileImageUrl;

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [activeTab, setActiveTab] =
    useState<'goals' | 'achievements' | 'wishlist'>('goals');
  const [activeGoals, setActiveGoals] = useState<Goal[]>([]);
  const [completedGoals, setCompletedGoals] = useState<Goal[]>([]);
  const [wishlist, setWishlist] = useState<Experience[]>([]);
  const [isFriend, setIsFriend] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  // Popup animation states
  const [showRemovePopup, setShowRemovePopup] = useState(false);
  const removeAnim = useRef(new Animated.Value(0)).current;
  const removeScale = useRef(new Animated.Value(0.9)).current;

  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Redirect if userId is missing (e.g., after bad navigation)
  useEffect(() => {
    if (!userId) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'FriendsList' }],
      });
    }
  }, [userId, navigation]);

  if (!userId) return null; // Early return to avoid render errors

  useEffect(() => {
    loadFriendProfile();
  }, [userId]);

  useEffect(() => {
    if (userProfile) animateContent();
  }, [activeTab]);

  const animateContent = () => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const openRemovePopup = () => {
    setShowRemovePopup(true);
    Animated.parallel([
      Animated.timing(removeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(removeScale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
  };

  const closeRemovePopup = () => {
    Animated.parallel([
      Animated.timing(removeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(removeScale, { toValue: 0.9, duration: 150, useNativeDriver: true }),
    ]).start(() => setShowRemovePopup(false));
  };

  const loadFriendProfile = async () => {
    try {
      setIsLoading(true);
      setImageLoadError(false);

      const profile = await userService.getUserProfile(userId);
      const name = await userService.getUserName(userId);
      setUserProfile(profile);
      setUserName(name);

      // Fetch goals and wishlist separately with error handling
      let allGoals: any[] = [];
      let wishlistData: any[] = [];

      // Fetch goals directly without sweep (read-only for other users)
      // The sweep would try to update documents which we don't have permission for
      try {
        const goalsRef = collection(db, 'goals');
        const q = query(goalsRef, where('userId', '==', userId));
        const snapshot = await getDocs(q);
        allGoals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (goalError) {
        logger.log('Note: Could not load goals for this user', goalError);
        allGoals = [];
      }

      // Try to load wishlist - if permissions fail, just show empty
      try {
        wishlistData = await userService.getWishlist(userId);
      } catch (wishlistError) {
        logger.log('Note: Could not load wishlist for this user', wishlistError);
        wishlistData = [];
      }

      setActiveGoals(allGoals.filter((g) => !g.isCompleted));
      setCompletedGoals(allGoals.filter((g) => g.isCompleted));
      setWishlist(wishlistData || []);

      if (currentUserId) {
        const [friendshipStatus, pendingStatus] = await Promise.all([
          friendService.areFriends(currentUserId, userId),
          friendService.hasPendingRequest(currentUserId, userId),
        ]);
        setIsFriend(friendshipStatus);
        setHasPendingRequest(pendingStatus);
      }
    } catch (error) {
      logger.error('Error loading profile:', error);
      showError('Failed to load profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderData = () => {
    if (isLoading)
      return (
        <ProfileSkeleton />
      );

    const data =
      activeTab === 'goals'
        ? activeGoals
        : activeTab === 'achievements'
          ? completedGoals
          : wishlist;

    if (data.length === 0) {
      const icon = activeTab === 'goals' ? '🎯' : activeTab === 'achievements' ? '🏆' : '⭐';
      const title = `No ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Yet`;
      const message = activeTab === 'goals'
        ? 'No active goals at the moment'
        : activeTab === 'achievements'
          ? 'No achievements earned yet'
          : 'No wishlist items yet';
      return <EmptyState icon={icon} title={title} message={message} />;
    }

    return data.map((item: any) =>
      activeTab === 'wishlist' ? (
        <ExperienceCard key={item.id} experience={item} />
      ) : activeTab === 'goals' ? (
        <GoalCard key={item.id} goal={item} currentUserId={currentUserId} userName={userName} />
      ) : (
        <AchievementCard key={item.id} goal={item} userName={userName} />
      )
    );
  };

  if (isLoading && !userProfile) {
    return (
      <ErrorBoundary screenName="FriendProfileScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Profile">
        <ProfileSkeleton />
      </MainScreen>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="FriendProfileScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Profile">
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else navigation.navigate('FriendsList');
            }}
            style={styles.backButton}
          >
            <ChevronLeft color={Colors.textPrimary} size={24} />
          </TouchableOpacity>
          <View style={{ width: 40 }} />
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          {userProfile?.profileImageUrl && !imageLoadError ? (
            <Image
              source={{ uri: userProfile.profileImageUrl }}
              style={styles.profileImage}
              onError={() => setImageLoadError(true)}
              accessibilityLabel={`${userName}'s profile picture`}
            />
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderText}>
                {userName?.[0]?.toUpperCase() || "U"}
              </Text>
            </View>
          )}

          <Text style={styles.userName}>{userName}</Text>
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

          {/* Friend Buttons */}
          <View style={styles.friendButtonContainer}>
            {isFriend ? (
              <TouchableOpacity
                style={[styles.friendButton, { backgroundColor: "#f8d6d6" }]}
                onPress={openRemovePopup}
                disabled={isActionLoading}
              >
                <UserMinus color="#9e2c2c" size={16} />
                <Text style={[styles.friendButtonText, { color: "#9e2c2c" }]}>
                  {isActionLoading ? "Removing..." : "Remove"}
                </Text>
              </TouchableOpacity>
            ) : hasPendingRequest ? (
              <View style={[styles.friendButton, { backgroundColor: Colors.warning }]}>
                <Clock color={Colors.white} size={16} />
                <Text style={styles.friendButtonText}>Sent</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.friendButton, { backgroundColor: Colors.secondary }]}
                onPress={async () => {
                  setIsActionLoading(true);
                  try {
                    await friendService.sendFriendRequest(
                      currentUserId!,
                      currentUserName,
                      userId,
                      userProfile?.name,
                      state.user?.profile?.country,
                      currentUserProfileImageUrl
                    );
                    setHasPendingRequest(true);
                  } finally {
                    setIsActionLoading(false);
                  }
                }}
                disabled={isActionLoading}
              >
                <UserPlus color={Colors.white} size={16} />
                <Text style={styles.friendButtonText}>
                  {isActionLoading ? "Sending..." : "Add"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {[
            { key: "goals", label: "Goals" },
            { key: "achievements", label: "Achievements" },
            { key: "wishlist", label: "Wishlist" },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
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

        {/* Content */}
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
          {renderData()}
        </Animated.View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Remove Friend Popup */}
      {showRemovePopup && (
        <Animated.View
          style={[
            styles.modalOverlay,
            { opacity: removeAnim, transform: [{ scale: removeScale }] },
          ]}
        >
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Remove Friend?</Text>
            <Text style={styles.modalSubtitle}>
              Are you sure you want to remove{" "}
              {userProfile?.name || "this user"} from your friends list?
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={closeRemovePopup}
                style={[styles.modalButton, styles.cancelButtonPopup]}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  setIsActionLoading(true);
                  try {
                    await friendService.removeFriend(currentUserId!, userId);
                    setIsFriend(false);
                  } finally {
                    setIsActionLoading(false);
                    closeRemovePopup();
                  }
                }}
                style={[styles.modalButton, styles.confirmButton]}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmText}>Yes, remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}
    </MainScreen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  // HEADER
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40,
    left: 20,
    right: 20,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // HERO
  heroSection: {
    backgroundColor: Colors.white,
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
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
  placeholderText: { ...Typography.display, fontSize: 40, color: Colors.white },
  userName: {
    ...Typography.heading1,
    fontSize: 24,
    color: Colors.textPrimary,
    marginBottom: 4,
    marginTop: 14,
  },
  userDescription: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },

  // STATS
  statsRow: { flexDirection: 'row', gap: 32, marginBottom: 20 },
  statItem: { alignItems: 'center' },
  statNumber: { ...Typography.heading1, fontSize: 24, color: Colors.secondary, marginBottom: 4 },
  statLabel: { ...Typography.small, fontSize: 13, fontWeight: '500', color: Colors.textSecondary },

  // Friend buttons
  friendButtonContainer: { flexDirection: 'row', justifyContent: 'center' },
  friendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
  },
  friendButtonText: { ...Typography.smallBold, color: Colors.white },

  // TABS
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
  },
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

  // NEW GOAL CARD STYLES (copied from user profile)
  goalCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 12,
    ...Shadows.sm,
    shadowColor: Colors.textPrimary,
  },
  goalTitle: { ...Typography.heading3, color: Colors.textPrimary, marginBottom: 4 },
  goalMeta: { ...Typography.small, color: Colors.textSecondary, marginTop: 4 },

  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  progressHeaderLabel: { ...Typography.small, fontSize: 13, color: Colors.textSecondary },
  progressHeaderValue: { ...Typography.small, fontSize: 13, fontWeight: "600", color: Colors.textPrimary },

  // Wishlist card
  experienceCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 12,
    overflow: 'hidden',
    ...Shadows.sm,
    shadowColor: Colors.textPrimary,
  },
  experienceImage: { width: '100%', height: 140, backgroundColor: Colors.border },
  experienceContent: { padding: 16 },
  experienceTitle: { ...Typography.subheading, fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  experienceDescription: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  experiencePrice: { ...Typography.heading3, color: Colors.secondary },

  emptyStateText: {
    ...Typography.subheading,
    textAlign: 'center',
    marginTop: 40,
    color: Colors.textMuted,
  },
  // ACHIEVEMENT CARD (copied from UserProfileScreen)
  achievementCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 12,
    overflow: "hidden",
    ...Shadows.sm,
    shadowColor: Colors.textPrimary,
  },
  achievementImage: {
    width: "100%",
    height: 140,
    backgroundColor: Colors.border,
  },
  achievementImagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  achievementImagePlaceholderText: {
    fontSize: 40,
    opacity: 0.5,
  },
  achievementContent: {
    padding: 16,
  },
  achievementLoadingText: {
    ...Typography.small,
    color: Colors.textMuted,
  },
  achievementTitle: {
    ...Typography.subheading,
    fontSize: 17,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  achievementPartner: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  achievementGoal: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  achievementMeta: {
    ...Typography.small,
    color: Colors.textSecondary,
  },

  // Action buttons (Empower/Motivate on GoalCard)
  empowerActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.secondary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  empowerActionButtonText: {
    ...Typography.smallBold,
    color: Colors.white,
  },
  motivateActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primarySurface,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  motivateActionButtonText: {
    ...Typography.smallBold,
    color: Colors.primary,
  },

  // Self-achievement banner (AchievementCard)
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
    color: Colors.textPrimary,
    marginTop: 2,
  },

  // Empower button on AchievementCard
  empowerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.secondary,
  },
  empowerButtonText: {
    ...Typography.smallBold,
    color: Colors.white,
  },

  // Loading fallback
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...Typography.subheading, marginTop: 12, color: Colors.textSecondary },

  // Popup overlay
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 999,
  },
  modalBox: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    width: '85%',
    maxWidth: 360,
    paddingVertical: 24,
    paddingHorizontal: 20,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 38,
    alignItems: 'center',
  },
  modalTitle: {
    ...Typography.large,
    color: '#4c1d95',
    marginBottom: 8,
  },
  modalSubtitle: {
    ...Typography.body,
    color: Colors.gray700,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonPopup: {
    backgroundColor: Colors.backgroundLight,
  },
  confirmButton: {
    backgroundColor: Colors.primary,
  },
  cancelText: {
    ...Typography.bodyBold,
    color: Colors.gray700,
  },
  confirmText: {
    ...Typography.bodyBold,
    color: Colors.white,
  },
});

const historyModalStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    maxWidth: 500,
    width: '90%',
    maxHeight: '80%',
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    ...Typography.large,
    color: Colors.textPrimary,
  },
  closeButton: {
    ...Typography.display,
    color: Colors.textMuted,
    fontWeight: '300',
  },
  scrollView: {
    maxHeight: 500,
    padding: 20,
  },
  hintItem: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hintHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sessionLabel: {
    ...Typography.smallBold,
    color: Colors.primary,
  },
  dateLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  hintImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: Colors.border,
  },
  hintText: {
    ...Typography.body,
    color: Colors.gray700,
    marginBottom: 8,
  },
  audioContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: Colors.backgroundLight,
    borderRadius: 8,
  },
  audioText: {
    ...Typography.small,
    color: Colors.textSecondary,
  },
  emptyText: {
    ...Typography.body,
    textAlign: 'center',
    color: Colors.textMuted,
    paddingVertical: 40,
  },
});

export default FriendProfileScreen;
