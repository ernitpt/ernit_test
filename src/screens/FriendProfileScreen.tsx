import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import ErrorRetry from '../components/ErrorRetry';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { BaseModal } from '../components/BaseModal';
import { ProfileSkeleton, SkeletonBox } from '../components/SkeletonLoader';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, UserPlus, UserMinus, Clock, Heart, Gift } from 'lucide-react-native';
import { RootStackParamList, UserProfile, Goal, Experience, Friend } from '../types';
import EmpowerChoiceModal from '../components/EmpowerChoiceModal';
import MotivationModal from '../components/MotivationModal';
import { userService } from '../services/userService';
import { friendService } from '../services/FriendService';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import MainScreen from './MainScreen';
import { experienceGiftService } from '../services/ExperienceGiftService';
import { experienceService } from '../services/ExperienceService';
import AudioPlayer from '../components/AudioPlayer';
import ImageViewer from '../components/ImageViewer';
import { goalService } from '../services/GoalService';
import { logger } from '../utils/logger';
import { toJSDate } from '../utils/GoalHelpers';
import { vh } from '../utils/responsive';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Shadows } from '../config/shadows';
import { Spacing } from '../config/spacing';
import { EmptyState } from '../components/EmptyState';
import { Avatar } from '../components/Avatar';
import { MotiView } from 'moti';

type FriendProfileNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'FriendProfile'
>;
type FriendProfileRouteProp = RouteProp<RootStackParamList, 'FriendProfile'>;

// ------------------------------------------------------------------
// Helper Components (moved outside parent for performance)
// ------------------------------------------------------------------

const CapsuleMini = ({ filled }: { filled: boolean }) => {
  const colors = useColors();
  return (
    <View
      style={{
        flex: 1,
        height: 8,
        borderRadius: BorderRadius.pill,
        backgroundColor: filled ? colors.primary : colors.border,
        marginHorizontal: Spacing.xxs,
      }}
    />
  );
};

