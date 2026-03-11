import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
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
import Animated, { ZoomIn } from 'react-native-reanimated';
import { logger } from '../utils/logger';
import { analyticsService } from '../services/AnalyticsService';
import { Bell, Calendar, TrendingUp, Heart, Gift } from 'lucide-react-native';
import Colors from '../config/colors';
import { ErrorBoundary } from '../components/ErrorBoundary';


type NotificationNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Notification'
>;

// Format notification date (shared utility)
const formatNotificationDate = (createdAt: any) => {
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
  const { state } = useApp();
  const { showSuccess, showError, showInfo } = useToast();
  const userId = state.user?.id;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userGoals, setUserGoals] = useState<Record<string, boolean>>({}); // Map goalId -> isCompleted
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<NotificationNavigationProp>();

  // Pre-compute latest goal_progress notification per goal (avoids O(n²) in renderItem)
  const latestGoalProgressMap = useMemo(() => {
    const map: Record<string, string> = {}; // goalId -> notificationId of latest
    for (const n of notifications) {
      if (n.type !== 'goal_progress' || !n.data?.goalId) continue;
      const goalId = n.data.goalId;
      if (!map[goalId]) {
        map[goalId] = n.id!;
      } else {
        // Compare session numbers - keep the highest
        const existing = notifications.find(x => x.id === map[goalId]);
        if ((n.data?.sessionNumber || 0) > (existing?.data?.sessionNumber || 0)) {
          map[goalId] = n.id!;
        }
      }
    }
    return map;
  }, [notifications]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);

    let isCancelled = false;
    let unsubscribeNotifs: (() => void) | undefined;
    let unsubscribeGoals: (() => void) | undefined;

    const subscribe = async () => {
      // T3-4: Guard against stale callbacks if userId changed
      unsubscribeNotifs = await notificationService.listenToUserNotifications(userId, (notifications) => {
        if (isCancelled) return;
        setNotifications(notifications);
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
      setLoading(false);
    });

    return () => {
      isCancelled = true;
      if (unsubscribeNotifs) unsubscribeNotifs();
      if (unsubscribeGoals) unsubscribeGoals();
    };
  }, [userId]);




  const handlePress = async (n: Notification) => {
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
  };


  const handleFriendRequestHandled = () => {
    // No-op: the real-time onSnapshot listener in useEffect handles updates automatically
  };


  const handleClearAll = async () => {
    if (!userId) {
      showError('User not authenticated');
      return;
    }

    try {
      await notificationService.clearAllNotifications(userId);
      showSuccess('All notifications have been cleared.');
    } catch (error) {
      logger.error('Error clearing all notifications:', error);
      showError('Failed to clear notifications. Please try again.');
    }
  };


  const handleClearNotification = async (notificationId: string) => {
    if (!notificationId) {
      showError('Cannot clear notification: missing ID');
      return;
    }

    try {
      await notificationService.deleteNotification(notificationId);
      // No toast needed - the notification just disappears
    } catch (error) {
      logger.error('Error clearing notification:', error);
      showError('Failed to clear notification. Please try again.');
    }
  };


  const handleApprovalActionTaken = () => {
    // No-op: the real-time onSnapshot listener in useEffect handles updates automatically
  };

  const renderItem = ({ item }: { item: Notification }) => {
    // Handle friend request notifications specially
    if (item.type === 'friend_request') {
      return (
        <FriendRequestNotification
          notification={item}
          onRequestHandled={handleFriendRequestHandled}
        />
      );
    }

    // Handle goal approval request notifications
    if (item.type === 'goal_approval_request') {
      return (
        <GoalApprovalNotification
          notification={item}
          onActionTaken={handleApprovalActionTaken}
        />
      );
    }

    // Handle goal change suggestion notifications
    if (item.type === 'goal_change_suggested') {
      return (
        <GoalChangeSuggestionNotification
          notification={item}
          onActionTaken={handleApprovalActionTaken}
        />
      );
    }

    // Handle goal progress notifications (for givers to leave hints)
    if (item.type === 'goal_progress') {
      const isLatest = item.data?.goalId
        ? latestGoalProgressMap[item.data.goalId] === item.id
        : true;

      return <GoalProgressNotification notification={item} isLatest={isLatest} />;
    }

    // Handle free goal milestone/completion notifications with Empower + Motivate buttons
    if (item.type === 'free_goal_milestone' || item.type === 'free_goal_completed') {
      return (
        <FreeGoalNotification
          notification={item}
          onActionComplete={handleFriendRequestHandled}
        />
      );
    }

    // Handle post reaction notifications with enhanced design
    if (item.type === 'post_reaction') {
      const mostRecentReaction = (item.data?.mostRecentReaction as 'muscle' | 'heart' | 'like') || 'like';

      return (
        <TouchableOpacity
          onPress={() => handlePress(item)}
          activeOpacity={0.8}
          style={[
            styles.reactionCard,
            !item.read && styles.reactionCardUnread
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${item.message}. Tap to view post`}
        >
          <View style={styles.reactionCardContent}>
            {/* Profile Image or Placeholder */}
            <View style={styles.reactionEmojiContainer}>
              {item.data?.reactorProfileImageUrl ? (
                <Image
                  source={{ uri: item.data.reactorProfileImageUrl }}
                  style={styles.reactorProfileImage}
                  accessibilityLabel={`${item.data?.reactorNames?.[0] || 'User'}'s profile picture`}
                />
              ) : (
                <View style={styles.placeholderAvatar}>
                  <Text style={styles.placeholderText}>
                    {item.data?.reactorNames?.[0]?.[0]?.toUpperCase() || 'U'}
                  </Text>
                </View>
              )}
            </View>

            {/* Content */}
            <View style={styles.reactionContent}>
              <View style={styles.reactionHeader}>
                <Text style={styles.reactionMessage} numberOfLines={2}>
                  {item.message}
                </Text>
                {!item.read && <View style={styles.reactionUnreadDot} />}
              </View>

              <Text style={styles.reactionDate}>
                {formatNotificationDate(item.createdAt)}
              </Text>

              <Text style={styles.reactionCta}>
                Tap to view →
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
            />
          </Animated.View>

          {/* Clear button */}
          <TouchableOpacity
            style={styles.reactionClearButton}
            onPress={(e) => {
              e.stopPropagation();
              handleClearNotification(item.id!);
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear this notification"
          >
            <Text style={styles.reactionClearText}>×</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    // Handle motivation received notifications
    if (item.type === 'motivation_received') {
      return (
        <TouchableOpacity
          onPress={() => handlePress(item)}
          activeOpacity={0.8}
          style={[styles.reminderCard, !item.read && styles.reminderCardUnread]}
        >
          <View style={styles.reminderCardContent}>
            <View style={[styles.reminderIconContainer, { backgroundColor: '#fdf2f8' }]}>
              {item.data?.senderProfileImageUrl ? (
                <Image
                  source={{ uri: item.data.senderProfileImageUrl }}
                  style={styles.reminderIconImage}
                />
              ) : (
                <Heart size={24} color="#ec4899" />
              )}
            </View>
            <View style={styles.reminderTextContent}>
              <View style={styles.reactionHeader}>
                <Text style={styles.reminderTitle}>{item.title}</Text>
                {!item.read && <View style={styles.reactionUnreadDot} />}
              </View>
              <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
              <Text style={styles.reactionDate}>{formatNotificationDate(item.createdAt)}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.reactionClearButton}
            onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
          >
            <Text style={styles.reactionClearText}>×</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    // Handle session reminder notifications
    if (item.type === 'session_reminder') {
      return (
        <TouchableOpacity
          onPress={() => handlePress(item)}
          activeOpacity={0.8}
          style={[styles.reminderCard, !item.read && styles.reminderCardUnread]}
        >
          <View style={styles.reminderCardContent}>
            <View style={[styles.reminderIconContainer, { backgroundColor: Colors.primarySurface }]}>
              <Bell size={24} color={Colors.primary} />
            </View>
            <View style={styles.reminderTextContent}>
              <View style={styles.reactionHeader}>
                <Text style={styles.reminderTitle}>{item.title}</Text>
                {!item.read && <View style={styles.reactionUnreadDot} />}
              </View>
              <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
              <Text style={styles.reactionDate}>{formatNotificationDate(item.createdAt)}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.reactionClearButton}
            onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
          >
            <Text style={styles.reactionClearText}>×</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    // Handle weekly recap notifications
    if (item.type === 'weekly_recap') {
      const completed = item.data?.totalCompleted || 0;
      const required = item.data?.totalRequired || 0;
      const progressPercent = required > 0 ? Math.min(100, Math.round((completed / required) * 100)) : 0;

      return (
        <TouchableOpacity
          onPress={() => handlePress(item)}
          activeOpacity={0.8}
          style={[styles.reminderCard, !item.read && styles.reminderCardUnread]}
        >
          <View style={styles.reminderCardContent}>
            <View style={[styles.reminderIconContainer, { backgroundColor: '#f0fdf4' }]}>
              <TrendingUp size={24} color={Colors.secondary} />
            </View>
            <View style={styles.reminderTextContent}>
              <View style={styles.reactionHeader}>
                <Text style={styles.reminderTitle}>{item.title || 'Weekly Recap'}</Text>
                {!item.read && <View style={styles.reactionUnreadDot} />}
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
            style={styles.reactionClearButton}
            onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
          >
            <Text style={styles.reactionClearText}>×</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    // Handle experience booking reminder notifications
    if (item.type === 'experience_booking_reminder') {
      return (
        <TouchableOpacity
          onPress={() => handlePress(item)}
          activeOpacity={0.8}
          style={[styles.reminderCard, !item.read && styles.reminderCardUnread]}
        >
          <View style={styles.reminderCardContent}>
            <View style={[styles.reminderIconContainer, { backgroundColor: '#fef3c7' }]}>
              <Gift size={24} color="#f59e0b" />
            </View>
            <View style={styles.reminderTextContent}>
              <View style={styles.reactionHeader}>
                <Text style={styles.reminderTitle}>{item.title}</Text>
                {!item.read && <View style={styles.reactionUnreadDot} />}
              </View>
              <Text style={styles.reminderMessage} numberOfLines={2}>{item.message}</Text>
              <Text style={styles.reactionDate}>{formatNotificationDate(item.createdAt)}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.reactionClearButton}
            onPress={(e) => { e.stopPropagation(); handleClearNotification(item.id!); }}
          >
            <Text style={styles.reactionClearText}>×</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    // Handle personalized hint left notification (for recipients)
    if (item.type === 'personalized_hint_left') {
      // Falls through to default rendering with clear button
    }

    return (
      <View style={[styles.card, !item.read && styles.unreadCard]}>
        <TouchableOpacity
          onPress={() => handlePress(item)}
          activeOpacity={0.8}
          style={styles.cardContent}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {!item.read && <View style={styles.unreadDot} />}
          </View>


          <Text style={styles.cardMessage}>{item.message}</Text>


          <View style={styles.cardFooter}>
            <Text style={styles.cardDate}>{formatNotificationDate(item.createdAt)}</Text>
            {item.type === 'personalized_hint_left' && !userGoals[item.data?.goalId || ''] && (
              <Text style={styles.hintText}>Tap to view goal</Text>
            )}
          </View>
        </TouchableOpacity>


        {item.clearable !== false && (
          <TouchableOpacity
            style={styles.clearNotificationButton}
            onPress={() => handleClearNotification(item.id!)}
            accessibilityRole="button"
            accessibilityLabel="Clear this notification"
          >
            <Text style={styles.clearNotificationText}>×</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <ErrorBoundary screenName="NotificationsScreen" userId={userId}>
      <MainScreen activeRoute="Goals">
        <StatusBar style="light" />
        <SharedHeader
          title="Notifications"
          showBack={true}
          rightActions={
            notifications.length > 0 ? (
              <TouchableOpacity
                style={styles.clearAllButton}
                onPress={handleClearAll}
                accessibilityRole="button"
                accessibilityLabel="Clear all notifications"
              >
                <Text style={styles.clearAllButtonText}>Clear All</Text>
              </TouchableOpacity>
            ) : null
          }
        />

        {loading ? (
          <ScrollView contentContainerStyle={styles.listContainer}>
            <NotificationSkeleton />
            <NotificationSkeleton />
            <NotificationSkeleton />
            <NotificationSkeleton />
          </ScrollView>
        ) : notifications.length === 0 ? (
          <Text style={styles.emptyText}>No notifications yet.</Text>
        ) : (
          <FlatList
            data={notifications}
            renderItem={renderItem}
            keyExtractor={(item, index) => item.id || index.toString()}
            contentContainerStyle={styles.listContainer}
          />
        )}
      </MainScreen>
    </ErrorBoundary>
  );
};


const styles = StyleSheet.create({
  clearAllButton: {
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  clearAllButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  listContainer: {
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  unreadCard: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.primarySurface,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
  unreadDot: {
    width: 10,
    height: 10,
    backgroundColor: Colors.secondary,
    borderRadius: 5,
  },
  cardMessage: {
    color: '#4b5563',
    fontSize: 14,
    marginBottom: 6,
    lineHeight: 20,
  },
  cardDate: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hintText: {
    color: Colors.secondary,
    fontSize: 11,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  clearNotificationButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 8,
  },
  clearNotificationText: {
    color: Colors.textMuted,
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textSecondary,
    marginTop: 50,
    fontSize: 16,
  },
  // Enhanced reaction notification styles
  reactionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: 'hidden',
  },
  reactionCardUnread: {
    shadowColor: Colors.secondary,
    shadowOpacity: 0.15,
    elevation: 4,
  },
  reactionCardContent: {
    flexDirection: 'row',
    padding: 16,
    gap: 14,
    alignItems: 'flex-start',
  },
  reactionEmojiContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  reactionEmoji: {
    fontSize: 28,
  },
  reactorProfileImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  placeholderAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.accentDark,
  },
  reactionContent: {
    flex: 1,
    gap: 8,
  },
  reactionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  reactionMessage: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 20,
    flex: 1,
  },
  reactionUnreadDot: {
    width: 8,
    height: 8,
    backgroundColor: Colors.secondary,
    borderRadius: 4,
    marginTop: 6,
  },
  reactionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reactionDate: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  reactionCta: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.secondary,
  },
  reactionBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionBadgeImage: {
    width: 42,
    height: 42,
  },
  reactionClearButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionClearText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  // Reminder / Recap notification styles
  reminderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: 'hidden',
  },
  reminderCardUnread: {
    shadowColor: Colors.secondary,
    shadowOpacity: 0.15,
    elevation: 4,
  },
  reminderCardContent: {
    flexDirection: 'row' as const,
    padding: 16,
    gap: 14,
    alignItems: 'flex-start' as const,
  },
  reminderIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
  },
  reminderIconImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  reminderTextContent: {
    flex: 1,
    gap: 4,
  },
  reminderTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
    flex: 1,
  },
  reminderMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  recapProgressContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 4,
  },
  recapProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  recapProgressFill: {
    height: '100%' as const,
    backgroundColor: Colors.secondary,
    borderRadius: 3,
  },
  recapProgressText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
});


export default NotificationsScreen;