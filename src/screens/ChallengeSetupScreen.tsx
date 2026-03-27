import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SkeletonBox } from '../components/SkeletonLoader';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { Shadows } from '../config/shadows';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Platform,
    TextInput as RNTextInput,
    Image as RNImage,
    Animated,
    Alert,
    KeyboardAvoidingView,
    GestureResponderEvent,
    DimensionValue,
    useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Path } from 'react-native-svg';
import { TextInput } from '../components/TextInput';
import { StatusBar } from 'expo-status-bar';
import { useRoute } from '@react-navigation/native';
import { useBeforeRemove } from '../hooks/useBeforeRemove';
import { ChevronLeft, ChevronRight, Check, Info } from 'lucide-react-native';
import { MotiView, AnimatePresence } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Experience, Goal, ExperienceCategory, ChallengeSetupPrefill } from '../types';
import { serializeNav } from '../utils/serializeNav';
import { useRootNavigation } from '../types/navigation';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { goalService } from '../services/GoalService';
import { BaseModal } from '../components/BaseModal';
import Button from '../components/Button';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import ModernSlider from '../components/ModernSlider';
import WizardProgressBar from '../components/WizardProgressBar';
import { EXPERIENCE_CATEGORIES, setStorageItem, sanitizeNumericInput } from '../utils/wizardHelpers';
import { sanitizeText } from '../utils/sanitization';
import { vh } from '../utils/responsive';
import * as Haptics from 'expo-haptics';
import { analyticsService } from '../services/AnalyticsService';
import ExperienceDetailModal from '../components/ExperienceDetailModal';

const getGoalTypes = (colors: typeof Colors) => [
    { icon: '\u{1F3CB}\u{FE0F}', name: 'Gym', color: colors.secondary, tagline: 'Hit the weights' },
    { icon: '\u{1F9D8}', name: 'Yoga', color: colors.categoryPink, tagline: 'Find your flow' },
    { icon: '\u{1F483}', name: 'Dance', color: colors.accent, tagline: 'Move to the beat' },
    { icon: '\u270F\uFE0F', name: 'Add your own', color: colors.textSecondary, tagline: 'Create a custom challenge' },
];

const STEP_TITLES = [
    'What is your goal?',
    'Set your challenge intensity',
    'How long per session?',
    'When do you start?',
    'Choose your reward',
    'Secure your reward',
];

const STEP_SUBTITLES = [
    'Pick the habit you want to build. We\'ll help you stay on track.',
    'It takes 21 days to build a habit. Start small, you can always do another challenge later!',
    'Set the duration for each time you show up',
    'We\'ll send you reminders so you never miss a session.',
    'Pick a specific experience or let us surprise you with a recommendation.',
    'Choose how you want to back your challenge.',
];

// Alias so JSX call sites don't need to change
const ProgressBar = WizardProgressBar;

