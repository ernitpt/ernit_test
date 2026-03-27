import React, { useEffect, useState, useCallback, useRef, ReactNode, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Platform,
    Linking,
    Animated as RNAnimated,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Animated2, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
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
import { experienceService } from '../services/ExperienceService';

// ─── Constants ────────────────────────────────────────────────────
const WORD_SLOT_HEIGHT = vh(58);
const CONTENT_FADE_MS = 250;
const CARDS_PADDING = 16;

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
    statSource?: string;
    ctaText: string;
    ctaGradient: readonly [string, string];
    ctaShadowColor: string;
    badgeText: string;
    badgeBg: string;
    badgeBorder: string;
    badgeTextColor: string;
    navigateTo: 'ChallengeSetup' | 'GiftFlow';
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
        { word: 'do yoga', color: colors.categoryAmber },
        { word: 'dance', color: colors.error },
        { word: 'run', color: colors.cyan },
    ],
    titlePrefix: 'I want to',
    titleSuffix: '',
    subtitle: 'Set your goal. Commit to a reward.\nGo earn it.',
    stat: 'People with a reward on the line are\n',
    statHighlight: '2x more likely',
    statSuffix: ' to build the habit.',
    statColor: colors.secondary,
    statSource: '– University of California',
    ctaText: 'Start My Challenge',
    ctaGradient: [colors.primaryDark, colors.primaryDeeper] as const,
    ctaShadowColor: colors.primaryDark,
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
        { word: 'workout', color: colors.decorativeWarm },
        { word: 'do yoga', color: colors.decorativeGold },
        { word: 'dance', color: colors.decorativeRose },
        { word: 'run', color: colors.decorativeYellow },
    ],
    titlePrefix: 'Help them',
    titleSuffix: '',
    subtitle: 'Empower someone you care about.\nYou only pay when they succeed.',
    stat: 'A reward + someone backing them\nmakes them ',
    statHighlight: '2x more likely',
    statSuffix: ' to succeed.',
    statColor: colors.warning,
    statSource: '– University of Pennsylvania',
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

function wrapOffset(i: number, current: number, total: number): number {
    let diff = i - current;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;
    return diff;
}

// Card images — matched to rotating words: workout, yoga, dance, run
const GOAL_IMAGES = [
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?fit=crop&w=400&h=520&q=80', // Workout
    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?fit=crop&w=400&h=520&q=80',    // Yoga
    'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?fit=crop&w=400&h=520&q=80',  // Dance — energetic mid-movement
    'https://images.unsplash.com/photo-1486218119243-13883505764c?fit=crop&w=400&h=520&q=80',  // Run — dynamic stride action
];
// Fallback reward images if experiences haven't loaded
const FALLBACK_REWARD_IMAGES = [
    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?fit=crop&w=400&h=520&q=80',
    'https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?fit=crop&w=400&h=520&q=80',
    'https://images.unsplash.com/photo-1474540412665-1cdae210ae6b?fit=crop&w=400&h=520&q=80',
];

