import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import MainScreen from './MainScreen';
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

type AddFriendNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AddFriend'>;

const AddFriendScreen: React.FC = () => {
  const colors = useColors();
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


  useEffect(() => {
    if (searchTerm.length >= 2) {
      const timeoutId = setTimeout(() => {
        handleSearch();
      }, 500);

      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
    }
  }, [searchTerm]);

  const handleSearch = useCallback(async () => {
    if (!currentUserId || searchTerm.length < 2) return;

    try {
      setIsSearching(true);
      setSearchError(false);
      const results = await friendService.searchUsers(sanitizeText(searchTerm, 100), currentUserId);
      setSearchResults(results);
    } catch (error: unknown) {
      logger.error('Error searching users:', error);
      setSearchError(true);
      showError('Failed to search users. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [currentUserId, searchTerm]);

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
    showSuccess(`Friend request sent to ${user.name}!`);
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
      showError('Failed to send friend request. Please try again.');
    }
  }, [currentUserId, currentUserName, currentUserProfileImageUrl, searchResults, showSuccess, showError, state.user?.profile?.country]);

  const handleViewProfile = useCallback((userId: string) => {
    Keyboard.dismiss();
    navigation.navigate('FriendProfile', { userId });
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
            title="Friends"
            onPress={() => {}}
            disabled
          />
        ) : item.hasPendingRequest ? (
          <Button
            variant="ghost"
            size="sm"
            title="Pending"
            onPress={() => {}}
            disabled
          />
        ) : (
          <Button
            variant="primary"
            size="sm"
            title="Add Friend"
            onPress={() => handleSendFriendRequest(item)}
          />
        )}
      </View>
    </View>
  ), [handleViewProfile, handleSendFriendRequest]);
  return (
    <ErrorBoundary screenName="AddFriendScreen" userId={state.user?.id}>
      <StatusBar style="auto" />
    <MainScreen activeRoute="Profile">
      <SharedHeader
        title="Add Friend"
        showBack
      />

      {/* Search Section */}
      <View style={styles.searchSection}>
        <Text style={styles.searchLabel}>Search for friends</Text>
        <TextInput
          placeholder="Enter name or email..."
          value={searchTerm}
          onChangeText={setSearchTerm}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          accessibilityLabel="Search for friends by name or email"
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
          <Text style={styles.hintText}>Enter at least 2 characters to search</Text>
        )}

        {searchError && !isSearching && searchTerm.length >= 2 && (
          <ErrorRetry message="Could not search users" onRetry={handleSearch} />
        )}

        {!searchError && searchTerm.length >= 2 && searchResults.length === 0 && !isSearching && (
          <EmptyState
            icon="🔍"
            title="No users found"
            message="Try searching with a different name or email"
          />
        )}

        {searchResults.length > 0 && (
          <>
            <Text style={styles.resultsTitle}>
              {searchResults.length} user{searchResults.length !== 1 ? 's' : ''} found
            </Text>
            <FlatList
              data={searchResults}
              renderItem={renderUserItem}
              keyExtractor={(item) => item.id}
              initialNumToRender={10}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.resultsList}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={Platform.OS !== 'web'}
              maxToRenderPerBatch={10}
              windowSize={5}
              getItemLayout={(data, index) => ({ length: 72, offset: 72 * index, index })}
            />
          </>
        )}
      </View>
    </MainScreen>
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
