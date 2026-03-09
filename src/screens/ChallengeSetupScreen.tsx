import React, { useState, useEffect, useRef } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SkeletonBox } from '../components/SkeletonLoader';
import Colors from '../config/colors';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Dimensions,
    Platform,
    TextInput,
    Image,
    Animated,
    Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react-native';
import { MotiView, AnimatePresence } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { RootStackParamList, Experience, Goal, ExperienceCategory } from '../types';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { goalService } from '../services/GoalService';
import { commonStyles } from '../styles/commonStyles';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';

const { width } = Dimensions.get('window');

const GOAL_TYPES = [
    { icon: '\u{1F3CB}\u{FE0F}', name: 'Gym', color: Colors.secondary },
    { icon: '\u{1F9D8}', name: 'Yoga', color: '#EC4899' },
    { icon: '\u{1F3C3}', name: 'Run', color: Colors.accent },
    { icon: '\u{1F4DA}', name: 'Read', color: '#F59E0B' },
    { icon: '\u{1F6B6}', name: 'Walk', color: '#10B981' },
    { icon: '\u2728', name: 'Other', color: Colors.textSecondary },
];

const STEP_TITLES = [
    'What is your goal?',
    'Set your challenge intensity',
    'When do you start?',
    'What kind of reward excites you?',
    'Secure your reward',
];

const STEP_SUBTITLES = [
    'Pick the habit you want to build. We\'ll help you stay on track.',
    'It takes 21 days to build a habit. Start small, you can always do another challenge later!',
    'We\'ll send you reminders so you never miss a session.',
    'Pick a category. We\'ll recommend the perfect reward as you progress!',
    'Studies show that buying a reward you can only claim at the end can increase your chances of success by ~30%.',
];

const EXPERIENCE_CATEGORIES = [
    { key: 'adventure', label: 'Adventure', emoji: '\u{1F3D4}\u{FE0F}', color: '#F59E0B', match: ['adventure'] },
    { key: 'wellness', label: 'Wellness', emoji: '\u{1F9D8}', color: '#EC4899', match: ['relaxation', 'spa', 'health', 'wellness'] },
    { key: 'creative', label: 'Creative', emoji: '\u{1F3A8}', color: '#8B5CF6', match: ['culture', 'arts', 'creative', 'workshop', 'food-culture'] },
];

// Storage helpers (cross-platform)
const setStorageItem = async (key: string, value: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        localStorage.setItem(key, value);
    } else {
        await AsyncStorage.setItem(key, value);
    }
};

// ModernSlider
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
    const progress = ((currentStep) / totalSteps) * 100;
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

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ChallengeSetup'>;

