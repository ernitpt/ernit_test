import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  Keyboard,
} from 'react-native';
import { TextInput } from '../components/TextInput';
import { Avatar } from '../components/Avatar';
import { Search } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, UserSearchResult } from '../types';
import { friendService } from '../services/FriendService';
import { AppError } from '../utils/AppError';
import { logErrorToFirestore } from '../utils/errorLogger';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { ListItemSkeleton } from '../components/SkeletonLoader';
import SharedHeader from '../components/SharedHeader';
import { logger } from '../utils/logger';
import { analyticsService } from '../services/AnalyticsService';
import { sanitizeText } from '../utils/sanitization';
import { Colors, useColors } from '../config';
import { Typography } from '../config/typography';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import ErrorRetry from '../components/ErrorRetry';
import { EmptyState } from '../components/EmptyState';
import Button from '../components/Button';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AddFriendNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AddFriend'>;

const AddFriendScreen: React.FC = () => {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<AddFriendNavigationProp>();
  const { state } = useApp();
  const { showSuccess, showError } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const currentUserId = state.user?.id;
  const currentUserName = state.user?.displayName || state.user?.profile?.name || 'User';
  const currentUserProfileImageUrl = state.user?.profile?.profileImageUrl;

  // C16: Generation counter — discards stale responses when a newer search is in flight
  const searchGenRef = useRef(0);

  const handleSearch = useCallback(async (query: string) => {
    if (!currentUserId || query.length < 2) return;
    const gen = ++searchGenRef.current;
    try {
      setIsSearching(true);
      setSearchError(false);
      const results = await friendService.searchUsers(sanitizeText(query, 100), currentUserId);
      if (gen !== searchGenRef.current) return; // stale, discard
      analyticsService.trackEvent('friend_search', 'social', {
        resultCount: results.length,
      }, 'AddFriendScreen');
      setSearchResults(results);
    } catch (error: unknown) {
      if (gen !== searchGenRef.current) return; // stale, discard
      logger.error('Error searching users:', error);
      setSearchError(true);
      showError(t('friends.add.toast.failedSearch'));
    } finally {
      if (gen === searchGenRef.current) {
        setIsSearching(false);
      }
    }
  }, [currentUserId, showError]);

  useEffect(() => {
    if (searchTerm.length >= 2) {
      const timeoutId = setTimeout(() => {
        handleSearch(searchTerm);
      }, 500);

      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
    }
  }, [searchTerm, handleSearch]);

  const handleSendFriendRequest = useCallback(async (user: UserSearchResult) => {
    if (!currentUserId) return;

    // 1. Save current state for rollback
    const previousResults = [...searchResults];

    // 2. Update UI immediately - mark user as "request sent"
    setSearchResults(results => results.map(u =>
      u.id === user.id ? { ...u, hasPendingRequest: true } : u
    ));

    // 3. Show success feedback immediately
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showSuccess(t('friends.add.toast.requestSent', { name: user.name }));
    analyticsService.trackEvent('friend_request_sent', 'social', { recipientId: user.id }, 'AddFriendScreen');

    // 4. Call API in background
    try {
      await friendService.sendFriendRequest(
        currentUserId,
        currentUserName,
        user.id,
        user.name,
        state.user?.profile?.country,
        currentUserProfileImageUrl
      );
    } catch (error: unknown) {
      // 5. Rollback on failure
      logger.error('Error sending friend request:', error);
      setSearchResults(previousResults);

      // Persist non-business errors to Firestore so they're visible in admin tooling.
      // Skip expected business errors (already friends, dup, rate limit) — those aren't bugs.
      const businessCodes = ['ALREADY_FRIENDS', 'DUPLICATE_REQUEST', 'REVERSE_REQUEST', 'RATE_LIMIT', 'SELF_REQUEST'];
      const code = error instanceof AppError ? error.code : undefined;
      if (!code || !businessCodes.includes(code)) {
        await logErrorToFirestore(error instanceof Error ? error : new Error(String(error)), {
          screenName: 'AddFriendScreen',
          feature: 'SendFriendRequest',
          userId: currentUserId,
          additionalData: { recipientId: user.id, errorCode: code ?? 'unknown' },
        });
      }

      // Surface the specific reason so the user knows what to do
      // (the old generic toast hid duplicate/already-friends/rate-limit cases).
      if (error instanceof AppError) {
        switch (error.code) {
          case 'ALREADY_FRIENDS':
            showError(t('friends.add.toast.alreadyFriends', { defaultValue: 'You are already friends with this person.' }));
            break;
          case 'DUPLICATE_REQUEST':
            showError(t('friends.add.toast.duplicateRequest', { defaultValue: 'You already sent this person a friend request.' }));
            break;
          case 'REVERSE_REQUEST':
            showError(t('friends.add.toast.reverseRequest', { defaultValue: 'This person already sent you a request — check your notifications.' }));
            break;
          case 'RATE_LIMIT':
            showError(t('friends.add.toast.rateLimit', { defaultValue: 'Too many friend requests. Try again in a few minutes.' }));
            break;
          case 'SELF_REQUEST':
            showError(t('friends.add.toast.selfRequest', { defaultValue: 'You cannot send a friend request to yourself.' }));
            break;
          default:
            showError(t('friends.add.toast.failedRequest'));
        }
      } else {
        showError(t('friends.add.toast.failedRequest'));
      }
    }
  }, [currentUserId, currentUserName, currentUserProfileImageUrl, showSuccess, showError, state.user?.profile?.country]);

  const handleViewProfile = useCallback((userId: string) => {
    Keyboard.dismiss();
    navigation.navigate('MainTabs', { screen: 'FeedTab', params: { screen: 'FriendProfile', params: { userId } } });
  }, [navigation]);

  const renderUserItem = useCallback(({ item }: { item: UserSearchResult }) => (
    <View style={styles.userItem}>
      <TouchableOpacity
        style={styles.userInfo}
        onPress={() => handleViewProfile(item.id)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`View ${item.name}'s profile`}
      >
        <Avatar uri={item.profileImageUrl} name={item.name} size="md" style={styles.avatarMargin} />
        <View style={styles.userDetails}>
          <Text style={styles.userName}>{item.name}</Text>
          {item.country && (
            <Text style={styles.userCountry}>{item.country}</Text>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.actionButton}>
        {item.isFriend ? (
          <Button
            variant="secondary"
            size="sm"
            title={t('friends.add.buttons.friends')}
            onPress={() => {}}
            disabled
          />
        ) : item.hasPendingRequest ? (
          <Button
            variant="ghost"
            size="sm"
            title={t('friends.add.buttons.pending')}
            onPress={() => {}}
            disabled
          />
        ) : (
          <Button
            variant="primary"
            size="sm"
            title={t('friends.add.buttons.addFriend')}
            onPress={() => handleSendFriendRequest(item)}
          />
        )}
      </View>
    </View>
  ), [handleViewProfile, handleSendFriendRequest]);
  return (
    <ErrorBoundary screenName="AddFriendScreen" userId={state.user?.id}>
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style="auto" />
      <SharedHeader
        title={t('friends.add.screenTitle')}
        showBack
      />

      {/* Search Section */}
      <View style={styles.searchSection}>
        <Text style={styles.searchLabel}>{t('friends.add.searchLabel')}</Text>
        <TextInput
          placeholder={t('friends.add.searchPlaceholder')}
          value={searchTerm}
          onChangeText={setSearchTerm}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => handleSearch(searchTerm)}
          accessibilityLabel={t('friends.add.searchAccessibility')}
          leftIcon={<Search size={18} color={colors.textMuted} />}
          containerStyle={{ marginBottom: 0 }}
          maxLength={100}
        />
        {isSearching && (
          <View style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
            <ListItemSkeleton />
            <ListItemSkeleton />
            <ListItemSkeleton />
          </View>
        )}
      </View>

      {/* Search Results */}
      <View style={styles.resultsSection}>
        {searchTerm.length > 0 && searchTerm.length < 2 && (
          <Text style={styles.hintText}>{t('friends.add.minCharsHint')}</Text>
        )}

        {searchError && !isSearching && searchTerm.length >= 2 && (
          <ErrorRetry message={t('friends.add.error.couldNotSearch')} onRetry={() => handleSearch(searchTerm)} />
        )}

        {!searchError && searchTerm.length >= 2 && searchResults.length === 0 && !isSearching && (
          <EmptyState
            icon="🔍"
            title={t('friends.add.empty.title')}
            message={t('friends.add.empty.message')}
          />
        )}

        {searchResults.length > 0 && (
          <>
            <Text style={styles.resultsTitle}>
              {t('friends.add.results', { count: searchResults.length })}
            </Text>
            <FlatList
              data={searchResults}
              renderItem={renderUserItem}
              keyExtractor={(item) => item.id}
              initialNumToRender={10}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.resultsList, { paddingBottom: insets.bottom }]}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={Platform.OS !== 'web'}
              maxToRenderPerBatch={10}
              windowSize={5}
              getItemLayout={(data, index) => ({ length: 72, offset: 72 * index, index })}
            />
          </>
        )}
      </View>
      </View>
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  searchSection: {
    backgroundColor: colors.white,
    padding: Spacing.xxl,
    marginBottom: Spacing.lg,
  },
  searchLabel: {
    ...Typography.subheading,
    color: colors.textPrimary,
    marginBottom: Spacing.md,
  },
  resultsSection: {
    flex: 1,
    paddingHorizontal: Spacing.xxl,
  },
  hintText: {
    ...Typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xxxl,
  },
  resultsTitle: {
    ...Typography.subheading,
    color: colors.textPrimary,
    marginBottom: Spacing.lg,
  },
  resultsList: {
    paddingBottom: Spacing.xxl,
  },
  userItem: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: colors.textPrimary,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarMargin: {
    marginRight: Spacing.md,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    ...Typography.subheading,
    color: colors.textPrimary,
    marginBottom: Spacing.xxs,
  },
  userEmail: {
    ...Typography.small,
    color: colors.textSecondary,
    marginBottom: Spacing.xxs,
  },
  userCountry: {
    ...Typography.caption,
    color: colors.textMuted,
  },
  actionButton: {
    marginLeft: Spacing.md,
  },
  addButton: {
    backgroundColor: colors.secondary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
  addButtonText: {
    color: colors.white,
    ...Typography.smallBold,
  },
  friendButton: {
    backgroundColor: colors.secondary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
  friendButtonText: {
    color: colors.white,
    ...Typography.smallBold,
  },
  pendingButton: {
    backgroundColor: colors.warning,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
  pendingButtonText: {
    color: colors.white,
    ...Typography.smallBold,
  },
  backButtonHero: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xl,
    backgroundColor: colors.overlayLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
});

export default AddFriendScreen;
