// screens/Recipient/GoalSettingScreen.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
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
} from 'react-native';
import { TextInput } from '../../components/TextInput';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { MotiView, AnimatePresence } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import {
  RecipientStackParamList,
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
import { useToast } from '../../context/ToastContext';
import ModernSlider from '../../components/ModernSlider';
import WizardProgressBar from '../../components/WizardProgressBar';

const TOTAL_STEPS = 4;

type NavProp = NativeStackNavigationProp<RecipientStackParamList, 'GoalSetting'>;

const CATEGORIES = [
  { icon: '🏋️', name: 'Gym', color: '#10B981' },
  { icon: '🧘', name: 'Yoga', color: '#8B5CF6' },
  { icon: '🕺', name: 'Dance', color: '#F59E0B' },
  { icon: '✏️', name: 'Other', color: '#6B7280' },
];

const STEP_TITLES = [
  'Choose Your Goal',
  'Set Your Intensity',
  'Pick Your Start Date',
  'Review & Confirm',
];

const STEP_SUBTITLES = [
  'Pick the category that matches your experience gift',
  'How hard do you want to push yourself? Start small \u2014 you can always do more later!',
  'We\u2019ll send you reminders so you never miss a session',
  'Make sure everything looks right before we set it in motion',
];

// ─── Main Screen Component ──────────────────────────────────────────
const GoalSettingScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(plannedStartDate.getFullYear(), plannedStartDate.getMonth(), 1)
  );

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Exit confirmation for unsaved wizard progress
  useEffect(() => {
    const unsubscribe = (navigation as any).addListener('beforeRemove', (e: any) => {
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
    });
    return unsubscribe;
  }, [navigation, currentStep]);

  // Validate required data
  const hasValidData = Boolean(experienceGift?.id && experienceGift?.experienceId);

  useEffect(() => {
    if (!hasValidData) {
      logger.warn('Missing/invalid experienceGift on GoalSettingScreen, redirecting to CouponEntry');
      // @ts-ignore
      navigation.reset({ index: 0, routes: [{ name: 'CouponEntry' }] });
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
      try {
        const exp = await experienceService.getExperienceById(experienceGift.experienceId);
        setExperience(exp);
      } catch (error) {
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

  // Pre-generate first AI hint when reaching the review step
  useEffect(() => {
    if (currentStep === 4 && !hintPromise && experience) {
      const totalSessions = weeks * sessionsPerWeek;
      const startGeneration = async () => {
        try {
          const recipientName = await userService.getUserName(state.user?.id || '');
          const promise = aiHintService.generateHint({
            goalId: 'temp',
            experienceType: experience.title,
            sessionNumber: 1,
            totalSessions,
            userName: recipientName,
          });
          setHintPromise(promise.then(res => res.hint));
        } catch (err) {
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
        const finalCat = selectedCategory === 'Other' ? customCategory.trim() : selectedCategory;
        if (!finalCat) {
          setValidationErrors(prev => ({ ...prev, category: true }));
          return false;
        }
        setValidationErrors(prev => ({ ...prev, category: false }));
        return true;
      }
      case 2: {
        const h = parseInt(hours || '0', 10);
        const m = parseInt(minutes || '0', 10);
        if ((!hours && !minutes) || (h === 0 && m === 0)) {
          setValidationErrors(prev => ({ ...prev, time: true }));
          return false;
        }
        if (h > 3 || (h === 3 && m > 0)) {
          showError('Each session cannot exceed 3 hours.');
          return false;
        }
        setValidationErrors(prev => ({ ...prev, time: false }));
        return true;
      }
      case 3:
        return true;
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

      const finalCategory = selectedCategory === 'Other' ? sanitizeText(customCategory.trim(), 50) : selectedCategory;
      const hoursNum = parseInt(hours || '0');
      const minutesNum = parseInt(minutes || '0');
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
        title: `Attend ${finalCategory} Sessions`,
        description: `Work on ${finalCategory} for ${weeks} weeks, ${sessionsPerWeek} times per week.`,
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
        location: experience?.location || 'Unknown location',
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
      } catch (goalError) {
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
        } catch (revertError) {
          logger.error('Failed to revert gift claim:', revertError);
          // Revert itself failed — the gift may be in an inconsistent state.
          // Surface a clear message here rather than swallowing the error silently.
          showError('Something went wrong. Please contact support with your claim code — we will fix this.');
        }
        throw goalError; // Re-throw to hit the outer error handler
      }

      // Bidirectional link: if giver's goal already exists, update it to point back to this recipient goal
      if (experienceGift?.challengeType === 'shared' && experienceGift?.togetherData?.giverGoalId) {
        // Retry bidirectional link up to 3 times
        let linkSuccess = false;
        for (let attempt = 0; attempt < 3 && !linkSuccess; attempt++) {
          try {
            await updateDoc(doc(db, 'goals', experienceGift.togetherData.giverGoalId), {
              partnerGoalId: goal.id,
              updatedAt: serverTimestamp(),
            });
            linkSuccess = true;
            logger.log(`Linked giver goal ${experienceGift.togetherData.giverGoalId} -> recipient goal ${goal.id}`);
          } catch (linkErr) {
            if (attempt === 2) {
              console.error('Failed to link partner goal after 3 attempts:', linkErr);
              // Store recipientGoalId on the gift as fallback
              try {
                await updateDoc(doc(db, 'experienceGifts', experienceGift.id), {
                  recipientGoalId: goal.id,
                  updatedAt: serverTimestamp(),
                });
              } catch (e) { console.error('Fallback link also failed:', e); }
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
        } catch (e) {
          console.warn('Failed to send shared_start notification:', e);
        }
      }

      const recipientName = await userService.getUserName(goalData.userId);

      // Send approval notification (skip for self-gifts and shared challenges)
      // Shared challenges are auto-approved; the shared_start notification (H1) handles giver notification
      const isSelfGift = experienceGift.giverId === currentUserId;
      if (!isSelfGift && experienceGift?.challengeType !== 'shared') {
        await notificationService.createNotification(
          goalData.empoweredBy! || '',
          'goal_approval_request',
          `\u{1F3AF} ${recipientName} set a goal for ${experience?.title ?? 'your challenge'}`,
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
            type: 'text',
          };
          await goalService.appendHint(goal.id, hintObj);
          setFirstHint(hint);
          setShowHintPopup(true);
          setHintPromise(null);
        } catch (hintError) {
          logger.error('Failed to get pre-generated hint:', hintError);
          navigation.reset({
            index: 1,
            routes: [{ name: 'Goals' }, { name: 'Journey', params: { goal: serializeNav(goal) } }],
          });
        }
      } else {
        navigation.reset({
          index: 1,
          routes: [{ name: 'Goals' }, { name: 'Journey', params: { goal: serializeNav(goal) } }],
        });
      }
    } catch (error) {
      logger.error('Error creating goal:', error);
      await logErrorToFirestore(error, {
        screenName: 'GoalSettingScreen',
        feature: 'CreateGoal',
        userId: state.user?.id,
        additionalData: {
          giftId: experienceGift.id,
          category: selectedCategory === 'Other' ? customCategory : selectedCategory,
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
      navigation.reset({
        index: 1,
        routes: [{ name: 'Goals' }, { name: 'Journey', params: { goal: serializeNav(createdGoal) } }],
      });
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

  const finalCategory = selectedCategory === 'Other' ? customCategory.trim() : selectedCategory;

  // ─── Together Mode: pre-fill from giver's goal ───────────────────
  const togetherData = experienceGift?.togetherData;
  const [acceptedGiverGoal, setAcceptedGiverGoal] = useState(false);

  const handleAcceptGiverGoal = () => {
    if (!togetherData) return;
    setAcceptedGiverGoal(true);
    // Pre-fill from giver's goal data
    // Parse duration (e.g. "3 weeks" → weeks=3)
    const durationMatch = togetherData.duration?.match(/(\d+)/);
    if (durationMatch) setWeeks(parseInt(durationMatch[1], 10));
    // Parse frequency (e.g. "3x per week" → sessionsPerWeek=3)
    const freqMatch = togetherData.frequency?.match(/(\d+)/);
    if (freqMatch) setSessionsPerWeek(parseInt(freqMatch[1], 10));
    // Parse session time (e.g. "1h 30m")
    const timeMatch = togetherData.sessionTime?.match(/(\d+)h\s*(\d+)m/);
    if (timeMatch) {
      setHours(timeMatch[1]);
      setMinutes(timeMatch[2]);
    }
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
            {experience.imageUrl ? (
              <Image
                source={{ uri: experience.imageUrl }}
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
              >
                <Text style={{ ...Typography.smallBold, color: colors.textSecondary }}>Create my own</Text>
              </TouchableOpacity>
            </View>
          </View>
        </MotiView>
      )}

      <View style={styles.goalGrid}>
        {CATEGORIES.map((cat) => (
          <MotiView
            key={cat.name}
            style={{ width: '31%', minWidth: 95 }}
            animate={{ scale: selectedCategory === cat.name ? 1.04 : 1 }}
            transition={{
              scale: selectedCategory === cat.name
                ? { type: 'spring', damping: 34, stiffness: 100 }
                : { type: 'timing', duration: 100 },
            }}
          >
            <TouchableOpacity
              style={[
                styles.goalChip,
                { width: '100%' },
                selectedCategory === cat.name && { backgroundColor: cat.color, borderColor: cat.color },
                validationErrors.category && !selectedCategory && styles.goalChipError,
              ]}
              onPress={() => {
                setSelectedCategory(cat.name);
                setValidationErrors(prev => ({ ...prev, category: false }));
                if (cat.name !== 'Other') setCustomCategory('');
              }}
              accessibilityRole="button"
              accessibilityLabel={`${cat.name} category`}
            >
              <Text style={styles.goalIcon}>{cat.icon}</Text>
              <Text style={[
                styles.goalName,
                selectedCategory === cat.name && styles.goalNameActive,
              ]}>{cat.name}</Text>
            </TouchableOpacity>
          </MotiView>
        ))}
      </View>

      {validationErrors.category && (
        <Text style={{ color: colors.error, ...Typography.caption, marginTop: Spacing.md, fontWeight: '500' }}>
          Please select a goal category
        </Text>
      )}

      {selectedCategory === 'Other' && (
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
            error={validationErrors.category && customCategory.trim() === '' ? 'Please enter a custom category' : undefined}
            leftIcon={<Text style={styles.customGoalIcon}>{'\u2728'}</Text>}
            autoFocus
            accessibilityLabel="Custom goal category"
          />
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

      <View style={styles.section}>
        <View style={styles.sliderContainer}>
          <Text style={styles.sliderTitle}>Time per session</Text>

          <View style={styles.timeRow}>
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

          {validationErrors.time && (
            <Text style={{ color: colors.error, ...Typography.caption, marginTop: Spacing.sm, fontWeight: '500' }}>
              Please set a time per session (at least 1 minute)
            </Text>
          )}
        </View>
      </View>
    </View>
  );

  const renderStep3 = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const calendarDays = getCalendarDays(calendarMonth);

    return (
      <View style={styles.stepContent}>
        <View style={styles.sliderContainer}>
          <View style={styles.inlineCalendar}>
            <View style={styles.calHeader}>
              <TouchableOpacity
                onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                style={styles.calNavBtn}
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

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <View style={styles.reviewCard}>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Goal</Text>
          <Text style={styles.reviewValue}>{finalCategory || '\u2014'}</Text>
        </View>
        <View style={styles.reviewDivider} />
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Duration</Text>
          <Text style={styles.reviewValue}>{weeks} {weeks === 1 ? 'week' : 'weeks'}</Text>
        </View>
        <View style={styles.reviewDivider} />
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Sessions / week</Text>
          <Text style={styles.reviewValue}>{sessionsPerWeek}x</Text>
        </View>
        <View style={styles.reviewDivider} />
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Per session</Text>
          <Text style={styles.reviewValue}>{hours || '0'}h {minutes || '0'}m</Text>
        </View>
        <View style={styles.reviewDivider} />
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Start date</Text>
          <Text style={styles.reviewValue}>
            {plannedStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
        </View>
        <View style={styles.reviewDivider} />
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Finish date</Text>
          <Text style={[styles.reviewValue, { color: colors.primary }]}>
            {goalEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
        </View>
        <View style={styles.reviewDivider} />
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Total sessions</Text>
          <Text style={[styles.reviewValue, { color: colors.primary, fontWeight: '800' }]}>
            {weeks * sessionsPerWeek}
          </Text>
        </View>
      </View>

      {experience && experienceGift?.revealMode === 'revealed' && (
        <View style={styles.experiencePreview}>
          <Text style={styles.experiencePreviewLabel}>Experience Gift</Text>
          <Text style={styles.experiencePreviewTitle}>{experience.title}</Text>
        </View>
      )}
      {experienceGift?.revealMode === 'secret' && (
        <View style={styles.experiencePreview}>
          <Text style={styles.experiencePreviewLabel}>Experience Gift</Text>
          <Text style={styles.experiencePreviewTitle}>Mystery reward - complete your challenge to unlock!</Text>
        </View>
      )}
    </View>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      default: return null;
    }
  };

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <ErrorBoundary screenName="GoalSettingScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Goals">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                onPress={confirmCreateGoal}
                activeOpacity={0.9}
                disabled={isSubmitting}
              >
                <Animated.View style={{ transform: [{ scale: pulseAnim }], width: '100%' }}>
                  <LinearGradient
                    colors={colors.gradientDark}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.ctaGradient, isSubmitting && { opacity: 0.9 }]}
                  >
                    <Text style={styles.ctaText}>
                      {isSubmitting ? 'Creating Goal...' : 'Create Goal'}
                    </Text>
                    {!isSubmitting && <ChevronRight color={colors.white} size={20} strokeWidth={3} />}
                  </LinearGradient>
                </Animated.View>
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

        {/* First Hint Popup */}
        {showHintPopup && firstHint && (
          <HintPopup
            visible={showHintPopup}
            hint={firstHint}
            sessionNumber={1}
            totalSessions={createdGoal ? createdGoal.targetCount * createdGoal.sessionsPerWeek : 1}
            onClose={handleHintPopupClose}
            isFirstHint={true}
            additionalMessage={'\u{1F3AF} You\u2019ll receive your second hint after completing your first session!'}
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
  // Progress bar
  progressBar: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: colors.white,
  },
  progressTrack: {
    height: 4,
    borderRadius: BorderRadius.xs,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: BorderRadius.xs,
    backgroundColor: colors.secondary,
  },
  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
  },
  stepTitle: {
    ...Typography.heading1,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  stepSubtitle: {
    ...Typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.xxxl,
  },
  stepContent: {},
  section: {
    marginBottom: Spacing.xl,
  },
  // Error banner
  errorBanner: {
    backgroundColor: colors.errorLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  errorText: {
    color: colors.error,
    ...Typography.small,
    fontWeight: '600',
  },
  // Goal chips (Step 1)
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  goalChip: {
    width: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
  },
  goalChipError: {
    borderColor: colors.errorBorder,
    backgroundColor: colors.errorLight,
  },
  goalIcon: {
    ...Typography.heading2,
  },
  goalName: {
    ...Typography.body,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  goalNameActive: {
    color: colors.white,
  },
  customGoalContainer: {
    marginTop: Spacing.xl,
  },
  customGoalLabel: {
    ...Typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  customGoalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  customGoalIcon: {
    ...Typography.large,
    marginRight: Spacing.sm,
  },
  customGoalInput: {
    flex: 1,
    ...Typography.body,
    color: colors.textPrimary,
    paddingVertical: Spacing.sm,
  },
  // Sliders (Step 2)
  sliderContainer: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    borderWidth: 1,
    borderColor: colors.backgroundLight,
  },
  sliderTitle: {
    ...Typography.small,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sliderValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  sliderValue: {
    ...Typography.display,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  sliderUnit: {
    ...Typography.heading3,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sliderLabelText: {
    ...Typography.caption,
    fontWeight: '600',
    color: colors.textMuted,
  },
  sliderTrack: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: BorderRadius.xs,
    position: 'relative',
    width: '100%',
  },
  sliderProgress: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: BorderRadius.xs,
  },
  sliderThumb: {
    position: 'absolute',
    top: -8,
    marginLeft: -Spacing.md,
    width: 24,
    height: 24,
    borderRadius: BorderRadius.md,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  sliderThumbInner: {
    width: 12,
    height: 12,
    borderRadius: BorderRadius.xs,
    backgroundColor: colors.primary,
  },
  // Time inputs (Step 2)
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
    ...Typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  // Calendar (Step 3)
  inlineCalendar: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
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
    ...Typography.caption,
    fontWeight: '600',
    color: colors.textMuted,
  },
  calDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calDayCell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    marginVertical: 1,
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
  // End date info (Step 3)
  endDateContainer: {
    backgroundColor: colors.primarySurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  endDateLabel: {
    ...Typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  endDateValue: {
    ...Typography.heading3,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
  endDateSublabel: {
    ...Typography.caption,
    color: colors.textMuted,
    marginTop: Spacing.xs,
  },
  // Review card (Step 4)
  reviewCard: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: colors.backgroundLight,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  reviewLabel: {
    ...Typography.body,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  reviewValue: {
    ...Typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: colors.backgroundLight,
  },
  experiencePreview: {
    backgroundColor: colors.primarySurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  experiencePreviewLabel: {
    ...Typography.caption,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  experiencePreviewTitle: {
    ...Typography.subheading,
    fontWeight: '700',
    color: colors.primaryDeep,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 34 : Spacing.xl,
    paddingTop: Spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.backgroundLight,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
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
    ...Typography.heading3,
    fontWeight: '700',
  },
});

export default GoalSettingScreen;
