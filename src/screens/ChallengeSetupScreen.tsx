import React, { useState, useEffect, useRef } from 'react';
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
    Alert,
    Image,
    Animated,
    ActivityIndicator,
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
import { RootStackParamList, Experience, Goal } from '../types';
import { useApp } from '../context/AppContext';
import { goalService } from '../services/GoalService';
import { commonStyles } from '../styles/commonStyles';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import { CustomCalendar } from '../components/CustomCalendar';
import { ValentineExperienceDetailsModal } from './recipient/components/GoalCardModals';

const { width } = Dimensions.get('window');
const TOTAL_STEPS = 4;

const GOAL_TYPES = [
    { icon: '\u{1F3CB}\u{FE0F}', name: 'Gym', color: Colors.secondary },
    { icon: '\u{1F9D8}', name: 'Yoga', color: '#EC4899' },
    { icon: '\u{1F3C3}', name: 'Run', color: Colors.accent },
    { icon: '\u{1F4DA}', name: 'Read', color: '#F59E0B' },
    { icon: '\u{1F6B6}', name: 'Walk', color: '#10B981' },
    { icon: '\u2728', name: 'Other', color: '#6B7280' },
];

const STEP_TITLES = [
    'What do you want to improve?',
    'Set your challenge intensity',
    'When do you start?',
    'Pick your dream reward',
];

