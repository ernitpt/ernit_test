import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import MainScreen from './MainScreen';
import { experienceGiftService } from '../services/ExperienceGiftService';
import { experienceService } from '../services/ExperienceService';
import { userService } from '../services/userService';
import { ExperienceGift, RootStackParamList } from '../types';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import SharedHeader from '../components/SharedHeader';

type PurchasedGiftsNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'PurchasedGifts'
>;

const PurchasedGiftsScreen = () => {
  const { state } = useApp();
  const userId = state.user?.id;
  const [gifts, setGifts] = useState<ExperienceGift[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<PurchasedGiftsNavigationProp>();

  useEffect(() => {
    const fetchGifts = async () => {
      if (!userId) return;
      setLoading(true);
      const userGifts = await experienceGiftService.getExperienceGiftsByUser(userId);
      setGifts(userGifts);
      setLoading(false);
    };

    fetchGifts();
  }, [userId]);

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
          console.error(`❌ Error fetching claimer for gift ${item.id}:`, err);
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
          console.error("Error fetching experience:", error);
        }
      };
      fetchExperience();
    }, [item.experienceId]);

    const handlePress = () => {
      navigation.navigate("Confirmation", { experienceGift: item });
    };

    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.title}>
              {experience ? experience.title : "Loading..."}
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
                <Text style={{ color: '#9CA3AF' }}>Fetching name...</Text>
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

  return (
    <MainScreen activeRoute="Settings">
      <StatusBar style="light" />
      <SharedHeader
        title="Purchased Gifts"
        showBack
      />

      {loading ? (
        <ActivityIndicator
          size="large"
          color="#8b5cf6"
          style={{ marginTop: 50 }}
        />
      ) : gifts.length === 0 ? (
        <Text style={styles.emptyText}>No purchased gifts yet.</Text>
      ) : (
        <FlatList
          data={gifts}
          renderItem={({ item }) => <GiftItem item={item} />}
          keyExtractor={(item) => item.id!}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </MainScreen>
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
    borderColor: '#e5e7eb',
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
    color: '#111827',
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
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 50,
    fontSize: 16,
  },
});

export default PurchasedGiftsScreen;
