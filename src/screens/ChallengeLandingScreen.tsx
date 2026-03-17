import React, { useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Platform,
    Image,
    Dimensions,
    Linking,
    Animated as RNAnimated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Target, Calendar, Users, Sparkles, ChevronRight, ChevronLeft, Trophy, Lock } from 'lucide-react-native';
import { MotiView } from 'moti';
import { RootStackParamList } from '../types';
import { useApp } from '../context/AppContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import Colors from '../config/colors';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { Shadows } from '../config/shadows';
import JourneyDemo from '../components/JourneyDemo';

// ─── Constants ────────────────────────────────────────────────────
const WORD_SLOT_HEIGHT = 46;
const SCREEN_W = Dimensions.get('window').width;
const CONTENT_FADE_MS = 250;

// Dual carousel sizing
const CARDS_GAP = 12;
const CARDS_PADDING = 24;
const CARD_W = Math.min((SCREEN_W - CARDS_PADDING * 2 - CARDS_GAP) / 2, 220);
const CARD_H = CARD_W * 1.3;
const CARD_SLIDE = CARD_W * 0.75; // how far adjacent cards offset

// ─── Mode configs ─────────────────────────────────────────────────
type LandingMode = 'self' | 'gift';

interface RotatingWord {
    word: string;
    color: string;
}

interface StepConfig {
    icon: ReactNode;
    iconBg: string;
    title: string;
    desc: string;
}

interface ModeConfig {
    accentColor: string;
    gradient: readonly [string, string, string];
    rotatingWords: RotatingWord[];
    titlePrefix: string;
    titleSuffix: string;
    subtitle: string;
    stat: string;
    statHighlight: string;
    statColor: string;
    ctaText: string;
    ctaGradient: readonly [string, string];
    ctaShadowColor: string;
    badgeText: string;
    badgeBg: string;
    badgeBorder: string;
    badgeTextColor: string;
    navigateTo: keyof RootStackParamList;
    steps: StepConfig[];
    stepNumberBg: string;
    stepDividerColor: string;
    sectionLabelColor: string;
    finalTitle: string;
    finalSubtitle: string;
    finalCtaText: string;
    brandDotColor: string;
    loginColor: string;
}

const SELF_CONFIG: ModeConfig = {
    accentColor: Colors.secondary,
    gradient: [Colors.primarySurface, Colors.successLighter, Colors.white] as const,
    rotatingWords: [
        { word: 'workout', color: Colors.secondary },
        { word: 'read', color: Colors.accent },
        { word: 'run', color: Colors.categoryPink },
        { word: 'walk', color: Colors.secondary },
        { word: 'do yoga', color: Colors.categoryAmber },
    ],
    titlePrefix: 'I want to',
    titleSuffix: ' more',
    subtitle: 'Set a challenge. Track your progress.\nFriends hold you accountable.',
    stat: 'You are ',
    statHighlight: '600%',
    statColor: Colors.secondary,
    ctaText: 'Start My Challenge',
    ctaGradient: Colors.gradientDark as unknown as readonly [string, string],
    ctaShadowColor: Colors.primary,
    badgeText: '100% Free',
    badgeBg: Colors.primarySurface,
    badgeBorder: Colors.primaryLight,
    badgeTextColor: Colors.secondary,
    navigateTo: 'ChallengeSetup',
    steps: [
        {
            icon: <Target color={Colors.primary} size={24} strokeWidth={2.5} />,
            iconBg: Colors.primarySurface,
            title: 'Pick Your Challenge',
            desc: 'Choose what you want to improve and for how long. Gym, yoga, running, reading, or anything you want',
        },
        {
            icon: <Calendar color={Colors.accent} size={24} strokeWidth={2.5} />,
            iconBg: Colors.accentDeep + '18',
            title: 'Stick to It',
            desc: 'Do your sessions, build streaks, and get motivated by friends who follow your journey, and can even reward you along the way',
        },
        {
            icon: <Users color={Colors.pink} size={24} strokeWidth={2.5} />,
            iconBg: Colors.pinkLight,
            title: 'Earn it',
            desc: 'Finish your challenge and have the reward you deserve!',
        },
    ],
    stepNumberBg: Colors.gray800,
    stepDividerColor: Colors.backgroundLight,
    sectionLabelColor: Colors.primary,
    finalTitle: 'Ready to challenge\nyourself?',
    finalSubtitle: 'Join thousands building better habits with friends.',
    finalCtaText: 'Create My Challenge',
    brandDotColor: Colors.secondary,
    loginColor: Colors.primary,
};

