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
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Goal, isSelfGifted } from '../../types';
import { goalService } from '../../services/GoalService';
import { userService } from '../../services/userService';
import { notificationService } from '../../services/NotificationService';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { experienceService } from '../../services/ExperienceService';
import { RootStackParamList } from '../../types';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import HintPopup from '../../components/HintPopup';
import { aiHintService } from '../../services/AIHintService';
import { pushNotificationService } from '../../services/PushNotificationService';
import { useApp } from '../../context/AppContext';
import { useTimerContext } from '../../context/TimerContext';
import { logger } from '../../utils/logger';
import { DateHelper } from '../../utils/DateHelper';

import { config } from '../../config/environment';

interface DetailedGoalCardProps {
  goal: Goal;
  onFinish?: (goal: Goal) => void;
}

// Use environment config for debug settings - only allow multiple sessions per day in test mode
const DEBUG_ALLOW_MULTIPLE_PER_DAY = config.debugEnabled;
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

function dayMonth(d: Date) {
  const day = d.getDate();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  return `${day} ${month}`;
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
  const isSelfGift = isSelfGifted(currentGoal); // Detect self-gifted goals
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [lastHint, setLastHint] = useState<any>(null);
  const [lastSessionNumber, setLastSessionNumber] = useState<number>(0);
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [debugTimeKey, setDebugTimeKey] = useState(0);
  const [cancelMessage, setCancelMessage] = useState(
    "Are you sure you want to cancel this session? Progress won't be saved."
  );

  // Use centralized timer state from context
  const { getTimerState, startTimer, stopTimer } = useTimerContext();
  const timerState = getTimerState(currentGoal.id);

  const isTimerRunning = timerState?.isRunning || false;
  const startTime = timerState?.startTime || null;
  const timeElapsed = timerState?.elapsed || 0;
  const pendingHint = timerState?.pendingHint || null;

  const navigation = useNavigation<UserProfileNavigationProp>();
  const pulse = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const cancelScale = useRef(new Animated.Value(300)).current;
  const celebrationScale = useRef(new Animated.Value(0)).current;
  const celebrationOpacity = useRef(new Animated.Value(0)).current;
  const particlesAnim = useRef(new Animated.Value(0)).current;

  // Format planned start date
  const getStartDateText = () => {
    if (!currentGoal.plannedStartDate) return null;
    const planned = new Date(currentGoal.plannedStartDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    planned.setHours(0, 0, 0, 0);

    const diffMs = planned.getTime() - today.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '🎯 Starts today';
    if (diffDays === 1) return '🎯 Starts tomorrow';
    if (diffDays === -1) return '🎯 Started yesterday';
    if (diffDays < 0) return `🎯 Started ${Math.abs(diffDays)} days ago`;
    if (diffDays <= 7) return `🎯 Starts in ${diffDays} days`;
    return `🎯 Starts ${planned.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const startDateText = getStartDateText();

  // Calculate logic for duration and finishing
  const totalGoalSeconds = useMemo(() => {
    return (currentGoal.targetHours || 0) * 3600 + (currentGoal.targetMinutes || 0) * 60;
  }, [currentGoal.targetHours, currentGoal.targetMinutes]);

  // Logic: Can finish if elapsed time is >= 2 seconds
  // This ensures timer has actually run before allowing finish
  const canFinish = useMemo(() => {
    // For goals with defined duration, require at least 2 seconds
    if (totalGoalSeconds > 2) {
      return timeElapsed >= 2;
    }
    // For goals without duration, also require 2 seconds minimum
    return timeElapsed >= 2;
  }, [totalGoalSeconds, timeElapsed]);

  const handleFinish = async () => {
    if (!isTimerRunning || !canFinish || loading) return;

    const goalId = currentGoal.id;
    if (!goalId) return;

    // Check approval status and prevent cheating
    if (isGoalLocked(currentGoal)) {
      const sessionsDoneBeforeFinish = (currentGoal.currentCount * currentGoal.sessionsPerWeek) + currentGoal.weeklyCount;

      // Special case: 1 day and 1 session per week goals cannot be completed until approved
      if (currentGoal.targetCount === 1 && currentGoal.sessionsPerWeek === 1) {
        const message = currentGoal.approvalStatus === 'suggested_change'
          ? `${empoweredName || 'Your giver'} has suggested a goal change. Please review and accept or modify the suggestion before continuing.`
          : 'Goals with only 1 day and 1 session per week cannot be completed until giver\'s approval.';
        Alert.alert('Goal Not Approved', message);
        return;
      }

      // For other goals: Allow first session, but prevent subsequent sessions if not approved
      if (sessionsDoneBeforeFinish >= 1) {
        const message = currentGoal.approvalStatus === 'suggested_change'
          ? `${empoweredName || 'Your giver'} has suggested a goal change. Please review and accept or modify the suggestion before continuing with more sessions.`
          : `Waiting for ${empoweredName || 'your giver'}\'s approval! You can start with the first session, but the remaining sessions will unlock after ${empoweredName || 'your giver'} approves your goal (or automatically in 24 hours).`;
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

      // CRITICAL FIX: Use weeklyCount, not weeklyLogDates.length.
      const totalSessionsDone =
        (updated.currentCount * updated.sessionsPerWeek) + updated.weeklyCount;

      setLastSessionNumber(totalSessionsDone);

      // Clear timer state using context
      stopTimer(currentGoal.id);
      await clearTimerState();

      // Cancel scheduled notification since session is complete
      await pushNotificationService.cancelSessionNotification(goalId);

      if (updated.isCompleted) {
        // Only notify the giver if they're different from the user (don't send self-notifications)
        if (updated.empoweredBy && updated.empoweredBy !== updated.userId) {
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
        }
        // Don't call onFinish for completed goals - handle navigation here
        navigation.navigate('Completion', { goal: updated, experienceGift: gift });
      } else {
        // Check if there's a personalized hint for the NEXT session
        // totalSessionsDone represents the session that was just completed
        const hasPersonalizedHint =
          updated.personalizedNextHint &&
          updated.personalizedNextHint.forSessionNumber === totalSessionsDone + 1;

        let hintToShow: string;

        if (hasPersonalizedHint) {
          const ph = updated.personalizedNextHint!;

          // SECURITY: Validate hint content before creating
          if (ph.text && ph.text.length > 500) {
            logger.warn('⚠️ Hint text too long, truncating');
            ph.text = ph.text.substring(0, 500);
          }

          // Create clean hint object without undefined values
          const hintObj: any = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Unique ID
            session: totalSessionsDone,
            giverName: ph.giverName || 'Your Giver',
            date: Date.now(),
            createdAt: new Date(),
          };

          // Only add defined properties
          if (ph.text) hintObj.text = ph.text;
          if (ph.audioUrl) hintObj.audioUrl = ph.audioUrl;
          if (ph.imageUrl) hintObj.imageUrl = ph.imageUrl;
          if (ph.type) hintObj.type = ph.type;
          if (typeof ph.duration === 'number') hintObj.duration = ph.duration;

          logger.log('💾 Saving hint to Firestore:', hintObj);

          // Construct display text for popup (fallback/title)
          if (ph.type === 'audio') {
            hintToShow = `${ph.giverName} sent a voice memo! 🎤`;
          } else if (ph.type === 'image') {
            hintToShow = `${ph.giverName} sent a photo! 📷`;
          } else {
            hintToShow = `${ph.giverName} says:\n${ph.text || ''}`;
          }

          // If mixed, maybe combine?
          if (ph.type === 'mixed') {
            hintToShow = `${ph.giverName} sent a message!`;
          }

          // For the popup, we want to pass the WHOLE object so it can render audio/image
          // We'll use a temporary hack: pass the object as 'hint' if the component supports it,
          // OR we update the state to hold the object.
          // Since we updated HintPopup to take 'any', we can pass the object.
          // However, DetailedGoalCard has 'lastHint' as string state.
          // We should update 'lastHint' to be 'any'.

          // Save personalized hint to history
          try {
            await goalService.appendHint(goalId, hintObj);
            logger.log('✅ Personalized hint saved to Firestore successfully');

            // Update local state to show in history immediately
            setCurrentGoal((prev) => ({
              ...prev,
              hints: [...(prev.hints || []), hintObj],
            }));
          } catch (err) {
            logger.error('❌ Failed to save personalized hint to history:', err);
          }

          // Clear the personalized hint after use
          try {
            await goalService.clearPersonalizedNextHint(goalId);
            logger.log('✅ Personalized hint cleared after display');
          } catch (err) {
            logger.warn('Failed to clear personalized hint:', err);
          }

          // Set the FULL object for the popup (not just the text)
          logger.log('🎨 Setting lastHint for popup:', hintObj);
          setLastHint(hintObj);

          // Update the 'updated' object so onFinish propagates the new hint
          updated.hints = [...(updated.hints || []), hintObj];

        } else {
          // Use AI-generated hint
          hintToShow = pendingHint || "Keep going! You're doing great 💪";

          if (pendingHint) {
            try {
              // The pendingHint was generated for the NEXT session (totalSessionsDone + 2 at start time)
              // After tickWeeklySession, totalSessionsDone has incremented by 1
              // So the hint should be saved for session: totalSessionsDone + 1
              const hintObj = {
                id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Unique ID
                session: totalSessionsDone + 1, // Fixed: Save hint for the correct future session
                hint: pendingHint,
                date: Date.now(),
                text: pendingHint
              };
              await goalService.appendHint(goalId, hintObj);

              setCurrentGoal((prev) => ({
                ...prev,
                hints: [...(prev.hints || []), hintObj],
              }));

              // Update the 'updated' object so onFinish propagates the new hint
              updated.hints = [...(updated.hints || []), hintObj];
            } catch (err) {
              logger.warn('Failed to save hint:', err);
              // Don't block progress if hint save fails
            }
          }
          setLastHint(hintToShow);
        }

        // Only show hint popup if NOT self-gifted
        if (!isSelfGift) {
          setShowHint(true);
        } else {
          // Show celebration animation for self-gifted goals
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setShowCelebration(true);

          // Auto-dismiss after 3 seconds
          setTimeout(() => {
            setShowCelebration(false);
          }, 3000);
        }

        // Note: We don't invalidate old notifications here because recipients
        // don't have permission to update notifications that belong to givers.
        // The UI handles stale state checking client-side instead.

        // Call onFinish for progress updates
        onFinish?.(updated);

        // Calculate weeks completed: if this week is now complete, count it
        const weeksCompleted = updated.isWeekCompleted
          ? updated.currentCount + 1
          : updated.currentCount;

        // Only notify the giver if they're different from the user (don't send self-notifications)
        if (updated.empoweredBy && updated.empoweredBy !== updated.userId) {
          await notificationService.createNotification(
            updated.empoweredBy,
            'goal_progress',
            `✅ ${recipientName} made progress!`,
            `This week's progress: ${updated.weeklyCount}/${updated.sessionsPerWeek}
Weeks completed: ${weeksCompleted}/${updated.targetCount}`,
            {
              goalId: updated.id,
              giftId: updated.experienceGiftId,
              giverId: updated.empoweredBy,
              recipientId: updated.userId,
              experienceTitle: experience.title,
              sessionNumber: totalSessionsDone,
            }
          );
        }
      }
    } catch (err) {
      logger.error(err);
      Alert.alert('Error', 'Could not update goal progress.');
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (isTimerRunning || loading) return;

    const goalId = currentGoal.id;
    if (!goalId) return;
    // Prevent starting session for 1 day/1 week goals when approval is pending or suggested change
    if (isGoalLocked(currentGoal) && currentGoal.targetCount === 1 && currentGoal.sessionsPerWeek === 1) {
      const message = currentGoal.approvalStatus === 'suggested_change'
        ? `${empoweredName || 'Your giver'} has suggested a goal change. Please review and accept or modify the suggestion before starting a session.`
        : 'Goals with only 1 day and 1 session per week cannot be completed until giver\'s approval.';
      Alert.alert('Goal Not Approved', message);
      return;
    }
    // Prevent starting session when goal is locked and weekly count is already 1
    if (isGoalLocked(currentGoal) && currentGoal.targetCount >= 1 && currentGoal.weeklyCount >= 1) {
      const message = currentGoal.approvalStatus === 'suggested_change'
        ? `${empoweredName || 'Your giver'} has suggested a goal change. Please review and accept or modify the suggestion before starting another session.`
        : `Waiting for ${empoweredName || 'your giver'}\'s approval! You can start with the first session, but the remaining sessions will unlock after ${empoweredName || 'your giver'} approves your goal (or automatically in 24 hours).`;
      Alert.alert('Goal Not Approved', message);
      return;
    }
    setLoading(true);
    const now = Date.now();

    try {
      const gift = await experienceGiftService.getExperienceGiftById(currentGoal.experienceGiftId);
      const experience = await experienceService.getExperienceById(gift.experienceId);
      const recipientName = await userService.getUserName(currentGoal.userId);

      // SECURITY: Validate session timing to prevent rapid completion exploits
      const MIN_SESSION_INTERVAL_MS = 60000; // 1 minute between sessions
      const nowCheck = Date.now();

      // Check if there was a previous session
      if (currentGoal.weeklyLogDates && currentGoal.weeklyLogDates.length > 0) {
        // Get the most recent session timestamp
        const lastSessionDate = currentGoal.weeklyLogDates[currentGoal.weeklyLogDates.length - 1];
        const lastSessionTime = new Date(lastSessionDate).getTime();

        const timeSinceLastSession = nowCheck - lastSessionTime;

        if (timeSinceLastSession < MIN_SESSION_INTERVAL_MS) {
          const secondsRemaining = Math.ceil((MIN_SESSION_INTERVAL_MS - timeSinceLastSession) / 1000);
          Alert.alert(
            'Too Fast!',
            `Please wait ${secondsRemaining} seconds between sessions to ensure quality completion.`,
            [{ text: 'OK' }]
          );
          setLoading(false); // Ensure loading state is reset if we return early
          return;
        }
      }

      // CRITICAL FIX: Use weeklyCount, not weeklyLogDates.length.
      // weeklyLogDates only stores unique dates, so it undercounts if multiple sessions happen in one day.
      const totalSessionsDone =
        (currentGoal.currentCount * currentGoal.sessionsPerWeek) + currentGoal.weeklyCount;
      const totalSessions = currentGoal.sessionsPerWeek * currentGoal.targetCount;

      // Only generate AI hint if:
      // 1. Not the last session
      // 2. No personalized hint exists for the next session
      // Only generate AI hint if:
      // 1. Not the last session
      // 2. No personalized hint exists for the next session
      // We want to generate a hint for the session AFTER the one we are about to start.
      // So if we are starting Session 1 (totalSessionsDone=0), we want hint for Session 2.
      const nextSessionNumber = totalSessionsDone + 2;
      const hasPersonalizedHintForNextSession =
        currentGoal.personalizedNextHint &&
        currentGoal.personalizedNextHint.forSessionNumber === nextSessionNumber;

      if (totalSessionsDone != totalSessions && !hasPersonalizedHintForNextSession) {
        const hint = await aiHintService.generateHint({
          goalId,
          experienceType: experience?.title || 'experience',
          sessionNumber: nextSessionNumber,
          totalSessions,
          userName: recipientName || undefined,
        });

        // Start timer with pending hint using context
        startTimer(currentGoal.id, hint);
      } else {
        // Start timer without hint
        startTimer(currentGoal.id, null);
      }

      // Schedule push notification for when timer completes
      // Only schedule if there's a defined target duration
      if (totalGoalSeconds > 0) {
        const notifId = await pushNotificationService.scheduleSessionCompletionNotification(
          goalId,
          totalGoalSeconds
        );
        logger.log(`📱 Scheduled session notification with ID: ${notifId} for ${totalGoalSeconds}s`);
      }

    } catch (err) {
      logger.warn('Hint pre-generation failed:', err);
      // Don't block session start - hint is optional
      // Timer state is already set, so session will start without hint
    } finally {
      setLoading(false);
    }
  };

  // Check if session time has elapsed when component mounts or app becomes visible
  useEffect(() => {
    if (!isTimerRunning || !startTime) return;

    const checkElapsedTime = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      // If session duration has elapsed and user just opened the app, show notification
      if (elapsed >= totalGoalSeconds && totalGoalSeconds > 0) {
        logger.log('⏰ Session time elapsed while app was closed, showing notification');

        // Show browser notification if permission granted
        if (Platform.OS === 'web' && 'Notification' in window && Notification.permission === 'granted') {
          const notification = new Notification("⏰ Session Time's Up!", {
            body: "Great job! You can now finish your session and log your progress.",
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: `session-${currentGoal.id}`,
            requireInteraction: true,
          });

          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        }
      }
    };

    // Check immediately on mount
    checkElapsedTime();

    // Listen for visibility change (app coming back to foreground)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkElapsedTime();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isTimerRunning, startTime, totalGoalSeconds, currentGoal.id]);

  // ========= Helpers & Animations =========

  // ========= Helpers & Animations =========
  const onPressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  const onPressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();

  const openCancelPopup = () => {
    setShowCancelPopup(true);
    Animated.spring(cancelScale, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeCancelPopup = () => {
    setShowCancelPopup(false);
  };

  const handleCancel = () => openCancelPopup();

  const cancelSessionInternal = async () => {
    try {
      // Clear timer using context
      stopTimer(currentGoal.id);
      await clearTimerState();

      // Cancel scheduled notification since session is cancelled
      await pushNotificationService.cancelSessionNotification(currentGoal.id);
    } catch (error) {
      logger.error('Error cancelling session:', error);
    } finally {
      closeCancelPopup();
    }
  };

  // ========= Timer Persistence =========
  // Note: Timer state is now managed by TimerContext
  // Only keeping clearTimerState for cleanup

  const clearTimerState = async () => {
    try {
      await AsyncStorage.removeItem(TIMER_STORAGE_KEY + currentGoal.id);
      // Also cancel any scheduled notification for this goal
      await pushNotificationService.cancelSessionNotification(currentGoal.id);
    } catch (error) {
      logger.error('Error clearing timer state:', error);
    }
  };





  useEffect(() => {
    if (currentGoal.empoweredBy) {
      userService.getUserName(currentGoal.empoweredBy).then(setEmpoweredName).catch(() => { });
    }
  }, [currentGoal.empoweredBy]);

  // Celebration animation effect
  useEffect(() => {
    if (showCelebration) {
      // Reset animations
      celebrationScale.setValue(0);
      celebrationOpacity.setValue(0);
      particlesAnim.setValue(0);

      // Staggered entrance animation
      Animated.parallel([
        Animated.spring(celebrationScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(celebrationOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Particle burst animation - delayed slightly
      setTimeout(() => {
        Animated.timing(particlesAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }, 150);
    } else {
      // Exit animation
      Animated.parallel([
        Animated.timing(celebrationScale, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(celebrationOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showCelebration]);


  // ========= Other Computations =========

  const weekDates = useMemo(() => {
    // Depend on debugTimeKey to force recalculation when debug time changes
    void debugTimeKey;
    const start = currentGoal.weekStartAt ? new Date(currentGoal.weekStartAt) : DateHelper.now();
    start.setHours(0, 0, 0, 0);
    return rollingWeek(start);
  }, [currentGoal.weekStartAt, debugTimeKey]);

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

  // Depend on debugTimeKey to force recalculation when debug time changes
  const todayIso = useMemo(() => isoDay(DateHelper.now()), [debugTimeKey]);
  const alreadyLoggedToday = loggedSet.has(todayIso);

  // Calculate total sessions done
  const totalSessionsDone = useMemo(() => {
    return (currentGoal.currentCount * currentGoal.sessionsPerWeek) + currentGoal.weeklyCount;
  }, [currentGoal.currentCount, currentGoal.sessionsPerWeek, currentGoal.weeklyCount]);

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
    navigation.navigate('Roadmap' as any, { goal: g });
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
          {/* Show empowered text only if NOT self-gifted */}
          {!!empoweredName && !isSelfGift && <Text style={styles.empoweredText}>⚡ Empowered by {empoweredName}</Text>}
          {/* Show self-challenge badge for self-gifted goals */}
          {isSelfGift && <Text style={styles.selfChallengeText}>🏆 Self-Challenge</Text>}
          {/* Show planned start date */}
          {startDateText && <Text style={styles.startDateText}>{startDateText}</Text>}

          {/* Weekly Calendar */}
          <View style={styles.calendarRow}>
            {weekDates.map((d) => {
              const label = day2(d);
              const dateLabel = dayMonth(d);
              const iso = isoDay(d);
              const filled = loggedSet.has(iso);
              const isToday = iso === todayIso;

              return (
                <View key={iso} style={styles.dayCell}>
                  {filled ? (
                    <>
                      {isToday ? (
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
                      )}
                      <Text style={[styles.dateLabel, isToday && styles.todayDateLabel]}>{dateLabel}</Text>
                    </>
                  ) : (
                    <>
                      <View style={[styles.emptyCircle, isToday && styles.todayCircleBorder]}>
                        <Text style={[styles.dayTextEmpty, isToday && styles.todayText]}>{label}</Text>
                      </View>
                      <Text style={[styles.dateLabel, isToday && styles.todayDateLabel]}>{dateLabel}</Text>
                    </>
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
                {/* Approval Status Message - Show only if locked and NOT self-gifted */}
                {isGoalLocked(currentGoal) && !isSelfGift && totalSessionsDone === 0 && (
                  <View style={styles.approvalMessageBox}>
                    <Text style={styles.approvalMessageText}>
                      {currentGoal.approvalStatus === 'suggested_change'
                        ? `${empoweredName || 'Your giver'} has suggested a goal change. Please review and accept or modify the suggestion in your notifications.`
                        : currentGoal.targetCount === 1 && currentGoal.sessionsPerWeek === 1
                          ? 'Goals with only 1 day and 1 session per week cannot be completed until giver\'s approval.'
                          : `Waiting for ${empoweredName || 'your giver'}\'s approval! You can start with the first session, but the remaining sessions will unlock after ${empoweredName || 'your giver'} approves your goal (or automatically in 24 hours).`}
                    </Text>
                  </View>
                )}
                {/* Approval Status Message - Show only if locked, NOT self-gifted, and one session done */}
                {isGoalLocked(currentGoal) && !isSelfGift && totalSessionsDone === 1 && (
                  <View style={[styles.approvalMessageBox, { backgroundColor: '#ECFDF5', borderLeftColor: '#348048' }]}>
                    <Text style={[styles.approvalMessageText, { color: '#065F46' }]}>
                      {currentGoal.approvalStatus === 'suggested_change'
                        ? `🎉 Congrats on your first session! ${empoweredName || 'Your giver'} has suggested a goal change. Please review and accept or modify the suggestion in your notifications to continue.`
                        : `🎉 Congrats on your first session! The remaining sessions will unlock after ${empoweredName || 'your giver'} approves this goal (or automatically in 24 hours).`}
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
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleFinish();
                  }}
                  disabled={!canFinish || loading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.finishButtonText}>
                    {canFinish ? 'Finish Session' : 'Finish'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleCancel();
                  }}
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

      {/* Debug Controls */}
      {
        DEBUG_ALLOW_MULTIPLE_PER_DAY && (
          <View style={styles.debugContainer}>
            <Text style={styles.debugTitle}>🔧 Debug Tools</Text>
            <View style={styles.debugButtonsRow}>
              <TouchableOpacity
                style={styles.debugButton}
                onPress={async () => {
                  await goalService.debugRewindWeek(currentGoal.id!);
                  // Refresh goal and force re-render of time-dependent values
                  const updated = await goalService.getGoalById(currentGoal.id!);
                  if (updated) setCurrentGoal(updated);
                  setDebugTimeKey(k => k + 1);
                  alert('Rewound 1 week');
                }}
              >
                <Text style={styles.debugButtonText}>-1 W</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.debugButton}
                onPress={async () => {
                  await goalService.debugRewindDay(currentGoal.id!);
                  // Refresh goal and force re-render of time-dependent values
                  const updated = await goalService.getGoalById(currentGoal.id!);
                  if (updated) setCurrentGoal(updated);
                  setDebugTimeKey(k => k + 1);
                  alert('Rewound 1 day');
                }}
              >
                <Text style={styles.debugButtonText}>-1 D</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.debugButton}
                onPress={async () => {
                  console.log('🔧 +1D button clicked!');
                  await goalService.debugAdvanceDay(currentGoal.id!);
                  console.log('🔧 debugAdvanceDay completed');
                  // Refresh goal and force re-render of time-dependent values
                  const updated = await goalService.getGoalById(currentGoal.id!);
                  if (updated) setCurrentGoal(updated);
                  setDebugTimeKey(k => k + 1);
                  alert('Advanced 1 day');
                }}
              >
                <Text style={styles.debugButtonText}>+1 D</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.debugButton}
                onPress={async () => {
                  await goalService.debugAdvanceWeek(currentGoal.id!);
                  // Refresh goal and force re-render of time-dependent values
                  const updated = await goalService.getGoalById(currentGoal.id!);
                  if (updated) setCurrentGoal(updated);
                  setDebugTimeKey(k => k + 1);
                  alert('Advanced 1 week');
                }}
              >
                <Text style={styles.debugButtonText}>+1 W</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      }

      {/* Hint Popup */}
      <HintPopup
        visible={showHint}
        hint={lastHint || ''}
        sessionNumber={lastSessionNumber}
        totalSessions={overallTotal}
        onClose={() => setShowHint(false)}
      />

      {/* Cancel Popup */}
      <Modal
        visible={showCancelPopup}
        transparent
        animationType="fade"
        onRequestClose={closeCancelPopup}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeCancelPopup}
        >
          <Animated.View
            style={[
              styles.modalBox,
              {
                transform: [{ translateY: cancelScale }],
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
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
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* Celebration Modal for Self-Gifted Goals */}
      <Modal
        visible={showCelebration}
        transparent
        animationType="none"
        onRequestClose={() => setShowCelebration(false)}
      >
        <View style={styles.celebrationOverlay}>
          <Animated.View
            style={[
              styles.celebrationContainer,
              {
                opacity: celebrationOpacity,
                transform: [{ scale: celebrationScale }],
              },
            ]}
          >
            {/* Particle Effects */}
            {[...Array(12)].map((_, i) => {
              const angle = (i / 12) * 2 * Math.PI;
              const distance = 80;
              return (
                <Animated.View
                  key={i}
                  style={[
                    styles.particle,
                    {
                      backgroundColor: ['#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'][i % 5],
                      transform: [
                        {
                          translateX: particlesAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, Math.cos(angle) * distance],
                          }),
                        },
                        {
                          translateY: particlesAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, Math.sin(angle) * distance],
                          }),
                        },
                        {
                          scale: particlesAnim.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [0, 1, 0],
                          }),
                        },
                      ],
                      opacity: particlesAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 1, 0],
                      }),
                    },
                  ]}
                />
              );
            })}

            {/* Success Icon */}
            <View style={styles.celebrationIconContainer}>
              <Text style={styles.celebrationIcon}>🎉</Text>
            </View>

            {/* Success Message */}
            <Text style={styles.celebrationTitle}>Amazing!</Text>
            <Text style={styles.celebrationMessage}>Session complete!</Text>
          </Animated.View>
        </View>
      </Modal>
    </Animated.View >
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
  selfChallengeText: { fontSize: 14, color: '#7c3aed', marginBottom: 14, fontWeight: '600' },
  startDateText: { fontSize: 13, color: '#059669', marginBottom: 14, fontWeight: '600' },
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
    marginBottom: 4,
  },
  weekCompleteSub: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '500',
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#b3afafff',
  },
  cancelButtonText: { color: '#fff', fontSize: 16, fontWeight: '400', textAlign: 'center' },
  // Debug Styles
  debugContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  debugButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  debugButton: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  debugButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButtonPopup: {
    backgroundColor: '#F3F4F6',
  },
  confirmButton: {
    backgroundColor: '#EF4444',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  approvalMessageBox: {
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  approvalMessageText: {
    fontSize: 13,
    color: '#78350f',
    lineHeight: 18,
  },
  dateLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
  },
  todayDateLabel: {
    color: '#235c9eff',
    fontWeight: '700',
  },
  todayCircleBorder: {
    borderColor: '#235c9eff',
    borderWidth: 3,
  },
  todayText: {
    color: '#235c9eff',
    fontWeight: '700',
  },
  celebrationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  celebrationContainer: {
    width: 280,
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 40,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  particle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  celebrationIconContainer: {
    marginBottom: 16,
  },
  celebrationIcon: {
    fontSize: 64,
  },
  celebrationTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  celebrationMessage: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },

});

export default DetailedGoalCard;