const GoalCard = ({ goal, currentUserId, userName }: { goal: Goal; currentUserId: string | undefined; userName: string | null }) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const historyModalStyles = useMemo(() => createHistoryModalStyles(colors), [colors]);
  const [giverName, setGiverName] = useState<string | null>(null);
  const [showHintHistory, setShowHintHistory] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [showEmpowerModal, setShowEmpowerModal] = useState(false);
  const [showMotivateModal, setShowMotivateModal] = useState(false);
  const isGiver = currentUserId === goal.empoweredBy;
  const isSelfGoal = currentUserId === goal.userId;
  const hasExperience = !!goal.experienceGiftId || !!goal.giftAttachedAt;
  const nextSession = (goal.currentCount || 0) * (goal.sessionsPerWeek || 1) + (goal.weeklyCount || 0) + 1;

  useEffect(() => {
    if (goal.empoweredBy) {
      userService.getUserName(goal.empoweredBy).then(setGiverName).catch(() => {});
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
      <View style={{ marginTop: Spacing.md }}>
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
      <View style={{ marginTop: Spacing.md }}>
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

      {/* Action Buttons: Empower + Motivate (only for active goals that aren't yours) */}
      {!goal.isCompleted && !isSelfGoal && (
        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg }}>
          {!hasExperience && (
            <TouchableOpacity
              onPress={() => setShowEmpowerModal(true)}
              style={styles.empowerActionButton}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Empower this goal"
            >
              <Gift color={colors.white} size={16} />
              <Text style={styles.empowerActionButtonText}>Empower</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setShowMotivateModal(true)}
            style={styles.motivateActionButton}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Send motivation"
          >
            <Heart color={colors.primary} size={16} />
            <Text style={styles.motivateActionButtonText}>Motivate</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* View Hints Button (only for giver) */}
      {isGiver && (
        <TouchableOpacity
          onPress={() => setShowHintHistory(true)}
          style={{
            marginTop: Spacing.sm,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.lg,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.backgroundLight,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="View hint history"
        >
          <Text style={{ ...Typography.smallBold, color: colors.textSecondary, textAlign: 'center' }}>
            View Hint History
          </Text>
        </TouchableOpacity>
      )}

      {/* Hint History Modal */}
      <BaseModal
        visible={showHintHistory}
        onClose={() => setShowHintHistory(false)}
        title="Hint History"
        variant="center"
      >
        <ScrollView style={historyModalStyles.scrollView}>
          {goal?.hints && goal.hints.length > 0 ? (
            [...goal.hints].reverse().map((hint, index: number) => {
              const isAudio = hint.type === 'audio' || hint.type === 'mixed';
              const hasImage = hint.imageUrl;
              const text = hint.text || hint.hint;

              // Handle date — toJSDate handles Firestore Timestamps, Dates, and strings
              const parsedDate = hint.createdAt ? toJSDate(hint.createdAt) : null;
              const dateMs = parsedDate?.getTime() ?? hint.date ?? 0;

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
      </BaseModal>

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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
      const d = toJSDate(goal.completedAt) ?? new Date();
      d.setDate(d.getDate() + 30);
      return d;
    }
    return null;
  };
  const effectiveDeadline = getEffectiveDeadline();
  const withinDeadline = effectiveDeadline && effectiveDeadline > new Date();

  // Compute days left for deadline countdown badge
  const daysLeft = effectiveDeadline
    ? Math.ceil((effectiveDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const renderDeadlineBadge = () => {
    if (daysLeft === null) return null;
    if (daysLeft <= 0) {
      return (
        <Text style={{ ...Typography.caption, color: colors.textMuted, marginTop: Spacing.xs }}>
          Expired
        </Text>
      );
    }
    if (daysLeft <= 1) {
      return (
        <Text style={{ ...Typography.caption, color: colors.error, marginTop: Spacing.xs }}>
          🔴 Expires tomorrow!
        </Text>
      );
    }
    if (daysLeft <= 7) {
      return (
        <Text style={{ ...Typography.caption, color: colors.warning, marginTop: Spacing.xs }}>
          ⚠️ {daysLeft} days left!
        </Text>
      );
    }
    return (
      <Text style={{ ...Typography.caption, color: colors.textSecondary, marginTop: Spacing.xs }}>
        Expires in {daysLeft} days
      </Text>
    );
  };

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
        } catch (dataErr: unknown) {
          logger.warn('Error fetching gift/experience data:', dataErr);
        }
      } catch (err: unknown) {
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
          <Text style={{ ...Typography.display }}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.achSelfLabel}>Self-Achievement</Text>
            <Text style={styles.achSelfTitle} numberOfLines={2}>{goal.title}</Text>
          </View>
        </View>
        <View style={styles.achievementContent}>
          <Text style={styles.achievementMeta}>
            {sessions} sessions completed • {weeks} weeks
          </Text>
          {renderDeadlineBadge()}
          {canEmpowerSelf && (
            <TouchableOpacity
              onPress={() => setShowEmpowerModal(true)}
              style={styles.empowerButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Empower this achievement"
            >
              <Gift color={colors.white} size={16} />
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
          <Image source={{ uri: cover }} style={styles.achievementImage} accessibilityLabel={`${pledged.title} cover image`} cachePolicy="memory-disk" contentFit="cover" />
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
          {renderDeadlineBadge()}
          {canEmpower && (
            <TouchableOpacity
              onPress={() => setShowEmpowerModal(true)}
              style={styles.empowerButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Empower this achievement"
            >
              <Gift color={colors.white} size={16} />
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
        <Image source={{ uri: cover }} style={styles.achievementImage} accessibilityLabel={`${experience?.title || 'Experience'} cover image`} cachePolicy="memory-disk" contentFit="cover" />
      ) : (
        <View style={[styles.achievementImage, styles.achievementImagePlaceholder]}>
          <Text style={styles.achievementImagePlaceholderText}>🎁</Text>
        </View>
      )}

      <View style={styles.achievementContent}>
        {loadingCard ? (
          <>
            <SkeletonBox width="80%" height={14} style={{ marginBottom: Spacing.xs }} />
            <SkeletonBox width="60%" height={12} style={{ marginBottom: Spacing.xs }} />
            <SkeletonBox width="70%" height={12} style={{ marginBottom: Spacing.xs }} />
            <SkeletonBox width="50%" height={11} />
          </>
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
            {renderDeadlineBadge()}
          </>
        )}
      </View>
    </View>
  );
};

const ExperienceCard = ({ experience }: { experience: Experience }) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<FriendProfileNavigationProp>();

  const handlePress = useCallback(() =>
    navigation.navigate('ExperienceDetails', { experience }), [navigation, experience]);

  const handleGiftThis = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('ExperienceCheckout', {
      cartItems: [{ experienceId: experience.id, quantity: 1 }],
    });
  }, [navigation, experience.id]);

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
        contentFit="cover"
        cachePolicy="memory-disk"
        accessibilityLabel={`${experience.title} experience`}
      />
      <View style={styles.experienceContent}>
        <Text style={styles.experienceTitle} numberOfLines={1}>
          {experience.title}
        </Text>
        <Text style={styles.experienceDescription} numberOfLines={2}>
          {experience.description}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.xs }}>
          <Text style={styles.experiencePrice}>
            €{Number(experience.price || 0).toFixed(2)}
          </Text>
          <TouchableOpacity
            style={styles.giftThisButton}
            onPress={handleGiftThis}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Gift ${experience.title}`}
          >
            <Text style={styles.giftThisText}>🎁 Gift This</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const FriendProfileScreen: React.FC = () => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const [friendSince, setFriendSince] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [error, setError] = useState(false);

  // Popup animation states
  const [showRemovePopup, setShowRemovePopup] = useState(false);
  const removeAnim = useRef(new Animated.Value(0)).current;
  const removeScale = useRef(new Animated.Value(0.9)).current;

  const tabScrollRef = useRef<ScrollView>(null);
  const isTabPress = useRef(false);
  const { width: screenWidth } = useWindowDimensions();
  const TAB_KEYS = ['goals', 'achievements', 'wishlist'] as const;

  // Redirect if userId is missing (e.g., after bad navigation)
  useEffect(() => {
    if (!userId) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'FriendsList' }],
      });
    }
  }, [userId, navigation]);

  useFocusEffect(
    React.useCallback(() => {
      if (userId) {
        loadFriendProfile();
      }
    }, [userId])
  );

  if (!userId) return null; // Early return AFTER all hooks

  if (error && !isLoading) {
    return (
      <ErrorRetry
        message="Could not load profile"
        onRetry={() => { setError(false); loadFriendProfile(); }}
      />
    );
  }

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

  const loadFriendProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setImageLoadError(false);

      const profile = await userService.getUserProfile(userId);
      const name = await userService.getUserName(userId);
      setUserProfile(profile);
      setUserName(name);

      // Fetch goals and wishlist separately with error handling
      let allGoals: Goal[] = [];
      let wishlistData: Experience[] = [];

      // Fetch goals via service so normalizeGoal() is applied consistently
      try {
        allGoals = await goalService.getUserGoals(userId);
      } catch (goalError: unknown) {
        logger.log('Note: Could not load goals for this user', goalError);
        allGoals = [];
      }

      // Try to load wishlist - if permissions fail, just show empty
      try {
        wishlistData = await userService.getWishlist(userId);
      } catch (wishlistError: unknown) {
        logger.log('Note: Could not load wishlist for this user', wishlistError);
        wishlistData = [];
      }

      setActiveGoals(allGoals.filter((g) => !g.isCompleted));
      setCompletedGoals(allGoals.filter((g) => g.isCompleted));
      setWishlist(wishlistData || []);

      if (currentUserId) {
        const [friendshipStatus, pendingStatus, myFriends] = await Promise.all([
          friendService.areFriends(currentUserId, userId),
          friendService.hasPendingRequest(currentUserId, userId),
          friendService.getFriends(currentUserId),
        ]);
        setIsFriend(friendshipStatus);
        setHasPendingRequest(pendingStatus);
        const friendRecord = myFriends.find((f: Friend) => f.friendId === userId);
        setFriendSince(friendRecord?.createdAt ?? null);
      }
    } catch (error: unknown) {
      logger.error('Error loading profile:', error);
      showError('Failed to load profile. Please try again.');
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [userId, currentUserId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFriendProfile();
    setRefreshing(false);
  }, [loadFriendProfile]);

  const renderTabContent = (tab: 'goals' | 'achievements' | 'wishlist') => {
    if (isLoading)
      return (
        <ProfileSkeleton />
      );

    const data =
      tab === 'goals'
        ? activeGoals
        : tab === 'achievements'
          ? completedGoals
          : wishlist;

    if (data.length === 0) {
      const title = `No ${tab.charAt(0).toUpperCase() + tab.slice(1)} Yet`;
      const message = tab === 'goals'
        ? 'No active goals at the moment'
        : tab === 'achievements'
          ? 'No achievements earned yet'
          : 'No wishlist items yet';
      return <EmptyState title={title} message={message} />;
    }

    return data.map((item, index) => (
      <MotiView
        key={item.id}
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 300, delay: index * 60 }}
      >
        {tab === 'wishlist' ? (
          <ExperienceCard experience={item} />
        ) : tab === 'goals' ? (
          <GoalCard goal={item} currentUserId={currentUserId} userName={userName} />
        ) : (
          <AchievementCard goal={item} userName={userName} />
        )}
      </MotiView>
    ));
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
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else navigation.navigate('FriendsList');
            }}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft color={colors.textPrimary} size={24} />
          </TouchableOpacity>
          <View style={{ width: 40 }} />
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Avatar
            uri={userProfile?.profileImageUrl}
            name={userProfile?.name || userName || undefined}
            size="xl"
          />

          <Text style={styles.userName}>{userName}</Text>
          {userProfile?.description && (
            <Text style={styles.userDescription} numberOfLines={3}>{userProfile.description}</Text>
          )}
          {isFriend && friendSince && (
            <Text style={{ ...Typography.caption, color: colors.textMuted, marginBottom: Spacing.xl }}>
              {`Friends since ${friendSince.toLocaleString('default', { month: 'long', year: 'numeric' })}`}
            </Text>
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
                style={[styles.friendButton, { backgroundColor: colors.errorLight }]}
                onPress={openRemovePopup}
                disabled={isActionLoading}
                accessibilityRole="button"
                accessibilityLabel="Remove friend"
              >
                <UserMinus color={colors.errorDark} size={16} />
                <Text style={[styles.friendButtonText, { color: colors.errorDark }]}>
                  {isActionLoading ? "Removing..." : "Remove"}
                </Text>
              </TouchableOpacity>
            ) : hasPendingRequest ? (
              <View style={[styles.friendButton, { backgroundColor: colors.warning }]}>
                <Clock color={colors.white} size={16} />
                <Text style={styles.friendButtonText}>Sent</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.friendButton, { backgroundColor: colors.secondary }]}
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
                  } catch (error: unknown) {
                    logger.error('Friend request failed:', error);
                    showError('Could not send friend request. Please try again.');
                  } finally {
                    setIsActionLoading(false);
                  }
                }}
                disabled={isActionLoading}
                accessibilityRole="button"
                accessibilityLabel="Add friend"
              >
                <UserPlus color={colors.white} size={16} />
                <Text style={styles.friendButtonText}>
                  {isActionLoading ? "Sending..." : "Add"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {([
            { key: "goals" as const, label: "Goals" },
            { key: "achievements" as const, label: "Achievements" },
            { key: "wishlist" as const, label: "Wishlist" },
          ]).map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => {
                const index = TAB_KEYS.indexOf(tab.key);
                setActiveTab(tab.key);
                isTabPress.current = true;
                tabScrollRef.current?.scrollTo({ x: index * screenWidth, animated: true });
              }}
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
        <ScrollView
          ref={tabScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={100}
          onScroll={(e) => {
            if (isTabPress.current) return;
            const x = e.nativeEvent.contentOffset.x;
            const index = Math.round(x / screenWidth);
            if (index >= 0 && index < TAB_KEYS.length && TAB_KEYS[index] !== activeTab) {
              setActiveTab(TAB_KEYS[index]);
            }
          }}
          onMomentumScrollEnd={() => { isTabPress.current = false; }}
          style={{ flex: 1 }}
        >
          <View style={{ width: screenWidth, paddingBottom: 80 }}>
            {renderTabContent('goals')}
          </View>
          <View style={{ width: screenWidth, paddingBottom: 80 }}>
            {renderTabContent('achievements')}
          </View>
          <View style={{ width: screenWidth, paddingBottom: 80 }}>
            {renderTabContent('wishlist')}
          </View>
        </ScrollView>
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
                accessibilityRole="button"
                accessibilityLabel="Cancel remove friend"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  setIsActionLoading(true);
                  try {
                    await friendService.removeFriend(currentUserId!, userId);
                    setIsFriend(false);
                  } catch (error: unknown) {
                    logger.error('Remove friend failed:', error);
                    showError('Could not remove friend. Please try again.');
                  } finally {
                    setIsActionLoading(false);
                    closeRemovePopup();
                  }
                }}
                style={[styles.modalButton, styles.confirmButton]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Confirm remove friend"
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

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

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
    borderRadius: BorderRadius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // HERO
  heroSection: {
    backgroundColor: colors.white,
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: Spacing.xxxl,
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
    borderBottomLeftRadius: BorderRadius.xxl,
    borderBottomRightRadius: BorderRadius.xxl,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.pill,
    borderWidth: 4,
    borderColor: colors.backgroundLight,
  },
  placeholderImage: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.pill,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { ...Typography.display, fontSize: Typography.displayLarge.fontSize, color: colors.white },
  userName: {
    ...Typography.heading1,
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  userDescription: {
    ...Typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },

  // STATS
  statsRow: { flexDirection: 'row', gap: 32, marginBottom: Spacing.xl },
  statItem: { alignItems: 'center' },
  statNumber: { ...Typography.heading1, color: colors.secondary, marginBottom: Spacing.xs },
  statLabel: { ...Typography.caption, fontWeight: '500', color: colors.textSecondary },

  // Friend buttons
  friendButtonContainer: { flexDirection: 'row', justifyContent: 'center' },
  friendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  friendButtonText: { ...Typography.smallBold, color: colors.white },

  // TABS
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  tabButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  tabButtonActive: { backgroundColor: colors.secondary },
  tabText: { ...Typography.smallBold, color: colors.textSecondary },
  tabTextActive: { color: colors.white },

  // NEW GOAL CARD STYLES (copied from user profile)
  goalCard: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    ...Shadows.sm,
    shadowColor: colors.textPrimary,
  },
  goalTitle: { ...Typography.heading3, color: colors.textPrimary, marginBottom: Spacing.xs },
  goalMeta: { ...Typography.small, color: colors.textSecondary, marginTop: Spacing.xs },

  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  progressHeaderLabel: { ...Typography.caption, color: colors.textSecondary },
  progressHeaderValue: { ...Typography.caption, fontWeight: "600", color: colors.textPrimary },

  // Wishlist card
  experienceCard: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    overflow: 'hidden',
    ...Shadows.sm,
    shadowColor: colors.textPrimary,
  },
  experienceImage: { width: '100%', height: vh(140), backgroundColor: colors.border },
  experienceContent: { padding: Spacing.lg },
  experienceTitle: { ...Typography.subheading, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.xs },
  experienceDescription: {
    ...Typography.small,
    color: colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  experiencePrice: { ...Typography.heading3, color: colors.secondary },
  giftThisButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
  },
  giftThisText: {
    ...Typography.caption,
    color: colors.white,
    fontWeight: '700',
  },

  emptyStateText: {
    ...Typography.subheading,
    textAlign: 'center',
    marginTop: Spacing.huge,
    color: colors.textMuted,
  },
  // ACHIEVEMENT CARD (copied from UserProfileScreen)
  achievementCard: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    overflow: "hidden",
    ...Shadows.sm,
    shadowColor: colors.textPrimary,
  },
  achievementImage: {
    width: "100%",
    height: vh(140),
    backgroundColor: colors.border,
  },
  achievementImagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  achievementImagePlaceholderText: {
    fontSize: Typography.displayLarge.fontSize,
    opacity: 0.5,
  },
  achievementContent: {
    padding: Spacing.lg,
  },
  achievementLoadingText: {
    ...Typography.small,
    color: colors.textMuted,
  },
  achievementTitle: {
    ...Typography.subheading,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  achievementPartner: {
    ...Typography.small,
    color: colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  achievementGoal: {
    ...Typography.small,
    color: colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  achievementMeta: {
    ...Typography.small,
    color: colors.textSecondary,
  },

  // Action buttons (Empower/Motivate on GoalCard)
  empowerActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: colors.secondary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  empowerActionButtonText: {
    ...Typography.smallBold,
    color: colors.white,
  },
  motivateActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: colors.primarySurface,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  motivateActionButtonText: {
    ...Typography.smallBold,
    color: colors.primary,
  },

  // Self-achievement banner (AchievementCard)
  achSelfBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: colors.primarySurface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryBorder,
  },
  achSelfLabel: {
    ...Typography.tiny,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  achSelfTitle: {
    ...Typography.subheading,
    color: colors.textPrimary,
    marginTop: Spacing.xxs,
  },

  // Empower button on AchievementCard
  empowerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.secondary,
  },
  empowerButtonText: {
    ...Typography.smallBold,
    color: colors.white,
  },

  // Loading fallback
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...Typography.subheading, marginTop: Spacing.md, color: colors.textSecondary },

  // Popup overlay
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
    backgroundColor: colors.overlay,
    zIndex: 999,
  },
  modalBox: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.xl,
    width: '85%',
    maxWidth: 360,
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    shadowColor: colors.textPrimary,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 38,
    alignItems: 'center',
  },
  modalTitle: {
    ...Typography.large,
    color: colors.primaryDeeper,
    marginBottom: Spacing.sm,
  },
  modalSubtitle: {
    ...Typography.body,
    color: colors.gray700,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: Spacing.sm,
  },
  modalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  cancelButtonPopup: {
    backgroundColor: colors.backgroundLight,
  },
  confirmButton: {
    backgroundColor: colors.primary,
  },
  cancelText: {
    ...Typography.bodyBold,
    color: colors.gray700,
  },
  confirmText: {
    ...Typography.bodyBold,
    color: colors.white,
  },
});

const createHistoryModalStyles = (colors: typeof Colors) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
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
    padding: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...Typography.large,
    color: colors.textPrimary,
  },
  closeButton: {
    ...Typography.display,
    color: colors.textMuted,
    fontWeight: '300',
  },
  scrollView: {
    maxHeight: 500,
    padding: Spacing.xl,
  },
  hintItem: {
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hintHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sessionLabel: {
    ...Typography.smallBold,
    color: colors.primary,
  },
  dateLabel: {
    ...Typography.caption,
    color: colors.textSecondary,
  },
  hintImage: {
    width: '100%',
    height: vh(150),
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
    backgroundColor: colors.border,
  },
  hintText: {
    ...Typography.body,
    color: colors.gray700,
    marginBottom: Spacing.sm,
  },
  audioContainer: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: colors.backgroundLight,
    borderRadius: BorderRadius.sm,
  },
  audioText: {
    ...Typography.small,
    color: colors.textSecondary,
  },
  emptyText: {
    ...Typography.body,
    textAlign: 'center',
    color: colors.textMuted,
    paddingVertical: Spacing.huge,
  },
});

export default FriendProfileScreen;
