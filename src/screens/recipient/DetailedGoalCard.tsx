import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Pressable,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Goal, ExperienceGift, PersonalizedHint, isSelfGifted } from '../../types';
import { db } from '../../services/firebase';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { normalizeGoal } from '../../services/GoalService';
import { goalService } from '../../services/GoalService';
import { userService } from '../../services/userService';
import { notificationService } from '../../services/NotificationService';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { experienceService } from '../../services/ExperienceService';
import { useRootNavigation } from '../../types/navigation';
import HintPopup from '../../components/HintPopup';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Avatar } from '../../components/Avatar';
import { aiHintService } from '../../services/AIHintService';
import { pushNotificationService } from '../../services/PushNotificationService';

import { useTimerContext } from '../../context/TimerContext';
import { logger } from '../../utils/logger';
import { logErrorToFirestore } from '../../utils/errorLogger';
import { serializeNav } from '../../utils/serializeNav';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { useToast } from '../../context/ToastContext';
import { getUserMessage } from '../../utils/AppError';
import { vh } from '../../utils/responsive';

// Extracted utilities, hooks, and components
import {
  isGoalLocked,
  HintObject,
  PartnerGoalData,
} from './goalCardUtils';
import { useGoalProgress } from './hooks/useGoalProgress';
import { usePostSessionFlow } from './hooks/usePostSessionFlow';
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
import { discoveryService } from '../../services/DiscoveryService';
import { locationService } from '../../services/LocationService';
import DiscoveryQuizModal from '../../components/DiscoveryQuizModal';
import ExperienceRevealModal from '../../components/ExperienceRevealModal';
import VenueSelectionModal from '../../components/VenueSelectionModal';
import { PopupMenu, PopupMenuItem } from '../../components/PopupMenu';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import GoalEditModal from '../../components/GoalEditModal';
import { Gift } from 'lucide-react-native';
import { useApp } from '../../context/AppContext';
import { toJSDate } from '../../utils/GoalHelpers';


const MAX_SESSION_SECONDS = 28800; // 8 hours

// ─── Props ──────────────────────────────────────────────────────────

interface DetailedGoalCardProps {
  goal: Goal;
  onFinish?: (goal: Goal) => void;
}

// ─── Main Component ─────────────────────────────────────────────────

