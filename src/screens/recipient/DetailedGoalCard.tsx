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
  Image,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
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
import { logErrorToFirestore } from '../../utils/errorLogger';
import { serializeNav } from '../../utils/serializeNav';
import { DateHelper } from '../../utils/DateHelper';
import { db } from '../../services/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

import { config } from '../../config/environment';
import { X } from 'lucide-react-native';

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
  const [valentinePartnerName, setValentinePartnerName] = useState<string | null>(null);
  const [partnerProfileImage, setPartnerProfileImage] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserProfileImage, setCurrentUserProfileImage] = useState<string | null>(null);

  // 💝 VALENTINE: Partner waiting modal state
  const [showPartnerWaitingModal, setShowPartnerWaitingModal] = useState(false);

  // 💝 VALENTINE: Real-time partner progress tracking
  const [partnerGoalData, setPartnerGoalData] = useState<{
    weeklyCount: number;
    sessionsPerWeek: number;
    weeklyLogDates: string[];
    isWeekCompleted: boolean;
    isCompleted?: boolean;
    weekStartAt?: any;
    targetCount?: number;
    currentCount?: number;
    title?: string;
  } | null>(null);

  // 💝 VALENTINE: Pulse animation for partner updates
  const [partnerJustUpdated, setPartnerJustUpdated] = useState(false);
  const partnerPulseAnim = useRef(new Animated.Value(1)).current;

  // 💝 VALENTINE: View switcher - toggle between user and partner calendar/progress
  const [selectedView, setSelectedView] = useState<'user' | 'partner'>('user');
  const viewTransitionAnim = useRef(new Animated.Value(1)).current;

  // 💝 VALENTINE: Experience data for revealed mode
  const [valentineExperience, setValentineExperience] = useState<any | null>(null);
  const [valentineChallengeMode, setValentineChallengeMode] = useState<'revealed' | 'secret' | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

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
    // Don't show start date for Valentine goals
    if (currentGoal.valentineChallengeId) return null;

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

      // 🔍 DIAGNOSTIC: Log Valentine goal state after tickWeeklySession
      if (updated.valentineChallengeId) {
        logger.log('💝 handleFinish — tickWeeklySession returned:', {
          isCompleted: updated.isCompleted,
          isFinished: updated.isFinished,
          isUnlocked: updated.isUnlocked,
          isWeekCompleted: updated.isWeekCompleted,
          weeklyCount: updated.weeklyCount,
          sessionsPerWeek: updated.sessionsPerWeek,
          currentCount: updated.currentCount,
          targetCount: updated.targetCount,
          valentineChallengeId: updated.valentineChallengeId,
        });
      }

      pulse.setValue(0);
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();

      setCurrentGoal(updated);

      // 💝 VALENTINE: Auto-switch to user's calendar after completing session
      if (currentGoal.valentineChallengeId) {
        setSelectedView('user');
      }

      // Check if this is a Valentine goal
      const isValentineGoal = !!updated.valentineChallengeId;

      let gift: any = null;
      let experience: any = null;

      // Only fetch experience for non-Valentine goals
      if (!isValentineGoal && updated.experienceGiftId) {
        gift = await experienceGiftService.getExperienceGiftById(updated.experienceGiftId);
        experience = await experienceService.getExperienceById(gift.experienceId);
      }

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
        // ✅ GOAL COMPLETION - Handle both Valentine and standard goals
        if (updated.valentineChallengeId) {
          // 💝 VALENTINE GOAL COMPLETION
          logger.log('💝 handleFinish — Valentine goal COMPLETED! Building valentine gift...');
          try {
            // Fetch the Valentine challenge and its experience
            const valentineGift = await buildValentineGift(updated);
            logger.log('💝 handleFinish — buildValentineGift result:', valentineGift ? 'FOUND' : 'NULL');

            if (valentineGift) {
              // 💝 SECURITY: Check unlock status to determine navigation
              if (updated.isUnlocked) {
                // ✅ Both partners finished - navigate to completion
                logger.log('💝 Both partners finished - navigating to completion with Valentine challenge data');
                navigation.navigate('Completion', {
                  goal: serializeNav(updated),
                  experienceGift: serializeNav(valentineGift),
                });
              } else if (updated.isFinished) {
                // ⏳ You finished, waiting for partner
                logger.log('💝 You finished! Waiting for partner to complete their goal');
                setShowPartnerWaitingModal(true);
              } else {
                // ⚠️ This shouldn't happen - goal marked as completed but not finished
                logger.warn('💝 Goal marked completed but not finished - unexpected state');
                Alert.alert('Goal Progress', 'Keep going! Complete all your sessions to finish the goal.');
              }
            } else {
              logger.error('💝 Valentine challenge document not found in Firestore for ID:', updated.valentineChallengeId);
              Alert.alert('🎉 Goal Completed!', 'Congratulations on completing your Valentine challenge!');
            }
          } catch (error) {
            logger.error('Error fetching Valentine challenge for completion:', error);
            await logErrorToFirestore(error, {
              screenName: 'DetailedGoalCard',
              feature: 'ValentineCompletion',
              additionalData: {
                goalId: updated.id,
                valentineChallengeId: updated.valentineChallengeId,
              },
            });
            Alert.alert('🎉 Goal Completed!', 'Congratulations on completing your Valentine challenge!');
          }
        } else if (gift) {
          // ✅ STANDARD GOAL COMPLETION
          // Only notify the giver if they're different from the user (don't send self-notifications)
          if (updated.empoweredBy && updated.empoweredBy !== updated.userId && experience) {
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

          // Navigate to completion screen for standard goals
          navigation.navigate('Completion', {
            goal: serializeNav(updated),
            experienceGift: serializeNav(gift),
          });
        }
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
          // No personalized hint - fetch AI-generated hint from cache
          // The hint was generated for session totalSessionsDone + 2 at start time
          // After completing, we want to show it for the current session
          const aiHintSessionNumber = totalSessionsDone + 1;
          const isSecretValentine = isValentineGoal && !updated.isRevealed;
          const hintExperience = isValentineGoal ? valentineExperience : experience;

          try {
            // Fetch from cache (should be available since we generated it in background)
            let cachedHint = await aiHintService.getHint(goalId, aiHintSessionNumber);

            // If cache miss for secret Valentine goals, generate on demand
            if (!cachedHint && isSecretValentine) {
              const generated = await aiHintService.generateHint({
                goalId,
                experienceType: hintExperience?.title || 'experience',
                experienceDescription: hintExperience?.description || undefined,
                experienceCategory: hintExperience?.category || undefined,
                experienceSubtitle: hintExperience?.subtitle || undefined,
                sessionNumber: aiHintSessionNumber,
                totalSessions: updated.targetCount * updated.sessionsPerWeek,
                userName: recipientName || undefined,
              });
              cachedHint = generated.hint;
            }

            hintToShow = cachedHint || "Keep going! You're doing great 💪";

            if (cachedHint) {
              logger.log(`✅ Retrieved AI hint for session ${aiHintSessionNumber}`);

              // Save to session history
              const hintObj = {
                id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                session: aiHintSessionNumber,
                hint: cachedHint,
                date: Date.now(),
                text: cachedHint
              };
              await goalService.appendHint(goalId, hintObj);

              setCurrentGoal((prev) => ({
                ...prev,
                hints: [...(prev.hints || []), hintObj],
              }));

              updated.hints = [...(updated.hints || []), hintObj];
            }
          } catch (err) {
            logger.warn('Failed to retrieve/save AI hint:', err);
            hintToShow = "Keep going! You're doing great 💪";
          }
          setLastHint(hintToShow);
        }

        // Show hint popup for:
        // 1. Normal gifts (not self-gifted)
        // 2. Valentine goals that are in Secret mode (not revealed)
        const isSecretValentine = isValentineGoal && !updated.isRevealed;

        if (!isSelfGift || isSecretValentine) {
          setShowHint(true);
        } else {
          // Show celebration animation for self-gifted goals or Valentine goals
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setShowCelebration(true);

          // Auto-dismiss after 3 seconds
          setTimeout(() => {
            setShowCelebration(false);
          }, 3000);
        }

        // 💝 VALENTINE: Show week-completion alert when a week is done but goal isn't
        if (isValentineGoal && updated.isWeekCompleted) {
          const weeksComplete = updated.currentCount + 1;
          const weeksRemaining = updated.targetCount - weeksComplete;
          Alert.alert(
            '🎉 Week Complete!',
            `Great job! You finished week ${weeksComplete} of ${updated.targetCount}.\n\n${weeksRemaining > 0 ? `${weeksRemaining} week${weeksRemaining > 1 ? 's' : ''} remaining. Your next week starts in 7 days!` : ''}`,
            [{ text: 'Awesome!' }]
          );
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

        // Only notify the giver if they're different from the user and it's not a Valentine goal
        if (!updated.valentineChallengeId && updated.empoweredBy && updated.empoweredBy !== updated.userId && experience) {
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

        // 💝 VALENTINE: Enhanced partner notifications with milestones
        if (updated.valentineChallengeId && updated.partnerGoalId) {
          try {
            const partnerGoalDoc = await getDoc(doc(db, 'goals', updated.partnerGoalId));
            if (partnerGoalDoc.exists()) {
              const partnerUserId = partnerGoalDoc.data().userId;
              const partnerGoal = partnerGoalDoc.data();

              // Milestone detection
              const isFirstSession = updated.weeklyCount === 1;
              const isHalfway = updated.weeklyCount === Math.floor(updated.sessionsPerWeek / 2) && updated.sessionsPerWeek >= 3;
              const sessionsRemaining = updated.sessionsPerWeek - updated.weeklyCount;
              const isAlmostDone = sessionsRemaining === 1 && !updated.isWeekCompleted;

              let notificationType = 'valentine_partner_progress';
              let notificationTitle = `💕 ${recipientName} completed a session!`;
              let notificationMessage = `Progress: ${updated.weeklyCount}/${updated.sessionsPerWeek} sessions this week.`;

              // 🎯 MILESTONE NOTIFICATIONS
              if (isFirstSession) {
                notificationType = 'valentine_milestone';
                notificationTitle = `💕 ${recipientName} started the week!`;
                notificationMessage = `Your partner completed their first session for week ${updated.currentCount + 1}. Let's keep the momentum going!`;
              } else if (updated.isWeekCompleted) {
                // Week just completed - check if partner is also ready
                const partnerSessionsRemaining = partnerGoal.sessionsPerWeek - partnerGoal.weeklyCount;

                if (partnerGoal.isWeekCompleted) {
                  // 🚀 BOTH COMPLETED - Celebration!
                  notificationType = 'valentine_celebration';
                  notificationTitle = '🚀 Both ready for next week!';
                  notificationMessage = `You've both completed week ${updated.currentCount + 1}! Moving forward together.`;
                } else {
                  // Partner still needs to finish
                  notificationType = 'valentine_sync';
                  notificationTitle = `🎉 ${recipientName} finished the week!`;
                  notificationMessage = partnerSessionsRemaining === 1
                    ? "Complete your last session to advance together!"
                    : `Complete your last ${partnerSessionsRemaining} sessions to advance together!`;
                }
              } else if (isAlmostDone) {
                notificationType = 'valentine_milestone';
                notificationTitle = `💪 ${recipientName} almost finished!`;
                notificationMessage = `Just 1 more session to complete the week together!`;
              } else if (isHalfway) {
                notificationType = 'valentine_milestone';
                notificationTitle = `🔥 ${recipientName} is halfway there!`;
                notificationMessage = `Progress: ${updated.weeklyCount}/${updated.sessionsPerWeek} sessions. You're both doing great!`;
              }

              await notificationService.createNotification(
                partnerUserId,
                notificationType,
                notificationTitle,
                notificationMessage,
                {
                  goalId: updated.id,
                  partnerGoalId: updated.partnerGoalId,
                  valentineChallengeId: updated.valentineChallengeId,
                  sessionNumber: totalSessionsDone,
                  weekNumber: updated.currentCount + 1,
                }
              );
            }
          } catch (error) {
            logger.warn('Failed to notify Valentine partner:', error);
            // Non-critical, don't block the flow
          }
        }
      }
    } catch (err) {
      logger.error(err);
      await logErrorToFirestore(err, {
        screenName: 'DetailedGoalCard',
        feature: 'UpdateGoalProgress',
        additionalData: {
          goalId: currentGoal.id,
          isValentineGoal: !!currentGoal.valentineChallengeId,
        },
      });
      Alert.alert('Error', 'Could not update goal progress.');
    } finally {
      setLoading(false);
    }
  };

  // 💝 VALENTINE: Show waiting modal when partner hasn't finished yet
  useEffect(() => {
    if (showPartnerWaitingModal) {
      Alert.alert(
        '🎉 Goal Complete!',
        `Congratulations! You've completed all your sessions!\n\nWaiting for ${valentinePartnerName || 'your partner'} to finish their goal. Once they complete, you'll both be able to redeem your experience together.\n\nWe'll notify you when they're done! 💕`,
        [
          {
            text: 'Got it!',
            onPress: () => {
              setShowPartnerWaitingModal(false);
              // Stay on GoalsScreen so user can watch partner's progress
            }
          }
        ]
      );
    }
  }, [showPartnerWaitingModal, valentinePartnerName]);

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
      // Check if this is a Valentine goal (has valentineChallengeId and no experienceGiftId)
      const isValentineGoal = !!currentGoal.valentineChallengeId;

      let experience: any = null;
      let recipientName = await userService.getUserName(currentGoal.userId);

      // Only fetch experience gift if it's not a Valentine goal
      if (!isValentineGoal && currentGoal.experienceGiftId) {
        const gift = await experienceGiftService.getExperienceGiftById(currentGoal.experienceGiftId);
        experience = await experienceService.getExperienceById(gift.experienceId);
      }

      // SECURITY: Validate session timing to prevent rapid completion exploits
      const MIN_SESSION_INTERVAL_MS = 60000; // 1 minute between sessions
      const nowCheck = Date.now();

      // Check if there was a previous session
      if (currentGoal.weeklyLogDates && currentGoal.weeklyLogDates.length > 0) {
        // Get the most recent session timestamp
        const lastSessionDate = currentGoal.weeklyLogDates[currentGoal.weeklyLogDates.length - 1];
        const lastSessionTime = new Date(lastSessionDate).getTime();

        const timeSinceLastSession = nowCheck - lastSessionTime;

        // Only enforce delay if the previous session was in the PAST (positive time difference)
        // If timeSinceLastSession is negative, it means the last session date is in the future 
        // (likely due to dev/test time skipping), so we should allow it.
        if (timeSinceLastSession > 0 && timeSinceLastSession < MIN_SESSION_INTERVAL_MS) {
          const secondsRemaining = Math.ceil((MIN_SESSION_INTERVAL_MS - timeSinceLastSession) / 1000);
          Alert.alert(
            'Too Fast!',
            `Please wait ${secondsRemaining} seconds between sessions to ensure quality completion.`,
            [{ text: 'OK' }]
          );
          setLoading(false);
          return;
        }
      }

      // CRITICAL FIX: Use weeklyCount, not weeklyLogDates.length.
      const funcTotalSessionsDone =
        (currentGoal.currentCount * currentGoal.sessionsPerWeek) + currentGoal.weeklyCount;
      const funcTotalSessions = currentGoal.targetCount * currentGoal.sessionsPerWeek;

      // ✅ START TIMER IMMEDIATELY (non-blocking)
      await startTimer(currentGoal.id, null);

      // ✅ Generate hint in background (don't await - don't block timer)
      // Allow hint generation for secret Valentine goals
      const nextSessionNumber = funcTotalSessionsDone + 2;
      const hasPersonalizedHintForNextSession =
        currentGoal.personalizedNextHint &&
        currentGoal.personalizedNextHint.forSessionNumber === nextSessionNumber;

      const hintExperience = isValentineGoal ? valentineExperience : experience;
      const hasHintExperience = isValentineGoal ? true : !!experience;
      const canGenerateHints =
        funcTotalSessionsDone != funcTotalSessions &&
        !hasPersonalizedHintForNextSession &&
        hasHintExperience &&
        (!isValentineGoal || currentGoal.isRevealed === false);

      if (canGenerateHints) {
        // Fire and forget - hint will be saved when ready
        aiHintService.generateHint({
          goalId,
          experienceType: hintExperience?.title || 'experience',
          experienceDescription: hintExperience?.description || undefined,
          experienceCategory: hintExperience?.category || undefined,
          experienceSubtitle: hintExperience?.subtitle || undefined,
          sessionNumber: nextSessionNumber,
          totalSessions: funcTotalSessions,
          userName: recipientName || undefined,
        }).then(({ hint, category }) => {
          logger.log(`✅ Background hint generated for session ${nextSessionNumber}${category ? ` (category: ${category})` : ''}`);
        }).catch((err) => {
          logger.warn('Background hint generation failed:', err);
        });
      }

      // Schedule push notification for when timer completes
      // Only schedule if there's a defined target duration
      const totalGoalSeconds = (currentGoal.targetHours || 0) * 3600 + (currentGoal.targetMinutes || 0) * 60;

      if (totalGoalSeconds > 0) {
        const notifId = await pushNotificationService.scheduleSessionCompletionNotification(
          goalId,
          totalGoalSeconds
        );
        logger.log(`📱 Scheduled session notification with ID: ${notifId} for ${totalGoalSeconds}s`);
      }

    } catch (err) {
      logger.warn('Session start failed:', err);
      // Timer already started, so user experience is not blocked
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
          try {
            // Samsung Internet PWA throws "Illegal constructor" for new Notification()
            // We need to use ServiceWorkerRegistration.showNotification() instead, 
            // but for now, just try-catch to prevent crash
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
          } catch (e) {
            // Fallback: try service worker notification if available, or just ignore
            logger.warn('Failed to create browser notification:', e);
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.ready.then(registration => {
                registration.showNotification("⏰ Session Time's Up!", {
                  body: "Great job! You can now finish your session and log your progress.",
                  icon: '/icon-192.png',
                  badge: '/icon-192.png',
                  tag: `session-${currentGoal.id}`,
                  requireInteraction: true,
                });
              }).catch(err => logger.warn('Service worker notification failed:', err));
            }
          }
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
      await logErrorToFirestore(error, {
        screenName: 'DetailedGoalCard',
        feature: 'SessionCancellation',
        additionalData: {
          goalId: currentGoal.id,
        },
      });
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

  // Fetch Valentine partner's name
  useEffect(() => {
    if (currentGoal.userId) {
      // Fetch current user name
      userService.getUserName(currentGoal.userId)
        .then(setCurrentUserName)
        .catch(() => { });

      // Fetch current user profile image
      userService.getUserById(currentGoal.userId)
        .then(user => {
          if (user?.profile?.profileImageUrl && user.profile.profileImageUrl.trim() !== '') {
            setCurrentUserProfileImage(user.profile.profileImageUrl);
          }
        })
        .catch(() => { });
    }
  }, [currentGoal.userId]);

  // Fetch Valentine partner name and profile image
  useEffect(() => {
    const fetchPartnerName = async () => {
      logger.log('Valentine check:', {
        hasValentineChallenge: !!currentGoal.valentineChallengeId,
        hasPartnerGoal: !!currentGoal.partnerGoalId,
        valentineChallengeId: currentGoal.valentineChallengeId,
        partnerGoalId: currentGoal.partnerGoalId,
      });

      if (currentGoal.valentineChallengeId && currentGoal.partnerGoalId) {
        try {
          logger.log('Fetching partner goal:', currentGoal.partnerGoalId);
          const partnerGoalDoc = await getDoc(doc(db, 'goals', currentGoal.partnerGoalId));
          if (partnerGoalDoc.exists()) {
            const partnerUserId = partnerGoalDoc.data().userId;
            logger.log('Partner userId:', partnerUserId);
            const partnerName = await userService.getUserName(partnerUserId);
            logger.log('Partner name fetched:', partnerName);
            setValentinePartnerName(partnerName);

            // 💝 Fetch partner profile image
            try {
              const partnerUser = await userService.getUserById(partnerUserId);
              // Profile image is nested in profile object
              if (partnerUser?.profile?.profileImageUrl && partnerUser.profile.profileImageUrl.trim() !== '') {
                setPartnerProfileImage(partnerUser.profile.profileImageUrl);
              }
            } catch (imgError) {
              logger.warn('Could not fetch partner profile image:', imgError);
            }
          } else {
            logger.warn('Partner goal document does not exist');
          }
        } catch (error) {
          logger.warn('Failed to fetch Valentine partner info:', error);
        }
      }
    };
    fetchPartnerName();
  }, [currentGoal.valentineChallengeId, currentGoal.partnerGoalId]);

  // 💝 VALENTINE: Real-time listener for partner's goal progress
  useEffect(() => {
    if (!currentGoal.valentineChallengeId || !currentGoal.partnerGoalId) {
      setPartnerGoalData(null);
      return;
    }

    logger.log('💕 Setting up partner goal listener:', currentGoal.partnerGoalId);

    const unsubscribe = onSnapshot(
      doc(db, 'goals', currentGoal.partnerGoalId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const newCount = data.weeklyCount || 0;
          const previousCount = partnerGoalData?.weeklyCount || 0;

          // 💫 Trigger pulse animation if partner just completed a session
          if (newCount > previousCount && previousCount > 0) {
            setPartnerJustUpdated(true);
            Animated.sequence([
              Animated.timing(partnerPulseAnim, {
                toValue: 1.15,
                duration: 300,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(partnerPulseAnim, {
                toValue: 1,
                duration: 400,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
            ]).start(() => setPartnerJustUpdated(false));
          }

          setPartnerGoalData({
            weeklyCount: newCount,
            sessionsPerWeek: data.sessionsPerWeek || 1,
            weeklyLogDates: data.weeklyLogDates || [],
            isWeekCompleted: data.isWeekCompleted || false,
            isCompleted: data.isCompleted || false,
            weekStartAt: data.weekStartAt,
            targetCount: data.targetCount || 1,
            currentCount: data.currentCount || 0,
            title: data.title || undefined,
          });
          logger.log('💕 Partner progress updated:', {
            weeklyCount: newCount,
            isWeekCompleted: data.isWeekCompleted,
          });
        }
      },
      (error) => {
        logger.error('Error listening to partner goal:', error);
      }
    );

    return () => unsubscribe();
  }, [currentGoal.valentineChallengeId, currentGoal.partnerGoalId, partnerGoalData?.weeklyCount]);

  // 💝 VALENTINE: Listen for goal unlock when waiting for partner
  useEffect(() => {
    if (!currentGoal.id || !currentGoal.isFinished || currentGoal.isUnlocked || !currentGoal.valentineChallengeId) {
      return;
    }

    logger.log('💕 Setting up unlock listener for finished goal');

    const unsubscribe = onSnapshot(
      doc(db, 'goals', currentGoal.id),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();

          // Partner just finished! Both goals unlocked
          if (data.isUnlocked && !currentGoal.isUnlocked) {
            logger.log('💕 Partner finished! Goal unlocked.');

            // Update local state
            setCurrentGoal((prev) => ({
              ...prev,
              isUnlocked: true,
              unlockedAt: data.unlockedAt?.toDate(),
            }));

            // Show alert and navigate to completion
            Alert.alert(
              '🎉 Partner Finished!',
              `${valentinePartnerName || 'Your partner'} has completed their goal! You can both now redeem your experience together.`,
              [
                {
                  text: 'View Completion',
                  onPress: async () => {
                    try {
                      const gift = await buildValentineGift(currentGoal);
                      if (!gift) {
                        logger.error('Valentine challenge not found for completion navigation');
                        return;
                      }
                      navigation.navigate('Completion', {
                        goal: serializeNav({ ...currentGoal, isUnlocked: true }),
                        experienceGift: serializeNav(gift),
                      });
                    } catch (error) {
                      logger.error('Error navigating to completion:', error);
                    }
                  }
                }
              ]
            );
          }
        }
      },
      (error) => {
        logger.error('Error listening to goal unlock:', error);
      }
    );

    return () => unsubscribe();
  }, [currentGoal.id, currentGoal.isFinished, currentGoal.isUnlocked, currentGoal.valentineChallengeId, valentinePartnerName]);

  // 💝 VALENTINE: Fetch challenge and experience data for revealed mode
  useEffect(() => {
    const fetchValentineExperience = async () => {
      if (!currentGoal.valentineChallengeId) {
        setValentineExperience(null);
        setValentineChallengeMode(null);
        return;
      }

      try {
        const challengeDoc = await getDoc(doc(db, 'valentineChallenges', currentGoal.valentineChallengeId));
        if (challengeDoc.exists()) {
          const challengeData = challengeDoc.data();
          setValentineChallengeMode(challengeData.mode);

          // Fetch experience for both modes (secret uses it for hints, revealed for UI)
          if (challengeData.experienceId) {
            const experience = await experienceService.getExperienceById(challengeData.experienceId);
            setValentineExperience(experience);
            logger.log('💝 Fetched Valentine experience:', experience?.title);
          } else {
            setValentineExperience(null);
          }
        }
      } catch (error) {
        logger.error('Error fetching Valentine challenge/experience:', error);
      }
    };

    fetchValentineExperience();
  }, [currentGoal.valentineChallengeId]);


  // Real-time listener for goal updates (especially for Valentine partner linking)
  useEffect(() => {
    if (!currentGoal.id) return;

    const unsubscribe = onSnapshot(doc(db, 'goals', currentGoal.id), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();

        // Helper to convert timestamp to Date
        // usage: val?.toDate ? val.toDate() : val
        const toDate = (val: any) => val?.toDate ? val.toDate() : val;

        const updatedGoal = {
          id: snapshot.id,
          ...data,
          // Explicitly normalize all potential Date fields
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
          startDate: toDate(data.startDate),
          endDate: toDate(data.endDate),
          weekStartAt: toDate(data.weekStartAt),
          plannedStartDate: toDate(data.plannedStartDate),
          approvalDeadline: toDate(data.approvalDeadline),
          approvalRequestedAt: toDate(data.approvalRequestedAt),
        } as unknown as Goal;

        logger.log('Goal updated from Firestore listener', {
          id: updatedGoal.id,
          hasPartner: !!updatedGoal.partnerGoalId,
          partnerId: updatedGoal.partnerGoalId
        });
        setCurrentGoal(updatedGoal);
      }
    }, (error) => {
      logger.error('Error listening to goal updates:', error);
    });

    return () => unsubscribe();
  }, [currentGoal.id]);

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

  // 💝 NOTE: weekDates, loggedSet, weeklyFilled, weeklyTotal, completedWeeks, overallTotal, todayIso
  // are now computed dynamically based on selectedView (see lines below handleViewSwitch)

  const alreadyLoggedToday = useMemo(() => {
    const logDates = selectedView === 'user'
      ? (currentGoal.weeklyLogDates || [])
      : (partnerGoalData?.weeklyLogDates || []);
    const today = isoDay(DateHelper.now());
    return new Set(logDates).has(today);
  }, [selectedView, currentGoal.weeklyLogDates, partnerGoalData?.weeklyLogDates, debugTimeKey]);

  // Calculate total sessions done
  const totalSessionsDone = useMemo(() => {
    return (currentGoal.currentCount * currentGoal.sessionsPerWeek) + currentGoal.weeklyCount;
  }, [currentGoal.currentCount, currentGoal.sessionsPerWeek, currentGoal.weeklyCount]);

  // Calculate total sessions
  const totalSessions = useMemo(() => {
    return currentGoal.targetCount * currentGoal.sessionsPerWeek;
  }, [currentGoal.targetCount, currentGoal.sessionsPerWeek]);

  // Check if user has personalized hint waiting AFTER the next session
  // Hint creation logic: When giver sees recipient completed X sessions, hint is saved for session X + 2
  // This is because: completed X sessions → about to start session X+1 → hint is FOR session X+2 (the one after)
  // 
  // So the banner should show: "Complete this session to see hint"
  // Which means: I'm about to start session Y, and hint is for session Y+1
  // Formula: hint.forSessionNumber === (totalSessionsDone + 1) + 1 = totalSessionsDone + 2
  const hasPersonalizedHintWaiting = useMemo(() => {
    if (!currentGoal.personalizedNextHint || isTimerRunning) return false;

    // Show banner if the hint will appear AFTER completing the current session
    // If I've completed 2 sessions (totalSessionsDone = 2):
    // - I'm viewing the card, about to start session 3
    // - Hint was created when I had 2 sessions done, so it's labeled for session 2 + 2 = 4
    // -  I should see the banner saying "complete this session (3) to see hint (for session 4)"
    // - So check: hint.forSessionNumber (4) === totalSessionsDone (2) + 2 ✅

    const result = currentGoal.personalizedNextHint.forSessionNumber === (totalSessionsDone + 2);

    return result;
  }, [currentGoal.personalizedNextHint, isTimerRunning, totalSessionsDone]);

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

  // 💝 VALENTINE: Handle view switching between user and partner
  const handleViewSwitch = (view: 'user' | 'partner') => {
    if (view === selectedView || !partnerGoalData) return; // Already selected or no partner data

    // Smooth bounce animation on switch
    Animated.sequence([
      Animated.timing(viewTransitionAnim, {
        toValue: 0.92,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(viewTransitionAnim, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    setSelectedView(view);
    logger.log(`💝 Switched view to: ${view}`);
  };

  // 💝 VALENTINE: Compute displayed data based on selected view
  const displayedWeekStart = selectedView === 'user'
    ? currentGoal.weekStartAt
    : partnerGoalData?.weekStartAt;

  const displayedLogDates = selectedView === 'user'
    ? currentGoal.weeklyLogDates || []
    : partnerGoalData?.weeklyLogDates || [];

  const displayedWeeklyCount = selectedView === 'user'
    ? currentGoal.weeklyCount
    : partnerGoalData?.weeklyCount || 0;

  const displayedSessionsPerWeek = selectedView === 'user'
    ? currentGoal.sessionsPerWeek
    : partnerGoalData?.sessionsPerWeek || 1;

  const displayedCurrentCount = selectedView === 'user'
    ? currentGoal.currentCount
    : partnerGoalData?.currentCount || 0;

  const displayedTargetCount = selectedView === 'user'
    ? currentGoal.targetCount
    : partnerGoalData?.targetCount || 1;

  const displayedName = selectedView === 'user'
    ? (currentUserName || 'You')
    : (valentinePartnerName || 'Partner');

  const displayedTitle = selectedView === 'user'
    ? currentGoal.title
    : (partnerGoalData?.title || currentGoal.title);

  const displayedColor = selectedView === 'user' ? '#FF6B9D' : '#C084FC';

  // 💝 VALENTINE: Compute calendar and progress data for selected view
  const weekStart = displayedWeekStart || currentGoal.weekStartAt;

  // Generate week dates array using rolling week function
  const weekDates = useMemo(() => {
    // Depend on debugTimeKey to force recalculation when debug time changes
    void debugTimeKey;

    // Handle Firestore Timestamps, Date objects, and strings
    let start: Date;
    if (!weekStart) {
      start = DateHelper.now();
    } else if (typeof weekStart === 'object' && 'toDate' in weekStart) {
      // Firestore Timestamp
      start = weekStart.toDate();
    } else if (weekStart instanceof Date) {
      start = new Date(weekStart);
    } else {
      // String or number
      start = new Date(weekStart);
    }

    start.setHours(0, 0, 0, 0);
    return rollingWeek(start);
  }, [weekStart, debugTimeKey]);

  const loggedSet = new Set(displayedLogDates);
  const weeklyFilled = displayedWeeklyCount;
  const weeklyTotal = displayedSessionsPerWeek;
  const overallTotal = displayedTargetCount;
  const todayIso = isoDay(DateHelper.now());

  // Calculate completed weeks for displayed user
  const completedWeeks = useMemo(() => {
    const finishedThisWeek = displayedWeeklyCount >= displayedSessionsPerWeek;
    const base = displayedCurrentCount || 0;
    const total = displayedTargetCount || 1;
    // For selected view: if looking at user and they're completed, show all weeks
    // Otherwise calculate based on current progress
    if (selectedView === 'user' && currentGoal.isCompleted) return total;
    if (selectedView === 'partner' && partnerGoalData?.isCompleted) return total;
    return Math.min(base + (finishedThisWeek ? 1 : 0), total);
  }, [selectedView, displayedWeeklyCount, displayedSessionsPerWeek, displayedCurrentCount, displayedTargetCount, currentGoal.isCompleted, partnerGoalData?.isCompleted]);

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
          {/* Hearts background decoration for Valentine goals */}
          {!!currentGoal.valentineChallengeId && (
            <View style={styles.heartsBackground}>
              {/* Top right cluster - small hearts */}
              <Text style={[styles.heartIcon, { top: 8, right: 15, fontSize: 18, transform: [{ rotate: '15deg' }], opacity: 0.3 }]}>❤️</Text>
              <Text style={[styles.heartIcon, { top: 22, right: 35, fontSize: 14, transform: [{ rotate: '-25deg' }], opacity: 0.25 }]}>❤️</Text>
              <Text style={[styles.heartIcon, { top: 38, right: 20, fontSize: 20, transform: [{ rotate: '18deg' }], opacity: 0.2 }]}>❤️</Text>


            </View>
          )}
          <Text style={styles.title}>{currentGoal.valentineChallengeId ? displayedTitle : currentGoal.title}</Text>
          {/* Show empowered text only if NOT self-gifted */}
          {!!empoweredName && !isSelfGift && <Text style={styles.empoweredText}>⚡ Empowered by {empoweredName}</Text>}
          {/* Show self-challenge badge for self-gifted goals */}
          {isSelfGift && <Text style={styles.selfChallengeText}>🏆 Self-Challenge</Text>}
          {/* Show Valentine badge for Valentine goals with partner name */}
          {!!currentGoal.valentineChallengeId && (
            <Text style={styles.valentineChallengeText}>
              Valentine's Challenge{valentinePartnerName ? ` with ${valentinePartnerName}` : ''}
            </Text>
          )}
          {/* Show planned start date */}
          {startDateText && <Text style={styles.startDateText}>{startDateText}</Text>}

          {/* 💝 VALENTINE: Partner Progress Display */}
          {!!currentGoal.valentineChallengeId && partnerGoalData && (
            <View style={styles.valentineProgressContainer}>

              {/* Side-by-side Progress - Clickable to switch view */}
              <View style={styles.partnerProgressRow}>
                {/* User Progress */}
                <Pressable
                  onPress={() => handleViewSwitch('user')}
                  style={({ pressed }) => [
                    styles.partnerProgressCol,
                    selectedView === 'user' && styles.partnerProgressColSelected,
                    selectedView !== 'user' && styles.partnerProgressColUnselected,
                    pressed && styles.partnerProgressColPressed,
                  ]}
                >
                  <View style={styles.partnerAvatarContainer}>
                    {currentUserProfileImage ? (
                      <Image
                        source={{ uri: currentUserProfileImage }}
                        style={[styles.partnerAvatar, styles.partnerAvatarImage, styles.userAvatar]}
                      />
                    ) : (
                      <View style={[styles.partnerAvatar, styles.userAvatar]}>
                        <Text style={styles.partnerAvatarText}>
                          {currentUserName ? currentUserName.charAt(0).toUpperCase() : 'Y'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={styles.partnerProgressLabel}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    Your Progress
                  </Text>
                </Pressable>

                {/* Divider */}
                <View style={styles.partnerDivider} />

                {/* Partner Progress */}
                <Pressable
                  onPress={() => handleViewSwitch('partner')}
                  style={({ pressed }) => [
                    styles.partnerProgressCol,
                    selectedView === 'partner' && styles.partnerProgressColSelected,
                    selectedView !== 'partner' && styles.partnerProgressColUnselected,
                    pressed && styles.partnerProgressColPressed,
                  ]}
                >
                  <View style={styles.partnerAvatarContainer}>
                    {partnerProfileImage ? (
                      <Image
                        source={{ uri: partnerProfileImage }}
                        style={[styles.partnerAvatar, styles.partnerAvatarImage]}
                      />
                    ) : (
                      <View style={[styles.partnerAvatar, styles.partnerAvatarPlaceholder]}>
                        <Text style={styles.partnerAvatarText}>
                          {valentinePartnerName ? valentinePartnerName.charAt(0).toUpperCase() : '💜'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={styles.partnerProgressLabel}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {valentinePartnerName || 'Partner'}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* 💝 VALENTINE: Experience Details for Revealed Mode */}
          {valentineChallengeMode === 'revealed' && valentineExperience && (
            <View style={styles.valentineExperienceSection}>
              <View style={styles.valentineExperienceHeader}>
                <Image
                  source={{ uri: valentineExperience.coverImageUrl }}
                  style={styles.valentineExperienceThumbnail}
                />
                <View style={styles.valentineExperienceInfo}>
                  <Text style={styles.valentineExperienceTitle} numberOfLines={1}>
                    {valentineExperience.title}
                  </Text>
                  {valentineExperience.subtitle && (
                    <Text style={styles.valentineExperienceSubtitle} numberOfLines={1}>
                      {valentineExperience.subtitle}
                    </Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={styles.viewExperienceButton}
                onPress={() => setShowDetailsModal(true)}
              >
                <Text style={styles.viewExperienceButtonText}>View Experience Details</Text>
              </TouchableOpacity>
            </View>
          )}


          {/* 💝 VALENTINE: Calendar Owner Label */}
          {!!currentGoal.valentineChallengeId && partnerGoalData && (
            <Animated.View
              style={[
                styles.calendarOwnerLabel,
                {
                  opacity: viewTransitionAnim,
                }
              ]}
            >
              <View style={styles.calendarOwnerContent}>
                <Text style={styles.calendarOwnerText}>
                  {displayedName}'s Calendar
                </Text>
              </View>
              <View style={[styles.calendarOwnerUnderline, { backgroundColor: displayedColor }]} />
            </Animated.View>
          )}

          {/* Weekly Calendar - Switches between user and partner data */}
          <Animated.View
            style={{
              opacity: viewTransitionAnim,
              transform: [{ scale: viewTransitionAnim }]
            }}
          >
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
          </Animated.View>

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
                <Text style={styles.weekCompleteText}>You've completed this week!</Text>
                <Text style={styles.weekCompleteSub}>
                  Next week starts on {formatNextWeekDay(currentGoal.weekStartAt)}
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
                {(currentGoal.valentineChallengeId && currentGoal.isFinished && !currentGoal.isUnlocked) ? (
                  // 💝 VALENTINE: Waiting for partner state - Show simplified waiting box
                  <LinearGradient
                    colors={['#FFF4ED', '#FFE5EF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.waitingBanner}
                  >
                    <View style={styles.waitingTextContainer}>
                      <Text style={styles.waitingTitle}>
                        You've Completed Your Goal! 🎉
                      </Text>
                      <Text style={styles.waitingSubtext}>
                        Waiting for {valentinePartnerName || 'partner'} to finish...
                      </Text>
                    </View>
                  </LinearGradient>
                ) : (isGoalLocked(currentGoal) && currentGoal.targetCount === 1 && currentGoal.sessionsPerWeek === 1)
                  || (isGoalLocked(currentGoal) && currentGoal.targetCount >= 1 && currentGoal.weeklyCount >= 1) ? (
                  <View style={styles.disabledStartContainer}>
                    <Text style={styles.disabledStartText}>Waiting for approval</Text>
                  </View>
                ) : (currentGoal.valentineChallengeId && !currentGoal.partnerGoalId) ? (
                  <View style={styles.disabledStartContainer}>
                    <Text style={styles.disabledStartText}>Waiting for Partner</Text>
                    <Text style={[styles.disabledStartText, { fontSize: 13, marginTop: 4 }]}>
                      Your partner needs to redeem their code first
                    </Text>
                  </View>
                ) : alreadyLoggedToday && !DEBUG_ALLOW_MULTIPLE_PER_DAY ? (
                  <View style={styles.disabledStartContainer}>
                    <Text style={styles.disabledStartText}>You already made progress today</Text>
                    <Text style={styles.disabledStartText}>Come back tomorrow for more 💪</Text>
                  </View>
                ) : (
                  <View>
                    {/* Subtle Personalized Hint Indicator */}
                    {hasPersonalizedHintWaiting && currentGoal.personalizedNextHint && (
                      <Text style={styles.hintIndicator}>
                        💝 {currentGoal.personalizedNextHint.giverName} left you a hint for next session. Complete session now to view it!
                      </Text>
                    )}

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

      {/* 💝 VALENTINE: Experience Details Modal */}
      <Modal
        visible={showDetailsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={styles.valentineModalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Close Button */}
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowDetailsModal(false)}
              >
                <X color="#6B7280" size={24} />
              </TouchableOpacity>

              {/* Cover Image */}
              {valentineExperience && (
                <>
                  <Image
                    source={{ uri: valentineExperience.coverImageUrl }}
                    style={styles.modalImage}
                    resizeMode="cover"
                  />

                  {/* Title & Subtitle */}
                  <View style={styles.modalHeader}>
                    <Text style={styles.valentineModalTitle}>{valentineExperience.title}</Text>
                    {valentineExperience.subtitle && (
                      <Text style={styles.valentineModalSubtitle}>{valentineExperience.subtitle}</Text>
                    )}
                  </View>

                  {/* Info Pills */}
                  <View style={styles.modalInfoPills}>
                    {valentineExperience.location && (
                      <View style={styles.infoPill}>
                        <Text style={styles.infoPillIcon}>📍</Text>
                        <Text style={styles.infoPillText}>{valentineExperience.location}</Text>
                      </View>
                    )}
                    {valentineExperience.duration && (
                      <View style={styles.infoPill}>
                        <Text style={styles.infoPillIcon}>⏱️</Text>
                        <Text style={styles.infoPillText}>{valentineExperience.duration}</Text>
                      </View>
                    )}
                    {valentineExperience.price && (
                      <View style={styles.infoPill}>
                        <Text style={styles.infoPillIcon}>💰</Text>
                        <Text style={styles.infoPillText}>€{valentineExperience.price * 2} for two</Text>
                      </View>
                    )}
                  </View>

                  {/* Description */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>About This Experience</Text>
                    <Text style={styles.modalDescription}>{valentineExperience.description}</Text>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
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
  title: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 6, textAlign: 'center' },
  empoweredText: { fontSize: 14, color: '#6b7280', marginBottom: 14, textAlign: 'center' },
  selfChallengeText: { fontSize: 14, color: '#7c3aed', marginBottom: 14, fontWeight: '600', textAlign: 'center' },
  valentineChallengeText: { fontSize: 14, color: '#ec4899', marginBottom: 14, fontWeight: '600', textAlign: 'center' },

  startDateText: { fontSize: 13, color: '#059669', marginBottom: 14, fontWeight: '600', textAlign: 'center' },
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
  // Subtle hint indicator
  hintIndicator: {
    fontSize: 13,
    color: '#8B5CF6',
    textAlign: 'center',
    marginBottom: 12,
    opacity: 0.85,
  },

  // 💝 VALENTINE: Partner Progress Styles
  valentineProgressContainer: {
    marginTop: 16,
    marginBottom: 12,
    gap: 12,
  },
  waitingBanner: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD6E8',
  },
  waitingEmoji: {
    fontSize: 32,
  },
  waitingTextContainer: {
    alignItems: 'center',
    gap: 4,
  },
  waitingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#BE185D',
    textAlign: 'center',
  },
  waitingSubtext: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9F1239',
    opacity: 0.8,
    textAlign: 'center',
  },
  partnerProgressRow: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  partnerProgressCol: {
    flex: 1,
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  partnerProgressColSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  partnerProgressColUnselected: {
    opacity: 0.65,
  },
  partnerProgressColPressed: {
    opacity: 0.85,
  },
  partnerAvatarContainer: {
    alignItems: 'center',
  },
  partnerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  userAvatar: {
    backgroundColor: '#FFE5EF',
    borderColor: '#FF6B9D',
  },
  partnerAvatarPlaceholder: {
    backgroundColor: '#F3E8FF',
    borderColor: '#C084FC',
  },
  partnerAvatarImage: {
    backgroundColor: '#F3E8FF',
    borderColor: '#C084FC',
  },
  partnerAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6B7280',
  },
  partnerAvatarEmoji: {
    fontSize: 24,
  },

  partnerProgressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  partnerProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  partnerSessionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  partnerSessionDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  partnerSessionDotFilled: {
    backgroundColor: '#FFE5EF',
    borderColor: '#FF6B9D',
  },
  partnerSessionDotPartnerFilled: {
    backgroundColor: '#F3E8FF',
    borderColor: '#C084FC',
  },
  partnerSessionDotEmpty: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  partnerSessionCheck: {
    fontSize: 14,
  },
  partnerProgressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
    height: 20,
  },
  partnerDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  partnerProgressCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },

  // 💝 Valentine hearts decoration
  heartsBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 0,
  },
  heartIcon: {
    position: 'absolute',
    fontSize: 20,
    opacity: 0.15,
  },

  // 💝 Calendar owner label
  calendarOwnerLabel: {
    marginTop: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  calendarOwnerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarOwnerIcon: {
    fontSize: 16,
  },
  calendarOwnerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.2,
  },
  calendarOwnerUnderline: {
    height: 2,
    width: 40,
    borderRadius: 1,
    marginTop: 6,
    opacity: 0.6,
  },

  // 💝 VALENTINE: Experience details for revealed mode
  valentineExperienceSection: {
    marginTop: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  valentineExperienceHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  valentineExperienceThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  valentineExperienceInfo: {
    flex: 1,
    gap: 4,
  },
  valentineExperienceTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  valentineExperienceSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  viewExperienceButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  viewExperienceButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7C3AED',
  },

  // 💝 VALENTINE: Experience Details Modal Styles (from ValentinesChallengeScreen)
  valentineModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  modalImage: {
    width: '100%',
    height: 250,
    backgroundColor: '#F3F4F6',
  },
  modalHeader: {
    padding: 20,
    paddingBottom: 12,
  },
  valentineModalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 8,
  },
  valentineModalSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 22,
  },
  modalInfoPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 12,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  infoPillIcon: {
    fontSize: 14,
  },
  infoPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  modalSection: {
    padding: 20,
    paddingTop: 12,
  },
  modalSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
  },
});

export default DetailedGoalCard;
