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
import { MotiView } from 'moti';
import { GoalCardSkeleton } from '../components/SkeletonLoader';
import { useApp } from '../context/AppContext';
import { Goal, RootStackParamList } from '../types';
import { goalService } from '../services/GoalService';
import { experienceGiftService } from '../services/ExperienceGiftService';
import DetailedGoalCard from './recipient/DetailedGoalCard';
import MainScreen from './MainScreen';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, updateDoc, doc, getDoc, onSnapshot as onSnapshotFS } from 'firebase/firestore';
import { notificationService } from "../services/NotificationService";
import { userService } from "../services/userService";
import SharedHeader from '../components/SharedHeader';
import { logger } from '../utils/logger';
import { serializeNav } from '../utils/serializeNav';
import { ValentineUnlockModal } from '../components/ValentineUnlockModal';
import { userService as userSvc } from '../services/userService';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { logErrorToFirestore } from '../utils/errorLogger';
import Colors from '../config/colors';



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

  const buildValentineGift = async (goalData: Goal) => {
    if (!goalData.valentineChallengeId) return null;
    const challengeDoc = await getDoc(doc(db, 'valentineChallenges', goalData.valentineChallengeId));
    if (!challengeDoc.exists()) return null;
    const challengeData = challengeDoc.data();

    return {
      id: goalData.valentineChallengeId,
      experienceId: challengeData.experienceId,
      giverId: challengeData.purchaserUserId,
      giverName: challengeData.purchaserName || '',
      status: 'completed' as const,
      createdAt: challengeData.createdAt?.toDate() || new Date(),
      deliveryDate: new Date(),
      payment: challengeData.purchaseId || '',
      claimCode: '',
      isValentineChallenge: true,
      mode: challengeData.mode,
    };
  };

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
      try {
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

          // ?? Valentine goals
          // HIDE if completed (handles both old and new goals)
          if (g.isCompleted) {
            // Debug logging for Valentine goals
            if (g.valentineChallengeId) {
              console.log('?? Valentine Goal Filter:', {
                id: g.id,
                isCompleted: g.isCompleted,
                isFinished: g.isFinished,
                isUnlocked: g.isUnlocked,
                willShow: g.isFinished && !g.isUnlocked
              });
            }

            // Only show if actively waiting for partner (has isFinished but not isUnlocked)
            return g.isFinished && !g.isUnlocked;
          }

          // Show if still in progress (not completed yet)
          return true;
        });
        setCurrentGoals(activeGoals);
      } catch (error) {
        logger.error('Error processing goals in GoalsScreen:', error);
        // Show whatever goals we can rather than crashing
        setCurrentGoals([]);
      } finally {
        setLoading(false);
        setIsInitialLoading(false);
      }
    });

    return () => unsubscribe();
  }, [userId]);

  // ?? VALENTINE: Real-time listener for newly-unlocked goals
  // Uses onSnapshot instead of one-time getDocs so the popup fires
  // as soon as the partner unlocks the goal (even if GoalsScreen was already mounted)
  useEffect(() => {
    if (!userId) return;

    const goalsRef = collection(db, 'goals');
    const unlockedQuery = query(
      goalsRef,
      where('userId', '==', userId),
      where('isUnlocked', '==', true),
    );

    const unsubscribe = onSnapshotFS(unlockedQuery, async (snapshot) => {
      if (snapshot.empty) return;

      // Only process if we don't already have a modal showing
      if (showUnlockModal) return;

      // Filter client-side: skip goals where unlockShown is already true
      const unshownDoc = snapshot.docs.find(d => d.data().unlockShown !== true);
      if (!unshownDoc) return;

      const goalData = { id: unshownDoc.id, ...unshownDoc.data() } as Goal;

      // Must be a Valentine goal
      if (!goalData.valentineChallengeId) return;

      setUnlockedGoal(goalData);

      // Fetch partner name
      if (goalData.partnerGoalId) {
        try {
          const partnerGoalSnap = await getDoc(doc(db, 'goals', goalData.partnerGoalId));
          if (partnerGoalSnap.exists()) {
            const partnerGoalData = partnerGoalSnap.data();
            const name = await userSvc.getUserName(partnerGoalData.userId);
            setPartnerName(name || 'Your partner');
          }
        } catch (error) {
          logger.error('Error fetching partner name:', error);
        }
      }

      setShowUnlockModal(true);
      // NOTE: unlockShown is set in onClaim handler, not here,
      // so modal reappears if app crashes before user clicks "Claim Reward"
    });

    return () => unsubscribe();
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

      // ?? Valentine goals: completion navigation is handled in DetailedGoalCard's Path 1.
      // This callback only runs for NON-completed sessions (the else branch in handleFinish).
      // For Valentine goals, skip the experienceGift fetch since they don't have one.
      if (updatedGoal.valentineChallengeId) {
        // Valentine goals: no action needed here.
        // DetailedGoalCard handles all Valentine-specific navigation and modals.
        return;
      }

      // Free goals: navigate to FreeGoalCompletion instead
      if (updatedGoal.isFreeGoal) {
        if (updatedGoal.isCompleted) {
          navigation.navigate('FreeGoalCompletion', {
            goal: serializeNav(updatedGoal),
          });
        }
        return;
      }

      // Standard goals: If a week just completed and whole goal is done, navigate
      const experienceGift = await experienceGiftService.getExperienceGiftById(updatedGoal.experienceGiftId);

      if (updatedGoal.isCompleted) {
        navigation.navigate('Completion', {
          goal: serializeNav(updatedGoal),
          experienceGift: serializeNav(experienceGift),
        });
      }
      // Don't show Alert here - the hint popup from DetailedGoalCard already provides feedback
    } catch (err) {
      logger.error('Error finishing goal:', err);
      await logErrorToFirestore(err, {
        screenName: 'GoalsScreen',
        feature: 'FinishGoal',
        userId,
        additionalData: { goalId: updatedGoal.id }
      });
      Alert.alert('Error', 'Failed to update goal progress.');
    }
  };


  const renderGoal = ({ item }: { item: Goal }) => (
    <MotiView
      from={{ opacity: 0, translateY: 16 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 400 }}
      style={styles.cardWrapper}
    >
      <DetailedGoalCard
        key={item.id}
        goal={item}
        onFinish={(updated) => handleFinishGoal(updated)}
      />
    </MotiView>
  );
  return (
    <ErrorBoundary screenName="GoalsScreen" userId={userId}>
      <MainScreen activeRoute="Goals">
        <StatusBar style="light" />
        <SharedHeader
          title="Current Goals"
          subtitle="Tap goal for more details"
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

        {/* ?? VALENTINE: Unlock Celebration Modal */}
        <ValentineUnlockModal
          visible={showUnlockModal}
          partnerName={partnerName}
          onClaim={async () => {
            setShowUnlockModal(false);

            if (unlockedGoal) {
              // Mark as shown AFTER user actually interacts with the modal
              // (so it reappears if app crashes before they click "Claim Reward")
              try {
                await updateDoc(doc(db, 'goals', unlockedGoal.id), {
                  unlockShown: true,
                });
              } catch (error) {
                logger.error('Error marking unlock as shown:', error);
              }

              // Navigate to completion screen
              try {
                const experienceGift = await buildValentineGift(unlockedGoal);
                if (!experienceGift) {
                  logger.error('Valentine challenge not found for unlocked goal navigation');
                  return;
                }
                navigation.navigate('Completion', {
                  goal: serializeNav({ ...unlockedGoal, isUnlocked: true }),
                  experienceGift: serializeNav(experienceGift),
                });
              } catch (error) {
                logger.error('Error fetching Valentine challenge for unlocked goal:', error);
              }
            }
          }}
        />

      </MainScreen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 30,
    right: 24,
  },
  fab: {
    backgroundColor: Colors.secondary,
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
