import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Friend } from '../types';
import { friendService } from '../services/FriendService';
import { userService } from '../services/userService';
import { useApp } from '../context/AppContext';
import MainScreen from './MainScreen';
import PersonAddIcon from '../assets/icons/PersonAdd';
import { commonStyles } from '../themes/commonStyles';
import SharedHeader from '../components/SharedHeader';
import { logger } from '../utils/logger';
import Colors from '../config/colors';

type FriendsListNavigationProp = NativeStackNavigationProp<RootStackParamList, 'FriendsList'>;

interface EnrichedFriend extends Friend {
  currentName?: string;
  currentProfileImageUrl?: string;
}

const FriendsListScreen: React.FC = () => {
  const navigation = useNavigation<FriendsListNavigationProp>();
  const { state } = useApp();

  const [friends, setFriends] = useState<EnrichedFriend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<EnrichedFriend | null>(null);
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);
  const [showRemovePopup, setShowRemovePopup] = useState(false);

  const currentUserId = state.user?.id;
  const headerColors = Colors.gradientPrimary;
  const [imageLoadError, setImageLoadError] = useState(false);

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
    } catch {
      logger.error('Error loading friends');
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
    try {
      setRemovingFriendId(selectedFriend.friendId);
      await friendService.removeFriend(currentUserId, selectedFriend.friendId);
      await loadFriends();
    } catch (error) {
      logger.error('? Error removing friend:', error);
    } finally {
      setRemovingFriendId(null);
      closeRemovePopup();
    }
  };

  const renderFriendItem = ({ item }: { item: EnrichedFriend }) => {
    const displayName = item.currentName || item.friendName;
    const displayImage = item.currentProfileImageUrl || null;
    const isRemoving = removingFriendId === item.friendId;

    return (
      <View style={styles.friendItem}>
        <TouchableOpacity
          style={styles.friendTouchable}
          onPress={() => handleFriendPress(item.friendId)}
          activeOpacity={0.7}
          disabled={isRemoving}
        >
          {displayImage && !imageLoadError ? (
            <Image
              source={{ uri: displayImage }}
              style={styles.profileImage}
              onError={() => setImageLoadError(true)}
            />
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderText}>
                {displayName?.[0]?.toUpperCase() || 'U'}
              </Text>
            </View>
          )}
          <View style={styles.friendInfo}>
            <Text style={styles.friendName}>{displayName}</Text>
            <Text style={styles.friendDate}>
              Friends since {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.removeButton, isRemoving && styles.removeButtonDisabled]}
          onPress={() => openRemovePopup(item)}
          disabled={isRemoving}
        >
          {isRemoving ? (
            <ActivityIndicator size="small" color="#ef4444" />
          ) : (
            <Text style={styles.removeButtonText}>Remove</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <MainScreen activeRoute="Profile">
      <SharedHeader
        title="Your Friends"
        showBack
      />

      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.secondary} />
          <Text style={styles.loadingText}>Loading friends...</Text>
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
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>??</Text>
          <Text style={styles.emptyStateTitle}>No Friends Yet</Text>
          <Text style={styles.emptyStateText}>
            Start building your network by adding friends!
          </Text>
          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={() => navigation.navigate('AddFriend')}
          >
            <Text style={styles.emptyStateButtonText}>Add Your First Friend</Text>
          </TouchableOpacity>
        </View>
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
  );
};

const styles = StyleSheet.create({
  countContainer: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  addFriendIconButton: { padding: 4, justifyContent: 'center', alignItems: 'center' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#6b7280' },

  friendsList: { padding: 10 },
  friendItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  friendTouchable: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  profileImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
    backgroundColor: '#e5e7eb',
  },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 4 },
  friendDate: { fontSize: 13, color: '#9ca3af' },
  removeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ef4444',
    marginLeft: 8,
  },
  removeButtonDisabled: { opacity: 0.5 },
  removeButtonText: { fontSize: 13, color: '#ef4444', fontWeight: '600' },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyStateIcon: { fontSize: 64, marginBottom: 16 },
  emptyStateTitle: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  emptyStateText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  emptyStateButton: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: Colors.secondary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  emptyStateButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  placeholderImage: {
    width: 44,
    height: 44,
    borderRadius: 28,
    marginRight: 12,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { color: Colors.accentDark, fontSize: 20, fontWeight: '700' },

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
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '85%',
    maxWidth: 360,
    paddingVertical: 24,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 38,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.primaryDeep, marginBottom: 8 },
  modalSubtitle: {
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: 10 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  cancelButtonPopup: { backgroundColor: '#f3f4f6' },
  confirmButton: { backgroundColor: '#ef4444' },
  cancelText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  confirmText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});

export default FriendsListScreen;
