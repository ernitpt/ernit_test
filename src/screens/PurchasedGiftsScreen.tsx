import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ErrorBoundary } from '../components/ErrorBoundary';
import ErrorRetry from '../components/ErrorRetry';
import { useApp } from '../context/AppContext';
import MainScreen from './MainScreen';
import { experienceGiftService } from '../services/ExperienceGiftService';
import { experienceService } from '../services/ExperienceService';
import { userService } from '../services/userService';
import { ExperienceGift, Experience, RootStackParamList } from '../types';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import SharedHeader from '../components/SharedHeader';
import { GiftCardSkeleton, SkeletonBox, ListItemSkeleton } from '../components/SkeletonLoader';
import { logger } from '../utils/logger';
import Colors from '../config/colors';
import { Typography } from '../config/typography';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { MotiView } from 'moti';
import { EmptyState } from '../components/EmptyState';
import { Card } from '../components/Card';

type PurchasedGiftsNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'PurchasedGifts'
>;

// ------------------------------------------------------------------
// Helper Functions and Components (moved outside parent for performance)
// ------------------------------------------------------------------

const formatDate = (date: Date | { toDate(): Date } | number | string | null | undefined) => {
  if (!date) return 'N/A';
  const jsDate =
    typeof date.toDate === 'function' ? date.toDate() : new Date(date);
  return jsDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const GiftItem = ({ item }: { item: ExperienceGift }) => {
  const navigation = useNavigation<PurchasedGiftsNavigationProp>();
  const [claimedByName, setClaimedByName] = useState<string | null>(null);
  const [loadingName, setLoadingName] = useState(false);
  const [experience, setExperience] = useState<Experience | null>(null);

  useEffect(() => {
    const fetchClaimerName = async () => {
      if (item.status !== 'claimed') return;
      setLoadingName(true);
      try {
        const q = query(collection(db, 'goals'), where('experienceGiftId', '==', item.id));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const goalData = snap.docs[0].data();
          if (goalData.userId) {
            const name = await userService.getUserName(goalData.userId);
            setClaimedByName(name);
          }
        }
      } catch (err) {
        logger.error(`? Error fetching claimer for gift ${item.id}:`, err);
      } finally {
        setLoadingName(false);
      }
    };

    fetchClaimerName();
  }, [item.status, item.id]);

  useEffect(() => {
    const fetchExperience = async () => {
      try {
        const exp = await experienceService.getExperienceById(item.experienceId);
        setExperience(exp);
      } catch (error) {
        logger.error("Error fetching experience:", error);
      }
    };
    fetchExperience();
  }, [item.experienceId]);

  const handlePress = () => {
    navigation.navigate("Confirmation", { experienceGift: item });
  };

  return (
    <Card
      variant="outlined"
      onPress={handlePress}
      style={styles.card}
      accessibilityLabel={`View gift details for ${experience ? experience.title : 'experience'}. Status: ${item.status}`}
    >
      <View style={styles.cardRow}>
        <Text style={styles.title}>
          {experience ? experience.title : <SkeletonBox width={120} height={16} borderRadius={4} />}
        </Text>
        <Text
          style={[
            styles.status,
            item.status === 'claimed' ? styles.statusClaimed : styles.statusPending,
          ]}
        >
          {item.status ? item.status.toUpperCase() : 'PENDING'}
        </Text>
      </View>

      {item.status === 'claimed' ? (
        <Text style={[styles.detail, { color: Colors.primaryDeep, fontWeight: '500' }]}>
          Claimed by:{' '}
          {loadingName ? (
            <SkeletonBox width={80} height={14} borderRadius={4} />
          ) : (
            claimedByName || 'Unknown'
          )}
        </Text>
      ) : (
        <Text style={styles.detail}>Claim Code: {item.claimCode}</Text>
      )}

      <Text style={styles.detail}>Created: {formatDate(item.createdAt)}</Text>
    </Card>
  );
};

