import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLocalDate } from '../utils/i18nHelpers';
import { formatCurrency } from '../utils/helpers';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import * as Haptics from 'expo-haptics';
import { TextInput } from '../components/TextInput';
import { BaseModal } from '../components/BaseModal';
import { Edit2, Users, Award, Heart, Target } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { Goal, UserProfile, Experience, User, ExperienceGift } from '../types';
import { useRootNavigation } from '../types/navigation';
import { goalService } from '../services/GoalService';
import { userService } from '../services/userService';
import { experienceGiftService } from '../services/ExperienceGiftService';
import { notificationService } from '../services/NotificationService';
import { storage, db } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, arrayRemove } from 'firebase/firestore';
import { useFocusEffect } from '@react-navigation/native';

import { experienceService } from '../services/ExperienceService';
import { logger } from '../utils/logger';
import { toJSDate } from '../utils/GoalHelpers';
import { serializeNav } from '../utils/serializeNav';
import { vh } from '../utils/responsive';
import { sanitizeText } from '../utils/sanitization';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Shadows } from '../config/shadows';
import { Spacing } from '../config/spacing';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SkeletonBox } from '../components/SkeletonLoader';
import ClaimExperienceModal from '../components/ClaimExperienceModal';
import ErrorRetry from '../components/ErrorRetry';
import { EmptyState } from '../components/EmptyState';
import { Avatar } from '../components/Avatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FOOTER_HEIGHT } from '../components/CustomTabBar';
import { MotiView } from 'moti';
import { analyticsService } from '../services/AnalyticsService';

// =========================
// Goal Card (Active goals)
// =========================
const CapsuleMini: React.FC<{ filled: boolean }> = React.memo(({ filled }) => {
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
});

const GoalCard: React.FC<{ goal: Goal }> = React.memo(({ goal }) => {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useRootNavigation();
  const { state, dispatch } = useApp();
  const [empoweredName, setEmpoweredName] = useState<string | null>(null);

  useEffect(() => {
    if (!goal.empoweredBy) return;
    let mounted = true;
    userService.getUserName(goal.empoweredBy)
      .then(name => { if (mounted) setEmpoweredName(name); })
      .catch(() => {});
    return () => { mounted = false; };
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

  const handlePress = useCallback(() => {
    // FIX 3b: Serialize Timestamps before navigation to avoid passing non-serializable objects
    navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'Journey', params: { goal: serializeNav(goal) } } });
  }, [navigation, goal]);

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
      <View style={{ marginTop: Spacing.md }}>
        <View style={styles.progressHeaderRow}>
          <Text style={styles.progressHeaderLabel}>{t('profile.goals.sessionsThisWeek')}</Text>
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
      <View style={{ marginTop: Spacing.md }}>
        <View style={styles.progressHeaderRow}>
          <Text style={styles.progressHeaderLabel}>{t('profile.goals.weeksCompleted')}</Text>
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
            dispatch({
              type: 'SET_EMPOWER_CONTEXT',
              payload: {
                goalId: goal.id,
                userId: state.user?.id || '',
                userName: state.user?.displayName || 'You',
              },
            });
            navigation.navigate('MainTabs', { screen: 'HomeTab', params: { screen: 'CategorySelection', params: {
              ...(goal.preferredRewardCategory ? { prefilterCategory: goal.preferredRewardCategory } : {}),
            } } });
          }}
          style={styles.browseButton}
          activeOpacity={0.7}
        >
          <Text style={styles.browseButtonText}>{t('profile.goals.addReward')}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

// ==================================
// Achievement Card (Completed goals)
// ==================================
const StatsRow: React.FC<{ sessions: number; weeks: number; completedAt: string | null }> = React.memo(({ sessions, weeks, completedAt }) => {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.achStatsRow}>
      <View style={styles.achStatItem}>
        <Text style={styles.achStatValue}>{sessions}</Text>
        <Text style={styles.achStatLabel}>{t('profile.stats.sessions')}</Text>
      </View>
      <View style={styles.achStatDivider} />
      <View style={styles.achStatItem}>
        <Text style={styles.achStatValue}>{weeks}</Text>
        <Text style={styles.achStatLabel}>{t('profile.stats.weeks')}</Text>
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
});

