import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Animated,
  LayoutAnimation,
  TouchableOpacity,
  Image,
  RefreshControl,
  Platform,
  UIManager,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}
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
import { FOOTER_HEIGHT } from '../components/FooterNavigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SharedHeader from '../components/SharedHeader';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { logger } from '../utils/logger';
import { serializeNav } from '../utils/serializeNav';
import { vh } from '../utils/responsive';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { logErrorToFirestore } from '../utils/errorLogger';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { Shadows } from '../config/shadows';
import ErrorRetry from '../components/ErrorRetry';
import Button from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import * as Haptics from 'expo-haptics';



const GoalsScreen: React.FC = () => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useApp();
  const navigation = useRootNavigation();
  const { showError, showInfo } = useToast();
  const userId = state.user?.id || '';

  const [currentGoals, setCurrentGoals] = useState<Goal[]>([]);
  const [completedGoals, setCompletedGoals] = useState<Goal[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [sessionStreak, setSessionStreak] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const isRefreshingRef = useRef(false);
  // S-02: Mounted guard — prevents stale setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // S-01: Auto-approve flag — prevents re-running on every snapshot
  const autoApproveRanRef = useRef(false);

  // Skeleton loader safety timeout: if isInitialLoading stays true for 15s,
  // force it off and show the error state so the user is never stuck on skeletons.
  useEffect(() => {
    if (!isInitialLoading) return;
    const timeout = setTimeout(() => {
      if (mountedRef.current && isInitialLoading) {
        setIsInitialLoading(false);
        setError(true);
      }
    }, 15000);
    return () => clearTimeout(timeout);
  }, [isInitialLoading]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    isRefreshingRef.current = true;
    setRefreshKey(prev => prev + 1); // Force listener re-subscribe
  }, []);

  const loadGoals = () => setRefreshKey(prev => prev + 1);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Reset auto-approve flag when re-subscribing (refresh or userId change)
    autoApproveRanRef.current = false;

    setLoading(true);
    const unsubscribe = goalService.listenToUserGoals(userId, (goals) => {
      // S-02: Ignore callbacks after unmount
      if (!mountedRef.current) return;

      try {
        setError(false);

        const activeGoals = goals.filter((g) => {
          return !g.isCompleted && g.currentCount < g.targetCount;
        });
        // Sort active goals by newest first
        activeGoals.sort((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bDate - aDate;
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

        // If this callback is the result of a pull-to-refresh, end the spinner and confirm freshness
        if (isRefreshingRef.current) {
          isRefreshingRef.current = false;
          setRefreshing(false);
          showInfo('Goals are up to date');
        }
      } catch (error: unknown) {
        logger.error('Error processing goals in GoalsScreen:', error);
        if (!mountedRef.current) return;
        setError(true);
        showError('Could not load goals. Please try again.');
        // Show whatever goals we can rather than crashing
        setCurrentGoals([]);
        setCompletedGoals([]);
        if (isRefreshingRef.current) {
          isRefreshingRef.current = false;
          setRefreshing(false);
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setIsInitialLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, [userId, refreshKey]);

  // S-01: Auto-approve runs once per subscription (not on every snapshot).
  // Debounced via a ref flag — resets when userId or refreshKey changes.
  useEffect(() => {
    if (!userId || currentGoals.length === 0 || autoApproveRanRef.current) return;
    autoApproveRanRef.current = true;

    const runAutoApprove = async () => {
      for (const goal of currentGoals) {
        if (goal.approvalStatus === 'pending' && goal.approvalDeadline && !goal.giverActionTaken) {
          const now = new Date();
          if (now >= goal.approvalDeadline) {
            try {
              await goalService.checkAndAutoApprove(goal.id);
            } catch (error: unknown) {
              logger.error('Error auto-approving goal:', error);
            }
          }
        }
      }
    };
    runAutoApprove();
  }, [userId, currentGoals, refreshKey]);

  // Fetch user-level session streak
  useEffect(() => {
    if (!userId || userId === 'current_user') return;
    const fetchStreak = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', userId));
        if (userSnap.exists()) {
          setSessionStreak(userSnap.data().sessionStreak || 0);
        }
      } catch (error: unknown) {
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


  const handleFinishGoal = useCallback(async (updatedGoal: Goal) => {
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
    } catch (err: unknown) {
      logger.error('Error finishing goal:', err);
      await logErrorToFirestore(err, {
        screenName: 'GoalsScreen',
        feature: 'FinishGoal',
        userId,
        additionalData: { goalId: updatedGoal.id }
      });
      showError('Failed to update goal progress.');
    }
  }, [navigation, showError, userId]);


  const renderGoal = useCallback(({ item }: { item: Goal }) => (
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
  ), [handleFinishGoal]);
  return (
    <ErrorBoundary screenName="GoalsScreen" userId={userId}>
      <MainScreen activeRoute="Goals">
        <StatusBar style="light" />
        <SharedHeader
          title="Current Goals"
          subtitle="Tap goal for more details"
        />
        <View accessibilityLiveRegion="polite" style={{ flex: 1 }}>
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
            <Button
              variant="primary"
              title="Create Your First Goal"
              icon={<Rocket color={colors.white} size={18} strokeWidth={2.5} />}
              onPress={() => navigation.navigate('ChallengeSetup')}
              style={styles.emptyCTA}
            />
          </View>
        ) : (
          <FlatList
            data={currentGoals}
            renderItem={renderGoal}
            keyExtractor={(item) => item.id!}
            contentContainerStyle={styles.listContainer}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS !== 'web'}
            initialNumToRender={5}
            maxToRenderPerBatch={10}
            windowSize={5}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[colors.secondary]}
                tintColor={colors.secondary}
              />
            }
            ListHeaderComponent={currentGoals.length > 0 ? (
              <StreakBanner
                streak={sessionStreak}
                weeklyDone={currentGoals.reduce((acc, g) => acc + (g.weeklyCount || 0), 0)}
                weeklyTarget={currentGoals.reduce((acc, g) => acc + (g.sessionsPerWeek || 0), 0)}
              />
            ) : null}
            ListEmptyComponent={
              <View style={{ flex: 1, justifyContent: 'center', minHeight: vh(50) }}>
                <EmptyState
                  title="No active goals right now"
                  actionLabel="Start a New Challenge"
                  onAction={() => navigation.navigate('ChallengeSetup')}
                />
              </View>
            }
            ListFooterComponent={completedGoals.length > 0 ? (
              <View style={styles.completedSection}>
                <TouchableOpacity
                  style={styles.completedHeader}
                  activeOpacity={0.7}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setShowCompleted((v) => !v);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${showCompleted ? 'Hide' : 'Show'} ${completedGoals.length} completed goals`}
                >
                  <View style={styles.completedHeaderLeft}>
                    <Trophy color={colors.primary} size={18} strokeWidth={2.5} />
                    <Text style={styles.completedHeaderText}>
                      Completed ({completedGoals.length})
                    </Text>
                  </View>
                  {showCompleted ? (
                    <ChevronUp color={colors.textSecondary} size={20} />
                  ) : (
                    <ChevronDown color={colors.textSecondary} size={20} />
                  )}
                </TouchableOpacity>

                {showCompleted && completedGoals.map((goal, idx) => (
                  <CompletedGoalCard key={goal.id} goal={goal} index={idx} />
                ))}
              </View>
            ) : null}
          />
        )}
        </View>

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
              bottom: 100 + FOOTER_HEIGHT + insets.bottom,
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
                if (currentGoals.length >= 3) {
                  showInfo('You can have up to 3 active goals. Complete or remove a goal to create a new one.');
                  return;
                }
                navigation.navigate('ChallengeSetup');
              }}
              accessibilityRole="button"
              accessibilityLabel="Create new goal"
            >
              <View style={[styles.fabMenuIconBg, { backgroundColor: colors.primarySurface }]}>
                <Target color={colors.primary} size={20} strokeWidth={2.5} />
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
              bottom: 30 + FOOTER_HEIGHT + insets.bottom,
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
              <Plus color={colors.white} size={28} strokeWidth={3} />
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>

      </MainScreen>
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  fabBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayLight,
    zIndex: 90,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 30 + FOOTER_HEIGHT,
    right: Spacing.xxl,
    zIndex: 100,
  },
  fab: {
    backgroundColor: colors.secondary,
    width: 60,
    height: 60,
    borderRadius: BorderRadius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.lg,
    shadowOpacity: 0.25,
  },
  fabOpen: {
    backgroundColor: colors.gray700,
  },
  fabMenuColumn: {
    position: 'absolute',
    bottom: 100 + FOOTER_HEIGHT,
    right: Spacing.xxl,
    zIndex: 95,
    gap: Spacing.sm,
    alignItems: 'flex-end',
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    ...Shadows.md,
    gap: Spacing.sm,
  },
  fabMenuIconBg: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  fabMenuLogo: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
  },
  fabMenuText: {
    ...Typography.smallBold,
    color: colors.gray800,
  },
  listContainer: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xl + FOOTER_HEIGHT,
  },
  cardWrapper: {
    marginBottom: Spacing.lg,
  },
  // ── Upgraded Empty State ──
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.huge,
    paddingBottom: Spacing.xxl,
  },
  emptyTitle: {
    ...Typography.heading2,
    color: colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...Typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: vh(24),
  },
  emptyCTA: {
    paddingHorizontal: Spacing.xxl,
  },
  // ── Completed Goals Section ──
  completedSection: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  completedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  completedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  completedHeaderText: {
    ...Typography.heading3,
    color: colors.gray700,
  },
});

export default GoalsScreen;
