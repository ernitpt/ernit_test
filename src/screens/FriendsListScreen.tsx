import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLocalDate } from '../utils/i18nHelpers';
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
import { FOOTER_HEIGHT } from '../components/CustomTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { analyticsService } from '../services/AnalyticsService';

type FriendsListNavigationProp = NativeStackNavigationProp<RootStackParamList, 'FriendsList'>;

interface EnrichedFriend extends Friend {
  currentName?: string;
  currentProfileImageUrl?: string;
}

const FriendsListScreen: React.FC = () => {
  const { t } = useTranslation();
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
  const lastFetchRef = useRef<number>(0);

  const loadFriends = useCallback(async (forceRefresh = false) => {
    if (!currentUserId) return;

    const now = Date.now();
    if (!forceRefresh && now - lastFetchRef.current < 60_000) return; // skip if fetched < 60s ago
    lastFetchRef.current = now;

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
      showError(t('friends.error.couldNotLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId]);

  useFocusEffect(
    React.useCallback(() => {
      loadFriends();
    }, [loadFriends])
  );

  // Screen-view enrichment
  useEffect(() => {
    if (isLoading) return;
    analyticsService.trackEvent('screen_view', 'navigation', { friendCount: friends.length }, 'FriendsListScreen');
  }, [isLoading, friends.length]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFriends(true);
    setRefreshing(false);
  }, [loadFriends]);

  const handleFriendPress = useCallback((friendId: string) => {
    analyticsService.trackEvent('button_click', 'engagement', { buttonName: 'view_friend', friendId }, 'FriendsListScreen');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('MainTabs', { screen: 'FeedTab', params: { screen: 'FriendProfile', params: { userId: friendId } } });
  }, [navigation]);

  const renderFriendItem = useCallback(({ item }: { item: EnrichedFriend }) => {
    const displayName = item.currentName || item.friendName;
    const displayImage = item.currentProfileImageUrl || null;

    return (
      <MotiView
        from={{ translateY: 10 }}
        animate={{ translateY: 0 }}
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
                {t('friends.friendsSince', { date: formatLocalDate(item.createdAt?.toDate?.() ?? new Date(item.createdAt as string | number | Date), { month: 'long', year: 'numeric' }) })}
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
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style="auto" />
      <SharedHeader
        title={t('friends.screenTitle')}
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
              {t('friends.count', { count: friends.length })}
            </Text>

            <TouchableOpacity
              onPress={() => { analyticsService.trackEvent('button_click', 'engagement', { buttonName: 'add_friend' }, 'FriendsListScreen'); navigation.navigate('AddFriend'); }}
              style={styles.addFriendIconButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('friends.addFriendAccessibility')}
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
        <ErrorRetry message={t('friends.error.couldNotLoad')} onRetry={loadFriends} />
      ) : (
        <EmptyState
          icon="👥"
          title={t('friends.empty.title')}
          message={t('friends.empty.message')}
          actionLabel={t('friends.empty.actionLabel')}
          onAction={() => navigation.navigate('AddFriend')}
        />
      )}

      </View>
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
