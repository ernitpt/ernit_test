import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
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


type NotificationNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Notification'
>;


const NotificationsScreen = () => {
  const { state } = useApp();
  const userId = state.user?.id;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<NotificationNavigationProp>();


  useEffect(() => {
    if (!userId) return;
    setLoading(true);


    let unsubscribe: (() => void) | undefined;


    const subscribe = async () => {
        unsubscribe = await notificationService.listenToUserNotifications(userId, (notifications) => {
        setNotifications(notifications);
        setLoading(false); // ✅ set loading to false once we have data
        });
    };


    subscribe();


    return () => {
        if (unsubscribe) unsubscribe();
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
        console.error('Error fetching experience gift:', error);
      }
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
      console.error('Error clearing all notifications:', error);
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
      console.error('Error clearing notification:', error);
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


          <Text style={styles.cardDate}>{formatNotificationDate(item.createdAt)}</Text>
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

  const headerColors = ['#462088ff', '#235c9eff'] as const;


  return (
    <MainScreen activeRoute="Notification">
      <StatusBar style="light" />
      <LinearGradient colors={headerColors} style={styles.gradientHeader}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {notifications.length > 0 && (
            <TouchableOpacity
              style={styles.clearAllButton}
              onPress={handleClearAll}
            >
              <Text style={styles.clearAllButtonText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator
          size="large"
          color="#8b5cf6"
          style={{ marginTop: 50 }}
        />
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id!}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No notifications yet.</Text>
          }
        />
      )}
    </MainScreen>
  );
};


const styles = StyleSheet.create({
  gradientHeader: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: 18,
    paddingTop: 28,
  },
  header: {
    paddingHorizontal: 24,
    // paddingTop: 34,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
    // marginBottom: 4,
  },

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
});


export default NotificationsScreen;