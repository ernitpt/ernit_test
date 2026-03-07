import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Animated,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Plus, Target, ChevronDown, ChevronUp, Trophy, Rocket } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MotiView } from 'moti';
import { GoalCardSkeleton } from '../components/SkeletonLoader';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { Goal, RootStackParamList } from '../types';
import { goalService } from '../services/GoalService';
import { experienceGiftService } from '../services/ExperienceGiftService';
import DetailedGoalCard from './recipient/DetailedGoalCard';
import CompletedGoalCard from './recipient/CompletedGoalCard';
import MainScreen from './MainScreen';
import SharedHeader from '../components/SharedHeader';
import { logger } from '../utils/logger';
import { serializeNav } from '../utils/serializeNav';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { logErrorToFirestore } from '../utils/errorLogger';
import Colors from '../config/colors';
import ErrorRetry from '../components/ErrorRetry';



type GoalsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Goals'>;

const GoalsScreen: React.FC = () => {
  const { state, dispatch } = useApp();
  const navigation = useNavigation<GoalsScreenNavigationProp>();
  const { showError } = useToast();
  const userId = state.user?.id || 'current_user';

  const [currentGoals, setCurrentGoals] = useState<Goal[]>([]);
  const [completedGoals, setCompletedGoals] = useState<Goal[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const loadGoals = () => {
    // Trigger re-render by forcing a re-mount of the listener
    setLoading(true);
    setError(false);
  };

  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    const unsubscribe = goalService.listenToUserGoals(userId, async (goals) => {
      try {
        setError(false);
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
          return !g.isCompleted && g.currentCount < g.targetCount;
        });
        setCurrentGoals(activeGoals);

        // Collect completed goals
        const finished = goals.filter((g) => {
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
        setError(true);
        showError('Could not load goals. Please try again.');
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
      // Don't show toast here - the hint popup from DetailedGoalCard already provides feedback
    } catch (err) {
      logger.error('Error finishing goal:', err);
      await logErrorToFirestore(err, {
        screenName: 'GoalsScreen',
        feature: 'FinishGoal',
        userId,
        additionalData: { goalId: updatedGoal.id }
      });
      showError('Failed to update goal progress.');
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
        ) : error && currentGoals.length === 0 && completedGoals.length === 0 ? (
          <ErrorRetry message="Could not load goals" onRetry={loadGoals} />
        ) : currentGoals.length === 0 && completedGoals.length === 0 ? (
          /* ── Upgraded Empty State ── */
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Your journey starts here</Text>
            <Text style={styles.emptySubtitle}>
              Set a goal, pick a dream reward, and challenge yourself to earn it.
            </Text>
            <TouchableOpacity
              style={styles.emptyCTA}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('ChallengeSetup' as any)}
              accessibilityRole="button"
              accessibilityLabel="Create your first goal"
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
                  accessibilityRole="button"
                  accessibilityLabel={`${showCompleted ? 'Hide' : 'Show'} ${completedGoals.length} completed goals`}
                >
                  <View style={styles.completedHeaderLeft}>
                    <Trophy color={Colors.primary} size={18} strokeWidth={2.5} />
                    <Text style={styles.completedHeaderText}>
                      Completed ({completedGoals.length})
                    </Text>
                  </View>
                  {showCompleted ? (
                    <ChevronUp color={Colors.textSecondary} size={20} />
                  ) : (
                    <ChevronDown color={Colors.textSecondary} size={20} />
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
              accessibilityRole="button"
              accessibilityLabel="Create new goal"
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
              accessibilityRole="button"
              accessibilityLabel="Redeem your Ernit coupon"
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
            accessibilityRole="button"
            accessibilityLabel={fabMenuOpen ? "Close menu" : "Open menu to create goal or redeem coupon"}
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
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
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
    color: Colors.textSecondary,
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
    color: Colors.textMuted,
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
