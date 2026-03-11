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
  RefreshControl,
  Platform,
} from 'react-native';
import { Plus, Target, ChevronDown, ChevronUp, Trophy, Rocket } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { MotiView } from 'moti';
import { GoalCardSkeleton } from '../components/SkeletonLoader';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { Goal } from '../types';
import { useRootNavigation } from '../types/navigation';
import { goalService } from '../services/GoalService';
import { experienceGiftService } from '../services/ExperienceGiftService';
import DetailedGoalCard from './recipient/DetailedGoalCard';
import StreakBanner from './recipient/components/StreakBanner';
import CompletedGoalCard from './recipient/CompletedGoalCard';
import MainScreen from './MainScreen';
import SharedHeader from '../components/SharedHeader';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { logger } from '../utils/logger';
import { serializeNav } from '../utils/serializeNav';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { logErrorToFirestore } from '../utils/errorLogger';
import Colors from '../config/colors';
import { Typography } from '../config/typography';
import { Shadows } from '../config/shadows';
import ErrorRetry from '../components/ErrorRetry';
import * as Haptics from 'expo-haptics';



const GoalsScreen: React.FC = () => {
  const { state, dispatch } = useApp();
  const navigation = useRootNavigation();
  const { showError } = useToast();
  const userId = state.user?.id || 'current_user';

  const [currentGoals, setCurrentGoals] = useState<Goal[]>([]);
  const [completedGoals, setCompletedGoals] = useState<Goal[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [sessionStreak, setSessionStreak] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadGoals = () => {
    // Trigger re-render by forcing a re-mount of the listener
    setLoading(true);
    setError(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    loadGoals();
    refreshTimeoutRef.current = setTimeout(() => {
      setRefreshing(false);
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

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

  // Fetch user-level session streak
  useEffect(() => {
    if (!userId || userId === 'current_user') return;
    const fetchStreak = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', userId));
        if (userSnap.exists()) {
          setSessionStreak(userSnap.data().sessionStreak || 0);
        }
      } catch (error) {
        logger.error('Error fetching session streak:', error);
      }
    };
    fetchStreak();
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
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
              onPress={() => navigation.navigate('ChallengeSetup')}
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
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS !== 'web'}
            maxToRenderPerBatch={10}
            windowSize={5}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[Colors.secondary]}
                tintColor={Colors.secondary}
              />
            }
            ListHeaderComponent={sessionStreak >= 3 ? (
              <StreakBanner streak={sessionStreak} />
            ) : null}
            ListEmptyComponent={
              <View style={styles.noActiveContainer}>
                <Text style={styles.noActiveText}>No active goals right now</Text>
                <TouchableOpacity
                  style={styles.noActiveCTA}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('ChallengeSetup')}
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
                navigation.navigate('ChallengeSetup');
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
                <Image source={require('../assets/icon.png')} style={styles.fabMenuLogo} accessible={false} />
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
    ...Shadows.lg,
    shadowOpacity: 0.25,
  },
  fabOpen: {
    backgroundColor: Colors.gray700,
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
    ...Shadows.md,
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
    ...Typography.smallBold,
    color: Colors.gray800,
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
    ...Typography.heading2,
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
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
    ...Shadows.colored(Colors.secondary),
  },
  emptyCTAText: {
    color: '#fff',
    ...Typography.subheading,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textSecondary,
    marginTop: 50,
    ...Typography.subheading,
  },

  // ── No Active (but has completed) ──
  noActiveContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noActiveText: {
    ...Typography.body,
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
    ...Typography.smallBold,
  },

  // ── Completed Goals Section ──
  completedSection: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
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
    ...Typography.subheading,
    fontWeight: '700',
    color: Colors.gray700,
  },
  completedCard: {
    marginBottom: 10,
  },
});

export default GoalsScreen;
