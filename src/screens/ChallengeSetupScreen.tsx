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

const { width } = Dimensions.get('window');

const GOAL_TYPES = [
    { icon: '\u{1F3CB}\u{FE0F}', name: 'Gym', color: Colors.secondary },
    { icon: '\u{1F9D8}', name: 'Yoga', color: '#EC4899' },
    { icon: '\u{1F3C3}', name: 'Run', color: Colors.accent },
    { icon: '\u{1F4DA}', name: 'Read', color: '#F59E0B' },
    { icon: '\u{1F6B6}', name: 'Walk', color: '#10B981' },
    { icon: '\u2728', name: 'Other', color: '#6B7280' },
];

// Storage helpers (cross-platform)
const setStorageItem = async (key: string, value: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        localStorage.setItem(key, value);
    } else {
        await AsyncStorage.setItem(key, value);
    }
};

// ModernSlider - reused from ValentinesChallengeScreen
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

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ChallengeSetup'>;

export default function ChallengeSetupScreen() {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute();
    const routeParams = route.params as { prefill?: any } | undefined;
    const { state, dispatch } = useApp();

    // Goal config
    const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
    const [customGoal, setCustomGoal] = useState('');
    const [weeks, setWeeks] = useState(3);
    const [sessionsPerWeek, setSessionsPerWeek] = useState(3);
    const [hours, setHours] = useState('');
    const [minutes, setMinutes] = useState('');

    // Experience selection (optional)
    const [experiences, setExperiences] = useState<Experience[]>([]);
    const [selectedExperience, setSelectedExperience] = useState<Experience | null>(null);
    const [loadingExperiences, setLoadingExperiences] = useState(true);

    // UI state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [validationErrors, setValidationErrors] = useState({ goal: false, time: false });
    const [plannedStartDate, setPlannedStartDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Animations
    const scrollRef = useRef<ScrollView>(null);
    const goalStripAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useModalAnimation(showConfirm);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const categoryTransitionAnim = useRef(new Animated.Value(1)).current;
    const prevCategoryRef = useRef<string>('Recommended');

    // Category filter state (mirrors Valentine's)
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

    // Animate goal strip on selection
    useEffect(() => {
        if (selectedGoal) {
            Animated.spring(goalStripAnim, {
                toValue: 1,
                friction: 8,
                tension: 65,
                useNativeDriver: true,
            }).start();
        }
    }, [selectedGoal]);

    // Animate category transitions (mirrors Valentine's)
    useEffect(() => {
        if (prevCategoryRef.current !== selectedCategory) {
            Animated.timing(categoryTransitionAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }).start(() => {
                prevCategoryRef.current = selectedCategory;
                Animated.timing(categoryTransitionAnim, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver: true,
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

    const validateInputs = (): boolean => {
        const finalGoal = selectedGoal === 'Other' ? customGoal.trim() : selectedGoal;
        const hoursNum = parseInt(hours || '0', 10);
        const minutesNum = parseInt(minutes || '0', 10);

        let hasError = false;
        const newErrors = { goal: false, time: false };

        if (!finalGoal) {
            newErrors.goal = true;
            hasError = true;
        }

        if (!hours && !minutes) {
            newErrors.time = true;
            hasError = true;
        } else if (hoursNum === 0 && minutesNum === 0) {
            newErrors.time = true;
            hasError = true;
        } else if (hoursNum > 3 || (hoursNum === 3 && minutesNum > 0)) {
            Alert.alert('Error', 'Each session cannot exceed 3 hours.');
            return false;
        }

        if (hasError) {
            setValidationErrors(newErrors);
            if (newErrors.goal) {
                scrollRef.current?.scrollTo({ y: 0, animated: true });
            } else if (newErrors.time) {
                // Approximate scroll down to time section
                scrollRef.current?.scrollTo({ y: 300, animated: true });
            }
            return false;
        }

        setValidationErrors({ goal: false, time: false });
        return true;
    };

    const handleCreate = async () => {
        if (!validateInputs()) return;

        if (state.user?.id) {
            // User is logged in - show confirmation
            setShowConfirm(true);
        } else {
            // Not logged in - store config and navigate to auth
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
                        title: selectedExperience.title,
                        subtitle: selectedExperience.subtitle,
                        description: selectedExperience.description,
                        category: selectedExperience.category,
                        price: selectedExperience.price,
                        coverImageUrl: selectedExperience.coverImageUrl,
                        imageUrl: selectedExperience.imageUrl,
                        partnerId: selectedExperience.partnerId,
                        location: selectedExperience.location,
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

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.8}
                >
                    <ChevronLeft color="#1F2937" size={24} strokeWidth={2.5} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Create Your Challenge</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Goal Type Selection */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>What do you want to improve?</Text>

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
                                from={{ opacity: 0, scale: 0.85 }}
                                animate={{
                                    opacity: 1,
                                    scale: selectedGoal === goal.name ? 1.04 : 1,
                                }}
                                transition={{
                                    opacity: { type: 'timing', duration: 300, delay: i * 60 },
                                    scale: selectedGoal === goal.name
                                        ? { type: 'spring', damping: 34, stiffness: 100 }
                                        : { type: 'timing', duration: 100, delay: i * 60 },
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

                {/* Duration Slider */}
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

                {/* Sessions Per Week Slider */}
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

                {/* Time Per Session */}
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

                {/* Planned Start Date */}
                <View style={styles.section}>
                    <View style={styles.sliderContainer}>
                        <Text style={styles.sliderTitle}>When do you want to start?</Text>
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

                {/* Experience Selection — mirrors Valentine's carousel */}
                <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionLabel}>Dream Reward</Text>
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
                                {['Recommended', 'All', 'Adventure', 'Wellness', 'Creative'].map((cat) => (
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

                    <Text style={styles.sectionSubtitle}>
                        Your friends can see it and gift it to you!
                    </Text>

                    {loadingExperiences ? (
                        <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 20 }} />
                    ) : (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardScroll}>

                            {/* "Just the challenge" skip card */}
                            <Animated.View style={{ opacity: categoryTransitionAnim, transform: [{ translateY: categoryTransitionAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                                <TouchableOpacity
                                    style={[
                                        styles.expCard,
                                        !selectedExperience && styles.expCardActive,
                                    ]}
                                    onPress={() => setSelectedExperience(null)}
                                >
                                    <View style={[styles.expIconBox, { backgroundColor: Colors.primarySurface, justifyContent: 'center', alignItems: 'center' }]}>
                                        <Text style={{ fontSize: 26 }}>🎯</Text>
                                    </View>
                                    <View style={styles.expTextContainer}>
                                        <Text style={[styles.expTitle, !selectedExperience && styles.expTitleActive]} numberOfLines={2}>
                                            Just the{'\n'}challenge
                                        </Text>
                                    </View>
                                    {!selectedExperience && (
                                        <View style={styles.checkBadge}><Check color="#fff" size={12} strokeWidth={3} /></View>
                                    )}
                                </TouchableOpacity>
                            </Animated.View>

                            {/* Filtered experience cards */}
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
                                                onPress={() => setSelectedExperience(exp)}
                                            >
                                                <View style={styles.expIconBox}>
                                                    <Image source={{ uri: exp.coverImageUrl }} style={styles.expImage} resizeMode="cover" />
                                                </View>
                                                <View style={styles.expTextContainer}>
                                                    <Text style={[styles.expTitle, isSelected && styles.expTitleActive]} numberOfLines={2}>{exp.title}</Text>
                                                    <Text style={styles.expPrice}>€{exp.price}</Text>
                                                </View>
                                                {isSelected && (
                                                    <View style={styles.checkBadge}><Check color="#fff" size={12} strokeWidth={3} /></View>
                                                )}
                                            </TouchableOpacity>
                                        </Animated.View>
                                    );
                                })}
                        </ScrollView>
                    )}
                </View>

                <View style={{ height: 220 }} />
            </ScrollView>

            {/* Footer: hero preview card + CTA button (mirrors Valentine's footer) */}
            <View style={styles.footer}>
                {/* Hero Card Preview */}
                {!loadingExperiences && (
                    <View style={styles.footerHeroCard}>
                        <View style={styles.footerHeroRow}>
                            <View style={styles.heroIconBox}>
                                {selectedExperience ? (
                                    <Image source={{ uri: selectedExperience.coverImageUrl }} style={styles.heroImage} resizeMode="cover" />
                                ) : (
                                    <View style={{ justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                                        <Text style={{ fontSize: 20 }}>🎯</Text>
                                    </View>
                                )}
                            </View>
                            <View style={styles.heroInfo}>
                                <Text style={styles.footerHeroTitle} numberOfLines={1}>
                                    {selectedExperience ? selectedExperience.title : 'No dream reward'}
                                </Text>
                                {selectedExperience ? (
                                    <View style={styles.heroPriceRow}>
                                        <Text style={styles.heroPrice}>€{selectedExperience.price}</Text>
                                        <Text style={styles.heroPriceLabel}>per person</Text>
                                    </View>
                                ) : (
                                    <Text style={styles.heroPriceLabel}>Accountability only</Text>
                                )}
                            </View>
                        </View>

                        {selectedGoal && (
                            <Animated.View style={[
                                styles.heroContextRow,
                                { opacity: goalStripAnim, transform: [{ translateY: goalStripAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
                            ]}>
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
                            </Animated.View>
                        )}
                    </View>
                )}

                <AnimatePresence>
                    {!!selectedGoal && (
                        <MotiView
                            from={{ opacity: 0, translateY: 24 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            exit={{ opacity: 0, translateY: 24 }}
                            transition={{ type: 'spring', damping: 22, stiffness: 180 }}
                        >
                            <TouchableOpacity style={styles.createButton} onPress={handleCreate} activeOpacity={0.9}>
                                <LinearGradient colors={Colors.gradientDark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createButtonGradient}>
                                    <Text style={styles.createButtonText}>
                                        {state.user?.id ? 'Create Challenge' : 'Sign Up & Create Challenge'}
                                    </Text>
                                    <ChevronRight color="#fff" size={20} strokeWidth={3} />
                                </LinearGradient>
                            </TouchableOpacity>
                        </MotiView>
                    )}
                </AnimatePresence>
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
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 24,
        paddingBottom: 20,
    },
    section: {
        marginBottom: 20,
    },
    sectionLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1F2937',
        marginBottom: 12,
    },
    sectionSubtitle: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 14,
        marginTop: 4,
    },
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
        marginTop: 12,
    },
    goalChip: {
        width: '30%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
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
        fontSize: 20,
    },
    goalName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#6B7280',
    },
    goalNameActive: {
        color: '#fff',
    },
    customGoalContainer: {
        marginTop: 16,
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
    experienceScroll: {
        paddingVertical: 4,
    },
    expCard: {
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: '#E5E7EB',
        borderRadius: 16,
        padding: 12,
        marginRight: 12,
        width: 110,
        height: 155,
        alignItems: 'center',
        position: 'relative',
    },
    expCardActive: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primarySurface,
    },
    expIconBox: {
        width: 64,
        height: 64,
        borderRadius: 12,
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
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
    },
    expTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#6B7280',
        textAlign: 'center',
    },
    expTitleActive: {
        color: Colors.primary,
    },
    expPrice: {
        fontSize: 12,
        fontWeight: '800',
        color: '#1F2937',
        textAlign: 'center',
        marginTop: 2,
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

    // Summary
    summaryCard: {
        backgroundColor: Colors.primarySurface,
        borderRadius: 20,
        padding: 24,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary,
    },
    summaryTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#1F2937',
        marginBottom: 8,
    },
    summaryText: {
        fontSize: 15,
        lineHeight: 24,
        color: '#4B5563',
    },
    summaryReward: {
        fontSize: 14,
        color: Colors.primary,
        fontWeight: '600',
        marginTop: 8,
        fontStyle: 'italic',
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
        marginBottom: 6,
    },
    filterScrollContainer: {
        position: 'relative',
        flex: 1,
        marginLeft: 8,
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
    heroPriceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    heroPrice: {
        fontSize: 20,
        fontWeight: '900',
        color: Colors.primary,
    },
    heroPriceLabel: {
        fontSize: 13,
        color: '#9CA3AF',
        fontWeight: '600',
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