const PurchasedGiftsScreen = () => {
  const { state } = useApp();
  const userId = state.user?.id;
  const [gifts, setGifts] = useState<ExperienceGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'claimed'>('all');
  const [error, setError] = useState(false);
  const [displayCount, setDisplayCount] = useState(20);
  const navigation = useNavigation<PurchasedGiftsNavigationProp>();

  const fetchGifts = async () => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    try {
      const userGifts = await experienceGiftService.getExperienceGiftsByUser(userId);
      setGifts(userGifts);
      setError(false);
    } catch (error) {
      logger.error('Error fetching purchased gifts:', error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGifts();
  }, [userId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchGifts();
    } finally {
      setRefreshing(false);
    }
  };

  // Filter gifts based on selected filter
  const filteredGifts = gifts.filter(gift => {
    if (filterStatus === 'all') return true;
    return gift.status === filterStatus;
  });

  // Reset display count when filter changes
  const handleFilterChange = (status: 'all' | 'pending' | 'claimed') => {
    setFilterStatus(status);
    setDisplayCount(20);
  };

  const renderGiftItem = useCallback(({ item, index }: { item: ExperienceGift; index: number }) => (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 300, delay: index * 60 }}
    >
      <GiftItem item={item} />
    </MotiView>
  ), []);

  return (
    <ErrorBoundary screenName="PurchasedGiftsScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Settings">
      <StatusBar style="light" />
      <SharedHeader
        title="Purchased Gifts"
        showBack
      />

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTab, filterStatus === 'all' && styles.filterTabActive]}
          onPress={() => handleFilterChange('all')}
          accessibilityRole="button"
          accessibilityLabel={`Show all ${gifts.length} gifts`}
        >
          <Text style={[styles.filterText, filterStatus === 'all' && styles.filterTextActive]}>
            All ({gifts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filterStatus === 'pending' && styles.filterTabActive]}
          onPress={() => handleFilterChange('pending')}
          accessibilityRole="button"
          accessibilityLabel={`Show ${gifts.filter(g => g.status === 'pending').length} pending gifts`}
        >
          <Text style={[styles.filterText, filterStatus === 'pending' && styles.filterTextActive]}>
            Pending ({gifts.filter(g => g.status === 'pending').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filterStatus === 'claimed' && styles.filterTabActive]}
          onPress={() => handleFilterChange('claimed')}
          accessibilityRole="button"
          accessibilityLabel={`Show ${gifts.filter(g => g.status === 'claimed').length} claimed gifts`}
        >
          <Text style={[styles.filterText, filterStatus === 'claimed' && styles.filterTextActive]}>
            Claimed ({gifts.filter(g => g.status === 'claimed').length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.listContainer}>
          {[1, 2, 3, 4].map((i) => (
            <GiftCardSkeleton key={i} />
          ))}
        </View>
      ) : error ? (
        <ErrorRetry
          message="Could not load gifts"
          onRetry={fetchGifts}
        />
      ) : filteredGifts.length === 0 ? (
        <EmptyState
          icon="🎁"
          title={filterStatus === 'all' ? 'No Gifts Yet' : `No ${filterStatus} Gifts`}
          message={filterStatus === 'all'
            ? 'Purchase a gift to empower someone special!'
            : `No gifts with status "${filterStatus}"`}
        />
      ) : (
        <FlatList
          data={filteredGifts.slice(0, displayCount)}
          renderItem={renderGiftItem}
          keyExtractor={(item) => item.id!}
          contentContainerStyle={styles.listContainer}
          removeClippedSubviews={Platform.OS !== 'web'}
          maxToRenderPerBatch={10}
          windowSize={5}
          getItemLayout={(data, index) => ({ length: 120, offset: 120 * index, index })}
          onEndReached={() => setDisplayCount(prev => Math.min(prev + 20, filteredGifts.length))}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            displayCount < filteredGifts.length ? (
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
              colors={[Colors.secondary]}
              tintColor={Colors.secondary}
            />
          }
        />
      )}
    </MainScreen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  listContainer: {
    padding: Spacing.xl,
  },
  card: {
    marginBottom: Spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    ...Typography.subheading,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  status: {
    ...Typography.caption,
    fontWeight: '700',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  statusClaimed: {
    backgroundColor: Colors.successLight,
    color: Colors.primaryDeep,
  },
  statusPending: {
    backgroundColor: Colors.warningLight,
    color: Colors.warningDeep,
  },
  detail: {
    color: Colors.gray600,
    ...Typography.small,
    lineHeight: 20,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.white,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterTabActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  filterText: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: Colors.white,
  },
});

export default PurchasedGiftsScreen;
