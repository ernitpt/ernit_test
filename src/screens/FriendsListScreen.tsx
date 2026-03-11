import React, { useState, useRef } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Animated,
  Platform,
} from 'react-native';
import { Avatar } from '../components/Avatar';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MotiView } from 'moti';
import { RootStackParamList, Friend } from '../types';
import { friendService } from '../services/FriendService';
import { userService } from '../services/userService';
import { useApp } from '../context/AppContext';
import MainScreen from './MainScreen';
import PersonAddIcon from '../assets/icons/PersonAdd';
import { commonStyles } from '../themes/commonStyles';
import SharedHeader from '../components/SharedHeader';
import { ListItemSkeleton } from '../components/SkeletonLoader';
import { logger } from '../utils/logger';
import Colors from '../config/colors';
import { useToast } from '../context/ToastContext';
import ErrorRetry from '../components/ErrorRetry';
import { EmptyState } from '../components/EmptyState';

type FriendsListNavigationProp = NativeStackNavigationProp<RootStackParamList, 'FriendsList'>;

interface EnrichedFriend extends Friend {
  currentName?: string;
  currentProfileImageUrl?: string;
}

const FriendsListScreen: React.FC = () => {
  const navigation = useNavigation<FriendsListNavigationProp>();
  const { state } = useApp();
  const { showError, showSuccess } = useToast();

  const [friends, setFriends] = useState<EnrichedFriend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<EnrichedFriend | null>(null);
  const [showRemovePopup, setShowRemovePopup] = useState(false);

  const currentUserId = state.user?.id;
  const headerColors = Colors.gradientPrimary;
  const [imageLoadErrors, setImageLoadErrors] = useState<Set<string>>(new Set());

  // Animations
  const popupOpacity = useRef(new Animated.Value(0)).current;
  const popupScale = useRef(new Animated.Value(0.9)).current;

  useFocusEffect(
    React.useCallback(() => {
      loadFriends();
    }, [currentUserId])
  );

  const openRemovePopup = (friend: EnrichedFriend) => {
    setSelectedFriend(friend);
    setShowRemovePopup(true);
    Animated.parallel([
      Animated.timing(popupOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(popupScale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
  };

  const closeRemovePopup = () => {
    Animated.parallel([
      Animated.timing(popupOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(popupScale, { toValue: 0.9, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setShowRemovePopup(false);
      setSelectedFriend(null);
    });
  };

  const loadFriends = async () => {
    if (!currentUserId) return;

    try {
      setIsLoading(true);
      setError(false);
      const friendsList = await friendService.getFriends(currentUserId);

      const enrichedFriends = await Promise.all(
        friendsList.map(async (friend) => {
          try {
            const profile = await userService.getUserProfile(friend.friendId);
            return {
              ...friend,
              currentName: profile?.name || friend.friendName,
              currentProfileImageUrl: profile?.profileImageUrl || null,
            };
          } catch {
            return {
              ...friend,
              currentName: friend.friendName,
              currentProfileImageUrl: friend.friendProfileImageUrl || null,
            };
          }
        })
      );

      setFriends(enrichedFriends);
    } catch (err) {
      logger.error('Error loading friends', err);
      setError(true);
      showError('Could not load friends. Pull to refresh to try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadFriends();
    setRefreshing(false);
  };

  const handleFriendPress = (friendId: string) => {
    navigation.navigate('FriendProfile', { userId: friendId });
  };

  const confirmRemoveFriend = async () => {
    if (!currentUserId || !selectedFriend) return;

    // 1. Save for rollback
    const previousFriends = [...friends];

    // 2. Remove from UI immediately
    setFriends(friends => friends.filter(f => f.friendId !== selectedFriend.friendId));

    // 3. Show success feedback immediately
    showSuccess('Friend removed');

    // 4. Close modal immediately
    closeRemovePopup();

    // 5. Call API in background
    try {
      await friendService.removeFriend(currentUserId, selectedFriend.friendId);
    } catch (error) {
      // 6. Rollback on failure
      logger.error('Error removing friend:', error);
      setFriends(previousFriends);
      showError('Failed to remove friend. Please try again.');
    }
  };

  const renderFriendItem = ({ item }: { item: EnrichedFriend }) => {
    const displayName = item.currentName || item.friendName;
    const displayImage = item.currentProfileImageUrl || null;

    return (
      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 300 }}
      >
        <View style={styles.friendItem}>
          <TouchableOpacity
            style={styles.friendTouchable}
            onPress={() => handleFriendPress(item.friendId)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`View ${displayName}'s profile`}
          >
            <Avatar uri={displayImage} name={displayName} size="lg" style={styles.avatarMargin} />
            <View style={styles.friendInfo}>
              <Text style={styles.friendName}>{displayName}</Text>
              <Text style={styles.friendDate}>
                Friends since {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => openRemovePopup(item)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${displayName} from friends`}
          >
            <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </MotiView>
    );
  };

  return (
    <ErrorBoundary screenName="FriendsListScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Profile">
      <SharedHeader
        title="Your Friends"
        showBack
      />

      {isLoading && !refreshing ? (
        <View style={styles.skeletonContainer}>
          {[1, 2, 3, 4, 5].map((i) => (
            <ListItemSkeleton key={i} />
          ))}
        </View>
      ) : friends.length > 0 ? (
        <>
          <View style={styles.countContainer}>
            <Text style={styles.countText}>
              {friends.length} {friends.length === 1 ? 'Friend' : 'Friends'}
            </Text>

            <TouchableOpacity
              onPress={() => navigation.navigate('AddFriend')}
              style={styles.addFriendIconButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add a friend"
            >
              <PersonAddIcon width={30} height={30} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={friends}
            renderItem={renderFriendItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.friendsList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS !== 'web'}
            maxToRenderPerBatch={10}
            windowSize={5}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[Colors.secondary]}
                tintColor={Colors.secondary}
              />
            }
          />
        </>
      ) : error && friends.length === 0 ? (
        <ErrorRetry message="Could not load friends" onRetry={loadFriends} />
      ) : (
        <EmptyState
          icon="👥"
          title="No Friends Yet"
          message="Start building your network by adding friends!"
          actionLabel="Add Your First Friend"
          onAction={() => navigation.navigate('AddFriend')}
        />
      )}

      {showRemovePopup && (
        <Animated.View
          style={[
            styles.modalOverlay,
            { opacity: popupOpacity, transform: [{ scale: popupScale }] },
          ]}
        >
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Remove Friend?</Text>
            <Text style={styles.modalSubtitle}>
              Are you sure you want to remove{' '}
              <Text style={{ fontWeight: '700' }}>{selectedFriend?.currentName}</Text>?
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
                onPress={confirmRemoveFriend}
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
  countContainer: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  addFriendIconButton: { padding: 4, justifyContent: 'center', alignItems: 'center' },

  skeletonContainer: { padding: 10 },

  friendsList: { padding: 10 },
  friendItem: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.backgroundLight,
  },
  friendTouchable: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  avatarMargin: {
    marginRight: 12,
  },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  friendDate: { fontSize: 13, color: Colors.textMuted },
  removeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.error,
    marginLeft: 8,
  },
  removeButtonDisabled: { opacity: 0.5 },
  removeButtonText: { fontSize: 13, color: Colors.error, fontWeight: '600' },

  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.primaryDeep, marginBottom: 8 },
  modalSubtitle: {
    fontSize: 15,
    color: Colors.gray700,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: 10 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  cancelButtonPopup: { backgroundColor: Colors.backgroundLight },
  confirmButton: { backgroundColor: Colors.error },
  cancelText: { color: Colors.gray700, fontWeight: '600', fontSize: 15 },
  confirmText: { color: Colors.white, fontWeight: '600', fontSize: 15 },
});

export default FriendsListScreen;