/** Shuffle array (Fisher-Yates) ensuring no back-to-back repeats from previous sequence */
function shuffleNoRepeat(arr: string[], lastItem?: string): string[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // If the first item matches the last item from the previous cycle, swap it
    if (lastItem && shuffled.length > 1 && shuffled[0] === lastItem) {
        const swapIdx = 1 + Math.floor(Math.random() * (shuffled.length - 1));
        [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
    }
    return shuffled;
}

const FLIP_DURATION = 800;

// ─── FlippableCard ────────────────────────────────────────────────
interface FlippableCardProps {
    images: string[];
    currentIndex: number;
    style?: any;
    glowSelfStyle?: any;
    glowGiftStyle?: any;
    glowSelfOpacity: RNAnimated.AnimatedInterpolation<number>;
    glowGiftOpacity: RNAnimated.AnimatedValue;
    label: string;
    labelOpacity: RNAnimated.Value;
    flipIndices?: number[];
    cardW: number;
    cardH: number;
}

function FlippableCard({ images, currentIndex, style, glowSelfStyle, glowGiftStyle, glowSelfOpacity, glowGiftOpacity, label, labelOpacity, flipIndices = [], cardW, cardH }: FlippableCardProps) {
    const fStyles = useMemo(() => createFlipStyles(cardW, cardH), [cardW, cardH]);
    const rotation = useSharedValue(0);
    const [frontIndex, setFrontIndex] = useState(currentIndex);
    const [backIndex, setBackIndex] = useState(currentIndex);
    const isShowingFront = useRef(true);
    const prevIndex = useRef(currentIndex);

    useEffect(() => {
        if (currentIndex === prevIndex.current) return;
        prevIndex.current = currentIndex;

        if (isShowingFront.current) {
            // Load next image on the back, then flip to show it
            setBackIndex(currentIndex);
            rotation.value = withTiming(180, {
                duration: FLIP_DURATION,
                easing: Easing.inOut(Easing.cubic),
            }, (finished) => {
                if (finished) {
                    isShowingFront.current = false;
                }
            });
        } else {
            // Load next image on the front, then flip to show it
            setFrontIndex(currentIndex);
            rotation.value = withTiming(360, {
                duration: FLIP_DURATION,
                easing: Easing.inOut(Easing.cubic),
            }, (finished) => {
                if (finished) {
                    isShowingFront.current = true;
                    rotation.value = 0;
                }
            });
        }
    }, [currentIndex, rotation]);

    const frontAnimStyle = useAnimatedStyle(() => ({
        transform: [
            { perspective: 3000 },
            { rotateY: rotation.value + 'deg' },
        ],
        opacity: Platform.OS === 'android' ? (rotation.value <= 90 || rotation.value > 270 ? 1 : 0) : 1,
    }));

    const backAnimStyle = useAnimatedStyle(() => ({
        transform: [
            { perspective: 3000 },
            { rotateY: (rotation.value - 180) + 'deg' },
        ],
        opacity: Platform.OS === 'android' ? (rotation.value > 90 && rotation.value <= 270 ? 1 : 0) : 1,
    }));

    return (
        <View style={style}>
            {/* Back face (sits behind, pre-rotated 180) */}
            <Animated2.View style={[fStyles.faceOuter, backAnimStyle]}>
                <RNAnimated.View style={[fStyles.glow, glowSelfStyle, { opacity: glowSelfOpacity }]} />
                <RNAnimated.View style={[fStyles.glow, glowGiftStyle, { opacity: glowGiftOpacity }]} />
                <View style={fStyles.face}>
                    <Image
                        source={{ uri: images[backIndex] }}
                        style={[fStyles.img, flipIndices.includes(backIndex) && { transform: [{ scaleX: -1 }] }]}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                    />
                    <View style={fStyles.labelWrap}>
                        <View style={fStyles.labelPill}>
                            <Text style={fStyles.label}>{label}</Text>
                        </View>
                    </View>
                </View>
            </Animated2.View>
            {/* Front face */}
            <Animated2.View style={[fStyles.faceOuter, frontAnimStyle]}>
                <RNAnimated.View style={[fStyles.glow, glowSelfStyle, { opacity: glowSelfOpacity }]} />
                <RNAnimated.View style={[fStyles.glow, glowGiftStyle, { opacity: glowGiftOpacity }]} />
                <View style={fStyles.face}>
                    <Image
                        source={{ uri: images[frontIndex] }}
                        style={[fStyles.img, flipIndices.includes(frontIndex) && { transform: [{ scaleX: -1 }] }]}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                    />
                    <View style={fStyles.labelWrap}>
                        <View style={fStyles.labelPill}>
                            <Text style={fStyles.label}>{label}</Text>
                        </View>
                    </View>
                </View>
            </Animated2.View>
        </View>
    );
}

const createFlipStyles = (cardW: number, cardH: number) => StyleSheet.create({
    faceOuter: {
        position: 'absolute',
        width: cardW,
        height: cardH,
        backfaceVisibility: 'hidden',
    } as any,
    face: {
        width: cardW,
        height: cardH,
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        backgroundColor: Colors.cardDarkBg,
    },
    glow: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: BorderRadius.xl,
        ...Platform.select({
            web: {
                outlineWidth: 1.5,
                outlineStyle: 'solid' as any,
                outlineColor: 'transparent',
            },
            default: {
                borderWidth: 1.5,
                borderColor: 'transparent',
            },
        }),
    } as any,
    img: {
        width: '100%',
        height: '100%',
    },
    labelWrap: {
        position: 'absolute',
        bottom: Spacing.sm,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 5,
    },
    labelPill: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xxs,
    },
    label: {
        ...Typography.captionBold,
        color: Colors.textOnImage,
    },
});

