// ValentineGoalSettingScreen.tsx
// Screen for customizing and creating Valentine challenge goals

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Platform,
    ActivityIndicator,
    Alert,
    TextInput,
    Image,
    Dimensions,
    Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Heart, ChevronLeft, Target, Calendar, Check, Clock } from 'lucide-react-native';
import { RootStackParamList, ValentineChallenge, Goal } from '../types';
import { useApp } from '../context/AppContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { logger } from '../utils/logger';
import { goalService } from '../services/GoalService';

const { width } = Dimensions.get('window');

// Goal types - exactly like ValentinesChallengeScreen.tsx
const GOAL_TYPES = [
    { icon: '🏋️', name: 'Gym', color: '#8B5CF6' },
    { icon: '🧘', name: 'Yoga', color: '#EC4899' },
    { icon: '🏃‍♀️', name: 'Run', color: '#3B82F6' },
];

// Modern Slider Component - copied from ValentinesChallengeScreen.tsx
const ModernSlider = ({
    label,
    value,
    min,
    max,
    onChange,
    leftLabel,
    rightLabel,
    unit,
    unitPlural,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (val: number) => void;
    leftLabel: string;
    rightLabel: string;
    unit?: string;
    unitPlural?: string;
}) => {
    const handlePress = (event: any) => {
        const { locationX } = event.nativeEvent;
        const trackWidth = width - 96; // Container width minus padding
        const percentage = Math.max(0, Math.min(1, locationX / trackWidth));
        const newValue = Math.round(min + percentage * (max - min));
        onChange(newValue);
    };

    const progress = ((value - min) / (max - min)) * 100;

    // Determine which unit to display
    const displayUnit = unit && unitPlural ? (value === 1 ? unit : unitPlural) : '';

    return (
        <View style={styles.sliderContainer}>
            <Text style={styles.sliderTitle}>{label}</Text>
            <View style={styles.sliderValueRow}>
                <Text style={styles.sliderValue}>{value}</Text>
                {displayUnit && <Text style={styles.sliderUnit}>{displayUnit}</Text>}
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

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ValentineGoalSetting'>;

const ValentineGoalSettingScreen = () => {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute();
    const { state, dispatch } = useApp();

    const params = route.params as { challenge: ValentineChallenge; isPurchaser: boolean };
    const { challenge, isPurchaser } = params || {};

    const [experience, setExperience] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    // ✅ Customization state (pre-filled from purchase)
    const [customWeeks, setCustomWeeks] = useState(challenge?.weeks || 3);
    const [customSessions, setCustomSessions] = useState(challenge?.sessionsPerWeek || 2);
    const [customCategory, setCustomCategory] = useState(challenge?.goalType || 'Yoga');
    const [customGoal, setCustomGoal] = useState(''); // For custom goal input
    const [customHours, setCustomHours] = useState('0');
    const [customMinutes, setCustomMinutes] = useState('30');

    // Animation state for goal details
    const [hasInteracted, setHasInteracted] = useState(false);
    const summaryAnim = React.useRef(new Animated.Value(0)).current;

    // Validation warnings
    const [showWeeksWarning, setShowWeeksWarning] = useState(false);
    const [showSessionsWarning, setShowSessionsWarning] = useState(false);
    const [showTimeWarning, setShowTimeWarning] = useState(false);

    // Load experience details
    useEffect(() => {
        const loadExperience = async () => {
            if (!challenge?.experienceId) {
                Alert.alert('Error', 'Invalid challenge data');
                navigation.navigate('Goals');
                return;
            }

            try {
                const expDoc = await getDoc(doc(db, 'experiences', challenge.experienceId));
                if (expDoc.exists()) {
                    setExperience({ id: expDoc.id, ...expDoc.data() });
                } else {
                    Alert.alert('Error', 'Experience not found');
                    navigation.navigate('Goals');
                }
            } catch (error) {
                logger.error('Error loading experience:', error);
                Alert.alert('Error', 'Failed to load experience');
                navigation.navigate('Goals');
            } finally {
                setIsLoading(false);
            }
        };

        loadExperience();
    }, [challenge]);

    // Require authentication
    useEffect(() => {
        if (!state.user) {
            Alert.alert(
                'Sign In Required',
                'Please sign in to create your Valentine challenge goal',
                [{ text: 'OK', onPress: () => navigation.navigate('Auth') }]
            );
        }
    }, [state.user]);

    const sanitizeNumericInput = (text: string) => text.replace(/[^0-9]/g, '');

    // Trigger animation on first interaction
    const triggerInteractionAnimation = () => {
        if (!hasInteracted) {
            setHasInteracted(true);
            Animated.spring(summaryAnim, {
                toValue: 1,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
            }).start();
        }
    };

    const handleCreateGoal = async () => {
        // ✅ SECURITY: Prevent duplicate submissions
        if (isCreating) {
            logger.warn('Goal creation already in progress, ignoring duplicate click');
            return;
        }

        if (!state.user) {
            Alert.alert('Error', 'You must be signed in');
            return;
        }

        // Validation
        const hoursNum = parseInt(customHours || '0');
        const minutesNum = parseInt(customMinutes || '0');

        if (customWeeks > 5) {
            Alert.alert('Error', 'Maximum duration is 5 weeks');
            return;
        }

        if (customSessions > 7) {
            Alert.alert('Error', 'Maximum sessions per week is 7');
            return;
        }

        if (hoursNum === 0 && minutesNum === 0) {
            Alert.alert('Error', 'Please set a time commitment for each session');
            return;
        }

        if (hoursNum > 3 || (hoursNum === 3 && minutesNum > 0)) {
            Alert.alert('Error', 'Maximum time per session is 3 hours');
            return;
        }

        setIsCreating(true);

        try {
            // Check if the code was already redeemed
            const challengeDoc = await getDoc(doc(db, 'valentineChallenges', challenge.id));
            const challengeData = challengeDoc.data();

            if (!challengeData) {
                throw new Error('Challenge not found');
            }

            const isAlreadyRedeemed = isPurchaser
                ? challengeData.purchaserCodeRedeemed
                : challengeData.partnerCodeRedeemed;

            if (isAlreadyRedeemed) {
                Alert.alert('Already Redeemed', 'You have already created a goal for this challenge');
                navigation.navigate('Goals');
                return;
            }

            // ✅ BUILD PROPER GOAL STRUCTURE (matching GoalSettingScreen.tsx)
            const now = new Date();
            const durationInDays = customWeeks * 7;
            const endDate = new Date(now);
            endDate.setDate(now.getDate() + durationInDays);

            // Use custom goal if provided, otherwise use selected category
            const finalGoalType = customGoal.trim() || customCategory;

            const goalData: Omit<Goal, 'id'> & { sessionsPerWeek: number } = {
                // User & metadata
                userId: state.user.id,
                title: `${finalGoalType} Challenge`,
                description: `Valentine's ${finalGoalType} for ${customWeeks} weeks, ${customSessions}×/week`,

                // Counts & Progress
                targetCount: customWeeks,
                currentCount: 0,
                weeklyCount: 0,
                sessionsPerWeek: customSessions,

                // Timing
                frequency: 'weekly',
                duration: durationInDays,
                startDate: now,
                endDate,
                weekStartAt: null,
                plannedStartDate: now,

                // Status
                isActive: true,
                isCompleted: false,
                isRevealed: challenge.mode === 'revealed',

                // Experience details
                location: experience?.location || '',
                targetHours: hoursNum,
                targetMinutes: minutesNum,

                // Metadata
                weeklyLogDates: [],
                createdAt: now,

                // ⭐ VALENTINE-SPECIFIC
                valentineChallengeId: challenge.id,

                // Valentine goals don't have experienceGiftId or empoweredBy
                experienceGiftId: '', // Empty for Valentine goals
                approvalStatus: 'approved', // Auto-approved
                giverActionTaken: true,
                initialTargetCount: customWeeks,
                initialSessionsPerWeek: customSessions,
            };

            // ✅ CREATE GOAL ATOMICALLY WITH TRANSACTION
            // This eliminates race conditions and permission errors by doing everything in one atomic operation
            const { goal, isNowActive } = await goalService.createValentineGoal(
                state.user.id,
                challenge.id,
                goalData as Goal,
                isPurchaser
            );

            logger.log('✅ Created Valentine goal atomically:', goal.id);

            // Success - navigate immediately
            const mode = challenge.mode === 'secret' ? '🎁 Secret' : '👁️ Revealed';

            navigation.reset({
                index: 0,
                routes: [{ name: 'Goals' }],
            });

            // Show success message
            setTimeout(() => {
                Alert.alert(
                    '🎉 Goal Created!',
                    isNowActive
                        ? `Your Valentine's challenge is now active! You and your partner are linked. Mode: ${mode}`
                        : `Your goal is ready! Your partner will be notified when they redeem their code. Mode: ${mode}`
                );
            }, 100);
        } catch (error: any) {
            logger.error('Error creating Valentine goal:', error);

            // Handle specific errors
            if (error.message === 'Code already redeemed') {
                Alert.alert('Already Redeemed', 'You have already created a goal for this challenge');
            } else if (error.message === 'Challenge not found') {
                Alert.alert('Error', 'This challenge no longer exists');
            } else {
                Alert.alert('Error', error.message || 'Failed to create goal');
            }
        } finally {
            setIsCreating(false);
        }
    };
    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FF6B9D" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.navigate('RecipientFlow', { screen: 'CouponEntry' })}
                    style={styles.backButton}
                >
                    <ChevronLeft color="#111" size={24} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Customize Your Goal</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
                {/* Goal Type - EXACTLY like ValentinesChallengeScreen.tsx */}
                <View style={styles.section}>
                    <View style={styles.goalGrid}>
                        {GOAL_TYPES.map((goal) => (
                            <TouchableOpacity
                                key={goal.name}
                                style={[
                                    styles.goalChip,
                                    customCategory === goal.name && { backgroundColor: goal.color }
                                ]}
                                onPress={() => {
                                    setCustomCategory(goal.name);
                                    setCustomGoal(''); // Clear custom goal when selecting preset
                                    triggerInteractionAnimation();
                                }}
                            >
                                <Text style={styles.goalIcon}>{goal.icon}</Text>
                                <Text style={[
                                    styles.goalName,
                                    customCategory === goal.name && styles.goalNameActive
                                ]}>{goal.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Custom Goal Input */}
                    <View style={styles.customGoalContainer}>
                        <Text style={styles.customGoalLabel}>Or enter your custom goal:</Text>
                        <View style={styles.customGoalInputWrapper}>
                            <Text style={styles.customGoalIcon}>✨</Text>
                            <TextInput
                                style={styles.customGoalInput}
                                placeholder="e.g., Cook, Paint, Write..."
                                placeholderTextColor="#9ca3af"
                                value={customGoal}
                                onChangeText={(text) => {
                                    setCustomGoal(text);
                                    if (text.trim()) {
                                        setCustomCategory(''); // Clear preset selection when typing custom
                                    }
                                    triggerInteractionAnimation();
                                }}
                            />
                        </View>
                    </View>
                </View>

                {/* Challenge Intensity - Modern Sliders */}
                <View style={styles.section}>

                    <ModernSlider
                        label="Duration"
                        value={customWeeks}
                        min={1}
                        max={5}
                        onChange={(val) => {
                            setCustomWeeks(val);
                            setShowWeeksWarning(val > 5);
                        }}
                        leftLabel="Chill"
                        rightLabel="Intense"
                        unit="week"
                        unitPlural="weeks"
                    />

                    <ModernSlider
                        label="Weekly Sessions"
                        value={customSessions}
                        min={1}
                        max={7}
                        onChange={(val) => {
                            setCustomSessions(val);
                            setShowSessionsWarning(val > 7);
                        }}
                        leftLabel="Easy"
                        rightLabel="Beast"
                    />

                    {/* Time Per Session */}
                    <View style={styles.sliderContainer}>
                        <Text style={styles.sliderTitle}>Time Per Session</Text>
                        <View style={styles.timeInputRow}>
                            <View style={styles.timeInputGroup}>
                                <TextInput
                                    style={[styles.timeInput, showTimeWarning && { borderColor: '#d48a1b' }]}
                                    value={customHours}
                                    onChangeText={(t) => {
                                        const clean = sanitizeNumericInput(t);
                                        const h = parseInt(clean || '0');
                                        const m = parseInt(customMinutes || '0');
                                        setCustomHours(clean);
                                        setShowTimeWarning(h > 3 || (h === 3 && m > 0));
                                    }}
                                    keyboardType="numeric"
                                />
                                <Text style={styles.timeLabel}>hours</Text>
                            </View>
                            <View style={styles.timeInputGroup}>
                                <TextInput
                                    style={[styles.timeInput, showTimeWarning && { borderColor: '#d48a1b' }]}
                                    value={customMinutes}
                                    onChangeText={(t) => {
                                        const clean = sanitizeNumericInput(t);
                                        let m = parseInt(clean || '0');
                                        if (m > 59) m = 59;
                                        const h = parseInt(customHours || '0');
                                        setCustomMinutes(m.toString());
                                        setShowTimeWarning(h > 3 || (h === 3 && m > 0));
                                    }}
                                    keyboardType="numeric"
                                />
                                <Text style={styles.timeLabel}>min</Text>
                            </View>
                        </View>
                        {showTimeWarning && (
                            <Text style={styles.limitedNotice}>
                                Maximum session time is <Text style={{ fontWeight: 'bold' }}>3 hours</Text>.
                            </Text>
                        )}
                    </View>
                </View>

                {/* Info Boxes */}
                <View style={styles.infoSection}>
                    <View style={styles.infoBox}>
                        <Text style={styles.infoTitle}>💪 Coupled Progress</Text>
                        <Text style={styles.infoText}>
                            Both partners must complete their weekly goals before either can advance to the next week. Stay motivated together!
                        </Text>
                    </View>

                    {challenge.mode === 'secret' && (
                        <View style={[styles.infoBox, styles.secretInfoBox]}>
                            <Text style={styles.infoTitle}>🎁 Secret Mode Active</Text>
                            <Text style={styles.infoText}>
                                The experience will remain hidden! You'll discover it at the end as you complete sessions.
                            </Text>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Footer with Hero Card and Button */}
            <View style={styles.footer}>
                {/* Hero Card - Now in footer */}
                {isLoading || !experience ? (
                    <ActivityIndicator color="#FF6B9D" style={{ marginBottom: 16 }} />
                ) : (
                    <View style={styles.heroCard}>
                        <View style={styles.heroMainRow}>
                            <View style={styles.heroIconBox}>
                                {challenge.mode === 'revealed' && experience?.coverImageUrl ? (
                                    <Image
                                        source={{ uri: experience.coverImageUrl }}
                                        style={styles.heroImage}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <View style={styles.secretIconContainer}>
                                        <Heart color="#FF6B9D" size={32} fill="#FF6B9D" />
                                    </View>
                                )}
                            </View>
                            <View style={styles.heroInfo}>
                                <Text style={styles.heroTitle}>
                                    {challenge.mode === 'revealed'
                                        ? experience?.title || 'Experience'
                                        : 'Your reward is a surprise'
                                    }
                                </Text>
                                <Text style={styles.heroLocation}>
                                    {challenge.mode === 'revealed'
                                        ? experience?.subtitle || ''
                                        : 'Keep showing up to reveal it with your effort'
                                    }
                                </Text>
                            </View>
                        </View>

                        {/* Animated Summary Badges - Show after first interaction */}
                        {hasInteracted && (
                            <Animated.View
                                style={[
                                    styles.heroContextRow,
                                    {
                                        opacity: summaryAnim,
                                        transform: [{
                                            translateY: summaryAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [20, 0],
                                            }),
                                        }],
                                    },
                                ]}
                            >
                                <View style={styles.contextBadge}>
                                    <Text style={styles.contextEmoji}>
                                        {customGoal.trim() ? '✨' :
                                            customCategory === 'Yoga' ? '🧘' :
                                                customCategory === 'Gym' ? '🏋️' :
                                                    customCategory === 'Run' ? '🏃‍♀️' : '🎯'}
                                    </Text>
                                    <Text style={styles.contextText}>
                                        {customGoal.trim() || customCategory || 'Select goal'}
                                    </Text>
                                </View>
                                <View style={styles.contextDivider} />
                                <View style={styles.contextBadge}>
                                    <Text style={styles.contextLabel}>{customWeeks} weeks</Text>
                                </View>
                                <View style={styles.contextDivider} />
                                <View style={styles.contextBadge}>
                                    <Text style={styles.contextLabel}>{customSessions} sessions/wk</Text>
                                </View>
                                <View style={styles.contextDivider} />
                                <View style={styles.contextBadge}>
                                    <Text style={styles.contextLabel}>{customHours}h {customMinutes}m</Text>
                                </View>
                            </Animated.View>
                        )}
                    </View>
                )}

                {/* Create Goal Button */}
                <TouchableOpacity
                    style={[styles.createButton, isCreating && styles.createButtonDisabled]}
                    onPress={handleCreateGoal}
                    disabled={isCreating || !state.user}
                >
                    {isCreating ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.createButtonText}>Create My Goal</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        paddingBottom: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    // Hero Card Styles (now in footer)
    heroCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
    },
    heroMainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    heroInfo: {
        flex: 1,
        marginLeft: 16,
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
    secretIconContainer: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFF0F5',
    },
    heroTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1F2937',
        marginBottom: 4,
    },
    heroLocation: {
        fontSize: 14,
        color: '#6B7280',
    },
    heroContextRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 10,
        justifyContent: 'space-between',
    },
    contextBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    contextDivider: {
        width: 1,
        height: 16,
        backgroundColor: '#E5E7EB',
    },
    contextEmoji: {
        fontSize: 14,
    },
    contextText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#4B5563',
    },
    contextLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#6B7280',
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 24,
    },
    section: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1F2937',
        marginBottom: 16,
    },
    // Goal Grid Styles - from ValentinesChallengeScreen
    goalGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    goalChip: {
        width: '31%', // Force 3 columns (approx 100% / 3 minus gap)
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
    goalIcon: {
        fontSize: 20,
    },
    goalName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#6B7280',
    },
    goalNameActive: {
        color: '#fff',
    },
    // Custom Goal Input Styles - from ValentinesChallengeScreen
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
    // Slider Styles - from ValentinesChallengeScreen
    sliderContainer: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    sliderTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#6B7280',
        marginBottom: 4,
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
        backgroundColor: '#FF6B9D',
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
        backgroundColor: '#FF6B9D',
    },
    timeInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
    },
    timeInputGroup: {
        alignItems: 'center',
        gap: 8,
    },
    timeInput: {
        width: 70,
        height: 60,
        borderWidth: 2,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        backgroundColor: '#F9FAFB',
        paddingHorizontal: 12,
        fontSize: 24,
        fontWeight: '700',
        color: '#1F2937',
        textAlign: 'center',
    },
    timeLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
    },
    limitedNotice: {
        fontSize: 13,
        color: '#d48a1b',
        marginTop: 12,
        textAlign: 'center',
    },
    scrollContent: {
        paddingBottom: 40,
    },
    infoSection: {
        marginTop: 16,
        gap: 16,
    },
    infoBox: {
        backgroundColor: '#EEF2FF',
        borderRadius: 16,
        padding: 18,
    },
    secretInfoBox: {
        backgroundColor: '#FFF7ED',
    },
    infoTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111',
        marginBottom: 8,
    },
    infoText: {
        fontSize: 13,
        color: '#6B7280',
        lineHeight: 18,
    },
    footer: {
        padding: 16,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    createButton: {
        backgroundColor: '#FF6B9D',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        shadowColor: '#FF6B9D',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    createButtonDisabled: {
        backgroundColor: '#D1D5DB',
        shadowOpacity: 0,
    },
    createButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
});

export default ValentineGoalSettingScreen;