const DetailedGoalCard: React.FC<DetailedGoalCardProps> = ({ goal, onFinish }) => {
  const { t } = useTranslation();
  const colors = useColors();
  const isWeb = Platform.OS === 'web';
  const styles = useMemo(() => createStyles(colors, isWeb), [colors, isWeb]);
  const [currentGoal, setCurrentGoal] = useState(goal);
  const [empoweredName, setEmpoweredName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastHint, setLastHint] = useState<HintObject | string | null>(null);
  const [lastSessionNumber, setLastSessionNumber] = useState<number>(0);
  // Ref keeps lastSessionNumber readable synchronously — state updates are async
  // so handlePostToFeed uses this ref instead of stale state
  const lastSessionNumberRef = useRef<number>(0);
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showGoalEditModal, setShowGoalEditModal] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  // Post-session modal flow (state machine — replaces chained setTimeout + booleans)
  const flow = usePostSessionFlow();

  // Rematch-in-flight state for the reveal modal's "Show me another" action
  const [rematching, setRematching] = useState(false);
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
    weekJustCompleted: boolean;
    completedWeekNumber: number;
    inlineHint?: HintObject | string | null;
  } | null>(null);
  const [debugTimeKey, setDebugTimeKey] = useState(0);
  const cancelMessage = t('recipient.detailedGoal.cancelSessionMessage');

  // Media capture state
  const [sessionMediaUri, setSessionMediaUri] = useState<string | null>(null);
  const [sessionMediaType, setSessionMediaType] = useState<'photo' | 'video' | null>(null);
  const [lastSessionMediaUrl, setLastSessionMediaUrl] = useState<string | null>(null);
  const [lastSessionMediaType, setLastSessionMediaType] = useState<'photo' | 'video' | null>(null);
  const [pendingFinishData, setPendingFinishData] = useState<{
    updated: Goal;
    totalSessionsDone: number;
    experience: Awaited<ReturnType<typeof experienceService.getExperienceById>> | null;
    recipientName: string | null;
    gift: Awaited<ReturnType<typeof experienceGiftService.getExperienceGiftById>> | null;
  } | null>(null);

  // CTA + Discovery: visibility is owned by `flow` (state machine).
  // `flow.ctaDecision` and `flow.setCTADecision` carry the async-loaded CTA payload.

  // Venue/location state
  const [showVenueModal, setShowVenueModal] = useState(false);
  const [pendingStartAfterVenue, setPendingStartAfterVenue] = useState(false);
  const shouldResumeStartRef = useRef(false);

  // Partner goal state for shared/together challenges
  const [partnerGoalData, setPartnerGoalData] = useState<PartnerGoalData | null>(null);
  const [partnerProfile, _setPartnerProfile] = useState<{ name: string; photoURL?: string } | null>(null);
  const partnerProfileRef = useRef<{ name: string; photoURL?: string } | null>(null);
  const setPartnerProfile = useCallback((profile: { name: string; photoURL?: string } | null) => {
    partnerProfileRef.current = profile;
    _setPartnerProfile(profile);
  }, []);
  const [selectedView, setSelectedView] = useState<'user' | 'partner'>('user');
  const viewFadeAnim = useRef(new Animated.Value(1)).current;

  const [experienceName, setExperienceName] = useState<string | null>(null);
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
  const [timerTransitionDone, setTimerTransitionDone] = useState(true);
  const prevTimerRunning = useRef(isTimerRunning);

  useEffect(() => {
    if (prevTimerRunning.current !== isTimerRunning) {
      prevTimerRunning.current = isTimerRunning;
      setTimerTransitionDone(false);
      timerFadeAnim.setValue(0);
      Animated.timing(timerFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          // On Android, the native driver can desync from JS on frequent re-renders
          // (timer ticks every second). Clearing the animated style after transition
          // prevents the Animated.View from flickering on subsequent re-renders.
          setTimerTransitionDone(true);
        }
      });
    }
  }, [isTimerRunning, timerFadeAnim]);


  // ─── Hooks ──────────────────────────────────────────────────────

  const progress = useGoalProgress({
    goal: currentGoal,
    selectedView,
    partnerGoalData,
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

  // Fetch attached experience name (hidden for mystery gifts)
  useEffect(() => {
    if (currentGoal.isMystery) {
      setExperienceName(null);
      return;
    }
    if (currentGoal.pledgedExperience?.title) {
      setExperienceName(currentGoal.pledgedExperience.title);
      return;
    }
    if (currentGoal.experienceGiftId) {
      experienceGiftService.getExperienceGiftById(currentGoal.experienceGiftId)
        .then((gift) => {
          // Check mystery flag on the gift doc too (may not be on the goal yet)
          if (gift.isMystery || !gift.experienceId) {
            setExperienceName(null);
            return null;
          }
          return experienceService.getExperienceById(gift.experienceId);
        })
        .then((exp) => { if (exp?.title) setExperienceName(exp.title); })
        .catch(() => { /* silently fail */ });
    }
  }, [currentGoal.experienceGiftId, currentGoal.isMystery, currentGoal.pledgedExperience?.title]);

  // Reset view when partner data disappears
  useEffect(() => {
    if (!partnerGoalData && selectedView === 'partner') {
      setSelectedView('user');
    }
  }, [partnerGoalData, selectedView]);

  // Real-time partner goal listener for shared/together challenges
  useEffect(() => {
    if (!currentGoal.partnerGoalId) {
      setPartnerGoalData(null);
      setPartnerProfile(null); // also clears partnerProfileRef via the wrapper
      return;
    }

    const partnerRef = doc(db, 'goals', currentGoal.partnerGoalId);
    const unsubscribe = onSnapshot(
      partnerRef,
      (snap) => {
        if (!snap.exists()) {
          setPartnerGoalData(null);
          return;
        }
        const raw = normalizeGoal({ id: snap.id, ...snap.data() });
        setPartnerGoalData({
          userId: raw.userId,
          weeklyCount: raw.weeklyCount ?? 0,
          sessionsPerWeek: raw.sessionsPerWeek ?? 1,
          weeklyLogDates: raw.weeklyLogDates ?? [],
          isWeekCompleted: raw.isWeekCompleted ?? false,
          isCompleted: raw.isCompleted,
          weekStartAt: raw.weekStartAt,
          targetCount: raw.targetCount,
          currentCount: raw.currentCount,
          title: raw.title,
        });
        // Fetch partner profile (name + photo) for avatar display
        if (raw.userId && !partnerProfileRef.current) {
          Promise.all([
            userService.getUserProfile(raw.userId),
            userService.getUserName(raw.userId),
          ]).then(([profile, name]) => {
            setPartnerProfile({
              name: profile?.name || name || 'Partner',
              photoURL: profile?.profileImageUrl,
            });
          }).catch(() => { /* silently fail */ });
        }
      },
      (error) => {
        logger.error('Error listening to partner goal:', error);
        setPartnerGoalData(null);
      }
    );

    return () => unsubscribe();
  }, [currentGoal.partnerGoalId]);

  // Sync goal prop changes from parent (JourneyScreen owns the onSnapshot listener)
  useEffect(() => {
    if (!goal) return;
    // Always sync important display fields — check all fields that affect UI
    setCurrentGoal(prev => {
      if (!prev) return normalizeGoal(goal);
      const changed =
        prev.weeklyCount !== goal.weeklyCount ||
        prev.currentCount !== goal.currentCount ||
        prev.isCompleted !== goal.isCompleted ||
        prev.isWeekCompleted !== goal.isWeekCompleted ||
        prev.approvalStatus !== goal.approvalStatus ||
        prev.personalizedNextHint !== goal.personalizedNextHint ||
        prev.discoveredExperience !== goal.discoveredExperience ||
        prev.empoweredBy !== goal.empoweredBy ||
        prev.experienceGiftId !== goal.experienceGiftId;
      return changed ? normalizeGoal(goal) : prev;
    });
  }, [goal]);

  // Background timer awareness — notify when app becomes visible and timer running
  useEffect(() => {
    if (!isTimerRunning || !startTime) return;

    const checkElapsedTime = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed >= progress.totalGoalSeconds && progress.totalGoalSeconds > 0) {
        if (Platform.OS === 'web' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const notification = new Notification(t('recipient.detailedGoal.notification.sessionUpTitle'), {
              body: t('recipient.detailedGoal.notification.sessionUpBody'),
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: `session-${currentGoal.id}`,
              requireInteraction: true,
            });
            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          } catch (e: unknown) {
            logger.warn('Failed to create browser notification:', e);
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(t('recipient.detailedGoal.notification.sessionUpTitle'), {
                  body: t('recipient.detailedGoal.notification.sessionUpBody'),
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
      const raw = await AsyncStorage.getItem('global_timer_state');
      if (raw) {
        const timers = JSON.parse(raw);
        delete timers[currentGoal.id];
        await AsyncStorage.setItem('global_timer_state', JSON.stringify(timers));
      }
      await pushNotificationService.cancelSessionNotification(currentGoal.id);
    } catch (error: unknown) {
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
        showInfo(t('recipient.detailedGoal.error.cameraPermission'));
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
    } catch (error: unknown) {
      logger.warn('Media capture failed:', error);
    }
  }, []);

  const handleGalleryPick = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showInfo(t('recipient.detailedGoal.error.galleryPermission'));
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
    } catch (error: unknown) {
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
        ? t('recipient.detailedGoal.error.suggestedChangeStart', { name: empoweredName || t('recipient.detailedGoal.yourGiver') })
        : t('recipient.detailedGoal.error.lockedSingleSession');
      showError(message);
      return;
    }
    if (isGoalLocked(currentGoal) && currentGoal.targetCount >= 1 && currentGoal.weeklyCount >= 1) {
      const message = currentGoal.approvalStatus === 'suggested_change'
        ? t('recipient.detailedGoal.error.suggestedChangeStartAnother', { name: empoweredName || t('recipient.detailedGoal.yourGiver') })
        : t('recipient.detailedGoal.error.waitingApprovalStart', { name: empoweredName || t('recipient.detailedGoal.yourGiver') });
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
        if (gift.experienceId) {
          experience = await experienceService.getExperienceById(gift.experienceId);
        }
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
            showInfo(t('recipient.detailedGoal.error.sessionWait', { seconds: secondsRemaining }));
            setLoading(false);
            return;
          }
        }
      }

      // TODO: Re-enable venue selection (Phase 3)
      // Venue check: prompt for venue on first session if not set
      // if (!currentGoal.venueId && !currentGoal.venueName) {
      //   setShowVenueModal(true);
      //   setPendingStartAfterVenue(true);
      //   setLoading(false);
      //   return;
      // }

      // GPS verification: if venue is set with coordinates, check proximity
      if (currentGoal.venueLocation) {
        const check = await locationService.isAtVenue(currentGoal.venueLocation);
        if (!check.isNearby) {
          const distKm = (check.distanceMeters / 1000).toFixed(1);
          showInfo(t('recipient.detailedGoal.error.gpsDistance', { distance: distKm, venue: currentGoal.venueName || t('recipient.detailedGoal.yourVenue') }));
          // Don't block — just inform. User can still start.
        }
      }

      const funcTotalSessionsDone = (currentGoal.currentCount * currentGoal.sessionsPerWeek) + currentGoal.weeklyCount;
      const funcTotalSessions = currentGoal.targetCount * currentGoal.sessionsPerWeek;

      // Start timer (pass title + target seconds for live notification)
      const goalTargetSeconds = (currentGoal.targetHours || 0) * 3600 + (currentGoal.targetMinutes || 0) * 60;
      await startTimer(currentGoal.id, null, currentGoal.title, goalTargetSeconds);

      // Background hint generation
      const nextSessionNumber = funcTotalSessionsDone + 2;
      const hasPersonalizedHintForNextSession =
        currentGoal.personalizedNextHint &&
        currentGoal.personalizedNextHint.forSessionNumber === nextSessionNumber;

      // Hint generation: works for gifted goals, mystery goals, AND discovery engine goals
      const hasDiscoveredExperience = !!currentGoal.discoveredExperience;
      const canGenerateHints =
        !isSelfGift &&
        funcTotalSessionsDone !== funcTotalSessions &&
        !hasPersonalizedHintForNextSession &&
        (!!experience || !!currentGoal.isMystery || hasDiscoveredExperience);

      if (canGenerateHints && !hintGeneratingRef.current) {
        hintGeneratingRef.current = true;
        // Mystery and discovery goals: pass goalId, server resolves experience
        // Normal gifted goals: pass experience data directly
        const useServerLookup = currentGoal.isMystery || hasDiscoveredExperience;
        const hintPromise = useServerLookup
          ? aiHintService.generateMysteryHint({
              userId: currentGoal.userId,
              goalId,
              sessionNumber: nextSessionNumber,
              totalSessions: funcTotalSessions,
              userName: recipientName || undefined,
            })
          : aiHintService.generateHint({
              userId: currentGoal.userId,
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
    } catch (err: unknown) {
      logger.error('Failed to start session:', err);
      showError(t('recipient.detailedGoal.error.startSession'));
    } finally {
      setLoading(false);
    }
  }, [isTimerRunning, loading, currentGoal, empoweredName, startTimer, debugMode]);

  // Resume session start after venue selection (avoids stale closure)
  useEffect(() => {
    if (shouldResumeStartRef.current && (currentGoal.venueId || currentGoal.venueName)) {
      shouldResumeStartRef.current = false;
      handleStart();
    }
  }, [currentGoal.venueId, currentGoal.venueName, handleStart]);

  const finishLock = useRef(false);
  const hintGeneratingRef = useRef(false);

  // ─── Complete session flow (after media prompt resolves) ─────────
  // Defined BEFORE handleFinish so it can be referenced in handleFinish's body
  // and included in its dependency array.

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
        } catch (err: unknown) {
          logger.warn('Failed to upload session media:', err);
        }
      }

      await sessionService.createSessionRecord(goalId, {
        goalId,
        userId: updated.userId,
        timestamp: new Date(),
        duration: Math.min(timeElapsed, MAX_SESSION_SECONDS),
        sessionNumber: totalSessionsDone,
        weekNumber: updated.currentCount,
        mediaUrl,
        mediaType,
      });
    } catch (err: unknown) {
      // Non-critical: goal progress (tickWeeklySession transaction) already committed
      logger.warn('Failed to save session record (non-critical):', err);
    }

    // Store uploaded media URL for feed post, then clear capture state
    setLastSessionMediaUrl(mediaUrl || null);
    setLastSessionMediaType(mediaType || null);
    setSessionMediaUri(null);
    setSessionMediaType(null);
    setPendingFinishData(null);

    // Process hints (skip for self-gifted goals). Return the hint value so we can decide
    // whether it's a "rich" hint (image/audio → dedicated HintPopup) or a "simple" text
    // hint (inlined as a section inside the celebration, one modal instead of two).
    const hintValue = !isSelfGift
      ? await processHintAfterSession(updated, totalSessionsDone, experience, recipientName)
      : null;
    const isRichHint = !!(
      hintValue &&
      typeof hintValue === 'object' &&
      (hintValue.imageUrl || hintValue.audioUrl)
    );
    const simpleInlineHint = hintValue && !isRichHint ? hintValue : null;

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

    // Compute week celebration: isWeekCompleted=true means the week just flipped
    const weekJustCompleted = updated.isWeekCompleted === true;
    // currentCount is only incremented by the week boundary sweep (next session),
    // so add 1 when the week was just completed to reflect the actual count now.
    const adjustedWeeksCompleted = weekJustCompleted
      ? updated.currentCount + 1
      : updated.currentCount;
    const completedWeekNumber = weekJustCompleted ? adjustedWeeksCompleted : 0;

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
      weeksCompleted: adjustedWeeksCompleted,
      totalWeeks: updated.targetCount,
      weekJustCompleted,
      completedWeekNumber,
      inlineHint: simpleInlineHint,
    });

    if (isSelfGift && Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Recovery: if the user has already answered enough quiz questions but no match
    // was ever persisted (e.g. previous match attempts returned null because the
    // catalog was empty, or the pre-fix quiz auto-closed without matching), retry
    // the match here using their existing preferences. This unsticks accounts that
    // are trapped with questionsCompleted >= 3 and discoveredExperience still null.
    let effectiveGoal: Goal = updated;
    if (
      !updated.discoveredExperience &&
      updated.preferredRewardCategory &&
      discoveryService.canMatchExperience(updated.discoveryQuestionsCompleted || 0)
    ) {
      try {
        logger.log('[DetailedGoalCard] Recovery match attempt', {
          goalId: updated.id,
          category: updated.preferredRewardCategory,
          questionsCompleted: updated.discoveryQuestionsCompleted,
        });
        const matched = await discoveryService.matchExperience(
          updated.id,
          updated.preferredRewardCategory,
          updated.discoveryPreferences || {},
        );
        if (matched) {
          const discoveredExperience = {
            experienceId: matched.id,
            title: matched.title,
            subtitle: matched.subtitle,
            description: matched.description,
            category: matched.category,
            price: matched.price,
            coverImageUrl: matched.coverImageUrl,
            imageUrl: matched.imageUrl,
            partnerId: matched.partnerId,
            ...(matched.location !== undefined ? { location: matched.location } : {}),
          };
          effectiveGoal = { ...updated, discoveredExperience, discoveredAt: new Date() };
          setCurrentGoal(effectiveGoal);
          logger.log('[DetailedGoalCard] Recovery match succeeded:', matched.title);
        } else {
          logger.warn('[DetailedGoalCard] Recovery match returned null — catalog empty');
        }
      } catch (err) {
        logger.warn('[DetailedGoalCard] Recovery match failed:', err);
      }
    }

    // Compute flow applicability up front (replaces chained setTimeout at celebration.onClose).
    // Uses `effectiveGoal` so the recovery-match path above feeds into needsReveal.
    const flowTotalSessions = (effectiveGoal.targetCount || 1) * (effectiveGoal.sessionsPerWeek || 1);
    const flowSessionsDone = (effectiveGoal.currentCount || 0) * (effectiveGoal.sessionsPerWeek || 1) + (effectiveGoal.weeklyCount || 0);
    const needsDiscoveryQuiz = discoveryService.needsDiscoveryQuiz(effectiveGoal) &&
      discoveryService.isInQuizPhase(flowSessionsDone, flowTotalSessions);
    // Show the reveal as soon as an experience has been matched and the user hasn't
    // locked it in yet. The 75% "secret reward" gate was removed — for self-set
    // challenges, users get more value from seeing the match early so they can
    // accept, rematch, or switch to manual browse.
    const needsReveal = !!effectiveGoal.discoveredExperience && !effectiveGoal.experienceRevealed;

    flow.startCelebrationFlow({
      // Only route through the dedicated HintPopup step for rich hints (image scratch / audio).
      // Simple text hints ride along inside the celebration modal as an inline section.
      hasHint: isRichHint,
      needsDiscoveryQuiz,
      needsReveal,
    });

    onFinish?.(updated);

    // Async CTA check — decision arrives later and is injected into the flow via setCTADecision.
    // If it resolves before the user dismisses celebration, CTA shows next. Otherwise it's skipped.
    if (updated.isFreeGoal && !updated.giftAttachedAt && updated.pledgedExperience) {
      ctaService.shouldShowInlineCTA({
        goalId: updated.id,
        isFreeGoal: true,
        giftAttachedAt: updated.giftAttachedAt || null,
        sessionNumber: totalSessionsDone,
        weeklyCount: updated.weeklyCount,
        isWeekCompleted: updated.isWeekCompleted,
        currentCount: updated.currentCount,
        totalSessions: flowTotalSessions,
      }).then(decision => {
        if (decision.shouldShow) {
          flow.setCTADecision(decision);
        }
      }).catch(err => logger.warn('CTA check failed:', err));
    }

    // Discovery engine: quiz or reveal for category-path goals
    if (discoveryService.needsDiscoveryQuiz(updated)) {
      const totalSessions = (updated.targetCount || 1) * (updated.sessionsPerWeek || 1);
      if (!updated.discoveredExperience && !discoveryService.isInQuizPhase(totalSessionsDone, totalSessions) && discoveryService.canMatchExperience(updated.discoveryQuestionsCompleted || 0)) {
        // Past quiz phase but no match yet: trigger matching now
        try {
          const matched = await discoveryService.matchExperience(
            updated.id,
            updated.preferredRewardCategory!,
            updated.discoveryPreferences || {}
          );
          if (matched) {
            const discoveredExperience = {
              experienceId: matched.id,
              title: matched.title,
              subtitle: matched.subtitle,
              description: matched.description,
              category: matched.category,
              price: matched.price,
              coverImageUrl: matched.coverImageUrl,
              imageUrl: matched.imageUrl,
              partnerId: matched.partnerId,
              ...(matched.location !== undefined ? { location: matched.location } : {}),
            };
            const discoveredAt = new Date();
            // Persist to Firestore first — only update local state after confirmed write
            try {
              await updateDoc(doc(db, 'goals', updated.id), {
                discoveredExperience,
                discoveredAt,
              });
              setCurrentGoal(prev => ({
                ...prev,
                discoveredExperience,
                discoveredAt,
              }));
            } catch (e) {
              logger.error('Failed to persist discovery:', e);
              showError(t('recipient.detailedGoal.error.discoveryPersist'));
            }
          }
        } catch (err: unknown) {
          logger.warn('Discovery matching failed:', err);
        }
      }
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

    // M3: Notify partner when a session is logged in a shared/together challenge
    if (updated.partnerGoalId && partnerGoalData?.userId) {
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: partnerGoalData.userId,
          type: 'shared_session',
          title: 'Partner Activity',
          message: `${appState.user?.displayName || 'Your partner'} logged a session!`,
          data: { goalId: updated.id },
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (e: unknown) {
        logger.warn('Failed to send partner session notification:', e);
      }
    }

  }, [isSelfGift, sessionMediaUri, sessionMediaType, timeElapsed, onFinish, partnerGoalData, appState.user]);

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
          ? t('recipient.detailedGoal.error.suggestedChangeContinue', { name: empoweredName || t('recipient.detailedGoal.yourGiver') })
          : t('recipient.detailedGoal.error.lockedSingleSession');
        showError(message);
        finishLock.current = false;
        return;
      }
      if (sessionsDoneBeforeFinish >= 1) {
        const message = currentGoal.approvalStatus === 'suggested_change'
          ? t('recipient.detailedGoal.error.suggestedChangeContinueMore', { name: empoweredName || t('recipient.detailedGoal.yourGiver') })
          : t('recipient.detailedGoal.error.waitingApprovalStart', { name: empoweredName || t('recipient.detailedGoal.yourGiver') });
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
        if (gift.experienceId) {
          experience = await experienceService.getExperienceById(gift.experienceId);
        }
      }

      const recipientName = await userService.getUserName(updated.userId);
      const totalSessionsDone = (updated.currentCount * updated.sessionsPerWeek) + updated.weeklyCount;
      // Update ref synchronously so handlePostToFeed reads the correct value
      // even before the async state update propagates
      lastSessionNumberRef.current = totalSessionsDone;
      setLastSessionNumber(totalSessionsDone);

      stopTimer(currentGoal.id);
      await clearTimerState();
      await pushNotificationService.cancelSessionNotification(goalId);

      if (updated.isCompleted) {
        // GOAL COMPLETION — create session record, then navigate.
        //
        // S-12 (INTENTIONAL NON-ATOMICITY): tickWeeklySession (above) runs as a
        // Firestore transaction that atomically updates the goal counter and triggers
        // the deferred-charge Cloud Function. The session record written here is
        // supplementary audit data only — if it fails, the goal counter and charge
        // trigger are already committed and correct. Navigation proceeds regardless.
        try {
          await sessionService.createSessionRecord(goalId, {
            goalId, userId: updated.userId, timestamp: new Date(),
            duration: Math.min(timeElapsed, MAX_SESSION_SECONDS), sessionNumber: totalSessionsDone,
            weekNumber: updated.currentCount,
          });
        } catch (err: unknown) {
          // Non-critical: goal progress and charge trigger are already committed
          logger.warn('Failed to save final session record (non-critical):', err);
        }

        // Free goals without attached gift: navigate to FreeGoalCompletion
        // Pay-on-completion: route to ExperienceCheckout instead of FreeGoalCompletion
        if (updated.isFreeGoal && !gift && updated.paymentCommitment === 'payOnCompletion' && updated.pledgedExperience) {
          navigation.navigate('ExperienceCheckout', {
            cartItems: [{
              experienceId: updated.pledgedExperience.experienceId,
              quantity: 1,
            }],
            goalId: updated.id,
          });
          return;
        }
        if (updated.isFreeGoal && !gift) {
          // Discovery engine: if experience was discovered but not yet revealed, show reveal first
          if (updated.discoveredExperience && !updated.experienceRevealed) {
            flow.openReveal();
            // After reveal is dismissed, onClose will mark as revealed and navigate to AchievementDetail
            // (because currentGoal.isCompleted is true in that branch of the reveal onClose handler).
            return;
          }
          navigation.navigate('AchievementDetail', {
            goal: serializeNav(updated),
            mode: 'completion',
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
          navigation.navigate('AchievementDetail', {
            goal: serializeNav(updated),
            experienceGift: serializeNav(gift),
            mode: 'completion',
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
          flow.openMediaPrompt();
        } else {
          // Media already captured during timer — proceed directly
          await completeSessionFlow(updated, totalSessionsDone, experience, recipientName, gift);
        }
      }
    } catch (err: unknown) {
      logger.error(err);
      await logErrorToFirestore(err, {
        screenName: 'DetailedGoalCard',
        feature: 'UpdateGoalProgress',
        additionalData: { goalId: currentGoal.id },
      });
      const errWithCode = err as Error & { code?: string };
      if (errWithCode?.code === 'unavailable' || errWithCode?.message?.includes('network') || errWithCode?.message?.includes('offline')) {
        showError(t('recipient.detailedGoal.error.offline'));
      } else {
        showError(t('recipient.detailedGoal.error.updateProgress'));
      }
    } finally {
      setLoading(false);
      finishLock.current = false;
    }
  }, [isTimerRunning, canFinish, loading, currentGoal, empoweredName, isSelfGift, stopTimer, clearTimerState, navigation, onFinish, sessionMediaUri, timeElapsed, timerState, completeSessionFlow]);



  // ─── Media prompt handlers ────────────────────────────────────────

  const handleMediaPromptSkip = useCallback(async () => {
    // flow.startCelebrationFlow (called inside completeSessionFlow) transitions step from 'media' → 'hint'/'celebration'
    if (pendingFinishData) {
      const { updated, totalSessionsDone, experience, recipientName, gift } = pendingFinishData;
      setSessionMediaUri(null);
      setSessionMediaType(null);
      await completeSessionFlow(updated, totalSessionsDone, experience, recipientName, gift);
    }
  }, [pendingFinishData, completeSessionFlow]);

  const handleMediaPromptContinue = useCallback(async () => {
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
        // Use ref to avoid reading stale state — setLastSessionNumber is async
        sessionNumber: lastSessionNumberRef.current,
        totalSessions,
        weeklyCount: currentGoal.weeklyCount,
        sessionsPerWeek: currentGoal.sessionsPerWeek,
        progressPercentage: Math.round((lastSessionNumberRef.current / totalSessions) * 100),
        isFreeGoal: currentGoal.isFreeGoal,
        pledgedExperienceId: currentGoal.pledgedExperience?.experienceId,
        pledgedExperiencePrice: currentGoal.pledgedExperience?.price,
        experienceTitle: currentGoal.pledgedExperience?.title,
        experienceImageUrl: currentGoal.pledgedExperience?.coverImageUrl,
        mediaUrl: lastSessionMediaUrl || undefined,
        mediaType: lastSessionMediaType || undefined,
        createdAt: new Date(),
      });
      logger.log('Feed post created for session', lastSessionNumberRef.current);
    } catch (err: unknown) {
      logger.warn('Failed to create feed post:', err);
    }
  }, [currentGoal, lastSessionMediaUrl, lastSessionMediaType]);

  // ─── Hint processing (extracted for readability) ──────────────────

  const processHintAfterSession = useCallback(async (
    updated: Goal,
    totalSessionsDone: number,
    experience: Awaited<ReturnType<typeof experienceService.getExperienceById>> | null,
    recipientName: string | null,
  ): Promise<HintObject | string | null> => {
    const hasPersonalizedHint =
      updated.personalizedNextHint &&
      updated.personalizedNextHint.forSessionNumber === totalSessionsDone + 1;

    let hintToShow: string;

    if (hasPersonalizedHint) {
      let ph = updated.personalizedNextHint!;
      if (ph.text && ph.text.length > 500) {
        ph = { ...ph, text: ph.text.substring(0, 500) };
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
      } catch (err: unknown) {
        logger.error('Failed to save personalized hint to history:', err);
      }

      try {
        await goalService.clearPersonalizedNextHint(updated.id);
      } catch (err: unknown) {
        logger.warn('Failed to clear personalized hint:', err);
      }

      setLastHint(hintObj);
      return hintObj;
    } else {
      const aiHintSessionNumber = totalSessionsDone + 1;

      try {
        const cachedHint = await aiHintService.getHint(updated.userId, updated.id!, aiHintSessionNumber);

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
        }
      } catch (err: unknown) {
        logger.warn('Failed to retrieve/save AI hint:', err);
        hintToShow = "Keep going! You're doing great";
      }
      setLastHint(hintToShow);
      return hintToShow;
    }
  }, []);

  // ─── Cancel session ───────────────────────────────────────────────

  const cancelSessionInternal = useCallback(async () => {
    try {
      stopTimer(currentGoal.id);
      await clearTimerState();
      await pushNotificationService.cancelSessionNotification(currentGoal.id);
    } catch (error: unknown) {
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
    navigation.navigate('Journey', { goal: g });
  };

  const handleRemoveGoal = useCallback(async () => {
    setIsRemoving(true);
    try {
      await goalService.deleteGoal(currentGoal.id!);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showSuccess(t('recipient.detailedGoal.goalRemoved'));
    } catch (err: unknown) {
      showError(getUserMessage(err, 'Could not remove goal. Please try again.'));
      setIsRemoving(false);
    } finally {
      setShowRemoveDialog(false);
    }
  }, [currentGoal.id, showSuccess, showError]);

  // Toggle between user and partner view with crossfade
  const handleViewToggle = useCallback((view: 'user' | 'partner') => {
    if (view === selectedView) return;
    Animated.timing(viewFadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setSelectedView(view);
      Animated.timing(viewFadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  }, [selectedView, viewFadeAnim]);

  const removeDialogMessage = useMemo(() => {
    let msg = t('recipient.detailedGoal.removeDialog.message');
    if (currentGoal.partnerGoalId) {
      msg += '\n\n' + t('recipient.detailedGoal.removeDialog.sharedSuffix');
    }
    if (currentGoal.approvalStatus === 'pending') {
      msg += '\n\n' + t('recipient.detailedGoal.removeDialog.pendingSuffix');
    }
    return msg;
  }, [currentGoal.partnerGoalId, currentGoal.approvalStatus, t]);

  // Show "Change reward" when the pledged reward came from the discovery engine
  // (discoveredExperience snapshot still present) and the user hasn't purchased yet.
  // Re-opens the reveal modal so they can pick another match or bail to manual browse.
  const canChangeDiscoveryReward =
    currentGoal.isFreeGoal &&
    !!currentGoal.discoveredExperience &&
    !!currentGoal.pledgedExperience &&
    !currentGoal.experienceGiftId;

  const goalMenuItems: PopupMenuItem[] = useMemo(() => {
    const items: PopupMenuItem[] = [
      {
        key: 'edit',
        label: (currentGoal.empoweredBy && currentGoal.empoweredBy !== appState.user?.id) ? t('recipient.detailedGoal.menu.requestChange') : t('recipient.detailedGoal.menu.editGoal'),
        onPress: () => setShowGoalEditModal(true),
        disabled: isTimerRunning || currentGoal.isCompleted,
      },
    ];
    if (canChangeDiscoveryReward) {
      items.push({
        key: 'change-reward',
        label: t('recipient.detailedGoal.menu.changeReward'),
        onPress: () => flow.openReveal(),
        disabled: isTimerRunning,
      });
    }
    items.push({
      key: 'remove',
      label: t('recipient.detailedGoal.menu.removeGoal'),
      onPress: () => setShowRemoveDialog(true),
      variant: 'danger' as const,
      disabled: isTimerRunning,
    });
    return items;
  }, [isTimerRunning, currentGoal.empoweredBy, currentGoal.isCompleted, appState.user?.id, t, canChangeDiscoveryReward, flow]);

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <ErrorBoundary screenName="DetailedGoalCard" userId={appState?.user?.id}>
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPressIn={isTimerRunning ? undefined : onPressIn}
        onPressOut={isTimerRunning ? undefined : onPressOut}
        onPress={isTimerRunning ? undefined : () => handlePress(currentGoal)}
        disabled={isTimerRunning}
        style={{ borderRadius: BorderRadius.lg }}
      >
        <View style={styles.card}>
          {/* Menu */}
          <View style={styles.cardMenuContainer}>
            <PopupMenu items={goalMenuItems} accessibilityLabel="Goal options" />
          </View>
          {/* Title & badges */}
          <Text style={styles.title}>
            {currentGoal.title}
          </Text>
          {currentGoal.challengeType === 'shared' && partnerProfile && (
            <Text style={styles.titlePartnerSuffix}>{t('recipient.detailedGoal.withPartner', { firstName: partnerProfile.name.split(' ')[0] })}</Text>
          )}
          {!!empoweredName && !isSelfGift && !currentGoal.isFreeGoal && currentGoal.challengeType !== 'shared' && (
            <Text style={styles.empoweredText}>{t('recipient.detailedGoal.empoweredBy', { name: empoweredName })}</Text>
          )}
          {currentGoal.isMystery && (
            <View style={styles.mysteryBadge}>
              <Text style={styles.mysteryBadgeText}>{t('recipient.detailedGoal.mysteryGift')}</Text>
            </View>
          )}
          {/* Extra spacing when no subtitle elements are shown */}
          {!(currentGoal.challengeType === 'shared' && partnerProfile) &&
           !(!!empoweredName && !isSelfGift && !currentGoal.isFreeGoal && currentGoal.challengeType !== 'shared') &&
           !currentGoal.isMystery && (
            <View style={{ height: Spacing.sm }} />
          )}

          {/* Together mode: dual avatar toggle */}
          {currentGoal.challengeType === 'shared' && partnerGoalData && partnerProfile && (
            <View style={styles.avatarToggleRow}>
              <TouchableOpacity
                style={[styles.avatarTogglePill, selectedView === 'user' && styles.avatarTogglePillActive]}
                onPress={() => handleViewToggle('user')}
                activeOpacity={0.7}
              >
                <Avatar
                  uri={appState.user?.profile?.profileImageUrl}
                  name={appState.user?.displayName || 'You'}
                  size="md"
                />
                <Text style={[styles.avatarToggleText, selectedView === 'user' && styles.avatarToggleTextActive]}>
                  You
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.avatarTogglePill, selectedView === 'partner' && styles.avatarTogglePillActive]}
                onPress={() => handleViewToggle('partner')}
                activeOpacity={0.7}
              >
                <Avatar
                  uri={partnerProfile.photoURL}
                  name={partnerProfile.name}
                  size="md"
                />
                <Text style={[styles.avatarToggleText, selectedView === 'partner' && styles.avatarToggleTextActive]}>
                  {partnerProfile.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Weekly Calendar + Progress (animated crossfade for toggle) */}
          <Animated.View style={{ opacity: viewFadeAnim }}>
            <WeeklyCalendar
              weekDates={progress.weekDates}
              loggedSet={progress.loggedSet}
              todayIso={progress.todayIso}
            />

            <ProgressBars
              weeklyFilled={progress.weeklyFilled}
              weeklyTotal={progress.weeklyTotal}
              completedWeeks={progress.completedWeeks}
              overallTotal={progress.overallTotal}
            />
          </Animated.View>

          {/* M4: "Waiting for partner to finish" — goal completed but partner hasn't unlocked yet */}
          {(currentGoal.isCompleted === true || currentGoal.isReadyToComplete === true) &&
            !currentGoal.isUnlocked &&
            !!currentGoal.partnerGoalId && (
            <View style={styles.waitingBanner}>
              <Text style={styles.waitingBannerText}>
                {t('recipient.detailedGoal.waitingPartnerFinish')}
              </Text>
              {partnerGoalData && (
                <View style={styles.waitingBannerProgress}>
                  <Text style={styles.waitingBannerProgressLabel}>
                    {t('recipient.detailedGoal.partnerProgress', { current: partnerGoalData.currentCount ?? 0, total: partnerGoalData.targetCount ?? 0 })}
                  </Text>
                  <View style={styles.waitingBannerProgressTrack}>
                    <View
                      style={[
                        styles.waitingBannerProgressFill,
                        {
                          width: `${partnerGoalData.targetCount
                            ? Math.min(100, Math.round(((partnerGoalData.currentCount ?? 0) / partnerGoalData.targetCount) * 100))
                            : 0}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              )}
            </View>
          )}

          {/* M4: "Waiting for partner to accept" — shared challenge not yet linked to partner goal */}
          {currentGoal.challengeType === 'shared' && !currentGoal.partnerGoalId && (
            <View style={styles.waitingBanner}>
              <Text style={styles.waitingBannerText}>
                {t('recipient.detailedGoal.waitingPartnerAccept')}
              </Text>
              <TouchableOpacity
                style={styles.resendInviteButton}
                onPress={async () => {
                  try {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    let giftData = null;
                    if (currentGoal.experienceGiftId) {
                      giftData = await experienceGiftService.getExperienceGiftById(currentGoal.experienceGiftId);
                    }
                    if (!giftData?.claimCode && !currentGoal.claimCode) {
                      showError(t('recipient.detailedGoal.error.inviteCode'));
                      return;
                    }
                    navigation.navigate('Confirmation', {
                      experienceGift: (giftData || { id: currentGoal.id, claimCode: currentGoal.claimCode }) as ExperienceGift,
                      challengeType: 'shared',
                      isCategory: !currentGoal.experienceGiftId || !giftData?.experienceId,
                      preferredRewardCategory: currentGoal.preferredRewardCategory,
                    });
                  } catch (err: unknown) {
                    logger.warn('Navigate to share screen failed:', err);
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.resendInviteText}>{t('recipient.detailedGoal.resendInvite')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Action Area or Timer — animated crossfade */}
          <Animated.View style={timerTransitionDone
            ? { opacity: 1 }
            : {
              opacity: timerFadeAnim,
              transform: [{ translateY: timerFadeAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            }
          }>
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
                goalId={currentGoal.id}
                goalTitle={currentGoal.title}
                onFinish={handleFinish}
                onCancel={() => setShowCancelPopup(true)}
              />
            )}
          </Animated.View>
        </View>
      </Pressable>

      {/* Debug Controls */}
      {__DEV__ && debugMode && (
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
        visible={flow.step === 'hint'}
        hint={(lastHint || '') as PersonalizedHint | string}
        sessionNumber={lastSessionNumber}
        totalSessions={progress.overallTotal}
        onClose={flow.advance}
      />

      <CancelSessionModal
        visible={showCancelPopup}
        onClose={() => setShowCancelPopup(false)}
        onConfirm={cancelSessionInternal}
        message={cancelMessage}
      />

      <CelebrationModal
        visible={flow.step === 'celebration'}
        onClose={flow.advance}
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
        weekJustCompleted={celebrationData?.weekJustCompleted}
        completedWeekNumber={celebrationData?.completedWeekNumber}
        inlineHint={celebrationData?.inlineHint ?? null}
        onSessionPrivacy={(visibility) => {
          // Future: update last session visibility in Firestore
          // For now, if private: don't post to feed (handled by not calling onPostToFeed)
          logger.log('Session visibility set to:', visibility);
        }}
      />

      <SessionMediaPrompt
        visible={flow.step === 'media'}
        capturedMediaUri={sessionMediaUri}
        capturedMediaType={sessionMediaType}
        onCamera={handleCaptureMedia}
        onGallery={handleGalleryPick}
        onSkip={handleMediaPromptSkip}
        onContinue={handleMediaPromptContinue}
      />

      <GoalEditModal
        visible={showGoalEditModal}
        goal={currentGoal}
        onClose={() => setShowGoalEditModal(false)}
        onGoalUpdated={(updated) => {
          setCurrentGoal(updated);
          setShowGoalEditModal(false);
          showSuccess(t('recipient.detailedGoal.goalUpdated'));
        }}
      />

      <ConfirmationDialog
        visible={showRemoveDialog}
        title={t('recipient.detailedGoal.removeDialog.title')}
        message={removeDialogMessage}
        confirmLabel={t('recipient.detailedGoal.removeDialog.confirm')}
        cancelLabel={t('recipient.detailedGoal.removeDialog.cancel')}
        variant="danger"
        loading={isRemoving}
        onConfirm={handleRemoveGoal}
        onCancel={() => setShowRemoveDialog(false)}
      />

      {/* Inline Experience Purchase CTA */}
      {flow.step === 'cta' && flow.ctaDecision && currentGoal.isFreeGoal && currentGoal.pledgedExperience && (
        <InlineExperienceCTA
          experience={{
            title: currentGoal.pledgedExperience.title,
            coverImageUrl: currentGoal.pledgedExperience.coverImageUrl,
            price: currentGoal.pledgedExperience.price,
          }}
          statMessage={flow.ctaDecision.message.stat}
          statSource={flow.ctaDecision.message.source}
          onGift={() => {
            flow.advance();
            navigation.navigate('ExperienceCheckout', {
              cartItems: [{ experienceId: currentGoal.pledgedExperience?.experienceId ?? "", quantity: 1 }],
              goalId: currentGoal.id,
            });
          }}
          onDismiss={() => {
            flow.advance();
            ctaService.recordDismiss(currentGoal.id);
          }}
        />
      )}

      {/* Discovery Quiz Modal */}
      {currentGoal.preferredRewardCategory && (
        <DiscoveryQuizModal
          visible={flow.step === 'discovery'}
          onClose={flow.advance}
          onAnswer={async (questionId, answer) => {
            const newCount = (currentGoal.discoveryQuestionsCompleted || 0) + 1;
            try {
              await discoveryService.saveQuizAnswer(currentGoal.id, questionId, answer, newCount);
              setCurrentGoal(prev => ({
                ...prev,
                discoveryPreferences: { ...prev.discoveryPreferences, [questionId]: answer },
                discoveryQuestionsCompleted: newCount,
              }));
              // If enough answers collected, trigger matching
              if (discoveryService.canMatchExperience(newCount) && !currentGoal.discoveredExperience) {
                logger.log('[DetailedGoalCard] Triggering matchExperience', {
                  goalId: currentGoal.id,
                  category: currentGoal.preferredRewardCategory,
                  questionsCompleted: newCount,
                });
                const matched = await discoveryService.matchExperience(
                  currentGoal.id,
                  currentGoal.preferredRewardCategory!,
                  { ...currentGoal.discoveryPreferences, [questionId]: answer }
                );
                if (!matched) {
                  // Catalog is completely empty (no published experiences at all) — give
                  // the user explicit feedback and let them browse manually instead of
                  // silently stalling.
                  logger.error('[DetailedGoalCard] matchExperience returned null — catalog empty');
                  showError(t('recipient.detailedGoal.error.noExperiencesAvailable'));
                  return;
                }
                const discoveredExperience = {
                  experienceId: matched.id,
                  title: matched.title,
                  subtitle: matched.subtitle,
                  description: matched.description,
                  category: matched.category,
                  price: matched.price,
                  coverImageUrl: matched.coverImageUrl,
                  imageUrl: matched.imageUrl,
                  partnerId: matched.partnerId,
                  ...(matched.location !== undefined ? { location: matched.location } : {}),
                };
                const discoveredAt = new Date();
                // Persist to Firestore first — only update local state after confirmed write
                try {
                  await updateDoc(doc(db, 'goals', currentGoal.id), {
                    discoveredExperience,
                    discoveredAt,
                  });
                  setCurrentGoal(prev => ({
                    ...prev,
                    discoveredExperience,
                    discoveredAt,
                  }));
                  logger.log('[DetailedGoalCard] Match succeeded, opening reveal', matched.title);

                  // Always route to the reveal immediately after a successful match.
                  // The state machine's needsReveal was frozen at flow start; this
                  // patches it so the upcoming advance() from the quiz's onClose
                  // routes to 'reveal' instead of 'cta'/'idle'.
                  flow.setNeedsReveal(true);
                } catch (e) {
                  logger.error('Failed to persist discovery:', e);
                  showError(t('recipient.detailedGoal.error.discoveryPersist'));
                }
              }
            } catch (err: unknown) {
              logger.warn('Quiz answer save failed:', err);
            }
          }}
          questionsCompleted={currentGoal.discoveryQuestionsCompleted || 0}
          category={currentGoal.preferredRewardCategory}
        />
      )}

      {/* Experience Reveal Modal */}
      <ExperienceRevealModal
        visible={flow.step === 'reveal'}
        experience={currentGoal.discoveredExperience || null}
        rematching={rematching}
        onLockIn={async () => {
          // Persist the match as the goal's pledged reward so it survives the user
          // bailing out of checkout — it shows up in JourneyScreen / share / feed
          // as the "your reward" panel. We also mark the discovery revealed so the
          // auto-reveal flow doesn't nag on the next session.
          const discovered = currentGoal.discoveredExperience;
          if (discovered) {
            try {
              await updateDoc(doc(db, 'goals', currentGoal.id), {
                pledgedExperience: discovered,
              });
              setCurrentGoal(prev => ({ ...prev, pledgedExperience: discovered }));
            } catch (err: unknown) {
              logger.warn('Failed to persist pledgedExperience:', err);
            }
          }
          try {
            await discoveryService.markExperienceRevealed(currentGoal.id);
            setCurrentGoal(prev => ({ ...prev, experienceRevealed: true, experienceRevealedAt: new Date() }));
          } catch (err: unknown) {
            logger.warn('Failed to mark experience revealed:', err);
          }
          flow.dismiss();
          if (discovered) {
            navigation.navigate('ExperienceCheckout', {
              cartItems: [{
                experienceId: discovered.experienceId,
                quantity: 1,
              }],
              goalId: currentGoal.id,
            });
          }
        }}
        onRematch={async () => {
          if (rematching) return;
          setRematching(true);
          try {
            const currentId = currentGoal.discoveredExperience?.experienceId;
            const matched = await discoveryService.matchExperience(
              currentGoal.id,
              currentGoal.preferredRewardCategory!,
              currentGoal.discoveryPreferences || {},
              currentId ? [currentId] : [],
            );
            if (matched) {
              const discoveredExperience = {
                experienceId: matched.id,
                title: matched.title,
                subtitle: matched.subtitle,
                description: matched.description,
                category: matched.category,
                price: matched.price,
                coverImageUrl: matched.coverImageUrl,
                imageUrl: matched.imageUrl,
                partnerId: matched.partnerId,
                ...(matched.location !== undefined ? { location: matched.location } : {}),
              };
              setCurrentGoal(prev => ({ ...prev, discoveredExperience, discoveredAt: new Date() }));
            } else {
              showInfo(t('recipient.detailedGoal.noOtherMatches'));
            }
          } catch (err: unknown) {
            logger.error('Rematch failed:', err);
            showError(t('recipient.detailedGoal.error.rematchFailed'));
          } finally {
            setRematching(false);
          }
        }}
        onBrowseOthers={async () => {
          try {
            await discoveryService.clearDiscoveredExperience(currentGoal.id);
            setCurrentGoal(prev => ({
              ...prev,
              discoveredExperience: undefined,
              discoveryPreferences: {},
              discoveryQuestionsCompleted: 0,
              experienceRevealed: true,
              experienceRevealedAt: new Date(),
            }));
          } catch (err: unknown) {
            logger.warn('Failed to clear discovery:', err);
          }
          flow.dismiss();
          navigation.navigate('MainTabs', { screen: 'HomeTab', params: { screen: 'CategorySelection' } });
        }}
        onClose={() => {
          // Backdrop dismiss — user saw the match but didn't commit. Don't mark revealed;
          // the reveal will re-open on next session's flow until they lock in or opt out.
          flow.advance();
        }}
      />

      {/* Venue Selection Modal */}
      <VenueSelectionModal
        visible={showVenueModal}
        onClose={() => {
          setShowVenueModal(false);
          setPendingStartAfterVenue(false);
          setLoading(false);
        }}
        onSelectVenue={async (venue) => {
          setShowVenueModal(false);
          try {
            await goalService.updateGoal(currentGoal.id, {
              venueId: venue.id,
              venueName: venue.name,
              venueLocation: venue.location,
            });
            // Request location permissions now that venue is set
            await locationService.requestPermissions();
            // Update state — the useEffect watching venueId/venueName will resume handleStart
            if (pendingStartAfterVenue) {
              shouldResumeStartRef.current = true;
              setPendingStartAfterVenue(false);
            }
            setCurrentGoal(prev => ({
              ...prev,
              venueId: venue.id,
              venueName: venue.name,
              venueLocation: venue.location,
            }));
          } catch (err: unknown) {
            logger.error('Failed to save venue:', err);
            showError(t('recipient.detailedGoal.error.venueSave'));
            setLoading(false);
          }
        }}
        onSkip={async () => {
          setShowVenueModal(false);
          try {
            await goalService.updateGoal(currentGoal.id, {
              venueName: t('recipient.detailedGoal.workingOnMyOwn'),
            });
            // Update state — the useEffect watching venueId/venueName will resume handleStart
            if (pendingStartAfterVenue) {
              shouldResumeStartRef.current = true;
              setPendingStartAfterVenue(false);
            }
            setCurrentGoal(prev => ({ ...prev, venueName: t('recipient.detailedGoal.workingOnMyOwn') }));
          } catch (err: unknown) {
            logger.error('Failed to save venue skip:', err);
            setLoading(false);
          }
        }}
      />
    </Animated.View>
    </ErrorBoundary>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────

const createStyles = (colors: typeof Colors, isWeb = false) => StyleSheet.create({
  card: {
    position: 'relative' as const,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
    // Web: glassmorphism with semi-transparent bg + border + backdrop blur
    // Native: solid bg with elevation shadow (no backdrop blur support)
    ...(isWeb ? {
      backgroundColor: colors.whiteAlpha88,
      shadowColor: colors.textPrimary,
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      borderWidth: 1,
      borderColor: colors.whiteAlpha60,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    } as Record<string, string> : {
      backgroundColor: colors.surface,
      elevation: 2,
    }),
  },
  cardMenuContainer: {
    position: 'absolute' as const,
    top: Spacing.sm,
    right: Spacing.sm,
    zIndex: 10,
  },
  title: { ...Typography.large, color: colors.textPrimary, marginBottom: Spacing.xs, textAlign: 'center' },
  titlePartnerSuffix: { ...Typography.small, color: colors.textSecondary, textAlign: 'center', marginBottom: Spacing.sm },
  empoweredText: { ...Typography.small, color: colors.textSecondary, marginBottom: Spacing.md, textAlign: 'center' },
  mysteryBadge: {
    alignSelf: 'center', backgroundColor: colors.warningLight, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs, borderRadius: BorderRadius.sm, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: colors.warningBorder,
  },
  mysteryBadgeText: { ...Typography.captionBold, color: colors.warningDark },
  experienceBadge: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  experienceBadgeText: {
    ...Typography.captionBold,
    color: colors.primary,
    flexShrink: 1,
  },
  selfChallengeText: { ...Typography.smallBold, color: colors.primary, marginBottom: Spacing.md, textAlign: 'center' },
  startDateText: { ...Typography.captionBold, color: colors.primary, marginBottom: Spacing.md, textAlign: 'center' },
  projectedFinish: {
    ...Typography.caption,
    color: colors.primary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.xxs,
  },

  // Debug
  debugContainer: {
    marginTop: Spacing.xl, padding: Spacing.lg,
    backgroundColor: colors.backgroundLight, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  debugTitle: {
    ...Typography.captionBold, color: colors.textSecondary,
    marginBottom: Spacing.md, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  debugButtonsRow: { flexDirection: 'row', gap: Spacing.sm },
  debugButton: {
    flex: 1, backgroundColor: colors.border,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm,
    alignItems: 'center', borderWidth: 1, borderColor: colors.gray300,
  },
  debugButtonText: { ...Typography.captionBold, color: colors.gray700 },

  // Together mode: avatar toggle row
  avatarToggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xxl,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  avatarTogglePill: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarTogglePillActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryBorder,
  },
  avatarToggleText: {
    ...Typography.captionBold,
    color: colors.textMuted,
  },
  avatarToggleTextActive: {
    color: colors.primary,
    ...Typography.captionBold,
  },
  // M4: Waiting for partner banners
  waitingBanner: {
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  waitingBannerText: {
    ...Typography.smallBold,
    color: colors.warningDark,
    flex: 1,
  },
  resendInviteButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  resendInviteText: {
    ...Typography.small,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  waitingBannerProgress: {
    marginTop: Spacing.sm,
  },
  waitingBannerProgressLabel: {
    ...Typography.caption,
    color: colors.warningMedium,
    marginBottom: Spacing.xs,
  },
  waitingBannerProgressTrack: {
    height: 6,
    backgroundColor: colors.warningBorder,
    borderRadius: BorderRadius.pill,
    overflow: 'hidden',
  },
  waitingBannerProgressFill: {
    height: '100%',
    backgroundColor: colors.warning,
    borderRadius: BorderRadius.pill,
  },
});

export default DetailedGoalCard;
