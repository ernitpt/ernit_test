import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '../utils/i18nHelpers';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Image,
  RefreshControl,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { Avatar } from '../components/Avatar';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { notificationService } from '../services/NotificationService';
import { experienceGiftService } from '../services/ExperienceGiftService';
import { goalService } from '../services/GoalService';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { RootStackParamList, Notification } from '../types';
import FriendRequestNotification from '../components/FriendRequestNotification';
import GoalApprovalNotification from '../components/GoalApprovalNotification';
import GoalChangeSuggestionNotification from '../components/GoalChangeSuggestionNotification';
import GoalEditApprovalNotification from '../components/GoalEditApprovalNotification';
import { GoalProgressNotification } from '../components/GoalProgressNotification';
import FreeGoalNotification from '../components/FreeGoalNotification';
import { NotificationSkeleton } from '../components/SkeletonLoader';
import SharedHeader from '../components/SharedHeader';
import Animated, { ZoomIn, FadeInDown } from 'react-native-reanimated';
import { logger } from '../utils/logger';
import { analyticsService } from '../services/AnalyticsService';
import { Bell, TrendingUp, Gift, X, Users, CreditCard, AlertCircle, Activity, CheckCircle, Trophy, Trash2 } from 'lucide-react-native';
import { Colors, useColors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import { ErrorBoundary } from '../components/ErrorBoundary';
import ErrorRetry from '../components/ErrorRetry';
import * as Haptics from 'expo-haptics';
import { EmptyState } from '../components/EmptyState';
import Button from '../components/Button';
import { FOOTER_HEIGHT } from '../components/CustomTabBar';
import RootFooterTabBar from '../components/RootFooterTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


type NotificationNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Notification'
>;

// formatNotificationDate replaced by formatRelativeTime from i18nHelpers

const NotificationsScreen = () => {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const fmtDate = useCallback((createdAt: Date | { toDate(): Date } | number | string | null | undefined): string => {
    if (!createdAt) return '';
    const ts = createdAt as { toDate?: () => Date };
    const date = typeof ts.toDate === 'function'
      ? ts.toDate()
      : new Date(createdAt as string | number | Date);
    if (isNaN(date.getTime())) return '';
    return formatRelativeTime(date.getTime(), t);
  }, [t]);
  const { state } = useApp();
  const { showSuccess, showError, showInfo } = useToast();
  const userId = state.user?.id;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userGoals, setUserGoals] = useState<Record<string, boolean>>({}); // Map goalId -> isCompleted
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [clearNotificationId, setClearNotificationId] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(20);
  const isRefreshingRef = useRef(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tappingRef = useRef(false);
  const navigation = useNavigation<NotificationNavigationProp>();

  // Pre-compute latest goal_progress notification per goal (single-pass O(n))
  const latestGoalProgressMap = useMemo(() => {
    const map: Record<string, string> = {}; // goalId -> notificationId of latest
    const sessionNums: Record<string, number> = {}; // goalId -> highest sessionNumber seen
    for (const n of notifications) {
      if (n.type !== 'goal_progress' || !n.data?.goalId) continue;
      const goalId = n.data.goalId;
      const sessionNumber = n.data?.sessionNumber || 0;
      if (!map[goalId] || sessionNumber > (sessionNums[goalId] || 0)) {
        map[goalId] = n.id!;
        sessionNums[goalId] = sessionNumber;
      }
    }
    return map;
  }, [notifications]);

  // Pre-compute latest free_goal_milestone notification per goal (same pattern)
  const latestFreeGoalMilestoneMap = useMemo(() => {
    const map: Record<string, string> = {}; // goalId -> notificationId of latest
    const milestones: Record<string, number> = {}; // goalId -> highest milestone seen
    for (const n of notifications) {
      if (n.type !== 'free_goal_milestone' || !n.data?.goalId) continue;
      const goalId = n.data.goalId;
      const milestone = n.data?.milestone || 0;
      if (!map[goalId] || milestone > (milestones[goalId] || 0)) {
        map[goalId] = n.id!;
        milestones[goalId] = milestone;
      }
    }
    return map;
  }, [notifications]);

  // Analytics: track screen view on mount
  useEffect(() => {
    analyticsService.trackEvent('screen_view', 'navigation', { screen: 'NotificationsScreen' }, 'NotificationsScreen');
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(false);

    let isCancelled = false;
    let unsubscribeNotifs: (() => void) | undefined;
    let unsubscribeGoals: (() => void) | undefined;

    const subscribe = async () => {
      // T3-4: Guard against stale callbacks if userId changed
      unsubscribeNotifs = notificationService.listenToUserNotifications(userId, (notifications) => {
        if (isCancelled) return;
        setNotifications(notifications);
        setLoading(false);
        setError(false);

        // If this callback is the result of a pull-to-refresh, end the spinner and confirm freshness
        if (isRefreshingRef.current) {
          isRefreshingRef.current = false;
          setRefreshing(false);
          showInfo(t('notifications.toast.upToDate'));
        }
      }, (error) => {
        // BUG-36 FIX: Surface snapshot errors so the UI exits the loading skeleton
        // and shows the error/retry state instead of hanging indefinitely.
        if (isCancelled) return;
        logger.error('[NotificationsScreen] Notification listener error:', error.message);
        setError(true);
        setLoading(false);
      });

      if (isCancelled) {
        unsubscribeNotifs?.();
        return;
      }

      unsubscribeGoals = goalService.listenToUserGoals(userId, (goals) => {
        if (isCancelled) return;
        const goalsMap: Record<string, boolean> = {};
        goals.forEach(g => {
          goalsMap[g.id] = !!g.isCompleted;
        });
        setUserGoals(goalsMap);
      });

      if (isCancelled) {
        unsubscribeGoals?.();
      }
    };

    subscribe().catch((error) => {
      logger.error('Error subscribing to notifications:', error);
      if (!isCancelled) {
        setError(true);
        setLoading(false);
        if (isRefreshingRef.current) {
          isRefreshingRef.current = false;
          setRefreshing(false);
        }
      }
    });

    return () => {
      isCancelled = true;
      if (unsubscribeNotifs) unsubscribeNotifs();
      if (unsubscribeGoals) unsubscribeGoals();
    };
  }, [userId, refreshKey]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    isRefreshingRef.current = true;
    setRefreshKey(prev => prev + 1); // Force listener re-subscribe
  }, []);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  const handlePress = useCallback(async (n: Notification) => {
    if (!userId) return;
    // BUG-14: tappingRef guard prevents double-tap / concurrent invocations from both
    // reaching the async body. This is the UI-layer defence for the TOCTOU on
    // giftAttachedAt. The definitive fix is an idempotency check inside
    // goalService.attachGiftToGoal (server/service layer).
    if (tappingRef.current) return;
    tappingRef.current = true;
    try {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    analyticsService.trackEvent('notification_tapped', 'engagement', { type: n.type }, 'NotificationsScreen');
    await notificationService.markAsRead(n.id!);

    if (n.type === 'gift_received') {
      if (!n.data?.giftId) {
        showError('Could not open — data unavailable');
      } else {
        try {
          const gift = await experienceGiftService.getExperienceGiftById(n.data.giftId);
          if (gift && gift.experienceId) {
            navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'GoalSetting', params: { experienceGift: gift } } });
          } else {
            showError('Could not open — data unavailable');
          }
        } catch (error: unknown) {
          logger.error('Error fetching experience gift:', error);
          showError('Could not open — data unavailable');
        }
      }
    }

    if (n.type === 'personalized_hint_left' && n.data?.goalId) {
      // Check if goal is completed using our local state
      if (userGoals[n.data.goalId]) {
        showInfo('This goal is already completed');
        return;
      }

      try {
        const goal = await goalService.getGoalById(n.data.goalId);
        if (goal) {
          navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'Journey', params: { goal } } });
        } else {
          showError('Could not open — data unavailable');
        }
      } catch (error: unknown) {
        logger.error('Error fetching goal:', error);
        showError('Could not open — data unavailable');
      }
    }

    if (n.type === 'personalized_hint_left' && !n.data?.goalId) {
      showError('Could not open — data unavailable');
    }

    if (n.type === 'post_reaction' && n.data?.postId) {
      navigation.navigate('MainTabs', { screen: 'FeedTab', params: { screen: 'Feed', params: { highlightPostId: n.data.postId } } });
    }

    if (n.type === 'post_reaction' && !n.data?.postId) {
      showError('Could not open — data unavailable');
    }

    if (n.type === 'post_comment' && n.data?.postId) {
      navigation.navigate('MainTabs', { screen: 'FeedTab', params: { screen: 'Feed', params: { highlightPostId: n.data.postId } } });
    }

    if (n.type === 'post_comment' && !n.data?.postId) {
      showError('Could not open — data unavailable');
    }

    if ((n.type === 'session_reminder' || n.type === 'weekly_recap') && n.data?.goalId) {
      try {
        const goal = await goalService.getGoalById(n.data.goalId);
        if (goal) {
          navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'Journey', params: { goal } } });
        } else {
          // BUG-17: show error when goal is null instead of silently doing nothing
          showError('Could not open — data unavailable');
        }
      } catch (error: unknown) {
        logger.error('Error navigating from reminder notification:', error);
        showError('Could not open — data unavailable');
      }
    }

    if (n.type === 'motivation_received' && n.data?.goalId) {
      try {
        const goal = await goalService.getGoalById(n.data.goalId);
        if (goal) {
          navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'Journey', params: { goal } } });
        } else {
          // BUG-17: show error when goal is null instead of silently doing nothing
          showError('Could not open — data unavailable');
        }
      } catch (error: unknown) {
        logger.error('Error navigating from motivation notification:', error);
        showError('Could not open — data unavailable');
      }
    }

    if (n.type === 'experience_empowered' && n.data?.goalId && n.data?.giftId) {
      Alert.alert(
        t('notifications.attachGift.title'),
        t('notifications.attachGift.message'),
        [
          { text: t('notifications.attachGift.cancel'), style: 'cancel' },
          {
            text: t('notifications.attachGift.confirm'),
            onPress: async () => {
              try {
                // Check if gift is already attached before attempting
                const existingGoal = await goalService.getGoalById(n.data.goalId);
                if (!existingGoal?.giftAttachedAt) {
                  try {
                    await goalService.attachGiftToGoal(n.data.goalId, n.data.giftId, n.data.giverId || userId!, n.data.isMystery === true, userId!);
                  } catch (attachErr: unknown) {
                    // Treat race-condition errors as success: another path has already
                    // attached this gift (e.g. a duplicate notification fired or the
                    // user tapped twice). Re-fetch to confirm before reporting success.
                    const code = (attachErr as { code?: string } | undefined)?.code;
                    const isRace = code === 'DUPLICATE_GIFT' || code === 'GIFT_REDEEMED';
                    if (!isRace) throw attachErr;
                    logger.info(`Gift attach race resolved gracefully (${code})`);
                  }
                }
                // H9: getGoalById after attach is wrapped in its own try/catch with fallback navigation
                let goal = existingGoal?.giftAttachedAt ? existingGoal : null;
                if (!goal) {
                  try {
                    goal = await goalService.getGoalById(n.data.goalId);
                  } catch (fetchError: unknown) {
                    logger.error('Failed to fetch goal after gift attachment:', fetchError);
                    showError('Something went wrong. Please check your goals.');
                    navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'Goals' } });
                    return;
                  }
                }
                if (n.data.isMystery) {
                  showSuccess(t('notifications.attachGift.mysterySuccess', { name: n.data.giverName || t('notifications.attachGift.aFriend') }));
                } else {
                  showSuccess(t('notifications.attachGift.success', { name: n.data.giverName || t('notifications.attachGift.aFriend') }));
                }
                if (goal) {
                  navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'Journey', params: { goal } } });
                } else {
                  navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'Goals' } });
                }
              } catch (error: unknown) {
                logger.error('Error attaching empowered gift:', error);
                const code = (error as { code?: string } | undefined)?.code;
                if (code === 'GIFT_EXPIRED') {
                  showError('This gift has expired and can no longer be attached.');
                } else {
                  showError('Could not attach the gift. Please try again.');
                }
                navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'Goals' } }); // H9: fallback navigation so user is never stranded
              }
            },
          },
        ]
      );
      return;
    }

    if (n.type === 'experience_booking_reminder' && n.data?.goalId) {
      try {
        const goal = await goalService.getGoalById(n.data.goalId);
        if (goal) {
          if (goal.experienceGiftId) {
            const gift = await experienceGiftService.getExperienceGiftById(goal.experienceGiftId);
            if (gift) {
              navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'AchievementDetail', params: { goal, experienceGift: gift, mode: 'completion' } } });
              return;
            }
          }
          navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'Journey', params: { goal } } });
        }
      } catch (error: unknown) {
        logger.error('Error navigating from booking reminder:', error);
      }
    }

    if (
      n.type === 'shared_start' ||
      n.type === 'shared_completion' ||
      n.type === 'shared_unlock' ||
      n.type === 'shared_session'
    ) {
      if (n.data?.goalId) {
        navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'GoalDetail', params: { goalId: n.data.goalId } } });
      }
    }

    if (n.type === 'payment_charged') {
      if (n.data?.goalId) {
        navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'GoalDetail', params: { goalId: n.data.goalId } } });
      }
    }

    if (n.type === 'payment_failed') {
      if (n.data?.recoveryUrl) {
        // BUG-16: validate URL before opening to prevent opening non-https or malformed URLs
        const url = n.data?.recoveryUrl;
        if (!url || !url.startsWith('https://')) {
          showError('Invalid recovery URL');
          return;
        }
        Linking.openURL(url);
      } else {
        navigation.navigate('PurchasedGifts');
      }
    }

    // payment_cancelled — goal (and possibly gift) was removed before charge. No destination
    // to navigate to; route to PurchasedGifts so the giver can see the cancellation in context.
    if (n.type === 'payment_cancelled') {
      navigation.navigate('PurchasedGifts');
    }

    // shared_partner_removed — the other partner left the shared challenge. Goal context
    // may be stale/missing; route to the Goals list so user can re-engage from there.
    if (n.type === 'shared_partner_removed') {
      navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'Goals' } });
    }

    if ((n.type === 'goal_approval_response' || n.type === 'goal_edit_response') && n.data?.goalId) {
      navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'GoalDetail', params: { goalId: n.data.goalId } } });
    }

    if (n.type === 'goal_set' && n.data?.goalId) {
      navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'GoalDetail', params: { goalId: n.data.goalId } } });
    }

    if ((n.type === 'goal_progress' || n.type === 'free_goal_milestone' || n.type === 'inactivity_nudge') && n.data?.goalId) {
      navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'GoalDetail', params: { goalId: n.data.goalId } } });
    }

    if (n.type === 'goal_completed' && n.data?.goalId) {
      try {
        const goal = await goalService.getGoalById(n.data.goalId);
        if (goal) {
          navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'AchievementDetail', params: { goal, mode: 'completion' } } });
        } else {
          showError('Could not open — data unavailable');
        }
      } catch (error: unknown) {
        logger.error('Error navigating from goal_completed notification:', error);
        showError('Could not open — data unavailable');
      }
      return;
    }

    if ((n.type === 'valentine_partner_progress' || n.type === 'valentine_start' || n.type === 'valentine_unlock' || n.type === 'valentine_completion') && n.data?.goalId) {
      navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'GoalDetail', params: { goalId: n.data.goalId } } });
    }
    } catch (e) {
      // BUG-18: catch unexpected errors (navigation failures, network errors, etc.)
      // that are not handled by the individual notification type blocks
      logger.error('handlePress error:', e);
      showError('Something went wrong, please try again.');
    } finally {
      setTimeout(() => { tappingRef.current = false; }, 500);
    }
  }, [userId, navigation, userGoals, showError]);


  const handleFriendRequestHandled = useCallback(() => {
    // No-op: the real-time onSnapshot listener in useEffect handles updates automatically
  }, []);


  const handleClearAll = useCallback(() => {
    setShowClearAllConfirm(true);
  }, []);

  const confirmClearAll = useCallback(async () => {
    setShowClearAllConfirm(false);
    if (!userId) {
      showError(t('notifications.toast.notAuthenticated'));
      return;
    }

    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await notificationService.clearAllNotifications(userId);
      showSuccess(t('notifications.toast.allCleared'));
    } catch (error: unknown) {
      logger.error('Error clearing all notifications:', error);
      showError(t('notifications.toast.failedClearAll'));
    }
  }, [userId, showError, showSuccess]);


  const handleClearNotification = useCallback((notificationId: string) => {
    if (!notificationId) {
      showError(t('notifications.toast.missingId'));
      return;
    }

    setClearNotificationId(notificationId);
  }, [showError]);

  const confirmClearNotification = useCallback(async () => {
    const notificationId = clearNotificationId;
    if (!notificationId) return;
    setClearNotificationId(null);

    try {
      await notificationService.deleteNotification(notificationId);
      analyticsService.trackEvent('notification_dismissed', 'engagement', {
        notificationId,
      }, 'NotificationsScreen');
      // No toast needed - the notification just disappears
    } catch (error: unknown) {
      logger.error('Error clearing notification:', error);
      showError(t('notifications.toast.failedClear'));
    }
  }, [clearNotificationId, showError]);


  const handleApprovalActionTaken = useCallback(() => {
    // No-op: the real-time onSnapshot listener in useEffect handles updates automatically
  }, []);

  const handleLoadMore = useCallback(() => {
    setDisplayCount(prev => Math.min(prev + 20, notifications.length));
  }, [notifications.length]);

  const renderItem = useCallback(({ item, index }: { item: Notification; index: number }) => {
    // Handle friend request notifications specially
    if (item.type === 'friend_request') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <FriendRequestNotification
            notification={item}
            onRequestHandled={handleFriendRequestHandled}
          />
        </Animated.View>
      );
    }

    // Handle goal approval request notifications
    if (item.type === 'goal_approval_request') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <GoalApprovalNotification
            notification={item}
            onActionTaken={handleApprovalActionTaken}
          />
        </Animated.View>
      );
    }

    // Handle goal change suggestion notifications
    if (item.type === 'goal_change_suggested') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <GoalChangeSuggestionNotification
            notification={item}
            onActionTaken={handleApprovalActionTaken}
          />
        </Animated.View>
      );
    }

    // Handle goal edit request notifications (for givers to approve or reject)
    if (item.type === 'goal_edit_request') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <GoalEditApprovalNotification
            notification={item}
            onActionTaken={handleApprovalActionTaken}
          />
        </Animated.View>
      );
    }

    // Handle goal progress notifications (for givers to leave hints)
    if (item.type === 'goal_progress') {
      const isLatest = item.data?.goalId
        ? latestGoalProgressMap[item.data.goalId] === item.id
        : true;

      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <GoalProgressNotification notification={item} isLatest={isLatest} />
        </Animated.View>
      );
    }

    // Handle free goal milestone/completion notifications with Empower + Motivate buttons
    if (item.type === 'free_goal_milestone' || item.type === 'free_goal_completed') {
      const isMilestoneLatest = item.data?.goalId
        ? latestFreeGoalMilestoneMap[item.data.goalId] === item.id
        : true;

      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <FreeGoalNotification
            notification={item}
            isLatest={isMilestoneLatest}
            onActionComplete={handleFriendRequestHandled}
          />
        </Animated.View>
      );
    }

    // Handle goal approval/edit response notifications (approved/rejected)
    if (item.type === 'goal_approval_response' || item.type === 'goal_edit_response') {
      const isApproved = item.data?.approved !== false;
      const accentColor = isApproved ? colors.success : colors.error;
      const bgColor = isApproved ? colors.successLight : colors.errorLight;
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <TouchableOpacity
            onPress={() => handlePress(item)}
            activeOpacity={0.8}
            style={[
              styles.notificationCard,
              !item.read && styles.notificationCardUnread,
              { borderLeftWidth: 3, borderLeftColor: accentColor },
            ]}
            accessibilityRole="button"
            accessibilityLabel={item.message}
          >
            <View style={styles.reminderCardContent}>
              <View style={[styles.reminderIconContainer, { backgroundColor: bgColor }]}>
                <CheckCircle size={24} color={accentColor} />
              </View>
              <View style={styles.reminderTextContent}>
                <View style={styles.reactionHeader}>
                  <Text style={styles.reminderTitle}>{item.title}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
                <Text style={styles.reactionDate}>{fmtDate(item.createdAt)}</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.6 }]}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </Pressable>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle post reaction notifications with enhanced design
    if (item.type === 'post_reaction') {
      const mostRecentReaction = (item.data?.mostRecentReaction as 'muscle' | 'heart' | 'like') || 'like';

      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <TouchableOpacity
            onPress={() => handlePress(item)}
            activeOpacity={0.8}
            style={[
              styles.notificationCard,
              !item.read && styles.notificationCardUnread,
              { borderLeftWidth: 3, borderLeftColor: colors.primary },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${item.message}. Tap to view post`}
          >
            <View style={styles.reactionCardContent}>
              {/* Profile Image or Placeholder */}
              <Avatar
                uri={item.data?.reactorProfileImageUrl}
                name={item.data?.reactorNames?.[0]}
                size="lg"
              />

              {/* Content */}
              <View style={styles.reactionContent}>
                <View style={styles.reactionHeader}>
                  <Text style={styles.reactionMessage} numberOfLines={2}>
                    {item.message}
                  </Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>

                <Text style={styles.reactionDate}>
                  {fmtDate(item.createdAt)}
                </Text>
              </View>
            </View>

            {/* Simple Reaction Emoji Badge */}
            <Animated.View
              entering={ZoomIn.springify().damping(12)}
              style={styles.reactionBadge}
            >
              <Image
                source={
                  mostRecentReaction === 'muscle'
                    ? require('../assets/reactions/muscle.png')
                    : mostRecentReaction === 'heart'
                      ? require('../assets/reactions/heart.png')
                      : require('../assets/reactions/like.png')
                }
                style={styles.reactionBadgeImage}
                resizeMode="contain"
                accessible={false}
              />
            </Animated.View>

            {/* Clear button */}
            <TouchableOpacity
              style={styles.clearButton}
              onPress={(e) => {
                e.stopPropagation();
                handleClearNotification(item.id!);
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle motivation received notifications
    if (item.type === 'motivation_received') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <TouchableOpacity
            onPress={() => handlePress(item)}
            activeOpacity={0.8}
            style={[
              styles.notificationCard,
              !item.read && styles.notificationCardUnread,
              { borderLeftWidth: 3, borderLeftColor: colors.pink },
            ]}
          >
            <View style={styles.reminderCardContent}>
              <View style={[styles.reminderIconContainer, { backgroundColor: colors.pinkLight }]}>
                <Avatar
                  uri={item.data?.senderProfileImageUrl}
                  name={item.data?.senderName}
                  size="sm"
                />
              </View>
              <View style={styles.reminderTextContent}>
                <View style={styles.reactionHeader}>
                  <Text style={styles.reminderTitle}>{item.title}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
                <Text style={styles.reactionDate}>{fmtDate(item.createdAt)}</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.6 }]}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </Pressable>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle session reminder notifications
    if (item.type === 'session_reminder') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <TouchableOpacity
            onPress={() => handlePress(item)}
            activeOpacity={0.8}
            style={[
              styles.notificationCard,
              !item.read && styles.notificationCardUnread,
              { borderLeftWidth: 3, borderLeftColor: colors.primary },
            ]}
          >
            <View style={styles.reminderCardContent}>
              <View style={[styles.reminderIconContainer, { backgroundColor: colors.primarySurface }]}>
                <Bell size={24} color={colors.primary} />
              </View>
              <View style={styles.reminderTextContent}>
                <View style={styles.reactionHeader}>
                  <Text style={styles.reminderTitle}>{item.title}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
                <Text style={styles.reactionDate}>{fmtDate(item.createdAt)}</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.6 }]}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </Pressable>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle weekly recap notifications
    if (item.type === 'weekly_recap') {
      const completed = item.data?.totalSessionsDone || item.data?.totalCompleted || 0;
      const required = item.data?.totalSessionsRequired || item.data?.totalRequired || 0;
      const progressPercent = required > 0 ? Math.min(100, Math.round((completed / required) * 100)) : 0;

      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <TouchableOpacity
            onPress={() => handlePress(item)}
            activeOpacity={0.8}
            style={[
              styles.notificationCard,
              !item.read && styles.notificationCardUnread,
              { borderLeftWidth: 3, borderLeftColor: colors.success },
            ]}
          >
            <View style={styles.reminderCardContent}>
              <View style={[styles.reminderIconContainer, { backgroundColor: colors.successLight }]}>
                <TrendingUp size={24} color={colors.secondary} />
              </View>
              <View style={styles.reminderTextContent}>
                <View style={styles.reactionHeader}>
                  <Text style={styles.reminderTitle}>{item.title || t('notifications.weeklyRecap.defaultTitle')}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
                {required > 0 && (
                  <View style={styles.recapProgressContainer}>
                    <View style={styles.recapProgressBar}>
                      <View style={[styles.recapProgressFill, { width: `${progressPercent}%` }]} />
                    </View>
                    <Text style={styles.recapProgressText}>{t('notifications.weeklyRecap.sessions', { completed, required })}</Text>
                  </View>
                )}
                <Text style={styles.reactionDate}>{fmtDate(item.createdAt)}</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.6 }]}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </Pressable>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle experience booking reminder notifications
    if (item.type === 'experience_booking_reminder') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <TouchableOpacity
            onPress={() => handlePress(item)}
            activeOpacity={0.8}
            style={[
              styles.notificationCard,
              !item.read && styles.notificationCardUnread,
              { borderLeftWidth: 3, borderLeftColor: colors.warning },
            ]}
          >
            <View style={styles.reminderCardContent}>
              <View style={[styles.reminderIconContainer, { backgroundColor: colors.warningLight }]}>
                <Gift size={24} color={colors.warning} />
              </View>
              <View style={styles.reminderTextContent}>
                <View style={styles.reactionHeader}>
                  <Text style={styles.reminderTitle}>{item.title}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
                <Text style={styles.reactionDate}>{fmtDate(item.createdAt)}</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.6 }]}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </Pressable>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle per-session partner notifications
    if (item.type === 'shared_session') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <TouchableOpacity
            onPress={() => handlePress(item)}
            activeOpacity={0.8}
            style={[
              styles.notificationCard,
              !item.read && styles.notificationCardUnread,
              { borderLeftWidth: 3, borderLeftColor: colors.primary },
            ]}
          >
            <View style={styles.reminderCardContent}>
              <View style={[styles.reminderIconContainer, { backgroundColor: colors.primarySurface }]}>
                <Activity size={24} color={colors.primary} />
              </View>
              <View style={styles.reminderTextContent}>
                <View style={styles.reactionHeader}>
                  <Text style={styles.reminderTitle}>{item.title || t('notifications.sharedSession.defaultTitle')}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.reminderMessage} numberOfLines={2}>{item.message || t('notifications.sharedSession.defaultMessage')}</Text>
                <Text style={styles.reactionDate}>{fmtDate(item.createdAt)}</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.6 }]}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </Pressable>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle shared/together challenge notifications
    if (item.type === 'shared_start' || item.type === 'shared_unlock' || item.type === 'shared_completion' || item.type === 'shared_partner_removed') {
      const accentColor = item.type === 'shared_unlock'
        ? colors.success
        : item.type === 'shared_partner_removed'
          ? colors.warning
          : colors.primary;
      const bgColor = item.type === 'shared_unlock'
        ? colors.successLight
        : item.type === 'shared_partner_removed'
          ? colors.warningLight
          : colors.primarySurface;
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <TouchableOpacity
            onPress={() => handlePress(item)}
            activeOpacity={0.8}
            style={[
              styles.notificationCard,
              !item.read && styles.notificationCardUnread,
              { borderLeftWidth: 3, borderLeftColor: accentColor },
            ]}
          >
            <View style={styles.reminderCardContent}>
              <View style={[styles.reminderIconContainer, { backgroundColor: bgColor }]}>
                <Users size={24} color={accentColor} />
              </View>
              <View style={styles.reminderTextContent}>
                <View style={styles.reactionHeader}>
                  <Text style={styles.reminderTitle}>{item.title}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
                <Text style={styles.reactionDate}>{fmtDate(item.createdAt)}</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.6 }]}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </Pressable>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle payment notifications
    if (item.type === 'payment_charged' || item.type === 'payment_failed' || item.type === 'payment_cancelled') {
      const isFailure = item.type === 'payment_failed';
      const isCancelled = item.type === 'payment_cancelled';
      const accentColor = isFailure ? colors.error : isCancelled ? colors.warning : colors.success;
      const bgColor = isFailure ? colors.errorLight : isCancelled ? colors.warningLight : colors.successLight;
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <TouchableOpacity
            onPress={() => handlePress(item)}
            activeOpacity={0.8}
            style={[
              styles.notificationCard,
              !item.read && styles.notificationCardUnread,
              { borderLeftWidth: 3, borderLeftColor: accentColor },
            ]}
          >
            <View style={styles.reminderCardContent}>
              <View style={[styles.reminderIconContainer, { backgroundColor: bgColor }]}>
                {isFailure || isCancelled
                  ? <AlertCircle size={24} color={accentColor} />
                  : <CreditCard size={24} color={accentColor} />}
              </View>
              <View style={styles.reminderTextContent}>
                <View style={styles.reactionHeader}>
                  <Text style={styles.reminderTitle}>{item.title}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
                <Text style={styles.reactionDate}>{fmtDate(item.createdAt)}</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.6 }]}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </Pressable>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle personalized hint left notification (for recipients)
    if (item.type === 'personalized_hint_left') {
      // Falls through to default rendering with clear button
    }

    if (item.type === 'gift_received') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <TouchableOpacity
            onPress={() => handlePress(item)}
            activeOpacity={0.8}
            style={[
              styles.notificationCard,
              !item.read && styles.notificationCardUnread,
              { borderLeftWidth: 3, borderLeftColor: colors.warning },
            ]}
          >
            <View style={styles.reminderCardContent}>
              <View style={[styles.reminderIconContainer, { backgroundColor: colors.warningLight }]}>
                <Gift size={24} color={colors.warning} />
              </View>
              <View style={styles.reminderTextContent}>
                <View style={styles.reactionHeader}>
                  <Text style={styles.reminderTitle}>{item.title}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
                <Text style={[styles.reminderMessage, { ...Typography.smallBold, color: colors.warning, marginTop: Spacing.xs }]}>
                  {t('notifications.giftReceived.setupGoal')}
                </Text>
                <Text style={styles.reactionDate}>{fmtDate(item.createdAt)}</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.6 }]}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </Pressable>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    if (item.type === 'goal_completed') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
          <TouchableOpacity
            onPress={() => handlePress(item)}
            activeOpacity={0.8}
            style={[
              styles.notificationCard,
              !item.read && styles.notificationCardUnread,
              { borderLeftWidth: 3, borderLeftColor: colors.success },
            ]}
          >
            <View style={styles.reminderCardContent}>
              <View style={[styles.reminderIconContainer, { backgroundColor: colors.successLight }]}>
                <Trophy size={24} color={colors.success} />
              </View>
              <View style={styles.reminderTextContent}>
                <View style={styles.reactionHeader}>
                  <Text style={styles.reminderTitle}>{item.title}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
                <Text style={styles.reactionDate}>{fmtDate(item.createdAt)}</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.6 }]}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </Pressable>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)} style={{ backgroundColor: colors.surface }}>
        <View style={[
          styles.notificationCard,
          !item.read && styles.notificationCardUnread,
          { borderLeftWidth: 3, borderLeftColor: colors.primary },
        ]}>
          <TouchableOpacity
            onPress={() => handlePress(item)}
            activeOpacity={0.8}
            style={styles.cardContent}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {!item.read && <View style={styles.unreadDot} />}
            </View>

            <Text style={styles.cardMessage} numberOfLines={3}>{item.message}</Text>

            <View style={styles.cardFooter}>
              <Text style={styles.cardDate}>{fmtDate(item.createdAt)}</Text>
              {item.type === 'personalized_hint_left' && !userGoals[item.data?.goalId || ''] && (
                <Text style={styles.hintText}>{t('notifications.hintLeft.tapToView')}</Text>
              )}
            </View>
          </TouchableOpacity>

          {item.clearable !== false && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => handleClearNotification(item.id!)}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    );
  }, [handleFriendRequestHandled, handleApprovalActionTaken, handlePress, handleClearNotification, latestGoalProgressMap, latestFreeGoalMilestoneMap, userGoals]);

  return (
    <ErrorBoundary screenName="NotificationsScreen" userId={userId}>
      <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
        <StatusBar style="light" />
        <SharedHeader
          title={t('notifications.screenTitle')}
          showBack={true}
          rightActions={
            notifications.length > 0 ? (
              <View style={styles.headerActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  title={t('notifications.header.markRead')}
                  onPress={async () => {
                    if (!userId) return;
                    try {
                      await notificationService.markAllAsRead(userId);
                    } catch (error: unknown) {
                      logger.error('Error marking all as read:', error);
                      showError(t('notifications.toast.failedMarkRead'));
                    }
                  }}
                />
                <TouchableOpacity
                  onPress={handleClearAll}
                  accessibilityRole="button"
                  accessibilityLabel={t('notifications.header.clearAll')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ padding: Spacing.xs }}
                >
                  <Trash2 size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            ) : null
          }
        />

        <View accessibilityLiveRegion="polite" style={{ flex: 1 }}>
        {loading ? (
          <ScrollView contentContainerStyle={[styles.listContainer, { paddingBottom: Spacing.xl + FOOTER_HEIGHT + insets.bottom }]}>
            <NotificationSkeleton />
            <NotificationSkeleton />
            <NotificationSkeleton />
            <NotificationSkeleton />
          </ScrollView>
        ) : error ? (
          <ErrorRetry
            message={t('notifications.error.couldNotLoad')}
            onRetry={() => {
              setError(false);
              setLoading(true);
              setRefreshKey(prev => prev + 1);
            }}
          />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon="🔔"
            title={t('notifications.empty.title')}
            message={t('notifications.empty.message')}
          />
        ) : (
          <FlatList
            data={notifications.slice(0, displayCount)}
            renderItem={renderItem}
            keyExtractor={(item, index) => item.id || index.toString()}
            contentContainerStyle={[styles.listContainer, { paddingBottom: Spacing.xl + FOOTER_HEIGHT + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS !== 'web'}
            initialNumToRender={8}
            maxToRenderPerBatch={10}
            windowSize={5}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              displayCount < notifications.length ? (
                <View>
                  <NotificationSkeleton />
                  <NotificationSkeleton />
                </View>
              ) : null
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[colors.secondary]}
                tintColor={colors.secondary}
              />
            }
          />
        )}
        </View>
      <ConfirmationDialog
        visible={showClearAllConfirm}
        title={t('notifications.dialog.clearAllTitle')}
        message={t('notifications.dialog.clearAllMessage')}
        confirmLabel={t('notifications.dialog.clearAllConfirm')}
        onConfirm={confirmClearAll}
        onCancel={() => setShowClearAllConfirm(false)}
        variant="danger"
      />
      <ConfirmationDialog
        visible={clearNotificationId !== null}
        title={t('notifications.dialog.clearOneTitle')}
        message={t('notifications.dialog.clearOneMessage')}
        confirmLabel={t('notifications.dialog.clearOneConfirm')}
        onConfirm={confirmClearNotification}
        onCancel={() => setClearNotificationId(null)}
        variant="danger"
      />
      <RootFooterTabBar />
      </View>
    </ErrorBoundary>
  );
};


const createStyles = (colors: typeof Colors) => StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  markAllReadButton: {
    backgroundColor: colors.successLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: colors.success,
  },
  markAllReadButtonText: {
    color: colors.successText,
    ...Typography.smallBold,
  },
  clearAllButton: {
    backgroundColor: colors.primarySurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  clearAllButtonText: {
    color: colors.primary,
    ...Typography.smallBold,
  },
  listContainer: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xl + FOOTER_HEIGHT,
  },
  // Unified card base — all notification types
  notificationCard: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  notificationCardUnread: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySurface,
  },
  // Default card inner layout (default / personalized_hint_left types)
  cardContent: {
    flex: 1,
    padding: Spacing.lg,
    paddingRight: Spacing.xxl + Spacing.lg, // reserve space for clear button
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  cardTitle: {
    ...Typography.subheading,
    color: colors.textPrimary,
    flex: 1,
  },
  cardMessage: {
    color: colors.gray600,
    ...Typography.small,
    marginBottom: Spacing.xs,
    lineHeight: 20,
  },
  cardDate: {
    color: colors.textMuted,
    ...Typography.caption,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hintText: {
    color: colors.secondary,
    ...Typography.tiny,
    fontStyle: 'italic',
  },
  // Unified clear button
  clearButton: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 28,
    height: 28,
    borderRadius: BorderRadius.circle,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Unified unread dot (8px)
  unreadDot: {
    width: 8,
    height: 8,
    backgroundColor: colors.secondary,
    borderRadius: BorderRadius.circle,
    marginTop: Spacing.xs,
  },
  // Reaction card content layout
  reactionCardContent: {
    flexDirection: 'row',
    padding: Spacing.lg,
    paddingRight: Spacing.xxl + Spacing.lg, // reserve space for clear button
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  reactionContent: {
    flex: 1,
    gap: Spacing.sm,
  },
  reactionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  reactionMessage: {
    ...Typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 20,
    flex: 1,
  },
  reactionDate: {
    ...Typography.caption,
    color: colors.textMuted,
    marginBottom: Spacing.xs,
  },
  reactionBadge: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionBadgeImage: {
    width: 42,
    height: 42,
  },
  // Reminder / Recap card content layout
  reminderCardContent: {
    flexDirection: 'row' as const,
    padding: Spacing.lg,
    paddingRight: Spacing.xxl + Spacing.lg, // reserve space for clear button
    gap: Spacing.md,
    alignItems: 'flex-start' as const,
  },
  reminderIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.xxl,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
  },
  reminderTextContent: {
    flex: 1,
    gap: Spacing.xs,
  },
  reminderTitle: {
    ...Typography.body,
    fontWeight: '600' as const,
    color: colors.textPrimary,
    flex: 1,
  },
  reminderMessage: {
    ...Typography.small,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  recapProgressContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  recapProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: BorderRadius.xs,
    overflow: 'hidden' as const,
  },
  recapProgressFill: {
    height: '100%' as const,
    backgroundColor: colors.secondary,
    borderRadius: BorderRadius.xs,
  },
  recapProgressText: {
    ...Typography.caption,
    fontWeight: '600' as const,
    color: colors.textSecondary,
  },
});


export default NotificationsScreen;