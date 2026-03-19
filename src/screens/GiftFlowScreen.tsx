import React, { useState, useEffect, useRef } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SkeletonBox } from '../components/SkeletonLoader';
import Colors from '../config/colors';
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
import { ChevronLeft, ChevronRight, Check } from 'lucide-react-native';
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
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import ModernSlider from '../components/ModernSlider';
import WizardProgressBar from '../components/WizardProgressBar';
import { EXPERIENCE_CATEGORIES, setStorageItem, sanitizeNumericInput } from '../utils/wizardHelpers';
import { sanitizeText } from '../utils/sanitization';
import { vh } from '../utils/responsive';

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
    'Set your goal',
    'Pick the reward',
    'Secure the reward',
    'How is the reward revealed?',
    'Confirm your gift',
];

const TOGETHER_STEP_SUBTITLES = [
    'Choose how they will work towards their goal.',
    'Set the challenge intensity for both of you.',
    "Pick a category. We'll recommend the perfect reward!",
    "Choose how you'd like to back this challenge.",
    "Should they know what you're both working towards?",
    'Review everything before sending.',
];

// ─── Challenge type options ───────────────────────────────────────────────────
const TYPE_OPTIONS: { key: GiftChallengeType; emoji: string; label: string; tagline: string; color: string }[] = [
    {
        key: 'solo',
        emoji: '👤',
        label: 'Just them',
        tagline: 'They work on the goal. You gift the reward when they succeed.',
        color: Colors.warning,
    },
    {
        key: 'shared',
        emoji: '👥',
        label: 'Together',
        tagline: 'You both commit to a goal. The reward unlocks for both of you.',
        color: Colors.secondary,
    },
];

// ─── Reveal options ───────────────────────────────────────────────────────────
const REVEAL_OPTIONS: { key: GiftRevealMode; emoji: string; label: string; tagline: string; color: string; badge?: string }[] = [
    {
        key: 'revealed',
        emoji: '👁️',
        label: 'Revealed',
        tagline: 'They know the reward from day one. Full motivation to earn it.',
        color: Colors.warning,
    },
    {
        key: 'secret',
        emoji: '🔒',
        label: 'Secret',
        tagline: 'The reward stays hidden. Ernit drops hints every session.',
        color: Colors.secondary,
        badge: 'Surprise factor',
    },
];

