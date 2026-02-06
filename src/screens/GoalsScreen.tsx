import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GoalCardSkeleton } from '../components/SkeletonLoader';
import { useApp } from '../context/AppContext';
import { Goal, RootStackParamList } from '../types';
import { goalService } from '../services/GoalService';
import { experienceGiftService } from '../services/ExperienceGiftService';
import DetailedGoalCard from './recipient/DetailedGoalCard';
import MainScreen from './MainScreen';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { notificationService } from "../services/NotificationService";
import { userService } from "../services/userService";
import SharedHeader from '../components/SharedHeader';
import { logger } from '../utils/logger';
import { ValentineUnlockModal } from '../components/ValentineUnlockModal';
import { userService as userSvc } from '../services/userService';


type GoalsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Goals'>;

const GoalsScreen: React.FC = () => {
  const { state, dispatch } = useApp();
  const navigation = useNavigation<GoalsScreenNavigationProp>();
  const userId = state.user?.id || 'current_user';

  const [currentGoals, setCurrentGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockedGoal, setUnlockedGoal] = useState<Goal | null>(null);
  const [partnerName, setPartnerName] = useState<string>('');

  const updateGiftStatus = async (experienceGiftId: string) => {
    try {
      // Query the experienceGifts collection for the document where the field 'id' equals your experienceGift.id
      const q = query(
        collection(db, 'experienceGifts'),
        where('id', '==', experienceGiftId)
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        logger.log('No matching gift found');
        return;
      }

      // There should only be one document matching this id
      const giftDoc = querySnapshot.docs[0];

      // Update status to 'completed'
      await updateDoc(doc(db, 'experienceGifts', giftDoc.id), {
        status: 'completed',
      });

      logger.log('Gift status updated successfully');
    } catch (error) {
      logger.error('Failed to update gift status:', error);
    }
  };



  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    const unsubscribe = goalService.listenToUserGoals(userId, async (goals) => {
      // Check for pending goals that need auto-approval
      for (const goal of goals) {
        if (goal.approvalStatus === 'pending' && goal.approvalDeadline && !goal.giverActionTaken) {
          const now = new Date();
          if (now >= goal.approvalDeadline) {
            try {
              await goalService.checkAndAutoApprove(goal.id);
            } catch (error) {
              logger.error('Error auto-approving goal:', error);
            }
          }
        }
      }

      const activeGoals = goals.filter((g) => {
        // Regular goals: show if not completed
        if (!g.valentineChallengeId) {
          return !g.isCompleted && g.currentCount < g.targetCount;
        }

        // 💝 Valentine goals
        // HIDE if completed (handles both old and new goals)
        if (g.isCompleted) {
          // Debug logging for Valentine goals
          if (g.valentineChallengeId) {
            console.log('🔍 Valentine Goal Filter:', {
              id: g.id,
              isCompleted: g.isCompleted,
              isFinished: g.isFinished,
              isUnlocked: g.isUnlocked,
              willShow: g.isFinished && !g.isUnlocked
            });
          }

          // Only show if actively waiting for partner (has isFinished but not isUnlocked)
          // This handles NEW goals with the waiting state
          // OLD goals without these fields will be hidden
          return g.isFinished && !g.isUnlocked;
        }

        // Show if still in progress (not completed yet)
        return true;
      });
      setCurrentGoals(activeGoals);
      setLoading(false);
      setIsInitialLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // 💝 VALENTINE: Check for newly-unlocked goals on screen focus
  useEffect(() => {
    const checkUnlockedGoals = async () => {
      if (!userId) return;

      try {
        const goalsRef = collection(db, 'goals');
        const unlockedQuery = query(
          goalsRef,
          where('userId', '==', userId),
          where('valentineChallengeId', '!=', null),
          where('isUnlocked', '==', true),
          where('unlockShown', '!=', true)
        );

        const snapshot = await getDocs(unlockedQuery);

        if (!snapshot.empty) {
          const goalData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Goal;
          setUnlockedGoal(goalData);

          // Fetch partner name
          if (goalData.partnerGoalId) {
            const partnerGoalDoc = await getDocs(
              query(collection(db, 'goals'), where('id', '==', goalData.partnerGoalId))
            );
            if (!partnerGoalDoc.empty) {
              const partnerGoalData = partnerGoalDoc.docs[0].data();
              const name = await userSvc.getUserName(partnerGoalData.userId);
              setPartnerName(name || 'Your partner');
            }
          }

          setShowUnlockModal(true);

          // Mark as shown
          await updateDoc(doc(db, 'goals', goalData.id), {
            unlockShown: true
          });
        }
      } catch (error) {
        logger.error('Error checking unlocked goals:', error);
      }
    };

    checkUnlockedGoals();
  }, [userId]);

  const fabAnim = useRef(new Animated.Value(50)).current; // starts 50px below
  const fabOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(fabAnim, {
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(fabOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);


  const handleFinishGoal = async (updatedGoal: Goal) => {
    try {
      // NO! DetailedGoalCard already calls tickWeeklySession.
      // We just need to handle the UI/Navigation consequences.
      // const updated = await goalService.tickWeeklySession(goal.id); <-- CAUSE OF DOUBLE INCREMENT

      // If a week just completed and whole goal is done, navigate
      const experienceGift = await experienceGiftService.getExperienceGiftById(updatedGoal.experienceGiftId);

      if (updatedGoal.isCompleted) {
        navigation.navigate('Completion', {
          goal: updatedGoal,
          experienceGift,
        });
      }
      // Don't show Alert here - the hint popup from DetailedGoalCard already provides feedback
    } catch (err) {
      logger.error('Error finishing goal:', err);
      Alert.alert('Error', 'Failed to update goal progress.');
    }
  };


  const renderGoal = ({ item }: { item: Goal }) => (
    <View style={styles.cardWrapper}>
      <DetailedGoalCard
        key={item.id}
        goal={item}
        onFinish={(updated) => handleFinishGoal(updated)}
      />
    </View>
  );
  return (
    <MainScreen activeRoute="Goals">
      <StatusBar style="light" />
      <SharedHeader
        title="Current Goals"
        subtitle="Tap goal to for more details"
      />
      {isInitialLoading ? (
        <ScrollView contentContainerStyle={styles.listContainer}>
          <GoalCardSkeleton />
          <GoalCardSkeleton />
        </ScrollView>
      ) : currentGoals.length === 0 ? (
        <Text style={styles.emptyText}>No active goals yet.</Text>
      ) : (
        <FlatList
          data={currentGoals}
          renderItem={renderGoal}
          keyExtractor={(item) => item.id!}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No active goals yet.</Text>
          }
        />
      )}

      {/* ---------- FLOATING REDEEM COUPON BUTTON ---------- */}
      <Animated.View
        style={[
          styles.fabContainer,
          {
            transform: [{ translateY: fabAnim }],
            opacity: fabOpacity,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('RecipientFlow', { screen: 'CouponEntry' })}
        >
          <Image
            source={require('../assets/icon.png')}
            style={styles.fabIcon}
            resizeMode="contain"
          />
          <Text style={styles.fabText}>Redeem your Ernit</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* 💝 VALENTINE: Unlock Celebration Modal */}
      <ValentineUnlockModal
        visible={showUnlockModal}
        partnerName={partnerName}
        onClaim={async () => {
          setShowUnlockModal(false);

          // Navigate to completion screen
          if (unlockedGoal) {
            try {
              const experienceGift = await experienceGiftService.getExperienceGiftById(
                unlockedGoal.experienceGiftId
              );
              navigation.navigate('Completion', {
                goal: unlockedGoal,
                experienceGift,
              });
            } catch (error) {
              logger.error('Error fetching experience gift for unlocked goal:', error);
            }
          }
        }}
      />

    </MainScreen>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 30,
    right: 24,
  },
  fab: {
    backgroundColor: '#8b5cf6',
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabIcon: {
    width: 28,
    height: 28,
    marginRight: 10,
  },
  fabText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  listContainer: {
    padding: 20,
  },
  cardWrapper: {
    marginBottom: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 50,
    fontSize: 16,
  },
});

export default GoalsScreen;
