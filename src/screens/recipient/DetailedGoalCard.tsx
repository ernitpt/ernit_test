import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Pressable,
  Platform,
  Image,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Goal, isSelfGifted } from '../../types';
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
import { pushNotificationService } from '../../services/PushNotificationService';

import { useTimerContext } from '../../context/TimerContext';
import { logger } from '../../utils/logger';
import { logErrorToFirestore } from '../../utils/errorLogger';
import { serializeNav } from '../../utils/serializeNav';
import { db } from '../../services/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { config } from '../../config/environment';
import Colors from '../../config/colors';

// Extracted utilities, hooks, and components
import {
  isGoalLocked,
  buildValentineGift,
  TIMER_STORAGE_KEY,
  HintObject,
} from './goalCardUtils';
import { useGoalProgress } from './hooks/useGoalProgress';
import { useValentinePartner } from './hooks/useValentinePartner';
import { useValentineExperience } from './hooks/useValentineExperience';
import WeeklyCalendar from './components/WeeklyCalendar';
import ProgressBars from './components/ProgressBars';
import TimerDisplay from './components/TimerDisplay';
import ValentinePartnerSelector from './components/ValentinePartnerSelector';
import SessionActionArea from './components/SessionActionArea';
import {
  CancelSessionModal,
  CelebrationModal,
  ValentineExperienceDetailsModal,
} from './components/GoalCardModals';

const DEBUG_ALLOW_MULTIPLE_PER_DAY = config.debugEnabled;

// ─── Props ──────────────────────────────────────────────────────────

interface DetailedGoalCardProps {
  goal: Goal;
  onFinish?: (goal: Goal) => void;
}

// ─── Main Component ─────────────────────────────────────────────────

type GoalsNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Goals'>;

