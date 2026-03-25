// screens/Recipient/GoalSettingScreen.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { FOOTER_HEIGHT } from '../../components/FooterNavigation';
import {
  View,
  Text,
  TextInput as RNTextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Animated,
  KeyboardAvoidingView,
  Alert,
  Image,
  GestureResponderEvent,
  DimensionValue,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { TextInput } from '../../components/TextInput';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { useBeforeRemove } from '../../hooks/useBeforeRemove';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CompositeNavigationProp } from '@react-navigation/native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { MotiView, AnimatePresence } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import {
  RecipientStackParamList,
  RootStackParamList,
  ExperienceGift,
  Goal,
  Experience,
} from '../../types';
import { useApp } from '../../context/AppContext';
import { goalService } from '../../services/GoalService';
import { analyticsService } from '../../services/AnalyticsService';
import { notificationService } from '../../services/NotificationService';
import { userService } from '../../services/userService';
import MainScreen from '../MainScreen';
import { db, auth } from '../../services/firebase';
import { addDoc, collection, deleteField, doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { experienceService } from '../../services/ExperienceService';
import { SkeletonBox } from '../../components/SkeletonLoader';
import { logger } from '../../utils/logger';
import { serializeNav } from '../../utils/serializeNav';
import HintPopup from '../../components/HintPopup';
import { aiHintService } from '../../services/AIHintService';
import { logErrorToFirestore } from '../../utils/errorLogger';
import { vh } from '../../utils/responsive';
import { sanitizeText } from '../../utils/sanitization';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Spacing } from '../../config/spacing';
import { Typography } from '../../config/typography';
import { Shadows } from '../../config/shadows';
import { useToast } from '../../context/ToastContext';
import ModernSlider from '../../components/ModernSlider';
import WizardProgressBar from '../../components/WizardProgressBar';
import { BaseModal } from '../../components/BaseModal';
import Button from '../../components/Button';

const TOTAL_STEPS = 4;

type NavProp = CompositeNavigationProp<
  NativeStackNavigationProp<RecipientStackParamList, 'GoalSetting'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const getGoalTypes = (colors: typeof Colors) => [
  { icon: '🏋️', name: 'Gym', tagline: 'Hit the weights', color: colors.success },
  { icon: '🧘', name: 'Yoga', tagline: 'Find your flow', color: colors.info },
  { icon: '💃', name: 'Dance', tagline: 'Move to the beat', color: colors.warning },
  { icon: '✏️', name: 'Add your own', tagline: 'Create your challenge', color: colors.textMuted },
];

const STEP_TITLES = [
  'What is your goal?',
  'Set your intensity',
  'How long per session?',
  'When do you start?',
];

const STEP_SUBTITLES = [
  'Pick a category that matches your gift',
  'How hard do you want to push yourself?',
  'Set the duration for each time you show up',
  "Pick a date and let's make it happen",
];

