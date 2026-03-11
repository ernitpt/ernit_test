// screens/Recipient/GoalSettingScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { MotiView, AnimatePresence } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import {
  RecipientStackParamList,
  ExperienceGift,
  Goal,
} from '../../types';
import { useApp } from '../../context/AppContext';
import { goalService } from '../../services/GoalService';
import { analyticsService } from '../../services/AnalyticsService';
import { notificationService } from '../../services/NotificationService';
import { userService } from '../../services/userService';
import MainScreen from '../MainScreen';
import { db, auth } from '../../services/firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { experienceService } from '../../services/ExperienceService';
import { SkeletonBox } from '../../components/SkeletonLoader';
import { logger } from '../../utils/logger';
import HintPopup from '../../components/HintPopup';
import { aiHintService } from '../../services/AIHintService';
import { logErrorToFirestore } from '../../utils/errorLogger';
import Colors from '../../config/colors';
import { useToast } from '../../context/ToastContext';

const { width } = Dimensions.get('window');
const TOTAL_STEPS = 4;

type NavProp = NativeStackNavigationProp<RecipientStackParamList, 'GoalSetting'>;

const CATEGORIES = [
  { icon: '\u{1F9D8}', name: 'Yoga', color: '#EC4899' },
  { icon: '\u{1F3CB}\u{FE0F}', name: 'Gym', color: Colors.secondary },
  { icon: '\u{1F3C3}\u200D\u2640\uFE0F', name: 'Running', color: Colors.accent },
  { icon: '\u{1F4BB}', name: 'Courses', color: '#F59E0B' },
  { icon: '\u{1F4DA}', name: 'Education', color: '#8B5CF6' },
  { icon: '\u{1F3B9}', name: 'Piano', color: '#3B82F6' },
  { icon: '\u270F\uFE0F', name: 'Other', color: Colors.textSecondary },
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

// ─── ModernSlider ────────────────────────────────────────────────────
const ModernSlider = ({
  label, value, min, max, onChange, leftLabel, rightLabel, unit, unitPlural,
}: {
  label: string; value: number; min: number; max: number;
  onChange: (val: number) => void; leftLabel: string; rightLabel: string;
  unit?: string; unitPlural?: string;
}) => {
  const handlePress = (event: any) => {
    const { locationX } = event.nativeEvent;
    const trackWidth = width - 96;
    const percentage = Math.max(0, Math.min(1, locationX / trackWidth));
    const newValue = Math.round(min + percentage * (max - min));
    onChange(newValue);
  };

  const progress = ((value - min) / (max - min)) * 100;
  const displayUnit = unit && unitPlural ? (value === 1 ? unit : unitPlural) : '';

  return (
    <View style={styles.sliderContainer}>
      <Text style={styles.sliderTitle}>{label}</Text>
      <View style={styles.sliderValueRow}>
        <Text style={styles.sliderValue}>{value}</Text>
        {displayUnit ? <Text style={styles.sliderUnit}>{displayUnit}</Text> : null}
      </View>
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabelText}>{leftLabel}</Text>
        <Text style={styles.sliderLabelText}>{rightLabel}</Text>
      </View>
      <View
        style={styles.sliderTrack}
        onStartShouldSetResponder={() => true}
        onResponderGrant={handlePress}
        onResponderMove={handlePress}
      >
        <View style={[styles.sliderProgress, { width: `${progress}%` }]} />
        <View style={[styles.sliderThumb, { left: `${progress}%` }]}>
          <View style={styles.sliderThumbInner} />
        </View>
      </View>
    </View>
  );
};