const AchievementCard: React.FC<{ goal: Goal }> = React.memo(({ goal }) => {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useRootNavigation();
  const [experience, setExperience] = useState<Experience | null>(null);
  const [partnerName, setPartnerName] = useState<string>('Partner');
  const [gift, setGift] = useState<ExperienceGift | null>(null);
  const [loadingCard, setLoadingCard] = useState<boolean>(true);
  const [showClaimModal, setShowClaimModal] = useState(false);

  const isSelfAchievement = goal.isFreeGoal && !goal.pledgedExperience && !goal.experienceGiftId;
  const hasPledgedExperience = goal.isFreeGoal && !!goal.pledgedExperience;

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

  const canClaimExperience = goal.isFreeGoal && !goal.giftAttachedAt && !goal.experienceGiftId
    && effectiveDeadline && effectiveDeadline > new Date();

  useEffect(() => {
    let mounted = true;
    const loadAchievementData = async () => {
      try {
        // Self-achievement or pledged: no remote data needed
        if (isSelfAchievement || hasPledgedExperience) {
          if (mounted) setLoadingCard(false);
          return;
        }

        // Standard goals
        if (!goal.experienceGiftId) { if (mounted) setLoadingCard(false); return; }
        try {
          const giftData = await experienceGiftService.getExperienceGiftById(goal.experienceGiftId);
          const exp = await experienceService.getExperienceById(giftData.experienceId);
          if (mounted) {
            setGift(giftData);
            setExperience(exp || null);
            setPartnerName(exp?.subtitle || 'Partner');
          }
        } catch (dataErr: unknown) {
          logger.warn('Error fetching gift/experience data:', dataErr);
        }
      } catch (err: unknown) {
        logger.error('Error loading achievement data:', err);
      } finally {
        if (mounted) setLoadingCard(false);
      }
    };
    loadAchievementData();
    return () => { mounted = false; };
  }, [goal.experienceGiftId]);

  const weeks = goal.targetCount || 0;
  const sessions = (goal.targetCount || 0) * (goal.sessionsPerWeek || 0);

  const handlePress = useCallback(() => {
    // FIX 3b: Serialize Timestamps before navigation to avoid passing non-serializable objects
    navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'Journey', params: { goal: serializeNav(goal) } } });
  }, [navigation, goal]);

  // Completion date
  const completedAt = goal.completedAt
    ? formatLocalDate(
        goal.completedAt instanceof Date
          ? goal.completedAt
          : (goal.completedAt as any)?.toDate?.() ?? new Date(),
        { month: 'short', day: 'numeric', year: 'numeric' }
      )
    : null;

  // Self-achievement card
  if (isSelfAchievement) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8}
        style={styles.achievementCard}>
        <View style={styles.achSelfBanner}>
          <Text style={{ ...Typography.display }}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.achSelfLabel}>{t('profile.achievements.selfAchievement')}</Text>
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
              <Text style={styles.claimExperienceButtonText}>{t('profile.achievements.claimExperience')}</Text>
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
            <Image source={{ uri: cover }} style={styles.achievementImage} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={`${pledged.title} cover image`} />
            <View style={styles.achCompletedBadge}>
              <Text style={styles.achCompletedBadgeText}>{t('profile.achievements.completed')}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.achColorBanner, { backgroundColor: colors.primarySurface }]}>
            <View style={styles.achCompletedBadge}>
              <Text style={styles.achCompletedBadgeText}>{t('profile.achievements.completed')}</Text>
            </View>
          </View>
        )}
        <View style={styles.achievementContent}>
          <Text style={styles.achievementTitle} numberOfLines={1}>{goal.title}</Text>
          <Text style={styles.achGoalLabel} numberOfLines={1}>{pledged.title}</Text>
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
              <Text style={styles.claimExperienceButtonText}>{t('profile.achievements.claimExperience')}</Text>
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
          <Image source={{ uri: cover }} style={styles.achievementImage} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={`${experience?.title || 'Experience'} cover image`} />
          <View style={styles.achCompletedBadge}>
            <Text style={styles.achCompletedBadgeText}>Completed</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.achColorBanner, { backgroundColor: colors.primarySurface }]}>
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
            <Text style={styles.achGoalLabel} numberOfLines={1}>{experience?.title || 'Experience'}</Text>
            <StatsRow sessions={sessions} weeks={weeks} completedAt={completedAt} />
          </>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ==================================