// ─── Main Screen Component ──────────────────────────────────────────
const GoalSettingScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const GOAL_TYPES = useMemo(() => getGoalTypes(colors), [colors]);
  const routeParams = route.params as { experienceGift?: ExperienceGift } | undefined;
  const experienceGift = routeParams?.experienceGift;
  const { state, dispatch } = useApp();
  const { showError } = useToast();
  const scrollViewRef = useRef<ScrollView>(null);
  const minutesRef = useRef<RNTextInput>(null);

  // ─── Wizard State ──────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState('');
  const [weeks, setWeeks] = useState(3);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3);
  // Clock dial state
  const [sessionMinutes, setSessionMinutes] = useState(30);
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [plannedStartDate, setPlannedStartDate] = useState(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const goalCreatedRef = useRef(false);
  const [validationErrors, setValidationErrors] = useState({ category: false, time: false });
  const [experience, setExperience] = useState<Experience | null>(null);
  const [hintPromise, setHintPromise] = useState<Promise<string> | null>(null);
  const [showHintPopup, setShowHintPopup] = useState(false);
  const [firstHint, setFirstHint] = useState<string | null>(null);
  const [createdGoal, setCreatedGoal] = useState<Goal | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Animated dial
  const [displayMinutes, setDisplayMinutes] = useState(30);
  const animFrameRef = useRef<number | null>(null);

  // Clock dial web-compat refs
  const clockRef = useRef<View>(null);
  const clockLayout = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(plannedStartDate.getFullYear(), plannedStartDate.getMonth(), 1)
  );

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Exit confirmation for unsaved wizard progress
  useBeforeRemove(navigation, (e) => {
    if (currentStep === 1 || goalCreatedRef.current) return; // Allow back from step 1 or after creation
    e.preventDefault();
    Alert.alert(
      'Discard changes?',
      'You have unsaved progress. Are you sure you want to leave?',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]
    );
  }, [currentStep]);

  // Validate required data
  const hasValidData = Boolean(
    experienceGift?.id &&
    (experienceGift?.experienceId || (experienceGift as ExperienceGift & { isCategoryOnly?: boolean; preferredRewardCategory?: string })?.isCategoryOnly || (experienceGift as ExperienceGift & { isCategoryOnly?: boolean; preferredRewardCategory?: string })?.preferredRewardCategory)
  );

  useEffect(() => {
    if (!hasValidData) {
      logger.warn('Missing/invalid experienceGift on GoalSettingScreen, redirecting to CouponEntry');
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'CouponEntry' }] }));
    }
  }, [hasValidData, navigation]);

  if (!hasValidData || !experienceGift) {
    return (
      <ErrorBoundary screenName="GoalSettingScreen" userId={state.user?.id}>
        <MainScreen activeRoute="Goals">
          <View style={{ padding: Spacing.xl, gap: Spacing.lg }}>
            <SkeletonBox width="100%" height={120} borderRadius={12} />
            <SkeletonBox width="60%" height={20} borderRadius={8} />
            <SkeletonBox width="100%" height={48} borderRadius={12} />
          </View>
        </MainScreen>
      </ErrorBoundary>
    );
  }

  const sanitizeNumericInput = (text: string) => text.replace(/[^0-9]/g, '');

  // Fetch experience details
  useEffect(() => {
    const fetchExperience = async () => {
      if (!experienceGift?.experienceId) {
        return;
      }
      try {
        const exp = await experienceService.getExperienceById(experienceGift.experienceId);
        setExperience(exp);
      } catch (error: unknown) {
        logger.error('Error fetching experience:', error);
        await logErrorToFirestore(error, {
          screenName: 'GoalSettingScreen',
          feature: 'FetchExperience',
          userId: state.user?.id,
          additionalData: { experienceId: experienceGift?.experienceId },
        });
        showError('Could not load experience details.');
      }
    };
    fetchExperience();
  }, [experienceGift.experienceId]);

  // Pulse animation while submitting
  useEffect(() => {
    if (isSubmitting) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isSubmitting]);

  // Pre-generate first AI hint when reaching the calendar step
  useEffect(() => {
    if (currentStep === 4 && !hintPromise && experience) {
      const totalSessions = weeks * sessionsPerWeek;
      const startGeneration = async () => {
        try {
          const recipientName = await userService.getUserName(state.user?.id || '');
          const promise = aiHintService.generateHint({
            userId: state.user?.id || '',
            goalId: 'temp',
            experienceType: experience.title,
            sessionNumber: 1,
            totalSessions,
            userName: recipientName,
          });
          setHintPromise(promise.then(res => res.hint));
        } catch (err: unknown) {
          logger.error('Failed to start hint generation:', err);
        }
      };
      startGeneration();
    }
  }, [currentStep]);

  // ─── Security: Atomically claim gift ──────────────────────────────
  const updateGiftStatus = async (experienceGiftId: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('User not authenticated');

    const giftDocRef = doc(db, 'experienceGifts', experienceGiftId);
    const uid = currentUser.uid;
    await runTransaction(db, async (transaction) => {
      const freshGift = await transaction.get(giftDocRef);
      if (!freshGift.exists()) throw new Error('Gift not found');
      const currentStatus = freshGift.data().status;
      if (currentStatus !== 'pending' && currentStatus !== 'active') throw new Error('Gift already claimed');
      transaction.update(giftDocRef, {
        status: 'claimed',
        claimedBy: uid,
        recipientId: uid,
        claimedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  };

  // ─── Per-step validation ──────────────────────────────────────────
  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 1: {
        const finalCat = selectedCategory === 'Add your own' ? customCategory.trim() : selectedCategory;
        if (!finalCat) {
          setValidationErrors(prev => ({ ...prev, category: true }));
          return false;
        }
        setValidationErrors(prev => ({ ...prev, category: false }));
        return true;
      }
      case 2:
        // Sliders have defaults — always valid
        return true;
      case 3: {
        if (showCustomTime) {
          const hoursNum = parseInt(hours || '0', 10);
          const minutesNum = parseInt(minutes || '0', 10);
          if ((!hours && !minutes) || (hoursNum === 0 && minutesNum === 0)) {
            setValidationErrors(prev => ({ ...prev, time: true }));
            return false;
          }
          if (hoursNum > 3 || (hoursNum === 3 && minutesNum > 0)) {
            showError('Each session cannot exceed 3 hours.');
            return false;
          }
        } else {
          if (sessionMinutes < 5) {
            setValidationErrors(prev => ({ ...prev, time: true }));
            return false;
          }
        }
        setValidationErrors(prev => ({ ...prev, time: false }));
        return true;
      }
      case 4:
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(prev => prev + 1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      navigation.goBack();
    }
  };

  // ─── Create Goal ──────────────────────────────────────────────────
  const confirmCreateGoal = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const currentUserId = state.user?.id;
      if (!currentUserId) {
        showError('Please sign in to continue.');
        setIsSubmitting(false);
        return;
      }

      const finalCategory = selectedCategory === 'Add your own' ? sanitizeText(customCategory.trim(), 50) : selectedCategory;
      const hoursNum = showCustomTime ? parseInt(hours || '0') : Math.floor(sessionMinutes / 60);
      const minutesNum = showCustomTime ? parseInt(minutes || '0') : sessionMinutes % 60;
      const now = new Date();
      const durationInDays = weeks * 7;
      const endDate = new Date(now);
      endDate.setDate(now.getDate() + durationInDays);

      const approvalDeadline = new Date(now);
      approvalDeadline.setHours(approvalDeadline.getHours() + 24);

      // CRITICAL: Claim the gift FIRST before creating goal
      try {
        await updateGiftStatus(experienceGift.id);
      } catch (claimError: unknown) {
        const claimErrMsg = claimError instanceof Error ? claimError.message : '';
        if (claimErrMsg === 'Gift already claimed') {
          showError('This code has already been claimed by someone else. Please check with the person who sent it to you.');
        } else if (claimErrMsg === 'User not authenticated') {
          showError('Please sign in to continue.');
        } else {
          await logErrorToFirestore(claimError instanceof Error ? claimError : new Error(claimErrMsg), {
            screenName: 'GoalSettingScreen',
            feature: 'ClaimGift',
            userId: currentUserId,
            additionalData: { giftId: experienceGift.id },
          });
          showError('Failed to claim this gift. Please try again.');
        }
        return;
      }

      // Gift claimed — now create the goal
      const goalData: Omit<Goal, 'id'> & { sessionsPerWeek: number } = {
        userId: currentUserId,
        experienceGiftId: experienceGift.id,
        title: `Attend ${finalCategory || 'Fitness'} Sessions`,
        description: `Work on ${finalCategory || 'fitness'} for ${weeks} weeks, ${sessionsPerWeek} times per week.`,
        targetCount: weeks,
        currentCount: 0,
        weeklyCount: 0,
        sessionsPerWeek,
        frequency: 'weekly',
        duration: durationInDays,
        startDate: now,
        endDate,
        weekStartAt: null,
        plannedStartDate,
        isActive: true,
        isCompleted: false,
        isRevealed: false,
        location: experience?.location || (experienceGift as ExperienceGift & { preferredRewardCategory?: string })?.preferredRewardCategory || 'Unknown location',
        targetHours: hoursNum,
        targetMinutes: minutesNum,
        createdAt: now,
        weeklyLogDates: [],
        empoweredBy: experienceGift.giverId,
        approvalStatus: experienceGift.giverId === currentUserId ? 'approved' : 'pending',
        initialTargetCount: weeks,
        initialSessionsPerWeek: sessionsPerWeek,
        approvalRequestedAt: now,
        approvalDeadline,
        giverActionTaken: experienceGift.giverId === currentUserId,
        // H5: Shared challenges are auto-approved — giver already set the terms, no approval loop needed
        ...(experienceGift?.challengeType === 'shared' && {
          approvalStatus: 'approved' as const,
          giverActionTaken: true,
        }),
        // Shared/Together challenge fields
        ...(experienceGift?.challengeType === 'shared' && experienceGift?.togetherData && { challengeType: 'shared' as const }),
        ...(experienceGift?.challengeType === 'shared' && experienceGift?.togetherData?.giverGoalId && { partnerGoalId: experienceGift.togetherData.giverGoalId }),
      };

      // SAFETY: If goal creation fails after gift claim, revert the gift to 'pending'
      let goal: Goal;
      try {
        goal = await goalService.createGoal(goalData as Goal);
      } catch (goalError: unknown) {
        // Revert gift claim so the user can retry
        try {
          const giftRef = doc(db, 'experienceGifts', experienceGift.id);
          await updateDoc(giftRef, {
            status: 'pending',
            claimedBy: deleteField(),
            recipientId: deleteField(),
            claimedAt: deleteField(),
            updatedAt: serverTimestamp(),
          });
        } catch (revertError: unknown) {
          logger.error('Failed to revert gift claim:', revertError);
          showError('Something went wrong. Please contact support with your claim code — we will fix this.');
        }
        throw goalError; // Re-throw to hit the outer error handler
      }

      // Bidirectional link: if giver's goal already exists, update it to point back to this recipient goal
      if (experienceGift?.challengeType === 'shared' && experienceGift?.togetherData?.giverGoalId) {
        let linkSuccess = false;
        for (let attempt = 0; attempt < 3 && !linkSuccess; attempt++) {
          try {
            await updateDoc(doc(db, 'goals', experienceGift.togetherData.giverGoalId), {
              partnerGoalId: goal.id,
              updatedAt: serverTimestamp(),
            });
            linkSuccess = true;
            logger.log(`Linked giver goal ${experienceGift.togetherData.giverGoalId} -> recipient goal ${goal.id}`);
          } catch (linkErr: unknown) {
            if (attempt === 2) {
              logger.error('Failed to link partner goal after 3 attempts:', linkErr);
              try {
                await updateDoc(doc(db, 'experienceGifts', experienceGift.id), {
                  recipientGoalId: goal.id,
                  updatedAt: serverTimestamp(),
                });
              } catch (e: unknown) { logger.error('Fallback link also failed:', e); }
            }
          }
        }
      }

      analyticsService.trackEvent('goal_creation_completed', 'conversion', {
        category: finalCategory,
        durationWeeks: weeks,
        sessionsPerWeek,
      }, 'GoalSettingScreen');

      // H1: Notify giver that recipient accepted the shared/together challenge
      if (experienceGift?.challengeType === 'shared' && experienceGift?.giverId) {
        try {
          await addDoc(collection(db, 'notifications'), {
            userId: experienceGift.giverId,
            type: 'shared_start',
            title: 'Challenge Accepted!',
            message: `${state.user?.displayName || 'Your partner'} accepted your Together challenge!`,
            data: { goalId: goal.id, giftId: experienceGift.id },
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch (e: unknown) {
          logger.warn('Failed to send shared_start notification:', e);
        }
      }

      const recipientName = await userService.getUserName(goalData.userId);

      // Send approval notification (skip for self-gifts and shared challenges)
      const isSelfGift = experienceGift.giverId === currentUserId;
      if (!isSelfGift && experienceGift?.challengeType !== 'shared') {
        await notificationService.createNotification(
          goalData.empoweredBy! || '',
          'goal_approval_request',
          `🎯 ${recipientName} set a goal for ${experience?.title ?? 'your challenge'}`,
          `Goal: ${goalData.description}`,
          {
            giftId: goalData.experienceGiftId,
            goalId: goal.id,
            giverId: goalData.empoweredBy,
            recipientId: goalData.userId,
            experienceTitle: experience?.title ?? 'your challenge',
            initialTargetCount: weeks,
            initialSessionsPerWeek: sessionsPerWeek,
          },
          false,
        );
      }

      dispatch({ type: 'SET_GOAL', payload: goal });
      setCreatedGoal(goal);
      goalCreatedRef.current = true; // Bypass beforeRemove guard
      setShowConfirm(false);

      // Wait for pre-generated hint
      if (hintPromise) {
        try {
          const hint = await hintPromise;
          const hintObj = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            session: 1,
            text: hint,
            giverName: 'Ernit',
            date: Date.now(),
            createdAt: new Date(),
            type: 'text' as const,
          };
          await goalService.appendHint(goal.id, hintObj);
          setFirstHint(hint);
          setShowHintPopup(true);
          setHintPromise(null);
        } catch (hintError: unknown) {
          logger.error('Failed to get pre-generated hint:', hintError);
          navigation.dispatch(CommonActions.reset({
            index: 1,
            routes: [{ name: 'Goals' }, { name: 'Journey', params: { goal: serializeNav(goal) } }],
          }));
        }
      } else {
        navigation.dispatch(CommonActions.reset({
          index: 1,
          routes: [{ name: 'Goals' }, { name: 'Journey', params: { goal: serializeNav(goal) } }],
        }));
      }
    } catch (error: unknown) {
      logger.error('Error creating goal:', error);
      await logErrorToFirestore(error, {
        screenName: 'GoalSettingScreen',
        feature: 'CreateGoal',
        userId: state.user?.id,
        additionalData: {
          giftId: experienceGift.id,
          category: selectedCategory === 'Add your own' ? customCategory : selectedCategory,
        },
      });
      showError('Goal creation failed. Your gift code is still valid — please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHintPopupClose = () => {
    setShowHintPopup(false);
    if (createdGoal) {
      navigation.dispatch(CommonActions.reset({
        index: 1,
        routes: [{ name: 'Goals' }, { name: 'Journey', params: { goal: serializeNav(createdGoal) } }],
      }));
    }
  };

  // ─── Calendar helpers ─────────────────────────────────────────────
  const calendarMonthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const calendarWeekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const getCalendarDays = (monthDate: Date) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let day = 1; day <= lastDay.getDate(); day++) days.push(new Date(year, month, day));
    return days;
  };

  const isSameDay = (a: Date | null, b: Date) => {
    if (!a) return false;
    return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  };

  const goalEndDate = new Date(plannedStartDate);
  goalEndDate.setDate(goalEndDate.getDate() + weeks * 7);

  const finalCategory = selectedCategory === 'Add your own' ? customCategory.trim() : selectedCategory;

  // ─── Together Mode: pre-fill from giver's goal ───────────────────
  const togetherData = experienceGift?.togetherData;
  const [acceptedGiverGoal, setAcceptedGiverGoal] = useState(false);

  const handleAcceptGiverGoal = () => {
    if (!togetherData) return;
    setAcceptedGiverGoal(true);
    // Pre-fill from giver's goal data
    const durationMatch = togetherData.duration?.match(/(\d+)/);
    if (durationMatch) setWeeks(parseInt(durationMatch[1], 10));
    const freqMatch = togetherData.frequency?.match(/(\d+)/);
    if (freqMatch) setSessionsPerWeek(parseInt(freqMatch[1], 10));
    // Parse session time (e.g. "1h 30m", "45m")
    const sessionTime = togetherData.sessionTime || '';
    const hourMatch = sessionTime.match(/(\d+)\s*h/);
    const minMatch = sessionTime.match(/(\d+)\s*m/);
    const parsedHours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
    const parsedMinutes = minMatch ? parseInt(minMatch[1], 10) : 30;
    const totalMinutes = parsedHours * 60 + parsedMinutes;
    setSessionMinutes(Math.max(5, Math.min(60, totalMinutes)));
    setDisplayMinutes(Math.max(5, Math.min(60, totalMinutes)));
    // Pre-fill category from giver's goal type
    const goalType = togetherData.goalType || togetherData.goalName?.split('-')[0]?.trim();
    if (goalType) {
      const categoryMap: Record<string, string> = {
        'gym': 'Gym',
        'yoga': 'Yoga',
        'dance': 'Dance',
      };
      const mapped = categoryMap[goalType.toLowerCase()];
      if (mapped) {
        setSelectedCategory(mapped);
      } else {
        setSelectedCategory('Add your own');
        setCustomCategory(goalType);
      }
    }
    // Auto-advance through all steps
    setTimeout(() => {
      setCurrentStep(4);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, 300);
  };

  // ─── Clock Dial ───────────────────────────────────────────────────
  const DIAL_SIZE = vh(250);
  const DIAL_RADIUS = DIAL_SIZE / 2;
  const DIAL_STROKE = 8;
  const HANDLE_RADIUS = 14;

  const snapToPreset = (target: number) => {
    setSessionMinutes(target);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const start = displayMinutes;
    const diff = target - start;
    const duration = 350;
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayMinutes(Math.round(start + diff * eased));
      if (t < 1) animFrameRef.current = requestAnimationFrame(step);
    };
    animFrameRef.current = requestAnimationFrame(step);
  };

  // ─── Step Renderers ───────────────────────────────────────────────
  const renderStep1 = () => (
    <View style={styles.stepContent}>
      {/* Reward preview for revealed-mode gifts */}
      {experienceGift?.revealMode === 'revealed' && experience && (
        <MotiView
          from={{ opacity: 0, translateY: -10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 350 }}
          style={{ marginBottom: Spacing.xl }}
        >
          <View style={{
            backgroundColor: colors.primarySurface,
            borderRadius: BorderRadius.xl,
            padding: Spacing.xl,
            borderWidth: 1,
            borderColor: colors.primaryBorder,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.lg,
          }}>
            {experience.imageUrl?.[0] ? (
              <Image
                source={{ uri: experience.imageUrl[0] }}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: BorderRadius.lg,
                  backgroundColor: colors.border,
                }}
                resizeMode="cover"
              />
            ) : (
              <View style={{
                width: 64,
                height: 64,
                borderRadius: BorderRadius.lg,
                backgroundColor: colors.primary,
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <Text style={Typography.heading1}>🎁</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ ...Typography.smallBold, color: colors.primary, marginBottom: Spacing.xs }}>
                YOUR REWARD
              </Text>
              <Text style={{ ...Typography.heading3, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.xs }}>
                {experience.title}
              </Text>
              <Text style={{ ...Typography.caption, color: colors.textSecondary }}>
                Complete your challenge to unlock this reward!
              </Text>
            </View>
          </View>
        </MotiView>
      )}

      {/* Together mode: show giver's goal with accept option */}
      {togetherData && !acceptedGiverGoal && (
        <MotiView
          from={{ opacity: 0, translateY: -10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 300 }}
        >
          <View style={{
            backgroundColor: colors.warningLighter,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            marginBottom: Spacing.xl,
            borderWidth: 1,
            borderColor: colors.warningBorder,
          }}>
            <Text style={{ ...Typography.smallBold, color: colors.warningDark, marginBottom: Spacing.sm }}>
              {experienceGift?.giverName || 'Someone'} is doing this together with you!
            </Text>
            {togetherData.goalName ? (
              <Text style={{ ...Typography.body, color: colors.textPrimary, marginBottom: Spacing.xs }}>
                Their goal: {togetherData.goalName}
              </Text>
            ) : null}
            <Text style={{ ...Typography.caption, color: colors.textSecondary, marginBottom: Spacing.lg }}>
              {togetherData.duration} · {togetherData.frequency} · {togetherData.sessionTime}
            </Text>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: colors.warning,
                  borderRadius: BorderRadius.md,
                  paddingVertical: Spacing.md,
                  alignItems: 'center',
                }}
                onPress={handleAcceptGiverGoal}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Accept same challenge as giver"
              >
                <Text style={{ ...Typography.smallBold, color: colors.white }}>Accept same challenge</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: colors.white,
                  borderRadius: BorderRadius.md,
                  paddingVertical: Spacing.md,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                onPress={() => setAcceptedGiverGoal(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Create my own challenge"
              >
                <Text style={{ ...Typography.smallBold, color: colors.textSecondary }}>Create my own</Text>
              </TouchableOpacity>
            </View>
          </View>
        </MotiView>
      )}

      {/* 2x2 goal type grid */}
      <View style={styles.goalGrid}>
        {GOAL_TYPES.map((goal, i) => (
          <MotiView
            key={goal.name}
            style={{ width: '47%' }}
            from={{ opacity: 0, translateY: 20 }}
            animate={{
              opacity: 1,
              translateY: 0,
              scale: selectedCategory === goal.name ? 1.04 : 1,
            }}
            transition={{
              opacity: { type: 'timing', duration: 300, delay: i * 80 },
              translateY: { type: 'timing', duration: 300, delay: i * 80 },
              scale: selectedCategory === goal.name
                ? { type: 'spring', damping: 34, stiffness: 100 }
                : { type: 'timing', duration: 100 },
            }}
          >
            <TouchableOpacity
              style={[
                styles.goalChip,
                selectedCategory === goal.name && { backgroundColor: goal.color, borderColor: goal.color },
                validationErrors.category && !selectedCategory && styles.goalChipError,
              ]}
              onPress={() => {
                setSelectedCategory(goal.name);
                setValidationErrors(prev => ({ ...prev, category: false }));
                if (goal.name !== 'Add your own') {
                  setCustomCategory('');
                  setTimeout(() => {
                    setCurrentStep(prev => prev + 1);
                    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                  }, 250);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={`Select ${goal.name} goal`}
            >
              <Text style={styles.goalIcon}>{goal.icon}</Text>
              <Text style={[
                styles.goalName,
                selectedCategory === goal.name && styles.goalNameActive,
              ]}>{goal.name}</Text>
              <Text style={[
                styles.goalTagline,
                selectedCategory === goal.name && { color: colors.white + 'CC' },
              ]}>{goal.tagline}</Text>
            </TouchableOpacity>
          </MotiView>
        ))}
      </View>

      {validationErrors.category && (
        <Text style={{ color: colors.error, ...Typography.caption, marginTop: Spacing.md, fontWeight: '500' }}>
          Please select a goal type
        </Text>
      )}

      {selectedCategory === 'Add your own' && (
        <View style={styles.customGoalContainer}>
          <TextInput
            label="Enter your custom goal:"
            placeholder="e.g., Painting, Meditation, Guitar..."
            value={customCategory}
            onChangeText={(text) => {
              setCustomCategory(text);
              if (validationErrors.category && text.trim()) {
                setValidationErrors(prev => ({ ...prev, category: false }));
              }
            }}
            maxLength={50}
            autoFocus
            accessibilityLabel="Custom goal category"
            containerStyle={{ marginBottom: 0 }}
          />
          {validationErrors.category && customCategory.trim() === '' && (
            <Text style={{ color: colors.error, ...Typography.caption, marginTop: Spacing.xs, fontWeight: '500' }}>
              Please enter a custom goal
            </Text>
          )}
        </View>
      )}
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <View style={styles.section}>
        <ModernSlider
          label="Duration"
          value={weeks}
          min={1}
          max={5}
          onChange={setWeeks}
          leftLabel="Chill"
          rightLabel="Intense"
          unit="week"
          unitPlural="weeks"
        />
      </View>

      <View style={styles.section}>
        <ModernSlider
          label="Weekly Sessions"
          value={sessionsPerWeek}
          min={1}
          max={7}
          onChange={setSessionsPerWeek}
          leftLabel="Easy"
          rightLabel="Beast"
        />
      </View>
    </View>
  );

  const renderTimeStep = () => {
    const visMinutes = displayMinutes;
    const angle = (visMinutes / 60) * 360;
    const angleRad = ((angle - 90) * Math.PI) / 180;
    const arcRadius = DIAL_RADIUS - 20;
    const handleX = DIAL_RADIUS + arcRadius * Math.cos(angleRad);
    const handleY = DIAL_RADIUS + arcRadius * Math.sin(angleRad);

    const startAngleRad = (-90 * Math.PI) / 180;
    const largeArc = angle > 180 ? 1 : 0;
    const startX = DIAL_RADIUS + arcRadius * Math.cos(startAngleRad);
    const startY = DIAL_RADIUS + arcRadius * Math.sin(startAngleRad);
    const endX = DIAL_RADIUS + arcRadius * Math.cos(angleRad);
    const endY = DIAL_RADIUS + arcRadius * Math.sin(angleRad);
    const isFullCircle = visMinutes >= 60;
    const arcPath = (!isFullCircle && visMinutes > 0)
      ? `M ${startX} ${startY} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${endX} ${endY}`
      : '';

    const handleTouch = (event: GestureResponderEvent) => {
      const { pageX, pageY, locationX, locationY } = event.nativeEvent;
      const x = locationX ?? (pageX - clockLayout.current.x);
      const y = locationY ?? (pageY - clockLayout.current.y);
      const dx = x - DIAL_RADIUS;
      const dy = y - DIAL_RADIUS;
      let a = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      if (a < 0) a += 360;
      const mins = Math.round((a / 360) * 60 / 5) * 5;
      const clamped = Math.max(5, Math.min(60, mins));
      setSessionMinutes(clamped);
      setDisplayMinutes(clamped);
    };

    return (
      <View style={styles.stepContent}>
        <View style={{ alignItems: 'center', marginTop: vh(4) }}>
          <View
            ref={clockRef}
            style={{ width: DIAL_SIZE, height: DIAL_SIZE }}
            onLayout={() => {
              clockRef.current?.measure((x, y, width, height, pageX, pageY) => {
                clockLayout.current = { x: pageX, y: pageY, width, height };
              });
            }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={handleTouch}
            onResponderMove={handleTouch}
          >
            <Svg width={DIAL_SIZE} height={DIAL_SIZE}>
              {/* Tick marks (every 5 min = 12 ticks) */}
              {Array.from({ length: 12 }).map((_, i) => {
                const tickAngle = ((i * 30 - 90) * Math.PI) / 180;
                const isMajor = i % 3 === 0;
                const outerR = arcRadius + 4;
                const innerR = arcRadius - (isMajor ? 10 : 6);
                return (
                  <Path
                    key={`tick-${i}`}
                    d={`M ${DIAL_RADIUS + innerR * Math.cos(tickAngle)} ${DIAL_RADIUS + innerR * Math.sin(tickAngle)} L ${DIAL_RADIUS + outerR * Math.cos(tickAngle)} ${DIAL_RADIUS + outerR * Math.sin(tickAngle)}`}
                    stroke={colors.border}
                    strokeWidth={isMajor ? 2 : 1}
                  />
                );
              })}
              {/* Background circle */}
              <Circle
                cx={DIAL_RADIUS}
                cy={DIAL_RADIUS}
                r={arcRadius}
                stroke={colors.backgroundLight}
                strokeWidth={DIAL_STROKE}
                fill="none"
              />
              {/* Active arc / full circle */}
              {isFullCircle ? (
                <Circle
                  cx={DIAL_RADIUS}
                  cy={DIAL_RADIUS}
                  r={arcRadius}
                  stroke={colors.secondary}
                  strokeWidth={DIAL_STROKE}
                  fill="none"
                />
              ) : visMinutes > 0 ? (
                <Path
                  d={arcPath}
                  stroke={colors.secondary}
                  strokeWidth={DIAL_STROKE}
                  strokeLinecap="round"
                  fill="none"
                />
              ) : null}
              {/* Handle with shadow effect */}
              <Circle
                cx={handleX}
                cy={handleY}
                r={HANDLE_RADIUS + 3}
                fill={colors.secondary + '20'}
              />
              <Circle
                cx={handleX}
                cy={handleY}
                r={HANDLE_RADIUS}
                fill={colors.secondary}
              />
            </Svg>

            {/* Center text */}
            <View style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Text style={{
                fontSize: vh(48),
                fontWeight: '800',
                color: colors.secondary,
                letterSpacing: -2,
              }}>
                {visMinutes}
              </Text>
              <Text style={{
                ...Typography.caption,
                fontWeight: '700',
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 2,
              }}>
                MINUTES
              </Text>
            </View>

            {/* Minute markers inside the circle */}
            {[0, 15, 30, 45].map((m) => {
              const markerAngle = ((m / 60) * 360 - 90) * Math.PI / 180;
              const markerR = DIAL_RADIUS - 45;
              const mx = DIAL_RADIUS + markerR * Math.cos(markerAngle);
              const my = DIAL_RADIUS + markerR * Math.sin(markerAngle);
              return (
                <Text key={m} style={{
                  position: 'absolute',
                  left: mx - 10,
                  top: my - 8,
                  ...Typography.caption,
                  fontWeight: '700',
                  color: colors.textMuted,
                  width: 20,
                  textAlign: 'center',
                }}>
                  {m}
                </Text>
              );
            })}
          </View>
        </View>

        {/* Preset time chips */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm, marginTop: vh(20) }}>
          {[15, 30, 45, 60].map((m) => (
            <MotiView
              key={m}
              animate={{ scale: sessionMinutes === m ? 1.06 : 1 }}
              transition={{ type: 'spring', damping: 15, stiffness: 150 }}
            >
              <TouchableOpacity
                style={[
                  styles.presetChip,
                  sessionMinutes === m && styles.presetChipActive,
                ]}
                onPress={() => snapToPreset(m)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${m} minutes per session`}
                accessibilityState={{ selected: sessionMinutes === m }}
              >
                <Text style={[
                  styles.presetChipText,
                  sessionMinutes === m && styles.presetChipTextActive,
                ]}>{m} min</Text>
              </TouchableOpacity>
            </MotiView>
          ))}
        </View>

        {/* Custom time toggle */}
        <TouchableOpacity
          style={{ alignSelf: 'center', marginTop: vh(16) }}
          onPress={() => setShowCustomTime(!showCustomTime)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={showCustomTime ? 'Use the time dial' : 'Enter a custom session time'}
        >
          <Text style={{
            ...Typography.body,
            color: colors.primary,
            fontWeight: '600',
          }}>
            {showCustomTime ? 'Use the dial' : 'Or enter a custom time ›'}
          </Text>
        </TouchableOpacity>

        {/* Custom time inputs (toggle) */}
        {showCustomTime && (
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 200 }}
          >
            <View style={[styles.timeRow, { justifyContent: 'center', marginTop: vh(16) }]}>
              <View style={styles.timeInputGroup}>
                <RNTextInput
                  style={styles.timeInput}
                  value={hours}
                  onChangeText={(t) => {
                    setHours(sanitizeNumericInput(t));
                    if (validationErrors.time) setValidationErrors(prev => ({ ...prev, time: false }));
                  }}
                  keyboardType="numeric"
                  maxLength={1}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="next"
                  onSubmitEditing={() => minutesRef.current?.focus()}
                  accessibilityLabel="Hours per session"
                />
                <Text style={styles.timeLabel}>hr</Text>
              </View>
              <View style={styles.timeInputGroup}>
                <RNTextInput
                  ref={minutesRef}
                  style={styles.timeInput}
                  value={minutes}
                  onChangeText={(t) => {
                    const clean = sanitizeNumericInput(t);
                    const m = parseInt(clean || '0', 10);
                    setMinutes(m > 59 ? '59' : clean);
                    if (validationErrors.time) setValidationErrors(prev => ({ ...prev, time: false }));
                  }}
                  keyboardType="numeric"
                  maxLength={2}
                  placeholder="00"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="done"
                  accessibilityLabel="Minutes per session"
                />
                <Text style={styles.timeLabel}>min</Text>
              </View>
            </View>
          </MotiView>
        )}

        {validationErrors.time && (
          <Text style={{ color: colors.error, ...Typography.caption, marginTop: Spacing.sm, fontWeight: '500', textAlign: 'center' }}>
            Please set a time per session (at least 5 minutes)
          </Text>
        )}
      </View>
    );
  };

  const renderStep4 = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const calendarDays = getCalendarDays(calendarMonth);
    const now = new Date();
    const isCurrentMonth = calendarMonth.getMonth() === now.getMonth() && calendarMonth.getFullYear() === now.getFullYear();

    return (
      <View style={styles.stepContent}>
        <View style={styles.sliderContainer}>
          {/* Inline Calendar */}
          <View style={styles.inlineCalendar}>
            <View style={styles.calHeader}>
              <TouchableOpacity
                onPress={() => {
                  if (!isCurrentMonth) {
                    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
                  }
                }}
                style={[styles.calNavBtn, isCurrentMonth && { opacity: 0.3 }]}
                disabled={isCurrentMonth}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
              >
                <ChevronLeft color={colors.textSecondary} size={20} />
              </TouchableOpacity>
              <Text style={styles.calMonthYear}>
                {calendarMonthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                style={styles.calNavBtn}
                accessibilityRole="button"
                accessibilityLabel="Next month"
              >
                <ChevronRight color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            </View>

            <View style={styles.calWeekRow}>
              {calendarWeekDays.map((day) => (
                <Text key={day} style={styles.calWeekDay}>{day}</Text>
              ))}
            </View>

            <View style={styles.calDaysGrid}>
              {calendarDays.map((date, index) => {
                const disabled = !date || date < today;
                const selected = isSameDay(date, plannedStartDate);
                const isCurrentDay = isSameDay(date, new Date());

                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.calDayCell,
                      selected && styles.calSelectedDay,
                      isCurrentDay && !selected && styles.calTodayDay,
                    ]}
                    onPress={() => {
                      if (!date || disabled) return;
                      setPlannedStartDate(date);
                    }}
                    disabled={disabled}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={date ? `Select ${date.toLocaleDateString()}` : undefined}
                  >
                    {date && (
                      <Text style={[
                        styles.calDayText,
                        disabled && styles.calDisabledText,
                        selected && styles.calSelectedText,
                        isCurrentDay && !selected && styles.calTodayText,
                      ]}>
                        {date.getDate()}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.endDateContainer}>
            <Text style={styles.endDateLabel}>You will finish your goal on</Text>
            <Text style={styles.endDateValue}>
              {goalEndDate.toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
            </Text>
            <Text style={styles.endDateSublabel}>
              {weeks} week{weeks > 1 ? 's' : ''} from {plannedStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderTimeStep();
      case 4: return renderStep4();
      default: return null;
    }
  };

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <ErrorBoundary screenName="GoalSettingScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Goals">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.8}>
                <ChevronLeft color={colors.textPrimary} size={24} strokeWidth={2.5} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Set Your Goal</Text>
              <View style={styles.stepIndicator}>
                <Text style={styles.stepIndicatorText}>{currentStep}/{TOTAL_STEPS}</Text>
              </View>
            </View>

            <WizardProgressBar currentStep={currentStep} totalSteps={TOTAL_STEPS} />

            {/* Step Content */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <MotiView
                key={`title-${currentStep}`}
                from={{ opacity: 0, translateY: 10 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 300 }}
              >
                <Text style={styles.stepTitle} accessibilityRole="header">{STEP_TITLES[currentStep - 1]}</Text>
                <Text style={styles.stepSubtitle}>{STEP_SUBTITLES[currentStep - 1]}</Text>
              </MotiView>

              <AnimatePresence exitBeforeEnter>
                <MotiView
                  key={`step-${currentStep}`}
                  from={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: -30 }}
                  transition={{ type: 'timing', duration: 250 }}
                >
                  {renderCurrentStep()}
                </MotiView>
              </AnimatePresence>

              <View style={{ height: vh(160) }} />
            </ScrollView>

            {/* Footer CTA */}
            <View style={styles.footer}>
              {currentStep === TOTAL_STEPS ? (
                <TouchableOpacity
                  style={styles.ctaButton}
                  onPress={() => {
                    if (validateCurrentStep()) setShowConfirm(true);
                  }}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={colors.gradientDark}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.ctaGradient}
                  >
                    <Text style={styles.ctaText}>Create Goal</Text>
                    <ChevronRight color={colors.white} size={20} strokeWidth={3} />
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.ctaButton} onPress={handleNext} activeOpacity={0.9}>
                  <LinearGradient
                    colors={colors.gradientDark}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.ctaGradient}
                  >
                    <Text style={styles.ctaText}>Next</Text>
                    <ChevronRight color={colors.white} size={20} strokeWidth={3} />
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Confirmation Modal */}
        <BaseModal
          visible={showConfirm}
          onClose={() => setShowConfirm(false)}
          title="Confirm Your Goal"
          variant="center"
        >
          <View style={{ width: '100%', alignItems: 'center' }}>
            <Text style={styles.modalSubtitle}>
              Ready to commit? Let's do this!
            </Text>

            <View style={styles.modalDetails}>
              <Text style={styles.modalRow}>
                <Text style={styles.modalLabel}>Goal: </Text>
                {finalCategory || '—'}
              </Text>
              <Text style={styles.modalRow}>
                <Text style={styles.modalLabel}>Duration: </Text>
                {weeks} {weeks === 1 ? 'week' : 'weeks'}
              </Text>
              <Text style={styles.modalRow}>
                <Text style={styles.modalLabel}>Sessions/week: </Text>
                {sessionsPerWeek}
              </Text>
              <Text style={styles.modalRow}>
                <Text style={styles.modalLabel}>Per session: </Text>
                {showCustomTime
                  ? `${hours || '0'}h ${minutes || '0'}m`
                  : `${sessionMinutes} min`
                }
              </Text>
              <Text style={styles.modalRow}>
                <Text style={styles.modalLabel}>Start date: </Text>
                {plannedStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>

            <Text style={styles.pledgeNote}>
              {experience
                ? 'Your reward is waiting — complete the challenge to unlock it!'
                : 'Complete your challenge to earn your reward!'
              }
            </Text>

            <View style={styles.modalButtons}>
              <Button
                variant="ghost"
                onPress={() => setShowConfirm(false)}
                disabled={isSubmitting}
                title="Cancel"
                style={styles.modalButton}
              />

              <Animated.View style={{ flex: 1, transform: [{ scale: pulseAnim }] }}>
                <Button
                  variant="primary"
                  onPress={confirmCreateGoal}
                  loading={isSubmitting}
                  title="Let's Go!"
                  fullWidth
                  style={styles.modalButton}
                />
              </Animated.View>
            </View>
          </View>
        </BaseModal>

        {/* First Hint Popup */}
        {showHintPopup && firstHint && (
          <HintPopup
            visible={showHintPopup}
            hint={firstHint}
            sessionNumber={1}
            totalSessions={createdGoal ? createdGoal.targetCount * createdGoal.sessionsPerWeek : 1}
            onClose={handleHintPopupClose}
            isFirstHint={true}
            additionalMessage={"🎯 You'll receive your second hint after completing your first session!"}
          />
        )}
      </MainScreen>
    </ErrorBoundary>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────
const createStyles = (colors: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.backgroundLight,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.heading3,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  stepIndicator: {
    backgroundColor: colors.primarySurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  stepIndicatorText: {
    ...Typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: vh(20),
    paddingBottom: vh(16),
  },
  stepTitle: {
    ...Typography.heading1,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: vh(8),
  },
  stepSubtitle: {
    ...Typography.body,
    color: colors.textSecondary,
    marginBottom: vh(24),
  },
  stepContent: {},
  section: {
    marginBottom: Spacing.xl,
  },
  // Goal chips — 2x2 large vertical cards
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.md,
    marginTop: Spacing.sm,
  },
  goalChip: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: vh(28),
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.xl,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
  },
  goalChipError: {
    borderColor: colors.errorBorder,
    backgroundColor: colors.errorLight,
  },
  goalIcon: {
    fontSize: Typography.heroSub.fontSize,
    lineHeight: 52,
  },
  goalName: {
    ...Typography.bodyBold,
    color: colors.textPrimary,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  goalNameActive: {
    color: colors.white,
  },
  goalTagline: {
    ...Typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.xxs,
  },
  customGoalContainer: {
    marginTop: Spacing.xl,
  },
  // Clock dial presets
  presetChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  presetChipActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  presetChipText: {
    ...Typography.smallBold,
    color: colors.textSecondary,
  },
  presetChipTextActive: {
    color: colors.white,
  },
  // Sliders
  sliderContainer: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: vh(20),
    borderWidth: 1,
    borderColor: colors.backgroundLight,
  },
  sliderTitle: {
    ...Typography.smallBold,
    color: colors.textSecondary,
    marginBottom: vh(6),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Time inputs
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  timeInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  timeInput: {
    width: 60,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Typography.heading3,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: colors.white,
    color: colors.textPrimary,
  },
  timeLabel: {
    ...Typography.bodyBold,
    color: colors.textSecondary,
  },
  // Inline Calendar
  inlineCalendar: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: vh(10),
    borderWidth: 1,
    borderColor: colors.border,
  },
  calHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: vh(10),
  },
  calNavBtn: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.backgroundLight,
  },
  calMonthYear: {
    ...Typography.subheading,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  calWeekRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  calWeekDay: {
    flex: 1,
    textAlign: 'center',
    ...Typography.captionBold,
    color: colors.textMuted,
  },
  calDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calDayCell: {
    width: `${100 / 7}%` as DimensionValue,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    marginVertical: vh(2),
  },
  calSelectedDay: {
    backgroundColor: colors.secondary,
  },
  calTodayDay: {
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  calDayText: {
    ...Typography.small,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  calDisabledText: {
    color: colors.disabled,
  },
  calSelectedText: {
    color: colors.white,
    fontWeight: '700',
  },
  calTodayText: {
    color: colors.secondary,
    fontWeight: '700',
  },
  // End date info
  endDateContainer: {
    backgroundColor: colors.successLighter,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: vh(12),
    marginTop: vh(8),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  endDateLabel: {
    ...Typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  endDateValue: {
    ...Typography.subheading,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
  endDateSublabel: {
    ...Typography.caption,
    color: colors.textMuted,
    marginTop: Spacing.xs,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: FOOTER_HEIGHT,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? vh(30) : vh(18),
    paddingTop: vh(14),
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.backgroundLight,
    ...Shadows.md,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -4 },
  },
  ctaButton: {
    borderRadius: BorderRadius.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
    borderRadius: BorderRadius.lg,
  },
  ctaText: {
    color: colors.white,
    ...Typography.subheading,
    fontWeight: '700',
  },
  // Modal
  modalSubtitle: {
    ...Typography.small,
    color: colors.textSecondary,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  modalDetails: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalRow: {
    ...Typography.body,
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  modalLabel: {
    fontWeight: '600',
    color: colors.primaryDeep,
  },
  pledgeNote: {
    ...Typography.caption,
    color: colors.successMedium,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    fontStyle: 'italic',
  },
  modalButtons: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  modalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
});

export default GoalSettingScreen;
