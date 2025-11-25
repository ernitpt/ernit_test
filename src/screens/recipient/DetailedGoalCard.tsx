import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Pressable,
  Easing,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Goal } from '../../types';
import { goalService } from '../../services/GoalService';
import { userService } from '../../services/userService';
import { notificationService } from '../../services/NotificationService';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { experienceService } from '../../services/ExperienceService';
import { RootStackParamList } from '../../types';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import HintPopup from '../../components/HintPopup';
import { aiHintService } from '../../services/AIHintService';
import { useApp } from '../../context/AppContext';

interface DetailedGoalCardProps {
  goal: Goal;
  onFinish?: (goal: Goal) => void;
}

const DEBUG_ALLOW_MULTIPLE_PER_DAY = false;
const TIMER_STORAGE_KEY = 'goal_timer_state_';

function isoDay(d: Date) {
  const local = new Date(d);
  local.setHours(0, 0, 0, 0);
  const y = local.getFullYear();
  const m = `${local.getMonth() + 1}`.padStart(2, '0');
  const dd = `${local.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(d.getDate() + days);
  x.setHours(0, 0, 0, 0);
  return x;
}

function rollingWeek(start: Date) {
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

function day2(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
}

function formatNextWeekDay(weekStartAt?: Date | null) {
  if (!weekStartAt) return '';
  const next = new Date(weekStartAt);
  next.setDate(next.getDate() + 7);
  return next.toLocaleDateString('en-US', { dateStyle: 'short' });
}

/** Check if a goal is locked (pending approval or has a suggested change) */
function isGoalLocked(goal: Goal): boolean {
  return goal.approvalStatus === 'pending' || goal.approvalStatus === 'suggested_change';
}

// Helper to format target duration (e.g. "1 hr 30 min" or "45 min")
function formatDurationDisplay(h: number = 0, m: number = 0) {
  const parts = [];
  if (h > 0) parts.push(`${h} hr`);
  if (m > 0) parts.push(`${m} min`);
  return parts.length > 0 ? parts.join(' ') : '0 min';
}

const COLORS = {
  purple: '#7C3AED',
  purpleDark: '#6D28D9',
  grayLight: '#E5E7EB',
  emerald: '#10B981',
  emeraldLight: '#34D399',
  text: '#111827',
  sub: '#6B7280',
};

// ====================
// Capsule component
// ====================
const Capsule: React.FC<{
  isFilled: boolean;
  fillColor: string;
  emptyColor: string;
}> = ({ isFilled, fillColor, emptyColor }) => {
  const widthAnim = useRef(new Animated.Value(isFilled ? 1 : 0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const didAnimateIn = useRef(isFilled);

  useEffect(() => {
    if (isFilled && !didAnimateIn.current) {
      didAnimateIn.current = true;
      Animated.sequence([
        Animated.timing(widthAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.parallel([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: 1.06,
              duration: 160,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 220,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
        ]),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.timing(widthAnim, {
        toValue: isFilled ? 1 : 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [isFilled, widthAnim, glowAnim, scaleAnim]);

  const shadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.45],
  });

  return (
    <Animated.View
      style={[
        styles.capsule,
        { backgroundColor: emptyColor, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            width: widthAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
            backgroundColor: fillColor,
            borderRadius: 50,
            shadowColor: fillColor,
            shadowOpacity,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 0 },
            elevation: shadowOpacity as unknown as number,
          },
        ]}
      />
    </Animated.View>
  );
};

// ====================
// AnimatedFilledDay
// ====================
const AnimatedFilledDay: React.FC<{ label: string }> = ({ label }) => {
  const fillAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fillAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.12,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.0,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.08,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [fillAnim, scaleAnim]);

  return (
    <Animated.View style={[styles.filledCircle, { transform: [{ scale: scaleAnim }] }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fillAnim }]}>
        <LinearGradient
          colors={['#7C3AED', '#3B82F6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.filledCircle}
        />
      </Animated.View>
      <Text style={styles.dayTextFilled}>{label}</Text>
    </Animated.View>
  );
};

// ====================
// Main Component
// ====================
type UserProfileNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Goals'>;

const DetailedGoalCard: React.FC<DetailedGoalCardProps> = ({ goal, onFinish }) => {
  const [currentGoal, setCurrentGoal] = useState(goal);
  const [empoweredName, setEmpoweredName] = useState<string | null>(null);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [lastHint, setLastHint] = useState<string | null>(null);
  const [pendingHint, setPendingHint] = useState<string | null>(null);
  const [lastSessionNumber, setLastSessionNumber] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [cancelMessage, setCancelMessage] = useState(
    "Are you sure you want to cancel this session? Progress won't be saved."
  );

  const navigation = useNavigation<UserProfileNavigationProp>();
  const pulse = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const cancelAnim = useRef(new Animated.Value(0)).current;
  const cancelScale = useRef(new Animated.Value(0.9)).current;

  // Calculate logic for duration and finishing
  const totalGoalSeconds = useMemo(() => {
    return (currentGoal.targetHours || 0) * 3600 + (currentGoal.targetMinutes || 0) * 60;
  }, [currentGoal.targetHours, currentGoal.targetMinutes]);

  // Logic: Can finish if elapsed time is >= 70% of total duration
  // NOTE: If total seconds is 0 (undefined goal), we default to immediate finish to avoid locking
  const canFinish = totalGoalSeconds > 0
    ? timeElapsed >= (totalGoalSeconds * 0.7)
    : timeElapsed >= 2;

  const handleFinish = async () => {
    if (!isTimerRunning || !canFinish || loading) return;

    const goalId = currentGoal.id;
    if (!goalId) return;

    // Check approval status and prevent cheating
    if (isGoalLocked(currentGoal)) {
      const sessionsDoneBeforeFinish = (currentGoal.currentCount * currentGoal.sessionsPerWeek) + (currentGoal.weeklyLogDates?.length || 0);

      // Special case: 1 day and 1 session per week goals cannot be completed until approved
      if (currentGoal.targetCount === 1 && currentGoal.sessionsPerWeek === 1) {
        const message = currentGoal.approvalStatus === 'suggested_change'
          ? 'Your giver has suggested a goal change. Please review and accept or modify the suggestion before continuing.'
          : 'Goals with only 1 day and 1 session per week cannot be completed until giver\'s approval.';
        Alert.alert('Goal Not Approved', message);
        return;
      }

      // For other goals: Allow first session, but prevent subsequent sessions if not approved
      if (sessionsDoneBeforeFinish >= 1) {
        const message = currentGoal.approvalStatus === 'suggested_change'
          ? 'Your giver has suggested a goal change. Please review and accept or modify the suggestion before continuing with more sessions.'
          : 'Waiting for your giver\'s approval! You can start with the first session, but the remaining sessions will unlock after giver approves your goal (or automatically in 24 hours).';
        Alert.alert('Goal Not Approved', message);
        return;
      }
    }

    setLoading(true);

    try {
      const updated = await goalService.tickWeeklySession(goalId);

      pulse.setValue(0);
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();

      setCurrentGoal(updated);

      const gift = await experienceGiftService.getExperienceGiftById(updated.experienceGiftId);
      const experience = await experienceService.getExperienceById(gift.experienceId);
      const recipientName = await userService.getUserName(updated.userId);

      const totalSessionsDone =
        (updated.currentCount * updated.sessionsPerWeek) + (updated.weeklyLogDates?.length || 0);

      setLastSessionNumber(totalSessionsDone);

      // Clear timer state
      setIsTimerRunning(false);
      setStartTime(null);
      setTimeElapsed(0);
      await clearTimerState();

      if (updated.isCompleted) {
        await notificationService.createNotification(
          updated.empoweredBy,
          'goal_completed',
          `🎉 ${recipientName} just earned ${experience.title}`,
          `Goal completed: ${updated.description}`,
          {
            goalId: updated.id,
            giftId: updated.experienceGiftId,
            giverId: updated.empoweredBy,
            recipientId: updated.userId,
            experienceTitle: experience.title,
          }
        );
        // Don't call onFinish for completed goals - handle navigation here
        navigation.navigate('Completion', { goal: updated, experienceGift: gift });
      } else {
        const hintToShow = pendingHint || "Keep going! You're doing great 💪";

        if (pendingHint) {
          try {
            const hintObj = { session: totalSessionsDone, hint: pendingHint, date: Date.now() };
            await goalService.appendHint(goalId, hintObj);

            setCurrentGoal((prev) => ({
              ...prev,
              hints: [...(prev.hints || []), hintObj],
            }));
          } catch (err) {
            console.warn('Failed to save hint:', err);
            // Don't block progress if hint save fails
          }
        }

        setLastHint(hintToShow);
        setShowHint(true);
        setPendingHint(null);

        // Call onFinish for progress updates
        onFinish?.(updated);

        await notificationService.createNotification(
          updated.empoweredBy,
          'goal_progress',
          `✅ ${recipientName} made progress!`,
          `This week's progress: ${updated.weeklyCount}/${updated.sessionsPerWeek}
Weeks completed: ${updated.currentCount}/${updated.targetCount}`,
          {
            goalId: updated.id,
            giftId: updated.experienceGiftId,
            giverId: updated.empoweredBy,
            recipientId: updated.userId,
            experienceTitle: experience.title,
          }
        );
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not update goal progress.');
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    console.log(currentGoal.approvalStatus, currentGoal.targetCount, currentGoal.sessionsPerWeek, currentGoal.weeklyCount);

    if (isTimerRunning || loading) return;

    const goalId = currentGoal.id;
    if (!goalId) return;
    // Prevent starting session for 1 day/1 week goals when approval is pending or suggested change
    if (isGoalLocked(currentGoal) && currentGoal.targetCount === 1 && currentGoal.sessionsPerWeek === 1) {
      const message = currentGoal.approvalStatus === 'suggested_change'
        ? 'Your giver has suggested a goal change. Please review and accept or modify the suggestion before starting a session.'
        : 'Goals with only 1 day and 1 session per week cannot be completed until giver\'s approval.';
      Alert.alert('Goal Not Approved', message);
      return;
    }
    // Prevent starting session when goal is locked and weekly count is already 1
    if (isGoalLocked(currentGoal) && currentGoal.targetCount >= 1 && currentGoal.weeklyCount >= 1) {
      const message = currentGoal.approvalStatus === 'suggested_change'
        ? 'Your giver has suggested a goal change. Please review and accept or modify the suggestion before starting another session.'
        : 'Waiting for your giver\'s approval! You can start with the first session, but the remaining sessions will unlock after giver approves your goal (or automatically in 24 hours).';
      Alert.alert('Goal Not Approved', message);
      return;
    }
    setLoading(true);
    const now = Date.now();
    setStartTime(now);
    setTimeElapsed(0);
    setPendingHint(null);
    setIsTimerRunning(true);

    try {
      const gift = await experienceGiftService.getExperienceGiftById(currentGoal.experienceGiftId);
      const experience = await experienceService.getExperienceById(gift.experienceId);
      const recipientName = await userService.getUserName(currentGoal.userId);

      const totalSessionsDone =
        (currentGoal.currentCount * currentGoal.sessionsPerWeek) +
        (currentGoal.weeklyLogDates?.length || 0);
      const totalSessions = currentGoal.sessionsPerWeek * currentGoal.targetCount;

      if (totalSessionsDone != totalSessions) {
        const hint = await aiHintService.generateHint({
          goalId,
          experienceType: experience?.title || 'experience',
          sessionNumber: totalSessionsDone + 1,
          totalSessions,
          userName: recipientName || undefined,
        });

        setPendingHint(hint);
      }

    } catch (err) {
      console.warn('Hint pre-generation failed:', err);
      // Don't block session start - hint is optional
      // Timer state is already set, so session will start without hint
    } finally {
      setLoading(false);
    }
  };

  // ========= Helpers & Animations =========
  const onPressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  const onPressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();

  const openCancelPopup = () => {
    setShowCancelPopup(true);
    Animated.parallel([
      Animated.timing(cancelAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(cancelScale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
  };

  const closeCancelPopup = () => {
    Animated.parallel([
      Animated.timing(cancelAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(cancelScale, { toValue: 0.9, duration: 150, useNativeDriver: true }),
    ]).start(() => setShowCancelPopup(false));
  };

  const handleCancel = () => openCancelPopup();

  const cancelSessionInternal = async () => {
    try {
      setIsTimerRunning(false);
      setStartTime(null);
      setTimeElapsed(0);
      setPendingHint(null);
      await clearTimerState();
    } catch (error) {
      console.error('Error cancelling session:', error);
    } finally {
      closeCancelPopup();
    }
  };

  // ========= Timer Persistence =========
  const loadTimerState = async () => {
    try {
      const stored = await AsyncStorage.getItem(TIMER_STORAGE_KEY + currentGoal.id);
      if (stored) {
        const timerState = JSON.parse(stored);
        setIsTimerRunning(true);
        setStartTime(timerState.startTime);
        setPendingHint(timerState.pendingHint || null);
        const elapsed = Math.floor((Date.now() - timerState.startTime) / 1000);
        setTimeElapsed(elapsed);

      }
    } catch (error) {
      console.error('Error loading timer state:', error);
    }
  };

  const saveTimerState = async () => {
    try {
      const timerState = { startTime, pendingHint, goalId: currentGoal.id };
      await AsyncStorage.setItem(TIMER_STORAGE_KEY + currentGoal.id, JSON.stringify(timerState));
    } catch (error) {
      console.error('Error saving timer state:', error);
    }
  };

  const clearTimerState = async () => {
    try {
      await AsyncStorage.removeItem(TIMER_STORAGE_KEY + currentGoal.id);
    } catch (error) {
      console.error('Error clearing timer state:', error);
    }
  };

  // ========= Effects =========
  useEffect(() => {
    loadTimerState();
  }, [currentGoal.id]);

  useEffect(() => {
    if (isTimerRunning && startTime) saveTimerState();
  }, [isTimerRunning, startTime, pendingHint]);

  useEffect(() => {
    if (!isTimerRunning || !startTime) return;
    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setTimeElapsed(elapsed);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, startTime]);

  useEffect(() => {
    if (currentGoal.empoweredBy) {
      userService.getUserName(currentGoal.empoweredBy).then(setEmpoweredName).catch(() => { });
    }
  }, [currentGoal.empoweredBy]);

  // ========= Other Computations =========

  const weekDates = useMemo(() => {
    const start = currentGoal.weekStartAt ? new Date(currentGoal.weekStartAt) : new Date();
    start.setHours(0, 0, 0, 0);
    return rollingWeek(start);
  }, [currentGoal.weekStartAt]);

  const loggedSet = useMemo(() => new Set(currentGoal.weeklyLogDates || []), [currentGoal.weeklyLogDates]);

  const weeklyFilled = Math.max(0, currentGoal.weeklyCount || 0);
  const weeklyTotal = Math.max(1, currentGoal.sessionsPerWeek || 1);
  const overallTotal = Math.max(1, currentGoal.targetCount || 1);

  const completedWeeks = useMemo(() => {
    const finishedThisWeek = currentGoal.weeklyCount >= currentGoal.sessionsPerWeek;
    const total = currentGoal.targetCount || 1;
    const base = currentGoal.currentCount || 0;
    if (currentGoal.isCompleted) return total;
    return Math.min(base + (finishedThisWeek ? 1 : 0), total);
  }, [currentGoal]);

  const todayIso = isoDay(new Date());
  const alreadyLoggedToday = loggedSet.has(todayIso);

  // Calculate total sessions done
  const totalSessionsDone = useMemo(() => {
    return (currentGoal.currentCount * currentGoal.sessionsPerWeek) + (currentGoal.weeklyLogDates?.length || 0);
  }, [currentGoal.currentCount, currentGoal.sessionsPerWeek, currentGoal.weeklyLogDates]);

  const formatTime = (s: number) => {
    // If less than 1 hour, use MM:SS format
    if (s < 3600) {
      const minutes = Math.floor(s / 60);
      const seconds = s % 60;
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    // If 1 hour or more, use H:MM:SS format (no leading zero on hours)
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };
  const handlePress = async (g: Goal) => {
    // @ts-ignore
    navigation.navigate('Roadmap', { goal: g });
  };
  // ========= UI Rendering =========
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      {/* Card Press */}
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={() => handlePress(currentGoal)}
        style={{ borderRadius: 16 }}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{currentGoal.title}</Text>
          {!!empoweredName && <Text style={styles.empoweredText}>⚡ Empowered by {empoweredName}</Text>}

          {/* Weekly Calendar */}
          <View style={styles.calendarRow}>
            {weekDates.map((d) => {
              const label = day2(d);
              const iso = isoDay(d);
              const filled = loggedSet.has(iso);
              const isToday = iso === todayIso;

              return (
                <View key={iso} style={styles.dayCell}>
                  {filled ? (
                    isToday ? (
                      <AnimatedFilledDay label={label} />
                    ) : (
                      <LinearGradient
                        colors={['#7C3AED', '#3B82F6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.filledCircle}
                      >
                        <Text style={styles.dayTextFilled}>{label}</Text>
                      </LinearGradient>
                    )
                  ) : (
                    <View style={styles.emptyCircle}>
                      <Text style={styles.dayTextEmpty}>{label}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Progress Bars */}
          <View style={styles.progressBlock}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Sessions this week</Text>
              <Text style={styles.progressText}>
                {weeklyFilled}/{weeklyTotal}
              </Text>
            </View>
            <View style={styles.capsuleRow}>
              {Array.from({ length: weeklyTotal }, (_, i) => (
                <Capsule
                  key={i}
                  isFilled={i < weeklyFilled}
                  fillColor="#84b3e9ff"
                  emptyColor={COLORS.grayLight}
                />
              ))}
            </View>
          </View>

          <View style={styles.progressBlock}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Weeks completed</Text>
              <Text style={styles.progressText}>
                {completedWeeks}/{overallTotal}
              </Text>
            </View>
            <View style={styles.capsuleRow}>
              {Array.from({ length: overallTotal }, (_, i) => (
                <Capsule
                  key={i}
                  isFilled={i < completedWeeks}
                  fillColor="#84b3e9ff"
                  emptyColor={COLORS.grayLight}
                />
              ))}
            </View>
          </View>

          {/* Buttons */}
          {!isTimerRunning ? (
            currentGoal.isWeekCompleted && !currentGoal.isCompleted ? (
              <View style={styles.weekCompleteBox}>
                <Text style={styles.weekCompleteText}>🎉 You've completed this week!</Text>
                <Text style={styles.weekCompleteSub}>
                  Next week starts on {formatNextWeekDay(currentGoal.weekStartAt)} 💪
                </Text>
              </View>
            ) : (
              <>
                {/* Approval Status Message - Show only once above start button when locked and no sessions done */}
                {isGoalLocked(currentGoal) && totalSessionsDone === 0 && (
                  <View style={styles.approvalMessageBox}>
                    <Text style={styles.approvalMessageText}>
                      {currentGoal.approvalStatus === 'suggested_change'
                        ? 'Your giver has suggested a goal change. Please review and accept or modify the suggestion in your notifications.'
                        : currentGoal.targetCount === 1 && currentGoal.sessionsPerWeek === 1
                          ? 'Goals with only 1 day and 1 session per week cannot be completed until giver\'s approval.'
                          : 'Waiting for your giver\'s approval! You can start with the first session, but the remaining sessions will unlock after giver approves your goal (or automatically in 24 hours).'}
                    </Text>
                  </View>
                )}
                {/* Approval Status Message - Show only once above start button when locked and one session done */}
                {isGoalLocked(currentGoal) && totalSessionsDone === 1 && (
                  <View style={[styles.approvalMessageBox, { backgroundColor: '#ECFDF5', borderLeftColor: '#348048' }]}>
                    <Text style={[styles.approvalMessageText, { color: '#065F46' }]}>
                      {currentGoal.approvalStatus === 'suggested_change'
                        ? '🎉 Congrats on your first session! Your giver has suggested a goal change. Please review and accept or modify the suggestion in your notifications to continue.'
                        : '🎉 Congrats on your first session! The remaining sessions will unlock after your giver approves this goal (or automatically in 24 hours).'}
                    </Text>
                  </View>
                )}
                {/* Disable start button for 1 day/1 week goals when approval is pending or suggested change */}
                {(isGoalLocked(currentGoal) && currentGoal.targetCount === 1 && currentGoal.sessionsPerWeek === 1)
                  || (isGoalLocked(currentGoal) && currentGoal.targetCount >= 1 && currentGoal.weeklyCount >= 1) ? (
                  <View style={styles.disabledStartContainer}>
                    <Text style={styles.disabledStartText}>Waiting for approval</Text>
                  </View>
                ) : alreadyLoggedToday && !DEBUG_ALLOW_MULTIPLE_PER_DAY ? (
                  <View style={styles.disabledStartContainer}>
                    <Text style={styles.disabledStartText}>You already made progress today</Text>
                    <Text style={styles.disabledStartText}>Come back tomorrow for more 💪</Text>
                  </View>
                ) : (
                  <View>
                    <TouchableOpacity
                      style={styles.startButton}
                      onPress={handleStart}
                      disabled={loading}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.startButtonText}>{loading ? 'Loading...' : 'Start Session'}</Text>
                    </TouchableOpacity>

                    {/* SESSION TOTAL TIME TEXT BELOW BUTTON */}
                    <Text style={styles.sessionDurationText}>
                      Session duration: {formatDurationDisplay(currentGoal.targetHours, currentGoal.targetMinutes)}
                    </Text>
                  </View>
                )}
              </>
            )
          ) : (
            <View style={styles.timerContainer}>
              <Text style={styles.timerText}>{formatTime(timeElapsed)}</Text>
              <View>
                <TouchableOpacity
                  style={[
                    styles.finishButton,
                    canFinish ? styles.finishButtonActive : styles.finishButtonDisabled,
                  ]}
                  onPress={handleFinish}
                  disabled={!canFinish || loading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.finishButtonText}>
                    {canFinish ? 'Finish Session' : 'Finish'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCancel}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.sessionDurationText}>
                Session duration: {formatDurationDisplay(currentGoal.targetHours, currentGoal.targetMinutes)}
              </Text>
            </View>

          )}
        </View>
      </Pressable>

      {/* Hint Popup */}
      <HintPopup
        visible={showHint}
        hint={lastHint || ''}
        sessionNumber={lastSessionNumber}
        totalSessions={overallTotal}
        onClose={() => setShowHint(false)}
      />

      {/* Cancel Popup */}
      {showCancelPopup && (
        <Animated.View
          style={[
            styles.modalOverlay,
            { opacity: cancelAnim, transform: [{ scale: cancelScale }] },
          ]}
        >
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Cancel Session?</Text>
            <Text style={styles.modalSubtitle}>{cancelMessage}</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={closeCancelPopup}
                style={[styles.modalButton, styles.cancelButtonPopup]}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={cancelSessionInternal}
                style={[styles.modalButton, styles.confirmButton]}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmText}>Yes, cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
};

// ====================
// Styles
// ====================
const CIRCLE = 38;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 6 },
  empoweredText: { fontSize: 14, color: '#6b7280', marginBottom: 14 },
  calendarRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  dayCell: { alignItems: 'center', width: CIRCLE },
  emptyCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filledCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dayTextEmpty: { color: '#6b7280', fontWeight: '600' },
  dayTextFilled: { color: '#fff', fontWeight: '700' },
  progressBlock: { marginBottom: 24 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { color: '#4b5563' },
  progressText: { color: '#111827', fontWeight: '600' },
  capsuleRow: { flexDirection: 'row', gap: 3 },
  capsule: {
    flex: 1,
    height: 12,
    borderRadius: 50,
    backgroundColor: COLORS.grayLight,
    overflow: 'hidden',
  },
  disabledStartContainer: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
  },
  disabledStartText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  startButton: { backgroundColor: '#235c9eff', paddingVertical: 14, borderRadius: 12 },
  startButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  sessionDurationText: {
    marginTop: 8,
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
  },
  timerContainer: { alignItems: 'center' },
  timerText: { fontSize: 36, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  finishButton: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  finishButtonActive: { backgroundColor: '#7c3aed' },
  finishButtonDisabled: { backgroundColor: '#9ca3af' },
  finishButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  weekCompleteBox: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
  },
  weekCompleteText: {
    color: '#065F46',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  weekCompleteSub: { color: '#047857', fontSize: 13, marginTop: 4, textAlign: 'center' },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#b3afafff',
  },
  cancelButtonText: { color: '#fff', fontSize: 16, fontWeight: '400', textAlign: 'center' },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 999,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '85%',
    maxWidth: 360,
    paddingVertical: 24,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#4c1d95', marginBottom: 8 },
  modalSubtitle: {
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonPopup: { backgroundColor: '#f3f4f6' },
  confirmButton: { backgroundColor: '#7c3aed' },
  cancelText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  confirmText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  approvalMessageBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  approvalMessageText: {
    fontSize: 13,
    color: '#78350f',
    lineHeight: 18,
  },
});

export default DetailedGoalCard;