import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  LayoutAnimation,
  Pressable,
  Platform,
  UIManager,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Goal, isSelfGifted } from '../../types';
import { goalService } from '../../services/GoalService';
import { userService } from '../../services/userService';
import { notificationService } from '../../services/NotificationService';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { experienceService } from '../../services/ExperienceService';
import { useRootNavigation } from '../../types/navigation';
import HintPopup from '../../components/HintPopup';
import { aiHintService } from '../../services/AIHintService';
import { pushNotificationService } from '../../services/PushNotificationService';

import { useTimerContext } from '../../context/TimerContext';
import { logger } from '../../utils/logger';
import { logErrorToFirestore } from '../../utils/errorLogger';
import { serializeNav } from '../../utils/serializeNav';
import { db } from '../../services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import Colors from '../../config/colors';
import { useToast } from '../../context/ToastContext';

// Extracted utilities, hooks, and components
import {
  isGoalLocked,
  TIMER_STORAGE_KEY,
  HintObject,
} from './goalCardUtils';
import { useGoalProgress } from './hooks/useGoalProgress';
import WeeklyCalendar from './components/WeeklyCalendar';
import ProgressBars from './components/ProgressBars';
import TimerDisplay from './components/TimerDisplay';
import SessionActionArea from './components/SessionActionArea';
import {
  CancelSessionModal,
  CelebrationModal,
} from './components/GoalCardModals';
import SessionMediaPrompt from './components/SessionMediaPrompt';
import { sessionService } from '../../services/SessionService';
import { storageService } from '../../services/StorageService';
import { feedService } from '../../services/FeedService';
import { ctaService, CTADecision } from '../../services/CTAService';
import { InlineExperienceCTA } from '../../components/ExperiencePurchaseCTA';
import { useApp } from '../../context/AppContext';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Props ──────────────────────────────────────────────────────────

interface DetailedGoalCardProps {
  goal: Goal;
  onFinish?: (goal: Goal) => void;
}

// ─── Main Component ─────────────────────────────────────────────────

