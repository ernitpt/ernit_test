import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLocalDate } from '../utils/i18nHelpers';
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
import { experienceGiftService } from '../services/ExperienceGiftService';
import { experienceService } from '../services/ExperienceService';
import { userService } from '../services/userService';
import { ExperienceGift, Experience, RootStackParamList } from '../types';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import SharedHeader from '../components/SharedHeader';
import { GiftCardSkeleton, SkeletonBox, ListItemSkeleton } from '../components/SkeletonLoader';
import { logger } from '../utils/logger';
import { Colors, useColors } from '../config';
import { Typography } from '../config/typography';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { MotiView } from 'moti';
import { EmptyState } from '../components/EmptyState';
import { Card } from '../components/Card';
import { toJSDate } from '../utils/GoalHelpers';
import { FOOTER_HEIGHT } from '../components/CustomTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { analyticsService } from '../services/AnalyticsService';

type PurchasedGiftsNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'PurchasedGifts'
>;

// ------------------------------------------------------------------
// Helper Functions and Components (moved outside parent for performance)
// ------------------------------------------------------------------

// Note: experience caching is handled by ExperienceService's built-in TTL cache.

// formatDate replaced by formatLocalDate from i18nHelpers

const GiftItem = ({ item }: { item: ExperienceGift }) => {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<PurchasedGiftsNavigationProp>();
  const [claimedByName, setClaimedByName] = useState<string | null>(null);
  const [loadingName, setLoadingName] = useState(false);
  const [experience, setExperience] = useState<Experience | null>(null);

  useEffect(() => {
    let mounted = true;
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
            if (mounted) setClaimedByName(name);
          }
        }
      } catch (err: unknown) {
        logger.error(`? Error fetching claimer for gift ${item.id}:`, err);
      } finally {
        if (mounted) setLoadingName(false);
      }
    };

    fetchClaimerName();
    return () => { mounted = false; };
  }, [item.status, item.id]);

  useEffect(() => {
    if (!item.experienceId) {
      // Category-only gift - no experience to fetch
      return;
    }
    let mounted = true;
    const fetchExperience = async () => {
      try {
        const exp = await experienceService.getExperienceById(item.experienceId);
        if (mounted && exp) {
          setExperience(exp);
        }
      } catch (error: unknown) {
        logger.error("Error fetching experience:", error);
      }
    };
    fetchExperience();
    return () => { mounted = false; };
  }, [item.experienceId]);

  const handlePress = useCallback(() => {
    navigation.navigate('Confirmation', {
      experienceGift: item,
      isCategory: !item.experienceId,
    });
  }, [navigation, item]);

  return (
    <Card
      variant="outlined"
      onPress={handlePress}
      style={styles.card}
      accessibilityLabel={t('giver.purchasedGifts.cardAccessibility', { title: experience ? experience.title : item.preferredRewardCategory || t('giver.purchasedGifts.experience'), status: item.status })}
    >
      <View style={styles.cardRow}>
        {experience || !item.experienceId ? (
          <Text style={styles.title}>
            {experience
              ? experience.title
              : item.preferredRewardCategory
                ? item.preferredRewardCategory.charAt(0).toUpperCase() + item.preferredRewardCategory.slice(1)
                : t('giver.purchasedGifts.surpriseExperience')}
          </Text>
        ) : (
          <SkeletonBox width={120} height={16} borderRadius={4} />
        )}
        <Text
          style={[
            styles.status,
            item.status === 'claimed' ? styles.statusClaimed : item.status === 'expired' ? styles.statusExpired : styles.statusPending,
          ]}
        >
          {item.status === 'expired' ? t('giver.purchasedGifts.status.expired') : item.status ? item.status.toUpperCase() : t('giver.purchasedGifts.status.pending')}
        </Text>
      </View>

      {item.status === 'claimed' ? (
        loadingName ? (
          <SkeletonBox width={80} height={14} borderRadius={4} />
        ) : (
          <Text style={[styles.detail, { color: colors.primaryDeep, fontWeight: '500' }]}>
            {t('giver.purchasedGifts.claimedBy', { name: claimedByName || t('giver.purchasedGifts.unknown') })}
          </Text>
        )
      ) : (
        <Text style={styles.detail}>{t('giver.purchasedGifts.claimCode', { code: item.claimCode })}</Text>
      )}

      <Text style={styles.detail}>{t('giver.purchasedGifts.created', { date: item.createdAt ? formatLocalDate(toJSDate(item.createdAt) ?? new Date(item.createdAt as string | number | Date), { month: 'short', day: 'numeric', year: 'numeric' }) : t('giver.purchasedGifts.na') })}</Text>
    </Card>
  );
};