const GIFT_CONFIG: ModeConfig = {
    accentColor: Colors.warning,
    gradient: [Colors.warningLighter, Colors.white, Colors.white] as const,
    rotatingWords: [
        { word: 'get fit', color: Colors.warning },
        { word: 'read daily', color: Colors.categoryAmber },
        { word: 'run more', color: Colors.warning },
        { word: 'study hard', color: Colors.categoryAmber },
        { word: 'eat healthy', color: Colors.warning },
    ],
    titlePrefix: 'Give them the push to',
    titleSuffix: '',
    subtitle: 'Empower your loved ones.\nYou only pay when they succeed.',
    stat: 'People are ',
    statHighlight: '600%',
    statColor: Colors.warning,
    ctaText: 'Gift an Experience',
    ctaGradient: [Colors.warning, Colors.warningMedium] as const,
    ctaShadowColor: Colors.warning,
    badgeText: 'Zero risk \u2014 pay only on success',
    badgeBg: Colors.warningLight,
    badgeBorder: Colors.warningBorder,
    badgeTextColor: Colors.warningDark,
    navigateTo: 'GiftFlow',
    steps: [
        {
            icon: <Sparkles color={Colors.warning} size={24} strokeWidth={2.5} />,
            iconBg: Colors.warningLight,
            title: 'Pick a Reward',
            desc: 'Choose an experience your loved one will earn once they achieve their goal',
        },
        {
            icon: <Target color={Colors.warningMedium} size={24} strokeWidth={2.5} />,
            iconBg: Colors.warningLighter,
            title: 'They Set the Goal',
            desc: 'Your loved one picks their challenge and works towards it, day by day',
        },
        {
            icon: <Trophy color={Colors.warningDark} size={24} strokeWidth={2.5} />,
            iconBg: Colors.warningLight,
            title: 'Pay When They Succeed',
            desc: 'You only pay when they achieve their goal. Zero risk. All reward.',
        },
    ],
    stepNumberBg: Colors.warningMedium,
    stepDividerColor: Colors.warningBorder,
    sectionLabelColor: Colors.warning,
    finalTitle: 'Ready to empower\nsomeone?',
    finalSubtitle: 'Give the gift that actually means something.',
    finalCtaText: 'Gift an Experience',
    brandDotColor: Colors.warning,
    loginColor: Colors.warning,
};

// Left carousel — goal activity images
const GOAL_IMAGES = [
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?fit=crop&w=400&h=520&q=80', // Workout
    'https://images.unsplash.com/photo-1512820790803-83ca734da794?fit=crop&w=400&h=520&q=80', // Read
    'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?fit=crop&w=400&h=520&q=80',    // Run
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?fit=crop&w=400&h=520&q=80', // Walk
    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?fit=crop&w=400&h=520&q=80',    // Yoga
];

// Right carousel — experience reward images
const REWARD_IMAGES = [
    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?fit=crop&w=400&h=520&q=80',  // Scuba diving
    'https://images.unsplash.com/photo-1474540412665-1cdae210ae6b?fit=crop&w=400&h=520&q=80', // Skydiving
    'https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?fit=crop&w=400&h=520&q=80', // Hot air balloon
    'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?fit=crop&w=400&h=520&q=80', // Road trip
    'https://images.unsplash.com/photo-1530549387789-4c1017266635?fit=crop&w=400&h=520&q=80', // Swimming
];

function wrapOffset(i: number, current: number, total: number): number {
    let diff = i - current;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;
    return diff;
}

// ─── Component ────────────────────────────────────────────────────
type LandingNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ChallengeLanding'>;

