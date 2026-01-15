import React, { useEffect, useState } from 'react';
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
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { notificationService } from '../services/NotificationService';
import { experienceGiftService } from '../services/ExperienceGiftService';
import { goalService } from '../services/GoalService';
import { useApp } from '../context/AppContext';
import { RootStackParamList, Notification } from '../types';
import MainScreen from './MainScreen';
import FriendRequestNotification from '../components/FriendRequestNotification';
import GoalApprovalNotification from '../components/GoalApprovalNotification';
import GoalChangeSuggestionNotification from '../components/GoalChangeSuggestionNotification';
import { GoalProgressNotification } from '../components/GoalProgressNotification';
import { NotificationSkeleton } from '../components/SkeletonLoader';
import SharedHeader from '../components/SharedHeader';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { logger } from '../utils/logger';


type NotificationNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Notification'
>;


const NotificationsScreen = () => {
  const { state } = useApp();
  const userId = state.user?.id;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userGoals, setUserGoals] = useState<Record<string, boolean>>({}); // Map goalId -> isCompleted
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<NotificationNavigationProp>();


  useEffect(() => {
    if (!userId) return;
    setLoading(true);


    let unsubscribeNotifs: (() => void) | undefined;
    let unsubscribeGoals: (() => void) | undefined;


    const subscribe = async () => {
      // Listen to notifications
      unsubscribeNotifs = await notificationService.listenToUserNotifications(userId, (notifications) => {
        setNotifications(notifications);
        setLoading(false);
      });

      // Listen to goals to track completion status
      unsubscribeGoals = goalService.listenToUserGoals(userId, (goals) => {
        const goalsMap: Record<string, boolean> = {};
        goals.forEach(g => {
          goalsMap[g.id] = !!g.isCompleted;
        });
        setUserGoals(goalsMap);
      });
    };


    subscribe();


    return () => {
      if (unsubscribeNotifs) unsubscribeNotifs();
      if (unsubscribeGoals) unsubscribeGoals();
    };
  }, [userId]);




  const handlePress = async (n: Notification) => {
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
          navigation.navigate('Roadmap', { goal });
        }
      } catch (error) {
        logger.error('Error fetching goal:', error);
      }
    }

    if (n.type === 'post_reaction' && n.data?.postId) {
      navigation.navigate('Feed', { highlightPostId: n.data.postId });
    }
  };


  const handleFriendRequestHandled = () => {
    // Refresh notifications after friend request is handled
    if (userId) {
      notificationService.listenToUserNotifications(userId, (notifications) => {
        setNotifications(notifications);
      });
    }
  };


  const handleClearAll = async () => {
    if (!userId) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      await notificationService.clearAllNotifications(userId);
      Alert.alert('Success', 'All notifications have been cleared.');
    } catch (error) {
      logger.error('Error clearing all notifications:', error);
      Alert.alert('Error', 'Failed to clear notifications. Please try again.');
    }
  };


  const handleClearNotification = async (notificationId: string) => {
    if (!notificationId) {
      Alert.alert('Error', 'Cannot clear notification: missing ID');
      return;
    }

    try {
      await notificationService.deleteNotification(notificationId);
      // Alert.alert('Success', 'Notification has been cleared.'); // <-- THIS LINE IS REMOVED
    } catch (error) {
      logger.error('Error clearing notification:', error);
      Alert.alert('Error', 'Failed to clear notification. Please try again.');
    }
  };


  const handleApprovalActionTaken = () => {
    // Refresh notifications after approval action
    if (userId) {
      notificationService.listenToUserNotifications(userId, (notifications) => {
        setNotifications(notifications);
      });
    }
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
      // Determine if this is the latest notification for this goal
      const goalProgressNotifs = notifications.filter(
        n => n.type === 'goal_progress' && n.data?.goalId === item.data?.goalId
      );

      // Find the one with the highest sessionNumber (most recent)
      const latestNotif = goalProgressNotifs.reduce((latest, current) => {
        const latestSession = latest.data?.sessionNumber || 0;
        const currentSession = current.data?.sessionNumber || 0;
        return currentSession > latestSession ? current : latest;
      }, goalProgressNotifs[0]);

      const isLatest = latestNotif?.id === item.id;

      return <GoalProgressNotification notification={item} isLatest={isLatest} />;
    }

    // Handle post reaction notifications with enhanced design
    if (item.type === 'post_reaction') {
      const formatNotificationDate = (createdAt: any) => {
        const date =
          createdAt && typeof createdAt.toDate === 'function'
            ? createdAt.toDate()
            : new Date(createdAt);

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

      const mostRecentReaction = (item.data?.mostRecentReaction as 'muscle' | 'heart' | 'like') || 'like';

      return (
        <TouchableOpacity
          onPress={() => handlePress(item)}
          activeOpacity={0.8}
          style={[
            styles.reactionCard,
            !item.read && styles.reactionCardUnread
          ]}
        >
          <View style={styles.reactionCardContent}>
            {/* Profile Image or Placeholder */}
            <View style={styles.reactionEmojiContainer}>
              {item.data?.reactorProfileImageUrl ? (
                <Image
                  source={{ uri: item.data.reactorProfileImageUrl }}
                  style={styles.reactorProfileImage}
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


    const createdAtDate =
      item.createdAt instanceof Date
        ? item.createdAt
        : item.createdAt?.toDate
          ? item.createdAt.toDate()
          : new Date();

    const formatNotificationDate = (createdAt: any) => {
      // Handle Firestore Timestamp or Date
      const date =
        createdAt && typeof createdAt.toDate === 'function'
          ? createdAt.toDate()
          : new Date(createdAt);


      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));


      if (diffDays < 1) {
        // Less than 1 day → show hours
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours < 1) {
          // Less than 1 hour -> show minutes
          const diffMinutes = Math.floor(diffMs / (1000 * 60));
          return diffMinutes <= 1 ? '1m ago' : `${diffMinutes}m ago`;
        }
        return diffHours <= 1 ? '1h ago' : `${diffHours}h ago`;
      } else if (diffDays < 7) {
        // Less than a week → show days
        return diffDays === 1 ? '1d ago' : `${diffDays}d ago`;
      } else {
        // Otherwise show formatted date
        return date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    };


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
          >
            <Text style={styles.clearNotificationText}>×</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
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
          keyExtractor={(item) => item.id!}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </MainScreen>
  );
};


const styles = StyleSheet.create({
  clearAllButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  clearAllButtonText: {
    color: '#ffffff',
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
    borderColor: '#e5e7eb',
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
    borderColor: '#8b5cf6',
    backgroundColor: '#f5f3ff',
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
    color: '#111827',
    flex: 1,
  },
  unreadDot: {
    width: 10,
    height: 10,
    backgroundColor: '#8b5cf6',
    borderRadius: 5,
  },
  cardMessage: {
    color: '#4b5563',
    fontSize: 14,
    marginBottom: 6,
    lineHeight: 20,
  },
  cardDate: {
    color: '#9ca3af',
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hintText: {
    color: '#8b5cf6',
    fontSize: 11,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  clearNotificationButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 8,
  },
  clearNotificationText: {
    color: '#9ca3af',
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
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
    shadowColor: '#8b5cf6',
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
    color: '#4f46e5',
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
    color: '#111827',
    lineHeight: 20,
    flex: 1,
  },
  reactionUnreadDot: {
    width: 8,
    height: 8,
    backgroundColor: '#8b5cf6',
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
    color: '#9ca3af',
    marginBottom: 4,
  },
  reactionCta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b5cf6',
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
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
});


export default NotificationsScreen;