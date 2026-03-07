import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  StatusBar,
  Platform,
} from 'react-native';
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

type AddFriendNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AddFriend'>;

const AddFriendScreen: React.FC = () => {
  const navigation = useNavigation<AddFriendNavigationProp>();
  const { state } = useApp();
  const { showSuccess, showError } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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

    try {
      setIsLoading(true);
      await friendService.sendFriendRequest(
        currentUserId,
        currentUserName,
        user.id,
        user.name,
        state.user?.profile?.country,
        currentUserProfileImageUrl
      );

      analyticsService.trackEvent('friend_request_sent', 'social', { recipientId: user.id }, 'AddFriendScreen');
      showSuccess(`Friend request sent to ${user.name}!`);

      // Refresh search results to update the button state
      const updatedResults = await friendService.searchUsers(searchTerm, currentUserId);
      setSearchResults(updatedResults);
    } catch (error) {
      logger.error('Error sending friend request:', error);
      showError('Failed to send friend request. Please try again.');
    } finally {
      setIsLoading(false);
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
        {item.profileImageUrl && !imageLoadErrors.has(item.id) ? (
          <Image
            source={{ uri: item.profileImageUrl }}
            style={styles.profileImage}
            onError={() => setImageLoadErrors(prev => new Set(prev).add(item.id))}
            accessibilityLabel={`${item.name}'s profile picture`}
          />
        ) : (
          <View style={styles.placeholderImage}>
            <Text style={styles.placeholderText}>
              {item.name?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
        )}
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
            disabled={isLoading}
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
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Enter name or email..."
            value={searchTerm}
            onChangeText={setSearchTerm}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search for friends by name or email"
          />
        </View>
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
          <Text style={styles.noResultsText}>No users found</Text>
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
    backgroundColor: '#ffffff',
    padding: 24,
    marginBottom: 16,
  },
  searchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  searchContainer: {
    position: 'relative',
  },
  searchInput: {
    backgroundColor: Colors.backgroundLight,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  searchLoader: {
    position: 'absolute',
    right: 16,
    top: 12,
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
  noResultsText: {
    fontSize: 16,
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
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
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
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  friendButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  friendButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  pendingButton: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  pendingButtonText: {
    color: '#ffffff',
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

});

export default AddFriendScreen;