export default function ChallengeLandingScreen() {
    const navigation = useNavigation<LandingNavigationProp>();
    const route = useRoute<RouteProp<RootStackParamList, 'ChallengeLanding'>>();
    const { state } = useApp();
    const isLoggedIn = !!state.user?.id;

    // Mode from route param (GiftLanding passes mode='gift')
    const initialMode: LandingMode = (route.params as any)?.mode === 'gift' ? 'gift' : 'self';
    const [mode, setMode] = useState<LandingMode>(initialMode);
    const [wordIndex, setWordIndex] = useState(0);
    const [rewardIndex, setRewardIndex] = useState(0);
    const [toggleBarWidth, setToggleBarWidth] = useState(0);

    // Animation values
    const sliderAnim = useRef(new RNAnimated.Value(initialMode === 'gift' ? 1 : 0)).current;
    const contentOpacity = useRef(new RNAnimated.Value(1)).current;

    const config = mode === 'self' ? SELF_CONFIG : GIFT_CONFIG;

    // Cycle rotating word + goal images every 3s
    useEffect(() => {
        const interval = setInterval(() => {
            setWordIndex((prev) => (prev + 1) % config.rotatingWords.length);
        }, 3000);
        return () => clearInterval(interval);
    }, [config.rotatingWords.length]);

    // Cycle reward images every 4s (offset from goals)
    useEffect(() => {
        const interval = setInterval(() => {
            setRewardIndex((prev) => (prev + 1) % REWARD_IMAGES.length);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    // Reset word index when mode changes
    useEffect(() => {
        setWordIndex(0);
    }, [mode]);

    const switchMode = useCallback((newMode: LandingMode) => {
        if (newMode === mode) return;

        // Animate slider + color transitions
        RNAnimated.spring(sliderAnim, {
            toValue: newMode === 'gift' ? 1 : 0,
            damping: 18,
            stiffness: 140,
            mass: 0.8,
            useNativeDriver: false,
        }).start();

        // Fade out text content, swap, fade in (only for text that changes words)
        RNAnimated.timing(contentOpacity, {
            toValue: 0,
            duration: CONTENT_FADE_MS,
            useNativeDriver: false,
        }).start(() => {
            setMode(newMode);
            RNAnimated.timing(contentOpacity, {
                toValue: 1,
                duration: CONTENT_FADE_MS,
                useNativeDriver: false,
            }).start();
        });
    }, [mode, sliderAnim, contentOpacity]);

    const handleCta = useCallback(() => {
        navigation.navigate(config.navigateTo as any);
    }, [navigation, config.navigateTo]);

    const currentWord = config.rotatingWords[wordIndex % config.rotatingWords.length];

    // ─── Animated color interpolations (smooth transitions) ───
    const TOGGLE_PAD = 3;
    const sliderWidth = toggleBarWidth > 0 ? (toggleBarWidth - TOGGLE_PAD * 2) / 2 : 0;

    const sliderBgColor = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [Colors.primary, Colors.warning],
    });
    // Hero gradient cross-fade: gift overlay opacity
    const giftGradientOpacity = sliderAnim;
    // Accent colors
    const animBrandDot = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [Colors.secondary, Colors.warning],
    });
    const animLoginColor = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [Colors.primary, Colors.warning],
    });
    const animStatColor = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [Colors.secondary, Colors.warning],
    });
    const animSectionLabel = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [Colors.primary, Colors.warning],
    });
    const animStepNumberBg = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [Colors.gray800, Colors.warningMedium],
    });
    const animStepDivider = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [Colors.backgroundLight, Colors.warningBorder],
    });
    const animBadgeBg = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [Colors.primarySurface, Colors.warningLight],
    });
    const animBadgeBorder = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [Colors.primaryLight, Colors.warningBorder],
    });
    const animBadgeText = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [Colors.secondary, Colors.warningDark],
    });

    return (
        <ErrorBoundary screenName="ChallengeLandingScreen" userId={state.user?.id}>
        <View style={styles.container}>
            <StatusBar style="dark" />
            <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Hero Section — stacked gradients for smooth cross-fade */}
                <View style={styles.hero}>
                    <LinearGradient
                        colors={[...SELF_CONFIG.gradient]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <RNAnimated.View style={[StyleSheet.absoluteFill, { opacity: giftGradientOpacity }]}>
                        <LinearGradient
                            colors={[...GIFT_CONFIG.gradient]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                    </RNAnimated.View>

                    {/* Top bar */}
                    {navigation.canGoBack() && (
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => navigation.goBack()}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel="Go back"
                        >
                            <ChevronLeft color={Colors.textPrimary} size={24} strokeWidth={2.5} />
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={styles.loginButton}
                        onPress={() => isLoggedIn
                            ? navigation.navigate('Goals')
                            : navigation.navigate('Auth', { mode: 'signin' })
                        }
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={isLoggedIn ? 'Go to app' : 'Log in to your account'}
                    >
                        <RNAnimated.Text style={[styles.loginButtonText, { color: animLoginColor }]}>
                            {isLoggedIn ? 'Go to App' : 'Log In'}
                        </RNAnimated.Text>
                        <ChevronRight color={mode === 'self' ? Colors.primary : Colors.warning} size={16} strokeWidth={3} />
                    </TouchableOpacity>

                    <View style={styles.heroWrapper}>
                        <MotiView
                            from={{ opacity: 0, translateY: 30 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 700 }}
                            style={styles.heroContent}
                        >
                            {/* Brand */}
                            <View style={styles.brandSection}>
                                <Text style={styles.brandTitle}>
                                    ernit<RNAnimated.Text style={{ color: animBrandDot }}>.</RNAnimated.Text>
                                </Text>
                            </View>

                            {/* ─── Toggle Bar ─── */}
                            <View style={styles.toggleWrap}>
                                <View
                                    style={styles.toggleBar}
                                    onLayout={(e) => setToggleBarWidth(e.nativeEvent.layout.width)}
                                >
                                    {sliderWidth > 0 && (
                                        <RNAnimated.View
                                            style={[
                                                styles.toggleSlider,
                                                {
                                                    width: sliderWidth,
                                                    backgroundColor: sliderBgColor,
                                                    transform: [{
                                                        translateX: sliderAnim.interpolate({
                                                            inputRange: [0, 1],
                                                            outputRange: [0, sliderWidth],
                                                        }),
                                                    }],
                                                },
                                            ]}
                                        />
                                    )}
                                    <TouchableOpacity
                                        style={styles.toggleBtn}
                                        onPress={() => switchMode('self')}
                                        activeOpacity={0.8}
                                        accessibilityRole="button"
                                        accessibilityLabel="For myself"
                                    >
                                        <Text style={[
                                            styles.toggleBtnText,
                                            mode === 'self' && styles.toggleBtnTextActive,
                                        ]}>
                                            For myself
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.toggleBtn}
                                        onPress={() => switchMode('gift')}
                                        activeOpacity={0.8}
                                        accessibilityRole="button"
                                        accessibilityLabel="For a loved one"
                                    >
                                        <Text style={[
                                            styles.toggleBtnText,
                                            mode === 'gift' && styles.toggleBtnTextActive,
                                        ]}>
                                            For a loved one
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* ─── Text content (fades on toggle) ─── */}
                            <RNAnimated.View style={{ opacity: contentOpacity }}>
                                <View style={styles.heroTitleContainer}>
                                    <Text style={styles.heroTitle}>{config.titlePrefix}</Text>
                                    <View style={styles.dialRow}>
                                        <View style={styles.dialSlot}>
                                            <Text style={[styles.dialWord, { opacity: 0 }]}>
                                                {currentWord.word}
                                            </Text>
                                            {config.rotatingWords.map((item, i) => {
                                                const offset = wrapOffset(i, wordIndex % config.rotatingWords.length, config.rotatingWords.length);
                                                const isActive = offset === 0;
                                                return (
                                                    <MotiView
                                                        key={`dial-${mode}-${i}`}
                                                        animate={{
                                                            translateY: offset * WORD_SLOT_HEIGHT,
                                                            opacity: isActive ? 1 : 0,
                                                        }}
                                                        transition={{
                                                            type: 'spring',
                                                            damping: 18,
                                                            stiffness: 140,
                                                            mass: 0.8,
                                                        }}
                                                        style={styles.dialWordContainer}
                                                    >
                                                        <Text style={[styles.dialWord, { color: item.color }]}>
                                                            {item.word}
                                                        </Text>
                                                    </MotiView>
                                                );
                                            })}
                                        </View>
                                        {config.titleSuffix ? (
                                            <Text style={styles.heroTitle}>{config.titleSuffix}</Text>
                                        ) : null}
                                    </View>
                                </View>

                                <Text style={styles.heroSubtitle}>
                                    {config.subtitle}
                                </Text>
                            </RNAnimated.View>

                            {/* ─── Dual image carousels (always visible, never fade) ─── */}
                            <View style={styles.cardsRowOuter}>
                            <View style={styles.cardsRow}>
                                {/* Left — Goal images (next peeks from left only, slides L→R) */}
                                <View style={styles.cardCarousel}>
                                    {GOAL_IMAGES.map((url, i) => {
                                        const offset = wrapOffset(i, wordIndex % GOAL_IMAGES.length, GOAL_IMAGES.length);
                                        const isCenter = offset === 0;
                                        // Only show the image peeking on the LEFT (offset === -1)
                                        const isPeekLeft = offset === -1;
                                        const tx = offset * CARD_SLIDE;
                                        return (
                                            <MotiView
                                                key={`goal-${i}`}
                                                animate={{
                                                    translateX: tx,
                                                    scale: isCenter ? 1 : 0.9,
                                                    opacity: isCenter ? 1 : isPeekLeft ? 0.5 : 0,
                                                }}
                                                transition={{
                                                    type: 'spring',
                                                    damping: 20,
                                                    stiffness: 90,
                                                    mass: 0.9,
                                                }}
                                                style={[
                                                    styles.cardImageCard,
                                                    { zIndex: isCenter ? 3 : isPeekLeft ? 2 : 1 },
                                                ]}
                                            >
                                                <Image
                                                    source={{ uri: url }}
                                                    style={styles.cardImg}
                                                    resizeMode="cover"
                                                    accessibilityLabel={`Goal activity ${i + 1}`}
                                                />
                                            </MotiView>
                                        );
                                    })}
                                    <RNAnimated.View style={[styles.cardLabelWrap, { opacity: contentOpacity }]}>
                                        <Text style={styles.cardLabel}>
                                            {mode === 'self' ? 'Your goal' : 'Their goal'}
                                        </Text>
                                    </RNAnimated.View>
                                </View>

                                {/* Lock icon between cards */}
                                <View style={styles.lockIcon}>
                                    <Lock size={22} color={Colors.textPrimary} strokeWidth={2.2} />
                                </View>

                                {/* Right — Reward images (next peeks from right only, slides R→L) */}
                                <View style={styles.cardCarousel}>
                                    {REWARD_IMAGES.map((url, i) => {
                                        const offset = wrapOffset(i, rewardIndex % REWARD_IMAGES.length, REWARD_IMAGES.length);
                                        const isCenter = offset === 0;
                                        // Only show the image peeking on the RIGHT (offset -1 negated → positive tx)
                                        const isPeekRight = offset === -1;
                                        const tx = -offset * CARD_SLIDE;
                                        return (
                                            <MotiView
                                                key={`reward-${i}`}
                                                animate={{
                                                    translateX: tx,
                                                    scale: isCenter ? 1 : 0.9,
                                                    opacity: isCenter ? 1 : isPeekRight ? 0.5 : 0,
                                                }}
                                                transition={{
                                                    type: 'spring',
                                                    damping: 20,
                                                    stiffness: 90,
                                                    mass: 0.9,
                                                }}
                                                style={[
                                                    styles.cardImageCard,
                                                    { zIndex: isCenter ? 3 : isPeekRight ? 2 : 1 },
                                                ]}
                                            >
                                                <Image
                                                    source={{ uri: url }}
                                                    style={styles.cardImg}
                                                    resizeMode="cover"
                                                    accessibilityLabel={`Reward experience ${i + 1}`}
                                                />
                                            </MotiView>
                                        );
                                    })}
                                    <RNAnimated.View style={[styles.cardLabelWrap, { opacity: contentOpacity }]}>
                                        <Text style={styles.cardLabel}>
                                            {mode === 'self' ? 'Your reward' : 'Their reward'}
                                        </Text>
                                    </RNAnimated.View>
                                </View>
                            </View>
                            </View>

                            {/* ─── Stat + CTA + Badge (text fades, colors animate) ─── */}
                            <RNAnimated.View style={{ opacity: contentOpacity }}>
                                <View style={styles.statContainer}>
                                    <Text style={styles.statText}>
                                        {config.stat}
                                        <RNAnimated.Text style={{ color: animStatColor, fontWeight: '700' }}>
                                            {config.statHighlight}
                                        </RNAnimated.Text>
                                        {mode === 'self'
                                            ? ' more likely to achieve your goals with friends backing you.'
                                            : ' more likely to achieve goals when someone believes in them.'}
                                    </Text>
                                </View>
                            </RNAnimated.View>

                            {/* CTA — stacked gradients for smooth color transition */}
                            <TouchableOpacity
                                style={styles.primaryCta}
                                onPress={handleCta}
                                activeOpacity={0.9}
                                accessibilityRole="button"
                                accessibilityLabel={config.ctaText}
                            >
                                <View style={styles.ctaGradient}>
                                    <LinearGradient
                                        colors={[...SELF_CONFIG.ctaGradient]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={StyleSheet.absoluteFill}
                                    />
                                    <RNAnimated.View style={[StyleSheet.absoluteFill, { opacity: giftGradientOpacity }]}>
                                        <LinearGradient
                                            colors={[...GIFT_CONFIG.ctaGradient]}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={StyleSheet.absoluteFill}
                                        />
                                    </RNAnimated.View>
                                    <RNAnimated.View style={[styles.ctaInner, { opacity: contentOpacity }]}>
                                        <Text style={styles.ctaText}>{config.ctaText}</Text>
                                        <ChevronRight color={Colors.white} size={20} strokeWidth={3} />
                                    </RNAnimated.View>
                                </View>
                            </TouchableOpacity>

                            {/* Badge — animated colors */}
                            <View style={styles.badgeWrapper}>
                                <RNAnimated.View style={[styles.badge, {
                                    backgroundColor: animBadgeBg,
                                    borderColor: animBadgeBorder,
                                }]}>
                                    <RNAnimated.View style={{ opacity: contentOpacity }}>
                                        <RNAnimated.Text style={[styles.badgeText, { color: animBadgeText }]}>
                                            {config.badgeText}
                                        </RNAnimated.Text>
                                    </RNAnimated.View>
                                </RNAnimated.View>
                            </View>
                        </MotiView>
                    </View>
                </View>

                <JourneyDemo />

                {/* How It Works Section */}
                <View style={styles.howSection}>
                    <View style={styles.howWrapper}>
                        <MotiView
                            from={{ opacity: 0, translateY: 20 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 500 }}
                        >
                            <RNAnimated.Text style={[styles.sectionLabel, { color: animSectionLabel }]}>
                                How It Works
                            </RNAnimated.Text>
                            <Text style={styles.sectionTitle}>Three Simple Steps</Text>
                        </MotiView>

                        <RNAnimated.View style={[styles.stepsContainer, { opacity: contentOpacity }]}>
                            {config.steps.map((step, i) => (
                                <React.Fragment key={`${mode}-step-${i}`}>
                                    {i > 0 && (
                                        <RNAnimated.View style={[styles.stepDivider, { backgroundColor: animStepDivider }]} />
                                    )}
                                    <MotiView
                                        from={{ opacity: 0, translateX: -20 }}
                                        animate={{ opacity: 1, translateX: 0 }}
                                        transition={{
                                            type: 'spring',
                                            damping: 35,
                                            delay: i * 150,
                                        }}
                                    >
                                        <View style={styles.stepCard}>
                                            <View style={styles.stepIconContainer}>
                                                <View style={[styles.stepIconBg, { backgroundColor: step.iconBg }]}>
                                                    {step.icon}
                                                </View>
                                                <RNAnimated.View style={[styles.stepNumber, { backgroundColor: animStepNumberBg }]}>
                                                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                                                </RNAnimated.View>
                                            </View>
                                            <View style={styles.stepContent}>
                                                <Text style={styles.stepTitle}>{step.title}</Text>
                                                <Text style={styles.stepDesc}>{step.desc}</Text>
                                            </View>
                                        </View>
                                    </MotiView>
                                </React.Fragment>
                            ))}
                        </RNAnimated.View>
                    </View>
                </View>

                {/* Co-Founders Section */}
                <View style={styles.foundersSection}>
                    <View style={styles.foundersWrapper}>
                        <MotiView
                            from={{ opacity: 0, translateY: 20 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 500 }}
                        >
                            <RNAnimated.Text style={[styles.sectionLabel, { color: animSectionLabel }]}>
                                The Team {'\n'}{'\n'}
                            </RNAnimated.Text>
                        </MotiView>

                        <View style={styles.foundersRow}>
                            {[
                                {
                                    name: 'Raul Marquez',
                                    role: 'Co-Founder & CEO',
                                    image: 'https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/founder%20photos%2F20260116_DBP0431.jpg?alt=media&token=c8e102c4-7068-4d45-8bcb-32f8714cc62c',
                                },
                                {
                                    name: 'Nuno Castilho',
                                    role: 'Co-Founder & CTO',
                                    image: 'https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/founder%20photos%2Ffoto.jpeg?alt=media&token=4c4b8d02-1741-40ee-88fc-8cd658133864',
                                },
                            ].map((founder, i) => (
                                <MotiView
                                    key={i}
                                    from={{ opacity: 0, translateY: 20 }}
                                    animate={{ opacity: 1, translateY: 0 }}
                                    transition={{
                                        type: 'spring',
                                        damping: 28,
                                        delay: i * 150,
                                    }}
                                    style={styles.founderCard}
                                >
                                    <Image
                                        source={{ uri: founder.image }}
                                        style={styles.founderPhoto}
                                        resizeMode="cover"
                                        accessibilityLabel={`${founder.name}, ${founder.role}`}
                                    />
                                    <Text style={styles.founderName}>{founder.name}</Text>
                                    <Text style={styles.founderRole}>{founder.role}</Text>
                                </MotiView>
                            ))}
                        </View>

                        <MotiView
                            from={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: 'spring', damping: 28, delay: 400 }}
                            style={styles.incubatorBadge}
                        >
                            <Text style={styles.incubatorText}>Incubated at</Text>
                            <TouchableOpacity
                                onPress={() => Linking.openURL('http://unicornfactorylisboa.com')}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel="Visit Unicorn Factory Lisboa website"
                            >
                                <Image
                                    source={{ uri: 'http://unicornfactorylisboa.com/wp-content/uploads/2021/11/Layer-1-2.png' }}
                                    style={styles.incubatorLogo}
                                    resizeMode="contain"
                                    accessibilityLabel="Unicorn Factory Lisboa logo"
                                />
                            </TouchableOpacity>
                        </MotiView>
                    </View>
                </View>

                {/* Final CTA */}
                <MotiView
                    from={{ opacity: 0, translateY: 20 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{ type: 'timing', duration: 500, delay: 300 }}
                    style={styles.finalCtaSection}
                >
                    <RNAnimated.View style={{ opacity: contentOpacity }}>
                        <Text style={styles.finalCtaTitle}>{config.finalTitle}</Text>
                        <Text style={styles.finalCtaSubtitle}>{config.finalSubtitle}</Text>
                    </RNAnimated.View>

                    <TouchableOpacity
                        style={styles.primaryCta}
                        onPress={handleCta}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel={config.finalCtaText}
                    >
                        <View style={styles.ctaGradient}>
                            <LinearGradient
                                colors={[...SELF_CONFIG.ctaGradient]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFill}
                            />
                            <RNAnimated.View style={[StyleSheet.absoluteFill, { opacity: giftGradientOpacity }]}>
                                <LinearGradient
                                    colors={[...GIFT_CONFIG.ctaGradient]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={StyleSheet.absoluteFill}
                                />
                            </RNAnimated.View>
                            <RNAnimated.View style={[styles.ctaInner, { opacity: contentOpacity }]}>
                                <Text style={styles.ctaText}>{config.finalCtaText}</Text>
                                <ChevronRight color={Colors.white} size={20} strokeWidth={3} />
                            </RNAnimated.View>
                        </View>
                    </TouchableOpacity>
                </MotiView>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerBrand}>
                        ernit<RNAnimated.Text style={{ color: animBrandDot }}>.</RNAnimated.Text>
                    </Text>
                    <View style={styles.footerSocials}>
                        <TouchableOpacity
                            style={styles.socialBtn}
                            onPress={() => Linking.openURL('https://www.linkedin.com/company/ernit-app/')}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="Visit Ernit on LinkedIn"
                        >
                            <Text style={styles.socialIcon}>in</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.socialBtn}
                            onPress={() => Linking.openURL('https://www.instagram.com/ernitapp__/')}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="Visit Ernit on Instagram"
                        >
                            <Text style={styles.socialIcon}>ig</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.socialBtn}
                            onPress={() => Linking.openURL('https://www.tiktok.com/@ernitapp')}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="Visit Ernit on TikTok"
                        >
                            <Text style={styles.socialIcon}>tk</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.footerCopy}>
                        {new Date().getFullYear()} Ernit. All rights reserved.
                    </Text>
                </View>
            </ScrollView>
        </View>
        </ErrorBoundary>
    );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.surface,
    },
    scrollContent: {
        flexGrow: 1,
        backgroundColor: Colors.white,
    },
    hero: {
        paddingTop: Platform.OS === 'ios' ? 70 : 50,
        paddingHorizontal: 24,
        backgroundColor: Colors.white,
        position: 'relative',
        overflow: 'hidden',
        alignItems: 'center',
    },
    heroWrapper: {
        width: '100%',
        maxWidth: 600,
        zIndex: 2,
    },
    heroContent: {
        width: '100%',
    },
    backButton: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 50 : 30,
        left: 24,
        width: 40,
        height: 40,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.white,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
        ...Shadows.sm,
    },
    loginButton: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 54 : 34,
        right: 24,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xxs,
        zIndex: 10,
    },
    loginButtonText: {
        ...Typography.bodyBold,
    },
    brandSection: {
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    brandTitle: {
        fontSize: 44,
        fontWeight: '900',
        fontStyle: 'italic',
        color: Colors.textPrimary,
        letterSpacing: -1.5,
    },

    // ── Toggle Bar ──────────────────────────────────
    toggleWrap: {
        alignItems: 'center',
        marginBottom: Spacing.xxl,
        paddingHorizontal: Spacing.md,
    },
    toggleBar: {
        flexDirection: 'row',
        backgroundColor: Colors.gray100,
        borderRadius: BorderRadius.pill,
        padding: 3,
        position: 'relative',
        width: '100%',
        maxWidth: 360,
    },
    toggleSlider: {
        position: 'absolute',
        top: 3,
        left: 3,
        bottom: 3,
        borderRadius: BorderRadius.pill,
        zIndex: 1,
    },
    toggleBtn: {
        flex: 1,
        paddingVertical: Spacing.sm + 2,
        alignItems: 'center',
        zIndex: 2,
    },
    toggleBtnText: {
        ...Typography.small,
        fontWeight: '600',
        color: Colors.textTertiary,
    },
    toggleBtnTextActive: {
        color: Colors.white,
    },

    // ── Dial-style rotating word ──────────────────
    heroTitleContainer: {
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    heroTitle: {
        ...Typography.display,
        fontWeight: '800',
        color: Colors.gray800,
        lineHeight: 46,
        letterSpacing: -1,
        textAlign: 'center',
    },
    dialRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dialSlot: {
        height: WORD_SLOT_HEIGHT,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    dialWordContainer: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        height: WORD_SLOT_HEIGHT,
    },
    dialWord: {
        ...Typography.display,
        fontWeight: '800',
        fontStyle: 'italic',
        lineHeight: WORD_SLOT_HEIGHT,
        letterSpacing: -1,
        textAlign: 'center',
    },

    heroSubtitle: {
        ...Typography.subheading,
        color: Colors.textSecondary,
        lineHeight: 28,
        marginBottom: Spacing.lg,
        textAlign: 'center',
    },

    // ── Dual image carousels ──────────────────────
    cardsRowOuter: {
        width: SCREEN_W,
        alignSelf: 'center',
        marginHorizontal: -CARDS_PADDING,
        overflow: 'hidden',
        marginTop: Spacing.xl,
        marginBottom: Spacing.xl,
        paddingVertical: Spacing.sm,
    },
    cardsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: CARDS_GAP,
        position: 'relative',
    },
    cardCarousel: {
        width: CARD_W,
        height: CARD_H,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    cardImageCard: {
        position: 'absolute',
        width: CARD_W,
        height: CARD_H,
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        backgroundColor: Colors.gray200,
    },
    cardImg: {
        width: '100%',
        height: '100%',
    },
    cardLabelWrap: {
        position: 'absolute',
        bottom: Spacing.sm,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 5,
    },
    cardLabel: {
        ...Typography.caption,
        fontWeight: '600',
        color: Colors.white,
        backgroundColor: 'rgba(0,0,0,0.45)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xxs,
        borderRadius: BorderRadius.sm,
        overflow: 'hidden',
    },
    lockIcon: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        marginLeft: -24,
        marginTop: -24,
        width: 48,
        height: 48,
        borderRadius: BorderRadius.pill,
        backgroundColor: 'rgba(255,255,255,0.95)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 5,
        ...Shadows.md,
    },

    statContainer: {
        alignItems: 'center',
        paddingHorizontal: Spacing.xxxl,
        marginBottom: Spacing.xxxl,
    },
    statText: {
        ...Typography.subheading,
        color: Colors.textSecondary,
        textAlign: 'center',
    },

    badgeWrapper: {
        alignItems: 'center',
        marginTop: Spacing.lg,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
        marginBottom: Spacing.huge,
    },
    badgeText: {
        ...Typography.small,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    primaryCta: {
        alignSelf: 'center',
        borderRadius: BorderRadius.lg,
    },
    ctaGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: BorderRadius.lg,
        minHeight: 56,
    },
    ctaInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.xxxl,
        paddingVertical: Spacing.xl,
    },
    ctaText: {
        color: Colors.white,
        ...Typography.heading3,
    },

    // ── How It Works ────────────────────────────────
    howSection: {
        paddingVertical: 64,
        paddingHorizontal: Spacing.xxl,
        backgroundColor: Colors.white,
        alignItems: 'center',
    },
    howWrapper: {
        width: '100%',
        maxWidth: 600,
    },
    sectionLabel: {
        ...Typography.small,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    sectionTitle: {
        ...Typography.display,
        fontWeight: '800',
        color: Colors.gray800,
        marginBottom: Spacing.huge,
        textAlign: 'center',
    },
    stepsContainer: {
        gap: 0,
    },
    stepCard: {
        flexDirection: 'row',
        gap: Spacing.xl,
    },
    stepDivider: {
        width: 2,
        height: 32,
        marginLeft: 27,
        marginVertical: Spacing.lg,
    },
    stepIconContainer: {
        position: 'relative',
    },
    stepIconBg: {
        width: 56,
        height: 56,
        borderRadius: BorderRadius.lg,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepNumber: {
        position: 'absolute',
        top: -8,
        right: -8,
        width: 24,
        height: 24,
        borderRadius: BorderRadius.md,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: Colors.white,
    },
    stepNumberText: {
        color: Colors.white,
        ...Typography.captionBold,
        fontWeight: '800',
    },
    stepContent: {
        flex: 1,
        paddingTop: Spacing.xs,
    },
    stepTitle: {
        ...Typography.large,
        color: Colors.gray800,
        marginBottom: Spacing.sm,
    },
    stepDesc: {
        ...Typography.body,
        color: Colors.textSecondary,
    },

    // ── Final CTA ───────────────────────────────────
    finalCtaSection: {
        paddingVertical: 64,
        backgroundColor: Colors.surface,
        width: '100%',
        maxWidth: 1200,
        alignSelf: 'center',
        paddingHorizontal: Spacing.xxl,
        alignItems: 'center',
    },
    finalCtaTitle: {
        ...Typography.display,
        fontWeight: '800',
        color: Colors.gray800,
        marginBottom: Spacing.md,
        textAlign: 'center',
    },
    finalCtaSubtitle: {
        ...Typography.subheading,
        color: Colors.textSecondary,
        marginBottom: Spacing.xxxl,
        textAlign: 'center',
    },

    // ── Co-Founders Section ───────────────────────
    foundersSection: {
        paddingVertical: 64,
        paddingHorizontal: Spacing.xxl,
        backgroundColor: Colors.primarySurface,
        alignItems: 'center',
    },
    foundersWrapper: {
        width: '100%',
        maxWidth: 600,
        alignItems: 'center',
    },
    foundersRow: {
        flexDirection: 'row',
        gap: Spacing.xxl,
        justifyContent: 'center',
        flexWrap: 'wrap',
        marginBottom: Spacing.xxxl,
    },
    founderCard: {
        alignItems: 'center',
        width: 200,
    },
    founderPhoto: {
        width: 96,
        height: 96,
        borderRadius: BorderRadius.pill,
        marginBottom: Spacing.lg,
        borderWidth: 3,
        borderColor: Colors.white,
        ...Shadows.md,
        shadowOpacity: 0.1,
    },
    founderName: {
        ...Typography.heading3,
        fontWeight: '800',
        color: Colors.gray800,
        marginBottom: Spacing.xs,
        textAlign: 'center',
    },
    founderRole: {
        ...Typography.small,
        fontWeight: '600',
        color: Colors.primary,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    incubatorBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.xxl,
        borderWidth: 1,
        borderColor: Colors.primaryBorder,
        ...Shadows.sm,
        shadowOpacity: 0.04,
    },
    incubatorText: {
        ...Typography.small,
        fontWeight: '500',
        color: Colors.textSecondary,
    },
    incubatorLogo: {
        width: 120,
        height: 28,
    },

    // ── Footer ────────────────────────────────────
    footer: {
        alignItems: 'center',
        paddingVertical: Spacing.huge,
        paddingHorizontal: Spacing.xxl,
        backgroundColor: Colors.textPrimary,
    },
    footerBrand: {
        ...Typography.display,
        fontWeight: '900',
        fontStyle: 'italic',
        color: Colors.white,
        letterSpacing: -1,
        marginBottom: Spacing.xl,
    },
    footerSocials: {
        flexDirection: 'row',
        gap: Spacing.lg,
        marginBottom: Spacing.xxl,
    },
    socialBtn: {
        width: 40,
        height: 40,
        borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    socialIcon: {
        ...Typography.bodyBold,
        fontWeight: '800',
        color: Colors.white,
    },
    footerCopy: {
        ...Typography.caption,
        color: Colors.whiteAlpha40,
    },
});
