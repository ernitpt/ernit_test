import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useApp } from '../context/AppContext';
import MainScreen from './MainScreen';
import { experienceGiftService } from '../services/ExperienceGiftService';
import { experienceService } from '../services/ExperienceService';
import { userService } from '../services/userService';
import { ExperienceGift, RootStackParamList } from '../types';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import SharedHeader from '../components/SharedHeader';
import { GiftCardSkeleton, SkeletonBox } from '../components/SkeletonLoader';
import { logger } from '../utils/logger';
import Colors from '../config/colors';

type PurchasedGiftsNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'PurchasedGifts'
>;

// ------------------------------------------------------------------
// Helper Functions and Components (moved outside parent for performance)
// ------------------------------------------------------------------

const formatDate = (date: any) => {
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
  const [experience, setExperience] = useState<any>(null);

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
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`View gift details for ${experience ? experience.title : 'experience'}. Status: ${item.status}`}
    >
      <View style={styles.card}>
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
          <Text style={[styles.detail, { color: '#166534', fontWeight: '500' }]}>
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
      </View>
    </TouchableOpacity>
  );
};

const PurchasedGiftsScreen = () => {
  const { state } = useApp();
  const userId = state.user?.id;
  const [gifts, setGifts] = useState<ExperienceGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'claimed'>('all');
  const navigation = useNavigation<PurchasedGiftsNavigationProp>();

  useEffect(() => {
    const fetchGifts = async () => {
      if (!userId) return;
      setLoading(true);
      try {
        const userGifts = await experienceGiftService.getExperienceGiftsByUser(userId);
        setGifts(userGifts);
      } catch (error) {
        logger.error('Error fetching purchased gifts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGifts();
  }, [userId]);

  // Filter gifts based on selected filter
  const filteredGifts = gifts.filter(gift => {
    if (filterStatus === 'all') return true;
    return gift.status === filterStatus;
  });

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
          onPress={() => setFilterStatus('all')}
          accessibilityRole="button"
          accessibilityLabel={`Show all ${gifts.length} gifts`}
        >
          <Text style={[styles.filterText, filterStatus === 'all' && styles.filterTextActive]}>
            All ({gifts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filterStatus === 'pending' && styles.filterTabActive]}
          onPress={() => setFilterStatus('pending')}
          accessibilityRole="button"
          accessibilityLabel={`Show ${gifts.filter(g => g.status === 'pending').length} pending gifts`}
        >
          <Text style={[styles.filterText, filterStatus === 'pending' && styles.filterTextActive]}>
            Pending ({gifts.filter(g => g.status === 'pending').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filterStatus === 'claimed' && styles.filterTabActive]}
          onPress={() => setFilterStatus('claimed')}
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
      ) : filteredGifts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🎁</Text>
          <Text style={styles.emptyTitle}>
            {filterStatus === 'all' ? 'No Gifts Yet' : `No ${filterStatus} Gifts`}
          </Text>
          <Text style={styles.emptyText}>
            {filterStatus === 'all'
              ? 'Purchase a gift to empower someone special!'
              : `No gifts with status "${filterStatus}"`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredGifts}
          renderItem={({ item }) => <GiftItem item={item} />}
          keyExtractor={(item) => item.id!}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </MainScreen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  listContainer: {
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    padding: 16,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 10,
  },
  status: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  statusClaimed: {
    backgroundColor: '#DCFCE7',
    color: '#166534',
  },
  statusPending: {
    backgroundColor: '#FEF9C3',
    color: '#854D0E',
  },
  detail: {
    color: '#4b5563',
    fontSize: 14,
    lineHeight: 20,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterTabActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
});

export default PurchasedGiftsScreen;