const PurchasedGiftsScreen = () => {
  const { t } = useTranslation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { state } = useApp();
  const userId = state.user?.id;
  const [gifts, setGifts] = useState<ExperienceGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'claimed'>('all');
  const [error, setError] = useState(false);
  const [displayCount, setDisplayCount] = useState(20);
  const navigation = useNavigation<PurchasedGiftsNavigationProp>();

  const fetchGifts = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    try {
      const { gifts: userGifts } = await experienceGiftService.getExperienceGiftsByUser(userId);
      setGifts(userGifts);
      setError(false);
    } catch (error: unknown) {
      logger.error('Error fetching purchased gifts:', error);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchGifts();
  }, [fetchGifts]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchGifts();
    } finally {
      setRefreshing(false);
    }
  }, [fetchGifts]);

  // Screen-view enrichment
  useEffect(() => {
    if (loading) return;
    const claimedCount = gifts.filter(g => g.status === 'claimed').length;
    const pendingCount = gifts.filter(g => g.status === 'pending').length;
    analyticsService.trackEvent('screen_view', 'navigation', { giftCount: gifts.length, claimedCount, pendingCount }, 'PurchasedGiftsScreen');
  }, [loading]);

  // Filter gifts based on selected filter
  const filteredGifts = useMemo(() => gifts.filter(gift => {
    if (filterStatus === 'all') return true;
    return gift.status === filterStatus;
  }), [gifts, filterStatus]);

  // Reset display count when filter changes
  const handleFilterChange = useCallback((status: 'all' | 'pending' | 'claimed') => {
    analyticsService.trackEvent('button_click', 'engagement', { buttonName: 'filter_gifts', filterStatus: status }, 'PurchasedGiftsScreen');
    setFilterStatus(status);
    setDisplayCount(20);
  }, []);

  const renderGiftItem = useCallback(({ item, index }: { item: ExperienceGift; index: number }) => (
    <MotiView
      from={{ translateY: 12 }}
      animate={{ translateY: 0 }}
      transition={{ type: 'timing', duration: 300, delay: index * 60 }}
      style={{ backgroundColor: colors.surface }}
    >
      <GiftItem item={item} />
    </MotiView>
  ), []);

  const handleLoadMore = useCallback(() => {
    setDisplayCount(prev => Math.min(prev + 20, filteredGifts.length));
  }, [filteredGifts.length]);

  return (
    <ErrorBoundary screenName="PurchasedGiftsScreen" userId={state.user?.id}>
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <StatusBar style="light" />
        <SharedHeader
          title={t('giver.purchasedGifts.screenTitle')}
          showBack
        />

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTab, filterStatus === 'all' && styles.filterTabActive]}
          onPress={() => handleFilterChange('all')}
          accessibilityRole="button"
          accessibilityLabel={t('giver.purchasedGifts.filter.allAccessibility', { count: gifts.length })}
        >
          <Text style={[styles.filterText, filterStatus === 'all' && styles.filterTextActive]} numberOfLines={1}>
            {t('giver.purchasedGifts.filter.all', { count: gifts.length })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filterStatus === 'pending' && styles.filterTabActive]}
          onPress={() => handleFilterChange('pending')}
          accessibilityRole="button"
          accessibilityLabel={t('giver.purchasedGifts.filter.pendingAccessibility', { count: gifts.filter(g => g.status === 'pending').length })}
        >
          <Text style={[styles.filterText, filterStatus === 'pending' && styles.filterTextActive]} numberOfLines={1}>
            {t('giver.purchasedGifts.filter.pending', { count: gifts.filter(g => g.status === 'pending').length })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filterStatus === 'claimed' && styles.filterTabActive]}
          onPress={() => handleFilterChange('claimed')}
          accessibilityRole="button"
          accessibilityLabel={t('giver.purchasedGifts.filter.claimedAccessibility', { count: gifts.filter(g => g.status === 'claimed').length })}
        >
          <Text style={[styles.filterText, filterStatus === 'claimed' && styles.filterTextActive]} numberOfLines={1}>
            {t('giver.purchasedGifts.filter.claimed', { count: gifts.filter(g => g.status === 'claimed').length })}
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
          message={t('giver.purchasedGifts.error.couldNotLoad')}
          onRetry={fetchGifts}
        />
      ) : filteredGifts.length === 0 ? (
        <EmptyState
          title={filterStatus === 'all' ? t('giver.purchasedGifts.empty.title') : t('giver.purchasedGifts.empty.filteredTitle', { status: filterStatus })}
          message={filterStatus === 'all' ? t('giver.purchasedGifts.empty.message') : undefined}
        />
      ) : (
        <FlatList
          data={filteredGifts.slice(0, displayCount)}
          renderItem={renderGiftItem}
          keyExtractor={(item) => item.id!}
          initialNumToRender={6}
          contentContainerStyle={[styles.listContainer, { paddingBottom: Spacing.xl + FOOTER_HEIGHT + insets.bottom }]}
          removeClippedSubviews={Platform.OS !== 'web'}
          maxToRenderPerBatch={10}
          windowSize={5}
          getItemLayout={(data, index) => ({ length: 120, offset: 120 * index, index })}
          onEndReached={handleLoadMore}
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
              colors={[colors.secondary]}
              tintColor={colors.secondary}
            />
          }
        />
      )}
      </View>
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  listContainer: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xl + FOOTER_HEIGHT,
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
    color: colors.textPrimary,
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
    backgroundColor: colors.successLight,
    color: colors.primaryDeep,
  },
  statusPending: {
    backgroundColor: colors.warningLight,
    color: colors.warningDeep,
  },
  statusExpired: {
    backgroundColor: colors.backgroundLight,
    color: colors.gray600,
  },
  detail: {
    color: colors.gray600,
    ...Typography.small,
    lineHeight: 20,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.white,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTabActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  filterText: {
    ...Typography.smallBold,
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.white,
  },
});

export default PurchasedGiftsScreen;