const DetailedGoalCard: React.FC<DetailedGoalCardProps> = ({ goal, onFinish }) => {
  const [currentGoal, setCurrentGoal] = useState(goal);
  const [empoweredName, setEmpoweredName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [lastHint, setLastHint] = useState<HintObject | string | null>(null);
  const [lastSessionNumber, setLastSessionNumber] = useState<number>(0);
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [debugTimeKey, setDebugTimeKey] = useState(0);
  const [showPartnerWaitingModal, setShowPartnerWaitingModal] = useState(false);
  const [cancelMessage] = useState(
    "Are you sure you want to cancel this session? Progress won't be saved."
  );

  const isSelfGift = isSelfGifted(currentGoal);
  const navigation = useNavigation<GoalsNavigationProp>();

  // Timer context
  const { getTimerState, startTimer, stopTimer } = useTimerContext();
  const timerState = getTimerState(currentGoal.id);
  const isTimerRunning = timerState?.isRunning || false;
  const startTime = timerState?.startTime || null;
  const timeElapsed = timerState?.elapsed || 0;

  // Card press animation
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // ─── Hooks ──────────────────────────────────────────────────────

  const valentine = useValentinePartner(currentGoal);

  const {
    valentineExperience,
    valentineChallengeMode,
    showDetailsModal,
    setShowDetailsModal,
  } = useValentineExperience({
    goal: currentGoal,
    setCurrentGoal,
    valentinePartnerName: valentine.valentinePartnerName,
    navigation,
  });

  const progress = useGoalProgress({
    goal: currentGoal,
    selectedView: valentine.selectedView,
    partnerGoalData: valentine.partnerGoalData,
    debugTimeKey,
  });

  // ─── Derived state ────────────────────────────────────────────────

  const canFinish = useMemo(() => {
    return timeElapsed >= 2;
  }, [timeElapsed]);

  // ─── Effects ──────────────────────────────────────────────────────

  // Fetch empowered name
  useEffect(() => {
    if (currentGoal.empoweredBy) {
      userService.getUserName(currentGoal.empoweredBy).then(setEmpoweredName).catch(() => {});
    }
  }, [currentGoal.empoweredBy]);

  // Real-time goal listener
  useEffect(() => {
    if (!currentGoal.id) return;

    const unsubscribe = onSnapshot(doc(db, 'goals', currentGoal.id), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const toDate = (val: { toDate?: () => Date } | Date | null | undefined) =>
          val && typeof val === 'object' && 'toDate' in val && val.toDate ? val.toDate() : val;

        const updatedGoal = {
          id: snapshot.id,
          ...data,
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
          startDate: toDate(data.startDate),
          endDate: toDate(data.endDate),
          weekStartAt: toDate(data.weekStartAt),
          plannedStartDate: toDate(data.plannedStartDate),
          approvalDeadline: toDate(data.approvalDeadline),
          approvalRequestedAt: toDate(data.approvalRequestedAt),
        } as unknown as Goal;

        setCurrentGoal(updatedGoal);
      }
    }, (error) => {
      logger.error('Error listening to goal updates:', error);
    });

    return () => unsubscribe();
  }, [currentGoal.id]);

  // Partner waiting modal
  useEffect(() => {
    if (showPartnerWaitingModal) {
      Alert.alert(
        'Goal Complete!',
        `Congratulations! You've completed all your sessions!\n\nWaiting for ${valentine.valentinePartnerName || 'your partner'} to finish their goal. Once they complete, you'll both be able to redeem your experience together.\n\nWe'll notify you when they're done!`,
        [{ text: 'Got it!', onPress: () => setShowPartnerWaitingModal(false) }]
      );
    }
  }, [showPartnerWaitingModal, valentine.valentinePartnerName]);

  // Background timer awareness — notify when app becomes visible and timer running
  useEffect(() => {
    if (!isTimerRunning || !startTime) return;

    const checkElapsedTime = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed >= progress.totalGoalSeconds && progress.totalGoalSeconds > 0) {
        if (Platform.OS === 'web' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const notification = new Notification("Session Time's Up!", {
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
            logger.warn('Failed to create browser notification:', e);
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.ready.then(registration => {
                registration.showNotification("Session Time's Up!", {
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

    checkElapsedTime();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkElapsedTime();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isTimerRunning, startTime, progress.totalGoalSeconds, currentGoal.id]);

  // ─── Timer Helpers ────────────────────────────────────────────────

  const clearTimerState = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(TIMER_STORAGE_KEY + currentGoal.id);
      await pushNotificationService.cancelSessionNotification(currentGoal.id);
    } catch (error) {
      logger.error('Error clearing timer state:', error);
    }
  }, [currentGoal.id]);

  // ─── Session Handlers ─────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    if (isTimerRunning || loading) return;
    const goalId = currentGoal.id;
    if (!goalId) return;

    // Approval checks
    if (isGoalLocked(currentGoal) && currentGoal.targetCount === 1 && currentGoal.sessionsPerWeek === 1) {
      const message = currentGoal.approvalStatus === 'suggested_change'
        ? `${empoweredName || 'Your giver'} has suggested a goal change. Please review and accept or modify the suggestion before starting a session.`
        : "Goals with only 1 day and 1 session per week cannot be completed until giver's approval.";
      Alert.alert('Goal Not Approved', message);
      return;
    }
    if (isGoalLocked(currentGoal) && currentGoal.targetCount >= 1 && currentGoal.weeklyCount >= 1) {
      const message = currentGoal.approvalStatus === 'suggested_change'
        ? `${empoweredName || 'Your giver'} has suggested a goal change. Please review and accept or modify the suggestion before starting another session.`
        : `Waiting for ${empoweredName || 'your giver'}'s approval! You can start with the first session, but the remaining sessions will unlock after ${empoweredName || 'your giver'} approves your goal (or automatically in 24 hours).`;
      Alert.alert('Goal Not Approved', message);
      return;
    }

    setLoading(true);

    try {
      const isValentineGoal = !!currentGoal.valentineChallengeId;
      let experience: Awaited<ReturnType<typeof experienceService.getExperienceById>> | null = null;
      const recipientName = await userService.getUserName(currentGoal.userId);

      if (!isValentineGoal && currentGoal.experienceGiftId) {
        const gift = await experienceGiftService.getExperienceGiftById(currentGoal.experienceGiftId);
        experience = await experienceService.getExperienceById(gift.experienceId);
      }

      // Session timing validation
      const MIN_SESSION_INTERVAL_MS = 60000;
      const nowCheck = Date.now();
      if (currentGoal.weeklyLogDates && currentGoal.weeklyLogDates.length > 0) {
        const lastSessionDate = currentGoal.weeklyLogDates[currentGoal.weeklyLogDates.length - 1];
        const lastSessionTime = new Date(lastSessionDate).getTime();
        const timeSinceLastSession = nowCheck - lastSessionTime;
        if (timeSinceLastSession > 0 && timeSinceLastSession < MIN_SESSION_INTERVAL_MS) {
          const secondsRemaining = Math.ceil((MIN_SESSION_INTERVAL_MS - timeSinceLastSession) / 1000);
          Alert.alert('Too Fast!', `Please wait ${secondsRemaining} seconds between sessions to ensure quality completion.`, [{ text: 'OK' }]);
          setLoading(false);
          return;
        }
      }

      const funcTotalSessionsDone = (currentGoal.currentCount * currentGoal.sessionsPerWeek) + currentGoal.weeklyCount;
      const funcTotalSessions = currentGoal.targetCount * currentGoal.sessionsPerWeek;

      // Start timer
      await startTimer(currentGoal.id, null);

      // Background hint generation
      const nextSessionNumber = funcTotalSessionsDone + 2;
      const hasPersonalizedHintForNextSession =
        currentGoal.personalizedNextHint &&
        currentGoal.personalizedNextHint.forSessionNumber === nextSessionNumber;

      const hintExperience = isValentineGoal ? valentineExperience : experience;
      const hasHintExperience = isValentineGoal ? true : !!experience;
      const canGenerateHints =
        funcTotalSessionsDone !== funcTotalSessions &&
        !hasPersonalizedHintForNextSession &&
        hasHintExperience &&
        (!isValentineGoal || currentGoal.isRevealed === false);

      if (canGenerateHints) {
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
          logger.log(`Background hint generated for session ${nextSessionNumber}${category ? ` (category: ${category})` : ''}`);
        }).catch((err) => {
          logger.warn('Background hint generation failed:', err);
        });
      }

      // Schedule push notification
      const goalSeconds = (currentGoal.targetHours || 0) * 3600 + (currentGoal.targetMinutes || 0) * 60;
      if (goalSeconds > 0) {
        const notifId = await pushNotificationService.scheduleSessionCompletionNotification(goalId, goalSeconds);
        logger.log(`Scheduled session notification with ID: ${notifId} for ${goalSeconds}s`);
      }
    } catch (err) {
      logger.warn('Session start failed:', err);
    } finally {
      setLoading(false);
    }
  }, [isTimerRunning, loading, currentGoal, empoweredName, startTimer, valentineExperience]);

  const handleFinish = useCallback(async () => {
    if (!isTimerRunning || !canFinish || loading) return;
    const goalId = currentGoal.id;
    if (!goalId) return;

    // Approval checks
    if (isGoalLocked(currentGoal)) {
      const sessionsDoneBeforeFinish = (currentGoal.currentCount * currentGoal.sessionsPerWeek) + currentGoal.weeklyCount;
      if (currentGoal.targetCount === 1 && currentGoal.sessionsPerWeek === 1) {
        const message = currentGoal.approvalStatus === 'suggested_change'
          ? `${empoweredName || 'Your giver'} has suggested a goal change. Please review and accept or modify the suggestion before continuing.`
          : "Goals with only 1 day and 1 session per week cannot be completed until giver's approval.";
        Alert.alert('Goal Not Approved', message);
        return;
      }
      if (sessionsDoneBeforeFinish >= 1) {
        const message = currentGoal.approvalStatus === 'suggested_change'
          ? `${empoweredName || 'Your giver'} has suggested a goal change. Please review and accept or modify the suggestion before continuing with more sessions.`
          : `Waiting for ${empoweredName || 'your giver'}'s approval! You can start with the first session, but the remaining sessions will unlock after ${empoweredName || 'your giver'} approves your goal (or automatically in 24 hours).`;
        Alert.alert('Goal Not Approved', message);
        return;
      }
    }

    setLoading(true);

    try {
      const updated = await goalService.tickWeeklySession(goalId);

      setCurrentGoal(updated);

      // Auto-switch to user's calendar after completing session
      if (currentGoal.valentineChallengeId) {
        valentine.setSelectedView('user');
      }

      const isValentineGoal = !!updated.valentineChallengeId;
      let gift: Awaited<ReturnType<typeof experienceGiftService.getExperienceGiftById>> | null = null;
      let experience: Awaited<ReturnType<typeof experienceService.getExperienceById>> | null = null;

      if (!isValentineGoal && updated.experienceGiftId) {
        gift = await experienceGiftService.getExperienceGiftById(updated.experienceGiftId);
        experience = await experienceService.getExperienceById(gift.experienceId);
      }

      const recipientName = await userService.getUserName(updated.userId);
      const totalSessionsDone = (updated.currentCount * updated.sessionsPerWeek) + updated.weeklyCount;
      setLastSessionNumber(totalSessionsDone);

      stopTimer(currentGoal.id);
      await clearTimerState();
      await pushNotificationService.cancelSessionNotification(goalId);

      if (updated.isCompleted) {
        // GOAL COMPLETION
        if (updated.valentineChallengeId) {
          try {
            const valentineGift = await buildValentineGift(updated);
            if (valentineGift) {
              if (updated.isUnlocked) {
                navigation.navigate('Completion', {
                  goal: serializeNav(updated),
                  experienceGift: serializeNav(valentineGift),
                });
              } else if (updated.isFinished) {
                setShowPartnerWaitingModal(true);
              } else {
                Alert.alert('Goal Progress', 'Keep going! Complete all your sessions to finish the goal.');
              }
            } else {
              Alert.alert('Goal Completed!', 'Congratulations on completing your Valentine challenge!');
            }
          } catch (error) {
            logger.error('Error fetching Valentine challenge for completion:', error);
            await logErrorToFirestore(error, {
              screenName: 'DetailedGoalCard',
              feature: 'ValentineCompletion',
              additionalData: { goalId: updated.id, valentineChallengeId: updated.valentineChallengeId },
            });
            Alert.alert('Goal Completed!', 'Congratulations on completing your Valentine challenge!');
          }
        } else if (gift) {
          if (updated.empoweredBy && updated.empoweredBy !== updated.userId && experience) {
            await notificationService.createNotification(
              updated.empoweredBy,
              'goal_completed',
              `${recipientName} just earned ${experience.title}`,
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
          navigation.navigate('Completion', {
            goal: serializeNav(updated),
            experienceGift: serializeNav(gift),
          });
        }
      } else {
        // SESSION COMPLETE (not goal complete) — show hint
        await processHintAfterSession(updated, totalSessionsDone, isValentineGoal, experience, recipientName);

        // Show hint popup or celebration
        const isSecretValentine = isValentineGoal && !updated.isRevealed;
        if (!isSelfGift || isSecretValentine) {
          setShowHint(true);
        } else {
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          setShowCelebration(true);
          setTimeout(() => setShowCelebration(false), 3000);
        }

        // Valentine week completion alert
        if (isValentineGoal && updated.isWeekCompleted) {
          const weeksComplete = updated.currentCount + 1;
          const weeksRemaining = updated.targetCount - weeksComplete;
          Alert.alert(
            'Week Complete!',
            `Great job! You finished week ${weeksComplete} of ${updated.targetCount}.\n\n${weeksRemaining > 0 ? `${weeksRemaining} week${weeksRemaining > 1 ? 's' : ''} remaining. Your next week starts in 7 days!` : ''}`,
            [{ text: 'Awesome!' }]
          );
        }

        onFinish?.(updated);

        // Giver notifications
        const weeksCompleted = updated.isWeekCompleted ? updated.currentCount + 1 : updated.currentCount;
        if (!updated.valentineChallengeId && updated.empoweredBy && updated.empoweredBy !== updated.userId && experience) {
          await notificationService.createNotification(
            updated.empoweredBy,
            'goal_progress',
            `${recipientName} made progress!`,
            `This week's progress: ${updated.weeklyCount}/${updated.sessionsPerWeek}\nWeeks completed: ${weeksCompleted}/${updated.targetCount}`,
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

        // Valentine partner notifications
        if (updated.valentineChallengeId && updated.partnerGoalId) {
          await sendValentinePartnerNotification(updated, recipientName, totalSessionsDone);
        }
      }
    } catch (err) {
      logger.error(err);
      await logErrorToFirestore(err, {
        screenName: 'DetailedGoalCard',
        feature: 'UpdateGoalProgress',
        additionalData: { goalId: currentGoal.id, isValentineGoal: !!currentGoal.valentineChallengeId },
      });
      Alert.alert('Error', 'Could not update goal progress.');
    } finally {
      setLoading(false);
    }
  }, [isTimerRunning, canFinish, loading, currentGoal, empoweredName, isSelfGift, stopTimer, clearTimerState, navigation, onFinish, valentine, valentineExperience]);

  // ─── Hint processing (extracted for readability) ──────────────────

  const processHintAfterSession = async (
    updated: Goal,
    totalSessionsDone: number,
    isValentineGoal: boolean,
    experience: Awaited<ReturnType<typeof experienceService.getExperienceById>> | null,
    recipientName: string | null,
  ) => {
    const hasPersonalizedHint =
      updated.personalizedNextHint &&
      updated.personalizedNextHint.forSessionNumber === totalSessionsDone + 1;

    let hintToShow: string;

    if (hasPersonalizedHint) {
      const ph = updated.personalizedNextHint!;
      if (ph.text && ph.text.length > 500) {
        ph.text = ph.text.substring(0, 500);
      }

      const hintObj: HintObject = {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        session: totalSessionsDone,
        giverName: ph.giverName || 'Your Giver',
        date: Date.now(),
        createdAt: new Date(),
      };

      if (ph.text) hintObj.text = ph.text;
      if (ph.audioUrl) hintObj.audioUrl = ph.audioUrl;
      if (ph.imageUrl) hintObj.imageUrl = ph.imageUrl;
      if (ph.type) hintObj.type = ph.type;
      if (typeof ph.duration === 'number') hintObj.duration = ph.duration;

      if (ph.type === 'audio') {
        hintToShow = `${ph.giverName} sent a voice memo!`;
      } else if (ph.type === 'image') {
        hintToShow = `${ph.giverName} sent a photo!`;
      } else if (ph.type === 'mixed') {
        hintToShow = `${ph.giverName} sent a message!`;
      } else {
        hintToShow = `${ph.giverName} says:\n${ph.text || ''}`;
      }

      try {
        await goalService.appendHint(updated.id, hintObj);
        setCurrentGoal((prev) => ({
          ...prev,
          hints: [...(prev.hints || []), hintObj as Goal['hints'] extends (infer U)[] | undefined ? U : never],
        }));
      } catch (err) {
        logger.error('Failed to save personalized hint to history:', err);
      }

      try {
        await goalService.clearPersonalizedNextHint(updated.id);
      } catch (err) {
        logger.warn('Failed to clear personalized hint:', err);
      }

      setLastHint(hintObj);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (updated as any).hints = [...(updated.hints || []), hintObj];
    } else {
      const aiHintSessionNumber = totalSessionsDone + 1;
      const isSecretValentine = isValentineGoal && !updated.isRevealed;
      const hintExperience = isValentineGoal ? valentineExperience : experience;

      try {
        let cachedHint = await aiHintService.getHint(updated.id, aiHintSessionNumber);

        if (!cachedHint && isSecretValentine) {
          const generated = await aiHintService.generateHint({
            goalId: updated.id,
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

        hintToShow = cachedHint || "Keep going! You're doing great";

        if (cachedHint) {
          const hintObj: HintObject = {
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            session: aiHintSessionNumber,
            hint: cachedHint,
            date: Date.now(),
            text: cachedHint,
          };
          await goalService.appendHint(updated.id, hintObj);
          setCurrentGoal((prev) => ({
            ...prev,
            hints: [...(prev.hints || []), hintObj as Goal['hints'] extends (infer U)[] | undefined ? U : never],
          }));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (updated as any).hints = [...(updated.hints || []), hintObj];
        }
      } catch (err) {
        logger.warn('Failed to retrieve/save AI hint:', err);
        hintToShow = "Keep going! You're doing great";
      }
      setLastHint(hintToShow);
    }
  };

  // ─── Valentine partner notification (extracted for readability) ────

  const sendValentinePartnerNotification = async (
    updated: Goal,
    recipientName: string | null,
    totalSessionsDone: number,
  ) => {
    try {
      const partnerGoalDoc = await getDoc(doc(db, 'goals', updated.partnerGoalId!));
      if (!partnerGoalDoc.exists()) return;
      const partnerUserId = partnerGoalDoc.data().userId;
      const partnerGoal = partnerGoalDoc.data();

      const isFirstSession = updated.weeklyCount === 1;
      const isHalfway = updated.weeklyCount === Math.floor(updated.sessionsPerWeek / 2) && updated.sessionsPerWeek >= 3;
      const sessionsRemaining = updated.sessionsPerWeek - updated.weeklyCount;
      const isAlmostDone = sessionsRemaining === 1 && !updated.isWeekCompleted;

      let notificationType = 'valentine_partner_progress';
      let notificationTitle = `${recipientName} completed a session!`;
      let notificationMessage = `Progress: ${updated.weeklyCount}/${updated.sessionsPerWeek} sessions this week.`;

      if (isFirstSession) {
        notificationType = 'valentine_milestone';
        notificationTitle = `${recipientName} started the week!`;
        notificationMessage = `Your partner completed their first session for week ${updated.currentCount + 1}. Let's keep the momentum going!`;
      } else if (updated.isWeekCompleted) {
        const partnerSessionsRemaining = partnerGoal.sessionsPerWeek - partnerGoal.weeklyCount;
        if (partnerGoal.isWeekCompleted) {
          notificationType = 'valentine_celebration';
          notificationTitle = 'Both ready for next week!';
          notificationMessage = `You've both completed week ${updated.currentCount + 1}! Moving forward together.`;
        } else {
          notificationType = 'valentine_sync';
          notificationTitle = `${recipientName} finished the week!`;
          notificationMessage = partnerSessionsRemaining === 1
            ? 'Complete your last session to advance together!'
            : `Complete your last ${partnerSessionsRemaining} sessions to advance together!`;
        }
      } else if (isAlmostDone) {
        notificationType = 'valentine_milestone';
        notificationTitle = `${recipientName} almost finished!`;
        notificationMessage = 'Just 1 more session to complete the week together!';
      } else if (isHalfway) {
        notificationType = 'valentine_milestone';
        notificationTitle = `${recipientName} is halfway there!`;
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
    } catch (error) {
      logger.warn('Failed to notify Valentine partner:', error);
    }
  };

  // ─── Cancel session ───────────────────────────────────────────────

  const cancelSessionInternal = useCallback(async () => {
    try {
      stopTimer(currentGoal.id);
      await clearTimerState();
      await pushNotificationService.cancelSessionNotification(currentGoal.id);
    } catch (error) {
      logger.error('Error cancelling session:', error);
      await logErrorToFirestore(error, {
        screenName: 'DetailedGoalCard',
        feature: 'SessionCancellation',
        additionalData: { goalId: currentGoal.id },
      });
    } finally {
      setShowCancelPopup(false);
    }
  }, [currentGoal.id, stopTimer, clearTimerState]);

  // ─── Card press handlers ──────────────────────────────────────────

  const onPressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  const onPressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();

  const handlePress = (g: Goal) => {
    (navigation as { navigate: (screen: string, params?: unknown) => void }).navigate('Roadmap', { goal: g });
  };

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={() => handlePress(currentGoal)}
        style={{ borderRadius: 16 }}
      >
        <View style={styles.card}>
          {/* Hearts background for Valentine goals */}
          {!!currentGoal.valentineChallengeId && (
            <View style={styles.heartsBackground}>
              <Text style={[styles.heartIcon, { top: 8, right: 15, fontSize: 18, transform: [{ rotate: '15deg' }], opacity: 0.3 }]}>❤️</Text>
              <Text style={[styles.heartIcon, { top: 22, right: 35, fontSize: 14, transform: [{ rotate: '-25deg' }], opacity: 0.25 }]}>❤️</Text>
              <Text style={[styles.heartIcon, { top: 38, right: 20, fontSize: 20, transform: [{ rotate: '18deg' }], opacity: 0.2 }]}>❤️</Text>
            </View>
          )}

          {/* Title & badges */}
          <Text style={styles.title}>
            {currentGoal.valentineChallengeId ? valentine.displayedTitle : currentGoal.title}
          </Text>
          {!!empoweredName && !isSelfGift && (
            <Text style={styles.empoweredText}>Empowered by {empoweredName}</Text>
          )}
          {isSelfGift && <Text style={styles.selfChallengeText}>Self-Challenge</Text>}
          {!!currentGoal.valentineChallengeId && (
            <Text style={styles.valentineChallengeText}>
              Valentine's Challenge{valentine.valentinePartnerName ? ` with ${valentine.valentinePartnerName}` : ''}
            </Text>
          )}
          {progress.startDateText && <Text style={styles.startDateText}>{progress.startDateText}</Text>}

          {/* Valentine partner selector */}
          {!!currentGoal.valentineChallengeId && (
            <ValentinePartnerSelector
              partnerGoalData={valentine.partnerGoalData}
              isLoading={!!currentGoal.partnerGoalId && !valentine.partnerGoalData}
              selectedView={valentine.selectedView}
              onViewSwitch={valentine.handleViewSwitch}
              currentUserName={valentine.currentUserName}
              currentUserProfileImage={valentine.currentUserProfileImage}
              valentinePartnerName={valentine.valentinePartnerName}
              partnerProfileImage={valentine.partnerProfileImage}
              partnerJustUpdated={valentine.partnerJustUpdated}
              motivationalNudge={valentine.motivationalNudge}
            />
          )}

          {/* Valentine experience details (revealed mode) */}
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

          {/* Calendar owner label (Valentine) */}
          {!!currentGoal.valentineChallengeId && valentine.partnerGoalData && (
            <Animated.View style={[styles.calendarOwnerLabel, { opacity: valentine.viewTransitionAnim }]}>
              <View style={styles.calendarOwnerContent}>
                <Text style={styles.calendarOwnerText}>
                  {valentine.displayedName}'s Calendar
                </Text>
              </View>
              <View style={[styles.calendarOwnerUnderline, { backgroundColor: valentine.displayedColor }]} />
            </Animated.View>
          )}

          {/* Weekly Calendar */}
          <Animated.View style={{
            opacity: valentine.viewTransitionAnim,
            transform: [{ scale: valentine.viewTransitionAnim }],
          }}>
            <WeeklyCalendar
              weekDates={progress.weekDates}
              loggedSet={progress.loggedSet}
              todayIso={progress.todayIso}
            />
          </Animated.View>

          {/* Progress Bars */}
          <ProgressBars
            weeklyFilled={progress.weeklyFilled}
            weeklyTotal={progress.weeklyTotal}
            completedWeeks={progress.completedWeeks}
            overallTotal={progress.overallTotal}
            totalSessionsDone={progress.totalSessionsDone}
          />

          {/* Action Area or Timer */}
          {!isTimerRunning ? (
            <SessionActionArea
              goal={currentGoal}
              empoweredName={empoweredName}
              alreadyLoggedToday={progress.alreadyLoggedToday}
              totalSessionsDone={progress.totalSessionsDone}
              hasPersonalizedHintWaiting={progress.hasPersonalizedHintWaiting && !isTimerRunning}
              valentinePartnerName={valentine.valentinePartnerName}
              loading={loading}
              onStart={handleStart}
            />
          ) : (
            <TimerDisplay
              timeElapsed={timeElapsed}
              totalGoalSeconds={progress.totalGoalSeconds}
              canFinish={canFinish}
              loading={loading}
              targetHours={currentGoal.targetHours}
              targetMinutes={currentGoal.targetMinutes}
              onFinish={handleFinish}
              onCancel={() => setShowCancelPopup(true)}
            />
          )}
        </View>
      </Pressable>

      {/* Debug Controls */}
      {DEBUG_ALLOW_MULTIPLE_PER_DAY && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugTitle}>Debug Tools</Text>
          <View style={styles.debugButtonsRow}>
            {[
              { label: '-1 W', fn: () => goalService.debugRewindWeek(currentGoal.id!) },
              { label: '-1 D', fn: () => goalService.debugRewindDay(currentGoal.id!) },
              { label: '+1 D', fn: () => goalService.debugAdvanceDay(currentGoal.id!) },
              { label: '+1 W', fn: () => goalService.debugAdvanceWeek(currentGoal.id!) },
            ].map(({ label, fn }) => (
              <TouchableOpacity
                key={label}
                style={styles.debugButton}
                onPress={async () => {
                  await fn();
                  const updated = await goalService.getGoalById(currentGoal.id!);
                  if (updated) setCurrentGoal(updated);
                  setDebugTimeKey(k => k + 1);
                  Alert.alert('Debug', `${label} applied`);
                }}
              >
                <Text style={styles.debugButtonText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Modals */}
      <HintPopup
        visible={showHint}
        hint={lastHint || ''}
        sessionNumber={lastSessionNumber}
        totalSessions={progress.overallTotal}
        onClose={() => setShowHint(false)}
      />

      <CancelSessionModal
        visible={showCancelPopup}
        onClose={() => setShowCancelPopup(false)}
        onConfirm={cancelSessionInternal}
        message={cancelMessage}
      />

      <CelebrationModal
        visible={showCelebration}
        onClose={() => setShowCelebration(false)}
      />

      <ValentineExperienceDetailsModal
        visible={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        experience={valentineExperience}
      />
    </Animated.View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    // Glassmorphism (web only)
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    } as Record<string, string> : {}),
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 6, textAlign: 'center' },
  empoweredText: { fontSize: 14, color: '#6b7280', marginBottom: 14, textAlign: 'center' },
  selfChallengeText: { fontSize: 14, color: Colors.primary, marginBottom: 14, fontWeight: '600', textAlign: 'center' },
  valentineChallengeText: { fontSize: 14, color: '#ec4899', marginBottom: 14, fontWeight: '600', textAlign: 'center' },
  startDateText: { fontSize: 13, color: '#059669', marginBottom: 14, fontWeight: '600', textAlign: 'center' },

  // Hearts decoration
  heartsBackground: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: 'none',
    zIndex: 0,
  },
  heartIcon: {
    position: 'absolute',
    fontSize: 20,
    opacity: 0.15,
  },

  // Calendar owner label
  calendarOwnerLabel: { marginTop: 16, marginBottom: 8, alignItems: 'center' },
  calendarOwnerContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  calendarOwnerText: { fontSize: 14, fontWeight: '600', color: '#6B7280', letterSpacing: 0.2 },
  calendarOwnerUnderline: { height: 2, width: 40, borderRadius: 1, marginTop: 6, opacity: 0.6 },

  // Valentine experience section
  valentineExperienceSection: {
    marginTop: 16, marginBottom: 16, padding: 16,
    backgroundColor: '#FAFAFA', borderRadius: 12,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  valentineExperienceHeader: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'center' },
  valentineExperienceThumbnail: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#E5E7EB' },
  valentineExperienceInfo: { flex: 1, gap: 4 },
  valentineExperienceTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  valentineExperienceSubtitle: { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  viewExperienceButton: {
    paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: '#FFFFFF', borderRadius: 8,
    borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center',
  },
  viewExperienceButtonText: { fontSize: 14, fontWeight: '600', color: Colors.primary },

  // Debug
  debugContainer: {
    marginTop: 20, padding: 16,
    backgroundColor: '#F3F4F6', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed',
  },
  debugTitle: {
    fontSize: 12, fontWeight: '700', color: '#6B7280',
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  debugButtonsRow: { flexDirection: 'row', gap: 10 },
  debugButton: {
    flex: 1, backgroundColor: '#E5E7EB',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8,
    alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB',
  },
  debugButtonText: { fontSize: 13, fontWeight: '600', color: '#374151' },
});

export default DetailedGoalCard;