// ─── Progress Bar ────────────────────────────────────────────────────
const ProgressBar = ({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) => {
  const progress = (currentStep / totalSteps) * 100;
  return (
    <View style={styles.progressBar}>
      <View style={styles.progressTrack}>
        <MotiView
          animate={{ width: `${progress}%` as any }}
          transition={{ type: 'spring', damping: 100, stiffness: 320 }}
          style={styles.progressFill}
        />
      </View>
    </View>
  );
};

// ─── Main Screen Component ──────────────────────────────────────────
const GoalSettingScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute();
  const routeParams = route.params as { experienceGift?: ExperienceGift } | undefined;
  const experienceGift = routeParams?.experienceGift;
  const { state, dispatch } = useApp();
  const { showError } = useToast();
  const scrollViewRef = useRef<ScrollView>(null);
  const minutesRef = useRef<TextInput>(null);

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
          <View style={{ padding: 20, gap: 16 }}>
            <SkeletonBox width="100%" height={120} borderRadius={12} />
            <SkeletonBox width="60%" height={20} borderRadius={8} />
            <SkeletonBox width="100%" height={48} borderRadius={12} />
          </View>
        </MainScreen>
      </ErrorBoundary>
    );
  }

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
  const [validationErrors, setValidationErrors] = useState({ category: false, time: false });
  const [experience, setExperience] = useState<any>(null);
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
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
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
    await runTransaction(db, async (transaction) => {
      const freshGift = await transaction.get(giftDocRef);
      if (!freshGift.exists()) throw new Error('Gift not found');
      if (freshGift.data().status !== 'pending') throw new Error('Gift already claimed');
      transaction.update(giftDocRef, {
        status: 'claimed',
        recipientId: currentUser.uid,
        claimedAt: serverTimestamp(),
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

      const finalCategory = selectedCategory === 'Other' ? customCategory.trim() : selectedCategory;
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
      } catch (claimError: any) {
        if (claimError.message === 'Gift already claimed') {
          showError('This code has already been claimed by someone else. Please check with the person who sent it to you.');
        } else if (claimError.message === 'User not authenticated') {
          showError('Please sign in to continue.');
        } else {
          await logErrorToFirestore(claimError, {
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
      };

      const goal = await goalService.createGoal(goalData as Goal);
      analyticsService.trackEvent('goal_creation_completed', 'conversion', {
        category: finalCategory,
        durationWeeks: weeks,
        sessionsPerWeek,
      }, 'GoalSettingScreen');

      const recipientName = await userService.getUserName(goalData.userId);

      // Send approval notification (skip for self-gifts)
      const isSelfGift = experienceGift.giverId === currentUserId;
      if (!isSelfGift) {
        await notificationService.createNotification(
          goalData.empoweredBy! || '',
          'goal_approval_request',
          `\u{1F3AF} ${recipientName} set a goal for ${experience.title}`,
          `Goal: ${goalData.description}`,
          {
            giftId: goalData.experienceGiftId,
            goalId: goal.id,
            giverId: goalData.empoweredBy,
            recipientId: goalData.userId,
            experienceTitle: experience.title,
            initialTargetCount: weeks,
            initialSessionsPerWeek: sessionsPerWeek,
          },
          false,
        );
      }

      dispatch({ type: 'SET_GOAL', payload: goal });
      setCreatedGoal(goal);

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
            routes: [{ name: 'CouponEntry' }, { name: 'Journey', params: { goal } }],
          });
        }
      } else {
        navigation.reset({
          index: 1,
          routes: [{ name: 'CouponEntry' }, { name: 'Journey', params: { goal } }],
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
      showError('Failed to create goal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHintPopupClose = () => {
    setShowHintPopup(false);
    if (createdGoal) {
      navigation.reset({
        index: 1,
        routes: [{ name: 'CouponEntry' }, { name: 'Journey', params: { goal: createdGoal } }],
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

  // ─── Step Renderers ───────────────────────────────────────────────
  const renderStep1 = () => (
    <View style={styles.stepContent}>
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
        <Text style={{ color: '#ef4444', fontSize: 13, marginTop: 12, fontWeight: '500' }}>
          Please select a goal category
        </Text>
      )}

      {selectedCategory === 'Other' && (
        <View style={styles.customGoalContainer}>
          <Text style={styles.customGoalLabel}>Enter your custom goal:</Text>
          <View style={styles.customGoalInputWrapper}>
            <Text style={styles.customGoalIcon}>{'\u2728'}</Text>
            <TextInput
              style={styles.customGoalInput}
              placeholder="e.g., Painting, Meditation, Guitar..."
              value={customCategory}
              onChangeText={(text) => {
                setCustomCategory(text);
                if (validationErrors.category && text.trim()) {
                  setValidationErrors(prev => ({ ...prev, category: false }));
                }
              }}
              autoFocus
              accessibilityLabel="Custom goal category"
            />
          </View>
          {validationErrors.category && customCategory.trim() === '' && (
            <Text style={{ color: '#ef4444', fontSize: 13, marginTop: 4, fontWeight: '500' }}>
              Please enter a custom category
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

      <View style={styles.section}>
        <View style={styles.sliderContainer}>
          <Text style={styles.sliderTitle}>Time per session</Text>

          <View style={styles.timeRow}>
            <View style={styles.timeInputGroup}>
              <TextInput
                style={styles.timeInput}
                value={hours}
                onChangeText={(t) => {
                  setHours(sanitizeNumericInput(t));
                  if (validationErrors.time) setValidationErrors(prev => ({ ...prev, time: false }));
                }}
                keyboardType="numeric"
                maxLength={1}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                onSubmitEditing={() => minutesRef.current?.focus()}
                accessibilityLabel="Hours per session"
              />
              <Text style={styles.timeLabel}>hr</Text>
            </View>
            <View style={styles.timeInputGroup}>
              <TextInput
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
                placeholderTextColor={Colors.textMuted}
                returnKeyType="done"
                accessibilityLabel="Minutes per session"
              />
              <Text style={styles.timeLabel}>min</Text>
            </View>
          </View>

          {validationErrors.time && (
            <Text style={{ color: '#ef4444', fontSize: 13, marginTop: 8, fontWeight: '500' }}>
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
                <ChevronLeft color={Colors.textSecondary} size={20} />
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
                <ChevronRight color={Colors.textSecondary} size={20} />
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
          <Text style={[styles.reviewValue, { color: Colors.primary }]}>
            {goalEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
        </View>
        <View style={styles.reviewDivider} />
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Total sessions</Text>
          <Text style={[styles.reviewValue, { color: Colors.primary, fontWeight: '800' }]}>
            {weeks * sessionsPerWeek}
          </Text>
        </View>
      </View>

      {experience && (
        <View style={styles.experiencePreview}>
          <Text style={styles.experiencePreviewLabel}>Experience Gift</Text>
          <Text style={styles.experiencePreviewTitle}>{experience.title}</Text>
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
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.8}>
              <ChevronLeft color={Colors.textPrimary} size={24} strokeWidth={2.5} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Set Your Goal</Text>
            <View style={styles.stepIndicator}>
              <Text style={styles.stepIndicatorText}>{currentStep}/{TOTAL_STEPS}</Text>
            </View>
          </View>

          <ProgressBar currentStep={currentStep} totalSteps={TOTAL_STEPS} />

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

            <View style={{ height: 160 }} />
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
                    colors={Colors.gradientDark}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.ctaGradient, isSubmitting && { opacity: 0.9 }]}
                  >
                    <Text style={styles.ctaText}>
                      {isSubmitting ? 'Creating Goal...' : 'Create Goal'}
                    </Text>
                    {!isSubmitting && <ChevronRight color="#fff" size={20} strokeWidth={3} />}
                  </LinearGradient>
                </Animated.View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.ctaButton} onPress={handleNext} activeOpacity={0.9}>
                <LinearGradient
                  colors={Colors.gradientDark}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.ctaGradient}
                >
                  <Text style={styles.ctaText}>Next</Text>
                  <ChevronRight color="#fff" size={20} strokeWidth={3} />
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </View>

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
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundLight,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  stepIndicator: {
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  stepIndicatorText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  // Progress bar
  progressBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.white,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.secondary,
  },
  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 28,
  },
  stepContent: {},
  section: {
    marginBottom: 20,
  },
  // Error banner
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
  },
  // Goal chips (Step 1)
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  goalChip: {
    width: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  goalChipError: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  goalIcon: {
    fontSize: 22,
  },
  goalName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  goalNameActive: {
    color: Colors.white,
  },
  customGoalContainer: {
    marginTop: 20,
  },
  customGoalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  customGoalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  customGoalIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  customGoalInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    paddingVertical: 10,
  },
  // Sliders (Step 2)
  sliderContainer: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.backgroundLight,
  },
  sliderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sliderValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 20,
    gap: 8,
  },
  sliderValue: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  sliderUnit: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sliderLabelText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  sliderTrack: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    position: 'relative',
    width: '100%',
  },
  sliderProgress: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  sliderThumb: {
    position: 'absolute',
    top: -8,
    marginLeft: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  sliderThumbInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  // Time inputs (Step 2)
  timeRow: {
    flexDirection: 'row',
    gap: 16,
  },
  timeInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    width: 60,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: Colors.white,
    color: Colors.textPrimary,
  },
  timeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  // Calendar (Step 3)
  inlineCalendar: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calNavBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.backgroundLight,
  },
  calMonthYear: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  calWeekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  calWeekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
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
    borderRadius: 10,
    marginVertical: 1,
  },
  calSelectedDay: {
    backgroundColor: Colors.secondary,
  },
  calTodayDay: {
    borderWidth: 2,
    borderColor: Colors.secondary,
  },
  calDayText: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  calDisabledText: {
    color: '#D1D5DB',
  },
  calSelectedText: {
    color: Colors.white,
    fontWeight: '700',
  },
  calTodayText: {
    color: Colors.secondary,
    fontWeight: '700',
  },
  // End date info (Step 3)
  endDateContainer: {
    backgroundColor: Colors.primarySurface,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  endDateLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginBottom: 4,
  },
  endDateValue: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'center',
  },
  endDateSublabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  // Review card (Step 4)
  reviewCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.backgroundLight,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  reviewLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  reviewValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: Colors.backgroundLight,
  },
  experiencePreview: {
    backgroundColor: Colors.primarySurface,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  experiencePreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  experiencePreviewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primaryDeep,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    paddingTop: 16,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.backgroundLight,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  ctaButton: {
    borderRadius: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 16,
  },
  ctaText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
});

export default GoalSettingScreen;