const STEP_SUBTITLES = [
    'Pick the habit you want to build. We\'ll help you stay on track.',
    'It takes 21 days to build a habit. Start small, you can always do another challenge later!',
    'We\'ll send you reminders so you never miss a session.',
    'Your friends can see your goal and gift this to you. You\'ll get it when you finish!',
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

    // UI state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [validationErrors, setValidationErrors] = useState({ goal: false, time: false, experience: false });
    const [plannedStartDate, setPlannedStartDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showExpDetailsModal, setShowExpDetailsModal] = useState(false);
    const [detailExperience, setDetailExperience] = useState<Experience | null>(null);

    // Animations
    const slideAnim = useModalAnimation(showConfirm);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    // Category filter state
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
            if (p.plannedStartDate) setPlannedStartDate(new Date(p.plannedStartDate));
        }
    }, []);

    // Fetch experiences
    useEffect(() => {
        const fetchExperiences = async () => {
            try {
                const q = query(collection(db, 'experiences'), limit(12));
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

    // Animate category transitions
    const categoryTransitionAnim = useRef(new Animated.Value(1)).current;
    const prevCategoryRef = useRef<string>('All');

    useEffect(() => {
        if (prevCategoryRef.current !== selectedCategory) {
            Animated.timing(categoryTransitionAnim, {
                toValue: 0, duration: 150, useNativeDriver: true,
            }).start(() => {
                prevCategoryRef.current = selectedCategory;
                Animated.timing(categoryTransitionAnim, {
                    toValue: 1, duration: 250, useNativeDriver: true,
                }).start();
            });
        }
    }, [selectedCategory]);

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
                    Alert.alert('Error', 'Each session cannot exceed 3 hours.');
                    return false;
                }
                setValidationErrors(prev => ({ ...prev, time: false }));
                return true;
            }
            case 3:
                // Date always has default — always valid
                return true;
            case 4: {
                if (!selectedExperience) {
                    setValidationErrors(prev => ({ ...prev, experience: true }));
                    return false;
                }
                setValidationErrors(prev => ({ ...prev, experience: false }));
                return true;
            }
            default:
                return true;
        }
    };

    const handleNext = () => {
        if (!validateCurrentStep()) return;
        if (currentStep < TOTAL_STEPS) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(prev => prev - 1);
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
            };

            try {
                await setStorageItem('pending_free_challenge', JSON.stringify(challengeConfig));
                navigation.navigate('Auth', { mode: 'signup' });
            } catch (error) {
                logger.error('Error storing challenge config:', error);
                Alert.alert('Error', 'Something went wrong. Please try again.');
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
            };

            const goal = await goalService.createFreeGoal(goalData as Goal);
            dispatch({ type: 'SET_GOAL', payload: goal });

            setShowConfirm(false);
            navigation.reset({
                index: 1,
                routes: [
                    { name: 'CategorySelection' as any },
                    { name: 'Roadmap' as any, params: { goal } },
                ],
            });
        } catch (error) {
            logger.error('Error creating free goal:', error);
            await logErrorToFirestore(error, {
                screenName: 'ChallengeSetupScreen',
                feature: 'CreateFreeGoal',
                userId: state.user?.id,
            });
            Alert.alert('Error', 'Failed to create goal. Please try again.');
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
                                if (goal.name !== 'Other') setCustomGoal('');
                            }}
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
                                placeholderTextColor="#9CA3AF"
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
                                placeholderTextColor="#9CA3AF"
                            />
                            <Text style={styles.timeLabel}>min</Text>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );

    const renderStep3 = () => (
        <View style={styles.stepContent}>
            <View style={styles.sliderContainer}>
                <Text style={styles.sliderTitle}>Start date</Text>
                <TouchableOpacity
                    onPress={() => setShowDatePicker(true)}
                    style={styles.dateButton}
                    activeOpacity={0.7}
                >
                    <Text style={styles.dateButtonText}>
                        {plannedStartDate.toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                        })}
                    </Text>
                    <Text style={{ fontSize: 20 }}>📅</Text>
                </TouchableOpacity>
                <CustomCalendar
                    visible={showDatePicker}
                    selectedDate={plannedStartDate}
                    onSelectDate={(date) => setPlannedStartDate(date)}
                    onClose={() => setShowDatePicker(false)}
                    minimumDate={new Date()}
                />
            </View>
        </View>
    );

    const renderStep4 = () => (
        <View style={styles.stepContent}>
            {validationErrors.experience && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>Please select a dream reward</Text>
                </View>
            )}

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
                        {['All', 'Adventure', 'Wellness', 'Creative'].map((cat) => (
                            <TouchableOpacity
                                key={cat}
                                onPress={() => setSelectedCategory(cat)}
                                style={[
                                    styles.filterChip,
                                    selectedCategory === cat && styles.filterChipActive,
                                ]}
                            >
                                <Text style={[
                                    styles.filterText,
                                    selectedCategory === cat && styles.filterTextActive,
                                ]}>{cat}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    {showFilterScrollHint && (
                        <View style={styles.categoryFadeIndicator} pointerEvents="none">
                            <View style={styles.categoryGradient} />
                            <ChevronRight color="#9CA3AF" size={14} />
                        </View>
                    )}
                </View>
            </View>

            {loadingExperiences ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 20 }} />
            ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardScroll}>
                    {experiences
                        .filter(exp => {
                            if (selectedCategory === 'Recommended') return exp.isRecommendedForValentines === true;
                            if (selectedCategory === 'All') return true;
                            if (!exp.category) return false;
                            const expCat = exp.category.toLowerCase().trim();
                            const filterCat = selectedCategory.toLowerCase().trim();
                            if (filterCat === 'wellness' && (expCat === 'relaxation' || expCat === 'spa' || expCat === 'health' || expCat === 'wellness')) return true;
                            if (filterCat === 'creative' && (expCat === 'culture' || expCat === 'arts' || expCat === 'creative' || expCat === 'workshop')) return true;
                            return expCat.includes(filterCat) || filterCat.includes(expCat);
                        })
                        .sort((a, b) => selectedCategory === 'Recommended'
                            ? (a.recommendedOrder ?? Number.MAX_SAFE_INTEGER) - (b.recommendedOrder ?? Number.MAX_SAFE_INTEGER)
                            : 0
                        )
                        .map((exp) => {
                            const isSelected = selectedExperience?.id === exp.id;
                            return (
                                <Animated.View
                                    key={exp.id}
                                    style={{
                                        opacity: categoryTransitionAnim,
                                        transform: [{ translateY: categoryTransitionAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
                                    }}
                                >
                                    <TouchableOpacity
                                        style={[styles.expCard, isSelected && styles.expCardActive]}
                                        onPress={() => {
                                            setSelectedExperience(exp);
                                            setValidationErrors(prev => ({ ...prev, experience: false }));
                                        }}
                                    >
                                        <View style={styles.expIconBox}>
                                            <Image source={{ uri: exp.coverImageUrl }} style={styles.expImage} resizeMode="cover" />
                                        </View>
                                        <View style={styles.expTextContainer}>
                                            <Text style={[styles.expTitle, isSelected && styles.expTitleActive]} numberOfLines={2}>{exp.title}</Text>
                                        </View>
                                        {isSelected && (
                                            <View style={styles.checkBadge}><Check color="#fff" size={12} strokeWidth={3} /></View>
                                        )}
                                        <MotiView
                                            animate={{
                                                opacity: isSelected ? 1 : 0,
                                                scale: isSelected ? 1 : 0.8,
                                                height: isSelected ? 30 : 0,
                                                marginTop: isSelected ? 8 : 0,
                                            }}
                                            transition={{ type: 'timing', duration: 200 }}
                                            style={{ overflow: 'hidden' }}
                                        >
                                            <TouchableOpacity
                                                style={styles.viewDetailsBtn}
                                                onPress={(e) => {
                                                    e.stopPropagation();
                                                    setDetailExperience(exp);
                                                    setShowExpDetailsModal(true);
                                                }}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={styles.viewDetailsBtnText}>View Details</Text>
                                            </TouchableOpacity>
                                        </MotiView>
                                    </TouchableOpacity>
                                </Animated.View>
                            );
                        })}
                </ScrollView>
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

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={handleBack}
                    activeOpacity={0.8}
                >
                    <ChevronLeft color="#1F2937" size={24} strokeWidth={2.5} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Create Your Challenge</Text>
                <View style={styles.stepIndicator}>
                    <Text style={styles.stepIndicatorText}>{currentStep}/{TOTAL_STEPS}</Text>
                </View>
            </View>

            {/* Progress Bar */}
            <ProgressBar currentStep={currentStep} totalSteps={TOTAL_STEPS} />

            {/* Step Content */}
            <ScrollView
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

                <View style={{ height: 200 }} />
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
                {/* Preview card on final step */}
                {currentStep === TOTAL_STEPS && selectedExperience && (
                    <MotiView
                        from={{ opacity: 0, translateY: 10 }}
                        animate={{ opacity: 1, translateY: 0 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 180 }}
                    >
                        <View style={styles.footerHeroCard}>
                            <View style={styles.footerHeroRow}>
                                <View style={styles.heroIconBox}>
                                    <Image source={{ uri: selectedExperience.coverImageUrl }} style={styles.heroImage} resizeMode="cover" />
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
                {currentStep === TOTAL_STEPS ? (
                    <TouchableOpacity style={styles.createButton} onPress={handleCreate} activeOpacity={0.9}>
                        <LinearGradient colors={Colors.gradientDark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createButtonGradient}>
                            <Text style={styles.createButtonText}>
                                {state.user?.id ? 'Create Challenge' : 'Sign Up & Create Challenge'}
                            </Text>
                            <ChevronRight color="#fff" size={20} strokeWidth={3} />
                        </LinearGradient>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity style={styles.createButton} onPress={handleNext} activeOpacity={0.9}>
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
                                    <Text style={styles.modalRow}>
                                        <Text style={styles.modalLabel}>Dream reward: </Text>
                                        {selectedExperience.title}
                                    </Text>
                                )}
                            </View>

                            <Text style={styles.pledgeNote}>
                                Friends can track your progress and empower you by gifting experiences!
                            </Text>

                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    onPress={() => setShowConfirm(false)}
                                    style={[styles.modalButton, styles.cancelButton]}
                                    activeOpacity={0.8}
                                    disabled={isSubmitting}
                                >
                                    <Text style={styles.cancelText}>Cancel</Text>
                                </TouchableOpacity>

                                <Animated.View style={{ flex: 1, transform: [{ scale: pulseAnim }] }}>
                                    <TouchableOpacity
                                        onPress={confirmCreateGoal}
                                        style={[styles.modalButton, styles.confirmButton, isSubmitting && { opacity: 0.9 }]}
                                        activeOpacity={0.8}
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting ? (
                                            <ActivityIndicator color="#fff" size="small" />
                                        ) : (
                                            <Text style={styles.confirmText}>Let's Go!</Text>
                                        )}
                                    </TouchableOpacity>
                                </Animated.View>
                            </View>
                        </TouchableOpacity>
                    </Animated.View>
                </TouchableOpacity>
            </Modal>

            {/* Experience Details Popup */}
            <ValentineExperienceDetailsModal
                visible={showExpDetailsModal}
                onClose={() => setShowExpDetailsModal(false)}
                experience={detailExperience}
            />
        </View>
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
        borderBottomColor: '#F3F4F6',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#F9FAFB',
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
        backgroundColor: '#E5E7EB',
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
        color: '#6B7280',
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
        borderColor: '#E5E7EB',
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
        color: '#6B7280',
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
        color: '#6B7280',
        marginBottom: 10,
    },
    customGoalInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#E5E7EB',
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
        borderColor: '#F3F4F6',
    },
    sliderTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#6B7280',
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
        color: '#6B7280',
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    sliderLabelText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#9CA3AF',
    },
    sliderTrack: {
        height: 8,
        backgroundColor: '#E5E7EB',
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
        borderColor: '#E5E7EB',
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
        color: '#6B7280',
    },

    // Experience cards
    expCard: {
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: '#E5E7EB',
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
        backgroundColor: '#F3F4F6',
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
        color: '#6B7280',
        textAlign: 'center',
    },
    expTitleActive: {
        color: Colors.primary,
    },
    viewDetailsBtn: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 10,
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
        borderTopColor: '#F3F4F6',
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
        borderColor: '#F3F4F6',
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
        backgroundColor: '#F3F4F6',
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
        backgroundColor: '#F9FAFB',
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
        backgroundColor: '#E5E7EB',
    },
    contextLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#6B7280',
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
        color: '#6b7280',
        marginBottom: 20,
        textAlign: 'center',
    },
    modalDetails: {
        width: '100%',
        backgroundColor: '#f9fafb',
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
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
        backgroundColor: '#f3f4f6',
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
        backgroundColor: '#F3F4F6',
        marginLeft: 4,
    },
    filterChipActive: {
        backgroundColor: '#1F2937',
    },
    filterText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6B7280',
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

    // Planned start date picker
    dateButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginTop: 8,
    },
    dateButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1F2937',
    },
});
