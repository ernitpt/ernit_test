import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, UserSearchResult } from '../types';
import { friendService } from '../services/FriendService';
import { useApp } from '../context/AppContext';
import MainScreen from './MainScreen';
import { LinearGradient } from 'expo-linear-gradient';
import { commonStyles } from '../themes/commonStyles';
import { ChevronLeft } from 'lucide-react-native';

type AddFriendNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AddFriend'>;

const AddFriendScreen: React.FC = () => {
  const navigation = useNavigation<AddFriendNavigationProp>();
  const { state } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const currentUserId = state.user?.id;
  const currentUserName = state.user?.displayName || state.user?.profile?.name || 'User';
  const currentUserProfileImageUrl = state.user?.profile?.profileImageUrl;

  const [imageLoadError, setImageLoadError] = useState(false);

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
      const results = await friendService.searchUsers(searchTerm, currentUserId);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching users:', error);
      Alert.alert('Error', 'Failed to search users. Please try again.');
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
      
      Alert.alert('Success', `Friend request sent to ${user.name}!`);
      
      // Refresh search results to update the button state
      const updatedResults = await friendService.searchUsers(searchTerm, currentUserId);
      setSearchResults(updatedResults);
    } catch (error) {
      console.error('Error sending friend request:', error);
      Alert.alert('Error', 'Failed to send friend request. Please try again.');
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
      >
        {item.profileImageUrl && !imageLoadError ? (
          <Image
            source={{ uri: item.profileImageUrl }}
            style={styles.profileImage}
            onError={() => setImageLoadError(true)}
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
          >
            <Text style={styles.addButtonText}>Add Friend</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
const headerColors = ['#462088ff', '#235c9eff'] as const;

  return (
    <MainScreen activeRoute="Profile">
      <LinearGradient colors={headerColors} style={commonStyles.gradientHeader}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButtonHero}
            activeOpacity={0.8}
          >
            <ChevronLeft color="#fff" size={24} />
          </TouchableOpacity>

          <Text style={commonStyles.headerTitle}>Add Friend</Text>
        </View>
      </LinearGradient>

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
            />
            {isSearching && (
              <ActivityIndicator
                size="small"
                color="#8b5cf6"
                style={styles.searchLoader}
              />
            )}
          </View>
        </View>

        {/* Search Results */}
        <View style={styles.resultsSection}>
          {searchTerm.length > 0 && searchTerm.length < 2 && (
            <Text style={styles.hintText}>Enter at least 2 characters to search</Text>
          )}
          
          {searchTerm.length >= 2 && searchResults.length === 0 && !isSearching && (
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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  gradientHeader: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: 18,
    paddingTop: 28,
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 20 : 10,
    paddingBottom: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#8b5cf6',
    fontWeight: '600',
  },
  searchSection: {
    backgroundColor: '#ffffff',
    padding: 24,
    marginBottom: 16,
  },
  searchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  searchContainer: {
    position: 'relative',
  },
  searchInput: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
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
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 32,
  },
  noResultsText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 32,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
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
    color: '#111827',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 2,
  },
  userCountry: {
    fontSize: 12,
    color: '#9ca3af',
  },
  actionButton: {
    marginLeft: 12,
  },
  addButton: {
    backgroundColor: '#8b5cf6',
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
  placeholderText: { color: '#4f46e5', fontSize: 20, fontWeight: '700' },

});

export default AddFriendScreen;