// Alias so JSX call sites don't need to change
const ProgressBar = WizardProgressBar;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GiftFlowScreen() {
    const navigation = useRootNavigation();
    const route = useRoute();
    const routeParams = route.params as { prefill?: GiftFlowPrefill } | undefined;
    const { state } = useApp();
    const { showError } = useToast();

    // Wizard step
    const [currentStep, setCurrentStep] = useState(1);

    // Step 1: Challenge type
    const [challengeType, setChallengeType] = useState<GiftChallengeType | null>(null);

    // Step 2 (together only): Goal config
    const [weeks, setWeeks] = useState(3);
    const [sessionsPerWeek, setSessionsPerWeek] = useState(3);
    const [hours, setHours] = useState('');
    const [minutes, setMinutes] = useState('');
    // Experience selection
    const [experiences, setExperiences] = useState<Experience[]>([]);
    const [selectedExperience, setSelectedExperience] = useState<Experience | null>(null);
    const [loadingExperiences, setLoadingExperiences] = useState(true);
    const [preferredRewardCategory, setPreferredRewardCategory] = useState<ExperienceCategory | null>(null);
    const [showExperiencePicker, setShowExperiencePicker] = useState(false);
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

    // Dynamic step count — reveal step only exists when paymentChoice === 'payLater'
    const hasRevealStep = paymentChoice === 'payLater';
    const totalSteps = challengeType === 'shared'
        ? (hasRevealStep ? 6 : 5)
        : (hasRevealStep ? 5 : 4);

    // Animations
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const scrollViewRef = useRef<ScrollView>(null);

    // Refs for focus chaining
    const minutesRef = useRef<RNTextInput>(null);

    // Step titles/subtitles (dynamic — use lookup functions to handle free-payment step skipping)
    const getStepTitle = (): string => {
        if (currentStep === 1) return 'Choose a type';
        if (challengeType === 'shared' && currentStep === 2) return TOGETHER_STEP_TITLES[1];
        const expStep = getExperienceStep();
        if (currentStep === expStep) return 'Pick a reward';
        const payStep = getPaymentStep();
        if (currentStep === payStep) return 'Secure the reward';
        const revealStep = getRevealStep();
        if (hasRevealStep && currentStep === revealStep) return 'How is the reward revealed?';
        const confirmStep = getConfirmStep();
        if (currentStep === confirmStep) return 'Confirm your gift';
        return '';
    };
    const getStepSubtitle = (): string => {
        if (currentStep === 1) return 'Choose how they will work towards their goal.';
        if (challengeType === 'shared' && currentStep === 2) return TOGETHER_STEP_SUBTITLES[1];
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
            if (p.durationWeeks) setWeeks(p.durationWeeks);
            if (p.sessionsPerWeek) setSessionsPerWeek(p.sessionsPerWeek);
            if (p.targetHours !== undefined) setHours(String(p.targetHours));
            if (p.targetMinutes !== undefined) setMinutes(String(p.targetMinutes));
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

    // Reset revealMode when paymentChoice changes to 'free'
    useEffect(() => {
        if (paymentChoice === 'free') {
            setRevealMode(null);
        }
    }, [paymentChoice]);

    // ─── Map logical step number to absolute step index ───────────────────────
    // Solo (payLater):  1=Type, 2=Experience, 3=Payment, 4=Reveal, 5=Confirm
    // Solo (free):      1=Type, 2=Experience, 3=Payment, 4=Confirm
    // Together (payLater): 1=Type, 2=Goal, 3=Experience, 4=Payment, 5=Reveal, 6=Confirm
    // Together (free):     1=Type, 2=Goal, 3=Experience, 4=Payment, 5=Confirm
    const getExperienceStep = () => challengeType === 'shared' ? 3 : 2;
    const getPaymentStep = () => challengeType === 'shared' ? 4 : 3;
    const getRevealStep = () => challengeType === 'shared' ? 5 : 4; // only valid when hasRevealStep
    const getConfirmStep = () => hasRevealStep
        ? (challengeType === 'shared' ? 6 : 5)
        : (challengeType === 'shared' ? 5 : 4);

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

        if (currentStep === getExperienceStep()) {
            if (!selectedExperience && !preferredRewardCategory) {
                setValidationErrors(prev => ({ ...prev, experience: true }));
                return false;
            }
            setValidationErrors(prev => ({ ...prev, experience: false }));
            return true;
        }

        if (currentStep === getPaymentStep()) {
            if (!paymentChoice) {
                setValidationErrors(prev => ({ ...prev, paymentChoice: true }));
                return false;
            }
            setValidationErrors(prev => ({ ...prev, paymentChoice: false }));
            return true;
        }

        if (hasRevealStep && currentStep === getRevealStep()) {
            if (!revealMode) {
                setValidationErrors(prev => ({ ...prev, revealMode: true }));
                return false;
            }
            setValidationErrors(prev => ({ ...prev, revealMode: false }));
            return true;
        }

        return true;
    };

    const handleNext = () => {
        if (!validateCurrentStep()) return;
        if (currentStep < totalSteps) {
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

        // Bug 2 fix: payLater requires a specific experience (the Cloud Function
        // rejects an empty experienceId and we cannot charge for a category-only pick).
        if (paymentChoice === 'payLater' && !selectedExperience) {
            showError('Please select a specific experience to commit to');
            return;
        }

        setIsSubmitting(true);

        try {
            // payLater or free: call the appropriate cloud function
            const functionName = paymentChoice === 'free'
                ? config.giftFunctions.createFreeGift
                : config.giftFunctions.createDeferredGift;

            const hoursNum = parseInt(hours || '0');
            const minutesNum = parseInt(minutes || '0');

            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('Not authenticated');

            // Bug 4 note: recipientEmail is not yet collected by this wizard.
            // The Cloud Function supports it for notification emails — add a wizard
            // step to collect it when email notification UX is implemented.
            const response = await fetch(
                `${config.functionsUrl}/${functionName}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        experienceId: selectedExperience?.id || '',
                        challengeType,
                        revealMode,
                        giverName: state.user.displayName || '',
                        personalizedMessage: sanitizeText(personalizedMessage.trim(), 200),
                        ...(challengeType === 'shared' ? {
                            goalName: `${weeks}-week challenge`,
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

            // Bug 1 fix: for payLater gifts the server returns a setupIntentClientSecret
            // so the giver can save their card now for off-session charging later.
            // Without this step, chargeDeferredGift will always fail because no
            // payment_method is attached to the SetupIntent.
            if (paymentChoice === 'payLater' && result.setupIntentClientSecret) {
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
                                    <View style={styles.rewardChoiceCheck}><Check color={Colors.white} size={14} strokeWidth={3} /></View>
                                )}
                            </View>
                        </TouchableOpacity>
                    </MotiView>
                );
            })}
        </View>
    );

    // Step 2 (Together only): Set YOUR Goal — identical to ChallengeSetupScreen step 2
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
                                placeholderTextColor={Colors.textMuted}
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
                                placeholderTextColor={Colors.textMuted}
                                returnKeyType="done"
                                accessibilityLabel="Minutes per session"
                            />
                            <Text style={styles.timeLabel}>min</Text>
                        </View>
                    </View>

                    {validationErrors.time && (
                        <Text style={{ color: Colors.error, ...Typography.caption, marginTop: Spacing.sm, fontWeight: '500' }}>
                            Please set a time per session (at least 1 minute)
                        </Text>
                    )}
                </View>
            </View>
        </View>
    );

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
                <View style={styles.expTextContainer}>
                    <Text style={[styles.expTitle, isSelected && styles.expTitleActive]} numberOfLines={2}>{exp.title}</Text>
                    <View style={styles.expMeta}>
                        {exp.price > 0 && <Text style={styles.expPrice}>{'\u20AC'}{exp.price}</Text>}
                        {exp.location && <Text style={styles.expLocation} numberOfLines={1}>{exp.location}</Text>}
                    </View>
                </View>
                {isSelected && (
                    <View style={styles.checkBadge}><Check color={Colors.white} size={12} strokeWidth={3} /></View>
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
                                                        <View style={styles.expTextContainer}>
                                                            <Text style={[styles.expTitle, isSelected && styles.expTitleActive]} numberOfLines={2}>{exp.title}</Text>
                                                            <View style={styles.expMeta}>
                                                                {exp.price > 0 && <Text style={styles.expPrice}>{'\u20AC'}{exp.price}</Text>}
                                                                {exp.location && <Text style={styles.expLocation} numberOfLines={1}>{exp.location}</Text>}
                                                            </View>
                                                        </View>
                                                        {isSelected && (
                                                            <View style={styles.checkBadge}><Check color={Colors.white} size={12} strokeWidth={3} /></View>
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
                                        <Check color={Colors.white} size={14} strokeWidth={3} />
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

    // Auto-reset secret mode if experience deselected
    useEffect(() => {
        if (!selectedExperience && revealMode === 'secret') {
            setRevealMode('revealed');
        }
    }, [selectedExperience]);

    // Reveal/Secret step
    const secretDisabled = !selectedExperience || paymentChoice === 'free';
    const renderRevealStep = () => (
        <View style={styles.stepContent}>
            {validationErrors.revealMode && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>Please choose how the reward is revealed</Text>
                </View>
            )}
            {REVEAL_OPTIONS.map((option, index) => {
                const isActive = revealMode === option.key;
                const isSecretAndDisabled = option.key === 'secret' && secretDisabled;
                return (
                    <MotiView
                        key={option.key}
                        from={{ opacity: 0, translateY: 16 }}
                        animate={{ opacity: 1, translateY: 0 }}
                        transition={{ type: 'timing', duration: 300, delay: index * 80 }}
                    >
                        <TouchableOpacity
                            style={[
                                styles.rewardChoice,
                                isActive && styles.rewardChoiceActive,
                                isSecretAndDisabled && { opacity: 0.4 },
                            ]}
                            onPress={() => {
                                if (isSecretAndDisabled) return;
                                setRevealMode(option.key);
                                setValidationErrors(prev => ({ ...prev, revealMode: false }));
                            }}
                            activeOpacity={isSecretAndDisabled ? 1 : 0.8}
                            accessibilityRole="button"
                            accessibilityLabel={`Select ${option.label} reveal mode`}
                        >
                            <View style={styles.rewardChoiceHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.rewardChoiceTitle, isActive && styles.rewardChoiceTitleActive]}>{option.label}</Text>
                                    <Text style={styles.rewardChoiceDesc}>{option.tagline}</Text>
                                    {option.badge && !isSecretAndDisabled && (
                                        <View style={styles.revealBadge}>
                                            <Text style={styles.revealBadgeText}>{option.badge}</Text>
                                        </View>
                                    )}
                                    {isSecretAndDisabled && (
                                        <Text style={{ ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.xs }}>
                                            Pick a specific reward to unlock mystery mode
                                        </Text>
                                    )}
                                </View>
                                {isActive && !isSecretAndDisabled && (
                                    <View style={styles.rewardChoiceCheck}><Check color={Colors.white} size={14} strokeWidth={3} /></View>
                                )}
                            </View>
                        </TouchableOpacity>
                    </MotiView>
                );
            })}
        </View>
    );

    // Payment step
    const renderPaymentStep = () => (
        <View style={styles.stepContent}>
            {validationErrors.paymentChoice && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>Please choose an option to continue</Text>
                </View>
            )}

            {/* Option A: Commit & pay later */}
            <TouchableOpacity
                style={[styles.rewardChoice, paymentChoice === 'payLater' && styles.rewardChoiceActive]}
                onPress={() => {
                    setPaymentChoice('payLater');
                    setValidationErrors(prev => ({ ...prev, paymentChoice: false }));
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Commit and pay later"
            >
                <View style={styles.rewardChoiceHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.rewardChoiceTitle, paymentChoice === 'payLater' && styles.rewardChoiceTitleActive]}>Commit & pay later</Text>
                        <Text style={styles.rewardChoiceDesc}>
                            Save your payment method. Only charged when they succeed. Zero risk.
                        </Text>
                        <View style={styles.revealBadge}>
                            <Text style={[styles.revealBadgeText, { color: Colors.warning }]}>Recommended</Text>
                        </View>
                    </View>
                    {paymentChoice === 'payLater' && (
                        <View style={styles.rewardChoiceCheck}><Check color={Colors.white} size={14} strokeWidth={3} /></View>
                    )}
                </View>
            </TouchableOpacity>

            {/* Option C: Send free */}
            <TouchableOpacity
                style={[styles.rewardChoice, paymentChoice === 'free' && styles.rewardChoiceActive]}
                onPress={() => {
                    setPaymentChoice('free');
                    setValidationErrors(prev => ({ ...prev, paymentChoice: false }));
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Send challenge for free"
            >
                <View style={styles.rewardChoiceHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.rewardChoiceTitle, paymentChoice === 'free' && styles.rewardChoiceTitleActive]}>Send free</Text>
                        <Text style={styles.rewardChoiceDesc}>
                            Send the challenge without payment. Attach a reward later.
                        </Text>
                    </View>
                    {paymentChoice === 'free' && (
                        <View style={styles.rewardChoiceCheck}><Check color={Colors.white} size={14} strokeWidth={3} /></View>
                    )}
                </View>
            </TouchableOpacity>

            <Text style={styles.rewardChoiceNote}>All options are great — pick what works for you!</Text>

            {/* Motivational stat */}
            <View style={styles.statCard}>
                <Text style={styles.statNumber}>Invest in their success.</Text>
                <Text style={styles.statText}>
                    When you commit upfront, you show them you believe in them.
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
                            {hours || '0'}h {minutes || '0'}m
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
        const revealStep = getRevealStep(); // only valid when hasRevealStep

        if (currentStep === confirmStep) return renderConfirmStep();
        if (hasRevealStep && currentStep === revealStep) return renderRevealStep();

        if (challengeType === 'shared') {
            switch (currentStep) {
                case 2: return renderStep2Together();
                case 3: return renderExperienceStep();
                case 4: return renderPaymentStep();
                default: return null;
            }
        } else {
            // solo
            switch (currentStep) {
                case 2: return renderExperienceStep();
                case 3: return renderPaymentStep();
                default: return null;
            }
        }
    };

    // ─── Derived display values ───────────────────────────────────────────────
    const typeLabel = challengeType === 'shared' ? 'Together' : 'Just them';

    const getPaymentLabel = () => {
        if (paymentChoice === 'payLater') return 'Pay on success';
        if (paymentChoice === 'free') return 'Free';
        return '';
    };

    const getCtaLabel = () => {
        if (paymentChoice === 'payLater') return isSubmitting ? 'Sending...' : 'Commit & Send (pay on success)';
        return isSubmitting ? 'Sending...' : 'Send Free Challenge';
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
                        <ChevronLeft color={Colors.textPrimary} size={24} strokeWidth={2.5} />
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
                            <LinearGradient colors={Colors.gradientDark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createButtonGradient}>
                                <Text style={styles.createButtonText}>
                                    {state.user?.id
                                        ? (paymentChoice === 'payLater' ? 'Commit & Send' : 'Send Free Challenge')
                                        : 'Sign Up & Send Gift'}
                                </Text>
                                <ChevronRight color={Colors.white} size={20} strokeWidth={3} />
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
                                <ChevronRight color={Colors.white} size={20} strokeWidth={3} />
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
                            {paymentChoice === 'payLater'
                                ? 'Your card will only be charged when they succeed.'
                                : 'You can attach a reward to this challenge at any time.'}
                        </Text>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                onPress={() => setShowConfirm(false)}
                                style={[styles.modalButton, styles.cancelButton]}
                                activeOpacity={0.8}
                                disabled={isSubmitting}
                                accessibilityRole="button"
                                accessibilityLabel="Cancel gift creation"
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
                                    accessibilityLabel={isSubmitting ? 'Sending gift' : getCtaLabel()}
                                >
                                    <Text style={styles.confirmText}>
                                        {getCtaLabel()}
                                    </Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </View>
                    </View>
                </BaseModal>
            </View>
            </KeyboardAvoidingView>
        </ErrorBoundary>
    );
}


const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.surface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? vh(56) : vh(40),
        paddingBottom: vh(14),
        paddingHorizontal: Spacing.xl,
        backgroundColor: Colors.white,
        borderBottomWidth: 1,
        borderBottomColor: Colors.backgroundLight,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        ...Typography.heading3,
        color: Colors.gray800,
    },
    stepIndicator: {
        backgroundColor: Colors.primarySurface,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.md,
    },
    stepIndicatorText: {
        ...Typography.caption,
        fontWeight: '700',
        color: Colors.primary,
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
        color: Colors.gray800,
        marginBottom: vh(8),
    },
    stepSubtitle: {
        ...Typography.body,
        color: Colors.textSecondary,
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
        backgroundColor: Colors.errorLight,
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.errorBorder,
    },
    errorText: {
        ...Typography.smallBold,
        color: Colors.error,
    },

    // Sliders
    sliderContainer: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.xl,
        padding: Spacing.xxl,
        borderWidth: 1,
        borderColor: Colors.backgroundLight,
    },
    sliderTitle: {
        ...Typography.smallBold,
        color: Colors.textSecondary,
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
        color: Colors.gray800,
    },
    sliderUnit: {
        ...Typography.heading3,
        color: Colors.textSecondary,
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
    },
    sliderLabelText: {
        ...Typography.caption,
        fontWeight: '600',
        color: Colors.textMuted,
    },
    sliderTrack: {
        height: 8,
        backgroundColor: Colors.border,
        borderRadius: BorderRadius.xs,
        position: 'relative',
        width: '100%',
    },
    sliderProgress: {
        height: '100%',
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.xs,
    },
    sliderThumb: {
        position: 'absolute',
        top: -8,
        marginLeft: -12,
        width: 24,
        height: 24,
        borderRadius: BorderRadius.md,
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
        borderRadius: BorderRadius.xs,
        backgroundColor: Colors.primary,
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
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        ...Typography.heading3,
        fontWeight: '700',
        textAlign: 'center',
        backgroundColor: Colors.white,
        color: Colors.gray800,
    },
    timeLabel: {
        ...Typography.bodyBold,
        color: Colors.textSecondary,
    },

    // Experience cards
    expCard: {
        backgroundColor: Colors.white,
        borderWidth: 2,
        borderColor: Colors.border,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginRight: Spacing.md,
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
        height: vh(100),
        borderRadius: BorderRadius.lg,
        backgroundColor: Colors.backgroundLight,
        overflow: 'hidden',
        marginBottom: Spacing.sm,
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
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    expTitleActive: {
        color: Colors.primary,
    },
    expMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        marginTop: Spacing.xs,
    },
    expPrice: {
        ...Typography.captionBold,
        color: Colors.primary,
    },
    expLocation: {
        ...Typography.tiny,
        color: Colors.textMuted,
        flex: 1,
    },
    checkBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 20,
        height: 20,
        borderRadius: BorderRadius.sm,
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
        paddingHorizontal: Spacing.xl,
        paddingBottom: Platform.OS === 'ios' ? vh(30) : vh(18),
        paddingTop: vh(14),
        backgroundColor: Colors.white,
        borderTopWidth: 1,
        borderTopColor: Colors.backgroundLight,
        ...Shadows.md,
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: -4 },
    },
    createButton: {
        borderRadius: BorderRadius.lg,
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
        gap: Spacing.sm,
        paddingVertical: Spacing.xl,
        borderRadius: BorderRadius.lg,
    },
    createButtonText: {
        ...Typography.subheading,
        fontWeight: '700',
        color: Colors.white,
    },

    // Footer hero card
    footerHeroCard: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.backgroundLight,
        shadowColor: Colors.black,
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
        backgroundColor: Colors.backgroundLight,
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
    footerHeroTitle: {
        ...Typography.subheading,
        fontWeight: '800',
        color: Colors.gray800,
        marginBottom: Spacing.xxs,
    },
    heroContextRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
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
        color: Colors.gray600,
    },
    contextDivider: {
        width: 1,
        height: 16,
        backgroundColor: Colors.border,
    },
    contextLabel: {
        ...Typography.caption,
        fontWeight: '600',
        color: Colors.textSecondary,
    },

    // Modal
    modalBox: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.xl,
        width: '90%',
        maxWidth: 360,
        paddingVertical: Spacing.xxl,
        paddingHorizontal: Spacing.xl,
        ...Shadows.md,
        shadowColor: Colors.black,
        shadowOpacity: 0.15,
        alignItems: 'center',
    },
    modalTitle: {
        ...Typography.large,
        color: Colors.primaryDeep,
        marginBottom: Spacing.sm,
    },
    modalSubtitle: {
        ...Typography.small,
        color: Colors.textSecondary,
        marginBottom: Spacing.xl,
        textAlign: 'center',
    },
    modalDetails: {
        width: '100%',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    modalRow: {
        ...Typography.body,
        color: Colors.gray700,
        marginBottom: Spacing.xs,
    },
    modalLabel: {
        fontWeight: '600',
        color: Colors.primaryDeep,
    },
    pledgeNote: {
        ...Typography.caption,
        color: Colors.successMedium,
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
        backgroundColor: Colors.backgroundLight,
    },
    confirmButton: {
        backgroundColor: Colors.primary,
    },
    cancelText: {
        ...Typography.subheading,
        color: Colors.gray700,
    },
    confirmText: {
        ...Typography.subheading,
        color: Colors.white,
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
        backgroundColor: Colors.backgroundLight,
        marginLeft: Spacing.xs,
    },
    filterChipActive: {
        backgroundColor: Colors.gray800,
    },
    filterText: {
        ...Typography.captionBold,
        color: Colors.textSecondary,
    },
    filterTextActive: {
        color: Colors.white,
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
        color: Colors.gray800,
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
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.xl,
        marginBottom: Spacing.md,
        borderWidth: 1.5,
        borderColor: Colors.backgroundLight,
        ...Shadows.sm,
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 1 },
    },
    rewardCategoryEmoji: {
        ...Typography.display,
        marginRight: Spacing.lg,
    },
    rewardCategoryLabel: {
        ...Typography.subheading,
        fontWeight: '700',
        color: Colors.gray800,
        marginBottom: Spacing.xxs,
    },
    rewardCategoryTagline: {
        ...Typography.small,
        color: Colors.textSecondary,
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
        backgroundColor: Colors.categoryAmber + '20',
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xxs,
        marginTop: Spacing.xs,
    },
    revealBadgeText: {
        ...Typography.tiny,
        color: Colors.categoryAmber,
        fontWeight: '700',
    },

    browseLink: {
        alignItems: 'center',
        marginTop: Spacing.xxl,
        paddingVertical: Spacing.md,
    },
    browseLinkText: {
        ...Typography.caption,
        color: Colors.textMuted,
        marginBottom: Spacing.xs,
    },
    browseLinkAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    browseLinkActionText: {
        ...Typography.smallBold,
        color: Colors.primary,
    },
    browseBackButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
        gap: Spacing.xs,
    },
    browseBackText: {
        ...Typography.smallBold,
        color: Colors.primary,
    },

    // Payment step
    rewardChoice: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        borderWidth: 2,
        borderColor: Colors.border,
        marginBottom: vh(10),
    },
    rewardChoiceActive: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primarySurface,
    },
    rewardChoiceHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    rewardChoiceTitle: {
        ...Typography.subheading,
        color: Colors.gray800,
        marginBottom: Spacing.xxs,
    },
    rewardChoiceTitleActive: {
        color: Colors.primary,
    },
    rewardChoiceDesc: {
        ...Typography.caption,
        color: Colors.textSecondary,
        lineHeight: 18,
    },
    rewardChoiceCheck: {
        width: 24,
        height: 24,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rewardChoiceNote: {
        ...Typography.caption,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: Spacing.xs,
        fontStyle: 'italic',
    },

    // Confirm step summary card
    confirmSummaryCard: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.xl,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    confirmSummaryRow: {
        ...Typography.body,
        color: Colors.gray700,
        marginBottom: Spacing.xs,
    },
    confirmSummaryLabel: {
        fontWeight: '600',
        color: Colors.primaryDeep,
    },

    // Motivational stat card
    statCard: {
        backgroundColor: Colors.successLighter,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.successBorder,
        marginTop: vh(16),
        marginBottom: 0,
    },
    statNumber: {
        ...Typography.heading2,
        fontWeight: '800',
        color: Colors.primary,
        marginBottom: Spacing.xxs,
    },
    statText: {
        ...Typography.caption,
        color: Colors.gray700,
        textAlign: 'center',
    },
});