export default function ChallengeSetupScreen() {
    const navigation = useRootNavigation();
    const route = useRoute();
    const routeParams = route.params as { prefill?: ChallengeSetupPrefill } | undefined;
    const { state, dispatch } = useApp();
    const { showError, showSuccess } = useToast();
    const colors = useColors();
    const { width: screenWidth } = useWindowDimensions();
    const styles = useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
    const GOAL_TYPES = useMemo(() => getGoalTypes(colors), [colors]);

    // Wizard step
    const [currentStep, setCurrentStep] = useState(1);

    // Goal config
    const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
    const [customGoal, setCustomGoal] = useState('');
    const [weeks, setWeeks] = useState(3);
    const [sessionsPerWeek, setSessionsPerWeek] = useState(3);
    const [hours, setHours] = useState('');
    const [minutes, setMinutes] = useState('');
    const [sessionMinutes, setSessionMinutes] = useState(30);
    const [showCustomTime, setShowCustomTime] = useState(false);
    const [paymentChoice, setPaymentChoice] = useState<'payNow' | 'payLater' | 'free'>('payNow');

    // Experience selection (mandatory)
    const [experiences, setExperiences] = useState<Experience[]>([]);
    const [selectedExperience, setSelectedExperience] = useState<Experience | null>(null);
    const [loadingExperiences, setLoadingExperiences] = useState(true);

    // Step 4: Preferred reward category
    const [preferredRewardCategory, setPreferredRewardCategory] = useState<ExperienceCategory | null>(null);
    const [showExperiencePicker, setShowExperiencePicker] = useState(false);
    const [detailExperience, setDetailExperience] = useState<Experience | null>(null);

    // Always 6 steps — last step shows reward info or challenge-ready confirmation
    // Payment step (6) only shows when user picked a specific experience via browse
    const needsPaymentStep = !!selectedExperience;
    const totalSteps = needsPaymentStep ? 6 : 5;

    // Guard: if experience was cleared while on step 6, snap back to step 5
    useEffect(() => {
        if (currentStep > totalSteps) {
            setCurrentStep(totalSteps);
        }
    }, [totalSteps, currentStep]);

    // UI state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submittingRef = useRef(false); // Ref-based guard for synchronous double-tap prevention
    const goalCreatedRef = useRef(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [validationErrors, setValidationErrors] = useState({ goal: false, time: false, experience: false });
    const [plannedStartDate, setPlannedStartDate] = useState(new Date());

    // Animations
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const scrollViewRef = useRef<ScrollView>(null);

    // Refs for focus chaining
    const minutesRef = useRef<RNTextInput>(null);

    // Animated dial: displayMinutes drives the visual, sessionMinutes is the form value
    const [displayMinutes, setDisplayMinutes] = useState(30);
    const animFrameRef = useRef<number | null>(null);

    // Clock dial web-compat refs
    const clockRef = useRef<View>(null);
    const clockLayout = useRef({ x: 0, y: 0, width: 0, height: 0 });

    // Category filter state (single-select, 'All' by default)
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [showFilterScrollHint, setShowFilterScrollHint] = useState(true);

    // Analytics: track wizard start on mount
    useEffect(() => {
        analyticsService.trackEvent('challenge_setup_started', 'conversion', {});
    }, []);

    // Exit confirmation for unsaved wizard progress
    useBeforeRemove(navigation, (e) => {
        if (currentStep === 1 || goalCreatedRef.current) return; // Allow back from step 1 or after successful creation
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

    // Prefill from auth redirect
    useEffect(() => {
        if (routeParams?.prefill) {
            const p = routeParams.prefill;
            if (p.goalType) setSelectedGoal(p.goalType);
            if (p.customGoal) setCustomGoal(p.customGoal);
            if (p.weeks) setWeeks(p.weeks);
            if (p.sessionsPerWeek) setSessionsPerWeek(p.sessionsPerWeek);
            if (p.hours) { setHours(p.hours); setShowCustomTime(true); }
            if (p.minutes) { setMinutes(p.minutes); setShowCustomTime(true); }
            if (p.sessionMinutes) setSessionMinutes(p.sessionMinutes);
            if (p.showCustomTime) setShowCustomTime(true);
            if (p.experience) setSelectedExperience(p.experience);
            if (p.plannedStartDate) {
                const restored = new Date(p.plannedStartDate);
                setPlannedStartDate(restored < new Date() ? new Date() : restored);
            }
            // buyNow removed — no longer used
            if (p.paymentChoice) setPaymentChoice(p.paymentChoice);
            if (p.preferredRewardCategory) setPreferredRewardCategory(p.preferredRewardCategory);
            if (p.currentStep && p.currentStep > 1) setCurrentStep(p.currentStep);
        }
    }, []);

    // Fetch experiences
    useEffect(() => {
        const fetchExperiences = async () => {
            try {
                const q = query(collection(db, 'experiences'), limit(50));
                const snapshot = await getDocs(q);
                const fetched = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as Experience))
                    .filter(exp => exp.status !== 'draft')
                    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
                setExperiences(fetched);
            } catch (error: unknown) {
                logger.error('Error fetching experiences:', error);
            } finally {
                setLoadingExperiences(false);
            }
        };
        fetchExperiences();
    }, []);


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

    // ─── Per-step validation ─────────────────────────────────────────
    const validateCurrentStep = (): boolean => {
        switch (currentStep) {
            case 1: {
                const finalGoal = selectedGoal === 'Add your own' ? customGoal.trim() : selectedGoal;
                if (!finalGoal) {
                    setValidationErrors(prev => ({ ...prev, goal: true }));
                    return false;
                }
                setValidationErrors(prev => ({ ...prev, goal: false }));
                return true;
            }
            case 2:
                // Sliders have defaults — always valid
                return true;
            case 3: {
                // Time per session (clock dial or custom input)
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
                // Date always has default — always valid
                return true;
            case 5: {
                if (!selectedExperience && !preferredRewardCategory) {
                    setValidationErrors(prev => ({ ...prev, experience: true }));
                    return false;
                }
                setValidationErrors(prev => ({ ...prev, experience: false }));
                return true;
            }
            case 6:
                // Secure reward step — informational, always valid
                return true;
            default:
                return true;
        }
    };

    const handleNext = () => {
        if (!validateCurrentStep()) return;
        if (currentStep < totalSteps) {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            analyticsService.trackEvent('challenge_step_completed', 'conversion', { step: currentStep });
            setCurrentStep(prev => prev + 1);
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        }
    };

    const handleBack = () => {
        if (showExperiencePicker) {
            setShowExperiencePicker(false);
            setSelectedExperience(null);
            setPaymentChoice('payNow');
            setValidationErrors(prev => ({ ...prev, experience: false }));
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        } else if (currentStep > 1) {
            setCurrentStep(prev => prev - 1);
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        } else {
            navigation.goBack();
        }
    };

    // ─── Create goal ─────────────────────────────────────────────────
    const handleCreate = async () => {
        if (!validateCurrentStep()) return;

        if (state.user?.id) {
            setShowConfirm(true);
        } else {
            const challengeConfig = {
                goalType: selectedGoal,
                customGoal: selectedGoal === 'Add your own' ? customGoal.trim() : '',
                weeks,
                sessionsPerWeek,
                sessionMinutes,
                showCustomTime,
                hours: showCustomTime ? hours : String(Math.floor(sessionMinutes / 60)),
                minutes: showCustomTime ? minutes : String(sessionMinutes % 60),
                experience: selectedExperience || null,
                plannedStartDate: plannedStartDate.toISOString(),
                preferredRewardCategory: preferredRewardCategory || null,
                currentStep,
                paymentChoice,
            };

            try {
                await setStorageItem('pending_free_challenge', JSON.stringify(challengeConfig));
                navigation.navigate('Auth', { mode: 'signup' });
            } catch (error: unknown) {
                logger.error('Error storing challenge config:', error);
                showError('Something went wrong. Please try again.');
            }
        }
    };

    const confirmCreateGoal = async () => {
        if (isSubmitting || submittingRef.current || goalCreatedRef.current || !state.user?.id) return;
        submittingRef.current = true;
        setIsSubmitting(true);

        try {
            const finalGoal = selectedGoal === 'Add your own' ? sanitizeText(customGoal.trim(), 50) : selectedGoal;
            const hoursNum = showCustomTime ? parseInt(hours || '0') : Math.floor(sessionMinutes / 60);
            const minutesNum = showCustomTime ? parseInt(minutes || '0') : sessionMinutes % 60;

            const now = new Date();
            const durationInDays = weeks * 7;
            const startRef = plannedStartDate > now ? plannedStartDate : now;
            const endDate = new Date(startRef);
            endDate.setDate(startRef.getDate() + durationInDays);

            const goalData: Omit<Goal, 'id'> & { sessionsPerWeek: number } = {
                userId: state.user.id,
                experienceGiftId: '',
                title: `Attend ${finalGoal} Sessions`,
                description: `Work on ${finalGoal} for ${weeks} weeks, ${sessionsPerWeek} times per week.`,
                targetCount: weeks,
                currentCount: 0,
                weeklyCount: 0,
                sessionsPerWeek,
                frequency: 'weekly',
                duration: durationInDays,
                startDate: now,
                endDate,
                weekStartAt: null,
                plannedStartDate: plannedStartDate,
                isActive: true,
                isCompleted: false,
                isRevealed: false,
                location: selectedExperience?.location || '',
                targetHours: hoursNum,
                targetMinutes: minutesNum,
                createdAt: now,
                weeklyLogDates: [],
                isFreeGoal: true,
                empoweredBy: state.user.id,
                approvalStatus: 'approved',
                initialTargetCount: weeks,
                initialSessionsPerWeek: sessionsPerWeek,
                approvalRequestedAt: now,
                approvalDeadline: now,
                giverActionTaken: true,
                ...(selectedExperience ? {
                    pledgedExperience: {
                        experienceId: selectedExperience.id,
                        title: selectedExperience.title || '',
                        subtitle: selectedExperience.subtitle || '',
                        description: selectedExperience.description || '',
                        category: selectedExperience.category || 'adventure',
                        price: selectedExperience.price ?? 0,
                        coverImageUrl: selectedExperience.coverImageUrl || '',
                        imageUrl: Array.isArray(selectedExperience.imageUrl) ? selectedExperience.imageUrl : [selectedExperience.imageUrl || ''],
                        partnerId: selectedExperience.partnerId || '',
                        location: selectedExperience.location || '',
                    },
                    pledgedAt: now,
                } : {}),
                ...(preferredRewardCategory && !selectedExperience ? { preferredRewardCategory } : {}),
                // Fitness-first: store goal type for venue/GPS verification
                goalType: selectedGoal === 'Gym' ? 'gym' as const
                    : selectedGoal === 'Yoga' ? 'yoga' as const
                        : selectedGoal === 'Dance' ? 'dance' as const
                            : 'custom' as const,
                // Payment commitment: only set when user chose "Pay on success" with a specific experience
                ...(paymentChoice === 'payLater' && selectedExperience ? { paymentCommitment: 'payOnCompletion' as const } : {}),
                ...(paymentChoice === 'payNow' && selectedExperience ? { paymentCommitment: 'paidUpfront' as const } : {}),
            };

            const goal = await goalService.createFreeGoal(goalData as Goal);
            if (!goal?.id) throw new Error('Goal creation returned no ID');
            dispatch({ type: 'SET_GOAL', payload: goal });

            setShowConfirm(false);
            goalCreatedRef.current = true; // Bypass beforeRemove guard

            // Route based on payment choice
            if (paymentChoice === 'payNow' && selectedExperience) {
                // "Lock it in" — pay now via ExperienceCheckout
                showSuccess('Challenge created! Complete payment to secure your reward.');
                setTimeout(() => {
                    navigation.replace('ExperienceCheckout', {
                        cartItems: [{
                            experienceId: selectedExperience.id,
                            quantity: 1,
                        }],
                        goalId: goal.id,
                    });
                }, 300);
            } else if (paymentChoice === 'payLater' && selectedExperience) {
                // "Pay on success" — goal created with paymentCommitment: 'payOnCompletion'.
                // At completion, the user will be prompted to purchase via ExperienceCheckout.
                // No card collection at setup (supports MB WAY and all payment methods at completion).
                showSuccess('Challenge created! You\'ll pay when you complete your goal.');
                setTimeout(() => {
                    navigation.reset({ index: 0, routes: [{ name: 'Goals' }] });
                }, 300);
            } else {
                // Free goal (category preference or skip) — go straight to Goals
                showSuccess('Challenge created!');
                setTimeout(() => {
                    try {
                        navigation.reset({
                            index: 0,
                            routes: [{ name: 'Goals' }],
                        });
                    } catch (navError: unknown) {
                        logger.warn('navigation.reset failed, using navigate fallback:', navError);
                        navigation.navigate('Goals');
                    }
                }, 300);
            }
        } catch (error: unknown) {
            logger.error('Error creating free goal:', error);
            await logErrorToFirestore(error, {
                screenName: 'ChallengeSetupScreen',
                feature: 'CreateFreeGoal',
                userId: state.user?.id,
            });
            const isLimitError = error instanceof Error && (
                error.message?.includes('3 active') ||
                (error as Error & { code?: string }).code === 'GOAL_LIMIT_REACHED'
            );
            showError(isLimitError
                ? 'You already have 3 active free goals. Complete or delete one first to start a new challenge.'
                : 'Failed to create goal. Please try again.');
        } finally {
            setIsSubmitting(false);
            // Only reset ref if goal wasn't created — prevents re-submission
            if (!goalCreatedRef.current) {
                submittingRef.current = false;
            }
        }
    };

    const finalGoalName = selectedGoal === 'Add your own' ? customGoal.trim() : selectedGoal;

    // ─── Step Content Renderers ──────────────────────────────────────
    const renderStep1 = () => (
        <View style={styles.stepContent}>
            <View style={styles.goalGrid}>
                {GOAL_TYPES.map((goal, i) => (
                    <MotiView
                        key={goal.name}
                        style={{ width: '47%' }}
                        from={{ opacity: 0, translateY: 20 }}
                        animate={{
                            opacity: 1,
                            translateY: 0,
                            scale: selectedGoal === goal.name ? 1.04 : 1,
                        }}
                        transition={{
                            opacity: { type: 'timing', duration: 300, delay: i * 80 },
                            translateY: { type: 'timing', duration: 300, delay: i * 80 },
                            scale: selectedGoal === goal.name
                                ? { type: 'spring', damping: 34, stiffness: 100 }
                                : { type: 'timing', duration: 100 },
                        }}
                    >
                        <TouchableOpacity
                            style={[
                                styles.goalChip,
                                selectedGoal === goal.name && { backgroundColor: goal.color, borderColor: goal.color },
                                validationErrors.goal && !selectedGoal && styles.goalChipError,
                            ]}
                            onPress={() => {
                                setSelectedGoal(goal.name);
                                setValidationErrors(prev => ({ ...prev, goal: false }));
                                if (goal.name !== 'Add your own') {
                                    setCustomGoal('');
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
                                selectedGoal === goal.name && styles.goalNameActive,
                            ]}>{goal.name}</Text>
                            <Text style={[
                                styles.goalTagline,
                                selectedGoal === goal.name && { color: colors.white + 'CC' },
                            ]}>{goal.tagline}</Text>
                        </TouchableOpacity>
                    </MotiView>
                ))}
            </View>

            {validationErrors.goal && (
                <Text style={{ color: colors.error, ...Typography.caption, marginTop: Spacing.md, fontWeight: '500' }}>
                    Please select a goal type
                </Text>
            )}

            {selectedGoal === 'Add your own' && (
                <View style={styles.customGoalContainer}>
                    <TextInput
                        label="Enter your custom goal:"
                        placeholder="e.g., Cook, Paint, Write..."
                        value={customGoal}
                        onChangeText={(text) => {
                            setCustomGoal(text);
                            if (validationErrors.goal && text.trim()) {
                                setValidationErrors(prev => ({ ...prev, goal: false }));
                            }
                        }}
                        maxLength={50}
                        autoFocus
                        accessibilityLabel="Custom goal name"

                        containerStyle={{ marginBottom: 0 }}
                    />
                    {validationErrors.goal && customGoal.trim() === '' && (
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

    // ─── Time Step (Clock Dial) ─────────────────────────────────────
    const DIAL_SIZE = vh(250);
    const DIAL_RADIUS = DIAL_SIZE / 2;
    const DIAL_STROKE = 8;
    const HANDLE_RADIUS = 14;

    // Animate displayMinutes toward sessionMinutes smoothly
    const snapToPreset = (target: number) => {
        setSessionMinutes(target);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        const start = displayMinutes;
        const diff = target - start;
        const duration = 350;
        const startTime = performance.now();
        const step = (now: number) => {
            const t = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
            setDisplayMinutes(Math.round(start + diff * eased));
            if (t < 1) animFrameRef.current = requestAnimationFrame(step);
        };
        animFrameRef.current = requestAnimationFrame(step);
    };

    const renderTimeStep = () => {
        // Use displayMinutes for visual rendering (animated), sessionMinutes for form state
        const visMinutes = displayMinutes;
        const angle = (visMinutes / 60) * 360;
        const angleRad = ((angle - 90) * Math.PI) / 180;
        const arcRadius = DIAL_RADIUS - 20;
        const handleX = DIAL_RADIUS + arcRadius * Math.cos(angleRad);
        const handleY = DIAL_RADIUS + arcRadius * Math.sin(angleRad);

        // Arc path for filled portion
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
            setDisplayMinutes(clamped); // direct set on drag, no animation
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
                >
                    <Text style={{
                        ...Typography.body,
                        color: colors.primary,
                        fontWeight: '600',
                    }}>
                        {showCustomTime ? 'Use the dial' : 'Or enter a custom time \u203A'}
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

    // Inline calendar state
    const [calendarMonth, setCalendarMonth] = useState(new Date(plannedStartDate.getFullYear(), plannedStartDate.getMonth(), 1));

    const calendarMonthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
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

    const endDate = new Date(plannedStartDate);
    endDate.setDate(endDate.getDate() + weeks * 7);

    const renderStep3 = () => {
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
                        {/* Month navigation */}
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

                        {/* Week day headers */}
                        <View style={styles.calWeekRow}>
                            {calendarWeekDays.map((day) => (
                                <Text key={day} style={styles.calWeekDay}>{day}</Text>
                            ))}
                        </View>

                        {/* Day grid */}
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

                    {/* End date info */}
                    <View style={styles.endDateContainer}>
                        <Text style={styles.endDateLabel}>You will finish your goal on</Text>
                        <Text style={styles.endDateValue}>
                            {endDate.toLocaleDateString('en-US', {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
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

    const getExperiencesForCategory = (catKey: string, matchList?: string[]) => {
        return experiences.filter(exp => {
            if (!exp.category) return false;
            const expCat = exp.category.toLowerCase().trim();
            if (matchList) return matchList.some(m => expCat === m || expCat.includes(m));
            return expCat === catKey || expCat.includes(catKey);
        });
    };

    const renderExperienceCard = (exp: Experience) => {
        const isSelected = selectedExperience?.id === exp.id;
        return (
            <TouchableOpacity
                key={exp.id}
                style={[styles.expCard, isSelected && styles.expCardActive]}
                onPress={() => {
                    setSelectedExperience(exp);
                    setPreferredRewardCategory(null);
                    setValidationErrors(prev => ({ ...prev, experience: false }));
                }}
                accessibilityRole="button"
                accessibilityLabel={`Select ${exp.title} experience, ${exp.price} euros`}
            >
                <View style={styles.expIconBox}>
                    <Image
                        source={{ uri: exp.coverImageUrl }}
                        style={styles.expImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        accessibilityLabel={exp.title}
                    />
                </View>
                <TouchableOpacity
                    style={styles.expInfoButton}
                    onPress={() => setDetailExperience(exp)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`View details for ${exp.title}`}
                >
                    <Info size={14} color={colors.white} />
                </TouchableOpacity>
                <View style={styles.expTextContainer}>
                    <Text style={[styles.expTitle, isSelected && styles.expTitleActive]} numberOfLines={2}>{exp.title}</Text>
                    <View style={styles.expMeta}>
                        {exp.price > 0 && <Text style={styles.expPrice}>{'\u20AC'}{exp.price}</Text>}
                        {exp.location && <Text style={styles.expLocation} numberOfLines={1}>{exp.location}</Text>}
                    </View>
                </View>
                {isSelected && (
                    <View style={styles.checkBadge}><Check color={colors.white} size={12} strokeWidth={3} /></View>
                )}
            </TouchableOpacity>
        );
    };

    const renderStep4 = () => {
        // Browse mode: show the experience catalog
        if (showExperiencePicker) {
            const visibleCategories = selectedCategory === 'All'
                ? EXPERIENCE_CATEGORIES
                : EXPERIENCE_CATEGORIES.filter(cat => cat.key === selectedCategory);

            return (
                <View style={styles.stepContent}>
                    {/* Back to category cards */}
                    <TouchableOpacity
                        style={styles.browseBackButton}
                        onPress={() => {
                            setShowExperiencePicker(false);
                            setSelectedExperience(null);
                            setPaymentChoice('payNow');
                            setValidationErrors(prev => ({ ...prev, experience: false }));
                        }}
                        activeOpacity={0.7}
                    >
                        <ChevronLeft color={colors.primary} size={18} strokeWidth={2.5} />
                        <Text style={styles.browseBackText}>Back to categories</Text>
                    </TouchableOpacity>

                    {/* Category filter chips */}
                    <View style={styles.sectionHeaderRow}>
                        <View style={styles.filterScrollContainer}>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.filterScroll}
                                contentContainerStyle={styles.filterScrollContent}
                                onScroll={(e) => {
                                    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                                    const atEnd = contentOffset.x + layoutMeasurement.width >= contentSize.width - 10;
                                    if (showFilterScrollHint === atEnd) setShowFilterScrollHint(!atEnd);
                                }}
                                scrollEventThrottle={100}
                            >
                                {[{ key: 'All', label: 'All', emoji: '' }, ...EXPERIENCE_CATEGORIES].map((cat) => {
                                    const isActive = selectedCategory === cat.key;
                                    return (
                                        <TouchableOpacity
                                            key={cat.key}
                                            onPress={() => setSelectedCategory(cat.key)}
                                            style={[
                                                styles.filterChip,
                                                isActive && styles.filterChipActive,
                                            ]}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Filter by ${cat.label}`}
                                        >
                                            <Text style={[
                                                styles.filterText,
                                                isActive && styles.filterTextActive,
                                            ]}>{cat.emoji ? `${cat.emoji} ` : ''}{cat.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                            {showFilterScrollHint && (
                                <View style={styles.categoryFadeIndicator} pointerEvents="none">
                                    <View style={styles.categoryGradient} />
                                    <ChevronRight color={colors.textMuted} size={14} />
                                </View>
                            )}
                        </View>
                    </View>

                    {loadingExperiences ? (
                        <View style={{ marginVertical: Spacing.xl, gap: Spacing.md }}>
                            <SkeletonBox width="100%" height={60} borderRadius={12} />
                            <SkeletonBox width="100%" height={60} borderRadius={12} />
                            <SkeletonBox width="100%" height={60} borderRadius={12} />
                        </View>
                    ) : (
                        <View style={styles.stackedCategories}>
                            {visibleCategories.map((cat) => {
                                const catExperiences = getExperiencesForCategory(cat.key, cat.match);
                                if (catExperiences.length === 0) return null;

                                return (
                                    <MotiView
                                        key={cat.key}
                                        from={{ opacity: 0, translateY: 12 }}
                                        animate={{ opacity: 1, translateY: 0 }}
                                        transition={{ type: 'timing', duration: 300 }}
                                        style={styles.categorySection}
                                    >
                                        <View style={styles.categorySectionHeader}>
                                            <Text style={styles.categorySectionEmoji}>{cat.emoji}</Text>
                                            <Text style={styles.categorySectionTitle}>{cat.label}</Text>
                                            <View style={[styles.categorySectionBadge, { backgroundColor: cat.color + '20' }]}>
                                                <Text style={[styles.categorySectionCount, { color: cat.color }]}>{catExperiences.length}</Text>
                                            </View>
                                        </View>
                                        <ScrollView
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            style={styles.cardScroll}
                                            contentContainerStyle={{ paddingRight: Spacing.lg }}
                                        >
                                            {catExperiences.map((exp) => {
                                                const isSelected = selectedExperience?.id === exp.id;
                                                return (
                                                    <TouchableOpacity
                                                        key={exp.id}
                                                        style={[styles.expCard, isSelected && styles.expCardActive]}
                                                        onPress={() => {
                                                            setSelectedExperience(exp);
                                                            setPreferredRewardCategory(null);
                                                            setValidationErrors(prev => ({ ...prev, experience: false }));
                                                        }}
                                                        accessibilityRole="button"
                                                        accessibilityLabel={`Select ${exp.title} experience, ${exp.price} euros`}
                                                    >
                                                        <View style={styles.expIconBox}>
                                                            <Image
                                                                source={{ uri: exp.coverImageUrl }}
                                                                style={styles.expImage}
                                                                contentFit="cover"
                                                                cachePolicy="memory-disk"
                                                                accessibilityLabel={exp.title}
                                                            />
                                                        </View>
                                                        <TouchableOpacity
                                                            style={styles.expInfoButton}
                                                            onPress={() => setDetailExperience(exp)}
                                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                            accessibilityRole="button"
                                                            accessibilityLabel={`View details for ${exp.title}`}
                                                        >
                                                            <Info size={14} color={colors.white} />
                                                        </TouchableOpacity>
                                                        <View style={styles.expTextContainer}>
                                                            <Text style={[styles.expTitle, isSelected && styles.expTitleActive]} numberOfLines={2}>{exp.title}</Text>
                                                            <View style={styles.expMeta}>
                                                                {exp.price > 0 && <Text style={styles.expPrice}>{'\u20AC'}{exp.price}</Text>}
                                                                {exp.location && <Text style={styles.expLocation} numberOfLines={1}>{exp.location}</Text>}
                                                            </View>
                                                        </View>
                                                        {isSelected && (
                                                            <View style={styles.checkBadge}><Check color={colors.white} size={12} strokeWidth={3} /></View>
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </ScrollView>
                                    </MotiView>
                                );
                            })}
                        </View>
                    )}
                </View>
            );
        }

        // Default view: category preference cards (derived from shared EXPERIENCE_CATEGORIES constant)
        const CATEGORY_TAGLINES: Record<string, string> = {
            adventure: 'Explore something new',
            wellness: 'Treat yourself',
            creative: 'Make something amazing',
        };
        const CATEGORY_CARDS: { key: ExperienceCategory; emoji: string; label: string; tagline: string; color: string }[] =
            EXPERIENCE_CATEGORIES.map(cat => ({
                key: cat.key as ExperienceCategory,
                emoji: cat.emoji,
                label: cat.label,
                tagline: CATEGORY_TAGLINES[cat.key] ?? '',
                color: cat.color,
            }));

        return (
            <View style={styles.stepContent}>
                {validationErrors.experience && (
                    <View style={styles.errorBanner}>
                        <Text style={styles.errorText}>Please pick a reward option</Text>
                    </View>
                )}

                {/* Equal fork: Browse experiences (prominent button) */}
                <MotiView
                    from={{ opacity: 0, translateY: 16 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{ type: 'timing', duration: 300 }}
                >
                    <TouchableOpacity
                        style={[
                            styles.rewardCategoryCard,
                            selectedExperience && { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primary + '08' },
                        ]}
                        onPress={() => setShowExperiencePicker(true)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Choose your experience"
                    >
                        <RNImage source={require('../assets/icon.png')} style={{ width: 36, height: 36, marginRight: Spacing.lg }} resizeMode="contain" accessible={false} />
                        <View style={{ flex: 1 }}>
                            <Text style={[
                                styles.rewardCategoryLabel,
                                selectedExperience && { color: colors.primary },
                            ]}>{selectedExperience ? selectedExperience.title : 'Browse experiences'}</Text>
                            <Text style={styles.rewardCategoryTagline}>
                                {selectedExperience ? `\u20AC${selectedExperience.price}` : 'Pick a reward to earn'}
                            </Text>
                        </View>
                        {selectedExperience ? (
                            <View style={[styles.rewardCategoryCheck, { backgroundColor: colors.primary }]}>
                                <Check color={colors.white} size={14} strokeWidth={3} />
                            </View>
                        ) : (
                            <ChevronRight color={colors.primary} size={20} strokeWidth={2} />
                        )}
                    </TouchableOpacity>
                </MotiView>

                {/* Divider with "or" */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.md }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                    <Text style={{ paddingHorizontal: Spacing.md, color: colors.textMuted, ...Typography.small }}>or let us surprise you</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                </View>

                {/* Category cards */}
                {CATEGORY_CARDS.map((cat, index) => {
                    const isActive = preferredRewardCategory === cat.key && !selectedExperience;
                    return (
                        <MotiView
                            key={cat.key}
                            from={{ opacity: 0, translateY: 16 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 300, delay: (index + 1) * 80 }}
                        >
                            <TouchableOpacity
                                style={[
                                    styles.rewardCategoryCard,
                                    isActive && { borderColor: cat.color, borderWidth: 2, backgroundColor: cat.color + '08' },
                                ]}
                                onPress={() => {
                                    setPreferredRewardCategory(cat.key);
                                    setSelectedExperience(null);
                                    setPaymentChoice('free');
                                    setValidationErrors(prev => ({ ...prev, experience: false }));
                                }}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityLabel={`Select ${cat.label} reward category`}
                            >
                                <Text style={styles.rewardCategoryEmoji}>{cat.emoji}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={[
                                        styles.rewardCategoryLabel,
                                        isActive && { color: cat.color },
                                    ]}>{cat.label}</Text>
                                    <Text style={styles.rewardCategoryTagline}>{cat.tagline}</Text>
                                </View>
                                {isActive && (
                                    <View style={[styles.rewardCategoryCheck, { backgroundColor: cat.color }]}>
                                        <Check color={colors.white} size={14} strokeWidth={3} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        </MotiView>
                    );
                })}

            </View>
        );
    };

    const renderStep5 = () => (
        <View style={styles.stepContent}>
            {/* Option A: Lock it in (pay now) — default */}
            <TouchableOpacity
                style={[styles.rewardChoice, paymentChoice === 'payNow' && styles.rewardChoiceActive]}
                onPress={() => setPaymentChoice('payNow')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Lock it in, pay now"
            >
                <View style={styles.rewardChoiceHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.rewardChoiceTitle, paymentChoice === 'payNow' && styles.rewardChoiceTitleActive]}>Lock it in</Text>
                        <Text style={styles.rewardChoiceDesc}>
                            Pay now and secure your reward. Studies show you're ~30% more likely to complete your challenge when you've invested upfront.
                        </Text>
                        <View style={styles.revealBadge}>
                            <Text style={[styles.revealBadgeText, { color: colors.warning }]}>Recommended</Text>
                        </View>
                    </View>
                    {paymentChoice === 'payNow' && (
                        <View style={styles.rewardChoiceCheck}><Check color={colors.white} size={14} strokeWidth={3} /></View>
                    )}
                </View>
            </TouchableOpacity>

            {/* Option B: Pay on success (save card for later) */}
            <TouchableOpacity
                style={[styles.rewardChoice, paymentChoice === 'payLater' && styles.rewardChoiceActive]}
                onPress={() => setPaymentChoice('payLater')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Pay on success"
            >
                <View style={styles.rewardChoiceHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.rewardChoiceTitle, paymentChoice === 'payLater' && styles.rewardChoiceTitleActive]}>Pay on success</Text>
                        <Text style={styles.rewardChoiceDesc}>
                            Save your payment method now. Only charged when you complete the challenge. Zero risk.
                        </Text>
                    </View>
                    {paymentChoice === 'payLater' && (
                        <View style={styles.rewardChoiceCheck}><Check color={colors.white} size={14} strokeWidth={3} /></View>
                    )}
                </View>
            </TouchableOpacity>

            {/* Motivational stat */}
            <View style={styles.statCard}>
                <Text style={styles.statNumber}>Invest in your success.</Text>
                <Text style={styles.statText}>
                    Having a reward waiting at the finish line taps into human psychology. You are hardwired to finish the challenge when there is something to gain.
                </Text>
            </View>
        </View>
    );

    const renderCurrentStep = () => {
        switch (currentStep) {
            case 1: return renderStep1();
            case 2: return renderStep2();
            case 3: return renderTimeStep();
            case 4: return renderStep3();
            case 5: return renderStep4();
            case 6: return renderStep5();
            default: return null;
        }
    };

    const userId = state.user?.id || '';

    return (
        <ErrorBoundary screenName="ChallengeSetupScreen" userId={userId}>
            <View style={styles.container}>
                <StatusBar style="auto" />

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={handleBack}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                    >
                        <ChevronLeft color={colors.textPrimary} size={24} strokeWidth={2.5} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Create Your Challenge</Text>
                    <View style={styles.stepIndicator}>
                        <Text style={styles.stepIndicatorText}>{currentStep}/{totalSteps}</Text>
                    </View>
                </View>

                {/* Progress Bar */}
                <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />

                {/* Step Content */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
                    <ScrollView
                        ref={scrollViewRef}
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* Step Title & Subtitle */}
                        <MotiView
                            key={`title-${currentStep}`}
                            from={{ opacity: 0, translateY: 10 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 300 }}
                        >
                            <Text style={styles.stepTitle}>{STEP_TITLES[currentStep - 1]}</Text>
                            <Text style={styles.stepSubtitle}>{STEP_SUBTITLES[currentStep - 1]}</Text>
                        </MotiView>

                        {/* Animated Step Content */}
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
                </KeyboardAvoidingView>

                {/* Footer */}
                <View style={styles.footer}>
                    {/* Preview card on final step */}
                    {currentStep >= 5 && selectedExperience && (
                        <MotiView
                            from={{ opacity: 0, translateY: 10 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'spring', damping: 22, stiffness: 180 }}
                        >
                            <View style={styles.footerHeroCard}>
                                <View style={styles.footerHeroRow}>
                                    <View style={styles.heroIconBox}>
                                        <Image
                                            source={{ uri: selectedExperience.coverImageUrl }}
                                            style={styles.heroImage}
                                            contentFit="cover"
                                            cachePolicy="memory-disk"
                                            accessibilityLabel={selectedExperience.title}
                                        />
                                    </View>
                                    <View style={styles.heroInfo}>
                                        <Text style={styles.footerHeroTitle} numberOfLines={1}>
                                            {selectedExperience.title}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => setDetailExperience(selectedExperience)}
                                        style={styles.heroDetailsButton}
                                        accessibilityRole="button"
                                        accessibilityLabel="View experience details"
                                    >
                                        <Text style={styles.heroDetailsText}>View details</Text>
                                    </TouchableOpacity>
                                </View>

                                {selectedGoal && (
                                    <View style={styles.heroContextRow}>
                                        <View style={styles.contextBadge}>
                                            <Text style={styles.contextEmoji}>
                                                {selectedGoal === 'Gym' ? '🏋️' : selectedGoal === 'Yoga' ? '🧘' : selectedGoal === 'Dance' ? '💃' : selectedGoal === 'Run' ? '🏃' : selectedGoal === 'Read' ? '📚' : selectedGoal === 'Walk' ? '🚶' : '✨'}
                                            </Text>
                                            <Text style={styles.contextText}>{selectedGoal === 'Add your own' ? (customGoal.trim() || 'Custom') : selectedGoal}</Text>
                                        </View>
                                        <View style={styles.contextDivider} />
                                        <View style={styles.contextBadge}>
                                            <Text style={styles.contextLabel}>{weeks} {weeks === 1 ? 'week' : 'weeks'}</Text>
                                        </View>
                                        <View style={styles.contextDivider} />
                                        <View style={styles.contextBadge}>
                                            <Text style={styles.contextLabel}>{sessionsPerWeek}x/wk</Text>
                                        </View>
                                    </View>
                                )}
                            </View>
                        </MotiView>
                    )}

                    {/* CTA Button */}
                    {currentStep === totalSteps ? (
                        <TouchableOpacity
                            style={styles.createButton}
                            onPress={handleCreate}
                            activeOpacity={0.9}
                            accessibilityRole="button"
                            accessibilityLabel={state.user?.id ? 'Create challenge' : 'Sign up and create challenge'}
                        >
                            <LinearGradient colors={colors.gradientDark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createButtonGradient}>
                                <Text style={styles.createButtonText}>
                                    {state.user?.id ? 'Create Challenge' : 'Sign Up & Create Challenge'}
                                </Text>
                                <ChevronRight color={colors.white} size={20} strokeWidth={3} />
                            </LinearGradient>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={styles.createButton}
                            onPress={handleNext}
                            activeOpacity={0.9}
                            accessibilityRole="button"
                            accessibilityLabel="Continue to next step"
                        >
                            <LinearGradient colors={colors.gradientDark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createButtonGradient}>
                                <Text style={styles.createButtonText}>Next</Text>
                                <ChevronRight color={colors.white} size={20} strokeWidth={3} />
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Confirmation Modal */}
                <BaseModal
                    visible={showConfirm}
                    onClose={() => setShowConfirm(false)}
                    title="Confirm Your Challenge"
                    variant="center"
                >
                    <View style={{ width: '100%', alignItems: 'center' }}>
                        <Text style={styles.modalSubtitle}>
                            Ready to commit? Let's do this!
                        </Text>

                        <View style={styles.modalDetails}>
                            <Text style={styles.modalRow}>
                                <Text style={styles.modalLabel}>Goal: </Text>
                                {finalGoalName}
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
                            {selectedExperience && (
                                <Text style={styles.modalRow}>
                                    <Text style={styles.modalLabel}>Dream reward: </Text>
                                    {selectedExperience.title}
                                </Text>
                            )}
                            {!selectedExperience && preferredRewardCategory && (
                                <Text style={styles.modalRow}>
                                    <Text style={styles.modalLabel}>Reward preference: </Text>
                                    {preferredRewardCategory.charAt(0).toUpperCase() + preferredRewardCategory.slice(1)}
                                </Text>
                            )}
                        </View>

                        {selectedExperience && (
                            <Text style={styles.modalRow}>
                                <Text style={styles.modalLabel}>Payment: </Text>
                                {paymentChoice === 'payNow' ? 'Pay now (locked in)' : 'Pay on success'}
                            </Text>
                        )}

                        <Text style={styles.pledgeNote}>
                            {selectedExperience && paymentChoice === 'payNow'
                                ? 'You\'ll complete payment next to secure your reward.'
                                : selectedExperience && paymentChoice === 'payLater'
                                    ? 'You\'ll save your payment method next. Only charged when you finish.'
                                    : preferredRewardCategory
                                        ? 'We\'ll find the perfect reward for you as you make progress!'
                                        : 'You can always add a reward later.'
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
                                    title={selectedExperience && paymentChoice === 'payNow' ? 'Create & Pay' : 'Let\'s Go!'}
                                    fullWidth
                                    style={styles.modalButton}
                                />
                            </Animated.View>
                        </View>
                    </View>
                </BaseModal>

                {/* Experience Detail Modal */}
                <ExperienceDetailModal
                    visible={!!detailExperience}
                    experience={detailExperience}
                    onClose={() => setDetailExperience(null)}
                    onSelect={(exp) => {
                        setSelectedExperience(exp);
                        setPreferredRewardCategory(null);
                        setValidationErrors(prev => ({ ...prev, experience: false }));
                    }}
                    isSelected={selectedExperience?.id === detailExperience?.id}
                />
            </View>
        </ErrorBoundary>
    );
}


const createStyles = (colors: typeof Colors, screenWidth: number = 375) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.surface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? vh(56) : vh(40),
        paddingBottom: vh(14),
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
        color: colors.gray800,
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

    // Step content
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
        color: colors.gray800,
        marginBottom: vh(8),
    },
    stepSubtitle: {
        ...Typography.body,
        color: colors.textSecondary,
        marginBottom: vh(24),
    },
    stepContent: {
        // Wrapper for step-specific content
    },
    section: {
        marginBottom: Spacing.xl,
    },

    // Error
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
        ...Typography.smallBold,
        color: colors.error,
    },

    // Goal chips
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
        color: colors.gray800,
        marginTop: Spacing.sm,
        textAlign: 'center' as const,
    },
    goalNameActive: {
        color: colors.white,
    },
    goalTagline: {
        ...Typography.caption,
        color: colors.textMuted,
        textAlign: 'center' as const,
        marginTop: Spacing.xxs,
    },
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
    customGoalContainer: {
        marginTop: Spacing.xl,
    },
    customGoalIcon: {
        ...Typography.large,
        marginRight: Spacing.sm,
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
        color: colors.gray800,
    },
    timeLabel: {
        ...Typography.bodyBold,
        color: colors.textSecondary,
    },

    // Experience cards
    expCard: {
        backgroundColor: colors.white,
        borderWidth: 2,
        borderColor: colors.border,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginRight: Spacing.md,
        width: 150,
        alignItems: 'center',
        position: 'relative',
    },
    expCardActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primarySurface,
    },
    expIconBox: {
        width: '100%',
        height: vh(100),
        borderRadius: BorderRadius.lg,
        backgroundColor: colors.backgroundLight,
        overflow: 'hidden',
        marginBottom: Spacing.sm,
    },
    expInfoButton: {
        position: 'absolute',
        top: Spacing.md + 4,
        left: Spacing.md + 4,
        width: 26,
        height: 26,
        borderRadius: BorderRadius.circle,
        backgroundColor: colors.overlay,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    expImage: {
        width: '100%',
        height: '100%',
    },
    expTextContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    expTitle: {
        ...Typography.caption,
        fontWeight: '700',
        color: colors.textSecondary,
        textAlign: 'center',
    },
    expTitleActive: {
        color: colors.primary,
    },
    expMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        marginTop: Spacing.xs,
    },
    expPrice: {
        ...Typography.captionBold,
        color: colors.primary,
    },
    expLocation: {
        ...Typography.tiny,
        color: colors.textMuted,
        flex: 1,
    },
    viewDetailsBtn: {
        backgroundColor: colors.primary,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.sm,
        marginTop: Spacing.sm,
    },
    viewDetailsBtnText: {
        ...Typography.tiny,
        color: colors.white,
    },
    checkBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 20,
        height: 20,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Footer
    footer: {
        position: 'absolute',
        bottom: 0,
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
    createButton: {
        borderRadius: BorderRadius.lg,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    createButtonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.xl,
        borderRadius: BorderRadius.lg,
    },
    createButtonText: {
        ...Typography.subheading,
        fontWeight: '700',
        color: colors.white,
    },

    // Footer hero card
    footerHeroCard: {
        backgroundColor: colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: colors.backgroundLight,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    footerHeroRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    heroIconBox: {
        width: 56,
        height: 56,
        borderRadius: BorderRadius.lg,
        backgroundColor: colors.backgroundLight,
        overflow: 'hidden',
    },
    heroImage: {
        width: '100%',
        height: '100%',
    },
    heroInfo: {
        flex: 1,
        marginLeft: Spacing.lg,
    },
    heroDetailsButton: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
    },
    heroDetailsText: {
        ...Typography.caption,
        fontWeight: '600',
        color: colors.primary,
    },
    footerHeroTitle: {
        ...Typography.subheading,
        fontWeight: '800',
        color: colors.gray800,
        marginBottom: Spacing.xxs,
    },

    heroContextRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: BorderRadius.sm,
        padding: Spacing.sm,
        marginTop: Spacing.sm,
        justifyContent: 'space-between',
    },
    contextBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    contextEmoji: {
        ...Typography.small,
    },
    contextText: {
        ...Typography.caption,
        fontWeight: '700',
        color: colors.gray600,
    },
    contextDivider: {
        width: 1,
        height: 16,
        backgroundColor: colors.border,
    },
    contextLabel: {
        ...Typography.caption,
        fontWeight: '600',
        color: colors.textSecondary,
    },

    // Modal
    modalBox: {
        backgroundColor: colors.white,
        borderRadius: BorderRadius.xl,
        width: '90%',
        maxWidth: Math.min(360, screenWidth - 40),
        paddingVertical: Spacing.xxl,
        paddingHorizontal: Spacing.xl,
        ...Shadows.md,
        shadowColor: colors.black,
        shadowOpacity: 0.15,
        alignItems: 'center',
    },
    modalTitle: {
        ...Typography.large,
        color: colors.primaryDeep,
        marginBottom: Spacing.sm,
    },
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
        color: colors.gray700,
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
    cancelButton: {
        backgroundColor: colors.backgroundLight,
    },
    confirmButton: {
        backgroundColor: colors.primary,
    },
    cancelText: {
        ...Typography.subheading,
        color: colors.gray700,
    },
    confirmText: {
        ...Typography.subheading,
        color: colors.white,
    },

    // Carousel filter chips
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    filterScrollContainer: {
        position: 'relative',
        flex: 1,
    },
    filterScrollContent: {
        paddingRight: 28,
    },
    filterScroll: {
        flexGrow: 0,
    },
    filterChip: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.xl,
        backgroundColor: colors.backgroundLight,
        marginLeft: Spacing.xs,
    },
    filterChipActive: {
        backgroundColor: colors.gray800,
    },
    filterText: {
        ...Typography.captionBold,
        color: colors.textSecondary,
    },
    filterTextActive: {
        color: colors.white,
    },
    categoryFadeIndicator: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 40,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    categoryGradient: {
        position: 'absolute',
        left: -12,
        top: 0,
        bottom: 0,
        width: 52,
        backgroundColor: colors.surfaceFrosted92,
    },
    cardScroll: {
        marginTop: Spacing.xs,
    },

    // Stacked category sections
    stackedCategories: {
        gap: Spacing.xxl,
    },
    categorySection: {
        marginBottom: 0,
    },
    categorySectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.sm,
        gap: Spacing.sm,
    },
    categorySectionEmoji: {
        ...Typography.large,
    },
    categorySectionTitle: {
        ...Typography.subheading,
        color: colors.gray800,
        flex: 1,
    },
    categorySectionBadge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xxs,
        borderRadius: BorderRadius.sm,
    },
    categorySectionCount: {
        ...Typography.captionBold,
    },

    // Inline calendar
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
        color: colors.gray700,
    },
    calWeekRow: {
        flexDirection: 'row',
        marginBottom: Spacing.sm,
    },
    calWeekDay: {
        ...Typography.captionBold,
        flex: 1,
        textAlign: 'center',
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
        color: colors.gray700,
        fontWeight: '500',
    },
    calDisabledText: {
        color: colors.gray300,
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

    // Step 5: Secure your reward
    statCard: {
        backgroundColor: colors.successLighter,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: vh(20),
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.successBorder,
        marginTop: vh(16),
        marginBottom: 0,
    },
    statNumber: {
        ...Typography.heading2,
        fontWeight: '800',
        color: colors.primary,
        marginBottom: Spacing.xxs,
    },
    statText: {
        ...Typography.caption,
        color: colors.gray700,
        textAlign: 'center',
    },
    statSource: {
        ...Typography.caption,
        color: colors.textMuted,
        fontStyle: 'italic',
        marginTop: Spacing.xs,
    },
    expPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.xl,
        borderWidth: 1,
        borderColor: colors.border,
        gap: Spacing.md,
    },
    expPreviewImage: {
        width: 48,
        height: 48,
        borderRadius: BorderRadius.sm,
    },
    expPreviewInfo: {
        flex: 1,
    },
    expPreviewTitle: {
        ...Typography.smallBold,
        color: colors.gray800,
    },
    expPreviewMeta: {
        ...Typography.caption,
        color: colors.textSecondary,
        marginTop: Spacing.xxs,
    },
    rewardChoice: {
        backgroundColor: colors.white,
        borderRadius: BorderRadius.lg,
        paddingHorizontal: Spacing.lg,
        paddingVertical: vh(16),
        borderWidth: 2,
        borderColor: colors.border,
        marginBottom: vh(10),
    },
    rewardChoiceActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primarySurface,
    },
    rewardChoiceHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    rewardChoiceIcon: {
        ...Typography.display,
    },
    rewardChoiceTitle: {
        ...Typography.subheading,
        color: colors.gray800,
        marginBottom: Spacing.xxs,
    },
    rewardChoiceTitleActive: {
        color: colors.primary,
    },
    rewardChoiceDesc: {
        ...Typography.caption,
        color: colors.textSecondary,
        lineHeight: 18,
    },
    rewardChoiceCheck: {
        width: 24,
        height: 24,
        borderRadius: BorderRadius.md,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rewardChoiceNote: {
        ...Typography.caption,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: Spacing.xs,
        fontStyle: 'italic',
    },
    revealBadge: {
        alignSelf: 'flex-start',
        backgroundColor: colors.categoryAmber + '20',
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xxs,
        marginTop: Spacing.xs,
    },
    revealBadgeText: {
        ...Typography.tiny,
        color: colors.categoryAmber,
        fontWeight: '700',
    },

    // Step 4: Category preference cards
    rewardCategoryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.white,
        borderRadius: BorderRadius.lg,
        paddingHorizontal: Spacing.xl,
        paddingVertical: vh(16),
        marginBottom: Spacing.md,
        borderWidth: 1.5,
        borderColor: colors.backgroundLight,
        ...Shadows.sm,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
    },
    rewardCategoryEmoji: {
        ...Typography.display,
        marginRight: Spacing.lg,
    },
    rewardCategoryLabel: {
        ...Typography.subheading,
        fontWeight: '700',
        color: colors.gray800,
        marginBottom: Spacing.xxs,
    },
    rewardCategoryTagline: {
        ...Typography.small,
        color: colors.textSecondary,
    },
    rewardCategoryCheck: {
        width: 26,
        height: 26,
        borderRadius: BorderRadius.md,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: Spacing.md,
    },
    browseLink: {
        alignItems: 'center',
        marginTop: Spacing.xxl,
        paddingVertical: Spacing.md,
    },
    browseLinkText: {
        ...Typography.caption,
        color: colors.textMuted,
        marginBottom: Spacing.xs,
    },
    browseLinkAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    browseLinkActionText: {
        ...Typography.smallBold,
        color: colors.primary,
    },
    browseBackButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
        gap: Spacing.xs,
    },
    browseBackText: {
        ...Typography.smallBold,
        color: colors.primary,
    },
});