export default function ChallengeSetupScreen() {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute();
    const routeParams = route.params as { prefill?: any } | undefined;
    const { state, dispatch } = useApp();
    const { showError } = useToast();

    // Wizard step
    const [currentStep, setCurrentStep] = useState(1);

    // Goal config
    const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
    const [customGoal, setCustomGoal] = useState('');
    const [weeks, setWeeks] = useState(3);
    const [sessionsPerWeek, setSessionsPerWeek] = useState(3);
    const [hours, setHours] = useState('');
    const [minutes, setMinutes] = useState('');

    // Experience selection (mandatory)
    const [experiences, setExperiences] = useState<Experience[]>([]);
    const [selectedExperience, setSelectedExperience] = useState<Experience | null>(null);
    const [loadingExperiences, setLoadingExperiences] = useState(true);

    // Step 5: Buy now or pledge
    const [buyNow, setBuyNow] = useState<boolean | null>(null);

    // Step 4: Preferred reward category
    const [preferredRewardCategory, setPreferredRewardCategory] = useState<ExperienceCategory | null>(null);
    const [showExperiencePicker, setShowExperiencePicker] = useState(false);

    // Dynamic step count: skip step 5 when no specific experience selected
    const totalSteps = selectedExperience ? 5 : 4;

    // UI state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [validationErrors, setValidationErrors] = useState({ goal: false, time: false, experience: false, buyNow: false });
    const [plannedStartDate, setPlannedStartDate] = useState(new Date());

    // Animations
    const slideAnim = useModalAnimation(showConfirm);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const scrollViewRef = useRef<ScrollView>(null);

    // Category filter state (single-select, 'All' by default)
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [showFilterScrollHint, setShowFilterScrollHint] = useState(true);

    // Prefill from auth redirect
    useEffect(() => {
        if (routeParams?.prefill) {
            const p = routeParams.prefill;
            if (p.goalType) setSelectedGoal(p.goalType);
            if (p.customGoal) setCustomGoal(p.customGoal);
            if (p.weeks) setWeeks(p.weeks);
            if (p.sessionsPerWeek) setSessionsPerWeek(p.sessionsPerWeek);
            if (p.hours) setHours(p.hours);
            if (p.minutes) setMinutes(p.minutes);
            if (p.experience) setSelectedExperience(p.experience);
            if (p.plannedStartDate) {
                const restored = new Date(p.plannedStartDate);
                setPlannedStartDate(restored < new Date() ? new Date() : restored);
            }
            if (p.buyNow !== undefined && p.buyNow !== null) setBuyNow(p.buyNow);
            if (p.preferredRewardCategory) setPreferredRewardCategory(p.preferredRewardCategory);
        }
    }, []);

    // Fetch experiences
    useEffect(() => {
        const fetchExperiences = async () => {
            try {
                const q = query(collection(db, 'experiences'), limit(50));
                const snapshot = await getDocs(q);
                const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Experience));
                setExperiences(fetched);
            } catch (error) {
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

    const sanitizeNumericInput = (text: string) => text.replace(/[^0-9]/g, '');

    // ─── Per-step validation ─────────────────────────────────────────
    const validateCurrentStep = (): boolean => {
        switch (currentStep) {
            case 1: {
                const finalGoal = selectedGoal === 'Other' ? customGoal.trim() : selectedGoal;
                if (!finalGoal) {
                    setValidationErrors(prev => ({ ...prev, goal: true }));
                    return false;
                }
                setValidationErrors(prev => ({ ...prev, goal: false }));
                return true;
            }
            case 2: {
                // Sliders have defaults, but time per session must be set
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
                setValidationErrors(prev => ({ ...prev, time: false }));
                return true;
            }
            case 3:
                // Date always has default — always valid
                return true;
            case 4: {
                if (!selectedExperience && !preferredRewardCategory) {
                    setValidationErrors(prev => ({ ...prev, experience: true }));
                    return false;
                }
                setValidationErrors(prev => ({ ...prev, experience: false }));
                return true;
            }
            case 5: {
                if (buyNow === null) {
                    setValidationErrors(prev => ({ ...prev, buyNow: true }));
                    return false;
                }
                setValidationErrors(prev => ({ ...prev, buyNow: false }));
                return true;
            }
            default:
                return true;
        }
    };

    const handleNext = () => {
        if (!validateCurrentStep()) return;
        if (currentStep < totalSteps) {
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

    // ─── Create goal ─────────────────────────────────────────────────
    const handleCreate = async () => {
        if (!validateCurrentStep()) return;

        if (state.user?.id) {
            setShowConfirm(true);
        } else {
            const challengeConfig = {
                goalType: selectedGoal,
                customGoal: selectedGoal === 'Other' ? customGoal.trim() : '',
                weeks,
                sessionsPerWeek,
                hours,
                minutes,
                experience: selectedExperience || null,
                plannedStartDate: plannedStartDate.toISOString(),
                buyNow: buyNow,
                preferredRewardCategory: preferredRewardCategory || null,
            };

            try {
                await setStorageItem('pending_free_challenge', JSON.stringify(challengeConfig));
                navigation.navigate('Auth', { mode: 'signup' });
            } catch (error) {
                logger.error('Error storing challenge config:', error);
                showError('Something went wrong. Please try again.');
            }
        }
    };

    const confirmCreateGoal = async () => {
        if (isSubmitting || !state.user?.id) return;
        setIsSubmitting(true);

        try {
            const finalGoal = selectedGoal === 'Other' ? customGoal.trim() : selectedGoal;
            const hoursNum = parseInt(hours || '0');
            const minutesNum = parseInt(minutes || '0');

            const now = new Date();
            const durationInDays = weeks * 7;
            const endDate = new Date(now);
            endDate.setDate(now.getDate() + durationInDays);

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
                        category: selectedExperience.category || 'Adventure' as any,
                        price: selectedExperience.price ?? 0,
                        coverImageUrl: selectedExperience.coverImageUrl || '',
                        imageUrl: Array.isArray(selectedExperience.imageUrl) ? selectedExperience.imageUrl : [selectedExperience.imageUrl || ''],
                        partnerId: selectedExperience.partnerId || '',
                        location: selectedExperience.location || '',
                    },
                    pledgedAt: now,
                } : {}),
                ...(preferredRewardCategory && !selectedExperience ? { preferredRewardCategory } : {}),
            };

            const goal = await goalService.createFreeGoal(goalData as Goal);
            if (!goal?.id) throw new Error('Goal creation returned no ID');
            dispatch({ type: 'SET_GOAL', payload: goal });

            setShowConfirm(false);

            if (buyNow && selectedExperience) {
                // Buy now: create goal then navigate to checkout
                navigation.reset({
                    index: 1,
                    routes: [
                        { name: 'Goals' as any },
                        {
                            name: 'ExperienceCheckout' as any, params: {
                                cartItems: [{ experienceId: selectedExperience.id, quantity: 1 }],
                                goalId: goal.id,
                            }
                        },
                    ],
                });
            } else {
                // Pledge: navigate to roadmap
                navigation.reset({
                    index: 1,
                    routes: [
                        { name: 'CategorySelection' as any },
                        { name: 'Journey' as any, params: { goal } },
                    ],
                });
            }
        } catch (error) {
            logger.error('Error creating free goal:', error);
            await logErrorToFirestore(error, {
                screenName: 'ChallengeSetupScreen',
                feature: 'CreateFreeGoal',
                userId: state.user?.id,
            });
            showError('Failed to create goal. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const finalGoalName = selectedGoal === 'Other' ? customGoal.trim() : selectedGoal;

    // ─── Step Content Renderers ──────────────────────────────────────
    const renderStep1 = () => (
        <View style={styles.stepContent}>
            {validationErrors.goal && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>Please select a goal type</Text>
                </View>
            )}

            <View style={styles.goalGrid}>
                {GOAL_TYPES.map((goal, i) => (
                    <MotiView
                        key={goal.name}
                        style={{ width: '31%', minWidth: 95 }}
                        animate={{
                            scale: selectedGoal === goal.name ? 1.04 : 1,
                        }}
                        transition={{
                            scale: selectedGoal === goal.name
                                ? { type: 'spring', damping: 34, stiffness: 100 }
                                : { type: 'timing', duration: 100 },
                        }}
                    >
                        <TouchableOpacity
                            style={[
                                styles.goalChip,
                                { width: '100%' },
                                selectedGoal === goal.name && { backgroundColor: goal.color, borderColor: goal.color },
                                validationErrors.goal && !selectedGoal && styles.goalChipError,
                            ]}
                            onPress={() => {
                                setSelectedGoal(goal.name);
                                setValidationErrors(prev => ({ ...prev, goal: false }));
                                if (goal.name !== 'Other') {
                                    setCustomGoal('');
                                    // Auto-advance after brief delay so selection animation plays
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
                        </TouchableOpacity>
                    </MotiView>
                ))}
            </View>

            {selectedGoal === 'Other' && (
                <View style={styles.customGoalContainer}>
                    <Text style={styles.customGoalLabel}>Enter your custom goal:</Text>
                    <View style={styles.customGoalInputWrapper}>
                        <Text style={styles.customGoalIcon}>{'\u2728'}</Text>
                        <TextInput
                            style={styles.customGoalInput}
                            placeholder="e.g., Cook, Paint, Write..."
                            value={customGoal}
                            onChangeText={(text) => {
                                setCustomGoal(text);
                                if (validationErrors.goal && text.trim()) {
                                    setValidationErrors(prev => ({ ...prev, goal: false }));
                                }
                            }}
                            autoFocus
                            accessibilityLabel="Custom goal name"
                        />
                    </View>
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

                    {validationErrors.time && (
                        <View style={[styles.errorBanner, { marginTop: 8, marginBottom: 16 }]}>
                            <Text style={styles.errorText}>Please set a time per session</Text>
                        </View>
                    )}

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
                                accessibilityLabel="Hours per session"
                            />
                            <Text style={styles.timeLabel}>hr</Text>
                        </View>
                        <View style={styles.timeInputGroup}>
                            <TextInput
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
                                accessibilityLabel="Minutes per session"
                            />
                            <Text style={styles.timeLabel}>min</Text>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );

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

        return (
            <View style={styles.stepContent}>
                <View style={styles.sliderContainer}>
                    {/* Inline Calendar */}
                    <View style={styles.inlineCalendar}>
                        {/* Month navigation */}
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
                        resizeMode="cover"
                        accessibilityLabel={exp.title}
                    />
                </View>
                <View style={styles.expTextContainer}>
                    <Text style={[styles.expTitle, isSelected && styles.expTitleActive]} numberOfLines={2}>{exp.title}</Text>
                    <View style={styles.expMeta}>
                        {exp.price > 0 && <Text style={styles.expPrice}>{'\u20AC'}{exp.price}</Text>}
                        {exp.location && <Text style={styles.expLocation} numberOfLines={1}>{exp.location}</Text>}
                    </View>
                </View>
                {isSelected && (
                    <View style={styles.checkBadge}><Check color="#fff" size={12} strokeWidth={3} /></View>
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
                            setValidationErrors(prev => ({ ...prev, experience: false }));
                        }}
                        activeOpacity={0.7}
                    >
                        <ChevronLeft color={Colors.primary} size={18} strokeWidth={2.5} />
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
                                    <ChevronRight color={Colors.textMuted} size={14} />
                                </View>
                            )}
                        </View>
                    </View>

                    {loadingExperiences ? (
                        <View style={{ marginVertical: 20, gap: 12 }}>
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
                                            contentContainerStyle={{ paddingRight: 16 }}
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
                                                                resizeMode="cover"
                                                                accessibilityLabel={exp.title}
                                                            />
                                                        </View>
                                                        <View style={styles.expTextContainer}>
                                                            <Text style={[styles.expTitle, isSelected && styles.expTitleActive]} numberOfLines={2}>{exp.title}</Text>
                                                            <View style={styles.expMeta}>
                                                                {exp.price > 0 && <Text style={styles.expPrice}>{'\u20AC'}{exp.price}</Text>}
                                                                {exp.location && <Text style={styles.expLocation} numberOfLines={1}>{exp.location}</Text>}
                                                            </View>
                                                        </View>
                                                        {isSelected && (
                                                            <View style={styles.checkBadge}><Check color="#fff" size={12} strokeWidth={3} /></View>
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

        // Default view: category preference cards
        const CATEGORY_CARDS: { key: ExperienceCategory; emoji: string; label: string; tagline: string; color: string }[] = [
            { key: 'adventure', emoji: '\u{1F3D4}\u{FE0F}', label: 'Adventure', tagline: 'Explore something new', color: '#F59E0B' },
            { key: 'wellness', emoji: '\u{1F9D8}', label: 'Wellness', tagline: 'Treat yourself', color: '#EC4899' },
            { key: 'creative', emoji: '\u{1F3A8}', label: 'Creative', tagline: 'Make something amazing', color: '#8B5CF6' },
        ];

        return (
            <View style={styles.stepContent}>
                {validationErrors.experience && (
                    <View style={styles.errorBanner}>
                        <Text style={styles.errorText}>Please pick a reward category</Text>
                    </View>
                )}

                {CATEGORY_CARDS.map((cat, index) => {
                    const isActive = preferredRewardCategory === cat.key;
                    return (
                        <MotiView
                            key={cat.key}
                            from={{ opacity: 0, translateY: 16 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 300, delay: index * 80 }}
                        >
                            <TouchableOpacity
                                style={[
                                    styles.rewardCategoryCard,
                                    isActive && { borderColor: cat.color, borderWidth: 2, backgroundColor: cat.color + '08' },
                                ]}
                                onPress={() => {
                                    setPreferredRewardCategory(cat.key);
                                    setSelectedExperience(null);
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
                                        <Check color="#fff" size={14} strokeWidth={3} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        </MotiView>
                    );
                })}

                {/* Browse experiences link */}
                <TouchableOpacity
                    style={styles.browseLink}
                    onPress={() => setShowExperiencePicker(true)}
                    activeOpacity={0.7}
                >
                    <Text style={styles.browseLinkText}>Already know what you want?</Text>
                    <View style={styles.browseLinkAction}>
                        <Text style={styles.browseLinkActionText}>Browse & pick a reward</Text>
                        <ChevronRight color={Colors.primary} size={16} strokeWidth={2.5} />
                    </View>
                </TouchableOpacity>
            </View>
        );
    };

    const renderStep5 = () => (
        <View style={styles.stepContent}>
            {validationErrors.buyNow && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>Please choose an option to continue</Text>
                </View>
            )}

            {/* Option A: Buy Now */}
            <TouchableOpacity
                style={[styles.rewardChoice, buyNow === true && styles.rewardChoiceActive]}
                onPress={() => {
                    setBuyNow(true);
                    setValidationErrors(prev => ({ ...prev, buyNow: false }));
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Buy my reward now"
            >
                <View style={styles.rewardChoiceHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.rewardChoiceTitle, buyNow === true && styles.rewardChoiceTitleActive]}>Buy my reward</Text>
                        <Text style={styles.rewardChoiceDesc}>
                            Purchase now, unlock when you complete your challenge
                            {selectedExperience?.price ? ` \u00B7 \u20AC${selectedExperience.price}` : ''}
                        </Text>
                    </View>
                    {buyNow === true && (
                        <View style={styles.rewardChoiceCheck}><Check color="#fff" size={14} strokeWidth={3} /></View>
                    )}
                </View>
            </TouchableOpacity>

            {/* Option B: Pledge */}
            <TouchableOpacity
                style={[styles.rewardChoice, buyNow === false && styles.rewardChoiceActive]}
                onPress={() => {
                    setBuyNow(false);
                    setValidationErrors(prev => ({ ...prev, buyNow: false }));
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="No reward for now, friends can empower me"
            >
                <View style={styles.rewardChoiceHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.rewardChoiceTitle, buyNow === false && styles.rewardChoiceTitleActive]}>No reward for now</Text>
                        <Text style={styles.rewardChoiceDesc}>
                            Share your goal, friends can empower you!
                        </Text>
                    </View>
                    {buyNow === false && (
                        <View style={styles.rewardChoiceCheck}><Check color="#fff" size={14} strokeWidth={3} /></View>
                    )}
                </View>
            </TouchableOpacity>

            <Text style={styles.rewardChoiceNote}>Both options are great, there's no wrong choice!</Text>

            {/* Motivational stat */}
            <View style={styles.statCard}>
                <Text style={styles.statNumber}>Invest in your success.</Text>
                <Text style={styles.statText}>
                    When you buy your reward upfront, human psychology takes over. You are hardwired to finish the challenge to make sure your investment pays off.                </Text>
            </View>
        </View>
    );

    const renderCurrentStep = () => {
        switch (currentStep) {
            case 1: return renderStep1();
            case 2: return renderStep2();
            case 3: return renderStep3();
            case 4: return renderStep4();
            case 5: return renderStep5();
            default: return null;
        }
    };

    const userId = state.user?.id || 'current_user';

    return (
        <ErrorBoundary screenName="ChallengeSetupScreen" userId={userId}>
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={handleBack}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                >
                    <ChevronLeft color="#1F2937" size={24} strokeWidth={2.5} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Create Your Challenge</Text>
                <View style={styles.stepIndicator}>
                    <Text style={styles.stepIndicatorText}>{currentStep}/{totalSteps}</Text>
                </View>
            </View>

            {/* Progress Bar */}
            <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />

            {/* Step Content */}
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

                <View style={{ height: 240 }} />
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
                {/* Preview card on final step */}
                {currentStep >= 4 && selectedExperience && (
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
                                        resizeMode="cover"
                                        accessibilityLabel={selectedExperience.title}
                                    />
                                </View>
                                <View style={styles.heroInfo}>
                                    <Text style={styles.footerHeroTitle} numberOfLines={1}>
                                        {selectedExperience.title}
                                    </Text>
                                </View>
                            </View>

                            {selectedGoal && (
                                <View style={styles.heroContextRow}>
                                    <View style={styles.contextBadge}>
                                        <Text style={styles.contextEmoji}>
                                            {selectedGoal === 'Gym' ? '🏋️' : selectedGoal === 'Yoga' ? '🧘' : selectedGoal === 'Run' ? '🏃' : selectedGoal === 'Read' ? '📚' : selectedGoal === 'Walk' ? '🚶' : '✨'}
                                        </Text>
                                        <Text style={styles.contextText}>{selectedGoal === 'Other' ? (customGoal.trim() || 'Custom') : selectedGoal}</Text>
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
                        <LinearGradient colors={Colors.gradientDark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createButtonGradient}>
                            <Text style={styles.createButtonText}>
                                {state.user?.id ? 'Create Challenge' : 'Sign Up & Create Challenge'}
                            </Text>
                            <ChevronRight color="#fff" size={20} strokeWidth={3} />
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
                        <LinearGradient colors={Colors.gradientDark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createButtonGradient}>
                            <Text style={styles.createButtonText}>Next</Text>
                            <ChevronRight color="#fff" size={20} strokeWidth={3} />
                        </LinearGradient>
                    </TouchableOpacity>
                )}
            </View>

            {/* Confirmation Modal */}
            <Modal
                visible={showConfirm}
                transparent
                animationType="fade"
                onRequestClose={() => setShowConfirm(false)}
            >
                <TouchableOpacity
                    style={commonStyles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowConfirm(false)}
                >
                    <Animated.View
                        style={[
                            styles.modalBox,
                            { transform: [{ translateY: slideAnim }] },
                        ]}
                    >
                        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ width: '100%', alignItems: 'center' }}>
                            <Text style={styles.modalTitle}>Confirm Your Challenge</Text>
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
                                    {hours || '0'}h {minutes || '0'}m
                                </Text>
                                {selectedExperience && (
                                    <>
                                        <Text style={styles.modalRow}>
                                            <Text style={styles.modalLabel}>Dream reward: </Text>
                                            {selectedExperience.title}
                                        </Text>
                                        <Text style={styles.modalRow}>
                                            <Text style={styles.modalLabel}>Reward plan: </Text>
                                            {buyNow ? `Buy now (\u20AC${selectedExperience?.price || 0})` : 'No reward for now'}
                                        </Text>
                                    </>
                                )}
                                {!selectedExperience && preferredRewardCategory && (
                                    <Text style={styles.modalRow}>
                                        <Text style={styles.modalLabel}>Reward preference: </Text>
                                        {preferredRewardCategory.charAt(0).toUpperCase() + preferredRewardCategory.slice(1)}
                                    </Text>
                                )}
                            </View>

                            <Text style={styles.pledgeNote}>
                                {buyNow
                                    ? 'Your experience will be unlocked when you complete your challenge!'
                                    : selectedExperience
                                        ? 'Friends can track your progress and empower you by gifting experiences!'
                                        : 'We\'ll recommend the perfect reward as you make progress!'
                                }
                            </Text>

                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    onPress={() => setShowConfirm(false)}
                                    style={[styles.modalButton, styles.cancelButton]}
                                    activeOpacity={0.8}
                                    disabled={isSubmitting}
                                    accessibilityRole="button"
                                    accessibilityLabel="Cancel challenge creation"
                                >
                                    <Text style={styles.cancelText}>Cancel</Text>
                                </TouchableOpacity>

                                <Animated.View style={{ flex: 1, transform: [{ scale: pulseAnim }] }}>
                                    <TouchableOpacity
                                        onPress={confirmCreateGoal}
                                        style={[styles.modalButton, styles.confirmButton, isSubmitting && { opacity: 0.9 }]}
                                        activeOpacity={0.8}
                                        disabled={isSubmitting}
                                        accessibilityRole="button"
                                        accessibilityLabel={isSubmitting ? 'Creating challenge' : buyNow ? 'Buy reward and create challenge' : 'Create challenge'}
                                    >
                                        <Text style={styles.confirmText}>
                                            {isSubmitting ? 'Creating...' : buyNow ? 'Buy & Create' : "Let's Go!"}
                                        </Text>
                                    </TouchableOpacity>
                                </Animated.View>
                            </View>
                        </TouchableOpacity>
                    </Animated.View>
                </TouchableOpacity>
            </Modal>
        </View>
        </ErrorBoundary>
    );
}


const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAFAFA',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 56 : 40,
        paddingBottom: 16,
        paddingHorizontal: 20,
        backgroundColor: '#fff',
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
        color: '#1F2937',
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
        backgroundColor: '#fff',
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

    // Step content
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
        color: '#1F2937',
        marginBottom: 8,
    },
    stepSubtitle: {
        fontSize: 15,
        color: Colors.textSecondary,
        lineHeight: 22,
        marginBottom: 28,
    },
    stepContent: {
        // Wrapper for step-specific content
    },
    section: {
        marginBottom: 20,
    },

    // Error
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

    // Goal chips
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
        backgroundColor: '#fff',
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
        color: '#fff',
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
        backgroundColor: '#fff',
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
        color: '#1F2937',
        paddingVertical: 10,
    },

    // Sliders
    sliderContainer: {
        backgroundColor: '#fff',
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
        color: '#1F2937',
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
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
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

    // Time inputs
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
        backgroundColor: '#fff',
        color: '#1F2937',
    },
    timeLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.textSecondary,
    },

    // Experience cards
    expCard: {
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: Colors.border,
        borderRadius: 16,
        padding: 12,
        marginRight: 12,
        width: 150,
        alignItems: 'center',
        position: 'relative',
    },
    expCardActive: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primarySurface,
    },
    expIconBox: {
        width: '100%',
        height: 100,
        borderRadius: 14,
        backgroundColor: Colors.backgroundLight,
        overflow: 'hidden',
        marginBottom: 8,
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
        fontSize: 13,
        fontWeight: '700',
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    expTitleActive: {
        color: Colors.primary,
    },
    expMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    expPrice: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.primary,
    },
    expLocation: {
        fontSize: 11,
        color: Colors.textMuted,
        flex: 1,
    },
    viewDetailsBtn: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 10,
        marginTop: 8,
    },
    viewDetailsBtnText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#fff',
    },
    checkBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
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
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: Colors.backgroundLight,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 8,
    },
    createButton: {
        borderRadius: 16,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    createButtonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 18,
        borderRadius: 16,
    },
    createButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
    },

    // Footer hero card
    footerHeroCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.backgroundLight,
        shadowColor: '#000',
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
        borderRadius: 14,
        backgroundColor: Colors.backgroundLight,
        overflow: 'hidden',
    },
    heroImage: {
        width: '100%',
        height: '100%',
    },
    heroInfo: {
        flex: 1,
        marginLeft: 16,
    },
    footerHeroTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#1F2937',
        marginBottom: 2,
    },

    heroContextRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 8,
        marginTop: 10,
        justifyContent: 'space-between',
    },
    contextBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    contextEmoji: {
        fontSize: 14,
    },
    contextText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#4B5563',
    },
    contextDivider: {
        width: 1,
        height: 16,
        backgroundColor: Colors.border,
    },
    contextLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.textSecondary,
    },

    // Modal
    modalBox: {
        backgroundColor: '#fff',
        borderRadius: 20,
        width: '90%',
        maxWidth: 360,
        paddingVertical: 24,
        paddingHorizontal: 20,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.primaryDeep,
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 20,
        textAlign: 'center',
    },
    modalDetails: {
        width: '100%',
        backgroundColor: Colors.surface,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    modalRow: {
        fontSize: 15,
        color: '#374151',
        marginBottom: 4,
    },
    modalLabel: {
        fontWeight: '600',
        color: Colors.primaryDeep,
    },
    pledgeNote: {
        fontSize: 13,
        color: '#16a34a',
        textAlign: 'center',
        marginBottom: 16,
        fontStyle: 'italic',
    },
    modalButtons: {
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'space-between',
        gap: 10,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: Colors.backgroundLight,
    },
    confirmButton: {
        backgroundColor: Colors.primary,
    },
    cancelText: {
        color: '#374151',
        fontWeight: '600',
        fontSize: 16,
    },
    confirmText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },

    // Carousel filter chips
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
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
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: Colors.backgroundLight,
        marginLeft: 4,
    },
    filterChipActive: {
        backgroundColor: '#1F2937',
    },
    filterText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textSecondary,
    },
    filterTextActive: {
        color: '#fff',
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
        backgroundColor: 'rgba(249, 250, 251, 0.92)',
    },
    cardScroll: {
        marginTop: 4,
    },

    // Stacked category sections
    stackedCategories: {
        gap: 24,
    },
    categorySection: {
        marginBottom: 0,
    },
    categorySectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        gap: 8,
    },
    categorySectionEmoji: {
        fontSize: 20,
    },
    categorySectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1F2937',
        flex: 1,
    },
    categorySectionBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    categorySectionCount: {
        fontSize: 12,
        fontWeight: '700',
    },

    // Inline calendar
    inlineCalendar: {
        backgroundColor: '#FFFFFF',
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
        color: '#374151',
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
        color: '#374151',
        fontWeight: '500',
    },
    calDisabledText: {
        color: '#D1D5DB',
    },
    calSelectedText: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
    calTodayText: {
        color: Colors.secondary,
        fontWeight: '700',
    },

    // End date info
    endDateContainer: {
        backgroundColor: '#F0FDF4',
        borderRadius: 14,
        padding: 16,
        marginTop: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#BBF7D0',
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

    // Step 5: Secure your reward
    statCard: {
        backgroundColor: '#F0FDF4',
        borderRadius: 12,
        padding: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#BBF7D0',
        marginTop: 16,
        marginBottom: 0,
    },
    statNumber: {
        fontSize: 22,
        fontWeight: '800',
        color: Colors.primary,
        marginBottom: 2,
    },
    statText: {
        fontSize: 12,
        color: '#374151',
        textAlign: 'center',
        lineHeight: 16,
    },
    statSource: {
        fontSize: 10,
        color: Colors.textMuted,
        fontStyle: 'italic',
        marginTop: 4,
    },
    expPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: 14,
        padding: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: Colors.border,
        gap: 12,
    },
    expPreviewImage: {
        width: 48,
        height: 48,
        borderRadius: 10,
    },
    expPreviewInfo: {
        flex: 1,
    },
    expPreviewTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1F2937',
    },
    expPreviewMeta: {
        fontSize: 12,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    rewardChoice: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        borderWidth: 2,
        borderColor: Colors.border,
        marginBottom: 12,
    },
    rewardChoiceActive: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primarySurface,
    },
    rewardChoiceHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    rewardChoiceIcon: {
        fontSize: 28,
    },
    rewardChoiceTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1F2937',
        marginBottom: 2,
    },
    rewardChoiceTitleActive: {
        color: Colors.primary,
    },
    rewardChoiceDesc: {
        fontSize: 13,
        color: Colors.textSecondary,
        lineHeight: 18,
    },
    rewardChoiceCheck: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rewardChoiceNote: {
        fontSize: 13,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: 4,
        fontStyle: 'italic',
    },

    // Step 4: Category preference cards
    rewardCategoryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
        borderWidth: 1.5,
        borderColor: Colors.backgroundLight,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    rewardCategoryEmoji: {
        fontSize: 32,
        marginRight: 16,
    },
    rewardCategoryLabel: {
        fontSize: 17,
        fontWeight: '700',
        color: '#1F2937',
        marginBottom: 2,
    },
    rewardCategoryTagline: {
        fontSize: 14,
        color: Colors.textSecondary,
    },
    rewardCategoryCheck: {
        width: 26,
        height: 26,
        borderRadius: 13,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
    },
    browseLink: {
        alignItems: 'center',
        marginTop: 24,
        paddingVertical: 12,
    },
    browseLinkText: {
        fontSize: 13,
        color: Colors.textMuted,
        marginBottom: 4,
    },
    browseLinkAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    browseLinkActionText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.primary,
    },
    browseBackButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 4,
    },
    browseBackText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.primary,
    },
});
