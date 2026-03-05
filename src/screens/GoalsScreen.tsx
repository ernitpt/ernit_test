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
  Platform,
} from 'react-native';
import { Plus, Target, ChevronDown, ChevronUp, Trophy, Rocket } from 'lucide-react-native';
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
import CompletedGoalCard from './recipient/CompletedGoalCard';
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
  const [completedGoals, setCompletedGoals] = useState<Goal[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
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

        // Collect completed goals (fully done, not valentine-waiting)
        const finished = goals.filter((g) => {
          if (g.valentineChallengeId) return false; // valentine goals handled separately
          return g.isCompleted || g.currentCount >= g.targetCount;
        });
        // Sort by most recently created first
        finished.sort((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bDate - aDate;
        });
        setCompletedGoals(finished);
      } catch (error) {
        logger.error('Error processing goals in GoalsScreen:', error);
        // Show whatever goals we can rather than crashing
        setCurrentGoals([]);
        setCompletedGoals([]);
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

  const fabAnim = useRef(new Animated.Value(50)).current;
  const fabOpacity = useRef(new Animated.Value(0)).current;
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const fabRotation = useRef(new Animated.Value(0)).current;
  const menuItem1 = useRef(new Animated.Value(0)).current;
  const menuItem2 = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

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

  const toggleFabMenu = () => {
    const toOpen = !fabMenuOpen;
    setFabMenuOpen(toOpen);

    if (toOpen) {
      Animated.parallel([
        Animated.spring(fabRotation, { toValue: 1, damping: 14, stiffness: 160, useNativeDriver: true }),
        Animated.spring(menuItem1, { toValue: 1, damping: 14, stiffness: 140, useNativeDriver: true }),
        Animated.spring(menuItem2, { toValue: 1, damping: 14, stiffness: 140, delay: 50, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(fabRotation, { toValue: 0, damping: 14, stiffness: 160, useNativeDriver: true }),
        Animated.timing(menuItem1, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(menuItem2, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  };


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
        ) : currentGoals.length === 0 && completedGoals.length === 0 ? (
          /* ── Upgraded Empty State ── */
          <View style={styles.emptyContainer}>
            <MotiView
              from={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 14, stiffness: 120 }}
              style={styles.emptyIllustration}
            >
              <Text style={styles.emptyEmoji}>🚀</Text>
            </MotiView>
            <Text style={styles.emptyTitle}>Your journey starts here</Text>
            <Text style={styles.emptySubtitle}>
              Set a goal, pick a dream reward, and challenge yourself to earn it.
            </Text>
            <TouchableOpacity
              style={styles.emptyCTA}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('ChallengeSetup' as any)}
            >
              <Rocket color="#fff" size={18} strokeWidth={2.5} />
              <Text style={styles.emptyCTAText}>Create Your First Goal</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={currentGoals}
            renderItem={renderGoal}
            keyExtractor={(item) => item.id!}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.noActiveContainer}>
                <Text style={styles.noActiveText}>No active goals right now</Text>
                <TouchableOpacity
                  style={styles.noActiveCTA}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('ChallengeSetup' as any)}
                >
                  <Text style={styles.noActiveCTAText}>Start a New Challenge</Text>
                </TouchableOpacity>
              </View>
            }
            ListFooterComponent={completedGoals.length > 0 ? (
              <View style={styles.completedSection}>
                <TouchableOpacity
                  style={styles.completedHeader}
                  activeOpacity={0.7}
                  onPress={() => setShowCompleted((v) => !v)}
                >
                  <View style={styles.completedHeaderLeft}>
                    <Trophy color={Colors.primary} size={18} strokeWidth={2.5} />
                    <Text style={styles.completedHeaderText}>
                      Completed ({completedGoals.length})
                    </Text>
                  </View>
                  {showCompleted ? (
                    <ChevronUp color="#6b7280" size={20} />
                  ) : (
                    <ChevronDown color="#6b7280" size={20} />
                  )}
                </TouchableOpacity>

                {showCompleted && completedGoals.map((goal, idx) => (
                  <CompletedGoalCard key={goal.id} goal={goal} index={idx} />
                ))}
              </View>
            ) : null}
          />
        )}

        {/* ---------- FAB MENU ---------- */}
        {fabMenuOpen && (
          <Animated.View
            style={[styles.fabBackdrop, { opacity: backdropOpacity }]}
            pointerEvents={fabMenuOpen ? 'auto' : 'none'}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={toggleFabMenu}
            />
          </Animated.View>
        )}

        {/* Menu items (appear above the FAB) */}
        <Animated.View
          style={[
            styles.fabMenuColumn,
            {
              opacity: backdropOpacity,
              transform: [{ translateY: backdropOpacity.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}
          pointerEvents={fabMenuOpen ? 'auto' : 'none'}
        >
          <Animated.View style={{ opacity: menuItem1, transform: [{ scale: menuItem1 }] }}>
            <TouchableOpacity
              style={styles.fabMenuItem}
              activeOpacity={0.85}
              onPress={() => {
                toggleFabMenu();
                navigation.navigate('ChallengeSetup' as any);
              }}
            >
              <View style={[styles.fabMenuIconBg, { backgroundColor: Colors.primarySurface }]}>
                <Target color={Colors.primary} size={20} strokeWidth={2.5} />
              </View>
              <Text style={styles.fabMenuText}>Create New Goal</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={{ opacity: menuItem2, transform: [{ scale: menuItem2 }] }}>
            <TouchableOpacity
              style={styles.fabMenuItem}
              activeOpacity={0.85}
              onPress={() => {
                toggleFabMenu();
                navigation.navigate('RecipientFlow', { screen: 'CouponEntry' });
              }}
            >
              <View style={styles.fabMenuIconBg}>
                <Image source={require('../assets/icon.png')} style={styles.fabMenuLogo} />
              </View>
              <Text style={styles.fabMenuText}>Redeem Your Ernit</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        {/* Main FAB button */}
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
            style={[styles.fab, fabMenuOpen && styles.fabOpen]}
            activeOpacity={0.85}
            onPress={toggleFabMenu}
          >
            <Animated.View style={{
              transform: [{
                rotate: fabRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }),
              }],
            }}>
              <Plus color="#fff" size={28} strokeWidth={3} />
            </Animated.View>
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
  fabBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 90,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 30,
    right: 24,
    zIndex: 100,
  },
  fab: {
    backgroundColor: Colors.secondary,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabOpen: {
    backgroundColor: '#374151',
  },
  fabMenuColumn: {
    position: 'absolute',
    bottom: 100,
    right: 24,
    zIndex: 95,
    gap: 10,
    alignItems: 'flex-end',
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
    gap: 10,
  },
  fabMenuIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  fabMenuLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  fabMenuText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  listContainer: {
    padding: 20,
  },
  cardWrapper: {
    marginBottom: 16,
  },
  // ── Upgraded Empty State ──
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyIllustration: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyEmoji: {
    fontSize: 44,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  emptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.secondary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    shadowColor: Colors.secondary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  emptyCTAText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 50,
    fontSize: 16,
  },

  // ── No Active (but has completed) ──
  noActiveContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noActiveText: {
    fontSize: 15,
    color: '#9ca3af',
    marginBottom: 16,
  },
  noActiveCTA: {
    backgroundColor: Colors.primarySurface,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  noActiveCTAText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Completed Goals Section ──
  completedSection: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  completedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  completedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  completedHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  completedCard: {
    marginBottom: 10,
  },
});

export default GoalsScreen;