// Experience Card (Wishlist)
// ==================================
type ExperienceCardProps = {
  experience: Experience;
  onRemoveFromWishlist: (experienceId: string) => void;
};

const ExperienceCard: React.FC<ExperienceCardProps> = React.memo(({ experience, onRemoveFromWishlist }) => {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useRootNavigation();

  const handlePress = useCallback(() => {
    navigation.navigate('MainTabs', { screen: 'HomeTab', params: { screen: 'ExperienceDetails', params: { experience } } });
  }, [navigation, experience]);

  const handleRemove = useCallback(() => {
    onRemoveFromWishlist(experience.id);
  }, [onRemoveFromWishlist, experience.id]);

  const experienceImage = Array.isArray(experience.imageUrl)
    ? experience.imageUrl[0]
    : experience.imageUrl;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.experienceCard}
      onPress={handlePress}
      accessibilityLabel={t('profile.wishlist.viewDetailsAccessibility', { title: experience.title })}
    >
      <View style={styles.experienceImageContainer}>
        <Image
          source={{ uri: experienceImage }}
          style={styles.experienceImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessibilityLabel={`${experience.title} experience`}
        />
        <TouchableOpacity
          onPress={handleRemove}
          style={styles.wishlistHeartButton}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('profile.wishlist.removeAccessibility', { title: experience.title })}
        >
          <Heart fill={colors.error} color={colors.error} size={22} />
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
          {formatCurrency(Number(experience.price || 0))}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const UserProfileScreen: React.FC = () => {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useApp();
  const navigation = useRootNavigation();
  const { showSuccess, showError, showInfo } = useToast();
  const [activeTab, setActiveTab] = useState<'goals' | 'achievements' | 'wishlist'>('goals');
  const tabScrollRef = useRef<ScrollView>(null);
  const isTabPress = useRef(false);
  const { width: screenWidth } = useWindowDimensions();
  const TAB_KEYS = ['goals', 'achievements', 'wishlist'] as const;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
  const [wishlistRemoveId, setWishlistRemoveId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingImageBlob, setPendingImageBlob] = useState<Blob | null>(null);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const lastProfileFetchRef = useRef<number>(0);

  const userId = state.user?.id || '';

  // FIX 3a: isMounted ref to guard against setState calls on unmounted component
  const loadProfileMountedRef = useRef(true);
  useEffect(() => {
    loadProfileMountedRef.current = true;
    return () => { loadProfileMountedRef.current = false; };
  }, []);

  // Always-current ref for state.user so rollbacks use fresh data, not a stale closure
  const stateUserRef = useRef(state.user);
  useEffect(() => { stateUserRef.current = state.user; }, [state.user]);

  // Screen-view enrichment (fires once data is loaded)
  useEffect(() => {
    if (loading) return;
    analyticsService.trackEvent('screen_view', 'navigation', { activeGoalsCount: activeGoals.length, completedGoalsCount: completedGoals.length, wishlistCount: wishlist.length }, 'UserProfileScreen');
  }, [loading]);

  const loadProfileAndGoals = useCallback(async () => {
    if (!userId) { setLoading(false); setRefreshing(false); return; }
    try {
      setLoading(true);
      setError(false);
      const fetchedProfile = await userService.getUserProfile(userId);
      if (!loadProfileMountedRef.current) return;
      setUserProfile(fetchedProfile);

      const userGoals = await goalService.getUserGoals(userId);
      if (!loadProfileMountedRef.current) return;
      const active = userGoals.filter(
        (g) =>
          !g.isCompleted &&
          g.currentCount < g.targetCount &&
          (!g.startDate || (toJSDate(g.startDate) ?? new Date()) <= new Date())
      );
      const completed = userGoals.filter(
        (g) => {
          return g.isCompleted || g.currentCount >= g.targetCount;
        }
      );

      setActiveGoals(active);
      setCompletedGoals(completed);

      const userWishlist = await userService.getWishlist(userId);
      if (!loadProfileMountedRef.current) return;
      setWishlist(userWishlist || []);
    } catch (error: unknown) {
      logger.error('Error loading profile data:', error);
      if (!loadProfileMountedRef.current) return;
      setError(true);
      showError(t('profile.toast.couldNotLoad'));
    } finally {
      if (loadProfileMountedRef.current) setLoading(false);
    }
  }, [userId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfileAndGoals();
    setRefreshing(false);
  }, [loadProfileAndGoals]);

  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now();
      if (now - lastProfileFetchRef.current < 30_000) return; // skip if < 30s ago
      lastProfileFetchRef.current = now;
      loadProfileAndGoals();
    }, [loadProfileAndGoals])
  );

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

  // ✅ Unified image picker and upload for all platforms
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showError(t('profile.toast.cameraPermission'));
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
        const response = await fetch(localUri);
        const blob = await response.blob();

        // S-06: Client-side file size guard (Storage rules enforce server-side too)
        if (blob.size > 5 * 1024 * 1024) {
          showError(t('profile.toast.imageTooLarge'));
          return;
        }

        // Store blob and local URI; upload deferred until Save is tapped
        setPendingImageBlob(blob);
        setPendingImageUri(localUri);
        setEditFormData((prev) => ({
          ...prev,
          profileImageUrl: localUri, // local URI for preview only
        }));
      } catch (uploadErr: unknown) {
        logger.error('Image pick failed:', uploadErr);
        showError(t('profile.toast.couldNotOpenImage'));
      }
    }
    } catch (error: unknown) {
      logger.error('Image picker error:', error);
      showError('Could not open image picker. Please try again.');
    }
  };

  const openEditModal = () => {
    setEditFormData({
      name: userProfile?.name || state.user?.displayName || '',
      description: userProfile?.description || state.user?.profile?.description || '',
      profileImageUrl: userProfile?.profileImageUrl || '',
    });
    setFormErrors({});
    setPendingImageBlob(null);
    setPendingImageUri(null);
    setIsEditModalVisible(true);
  };

  const closeEditModal = () => {
    setPendingImageBlob(null);
    setPendingImageUri(null);
    setIsEditModalVisible(false);
  };

  const validateField = (field: 'name' | 'description', value: string) => {
    if (field === 'name') {
      if (!value.trim()) {
        setFormErrors(prev => ({ ...prev, name: t('profile.validation.nameRequired') }));
      } else if (value.trim().length < 2) {
        setFormErrors(prev => ({ ...prev, name: t('profile.validation.nameTooShort') }));
      } else {
        setFormErrors(prev => ({ ...prev, name: undefined }));
      }
    }
    if (field === 'description') {
      if (value.length > 300) {
        setFormErrors(prev => ({ ...prev, description: t('profile.validation.descriptionTooLong') }));
      } else {
        setFormErrors(prev => ({ ...prev, description: undefined }));
      }
    }
  };

  const handleSaveProfile = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);

    // Inline validation check
    const nameVal = editFormData.name.trim();
    if (!nameVal || nameVal.length < 2) {
      setFormErrors(prev => ({ ...prev, name: nameVal ? t('profile.validation.nameTooShort') : t('profile.validation.nameRequired') }));
      setIsSaving(false);
      return;
    }
    if (editFormData.description.length > 300) {
      setFormErrors(prev => ({ ...prev, description: t('profile.validation.descriptionTooLong') }));
      setIsSaving(false);
      return;
    }

    // 1. Save previous state for rollback
    const previousProfile = userProfile;

    // 2. Upload pending image blob if present (deferred from pickImage)
    let resolvedImageUrl = editFormData.profileImageUrl || '';
    if (pendingImageBlob) {
      try {
        const ext = (pendingImageUri?.split('.').pop()?.split('?')[0]) || 'jpg';
        const filePath = `profile-images/${userId}/profile_${Date.now()}.${ext}`;
        const storageRef = ref(storage, filePath);
        await uploadBytes(storageRef, pendingImageBlob);
        resolvedImageUrl = await getDownloadURL(storageRef);
        setPendingImageBlob(null);
        setPendingImageUri(null);
      } catch (uploadErr: unknown) {
        logger.error('Upload failed during save:', uploadErr);
        showError(t('profile.toast.couldNotUploadImage'));
        setIsSaving(false);
        return;
      }
    }

    // 3. Prepare updated profile
    const sanitizedName = sanitizeText(nameVal, 50);
    const sanitizedDescription = sanitizeText(editFormData.description.trim(), 300);
    const profileUpdates = {
      name: sanitizedName || userProfile?.name || '',
      description: sanitizedDescription,
      profileImageUrl: resolvedImageUrl,
      updatedAt: new Date(),
    };

    const updatedProfile: UserProfile = {
      ...(userProfile as UserProfile),
      ...profileUpdates,
    };

    // 4. Update UI immediately
    setUserProfile(updatedProfile);
    if (state.user) {
      const updatedUser: User = { ...state.user, profile: updatedProfile };
      dispatch({ type: 'SET_USER', payload: updatedUser });
    }

    // 5. Close modal and show success immediately
    setIsEditModalVisible(false);
    showSuccess(t('profile.toast.profileUpdated'));
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // 6. Call API in background
    try {
      await userService.updateUserProfile(userId, { profile: updatedProfile });
    } catch (error: unknown) {
      // 7. Rollback on failure — use stateUserRef.current for always-fresh user data
      logger.error('Error updating profile:', error);
      setUserProfile(previousProfile);
      if (stateUserRef.current && previousProfile) {
        const revertedUser: User = { ...stateUserRef.current, profile: previousProfile };
        dispatch({ type: 'SET_USER', payload: revertedUser });
      }
      showError(t('profile.toast.failedToUpdate'));
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, editFormData, userProfile, userId, state.user, dispatch, pendingImageBlob, pendingImageUri]);

  const handleRemoveFromWishlist = useCallback((experienceId: string) => {
    if (!state.user) {
      showInfo(t('profile.toast.loginToManageWishlist'));
      return;
    }

    setWishlistRemoveId(experienceId);
  }, [state.user, showInfo]);

  const confirmRemoveFromWishlist = async () => {
    const experienceId = wishlistRemoveId;
    if (!experienceId) return;
    setWishlistRemoveId(null);

    // BUG-20: guard against null user to avoid doc(db, 'users', '') empty-string ref
    const uid = state.user?.id;
    if (!uid) { showError(t('profile.toast.notLoggedIn')); return; }

    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { wishlist: arrayRemove(experienceId) });

      // BUG-19: guard against setState on unmounted component
      if (!loadProfileMountedRef.current) return;

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
    } catch (error: unknown) {
      logger.error('Error removing from wishlist:', error);
      showError(t('profile.toast.failedToRemoveWishlist'));
    }
  };

  const renderTabContent = (tab: typeof activeTab) => {
    if (loading) {
      return (
        <View style={{ marginTop: Spacing.xl, gap: Spacing.lg, paddingHorizontal: Spacing.xl }}>
          <SkeletonBox width="100%" height={80} borderRadius={12} />
          <SkeletonBox width="60%" height={20} borderRadius={8} />
          <SkeletonBox width="100%" height={120} borderRadius={12} />
          <SkeletonBox width="80%" height={20} borderRadius={8} />
        </View>
      );
    }

    if (error) {
      return <ErrorRetry message={t('profile.error.couldNotLoad')} onRetry={loadProfileAndGoals} />;
    }

    if (tab === 'goals') {
      if (!activeGoals.length) {
        return (
          <View style={styles.emptyGoalsCenter}>
            <EmptyState title={t('profile.empty.goalsTitle')} message={t('profile.empty.goalsMessage')} actionLabel={t('profile.empty.goalsAction')} onAction={() => navigation.navigate('ChallengeLanding')} />
          </View>
        );
      }
      return activeGoals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} />
      ));
    }

    if (tab === 'achievements') {
      if (!completedGoals.length) {
        return <EmptyState title={t('profile.empty.achievementsTitle')} message={t('profile.empty.achievementsMessage')} />;
      }
      return completedGoals.map((goal) => (
        <AchievementCard key={goal.id} goal={goal} />
      ));
    }

    // wishlist
    if (!wishlist.length) {
      return <EmptyState title={t('profile.empty.wishlistTitle')} message={t('profile.empty.wishlistMessage')} />;
    }

    return wishlist.map((exp) => (
      <ExperienceCard key={exp.id} experience={exp} onRemoveFromWishlist={handleRemoveFromWishlist} />
    ));
  };

  if (error && !loading) {
    return (
      <ErrorBoundary screenName="UserProfileScreen" userId={userId}>
          <ErrorRetry
            message={t('profile.error.couldNotLoad')}
            onRetry={() => {
              setError(false);
              setLoading(true);
              loadProfileAndGoals();
            }}
          />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="UserProfileScreen" userId={userId}>
      <StatusBar style="auto" />
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
          {/* Hero Section */}
          <View style={[styles.heroSection, { paddingTop: insets.top + Spacing.lg }]}>
            <View style={styles.profileImageContainer}>
              <Avatar
                uri={userProfile?.profileImageUrl}
                name={userProfile?.name || state.user?.displayName}
                size="xl"
                style={{ width: vh(110), height: vh(110), borderRadius: vh(55) }}
              />
              <MotiView
                from={{ opacity: 0, scale: 0.85, translateY: -4 }}
                animate={{ opacity: 1, scale: 1, translateY: 0 }}
                exit={{ opacity: 0, scale: 0.85, translateY: -4 }}
                transition={{ type: 'timing', duration: 150 }}
                style={styles.editIconButton}
              >
                <TouchableOpacity
                  onPress={openEditModal}
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                >
                  <Edit2 color={colors.secondary} size={18} />
                </TouchableOpacity>
              </MotiView>
            </View>

            <Text style={styles.userName}>
              {userProfile?.name || state.user?.displayName || 'User'}
            </Text>
            {userProfile?.description && (
              <Text style={styles.userDescription} numberOfLines={3}>{userProfile.description}</Text>
            )}

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{activeGoals.length}</Text>
                <Text style={styles.statLabel}>{t('profile.stats.active')}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{completedGoals.length}</Text>
                <Text style={styles.statLabel}>{t('profile.stats.completed')}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{wishlist.length}</Text>
                <Text style={styles.statLabel}>{t('profile.stats.wishlist')}</Text>
              </View>
            </View>


            <TouchableOpacity
              style={styles.friendsButton}
              onPress={() => navigation.navigate('FriendsList')}
              accessibilityRole="button"
              accessibilityLabel={t('profile.friendsButtonAccessibility')}
            >
              <Users color={colors.secondary} size={20} />
              <Text style={styles.friendsButtonText}>{t('profile.viewFriends')}</Text>
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
              { key: 'goals' as const, label: t('profile.tabs.goals'), icon: Target },
              { key: 'achievements' as const, label: t('profile.tabs.achievements'), icon: Award },
              { key: 'wishlist' as const, label: t('profile.tabs.wishlist'), icon: Heart },
            ] as const).map((tab) => (
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
                accessibilityLabel={t('profile.tabAccessibility', { label: tab.label })}
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
            <View style={{ width: screenWidth, paddingBottom: 80 + FOOTER_HEIGHT + insets.bottom }}>
              {renderTabContent('goals')}
            </View>
            <View style={{ width: screenWidth, paddingBottom: 80 + FOOTER_HEIGHT + insets.bottom }}>
              {renderTabContent('achievements')}
            </View>
            <View style={{ width: screenWidth, paddingBottom: 80 + FOOTER_HEIGHT + insets.bottom }}>
              {renderTabContent('wishlist')}
            </View>
          </ScrollView>
        </ScrollView>

        {/* Edit Modal */}
        <BaseModal
          visible={isEditModalVisible}
          onClose={closeEditModal}
          title={t('profile.editModal.title')}
          variant="bottom"
          noPadding
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={closeEditModal}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelText}>{t('profile.editModal.cancel')}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{t('profile.editModal.title')}</Text>
              <TouchableOpacity
                onPress={handleSaveProfile}
                style={styles.modalSaveButton}
                disabled={isSaving}
              >
                <Text style={styles.modalSaveText}>
                  {isSaving ? t('profile.editModal.saving') : t('profile.editModal.save')}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
              <View style={styles.imageSection}>
                <TouchableOpacity onPress={pickImage} style={styles.imagePickerButton}>
                  {editFormData.profileImageUrl &&
                    editFormData.profileImageUrl.trim() !== '' ? (
                    <Image
                      source={{ uri: editFormData.profileImageUrl }}
                      style={styles.editProfileImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
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
                <Text style={styles.imagePickerLabel}>{t('profile.editModal.tapToChangePhoto')}</Text>
              </View>

              <TextInput
                label={t('profile.editModal.nameLabel')}
                value={editFormData.name}
                onChangeText={(text) => {
                  setEditFormData((prev) => ({ ...prev, name: text }));
                  validateField('name', text);
                }}
                placeholder={t('profile.editModal.namePlaceholder')}
                maxLength={50}
                error={formErrors.name}
              />

              <TextInput
                label={t('profile.editModal.aboutLabel', { count: editFormData.description.length })}
                value={editFormData.description}
                onChangeText={(text) => {
                  setEditFormData((prev) => ({ ...prev, description: text }));
                  validateField('description', text);
                }}
                placeholder={t('profile.editModal.aboutPlaceholder')}
                multiline
                numberOfLines={6}
                maxLength={300}
                error={formErrors.description}
                inputStyle={{ minHeight: Spacing.textareaMinHeight }}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </BaseModal>
      <ConfirmationDialog
        visible={wishlistRemoveId !== null}
        title={t('profile.wishlist.removeTitle')}
        message={t('profile.wishlist.removeMessage')}
        confirmLabel={t('profile.wishlist.removeConfirm')}
        onConfirm={confirmRemoveFromWishlist}
        onCancel={() => setWishlistRemoveId(null)}
        variant="danger"
      />
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  emptyGoalsCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: vh(40) },
  heroSection: {
    backgroundColor: colors.backgroundLight,
    paddingTop: Spacing.lg, // base padding; overridden inline with insets.top + Spacing.lg
    paddingBottom: Spacing.xxxl,
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
    borderBottomLeftRadius: BorderRadius.xxl,
    borderBottomRightRadius: BorderRadius.xxl,
  },

  // progress headers (for mini capsules in goals)
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  progressHeaderLabel: {
    ...Typography.small,
    color: colors.textSecondary,
  },
  progressHeaderValue: {
    ...Typography.small,
    color: colors.textPrimary,
    fontWeight: '600',
  },

  profileImageContainer: { position: 'relative', marginBottom: Spacing.lg },
  profileImage: {
    width: vh(110),
    height: vh(110),
    borderRadius: BorderRadius.pill,
    borderWidth: 3,
    borderColor: colors.primaryBorder,
  },
  placeholderImage: {
    width: vh(110),
    height: vh(110),
    borderRadius: BorderRadius.pill,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { ...Typography.displayLarge, fontSize: vh(36), color: colors.white },
  editIconButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: BorderRadius.xl,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.backgroundLight,
    ...Shadows.sm,
    shadowOpacity: 0.1,
  },
  userName: { ...Typography.heading1, color: colors.textPrimary, marginBottom: Spacing.xs },
  userDescription: {
    ...Typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xxl, paddingHorizontal: Spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
    ...Shadows.sm,
  },
  statNumber: { ...Typography.heading2, color: colors.primary },
  statLabel: { ...Typography.caption, color: colors.textSecondary },
  friendsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.primarySurface,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.primaryTint,
    position: 'relative',
  },
  friendsButtonText: { ...Typography.subheading, color: colors.secondary },
  notificationBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.error,
    borderRadius: BorderRadius.sm,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: { color: colors.white, ...Typography.tiny },
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

  // Active goal card
  goalCard: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    ...Shadows.sm,
  },
  goalTitle: { ...Typography.heading3, color: colors.textPrimary, marginBottom: Spacing.xs },
  goalMeta: { ...Typography.small, color: colors.textSecondary, marginTop: Spacing.xs },

  // Wishlist card
  experienceCard: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  experienceImageContainer: {
    position: 'relative',
  },
  experienceImage: { width: '100%', height: vh(140), backgroundColor: colors.border },
  wishlistHeartButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: colors.overlay,
    padding: Spacing.xs,
    borderRadius: BorderRadius.xl,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  experienceContent: { padding: Spacing.lg },
  experienceTitle: { ...Typography.subheading, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.xs },
  experienceDescription: { ...Typography.small, color: colors.textSecondary, marginBottom: Spacing.sm },
  experiencePrice: { ...Typography.heading3, color: colors.secondary },

  // ACHIEVEMENT CARD
  achievementCard: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    overflow: 'hidden',
    ...Shadows.md,
    shadowOpacity: 0.06,
  },
  achievementImage: {
    width: '100%',
    height: vh(150),
    backgroundColor: colors.border,
  },
  achievementContent: {
    padding: Spacing.md,
  },
  achievementTitle: {
    ...Typography.subheading,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: Spacing.xxs,
  },

  // Stats row
  achStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.backgroundLight,
  },
  achStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  achStatValue: {
    ...Typography.subheading,
    fontWeight: '700',
    color: colors.primary,
  },
  achStatLabel: {
    ...Typography.tiny,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: Spacing.xxs,
  },
  achStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.backgroundLight,
  },

  // Self-achievement banner
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
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: Spacing.xxs,
  },

  // Completed badge overlay
  achCompletedBadge: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    backgroundColor: colors.primaryOverlay,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xl,
  },
  achCompletedBadgeText: {
    ...Typography.tiny,
    color: colors.white,
  },

  // Color banner fallback (no image)
  achColorBanner: {
    width: '100%',
    height: vh(120),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Goal label
  achGoalLabel: {
    ...Typography.small,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: Spacing.xxs,
  },

  // Partner label
  achPartnerLabel: {
    ...Typography.captionBold,
    color: colors.primary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xxs,
  },

  // Skeleton loading
  achSkeletonContainer: {
    gap: Spacing.sm,
  },
  achSkeletonLine: {
    height: 14,
    backgroundColor: colors.backgroundLight,
    borderRadius: BorderRadius.xs,
  },


  // Browse Experiences button (GoalCard)
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.primarySurface,
    borderWidth: 1,
    borderColor: colors.primaryTint,
  },
  browseButtonText: {
    ...Typography.smallBold,
    color: colors.secondary,
  },

  // Claim Experience button (AchievementCard)
  claimExperienceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.primarySurface,
    borderWidth: 1,
    borderColor: colors.primaryTint,
  },
  claimExperienceButtonText: {
    ...Typography.smallBold,
    color: colors.secondary,
  },

  emptyStateText: { textAlign: 'center', marginTop: Spacing.huge, color: colors.textMuted, ...Typography.subheading },
  modalContainer: { flex: 1, backgroundColor: colors.surface },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalCancelButton: { paddingVertical: Spacing.sm },
  modalCancelText: { ...Typography.subheading, color: colors.secondary },
  modalTitle: { ...Typography.heading3, color: colors.textPrimary },
  modalSaveButton: { paddingVertical: Spacing.sm },
  modalSaveText: { ...Typography.subheading, color: colors.secondary },
  disabledButton: { opacity: 0.5 },
  disabledText: { color: colors.textMuted },
  modalContent: { flex: 1, padding: Spacing.xl },
  imageSection: { alignItems: 'center', marginBottom: Spacing.xxxl },
  imagePickerButton: { position: 'relative', marginBottom: Spacing.md },
  editProfileImage: { width: vh(110), height: vh(110), borderRadius: BorderRadius.pill },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.secondary,
    width: 36,
    height: 36,
    borderRadius: BorderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.white,
  },
  imageOverlayText: { ...Typography.subheading },
  imagePickerLabel: { ...Typography.small, color: colors.textSecondary },
});

export default UserProfileScreen;
