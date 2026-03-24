import React, { useEffect, useState, useCallback, useRef, ReactNode, useMemo } from 'react';
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
import { Target, Calendar, Users, Sparkles, ChevronRight, ChevronLeft, Trophy } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { MotiView } from 'moti';
import { RootStackParamList } from '../types';
import { useApp } from '../context/AppContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { Shadows } from '../config/shadows';
import JourneyDemo from '../components/JourneyDemo';
import { vh, VH } from '../utils/responsive';
import * as Haptics from 'expo-haptics';
import { analyticsService } from '../services/AnalyticsService';

// ─── Constants ────────────────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;

const WORD_SLOT_HEIGHT = vh(46);
const CONTENT_FADE_MS = 250;

// Dual carousel sizing — responsive to screen width AND height
const CARDS_GAP = 10;
const CARDS_PADDING = 16;
const CARD_W = Math.min((SCREEN_W - CARDS_PADDING * 2 - CARDS_GAP) / 2, 240);
const CARD_H = CARD_W * (0.9 + 0.45 * VH);
const CARD_SLIDE = CARD_W * 0.7;

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
    statSuffix: string;
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

const getSelfConfig = (colors: typeof Colors): ModeConfig => ({
    accentColor: colors.secondary,
    gradient: [colors.primarySurface, colors.successLighter, colors.white] as const,
    rotatingWords: [
        { word: 'workout', color: colors.secondary },
        { word: 'read', color: colors.accent },
        { word: 'run', color: colors.categoryPink },
        { word: 'walk', color: colors.secondary },
        { word: 'do yoga', color: colors.categoryAmber },
    ],
    titlePrefix: 'I want to',
    titleSuffix: ' more',
    subtitle: 'Set a challenge. Track your progress.\nFriends hold you accountable.',
    stat: "You're ",
    statSuffix: ' more likely to achieve a goal you share with friends.',
    statHighlight: '42%',
    statColor: colors.secondary,
    ctaText: 'Start My Challenge',
    ctaGradient: colors.gradientDark as unknown as readonly [string, string],
    ctaShadowColor: colors.primary,
    badgeText: '100% Free',
    badgeBg: colors.primarySurface,
    badgeBorder: colors.primaryLight,
    badgeTextColor: colors.secondary,
    navigateTo: 'ChallengeSetup',
    steps: [
        {
            icon: <Target color={colors.primary} size={24} strokeWidth={2.5} />,
            iconBg: colors.primarySurface,
            title: 'Pick Your Challenge',
            desc: 'Choose what you want to improve and for how long. Gym, yoga, running, reading, or anything you want',
        },
        {
            icon: <Calendar color={colors.accent} size={24} strokeWidth={2.5} />,
            iconBg: colors.accentDeep + '18',
            title: 'Stick to It',
            desc: 'Do your sessions, build streaks, and get motivated by friends who follow your journey, and can even reward you along the way',
        },
        {
            icon: <Users color={colors.pink} size={24} strokeWidth={2.5} />,
            iconBg: colors.pinkLight,
            title: 'Earn it',
            desc: 'Finish your challenge and have the reward you deserve!',
        },
    ],
    stepNumberBg: colors.gray800,
    stepDividerColor: colors.backgroundLight,
    sectionLabelColor: colors.primary,
    finalTitle: 'Ready to challenge\nyourself?',
    finalSubtitle: 'Join thousands building better habits with friends.',
    finalCtaText: 'Create My Challenge',
    brandDotColor: colors.secondary,
    loginColor: colors.primary,
});

