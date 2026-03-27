import React, { useState, useCallback, useMemo } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
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
import SharedHeader from '../components/SharedHeader';
import { ListItemSkeleton } from '../components/SkeletonLoader';
import { logger } from '../utils/logger';
import { Colors, useColors } from '../config';
import { Typography } from '../config/typography';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { Shadows } from '../config/shadows';
import { useToast } from '../context/ToastContext';
import ErrorRetry from '../components/ErrorRetry';
import { EmptyState } from '../components/EmptyState';
import { FOOTER_HEIGHT } from '../components/FooterNavigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FriendsListNavigationProp = NativeStackNavigationProp<RootStackParamList, 'FriendsList'>;

interface EnrichedFriend extends Friend {
  currentName?: string;
  currentProfileImageUrl?: string;
}

const FriendsListScreen: React.FC = () => {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<FriendsListNavigationProp>();
  const { state } = useApp();
  const { showError } = useToast();

  const [friends, setFriends] = useState<EnrichedFriend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [displayCount, setDisplayCount] = useState(20);
  const currentUserId = state.user?.id;

  const loadFriends = useCallback(async () => {
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
    } catch (err: unknown) {
      logger.error('Error loading friends', err);
      setError(true);
      showError('Could not load friends. Pull to refresh to try again.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId]);

  useFocusEffect(
    React.useCallback(() => {
      loadFriends();
    }, [loadFriends])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFriends();
    setRefreshing(false);
  }, [loadFriends]);

  const handleFriendPress = useCallback((friendId: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('FriendProfile', { userId: friendId });
  }, [navigation]);

  const renderFriendItem = useCallback(({ item }: { item: EnrichedFriend }) => {
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
        </View>
      </MotiView>
    );
  }, [handleFriendPress]);

  const handleLoadMore = useCallback(() => {
    setDisplayCount(prev => Math.min(prev + 20, friends.length));
  }, [friends.length]);

  return (
    <ErrorBoundary screenName="FriendsListScreen" userId={state.user?.id}>
      <StatusBar style="auto" />
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
            data={friends.slice(0, displayCount)}
            renderItem={renderFriendItem}
            keyExtractor={(item) => item.id}
            initialNumToRender={10}
            contentContainerStyle={[styles.friendsList, { paddingBottom: Spacing.sm + FOOTER_HEIGHT + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS !== 'web'}
            maxToRenderPerBatch={10}
            windowSize={5}
            getItemLayout={(data, index) => ({ length: 88, offset: 88 * index, index })}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              displayCount < friends.length ? (
                <View>
                  <ListItemSkeleton />
                  <ListItemSkeleton />
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

    </MainScreen>
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  countContainer: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  countText: { ...Typography.captionBold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  addFriendIconButton: { padding: Spacing.xs, justifyContent: 'center', alignItems: 'center' },

  skeletonContainer: { padding: Spacing.sm },

  friendsList: { padding: Spacing.sm, paddingBottom: Spacing.sm + FOOTER_HEIGHT },
  friendItem: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: colors.primaryBorder,
    ...Shadows.sm,
  },
  friendTouchable: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  avatarMargin: {
    marginRight: Spacing.md,
  },
  friendInfo: { flex: 1 },
  friendName: { ...Typography.heading3, fontWeight: '600', color: colors.textPrimary, marginBottom: Spacing.xs },
  friendDate: { ...Typography.caption, color: colors.textMuted },
});

export default FriendsListScreen;
