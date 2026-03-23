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
    Image,
    Animated,
    Alert,
    KeyboardAvoidingView,
} from 'react-native';
import { TextInput } from '../components/TextInput';
import { StatusBar } from 'expo-status-bar';
import { useRoute } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, Check, Info } from 'lucide-react-native';
import { MotiView, AnimatePresence } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import {
    Experience,
    ExperienceCategory,
    GiftChallengeType,
    GiftRevealMode,
    GiftPaymentChoice,
    GiftFlowPrefill,
} from '../types';
import { useRootNavigation } from '../types/navigation';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { config } from '../config/environment';
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
import Svg, { Circle, Path } from 'react-native-svg';
import ExperienceDetailModal from '../components/ExperienceDetailModal';

// ─── Goal type options (Together flow) ───────────────────────────────────────
const GOAL_TYPES = [
    { icon: '\u{1F3CB}\uFE0F', name: 'Gym', color: '#10B981' },
    { icon: '\u{1F9D8}', name: 'Yoga', color: '#8B5CF6' },
    { icon: '\u{1F57A}', name: 'Dance', color: '#F59E0B' },
    { icon: '\u270F\uFE0F', name: 'Add your own', color: '#6B7280' },
];

// ─── Step titles (dynamic based on challengeType) ────────────────────────────
const SOLO_STEP_TITLES = [
    'Who takes the challenge?',
    'Pick the reward',
    'Secure the reward',
    'How is the reward revealed?',
    'Confirm your gift',
];

const SOLO_STEP_SUBTITLES = [
    'Choose how they will work towards their goal.',
    "Pick a category. We'll recommend the perfect reward!",
    "Choose how you'd like to back this challenge.",
    "Should they know what they're working towards?",
    'Review everything before sending.',
];

const TOGETHER_STEP_TITLES = [
    'Who takes the challenge?',
    'What type of challenge?',
    'Set your challenge',
    'How long per session?',
    'Pick the reward',
    'Secure the reward',
    'How is the reward revealed?',
    'Confirm your gift',
];

const TOGETHER_STEP_SUBTITLES = [
    'Choose how they will work towards their goal.',
    'Pick the activity for your challenge',
    'Set the challenge intensity for both of you.',
    'Set the duration for each time you show up.',
    "Pick a category. We'll recommend the perfect reward!",
    "Choose how you'd like to back this challenge.",
    "Should they know what you're both working towards?",
    'Review everything before sending.',
];

// ─── Challenge type options ───────────────────────────────────────────────────
const getTypeOptions = (colors: typeof Colors): { key: GiftChallengeType; emoji: string; label: string; tagline: string; color: string }[] => [
    {
        key: 'solo',
        emoji: '👤',
        label: 'Just them',
        tagline: 'They work on the goal. You gift the reward when they succeed.',
        color: colors.warning,
    },
    {
        key: 'shared',
        emoji: '👥',
        label: 'Together',
        tagline: 'You both commit to a goal. The reward unlocks for both of you.',
        color: colors.secondary,
    },
];

// ─── Reveal options ───────────────────────────────────────────────────────────
const getRevealOptions = (colors: typeof Colors): { key: GiftRevealMode; emoji: string; label: string; tagline: string; color: string; badge?: string }[] => [
    {
        key: 'revealed',
        emoji: '👁️',
        label: 'Revealed',
        tagline: 'They know the reward from day one. Full motivation to earn it.',
        color: colors.warning,
    },
    {
        key: 'secret',
        emoji: '🔒',
        label: 'Secret',
        tagline: 'The reward stays hidden. Ernit drops hints every session.',
        color: colors.secondary,
        badge: 'Surprise factor',
    },
];

