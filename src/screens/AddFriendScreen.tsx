import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  StatusBar,
  Platform,
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
import { commonStyles } from '../themes/commonStyles';
import { ListItemSkeleton } from '../components/SkeletonLoader';
import SharedHeader from '../components/SharedHeader';
import { logger } from '../utils/logger';
import { analyticsService } from '../services/AnalyticsService';
import Colors from '../config/colors';
import ErrorRetry from '../components/ErrorRetry';
import { EmptyState } from '../components/EmptyState';
import * as Haptics from 'expo-haptics';

type AddFriendNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AddFriend'>;

const AddFriendScreen: React.FC = () => {
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

  const [imageLoadErrors, setImageLoadErrors] = useState<Set<string>>(new Set());

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

  const handleSearch = async () => {
    if (!currentUserId || searchTerm.length < 2) return;

    try {
      setIsSearching(true);
      setSearchError(false);
      const results = await friendService.searchUsers(searchTerm, currentUserId);
      setSearchResults(results);
    } catch (error) {
      logger.error('Error searching users:', error);
      setSearchError(true);
      showError('Failed to search users. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendFriendRequest = async (user: UserSearchResult) => {
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
    } catch (error) {
      // 5. Rollback on failure
      logger.error('Error sending friend request:', error);
      setSearchResults(previousResults);
      showError('Failed to send friend request. Please try again.');
    }
  };

  const handleViewProfile = (userId: string) => {
    navigation.navigate('FriendProfile', { userId });
  };

  const renderUserItem = ({ item }: { item: UserSearchResult }) => (
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
          <TouchableOpacity style={styles.friendButton} disabled>
            <Text style={styles.friendButtonText}>Friends</Text>
          </TouchableOpacity>
        ) : item.hasPendingRequest ? (
          <TouchableOpacity style={styles.pendingButton} disabled>
            <Text style={styles.pendingButtonText}>Pending</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => handleSendFriendRequest(item)}
            accessibilityRole="button"
            accessibilityLabel={`Send friend request to ${item.name}`}
          >
            <Text style={styles.addButtonText}>Add Friend</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
  return (
    <ErrorBoundary screenName="AddFriendScreen" userId={state.user?.id}>
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
          accessibilityLabel="Search for friends by name or email"
          leftIcon={<Search size={18} color={Colors.textMuted} />}
          containerStyle={{ marginBottom: 0 }}
        />
        {isSearching && (
          <View style={{ marginTop: 12, gap: 8 }}>
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
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.resultsList}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={Platform.OS !== 'web'}
              maxToRenderPerBatch={10}
              windowSize={5}
            />
          </>
        )}
      </View>
    </MainScreen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  searchSection: {
    backgroundColor: Colors.white,
    padding: 24,
    marginBottom: 16,
  },
  searchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  resultsSection: {
    flex: 1,
    paddingHorizontal: 24,
  },
  hintText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 32,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  resultsList: {
    paddingBottom: 24,
  },
  userItem: {
    backgroundColor: Colors.white,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: Colors.textPrimary,
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
    marginRight: 12,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  userCountry: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  actionButton: {
    marginLeft: 12,
  },
  addButton: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  friendButton: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  friendButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  pendingButton: {
    backgroundColor: Colors.warning,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  pendingButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  backButtonHero: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
});

export default AddFriendScreen;