// ─── Component ────────────────────────────────────────────────────
type LandingNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ChallengeLanding'>;

export default function ChallengeLandingScreen() {
    const colors = useColors();
    const { width: screenW } = useWindowDimensions();
    const cardW = Math.min((screenW - CARDS_PADDING * 2) / 2, 260);
    const cardH = cardW * (0.9 + 0.75 * VH);
    const styles = useMemo(() => createStyles(colors, screenW, cardW, cardH), [colors, screenW, cardW, cardH]);
    const SELF_CONFIG = useMemo(() => getSelfConfig(colors), [colors]);
    const GIFT_CONFIG = useMemo(() => getGiftConfig(colors), [colors]);
    const navigation = useNavigation<LandingNavigationProp>();
    const route = useRoute<RouteProp<RootStackParamList, 'ChallengeLanding'>>();
    const { state } = useApp();
    const insets = useSafeAreaInsets();
    const isLoggedIn = !!state.user?.id;

    // Mode from route param (GiftLanding passes mode='gift')
    const initialMode: LandingMode = route.params?.mode === 'gift' ? 'gift' : 'self';
    const [mode, setMode] = useState<LandingMode>(initialMode);
    const [wordIndex, setWordIndex] = useState(0);
    const [toggleBarWidth, setToggleBarWidth] = useState(0);
    const [rewardImages, setRewardImages] = useState<string[]>(FALLBACK_REWARD_IMAGES);
    const lastRewardRef = useRef<string | undefined>(undefined);

    // Fetch experience cover images for reward card
    useEffect(() => {
        experienceService.getAllExperiences().then((experiences) => {
            const covers = experiences
                .map(e => e.coverImageUrl)
                .filter((url): url is string => !!url);
            if (covers.length >= 2) {
                setRewardImages(shuffleNoRepeat(covers));
            }
        });
    }, []);

    // Animation values
    const sliderAnim = useRef(new RNAnimated.Value(initialMode === 'gift' ? 1 : 0)).current;
    const contentOpacity = useRef(new RNAnimated.Value(1)).current;

    const config = mode === 'self' ? SELF_CONFIG : GIFT_CONFIG;

    // Load Google Font for hero title (web only)
    useEffect(() => {
        if (Platform.OS === 'web') {
            const link = document.createElement('link');
            link.href = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Plus+Jakarta+Sans:wght@400;700;800&display=swap';
            link.rel = 'stylesheet';
            document.head.appendChild(link);
            return () => { document.head.removeChild(link); };
        }
    }, []);

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

    // Reshuffle reward images when we've cycled through all of them
    useEffect(() => {
        const rewardIdx = wordIndex % rewardImages.length;
        if (rewardIdx === 0 && wordIndex > 0) {
            lastRewardRef.current = rewardImages[rewardImages.length - 1];
            setRewardImages(prev => shuffleNoRepeat(prev, lastRewardRef.current));
        }
    }, [wordIndex, rewardImages.length]);

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
        navigation.navigate(config.navigateTo);
        setTimeout(() => { ctaNavigatingRef.current = false; }, 1000);
    }, [navigation, config.navigateTo, mode]);

    const currentWord = config.rotatingWords[wordIndex % config.rotatingWords.length];

    // ─── Animated color interpolations (smooth transitions) ───
    const TOGGLE_PAD = 3;
    const SLIDER_FALLBACK_WIDTH = 150;
    const sliderWidth = toggleBarWidth > 0 ? (toggleBarWidth - TOGGLE_PAD * 2) / 2 : SLIDER_FALLBACK_WIDTH;

    const sliderBgColor = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.primaryDark, colors.warning],
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
        outputRange: ['rgba(16, 185, 129, 0.1)', 'rgba(245, 158, 11, 0.1)'],
    });
    const animBadgeBorder = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(16, 185, 129, 0.3)', 'rgba(245, 158, 11, 0.3)'],
    });
    const animBadgeText = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.gray800, colors.gray800],
    });
    // Founders section colors
    const animFoundersBg = sliderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.white, colors.white],
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
                <StatusBar style="light" />
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
                            <Text style={styles.loginButtonText}>
                                {isLoggedIn ? 'Go to App' : 'Log In'}
                            </Text>
                            <Text style={[styles.loginButtonText, { lineHeight: 18 }]}>{'\u203A'}</Text>
                        </TouchableOpacity>

                        {/* Brand — centered, aligned with login button */}
                        <View style={styles.brandSection}>
                            <Text style={styles.brandTitle}>
                                ernit<RNAnimated.Text style={{ color: animBrandDot }}>.</RNAnimated.Text>
                            </Text>
                        </View>

                        <View style={styles.heroWrapper}>
                            <MotiView
                                from={{ opacity: 0, translateY: 30 }}
                                animate={{ opacity: 1, translateY: 0 }}
                                transition={{ type: 'timing', duration: 700 }}
                                style={styles.heroContent}
                            >
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
                                        {/* Ambient glow behind title */}
                                        <RNAnimated.View style={[styles.titleGlow, {
                                            backgroundColor: sliderBgColor,
                                        }]} />
                                        <Text style={styles.heroTitle}>{config.titlePrefix}</Text>
                                        <View style={styles.dialRow}>
                                            <View style={styles.dialSlot}>
                                                <Text style={[styles.dialWord, { opacity: 0, color: 'transparent', textShadow: 'none' } as any]}>
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

                            {/* ─── Tilted card stack ─── */}
                            <MotiView
                                from={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ type: 'spring', damping: 20, stiffness: 90, delay: 300 }}
                            >
                                <View style={styles.cardsRowOuter}>
                                    <View style={styles.cardsRow}>
                                        {/* Goal card — tilted left, flippable */}
                                        <View style={[styles.cardPosition, styles.cardGoalPos]}>
                                            <FlippableCard
                                                images={GOAL_IMAGES}
                                                currentIndex={wordIndex % GOAL_IMAGES.length}
                                                style={styles.cardImageCard}
                                                glowSelfStyle={styles.cardGlowSelf}
                                                glowGiftStyle={styles.cardGlowGift}
                                                glowSelfOpacity={sliderAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })}
                                                glowGiftOpacity={sliderAnim}
                                                label={mode === 'self' ? 'Your goal' : 'The goal'}
                                                labelOpacity={contentOpacity}
                                                flipIndices={[3]}
                                                cardW={cardW}
                                                cardH={cardH}
                                            />
                                        </View>

                                        {/* Reward card — tilted right, flippable */}
                                        <View style={[styles.cardPosition, styles.cardRewardPos]}>
                                            <FlippableCard
                                                images={rewardImages}
                                                currentIndex={wordIndex % rewardImages.length}
                                                style={styles.cardImageCard}
                                                glowSelfStyle={styles.cardGlowSelf}
                                                glowGiftStyle={styles.cardGlowGift}
                                                glowSelfOpacity={sliderAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })}
                                                glowGiftOpacity={sliderAnim}
                                                label={mode === 'self' ? 'Your reward' : 'The reward'}
                                                labelOpacity={contentOpacity}
                                                cardW={cardW}
                                                cardH={cardH}
                                            />
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
                                            <RNAnimated.Text style={{ color: animStatColor, ...Typography.subheading }}>
                                                {config.statHighlight}
                                            </RNAnimated.Text>
                                            {config.statSuffix}
                                        </Text>
                                        {config.statSource && (
                                            <Text style={styles.statSource}>{config.statSource}</Text>
                                        )}
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
                                            <ChevronRight color={colors.gray800} size={20} strokeWidth={3} />
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
                                            contentFit="cover"
                                            cachePolicy="memory-disk"
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
                                            contentFit="contain"
                                            cachePolicy="memory-disk"
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
                                    <ChevronRight color={colors.gray800} size={20} strokeWidth={3} />
                                </RNAnimated.View>
                            </View>
                        </TouchableOpacity>
                        <Text style={styles.footerBrand}>
                            ernit<RNAnimated.Text style={{ color: animBrandDot }}>.</RNAnimated.Text>
                        </Text>
                        <View style={styles.finalFooterSocials}>
                            <TouchableOpacity
                                style={styles.socialBtn}
                                onPress={() => Linking.openURL('https://www.linkedin.com/company/ernit-app/')}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel="Visit Ernit on LinkedIn"
                            >
                                <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.gray800}>
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
                                <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.gray800}>
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
                                <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.gray800}>
                                    <Path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48v-7.1a8.16 8.16 0 005.58 2.2V11.3a4.85 4.85 0 01-3.58-1.58V6.69h3.58z" />
                                </Svg>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.footerCopy}>
                            {new Date().getFullYear()} Ernit. All rights reserved.
                        </Text>
                    </MotiView>
                </ScrollView>
            </View>
        </ErrorBoundary>
    );
}

