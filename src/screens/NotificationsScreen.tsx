import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  Platform,
  Linking,
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
import MainScreen from './MainScreen';
import FriendRequestNotification from '../components/FriendRequestNotification';
import GoalApprovalNotification from '../components/GoalApprovalNotification';
import GoalChangeSuggestionNotification from '../components/GoalChangeSuggestionNotification';
import { GoalProgressNotification } from '../components/GoalProgressNotification';
import FreeGoalNotification from '../components/FreeGoalNotification';
import { NotificationSkeleton } from '../components/SkeletonLoader';
import SharedHeader from '../components/SharedHeader';
import Animated, { ZoomIn, FadeInDown } from 'react-native-reanimated';
import { logger } from '../utils/logger';
import { analyticsService } from '../services/AnalyticsService';
import { Bell, TrendingUp, Heart, Gift, X, Users, CreditCard, AlertCircle, Activity, CheckCircle, Trophy } from 'lucide-react-native';
import { Colors, useColors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import { ErrorBoundary } from '../components/ErrorBoundary';
import ErrorRetry from '../components/ErrorRetry';
import * as Haptics from 'expo-haptics';
import { EmptyState } from '../components/EmptyState';
import Button from '../components/Button';
import { FOOTER_HEIGHT } from '../components/FooterNavigation';


type NotificationNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Notification'
>;

// Format notification date (shared utility)
const formatNotificationDate = (createdAt: Date | { toDate(): Date } | number | string | null | undefined) => {
  if (!createdAt) return '';

  // Handle Firestore Timestamp or Date
  const date =
    createdAt && typeof createdAt.toDate === 'function'
      ? createdAt.toDate()
      : new Date(createdAt);

  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes <= 1 ? '1m ago' : `${diffMinutes}m ago`;
    }
    return diffHours <= 1 ? '1h ago' : `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return diffDays === 1 ? '1d ago' : `${diffDays}d ago`;
  } else {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
};

const NotificationsScreen = () => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
          showInfo('Notifications are up to date');
        }
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

  const handleRefresh = () => {
    setRefreshing(true);
    isRefreshingRef.current = true;
    setRefreshKey(prev => prev + 1); // Force listener re-subscribe
  };

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  const handlePress = async (n: Notification) => {
    if (!userId) return;
    if (tappingRef.current) return;
    tappingRef.current = true;
    try {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    analyticsService.trackEvent('notification_tapped', 'engagement', { type: n.type }, 'NotificationsScreen');
    await notificationService.markAsRead(n.id!);

    if (n.type === 'gift_received') {
      try {
        const gift = await experienceGiftService.getExperienceGiftById(n.data.giftId);
        if (gift && gift.experienceId) {
          navigation.navigate('GoalSetting', { experienceGift: gift });
        }
      } catch (error) {
        logger.error('Error fetching experience gift:', error);
      }
    }

    if (n.type === 'personalized_hint_left' && n.data?.goalId) {
      // Check if goal is completed using our local state
      if (userGoals[n.data.goalId]) {
        // Goal is completed, do not navigate
        return;
      }

      try {
        const goal = await goalService.getGoalById(n.data.goalId);
        if (goal) {
          navigation.navigate('Journey', { goal });
        }
      } catch (error) {
        logger.error('Error fetching goal:', error);
      }
    }

    if (n.type === 'post_reaction' && n.data?.postId) {
      navigation.navigate('Feed', { highlightPostId: n.data.postId });
    }

    if ((n.type === 'session_reminder' || n.type === 'weekly_recap') && n.data?.goalId) {
      try {
        const goal = await goalService.getGoalById(n.data.goalId);
        if (goal) {
          navigation.navigate('Journey', { goal });
        }
      } catch (error) {
        logger.error('Error navigating from reminder notification:', error);
      }
    }

    if (n.type === 'motivation_received' && n.data?.goalId) {
      try {
        const goal = await goalService.getGoalById(n.data.goalId);
        if (goal) {
          navigation.navigate('Journey', { goal });
        }
      } catch (error) {
        logger.error('Error navigating from motivation notification:', error);
      }
    }

    if (n.type === 'experience_empowered' && n.data?.goalId && n.data?.giftId) {
      try {
        // Check if gift is already attached before attempting
        const existingGoal = await goalService.getGoalById(n.data.goalId);
        if (!existingGoal?.giftAttachedAt) {
          await goalService.attachGiftToGoal(n.data.goalId, n.data.giftId, userId!, n.data.isMystery === true);
        }
        const goal = existingGoal?.giftAttachedAt ? existingGoal : await goalService.getGoalById(n.data.goalId);
        if (n.data.isMystery) {
          showSuccess(`${n.data.giverName || 'A friend'} gifted you a mystery experience! Complete your challenge to reveal it.`);
        } else {
          showSuccess(`${n.data.giverName || 'A friend'} gifted you an experience!`);
        }
        if (goal) {
          navigation.navigate('Journey', { goal });
        }
      } catch (error) {
        logger.error('Error attaching empowered gift:', error);
        showError('Could not attach the gift. Please try again.');
      }
    }

    if (n.type === 'experience_booking_reminder' && n.data?.goalId) {
      try {
        const goal = await goalService.getGoalById(n.data.goalId);
        if (goal) {
          if (goal.experienceGiftId) {
            const gift = await experienceGiftService.getExperienceGiftById(goal.experienceGiftId);
            if (gift) {
              navigation.navigate('Completion', { goal, experienceGift: gift });
              return;
            }
          }
          navigation.navigate('Journey', { goal });
        }
      } catch (error) {
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
        navigation.navigate('GoalDetail', { goalId: n.data.goalId });
      }
    }

    if (n.type === 'payment_charged') {
      if (n.data?.goalId) {
        navigation.navigate('GoalDetail', { goalId: n.data.goalId });
      }
    }

    if (n.type === 'payment_failed') {
      if (n.data?.recoveryUrl) {
        Linking.openURL(n.data.recoveryUrl);
      } else {
        navigation.navigate('PurchasedGifts');
      }
    }

    if (n.type === 'goal_approval_response' && n.data?.goalId) {
      navigation.navigate('GoalDetail', { goalId: n.data.goalId });
    }

    if (n.type === 'goal_set' && n.data?.goalId) {
      navigation.navigate('GoalDetail', { goalId: n.data.goalId });
    }

    if (n.type === 'goal_completed' && n.data?.goalId) {
      navigation.navigate('Journey' as any, { goalId: n.data.goalId });
      return;
    }

    if ((n.type === 'valentine_partner_progress' || n.type === 'valentine_start' || n.type === 'valentine_unlock' || n.type === 'valentine_completion') && n.data?.goalId) {
      navigation.navigate('GoalDetail', { goalId: n.data.goalId });
    }
    } finally {
      setTimeout(() => { tappingRef.current = false; }, 500);
    }
  };


  const handleFriendRequestHandled = useCallback(() => {
    // No-op: the real-time onSnapshot listener in useEffect handles updates automatically
  }, []);


  const handleClearAll = () => {
    setShowClearAllConfirm(true);
  };

  const confirmClearAll = async () => {
    setShowClearAllConfirm(false);
    if (!userId) {
      showError('User not authenticated');
      return;
    }

    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await notificationService.clearAllNotifications(userId);
      showSuccess('All notifications have been cleared.');
    } catch (error) {
      logger.error('Error clearing all notifications:', error);
      showError('Failed to clear notifications. Please try again.');
    }
  };


  const handleClearNotification = (notificationId: string) => {
    if (!notificationId) {
      showError('Cannot clear notification: missing ID');
      return;
    }

    setClearNotificationId(notificationId);
  };

  const confirmClearNotification = async () => {
    const notificationId = clearNotificationId;
    if (!notificationId) return;
    setClearNotificationId(null);

    try {
      await notificationService.deleteNotification(notificationId);
      // No toast needed - the notification just disappears
    } catch (error) {
      logger.error('Error clearing notification:', error);
      showError('Failed to clear notification. Please try again.');
    }
  };


  const handleApprovalActionTaken = useCallback(() => {
    // No-op: the real-time onSnapshot listener in useEffect handles updates automatically
  }, []);

  const renderItem = useCallback(({ item, index }: { item: Notification; index: number }) => {
    // Handle friend request notifications specially
    if (item.type === 'friend_request') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
          <GoalChangeSuggestionNotification
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
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
          <FreeGoalNotification
            notification={item}
            isLatest={isMilestoneLatest}
            onActionComplete={handleFriendRequestHandled}
          />
        </Animated.View>
      );
    }

    // Handle goal approval response notifications (approved/rejected)
    if (item.type === 'goal_approval_response') {
      const isApproved = item.data?.approved !== false;
      const accentColor = isApproved ? colors.success : colors.error;
      const bgColor = isApproved ? colors.successLight : colors.errorLight;
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
                <Text style={styles.reactionDate}>{formatNotificationDate(item.createdAt)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle post reaction notifications with enhanced design
    if (item.type === 'post_reaction') {
      const mostRecentReaction = (item.data?.mostRecentReaction as 'muscle' | 'heart' | 'like') || 'like';

      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
                  {formatNotificationDate(item.createdAt)}
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
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
                <Text style={styles.reactionDate}>{formatNotificationDate(item.createdAt)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle session reminder notifications
    if (item.type === 'session_reminder') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
                <Text style={styles.reactionDate}>{formatNotificationDate(item.createdAt)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
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
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
                  <Text style={styles.reminderTitle}>{item.title || 'Weekly Recap'}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
                {required > 0 && (
                  <View style={styles.recapProgressContainer}>
                    <View style={styles.recapProgressBar}>
                      <View style={[styles.recapProgressFill, { width: `${progressPercent}%` }]} />
                    </View>
                    <Text style={styles.recapProgressText}>{completed}/{required} sessions</Text>
                  </View>
                )}
                <Text style={styles.reactionDate}>{formatNotificationDate(item.createdAt)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle experience booking reminder notifications
    if (item.type === 'experience_booking_reminder') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
                <Text style={styles.reactionDate}>{formatNotificationDate(item.createdAt)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle per-session partner notifications
    if (item.type === 'shared_session') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
                  <Text style={styles.reminderTitle}>{item.title || 'Partner Activity'}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.reminderMessage} numberOfLines={2}>{item.message || 'Your partner logged a session!'}</Text>
                <Text style={styles.reactionDate}>{formatNotificationDate(item.createdAt)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle shared/together challenge notifications
    if (item.type === 'shared_start' || item.type === 'shared_unlock' || item.type === 'shared_completion') {
      const accentColor = item.type === 'shared_unlock' ? colors.success : colors.primary;
      const bgColor = item.type === 'shared_unlock' ? colors.successLight : colors.primarySurface;
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
                <Text style={styles.reactionDate}>{formatNotificationDate(item.createdAt)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Handle payment notifications
    if (item.type === 'payment_charged' || item.type === 'payment_failed') {
      const isFailure = item.type === 'payment_failed';
      const accentColor = isFailure ? colors.error : colors.success;
      const bgColor = isFailure ? colors.errorLight : colors.successLight;
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
                {isFailure
                  ? <AlertCircle size={24} color={accentColor} />
                  : <CreditCard size={24} color={accentColor} />}
              </View>
              <View style={styles.reminderTextContent}>
                <View style={styles.reactionHeader}>
                  <Text style={styles.reminderTitle}>{item.title}</Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
                <Text style={styles.reactionDate}>{formatNotificationDate(item.createdAt)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
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
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
                <Text style={[styles.reminderMessage, { color: colors.warning, fontWeight: '600', marginTop: 4 }]}>
                  Set up your goal →
                </Text>
                <Text style={styles.reactionDate}>{formatNotificationDate(item.createdAt)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    if (item.type === 'goal_completed') {
      return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
                <Text style={styles.reactionDate}>{formatNotificationDate(item.createdAt)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
              accessibilityRole="button"
              accessibilityLabel="Clear this notification"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={FadeInDown.delay(index * 40).duration(300).springify().damping(20)}>
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
              <Text style={styles.cardDate}>{formatNotificationDate(item.createdAt)}</Text>
              {item.type === 'personalized_hint_left' && !userGoals[item.data?.goalId || ''] && (
                <Text style={styles.hintText}>Tap to view goal</Text>
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
      <MainScreen activeRoute="Profile">
        <StatusBar style="light" />
        <SharedHeader
          title="Notifications"
          showBack={true}
          rightActions={
            notifications.length > 0 ? (
              <View style={styles.headerActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Mark Read"
                  onPress={async () => {
                    if (!userId) return;
                    try {
                      await notificationService.markAllAsRead(userId);
                    } catch (error) {
                      logger.error('Error marking all as read:', error);
                      showError('Failed to mark all as read.');
                    }
                  }}
                />
                <Button
                  variant="danger"
                  size="sm"
                  title="Clear All"
                  onPress={handleClearAll}
                />
              </View>
            ) : null
          }
        />

        <View accessibilityLiveRegion="polite">
        {loading ? (
          <ScrollView contentContainerStyle={styles.listContainer}>
            <NotificationSkeleton />
            <NotificationSkeleton />
            <NotificationSkeleton />
            <NotificationSkeleton />
          </ScrollView>
        ) : error ? (
          <ErrorRetry
            message="Could not load notifications"
            onRetry={() => {
              setError(false);
              setLoading(true);
              setRefreshKey(prev => prev + 1);
            }}
          />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon="🔔"
            title="No Notifications"
            message="You'll see updates here when friends interact with your goals"
          />
        ) : (
          <FlatList
            data={notifications.slice(0, displayCount)}
            renderItem={renderItem}
            keyExtractor={(item, index) => item.id || index.toString()}
            contentContainerStyle={styles.listContainer}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS !== 'web'}
            maxToRenderPerBatch={10}
            windowSize={5}
            onEndReached={() => setDisplayCount(prev => Math.min(prev + 20, notifications.length))}
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
      </MainScreen>
      <ConfirmationDialog
        visible={showClearAllConfirm}
        title="Clear All Notifications"
        message="Are you sure you want to clear all notifications? This cannot be undone."
        confirmLabel="Clear All"
        onConfirm={confirmClearAll}
        onCancel={() => setShowClearAllConfirm(false)}
        variant="danger"
      />
      <ConfirmationDialog
        visible={clearNotificationId !== null}
        title="Clear Notification"
        message="Remove this notification?"
        confirmLabel="Clear"
        onConfirm={confirmClearNotification}
        onCancel={() => setClearNotificationId(null)}
        variant="danger"
      />
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
    color: colors.success,
    ...Typography.small,
    fontWeight: '600',
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
    ...Typography.small,
    fontWeight: '600',
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
    backgroundColor: colors.backgroundLight,
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