const getGiftConfig = (colors: typeof Colors): ModeConfig => ({
    accentColor: colors.warning,
    gradient: [colors.warningLighter, colors.white, colors.white] as const,
    rotatingWords: [
        { word: 'workout', color: colors.warning },
        { word: 'read', color: colors.categoryAmber },
        { word: 'run', color: colors.warning },
        { word: 'walk', color: colors.categoryAmber },
        { word: 'do yoga', color: colors.warning },
    ],
    titlePrefix: 'Help them',
    titleSuffix: ' more',
    subtitle: 'Empower someone you care about.\nYou only pay when they succeed.',
    stat: 'A reward + someone backing them ',
    statSuffix: ' their chance of success.',
    statHighlight: 'doubles',
    statColor: colors.warning,
    ctaText: 'Gift an Experience',
    ctaGradient: [colors.warning, colors.warningMedium] as const,
    ctaShadowColor: colors.warning,
    badgeText: 'Pay only on success',
    badgeBg: colors.warningLight,
    badgeBorder: colors.warningBorder,
    badgeTextColor: colors.warningDark,
    navigateTo: 'GiftFlow',
    steps: [
        {
            icon: <Sparkles color={colors.warning} size={24} strokeWidth={2.5} />,
            iconBg: colors.warningLight,
            title: 'Pick a Reward',
            desc: 'Choose an experience they\'ll earn once they achieve their goal',
        },
        {
            icon: <Target color={colors.warningMedium} size={24} strokeWidth={2.5} />,
            iconBg: colors.warningLighter,
            title: 'They Set the Goal',
            desc: 'They pick their challenge and work towards it, day by day',
        },
        {
            icon: <Trophy color={colors.warningDark} size={24} strokeWidth={2.5} />,
            iconBg: colors.warningLight,
            title: 'Pay When They Succeed',
            desc: 'You only pay when they achieve their goal. Zero risk. All reward.',
        },
    ],
    stepNumberBg: colors.warningMedium,
    stepDividerColor: colors.warningBorder,
    sectionLabelColor: colors.warning,
    finalTitle: 'Ready to empower\nsomeone?',
    finalSubtitle: 'Give the gift that actually means something.',
    finalCtaText: 'Gift an Experience',
    brandDotColor: colors.warning,
    loginColor: colors.warning,
});

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
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const SELF_CONFIG = useMemo(() => getSelfConfig(colors), [colors]);
    const GIFT_CONFIG = useMemo(() => getGiftConfig(colors), [colors]);
    const navigation = useNavigation<LandingNavigationProp>();
    const route = useRoute<RouteProp<RootStackParamList, 'ChallengeLanding'>>();
    const { state } = useApp();
    const isLoggedIn = !!state.user?.id;

    // Mode from route param (GiftLanding passes mode='gift')
    const initialMode: LandingMode = route.params?.mode === 'gift' ? 'gift' : 'self';
    const [mode, setMode] = useState<LandingMode>(initialMode);
    const [wordIndex, setWordIndex] = useState(0);
    const [rewardIndex, setRewardIndex] = useState(0);
    const [toggleBarWidth, setToggleBarWidth] = useState(0);

    // Animation values
    const sliderAnim = useRef(new RNAnimated.Value(initialMode === 'gift' ? 1 : 0)).current;
    const contentOpacity = useRef(new RNAnimated.Value(1)).current;

    const config = mode === 'self' ? SELF_CONFIG : GIFT_CONFIG;

    // Analytics: track landing page view on mount
    useEffect(() => {
        analyticsService.trackEvent('landing_page_viewed', 'navigation', {});
    }, []);

    // Cycle rotating word + goal images every 3s
    useEffect(() => {
        const interval = setInterval(() => {
            setWordIndex((prev) => (prev + 1) % config.rotatingWords.length);
        }, 3000);
        return () => clearInterval(interval);
    }, [config.rotatingWords.length]);

    // Cycle reward images in sync with goals (skip initial mount)
    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        setRewardIndex((prev) => (prev + 1) % REWARD_IMAGES.length);
    }, [wordIndex]);

    const switchMode = useCallback((newMode: LandingMode) => {
        if (newMode === mode) return;

        // Cancel any in-progress fade animation to prevent stuck opacity
        contentOpacity.stopAnimation();

        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        analyticsService.trackEvent('landing_mode_toggled', 'engagement', { mode: newMode });

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
            // Reset carousels to start position for the new mode
            setWordIndex(0);
            setRewardIndex(0);
            RNAnimated.timing(contentOpacity, {
                toValue: 1,
                duration: CONTENT_FADE_MS,
                useNativeDriver: false,
            }).start();
        });
    }, [mode, sliderAnim, contentOpacity]);

    const ctaNavigatingRef = useRef(false);
    const handleCta = useCallback(() => {
        if (ctaNavigatingRef.current) return;
        ctaNavigatingRef.current = true;
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        analyticsService.trackEvent('landing_cta_tapped', 'conversion', { mode });
        navigation.navigate(config.navigateTo as any);
        setTimeout(() => { ctaNavigatingRef.current = false; }, 1000);
    }, [navigation, config.navigateTo, mode]);

    const currentWord = config.rotatingWords[wordIndex % config.rotatingWords.length];

    // ─── Animated color interpolations (smooth transitions) ───
    const TOGGLE_PAD = 3;
    const SLIDER_FALLBACK_WIDTH = 150;
    const sliderWidth = toggleBarWidth > 0 ? (toggleBarWidth - TOGGLE_PAD * 2) / 2 : SLIDER_FALLBACK_WIDTH;

    const sliderBgColor = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.primary, colors.warning],
    });
    // Hero gradient cross-fade: gift overlay opacity
    const giftGradientOpacity = sliderAnim;
    // Accent colors
    const animBrandDot = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.secondary, colors.warning],
    });
    const animLoginColor = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.primary, colors.warning],
    });
    const animStatColor = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.secondary, colors.warning],
    });
    const animSectionLabel = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.primary, colors.warning],
    });
    const animStepNumberBg = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.gray800, colors.warningMedium],
    });
    const animStepDivider = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.backgroundLight, colors.warningBorder],
    });
    const animBadgeBg = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.primarySurface, colors.warningLight],
    });
    const animBadgeBorder = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.primaryLight, colors.warningBorder],
    });
    const animBadgeText = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.secondary, colors.warningDark],
    });
    // Founders section colors
    const animFoundersBg = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.primarySurface, colors.warningLighter],
    });
    const animFounderRole = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.primary, colors.warning],
    });
    const animIncubatorBorder = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.primaryBorder, colors.warningBorder],
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
                                <ChevronLeft color={colors.textPrimary} size={24} strokeWidth={2.5} />
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
                            <RNAnimated.Text style={{ color: animLoginColor, ...Typography.subheading, fontWeight: '700', lineHeight: 18 }}>{'\u203A'}</RNAnimated.Text>
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
                            </MotiView>

                            {/* ─── Dual image carousels ─── */}
                            <MotiView
                                from={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ type: 'spring', damping: 20, stiffness: 90, delay: 300 }}
                            >
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
                                                    {mode === 'self' ? 'Your goal' : 'The goal'}
                                                </Text>
                                            </RNAnimated.View>
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
                                                    {mode === 'self' ? 'Your reward' : 'The reward'}
                                                </Text>
                                            </RNAnimated.View>
                                        </View>
                                    </View>
                                </View>
                            </MotiView>

                            {/* ─── Stat + CTA + Badge (text fades, colors animate) ─── */}
                            <MotiView
                                from={{ opacity: 0, translateY: 20 }}
                                animate={{ opacity: 1, translateY: 0 }}
                                transition={{ type: 'timing', duration: 500, delay: 400 }}
                            >
                                <RNAnimated.View style={{ opacity: contentOpacity }}>
                                    <View style={styles.statContainer}>
                                        <Text style={styles.statText}>
                                            {config.stat}
                                            <RNAnimated.Text style={{ color: animStatColor, fontWeight: '700' }}>
                                                {config.statHighlight}
                                            </RNAnimated.Text>
                                            {config.statSuffix}
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
                                            <ChevronRight color={colors.white} size={20} strokeWidth={3} />
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
                    <RNAnimated.View style={[styles.foundersSection, { backgroundColor: animFoundersBg }]}>
                        <View style={styles.foundersWrapper}>
                            <MotiView
                                from={{ opacity: 0, translateY: 20 }}
                                animate={{ opacity: 1, translateY: 0 }}
                                transition={{ type: 'timing', duration: 500 }}
                            >
                                <RNAnimated.Text style={[styles.sectionLabel, { color: animSectionLabel, marginBottom: Spacing.md }]}>
                                    The Team
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
                                        <RNAnimated.Text style={[styles.founderRole, { color: animFounderRole }]}>{founder.role}</RNAnimated.Text>
                                    </MotiView>
                                ))}
                            </View>

                            <MotiView
                                from={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ type: 'spring', damping: 28, delay: 400 }}
                            >
                                <RNAnimated.View style={[styles.incubatorBadge, { borderColor: animIncubatorBorder }]}>
                                    <Text style={styles.incubatorText}>Incubated at</Text>
                                    <TouchableOpacity
                                        onPress={() => Linking.openURL('https://unicornfactorylisboa.com')}
                                        activeOpacity={0.7}
                                        accessibilityRole="button"
                                        accessibilityLabel="Visit Unicorn Factory Lisboa website"
                                    >
                                        <Image
                                            source={{ uri: 'https://unicornfactorylisboa.com/wp-content/uploads/2021/11/Layer-1-2.png' }}
                                            style={styles.incubatorLogo}
                                            resizeMode="contain"
                                            accessibilityLabel="Unicorn Factory Lisboa logo"
                                        />
                                    </TouchableOpacity>
                                </RNAnimated.View>
                            </MotiView>
                        </View>
                    </RNAnimated.View>

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
                                    <ChevronRight color={colors.white} size={20} strokeWidth={3} />
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
                                <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.textOnImage}>
                                    <Path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                </Svg>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.socialBtn}
                                onPress={() => Linking.openURL('https://www.instagram.com/ernitapp__/')}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel="Visit Ernit on Instagram"
                            >
                                <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.textOnImage}>
                                    <Path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                                </Svg>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.socialBtn}
                                onPress={() => Linking.openURL('https://www.tiktok.com/@ernitapp')}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel="Visit Ernit on TikTok"
                            >
                                <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.textOnImage}>
                                    <Path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48v-7.1a8.16 8.16 0 005.58 2.2V11.3a4.85 4.85 0 01-3.58-1.58V6.69h3.58z" />
                                </Svg>
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
const createStyles = (colors: typeof Colors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.surface,
    },
    scrollContent: {
        flexGrow: 1,
        backgroundColor: colors.white,
    },
    hero: {
        paddingTop: vh(Platform.OS === 'ios' ? 60 : 44),
        paddingHorizontal: Spacing.xxl,
        backgroundColor: colors.white,
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
        backgroundColor: colors.backgroundLight,
        borderWidth: 1,
        borderColor: colors.border,
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
        marginBottom: vh(16),
    },
    brandTitle: {
        fontSize: vh(44),
        fontWeight: '900',
        fontStyle: 'italic',
        color: colors.textPrimary,
        letterSpacing: -1.5,
    },

    // ── Toggle Bar ──────────────────────────────────
    toggleWrap: {
        alignItems: 'center',
        marginBottom: vh(22),
        paddingHorizontal: Spacing.lg,
    },
    toggleBar: {
        flexDirection: 'row',
        backgroundColor: colors.backgroundLight,
        borderRadius: BorderRadius.pill,
        padding: vh(4),
        position: 'relative',
        width: '100%',
        maxWidth: vh(320),
        ...Shadows.sm,
    },
    toggleSlider: {
        position: 'absolute',
        top: vh(4),
        left: vh(4),
        bottom: vh(4),
        borderRadius: BorderRadius.pill,
        zIndex: 1,
        ...Shadows.md,
    },
    toggleBtn: {
        flex: 1,
        paddingVertical: vh(11),
        alignItems: 'center',
        zIndex: 2,
    },
    toggleBtnText: {
        ...Typography.small,
        fontWeight: '700',
        color: colors.textMuted,
    },
    toggleBtnTextActive: {
        color: colors.white,
    },

    // ── Dial-style rotating word ──────────────────
    heroTitleContainer: {
        alignItems: 'center',
        marginBottom: vh(10),
    },
    heroTitle: {
        ...Typography.display,
        fontWeight: '800',
        color: colors.gray800,
        lineHeight: vh(46),
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
        paddingHorizontal: 6, // extra space for italic slant
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
        color: colors.textSecondary,
        lineHeight: vh(30),
        marginBottom: vh(14),
        textAlign: 'center',
        fontSize: vh(17),
    },

    // ── Dual image carousels ──────────────────────
    cardsRowOuter: {
        width: SCREEN_W,
        alignSelf: 'center',
        marginHorizontal: -24,
        overflow: 'hidden',
        marginTop: vh(18),
        marginBottom: vh(18),
        paddingVertical: Spacing.xs,
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
        backgroundColor: colors.gray300,
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
        color: colors.textOnImage,
        backgroundColor: colors.overlayOnImage,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xxs,
        borderRadius: BorderRadius.sm,
        overflow: 'hidden',
    },

    statContainer: {
        alignItems: 'center',
        paddingHorizontal: Spacing.xxxl,
        marginBottom: vh(18),
        minHeight: 66,
    },
    statText: {
        ...Typography.subheading,
        color: colors.textSecondary,
        textAlign: 'center',
    },

    badgeWrapper: {
        alignItems: 'center',
        marginTop: vh(14),
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
        marginBottom: vh(36),
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
        color: colors.white,
        ...Typography.heading3,
    },

    // ── How It Works ────────────────────────────────
    howSection: {
        paddingVertical: Spacing.sectionVertical,
        paddingHorizontal: Spacing.xxl,
        backgroundColor: colors.white,
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
        color: colors.gray800,
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
        borderColor: colors.white,
    },
    stepNumberText: {
        color: colors.white,
        ...Typography.captionBold,
        fontWeight: '800',
    },
    stepContent: {
        flex: 1,
        paddingTop: Spacing.xs,
    },
    stepTitle: {
        ...Typography.large,
        color: colors.gray800,
        marginBottom: Spacing.sm,
    },
    stepDesc: {
        ...Typography.body,
        color: colors.textSecondary,
    },

    // ── Final CTA ───────────────────────────────────
    finalCtaSection: {
        paddingVertical: Spacing.sectionVertical,
        backgroundColor: colors.surface,
        width: '100%',
        maxWidth: 1200,
        alignSelf: 'center',
        paddingHorizontal: Spacing.xxl,
        alignItems: 'center',
    },
    finalCtaTitle: {
        ...Typography.display,
        fontWeight: '800',
        color: colors.gray800,
        marginBottom: Spacing.md,
        textAlign: 'center',
    },
    finalCtaSubtitle: {
        ...Typography.subheading,
        color: colors.textSecondary,
        marginBottom: Spacing.xxxl,
        textAlign: 'center',
    },

    // ── Co-Founders Section ───────────────────────
    foundersSection: {
        paddingVertical: Spacing.sectionVertical,
        paddingHorizontal: Spacing.xxl,
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
        borderColor: colors.white,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        shadowOpacity: 0.1,
    },
    founderName: {
        ...Typography.heading3,
        fontWeight: '800',
        color: colors.gray800,
        marginBottom: Spacing.xs,
        textAlign: 'center',
    },
    founderRole: {
        ...Typography.small,
        fontWeight: '600',
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    incubatorBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        backgroundColor: colors.gray300,
        borderRadius: BorderRadius.xxl,
        borderWidth: 1,
        ...Shadows.sm,
        shadowOpacity: 0.04,
    },
    incubatorText: {
        ...Typography.small,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    incubatorLogo: {
        width: 120,
        height: 28,
    },

    // ── Footer (always dark, theme-invariant) ────
    footer: {
        alignItems: 'center',
        paddingVertical: Spacing.huge,
        paddingHorizontal: Spacing.xxl,
        backgroundColor: colors.landingSectionBg,
    },
    footerBrand: {
        ...Typography.display,
        fontWeight: '900',
        fontStyle: 'italic',
        color: colors.textOnImage,
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
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    socialIcon: {
        ...Typography.bodyBold,
        fontWeight: '800',
        color: colors.textOnImage,
    },
    footerCopy: {
        ...Typography.caption,
        color: 'rgba(255, 255, 255, 0.4)',
    },
});