// ─── Styles ───────────────────────────────────────────────────────
const createStyles = (colors: typeof Colors, screenW: number, cardW: number, cardH: number) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.surface,
    },
    scrollContent: {
        flexGrow: 1,
        backgroundColor: colors.white,
    },
    hero: {
        paddingTop: vh(Platform.OS === 'ios' ? 100 : 80),
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
        color: colors.gray800,
    },
    brandSection: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 36 : 16,
        left: 24,
        zIndex: 10,
    },
    brandTitle: {
        ...Typography.displayLarge,
        fontWeight: '900',
        fontStyle: 'italic',
        color: colors.gray800,
        letterSpacing: -1.5,
    },

    // ── Toggle Bar ──────────────────────────────────
    toggleWrap: {
        alignItems: 'center',
        marginBottom: vh(18),
        paddingHorizontal: Spacing.lg,
    },
    toggleBar: {
        flexDirection: 'row',
        backgroundColor: colors.backgroundLight,
        borderRadius: BorderRadius.pill,
        padding: vh(4),
        position: 'relative',
        width: '100%',
        maxWidth: 320,
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
        paddingVertical: vh(10),
        alignItems: 'center',
        zIndex: 2,
    },
    toggleBtnText: {
        ...Typography.small,
        fontWeight: '700',
        color: colors.gray800,
        opacity: 0.5,
    },
    toggleBtnTextActive: {
        color: colors.gray800,
        opacity: 1,
    },

    // ── Dial-style rotating word ──────────────────
    heroTitleContainer: {
        alignItems: 'center',
        marginBottom: vh(6),
        position: 'relative',
    },
    titleGlow: {
        position: 'absolute',
        top: '20%',
        left: '10%',
        right: '10%',
        bottom: '10%',
        borderRadius: 999,
        opacity: 0.15,
        ...Platform.select({
            web: { filter: 'blur(40px)' },
            default: {},
        }),
    } as any,
    heroTitle: {
        ...Typography.heading1,
        fontFamily: Platform.select({ web: '"DM Serif Display", Georgia, serif', default: 'Outfit_700Bold' }),
        fontWeight: '400',
        color: colors.gray800,
        lineHeight: vh(42),
        letterSpacing: 0.5,
        textAlign: 'center',
        marginBottom: -vh(4),
    } as any,
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
        paddingHorizontal: 16,
    },
    dialWordContainer: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        height: WORD_SLOT_HEIGHT,
    },
    dialWord: {
        ...Typography.display,
        fontFamily: Platform.select({ web: '"Plus Jakarta Sans", system-ui, sans-serif', default: 'Outfit_800ExtraBold' }),
        fontWeight: '800',
        textTransform: 'uppercase',
        lineHeight: WORD_SLOT_HEIGHT,
        letterSpacing: 2,
        textAlign: 'center',
        ...Platform.select({
            default: {
                textShadowColor: 'rgba(16, 185, 129, 0.4)',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 8,
            },
        }),
    } as any,

    heroSubtitle: {
        ...Typography.subheading,
        color: colors.gray800,
        lineHeight: vh(30),
        marginBottom: vh(2),
        textAlign: 'center',
    },

    // ── Dual image carousels ──────────────────────
    cardsRowOuter: {
        width: screenW,
        alignSelf: 'center',
        marginHorizontal: -24,
        marginTop: vh(-3),
        marginBottom: vh(0),
        paddingVertical: Spacing.md,
    },
    cardsRow: {
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        height: cardH + 40,
    },
    cardImageCard: {
        width: cardW,
        height: cardH,
    },
    cardPosition: {
        position: 'absolute',
    },
    cardGoalPos: {
        left: screenW / 2 - cardW + 5 + vh(5),
        transform: [{ rotate: '-6deg' }],
        zIndex: 1,
    },
    cardRewardPos: {
        left: screenW / 2 - 15 + vh(0),
        transform: [{ rotate: '6deg' }],
        zIndex: 2,
    },
    cardGlowSelf: {
        ...Platform.select({
            web: {
                outlineColor: colors.primary,
                boxShadow: `0 0 8px ${colors.primary}80, 0 0 20px ${colors.primary}40, 0 0 40px ${colors.primary}20`,
            },
            default: {
                borderColor: colors.primary,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 12,
                shadowOpacity: 0.6,
                elevation: 8,
            },
        }),
    } as any,
    cardGlowGift: {
        ...Platform.select({
            web: {
                outlineColor: colors.warning,
                boxShadow: `0 0 8px ${colors.warning}80, 0 0 20px ${colors.warning}40, 0 0 40px ${colors.warning}20`,
            },
            default: {
                borderColor: colors.warning,
                shadowColor: colors.warning,
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 12,
                shadowOpacity: 0.6,
                elevation: 8,
            },
        }),
    } as any,
    // cardImg, cardLabelWrap, cardLabel moved to flipStyles

    statContainer: {
        alignItems: 'center',
        paddingHorizontal: Spacing.xxxl,
        marginBottom: Spacing.xxs,
        minHeight: 86,
    },
    statText: {
        ...Typography.subheading,
        color: colors.gray800,
        textAlign: 'center',
    },
    statSource: {
        ...Typography.caption,
        color: colors.textMuted,
        textAlign: 'center' as const,
        marginTop: Spacing.xs,
        fontStyle: 'italic' as const,
    },

    badgeWrapper: {
        alignItems: 'center',
        marginTop: vh(10),
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
        color: colors.gray800,
        ...Typography.heading3,
    },

    // ── How It Works ────────────────────────────────
    howSection: {
        paddingVertical: Spacing.sectionVertical,
        paddingHorizontal: Spacing.xxl,
        backgroundColor: colors.surface,
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
        ...Typography.displayBold,
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
        borderColor: colors.cardDarkBorder,
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
        color: colors.gray800,
        opacity: 0.7,
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
        ...Typography.displayBold,
        color: colors.gray800,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    finalCtaSubtitle: {
        ...Typography.subheading,
        color: colors.gray800,
        marginBottom: Spacing.xxxl,
        textAlign: 'center',
    },
    finalFooterSocials: {
        flexDirection: 'row',
        gap: Spacing.lg,
        marginTop: Spacing.xxxl,
        marginBottom: Spacing.lg,
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
        borderColor: 'rgba(255,255,255,0.15)',
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
        ...Typography.smallBold,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    incubatorBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: BorderRadius.xxl,
        borderWidth: 1,
        ...Shadows.sm,
        shadowOpacity: 0.04,
    },
    incubatorText: {
        ...Typography.smallMedium,
        color: colors.gray800,
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
        color: colors.gray800,
        letterSpacing: -1,
        marginTop: Spacing.sectionVertical,
        marginBottom: Spacing.xs,
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
        backgroundColor: colors.backgroundLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    socialIcon: {
        ...Typography.bodyBold,
        fontWeight: '800',
        color: colors.gray800,
    },
    footerCopy: {
        ...Typography.caption,
        color: colors.gray800,
        opacity: 0.5,
    },
});