const DetailedGoalCard: React.FC<DetailedGoalCardProps> = ({ goal, onFinish }) => {
  const [currentGoal, setCurrentGoal] = useState(goal);
  const [empoweredName, setEmpoweredName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [lastHint, setLastHint] = useState<HintObject | string | null>(null);
  const [lastSessionNumber, setLastSessionNumber] = useState<number>(0);
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const { showSuccess, showError, showInfo } = useToast();
  const [celebrationData, setCelebrationData] = useState<{
    userName: string;
    userProfileImageUrl?: string;
    sessionNumber: number;
    totalSessions: number;
    progressPct: number;
    mediaUri?: string | null;
    weeklyCount: number;
    sessionsPerWeek: number;
    weeksCompleted: number;
    totalWeeks: number;
  } | null>(null);
  const [debugTimeKey, setDebugTimeKey] = useState(0);
  const [cancelMessage] = useState(
    "Are you sure you want to cancel this session? Progress won't be saved."
  );

  // Media capture state
  const [sessionMediaUri, setSessionMediaUri] = useState<string | null>(null);
  const [sessionMediaType, setSessionMediaType] = useState<'photo' | 'video' | null>(null);
  const [showMediaPrompt, setShowMediaPrompt] = useState(false);
  const [lastSessionMediaUrl, setLastSessionMediaUrl] = useState<string | null>(null);
  const [lastSessionMediaType, setLastSessionMediaType] = useState<'photo' | 'video' | null>(null);
  const [pendingFinishData, setPendingFinishData] = useState<{
    updated: Goal;
    totalSessionsDone: number;
    experience: Awaited<ReturnType<typeof experienceService.getExperienceById>> | null;
    recipientName: string | null;
    gift: Awaited<ReturnType<typeof experienceGiftService.getExperienceGiftById>> | null;
  } | null>(null);

  // CTA state
  const [showCTA, setShowCTA] = useState(false);
  const [ctaDecision, setCTADecision] = useState<CTADecision | null>(null);

  const isSelfGift = isSelfGifted(currentGoal);
  const navigation = useRootNavigation();
  const { state: appState } = useApp();
  const debugMode = appState.debugMode;

  // Timer context
  const { getTimerState, startTimer, stopTimer } = useTimerContext();
  const timerState = getTimerState(currentGoal.id);
  const isTimerRunning = timerState?.isRunning || false;
  const startTime = timerState?.startTime || null;
  const timeElapsed = timerState?.elapsed || 0;

  // Card press animation
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Timer transition animation (fade + slide when swapping SessionAction <-> Timer)
  const timerFadeAnim = useRef(new Animated.Value(1)).current;
  const prevTimerRunning = useRef(isTimerRunning);

  useEffect(() => {
    if (prevTimerRunning.current !== isTimerRunning) {
      prevTimerRunning.current = isTimerRunning;
      // Animate height change
      LayoutAnimation.configureNext(LayoutAnimation.create(250, 'easeInEaseOut', 'opacity'));
      // Fade-in the new content
      timerFadeAnim.setValue(0);
      Animated.timing(timerFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isTimerRunning, timerFadeAnim]);

  // ─── Hooks ──────────────────────────────────────────────────────

  const progress = useGoalProgress({
    goal: currentGoal,
    selectedView: 'user',
    partnerGoalData: null,
    debugTimeKey,
  });

  // ─── Derived state ────────────────────────────────────────────────

  const canFinish = useMemo(() => {
    if (debugMode) return timeElapsed >= 2;
    // Production: require full target duration (minimum 60s if no target set)
    const required = progress.totalGoalSeconds > 0 ? progress.totalGoalSeconds : 60;
    return timeElapsed >= required;
  }, [timeElapsed, progress.totalGoalSeconds, debugMode]);

  // ─── Effects ──────────────────────────────────────────────────────

  // Fetch empowered name
  useEffect(() => {
    if (currentGoal.empoweredBy) {
      userService.getUserName(currentGoal.empoweredBy).then(setEmpoweredName).catch(() => { });
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

        // Skip update if key data hasn't changed to prevent render loops
        const prev = currentGoal;
        if (prev && prev.weeklyCount === data.weeklyCount
            && prev.currentCount === data.currentCount
            && prev.isCompleted === data.isCompleted
            && prev.empoweredBy === data.empoweredBy
            && prev.experienceGiftId === data.experienceGiftId
            && prev.giftAttachedAt === (toDate(data.giftAttachedAt) as any)) {
          return;
        }

        setCurrentGoal(updatedGoal);
      } else {
        // Goal was deleted — stop any active timer and notify user
        logger.warn(`Goal ${currentGoal.id} was deleted while viewing`);
        stopTimer(currentGoal.id);
        showError('This goal has been removed.');
      }
    }, (error) => {
      logger.error('Error listening to goal updates:', error);
    });

    return () => unsubscribe();
  }, [currentGoal.id]);

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

    if (Platform.OS === 'web') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
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

  // ─── Media Capture ──────────────────────────────────────────────

  const handleCaptureMedia = useCallback(async () => {
    if (Platform.OS === 'web') {
      // On web, use <input capture="environment"> to open the native camera app
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.capture = 'environment';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          const uri = URL.createObjectURL(file);
          setSessionMediaUri(uri);
          setSessionMediaType(file.type.startsWith('video') ? 'video' : 'photo');
        }
      };
      input.click();
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showInfo('Camera access is required to capture session media.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        videoMaxDuration: 5,
        quality: 0.7,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSessionMediaUri(asset.uri);
        setSessionMediaType(asset.type === 'video' ? 'video' : 'photo');
      }
    } catch (error) {
      logger.warn('Media capture failed:', error);
    }
  }, []);

  const handleGalleryPick = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showInfo('Gallery access is required to select session media.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        videoMaxDuration: 5,
        quality: 0.7,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSessionMediaUri(asset.uri);
        setSessionMediaType(asset.type === 'video' ? 'video' : 'photo');
      }
    } catch (error) {
      logger.warn('Gallery pick failed:', error);
    }
  }, []);

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
      showError(message);
      return;
    }
    if (isGoalLocked(currentGoal) && currentGoal.targetCount >= 1 && currentGoal.weeklyCount >= 1) {
      const message = currentGoal.approvalStatus === 'suggested_change'
        ? `${empoweredName || 'Your giver'} has suggested a goal change. Please review and accept or modify the suggestion before starting another session.`
        : `Waiting for ${empoweredName || 'your giver'}'s approval! You can start with the first session, but the remaining sessions will unlock after ${empoweredName || 'your giver'} approves your goal (or automatically in 24 hours).`;
      showError(message);
      return;
    }

    setLoading(true);
    // Clear any leftover media from a previous session
    setSessionMediaUri(null);
    setSessionMediaType(null);

    try {
      let experience: Awaited<ReturnType<typeof experienceService.getExperienceById>> | null = null;
      const recipientName = await userService.getUserName(currentGoal.userId);

      // Only fetch experience details client-side for non-mystery gifts
      // Mystery gifts resolve experience server-side to prevent spoiling the surprise
      if (currentGoal.experienceGiftId && !currentGoal.isMystery) {
        const gift = await experienceGiftService.getExperienceGiftById(currentGoal.experienceGiftId);
        experience = await experienceService.getExperienceById(gift.experienceId);
      }

      // Session timing validation (use stored timestamp, not ISO date strings)
      // Skipped in debug mode to allow rapid testing
      if (!debugMode) {
        const MIN_SESSION_INTERVAL_MS = 60000;
        const lastSessionTs = await AsyncStorage.getItem(`lastSession_${goalId}`);
        if (lastSessionTs) {
          const timeSince = Date.now() - parseInt(lastSessionTs, 10);
          if (timeSince > 0 && timeSince < MIN_SESSION_INTERVAL_MS) {
            const secondsRemaining = Math.ceil((MIN_SESSION_INTERVAL_MS - timeSince) / 1000);
            showInfo(`Please wait ${secondsRemaining} seconds between sessions.`);
            setLoading(false);
            return;
          }
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

      const canGenerateHints =
        !isSelfGift &&
        funcTotalSessionsDone !== funcTotalSessions &&
        !hasPersonalizedHintForNextSession &&
        (!!experience || !!currentGoal.isMystery); // Mystery gifts don't need client-side experience

      if (canGenerateHints && !hintGeneratingRef.current) {
        hintGeneratingRef.current = true;
        const hintPromise = currentGoal.isMystery
          ? aiHintService.generateMysteryHint({
              goalId,
              sessionNumber: nextSessionNumber,
              totalSessions: funcTotalSessions,
              userName: recipientName || undefined,
            })
          : aiHintService.generateHint({
              goalId,
              experienceType: experience?.title || 'experience',
              experienceDescription: experience?.description || undefined,
              experienceCategory: experience?.category || undefined,
              experienceSubtitle: experience?.subtitle || undefined,
              sessionNumber: nextSessionNumber,
              totalSessions: funcTotalSessions,
              userName: recipientName || undefined,
            });

        hintPromise.then(({ hint, category }) => {
          logger.log(`Background hint generated for session ${nextSessionNumber}${category ? ` (category: ${category})` : ''}`);
        }).catch((err) => {
          logger.warn('Background hint generation failed:', err);
        }).finally(() => {
          hintGeneratingRef.current = false;
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
  }, [isTimerRunning, loading, currentGoal, empoweredName, startTimer]);

  const finishLock = useRef(false);
  const hintGeneratingRef = useRef(false);

  const handleFinish = useCallback(async () => {
    if (!isTimerRunning || !canFinish || loading || finishLock.current) return;
    finishLock.current = true;
    const goalId = currentGoal.id;
    if (!goalId) { finishLock.current = false; return; }

    // Approval checks
    if (isGoalLocked(currentGoal)) {
      const sessionsDoneBeforeFinish = (currentGoal.currentCount * currentGoal.sessionsPerWeek) + currentGoal.weeklyCount;
      if (currentGoal.targetCount === 1 && currentGoal.sessionsPerWeek === 1) {
        const message = currentGoal.approvalStatus === 'suggested_change'
          ? `${empoweredName || 'Your giver'} has suggested a goal change. Please review and accept or modify the suggestion before continuing.`
          : "Goals with only 1 day and 1 session per week cannot be completed until giver's approval.";
        showError(message);
        finishLock.current = false;
        return;
      }
      if (sessionsDoneBeforeFinish >= 1) {
        const message = currentGoal.approvalStatus === 'suggested_change'
          ? `${empoweredName || 'Your giver'} has suggested a goal change. Please review and accept or modify the suggestion before continuing with more sessions.`
          : `Waiting for ${empoweredName || 'your giver'}'s approval! You can start with the first session, but the remaining sessions will unlock after ${empoweredName || 'your giver'} approves your goal (or automatically in 24 hours).`;
        showError(message);
        finishLock.current = false;
        return;
      }
    }

    setLoading(true);

    try {
      // Pass session start time for cross-midnight/cross-day protection
      const sessionStartDate = timerState?.startTime ? new Date(timerState.startTime) : undefined;
      const updated = await goalService.tickWeeklySession(goalId, sessionStartDate);
      // Store session timestamp for interval validation
      await AsyncStorage.setItem(`lastSession_${goalId}`, String(Date.now()));

      setCurrentGoal(updated);

      let gift: Awaited<ReturnType<typeof experienceGiftService.getExperienceGiftById>> | null = null;
      let experience: Awaited<ReturnType<typeof experienceService.getExperienceById>> | null = null;

      // For mystery gifts, only fetch experience on completion (reveal time)
      // For non-mystery gifts, always fetch for notifications and feed
      if (updated.experienceGiftId && (!updated.isMystery || updated.isCompleted)) {
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
        // GOAL COMPLETION — create session record, then navigate
        sessionService.createSessionRecord(goalId, {
          goalId, userId: updated.userId, timestamp: new Date(),
          duration: timeElapsed, sessionNumber: totalSessionsDone,
          weekNumber: updated.currentCount,
        }).catch(err => logger.warn('Failed to save final session record:', err));

        // Free goals without attached gift: navigate to FreeGoalCompletion
        if (updated.isFreeGoal && !gift) {
          navigation.navigate('FreeGoalCompletion', {
            goal: serializeNav(updated),
          });
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
        // SESSION COMPLETE (not goal complete) — show media prompt first
        setPendingFinishData({
          updated,
          totalSessionsDone,
          experience,
          recipientName,
          gift,
        });

        // If no media captured during timer, show prompt; otherwise go straight to completion flow
        if (!sessionMediaUri) {
          setShowMediaPrompt(true);
        } else {
          // Media already captured during timer — proceed directly
          await completeSessionFlow(updated, totalSessionsDone, experience, recipientName, gift);
        }
      }
    } catch (err) {
      logger.error(err);
      await logErrorToFirestore(err, {
        screenName: 'DetailedGoalCard',
        feature: 'UpdateGoalProgress',
        additionalData: { goalId: currentGoal.id },
      });
      showError('Could not update goal progress.');
    } finally {
      setLoading(false);
      finishLock.current = false;
    }
  }, [isTimerRunning, canFinish, loading, currentGoal, empoweredName, isSelfGift, stopTimer, clearTimerState, navigation, onFinish, sessionMediaUri, timeElapsed]);

  // ─── Complete session flow (after media prompt resolves) ─────────

  const completeSessionFlow = useCallback(async (
    updated: Goal,
    totalSessionsDone: number,
    experience: Awaited<ReturnType<typeof experienceService.getExperienceById>> | null,
    recipientName: string | null,
    _gift: Awaited<ReturnType<typeof experienceGiftService.getExperienceGiftById>> | null,
  ) => {
    // Create session record (with or without media)
    const goalId = updated.id;
    let mediaUrl: string | undefined;
    let mediaType: 'photo' | 'video' | undefined;

    try {
      // Upload media if captured
      if (sessionMediaUri && sessionMediaType) {
        try {
          mediaUrl = await storageService.uploadSessionMedia(
            sessionMediaUri, updated.userId, goalId, sessionMediaType
          );
          mediaType = sessionMediaType;
        } catch (err) {
          logger.warn('Failed to upload session media:', err);
        }
      }

      await sessionService.createSessionRecord(goalId, {
        goalId,
        userId: updated.userId,
        timestamp: new Date(),
        duration: timeElapsed,
        sessionNumber: totalSessionsDone,
        weekNumber: updated.currentCount,
        mediaUrl,
        mediaType,
      });
    } catch (err) {
      logger.warn('Failed to save session record:', err);
    }

    // Store uploaded media URL for feed post, then clear capture state
    setLastSessionMediaUrl(mediaUrl || null);
    setLastSessionMediaType(mediaType || null);
    setSessionMediaUri(null);
    setSessionMediaType(null);
    setPendingFinishData(null);

    // Process hints (skip for self-gifted goals)
    if (!isSelfGift) {
      await processHintAfterSession(updated, totalSessionsDone, experience, recipientName);
    }

    // Check for streak milestones (7, 14, 21, 30)
    const STREAK_MILESTONES = [7, 14, 21, 30];
    const hitMilestone = STREAK_MILESTONES.includes(totalSessionsDone) ? totalSessionsDone : null;

    // Show hint popup or celebration
    // Pre-fetch user data for the celebration feed preview
    const [celebUserName, celebUserProfile] = await Promise.all([
      userService.getUserName(updated.userId),
      userService.getUserProfile(updated.userId),
    ]);
    const celebTotalSessions = updated.targetCount * updated.sessionsPerWeek;
    const celebPct = Math.round((totalSessionsDone / celebTotalSessions) * 100);

    // Always prepare celebration data (used after hint dismissal or directly)
    setCelebrationData({
      userName: celebUserName || 'You',
      userProfileImageUrl: celebUserProfile?.profileImageUrl,
      sessionNumber: totalSessionsDone,
      totalSessions: celebTotalSessions,
      progressPct: celebPct,
      mediaUri: mediaUrl || null,
      weeklyCount: updated.weeklyCount,
      sessionsPerWeek: updated.sessionsPerWeek,
      weeksCompleted: updated.currentCount,
      totalWeeks: updated.targetCount,
    });

    if (!isSelfGift) {
      // Gifted goals: always show hint first, celebration chains after dismissal
      setShowHint(true);
    } else {
      // Self-gifted: no hints, direct to celebration
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCelebration(true);
    }

    onFinish?.(updated);

    // Check for CTA (free goals only, after user dismisses celebration)
    if (updated.isFreeGoal && !updated.giftAttachedAt && updated.pledgedExperience) {
      ctaService.shouldShowInlineCTA({
        goalId: updated.id,
        isFreeGoal: true,
        giftAttachedAt: updated.giftAttachedAt || null,
        sessionNumber: totalSessionsDone,
        weeklyCount: updated.weeklyCount,
        isWeekCompleted: updated.isWeekCompleted,
        currentCount: updated.currentCount,
      }).then(decision => {
        if (decision.shouldShow) {
          setCTADecision(decision);
          // CTA will be shown 2s after celebration is dismissed (see onClose handler)
        }
      }).catch(err => logger.warn('CTA check failed:', err));
    }

    // Giver notifications
    const weeksCompleted = updated.isWeekCompleted ? updated.currentCount + 1 : updated.currentCount;
    if (updated.empoweredBy && updated.empoweredBy !== updated.userId && experience) {
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

  }, [isSelfGift, sessionMediaUri, sessionMediaType, timeElapsed, onFinish]);

  // ─── Media prompt handlers ────────────────────────────────────────

  const handleMediaPromptSkip = useCallback(async () => {
    setShowMediaPrompt(false);
    if (pendingFinishData) {
      const { updated, totalSessionsDone, experience, recipientName, gift } = pendingFinishData;
      setSessionMediaUri(null);
      setSessionMediaType(null);
      await completeSessionFlow(updated, totalSessionsDone, experience, recipientName, gift);
    }
  }, [pendingFinishData, completeSessionFlow]);

  const handleMediaPromptContinue = useCallback(async () => {
    setShowMediaPrompt(false);
    if (pendingFinishData) {
      const { updated, totalSessionsDone, experience, recipientName, gift } = pendingFinishData;
      await completeSessionFlow(updated, totalSessionsDone, experience, recipientName, gift);
    }
  }, [pendingFinishData, completeSessionFlow]);

  // ─── Post to feed ─────────────────────────────────────────────────

  const handlePostToFeed = useCallback(async () => {
    try {
      const userName = await userService.getUserName(currentGoal.userId);
      const userProfile = await userService.getUserProfile(currentGoal.userId);
      const totalSessions = currentGoal.targetCount * currentGoal.sessionsPerWeek;

      await feedService.createFeedPost({
        userId: currentGoal.userId,
        userName: userName || 'User',
        userProfileImageUrl: userProfile?.profileImageUrl,
        goalId: currentGoal.id,
        goalDescription: currentGoal.description || currentGoal.title,
        type: 'session_progress',
        sessionNumber: lastSessionNumber,
        totalSessions,
        weeklyCount: currentGoal.weeklyCount,
        sessionsPerWeek: currentGoal.sessionsPerWeek,
        progressPercentage: Math.round((lastSessionNumber / totalSessions) * 100),
        isFreeGoal: currentGoal.isFreeGoal,
        pledgedExperienceId: currentGoal.pledgedExperience?.experienceId,
        pledgedExperiencePrice: currentGoal.pledgedExperience?.price,
        experienceTitle: currentGoal.pledgedExperience?.title,
        experienceImageUrl: currentGoal.pledgedExperience?.coverImageUrl,
        mediaUrl: lastSessionMediaUrl || undefined,
        mediaType: lastSessionMediaType || undefined,
        createdAt: new Date(),
      });
      logger.log('Feed post created for session', lastSessionNumber);
    } catch (err) {
      logger.warn('Failed to create feed post:', err);
    }
  }, [currentGoal, lastSessionNumber, lastSessionMediaUrl, lastSessionMediaType]);

  // ─── Hint processing (extracted for readability) ──────────────────

  const processHintAfterSession = async (
    updated: Goal,
    totalSessionsDone: number,
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
      updated.hints = [...(updated.hints || []), hintObj];
    } else {
      const aiHintSessionNumber = totalSessionsDone + 1;

      try {
        const cachedHint = await aiHintService.getHint(updated.id, aiHintSessionNumber);

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
          updated.hints = [...(updated.hints || []), hintObj];
        }
      } catch (err) {
        logger.warn('Failed to retrieve/save AI hint:', err);
        hintToShow = "Keep going! You're doing great";
      }
      setLastHint(hintToShow);
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
    (navigation as { navigate: (screen: string, params?: unknown) => void }).navigate('Journey', { goal: g });
  };

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPressIn={isTimerRunning ? undefined : onPressIn}
        onPressOut={isTimerRunning ? undefined : onPressOut}
        onPress={isTimerRunning ? undefined : () => handlePress(currentGoal)}
        disabled={isTimerRunning}
        style={{ borderRadius: 16 }}
      >
        <View style={styles.card}>
          {/* Title & badges */}
          <Text style={styles.title}>
            {currentGoal.title}
          </Text>
          {!!empoweredName && !isSelfGift && (
            <Text style={styles.empoweredText}>Empowered by {empoweredName}</Text>
          )}
          {currentGoal.isMystery && (
            <View style={styles.mysteryBadge}>
              <Text style={styles.mysteryBadgeText}>Mystery Gift</Text>
            </View>
          )}
          {/* startDateText removed — was showing "started X days ago" */}

          {/* Weekly Calendar */}
          <WeeklyCalendar
            weekDates={progress.weekDates}
            loggedSet={progress.loggedSet}
            todayIso={progress.todayIso}
          />

          {/* Progress Bars */}
          <ProgressBars
            weeklyFilled={progress.weeklyFilled}
            weeklyTotal={progress.weeklyTotal}
            completedWeeks={progress.completedWeeks}
            overallTotal={progress.overallTotal}
          />

          {/* Action Area or Timer — animated crossfade */}
          <Animated.View style={{
            opacity: timerFadeAnim,
            transform: [{ translateY: timerFadeAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          }}>
            {!isTimerRunning ? (
              <SessionActionArea
                goal={currentGoal}
                empoweredName={empoweredName}
                alreadyLoggedToday={progress.alreadyLoggedToday}
                totalSessionsDone={progress.totalSessionsDone}
                hasPersonalizedHintWaiting={progress.hasPersonalizedHintWaiting && !isTimerRunning}
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
          </Animated.View>
        </View>
      </Pressable>

      {/* Debug Controls */}
      {debugMode && (
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
        onClose={() => {
          setShowHint(false);
          // Chain to celebration so user can post to feed with session media
          if (celebrationData) {
            setShowCelebration(true);
          }
        }}
      />

      <CancelSessionModal
        visible={showCancelPopup}
        onClose={() => setShowCancelPopup(false)}
        onConfirm={cancelSessionInternal}
        message={cancelMessage}
      />

      <CelebrationModal
        visible={showCelebration}
        onClose={() => {
          setShowCelebration(false);
          setCelebrationData(null);
          // Show CTA 2s after celebration dismisses (if decision was stored)
          if (ctaDecision && !showCTA) {
            setTimeout(() => setShowCTA(true), 2000);
          }
        }}
        onPostToFeed={handlePostToFeed}
        goalTitle={currentGoal.description || currentGoal.title}
        sessionNumber={celebrationData?.sessionNumber}
        totalSessions={celebrationData?.totalSessions}
        progressPct={celebrationData?.progressPct}
        mediaUri={celebrationData?.mediaUri}
        userName={celebrationData?.userName}
        userProfileImageUrl={celebrationData?.userProfileImageUrl}
        weeklyCount={celebrationData?.weeklyCount}
        sessionsPerWeek={celebrationData?.sessionsPerWeek}
        weeksCompleted={celebrationData?.weeksCompleted}
        totalWeeks={celebrationData?.totalWeeks}
      />

      <SessionMediaPrompt
        visible={showMediaPrompt}
        capturedMediaUri={sessionMediaUri}
        capturedMediaType={sessionMediaType}
        onCamera={handleCaptureMedia}
        onGallery={handleGalleryPick}
        onSkip={handleMediaPromptSkip}
        onContinue={handleMediaPromptContinue}
      />

      {/* Inline Experience Purchase CTA */}
      {showCTA && ctaDecision && currentGoal.isFreeGoal && currentGoal.pledgedExperience && (
        <InlineExperienceCTA
          experience={{
            title: currentGoal.pledgedExperience.title,
            coverImageUrl: currentGoal.pledgedExperience.coverImageUrl,
            price: currentGoal.pledgedExperience.price,
          }}
          statMessage={ctaDecision.message.stat}
          statSource={ctaDecision.message.source}
          onGift={() => {
            setShowCTA(false);
            navigation.navigate('ExperienceCheckout', {
              cartItems: [{ experienceId: currentGoal.pledgedExperience!.experienceId, quantity: 1 }],
              goalId: currentGoal.id,
            });
          }}
          onDismiss={() => {
            setShowCTA(false);
            ctaService.recordDismiss(currentGoal.id);
          }}
        />
      )}
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
    shadowColor: Colors.textPrimary,
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
  title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 22, textAlign: 'center' },
  empoweredText: { fontSize: 14, color: Colors.textSecondary, marginBottom: 14, textAlign: 'center' },
  mysteryBadge: {
    alignSelf: 'center', backgroundColor: Colors.warningLight, paddingHorizontal: 14,
    paddingVertical: 6, borderRadius: 10, marginBottom: 14,
    borderWidth: 1, borderColor: '#fde68a',
  },
  mysteryBadgeText: { fontSize: 13, fontWeight: '700', color: '#92400e' },
  selfChallengeText: { fontSize: 14, color: Colors.primary, marginBottom: 14, fontWeight: '600', textAlign: 'center' },
  startDateText: { fontSize: 13, color: '#059669', marginBottom: 14, fontWeight: '600', textAlign: 'center' },
  projectedFinish: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 2,
  },

  // Debug
  debugContainer: {
    marginTop: 20, padding: 16,
    backgroundColor: Colors.backgroundLight, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
  },
  debugTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textSecondary,
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  debugButtonsRow: { flexDirection: 'row', gap: 10 },
  debugButton: {
    flex: 1, backgroundColor: Colors.border,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.gray300,
  },
  debugButtonText: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
});

export default DetailedGoalCard;