// Alias so JSX call sites don't need to change
const ProgressBar = WizardProgressBar;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GiftFlowScreen() {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const TYPE_OPTIONS = useMemo(() => getTypeOptions(colors), [colors]);
    const REVEAL_OPTIONS = useMemo(() => getRevealOptions(colors), [colors]);
    const navigation = useRootNavigation();
    const route = useRoute();
    const routeParams = route.params as { prefill?: GiftFlowPrefill } | undefined;
    const { state } = useApp();
    const { showError } = useToast();

    // Wizard step
    const [currentStep, setCurrentStep] = useState(1);

    // Step 1: Challenge type
    const [challengeType, setChallengeType] = useState<GiftChallengeType | null>(null);

    // Step 2 (together only): Goal type
    const [selectedGoalType, setSelectedGoalType] = useState<string | null>(null);
    const [customGoalType, setCustomGoalType] = useState('');

    // Step 3 (together only): Goal config
    const [weeks, setWeeks] = useState(3);
    const [sessionsPerWeek, setSessionsPerWeek] = useState(3);
    const [hours, setHours] = useState('');
    const [minutes, setMinutes] = useState('');
    const [sessionMinutes, setSessionMinutes] = useState(30);
    const [showCustomTime, setShowCustomTime] = useState(false);
    // Experience selection
    const [experiences, setExperiences] = useState<Experience[]>([]);
    const [selectedExperience, setSelectedExperience] = useState<Experience | null>(null);
    const [loadingExperiences, setLoadingExperiences] = useState(true);
    const [preferredRewardCategory, setPreferredRewardCategory] = useState<ExperienceCategory | null>(null);
    const [showExperiencePicker, setShowExperiencePicker] = useState(false);
    const [detailExperience, setDetailExperience] = useState<Experience | null>(null);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [showFilterScrollHint, setShowFilterScrollHint] = useState(true);

    // Personalized message
    const [personalizedMessage, setPersonalizedMessage] = useState('');

    // Reveal mode
    const [revealMode, setRevealMode] = useState<GiftRevealMode | null>(null);

    // Payment
    const [paymentChoice, setPaymentChoice] = useState<GiftPaymentChoice | null>(null);

    // Together-specific
    const sameExperienceForBoth = true;

    // UI state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [validationErrors, setValidationErrors] = useState({
        type: false,
        time: false,
        experience: false,
        revealMode: false,
        paymentChoice: false,
    });

    // Dynamic step count
    // Solo: Type → Experience → Reveal → Payment → Confirm = 5 (always)
    // Together: Type → Intensity → Time → Experience → Reveal → Payment → Confirm = 7
    //   (if category chosen instead of browse: skip Payment step = 6)
    const hasRevealStep = true; // Always show reveal step now (secret default)
    const needsPaymentStep = challengeType === 'solo' || !!selectedExperience;
    const totalSteps = challengeType === 'shared'
        ? (needsPaymentStep ? 8 : 7)
        : 5; // Solo is always 5 steps

    // Animations
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const scrollViewRef = useRef<ScrollView>(null);

    // Refs for focus chaining
    const minutesRef = useRef<RNTextInput>(null);

    // Step titles/subtitles (dynamic — use lookup functions to handle free-payment step skipping)
    const getStepTitle = (): string => {
        if (currentStep === 1) return 'Choose a type';
        if (challengeType === 'shared' && currentStep === 2) return TOGETHER_STEP_TITLES[1];
        if (challengeType === 'shared' && currentStep === 3) return TOGETHER_STEP_TITLES[2];
        if (challengeType === 'shared' && currentStep === 4) return TOGETHER_STEP_TITLES[3];
        if (currentStep === getExperienceStep()) return challengeType === 'solo' ? 'Pick a reward' : 'Pick a reward';
        if (currentStep === getRevealStep()) return 'How is the reward revealed?';
        if (needsPaymentStep && currentStep === getPaymentStep()) return 'Secure the reward';
        if (currentStep === getConfirmStep()) return 'Confirm your gift';
        return '';
    };
    const getStepSubtitle = (): string => {
        if (currentStep === 1) return 'Choose how they will work towards their goal.';
        if (challengeType === 'shared' && currentStep === 2) return TOGETHER_STEP_SUBTITLES[1];
        if (challengeType === 'shared' && currentStep === 3) return TOGETHER_STEP_SUBTITLES[2];
        if (challengeType === 'shared' && currentStep === 4) return TOGETHER_STEP_SUBTITLES[3];
        const expStep = getExperienceStep();
        if (currentStep === expStep) return "Pick a category. We'll recommend the perfect reward!";
        const payStep = getPaymentStep();
        if (currentStep === payStep) return "Choose how you'd like to back this challenge.";
        const revealStep = getRevealStep();
        if (hasRevealStep && currentStep === revealStep) return challengeType === 'shared'
            ? "Should they know what you're both working towards?"
            : "Should they know what they're working towards?";
        const confirmStep = getConfirmStep();
        if (currentStep === confirmStep) return 'Review everything before sending.';
        return '';
    };

    // Exit confirmation for unsaved wizard progress
    useEffect(() => {
        const unsubscribe = (navigation as any).addListener('beforeRemove', (e: any) => {
            if (currentStep === 1) return; // Allow back from step 1
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

    // Prefill from auth redirect
    useEffect(() => {
        if (routeParams?.prefill) {
            const p = routeParams.prefill;
            if (p.currentStep) setCurrentStep(p.currentStep);
            if (p.challengeType) setChallengeType(p.challengeType);
            // Support both saved key formats (weeks from storage, durationWeeks from type)
            if (p.weeks) setWeeks(p.weeks);
            else if (p.durationWeeks) setWeeks(p.durationWeeks);
            if (p.sessionsPerWeek) setSessionsPerWeek(p.sessionsPerWeek);
            // Support both saved key formats (hours/minutes strings from storage, targetHours/targetMinutes numbers from type)
            if (p.hours !== undefined) setHours(String(p.hours));
            else if (p.targetHours !== undefined) setHours(String(p.targetHours));
            if (p.minutes !== undefined) setMinutes(String(p.minutes));
            else if (p.targetMinutes !== undefined) setMinutes(String(p.targetMinutes));
            if (p.sessionMinutes) setSessionMinutes(p.sessionMinutes);
            if (p.showCustomTime) setShowCustomTime(p.showCustomTime);
            if (p.experience) setSelectedExperience(p.experience);
            if (p.preferredRewardCategory) setPreferredRewardCategory(p.preferredRewardCategory as ExperienceCategory);
            if (p.revealMode) setRevealMode(p.revealMode);
            if (p.paymentChoice) setPaymentChoice(p.paymentChoice);
            if (p.personalizedMessage) setPersonalizedMessage(p.personalizedMessage);
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

    // Clamp currentStep if totalSteps changes (e.g., switching from browse to category in Together)
    useEffect(() => {
        if (currentStep > totalSteps) {
            setCurrentStep(totalSteps);
        }
    }, [totalSteps, currentStep]);

    // ─── Map logical step number to absolute step index ───────────────────────
    // Solo:    1=Type, 2=Experience, 3=Reveal, 4=Payment, 5=Confirm
    // Together (browse): 1=Type, 2=Intensity, 3=Time, 4=Experience, 5=Reveal, 6=Payment, 7=Confirm
    // Together (category): 1=Type, 2=Intensity, 3=Time, 4=Experience, 5=Reveal, 6=Confirm
    const getExperienceStep = () => challengeType === 'shared' ? 5 : 2;
    const getRevealStep = () => challengeType === 'shared' ? 6 : 3;
    const getPaymentStep = () => challengeType === 'shared' ? 7 : 4;
    const getConfirmStep = () => needsPaymentStep
        ? (challengeType === 'shared' ? 8 : 5)
        : (challengeType === 'shared' ? 7 : 5); // Solo always 5

    // ─── Per-step validation ──────────────────────────────────────────────────
    const validateCurrentStep = (): boolean => {
        if (currentStep === 1) {
            if (!challengeType) {
                setValidationErrors(prev => ({ ...prev, type: true }));
                return false;
            }
            setValidationErrors(prev => ({ ...prev, type: false }));
            return true;
        }

        if (challengeType === 'shared' && currentStep === 2) {
            // Goal type selection
            if (!selectedGoalType) {
                showError('Please select a challenge type');
                return false;
            }
            if (selectedGoalType === 'Add your own' && !customGoalType.trim()) {
                showError('Please enter your custom challenge type');
                return false;
            }
            return true;
        }

        if (challengeType === 'shared' && currentStep === 3) {
            // Sliders have defaults — always valid
            return true;
        }

        if (challengeType === 'shared' && currentStep === 4) {
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

        if (currentStep === getExperienceStep()) {
            // Solo: must pick specific experience. Together: experience or category.
            if (challengeType === 'solo' && !selectedExperience) {
                setValidationErrors(prev => ({ ...prev, experience: true }));
                return false;
            }
            if (challengeType === 'shared' && !selectedExperience && !preferredRewardCategory) {
                setValidationErrors(prev => ({ ...prev, experience: true }));
                return false;
            }
            setValidationErrors(prev => ({ ...prev, experience: false }));
            return true;
        }

        if (currentStep === getRevealStep()) {
            // Reveal mode defaults to 'secret' — always valid since we auto-set it
            if (!revealMode) {
                setRevealMode('secret');
            }
            setValidationErrors(prev => ({ ...prev, revealMode: false }));
            return true;
        }

        if (needsPaymentStep && currentStep === getPaymentStep()) {
            if (!paymentChoice) {
                setValidationErrors(prev => ({ ...prev, paymentChoice: true }));
                return false;
            }
            setValidationErrors(prev => ({ ...prev, paymentChoice: false }));
            return true;
        }

        return true;
    };

    const handleNext = () => {
        if (!validateCurrentStep()) return;
        if (currentStep < totalSteps) {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setCurrentStep(prev => prev + 1);
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        }
    };

    const handleBack = () => {
        if (showExperiencePicker) {
            setShowExperiencePicker(false);
            setSelectedExperience(null);
            setValidationErrors(prev => ({ ...prev, experience: false }));
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        } else if (currentStep > 1) {
            setCurrentStep(prev => prev - 1);
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        } else {
            navigation.goBack();
        }
    };

    // ─── Create gift ──────────────────────────────────────────────────────────
    const handleCreate = async () => {
        if (!validateCurrentStep()) return;

        if (state.user?.id) {
            setShowConfirm(true);
        } else {
            const giftConfig = {
                currentStep,
                challengeType,
                weeks,
                sessionsPerWeek,
                hours,
                minutes,
                sessionMinutes,
                showCustomTime,
                experience: selectedExperience || null,
                preferredRewardCategory: preferredRewardCategory || null,
                revealMode,
                paymentChoice,
                sameExperienceForBoth,
                personalizedMessage,
            };
            try {
                await setStorageItem('pending_gift_flow', JSON.stringify(giftConfig));
                navigation.navigate('Auth', { mode: 'signup' });
            } catch (error) {
                logger.error('Error storing gift flow config:', error);
                showError('Something went wrong. Please try again.');
            }
        }
    };

    const confirmCreateGoal = async () => {
        if (isSubmitting || !state.user?.id) return;

        // Giver flows require a specific experience (no free option)
        if (!selectedExperience) {
            showError('Please select a specific experience');
            return;
        }

        setIsSubmitting(true);

        try {
            // Both payNow and payLater create the gift doc via createDeferredGift.
            // payNow then routes to ExperienceCheckout for immediate payment.
            // payLater routes to DeferredSetup to save card for future charging.
            const functionName = config.giftFunctions.createDeferredGift;

            const hoursNum = showCustomTime ? parseInt(hours || '0') : Math.floor(sessionMinutes / 60);
            const minutesNum = showCustomTime ? parseInt(minutes || '0') : sessionMinutes % 60;

            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('Not authenticated');

            const response = await fetch(
                `${config.functionsUrl}/${functionName}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        experienceId: selectedExperience.id,
                        challengeType,
                        revealMode,
                        giverName: state.user.displayName || '',
                        personalizedMessage: sanitizeText(personalizedMessage.trim(), 200),
                        ...(challengeType === 'shared' ? {
                            goalName: `${weeks}-week challenge`,
                            goalType: selectedGoalType === 'Gym' ? 'gym' : selectedGoalType === 'Yoga' ? 'yoga' : selectedGoalType === 'Dance' ? 'dance' : 'custom',
                            duration: `${weeks} weeks`,
                            frequency: `${sessionsPerWeek}x per week`,
                            sessionTime: `${hoursNum}h ${minutesNum}m`,
                            sameExperienceForBoth,
                        } : {}),
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error((errorData as any)?.message || 'Failed to create gift');
            }

            const result = await response.json();
            setShowConfirm(false);

            if (paymentChoice === 'payNow') {
                // Lock it in: route to ExperienceCheckout for immediate payment
                navigation.navigate('ExperienceCheckout' as any, {
                    cartItems: [{ experienceId: selectedExperience!.id, quantity: 1 }],
                    giftId: result.gift?.id,
                });
            } else if (paymentChoice === 'payLater' && result.setupIntentClientSecret) {
                // Pay on success: save card now, charge when recipient completes
                navigation.navigate('DeferredSetup', {
                    setupIntentClientSecret: result.setupIntentClientSecret,
                    experienceGift: result.gift,
                });
            } else {
                navigation.navigate('Confirmation', { experienceGift: result.gift });
            }
        } catch (error) {
            logger.error('Error creating gift:', error);
            await logErrorToFirestore(error, {
                screenName: 'GiftFlowScreen',
                feature: 'CreateGift',
                userId: state.user?.id,
            });
            showError('Failed to create gift. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ─── Step Content Renderers ───────────────────────────────────────────────

    const renderStep1 = () => (
        <View style={styles.stepContent}>
            {validationErrors.type && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>Please choose a challenge type</Text>
                </View>
            )}
            {TYPE_OPTIONS.map((option, index) => {
                const isActive = challengeType === option.key;
                return (
                    <MotiView
                        key={option.key}
                        from={{ opacity: 0, translateY: 16 }}
                        animate={{ opacity: 1, translateY: 0 }}
                        transition={{ type: 'timing', duration: 300, delay: index * 80 }}
                    >
                        <TouchableOpacity
                            style={[styles.rewardChoice, isActive && styles.rewardChoiceActive]}
                            onPress={() => {
                                setChallengeType(option.key);
                                setValidationErrors(prev => ({ ...prev, type: false }));
                                // Auto-advance after brief delay so selection animation plays
                                setTimeout(() => {
                                    setCurrentStep(2);
                                    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                                }, 250);
                            }}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={`Select ${option.label} challenge type`}
                        >
                            <View style={styles.rewardChoiceHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.rewardChoiceTitle, isActive && styles.rewardChoiceTitleActive]}>{option.label}</Text>
                                    <Text style={styles.rewardChoiceDesc}>{option.tagline}</Text>
                                </View>
                                {isActive && (
                                    <View style={styles.rewardChoiceCheck}><Check color={colors.white} size={14} strokeWidth={3} /></View>
                                )}
                            </View>
                        </TouchableOpacity>
                    </MotiView>
                );
            })}
        </View>
    );

    // Step 2 (Together only): Goal type selection
    const renderGoalTypeStepTogether = () => (
        <View style={styles.stepContent}>
            <View style={styles.goalTypeGrid}>
                {GOAL_TYPES.map((type) => {
                    const isSelected = selectedGoalType === type.name;
                    const isCustom = type.name === 'Add your own';
                    return (
                        <TouchableOpacity
                            key={type.name}
                            style={[styles.goalTypeCard, isSelected && styles.goalTypeCardActive]}
                            onPress={() => {
                                setSelectedGoalType(type.name);
                                if (!isCustom) {
                                    // Auto-advance for preset types
                                    setTimeout(() => setCurrentStep(prev => prev + 1), 200);
                                }
                            }}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={`Select ${type.name} goal type`}
                        >
                            <Text style={styles.goalTypeEmoji}>{type.icon}</Text>
                            <Text style={[styles.goalTypeName, isSelected && styles.goalTypeNameActive]}>{type.name}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            {selectedGoalType === 'Add your own' && (
                <View style={{ marginTop: 16 }}>
                    <TextInput
                        label="What's your challenge?"
                        placeholder="e.g., Swimming, Pilates, Boxing..."
                        value={customGoalType}
                        onChangeText={setCustomGoalType}
                        maxLength={50}
                    />
                </View>
            )}
        </View>
    );

    // Step 3 (Together only): Set YOUR Goal — sliders only
    const renderStep2Together = () => (
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

    // Step 3 (Together only): Time per session — clock dial matching ChallengeSetupScreen
    const DIAL_SIZE = vh(250);
    const DIAL_RADIUS = DIAL_SIZE / 2;
    const DIAL_STROKE = 8;

    const renderStep3Together = () => {
        const angle = (sessionMinutes / 60) * 360;
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
        const isFullCircle = sessionMinutes >= 60;
        const arcPath = (!isFullCircle && sessionMinutes > 0)
            ? `M ${startX} ${startY} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${endX} ${endY}`
            : '';

        const handleTouch = (event: any) => {
            const { locationX, locationY } = event.nativeEvent;
            const dx = locationX - DIAL_RADIUS;
            const dy = locationY - DIAL_RADIUS;
            let a = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
            if (a < 0) a += 360;
            const mins = Math.round((a / 360) * 60 / 5) * 5;
            setSessionMinutes(Math.max(5, Math.min(60, mins)));
        };

        return (
            <View style={styles.stepContent}>
                <View style={{ alignItems: 'center', marginTop: vh(10) }}>
                    <View
                        style={{ width: DIAL_SIZE, height: DIAL_SIZE }}
                        onStartShouldSetResponder={() => true}
                        onMoveShouldSetResponder={() => true}
                        onResponderGrant={handleTouch}
                        onResponderMove={handleTouch}
                    >
                        <Svg width={DIAL_SIZE} height={DIAL_SIZE}>
                            <Circle
                                cx={DIAL_RADIUS}
                                cy={DIAL_RADIUS}
                                r={arcRadius}
                                stroke={colors.backgroundLight}
                                strokeWidth={DIAL_STROKE}
                                fill="none"
                            />
                            {isFullCircle ? (
                                <Circle
                                    cx={DIAL_RADIUS}
                                    cy={DIAL_RADIUS}
                                    r={arcRadius}
                                    stroke={colors.secondary}
                                    strokeWidth={DIAL_STROKE}
                                    fill="none"
                                />
                            ) : sessionMinutes > 0 ? (
                                <Path
                                    d={arcPath}
                                    stroke={colors.secondary}
                                    strokeWidth={DIAL_STROKE}
                                    strokeLinecap="round"
                                    fill="none"
                                />
                            ) : null}
                            <Circle
                                cx={handleX}
                                cy={handleY}
                                r={14}
                                fill={colors.secondary}
                            />
                        </Svg>

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
                                {sessionMinutes}
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

                        {[0, 15, 30, 45].map((m) => {
                            const markerAngle = ((m / 60) * 360 - 90) * Math.PI / 180;
                            const markerR = DIAL_RADIUS + 16;
                            const mx = DIAL_RADIUS + markerR * Math.cos(markerAngle);
                            const my = DIAL_RADIUS + markerR * Math.sin(markerAngle);
                            return (
                                <Text key={m} style={{
                                    position: 'absolute',
                                    left: mx - 10,
                                    top: my - 8,
                                    ...Typography.caption,
                                    fontWeight: '600',
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

                <TouchableOpacity
                    style={{ alignSelf: 'center', marginTop: vh(36) }}
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

                {showCustomTime && (
                    <MotiView
                        from={{ opacity: 0, translateY: -10 }}
                        animate={{ opacity: 1, translateY: 0 }}
                        transition={{ type: 'timing', duration: 200 }}
                        style={{ marginTop: Spacing.lg, flexDirection: 'row', justifyContent: 'center', gap: Spacing.md }}
                    >
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

    // Experience step — exact same as ChallengeSetupScreen step 4
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

    const renderExperienceStep = () => {
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
                        <ChevronLeft color={colors.primary} size={18} strokeWidth={2.5} />
                        <Text style={styles.browseBackText}>Back to categories</Text>
                    </TouchableOpacity>

                    {/* Need help choosing? — solo flow only */}
                    {challengeType === 'solo' && !selectedExperience && (
                        <View style={styles.helpChoosingCard}>
                            <Text style={styles.helpChoosingTitle}>Need help choosing?</Text>
                            <Text style={styles.helpChoosingDesc}>Here are our most popular experiences:</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                                {experiences
                                    .filter(e => e.status !== 'draft')
                                    .sort((a, b) => (a.order || 999) - (b.order || 999))
                                    .slice(0, 3)
                                    .map((exp) => renderExperienceCard(exp))}
                            </ScrollView>
                        </View>
                    )}

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

        // Solo giver: mandatory specific experience — go straight to browse
        if (challengeType === 'solo') {
            // Auto-open the experience picker for solo
            if (!showExperiencePicker) {
                setShowExperiencePicker(true);
            }
            return null; // browse mode handles rendering (above)
        }

        // Together giver: equal fork (same pattern as ChallengeSetupScreen)
        const CATEGORY_TAGLINES: Record<string, string> = {
            adventure: 'Explore something new together',
            wellness: 'Treat yourselves',
            creative: 'Make something amazing together',
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
                        accessibilityLabel="Choose a shared experience"
                    >
                        <Text style={styles.rewardCategoryEmoji}>{'\u{1F3AF}'}</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={[
                                styles.rewardCategoryLabel,
                                selectedExperience && { color: colors.primary },
                            ]}>{selectedExperience ? selectedExperience.title : 'Choose your experience'}</Text>
                            <Text style={styles.rewardCategoryTagline}>
                                {selectedExperience ? `\u20AC${selectedExperience.price}` : 'Browse shared experiences for 2'}
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

                {/* Divider */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.md }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                    <Text style={{ paddingHorizontal: Spacing.md, color: colors.textMuted, ...Typography.small }}>or surprise them</Text>
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
                                    setPaymentChoice(null);
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

    // Default to secret reveal mode
    useEffect(() => {
        if (!revealMode) {
            setRevealMode('secret');
        }
    }, [revealMode]);

    // Reveal step — secret is default, "Reveal instead" is a small escape hatch
    const renderRevealStep = () => (
        <View style={styles.stepContent}>
            {/* Secret mode card (default, prominent) */}
            <MotiView
                from={{ opacity: 0, translateY: 16 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 300 }}
            >
                <TouchableOpacity
                    style={[styles.rewardChoice, revealMode === 'secret' && styles.rewardChoiceActive]}
                    onPress={() => {
                        setRevealMode('secret');
                        setValidationErrors(prev => ({ ...prev, revealMode: false }));
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Keep reward as a secret surprise"
                >
                    <View style={styles.rewardChoiceHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.rewardChoiceTitle, revealMode === 'secret' && styles.rewardChoiceTitleActive]}>Keep it a surprise</Text>
                            <Text style={styles.rewardChoiceDesc}>
                                The reward stays hidden. They'll receive hints with every session, building anticipation until the big reveal.
                            </Text>
                            <View style={styles.revealBadge}>
                                <Text style={styles.revealBadgeText}>Recommended</Text>
                            </View>
                        </View>
                        {revealMode === 'secret' && (
                            <View style={styles.rewardChoiceCheck}><Check color={colors.white} size={14} strokeWidth={3} /></View>
                        )}
                    </View>
                </TouchableOpacity>
            </MotiView>

            {/* Reveal escape hatch (small link) */}
            <TouchableOpacity
                style={{ paddingVertical: Spacing.md, alignItems: 'center' }}
                onPress={() => {
                    setRevealMode('revealed');
                    setValidationErrors(prev => ({ ...prev, revealMode: false }));
                }}
                activeOpacity={0.7}
            >
                <Text style={{
                    ...Typography.small,
                    color: revealMode === 'revealed' ? colors.primary : colors.textMuted,
                    textDecorationLine: revealMode === 'revealed' ? 'none' : 'underline',
                }}>
                    {revealMode === 'revealed' ? '\u2713 Reward will be revealed from day one' : 'Reveal the experience instead'}
                </Text>
            </TouchableOpacity>
        </View>
    );

    // Payment step
    // Default payment to payNow (Lock it in) for giver flows
    useEffect(() => {
        if (challengeType && !paymentChoice) {
            setPaymentChoice('payNow');
        }
    }, [challengeType]);

    const renderPaymentStep = () => (
        <View style={styles.stepContent}>
            {validationErrors.paymentChoice && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>Please choose a payment option</Text>
                </View>
            )}

            {/* Option A: Lock it in (pay now) — default */}
            <TouchableOpacity
                style={[styles.rewardChoice, paymentChoice === 'payNow' && styles.rewardChoiceActive]}
                onPress={() => {
                    setPaymentChoice('payNow');
                    setValidationErrors(prev => ({ ...prev, paymentChoice: false }));
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Lock it in, pay now"
            >
                <View style={styles.rewardChoiceHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.rewardChoiceTitle, paymentChoice === 'payNow' && styles.rewardChoiceTitleActive]}>Lock it in</Text>
                        <Text style={styles.rewardChoiceDesc}>
                            Pay now. Experience secured immediately. They'll know you believe in them.
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

            {/* Small escape hatch: pay on success */}
            <TouchableOpacity
                style={{ paddingVertical: Spacing.md, alignItems: 'center' }}
                onPress={() => {
                    setPaymentChoice('payLater');
                    setValidationErrors(prev => ({ ...prev, paymentChoice: false }));
                }}
                activeOpacity={0.7}
            >
                <Text style={{
                    ...Typography.small,
                    color: colors.textMuted,
                    textDecorationLine: 'underline',
                }}>
                    Or save card & pay on success
                </Text>
            </TouchableOpacity>

            {/* Motivational stat */}
            <View style={styles.statCard}>
                <Text style={styles.statNumber}>Invest in their success.</Text>
                <Text style={styles.statText}>
                    When you commit upfront, you show them you believe in them. They'll know someone is rooting for them.
                </Text>
            </View>
        </View>
    );

    // Summary / confirm step — last step
    const renderConfirmStep = () => (
        <View style={styles.stepContent}>
            <View style={styles.confirmSummaryCard}>
                <Text style={styles.confirmSummaryRow}>
                    <Text style={styles.confirmSummaryLabel}>Type: </Text>
                    {typeLabel}
                </Text>
                {challengeType === 'shared' && (
                    <>
                        <Text style={styles.confirmSummaryRow}>
                            <Text style={styles.confirmSummaryLabel}>Duration: </Text>
                            {weeks} {weeks === 1 ? 'week' : 'weeks'}
                        </Text>
                        <Text style={styles.confirmSummaryRow}>
                            <Text style={styles.confirmSummaryLabel}>Sessions/week: </Text>
                            {sessionsPerWeek}
                        </Text>
                        <Text style={styles.confirmSummaryRow}>
                            <Text style={styles.confirmSummaryLabel}>Per session: </Text>
                            {showCustomTime ? `${hours || '0'}h ${minutes || '0'}m` : `${sessionMinutes} min`}
                        </Text>
                    </>
                )}
                {selectedExperience ? (
                    <Text style={styles.confirmSummaryRow}>
                        <Text style={styles.confirmSummaryLabel}>Reward: </Text>
                        {selectedExperience.title}
                    </Text>
                ) : preferredRewardCategory ? (
                    <Text style={styles.confirmSummaryRow}>
                        <Text style={styles.confirmSummaryLabel}>Reward preference: </Text>
                        {preferredRewardCategory.charAt(0).toUpperCase() + preferredRewardCategory.slice(1)}
                    </Text>
                ) : null}
                {revealMode && (
                    <Text style={styles.confirmSummaryRow}>
                        <Text style={styles.confirmSummaryLabel}>Mode: </Text>
                        {revealMode === 'revealed' ? 'Revealed' : 'Secret (with hints)'}
                    </Text>
                )}
                {paymentChoice && (
                    <Text style={styles.confirmSummaryRow}>
                        <Text style={styles.confirmSummaryLabel}>Payment: </Text>
                        {getPaymentLabel()}
                    </Text>
                )}
            </View>

            <TextInput
                label="Add a personal note"
                placeholder="Write something meaningful..."
                value={personalizedMessage}
                onChangeText={setPersonalizedMessage}
                maxLength={200}
                multiline
                containerStyle={{ marginBottom: Spacing.md }}
            />
        </View>
    );

    // ─── Route current step to the right renderer ─────────────────────────────
    const renderCurrentStep = () => {
        if (currentStep === 1) return renderStep1();

        const confirmStep = getConfirmStep();
        const experienceStep = getExperienceStep();
        const revealStep = getRevealStep();
        const paymentStep = getPaymentStep();

        if (currentStep === confirmStep) return renderConfirmStep();
        if (currentStep === revealStep) return renderRevealStep();
        if (needsPaymentStep && currentStep === paymentStep) return renderPaymentStep();
        if (currentStep === experienceStep) return renderExperienceStep();

        if (challengeType === 'shared') {
            switch (currentStep) {
                case 2: return renderGoalTypeStepTogether();
                case 3: return renderStep2Together();
                case 4: return renderStep3Together();
                default: return null;
            }
        }

        return null;
    };

    // ─── Derived display values ───────────────────────────────────────────────
    const typeLabel = challengeType === 'shared' ? 'Together' : 'Just them';

    const getPaymentLabel = () => {
        if (paymentChoice === 'payNow') return 'Paid upfront';
        if (paymentChoice === 'payLater') return 'Pay on success';
        return '';
    };

    const getCtaLabel = () => {
        if (isSubmitting) return 'Sending...';
        if (paymentChoice === 'payNow') return 'Pay & Send';
        return 'Commit & Send (pay on success)';
    };

    const userId = state.user?.id || '';

    return (
        <ErrorBoundary screenName="GiftFlowScreen" userId={userId}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
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
                        <ChevronLeft color={colors.textPrimary} size={24} strokeWidth={2.5} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Gift a Challenge</Text>
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
                        <Text style={styles.stepTitle}>{getStepTitle()}</Text>
                        <Text style={styles.stepSubtitle}>{getStepSubtitle()}</Text>
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

                    <View style={{ height: vh(120) }} />
                </ScrollView>

                {/* Footer */}
                <View style={styles.footer}>
                    {/* Preview card when experience is selected */}
                    {currentStep >= getExperienceStep() && selectedExperience && (
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
                                    <TouchableOpacity
                                        onPress={() => setDetailExperience(selectedExperience)}
                                        style={styles.heroDetailsButton}
                                        accessibilityRole="button"
                                        accessibilityLabel="View experience details"
                                    >
                                        <Text style={styles.heroDetailsText}>View details</Text>
                                    </TouchableOpacity>
                                </View>

                                {challengeType && (
                                    <View style={styles.heroContextRow}>
                                        <View style={styles.contextBadge}>
                                            <Text style={styles.contextEmoji}>
                                                {challengeType === 'solo' ? '👤' : '👥'}
                                            </Text>
                                            <Text style={styles.contextText}>{typeLabel}</Text>
                                        </View>
                                        {challengeType === 'shared' && (
                                            <>
                                                <View style={styles.contextDivider} />
                                                <View style={styles.contextBadge}>
                                                    <Text style={styles.contextLabel}>{weeks} {weeks === 1 ? 'week' : 'weeks'}</Text>
                                                </View>
                                                <View style={styles.contextDivider} />
                                                <View style={styles.contextBadge}>
                                                    <Text style={styles.contextLabel}>{sessionsPerWeek}x/wk</Text>
                                                </View>
                                            </>
                                        )}
                                        {revealMode && (
                                            <>
                                                <View style={styles.contextDivider} />
                                                <View style={styles.contextBadge}>
                                                    <Text style={styles.contextLabel}>{revealMode === 'revealed' ? '👁️' : '🔒'} {revealMode === 'revealed' ? 'Revealed' : 'Secret'}</Text>
                                                </View>
                                            </>
                                        )}
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
                            accessibilityLabel={state.user?.id ? 'Send gift' : 'Sign up and send gift'}
                        >
                            <LinearGradient colors={colors.gradientDark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createButtonGradient}>
                                <Text style={styles.createButtonText}>
                                    {state.user?.id
                                        ? (paymentChoice === 'payNow' ? 'Pay & Send' : 'Commit & Send')
                                        : 'Sign Up & Send Gift'}
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
                    title="Confirm Your Gift"
                    variant="center"
                >
                    <View style={{ width: '100%', alignItems: 'center' }}>
                        <Text style={styles.modalSubtitle}>
                            Ready to send? Let's make it happen!
                        </Text>

                        <View style={styles.modalDetails}>
                            <Text style={styles.modalRow}>
                                <Text style={styles.modalLabel}>Type: </Text>
                                {typeLabel}
                            </Text>
                            {challengeType === 'shared' && (
                                <>
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
                                </>
                            )}
                            {selectedExperience ? (
                                <Text style={styles.modalRow}>
                                    <Text style={styles.modalLabel}>Reward: </Text>
                                    {selectedExperience.title}
                                </Text>
                            ) : preferredRewardCategory ? (
                                <Text style={styles.modalRow}>
                                    <Text style={styles.modalLabel}>Reward preference: </Text>
                                    {preferredRewardCategory.charAt(0).toUpperCase() + preferredRewardCategory.slice(1)}
                                </Text>
                            ) : null}
                            {revealMode && (
                                <Text style={styles.modalRow}>
                                    <Text style={styles.modalLabel}>Mode: </Text>
                                    {revealMode === 'revealed' ? 'Revealed' : 'Secret (with hints)'}
                                </Text>
                            )}
                            {paymentChoice && (
                                <Text style={styles.modalRow}>
                                    <Text style={styles.modalLabel}>Payment: </Text>
                                    {getPaymentLabel()}
                                </Text>
                            )}
                        </View>

                        <Text style={styles.pledgeNote}>
                            {paymentChoice === 'payNow'
                                ? 'Experience will be secured immediately after payment.'
                                : 'Your card will only be charged when they succeed.'}
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
                                    title={getCtaLabel()}
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
            </KeyboardAvoidingView>
        </ErrorBoundary>
    );
}


const createStyles = (colors: typeof Colors) => StyleSheet.create({
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

    // Goal type grid (Together step 2)
    goalTypeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.md,
        justifyContent: 'center',
    },
    goalTypeCard: {
        width: '45%',
        backgroundColor: colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: colors.border,
    },
    goalTypeCardActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primarySurface,
    },
    goalTypeEmoji: {
        fontSize: 32,
        marginBottom: Spacing.sm,
    },
    goalTypeName: {
        ...Typography.bodyBold,
        color: colors.textPrimary,
        textAlign: 'center',
    },
    goalTypeNameActive: {
        color: colors.primary,
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

    // Sliders
    sliderContainer: {
        backgroundColor: colors.white,
        borderRadius: BorderRadius.xl,
        padding: Spacing.xxl,
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
    sliderValueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: Spacing.xl,
        gap: Spacing.sm,
    },
    sliderValue: {
        ...Typography.display,
        fontWeight: '900',
        color: colors.gray800,
    },
    sliderUnit: {
        ...Typography.heading3,
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
        marginLeft: -12,
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
        backgroundColor: 'rgba(0,0,0,0.5)',
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
        maxWidth: 360,
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

    // Step 4: Category preference cards
    rewardCategoryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.xl,
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

    // Reveal badge (Secret "Surprise factor" pill)
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
    helpChoosingCard: {
        backgroundColor: colors.primarySurface,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
        borderWidth: 1,
        borderColor: colors.primaryBorder,
    },
    helpChoosingTitle: {
        ...Typography.subheading,
        color: colors.primary,
        marginBottom: Spacing.xxs,
    },
    helpChoosingDesc: {
        ...Typography.small,
        color: colors.textSecondary,
        marginBottom: Spacing.md,
    },

    // Payment step
    rewardChoice: {
        backgroundColor: colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
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

    // Confirm step summary card
    confirmSummaryCard: {
        backgroundColor: colors.surface,
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.xl,
        borderWidth: 1,
        borderColor: colors.border,
    },
    confirmSummaryRow: {
        ...Typography.body,
        color: colors.gray700,
        marginBottom: Spacing.xs,
    },
    confirmSummaryLabel: {
        fontWeight: '600',
        color: colors.primaryDeep,
    },

    // Motivational stat card
    statCard: {
        backgroundColor: colors.successLighter,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
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
});
