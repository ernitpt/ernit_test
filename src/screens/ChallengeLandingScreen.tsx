import React, { useEffect, useState, useCallback, useRef, ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Platform,
    Linking,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Animated2, { useSharedValue, useAnimatedStyle, withTiming, withSpring, Easing, interpolate, interpolateColor, Extrapolation, LinearTransition } from 'react-native-reanimated';
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
import { logger } from '../utils/logger';
import ErrorRetry from '../components/ErrorRetry';

// ─── Constants ────────────────────────────────────────────────────
const WORD_SLOT_HEIGHT = Platform.OS === 'android' ? 44 : Math.max(vh(58), 44);
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

const getSelfConfig = (colors: typeof Colors, t: (key: string) => string): ModeConfig => ({
    accentColor: colors.secondary,
    gradient: [colors.primarySurface, colors.successLighter, colors.white] as const,
    rotatingWords: [
        { word: t('landing.challenge.rotatingWords.workout'), color: colors.secondary },
        { word: t('landing.challenge.rotatingWords.doYoga'), color: colors.categoryAmber },
        { word: t('landing.challenge.rotatingWords.dance'), color: colors.error },
        { word: t('landing.challenge.rotatingWords.run'), color: colors.cyan },
    ],
    titlePrefix: t('landing.challenge.self.titlePrefix'),
    titleSuffix: t('landing.challenge.self.titleSuffix'),
    subtitle: t('landing.challenge.self.subtitle'),
    stat: t('landing.challenge.self.stat'),
    statHighlight: t('landing.challenge.self.statHighlight'),
    statSuffix: t('landing.challenge.self.statSuffix'),
    statColor: colors.secondary,
    statSource: t('landing.challenge.self.statSource'),
    ctaText: t('landing.challenge.self.cta'),
    ctaGradient: [colors.primaryDark, colors.primaryDeeper] as const,
    ctaShadowColor: colors.primaryDark,
    badgeText: t('landing.challenge.self.badge'),
    badgeBg: colors.primarySurface,
    badgeBorder: colors.primaryLight,
    badgeTextColor: colors.secondary,
    navigateTo: 'ChallengeSetup',
    steps: [
        {
            icon: <Target color={colors.primary} size={24} strokeWidth={2.5} />,
            iconBg: colors.primarySurface,
            title: t('landing.challenge.self.step1Title'),
            desc: t('landing.challenge.self.step1Desc'),
        },
        {
            icon: <Calendar color={colors.accent} size={24} strokeWidth={2.5} />,
            iconBg: colors.accentDeep + '18',
            title: t('landing.challenge.self.step2Title'),
            desc: t('landing.challenge.self.step2Desc'),
        },
        {
            icon: <Users color={colors.pink} size={24} strokeWidth={2.5} />,
            iconBg: colors.pinkLight,
            title: t('landing.challenge.self.step3Title'),
            desc: t('landing.challenge.self.step3Desc'),
        },
    ],
    stepNumberBg: colors.gray800,
    stepDividerColor: colors.backgroundLight,
    sectionLabelColor: colors.primary,
    finalTitle: t('landing.challenge.self.finalTitle'),
    finalSubtitle: t('landing.challenge.self.finalSubtitle'),
    finalCtaText: t('landing.challenge.self.finalCta'),
    brandDotColor: colors.secondary,
    loginColor: colors.primary,
});

const getGiftConfig = (colors: typeof Colors, t: (key: string) => string): ModeConfig => ({
    accentColor: colors.warning,
    gradient: [colors.warningLighter, colors.white, colors.white] as const,
    rotatingWords: [
        { word: t('landing.challenge.rotatingWords.workout'), color: colors.decorativeWarm },
        { word: t('landing.challenge.rotatingWords.doYoga'), color: colors.decorativeGold },
        { word: t('landing.challenge.rotatingWords.dance'), color: colors.decorativeRose },
        { word: t('landing.challenge.rotatingWords.run'), color: colors.decorativeYellow },
    ],
    titlePrefix: t('landing.challenge.gift.titlePrefix'),
    titleSuffix: t('landing.challenge.gift.titleSuffix'),
    subtitle: t('landing.challenge.gift.subtitle'),
    stat: t('landing.challenge.gift.stat'),
    statHighlight: t('landing.challenge.gift.statHighlight'),
    statSuffix: t('landing.challenge.gift.statSuffix'),
    statColor: colors.warning,
    statSource: t('landing.challenge.gift.statSource'),
    ctaText: t('landing.challenge.gift.cta'),
    ctaGradient: [colors.warning, colors.warningMedium] as const,
    ctaShadowColor: colors.warning,
    badgeText: t('landing.challenge.gift.badge'),
    badgeBg: colors.warningLight,
    badgeBorder: colors.warningBorder,
    badgeTextColor: colors.warningDark,
    navigateTo: 'GiftFlow',
    steps: [
        {
            icon: <Sparkles color={colors.warning} size={24} strokeWidth={2.5} />,
            iconBg: colors.warningLight,
            title: t('landing.challenge.gift.step1Title'),
            desc: t('landing.challenge.gift.step1Desc'),
        },
        {
            icon: <Target color={colors.warningMedium} size={24} strokeWidth={2.5} />,
            iconBg: colors.warningLighter,
            title: t('landing.challenge.gift.step2Title'),
            desc: t('landing.challenge.gift.step2Desc'),
        },
        {
            icon: <Trophy color={colors.warningDark} size={24} strokeWidth={2.5} />,
            iconBg: colors.warningLight,
            title: t('landing.challenge.gift.step3Title'),
            desc: t('landing.challenge.gift.step3Desc'),
        },
    ],
    stepNumberBg: colors.warningMedium,
    stepDividerColor: colors.warningBorder,
    sectionLabelColor: colors.warning,
    finalTitle: t('landing.challenge.gift.finalTitle'),
    finalSubtitle: t('landing.challenge.gift.finalSubtitle'),
    finalCtaText: t('landing.challenge.gift.finalCta'),
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

const FLIP_DURATION = Platform.OS === 'android' ? 400 : 800;

// ─── FlippableCard ────────────────────────────────────────────────
interface FlippableCardProps {
    images: string[];
    currentIndex: number;
    style?: any;
    glowSelfStyle?: any;
    glowGiftStyle?: any;
    glowSelfOpacityStyle: any;
    glowGiftOpacityStyle: any;
    label: string;
    flipIndices?: number[];
    cardW: number;
    cardH: number;
}

function FlippableCard({ images, currentIndex, style, glowSelfStyle, glowGiftStyle, glowSelfOpacityStyle, glowGiftOpacityStyle, label, flipIndices = [], cardW, cardH }: FlippableCardProps) {
    const fStyles = useMemo(() => createFlipStyles(cardW, cardH), [cardW, cardH]);
    const isAndroid = Platform.OS === 'android';

    // ─── Web/iOS: 3D flip with rotation ───
    const rotation = useSharedValue(0);
    const [frontIndex, setFrontIndex] = useState(currentIndex);
    const [backIndex, setBackIndex] = useState(currentIndex);
    const isShowingFront = useRef(true);
    const prevIndex = useRef(currentIndex);

    // ─── Android: simple crossfade between two layers ───
    const crossfade = useSharedValue(0); // 0 = show A, 1 = show B
    const [imageA, setImageA] = useState(currentIndex);
    const [imageB, setImageB] = useState(currentIndex);
    const showingA = useRef(true);
    const prevAndroidIndex = useRef(currentIndex);

    useEffect(() => {
        if (isAndroid) {
            if (currentIndex === prevAndroidIndex.current) return;
            prevAndroidIndex.current = currentIndex;
            if (showingA.current) {
                // Load new image on B, crossfade to it
                setImageB(currentIndex);
                crossfade.value = withTiming(1, { duration: FLIP_DURATION, easing: Easing.inOut(Easing.cubic) });
                showingA.current = false;
            } else {
                // Load new image on A, crossfade to it
                setImageA(currentIndex);
                crossfade.value = withTiming(0, { duration: FLIP_DURATION, easing: Easing.inOut(Easing.cubic) });
                showingA.current = true;
            }
        } else {
            if (currentIndex === prevIndex.current) return;
            prevIndex.current = currentIndex;
            if (isShowingFront.current) {
                setBackIndex(currentIndex);
                rotation.value = withTiming(180, {
                    duration: FLIP_DURATION,
                    easing: Easing.inOut(Easing.cubic),
                });
                isShowingFront.current = false;
            } else {
                setFrontIndex(currentIndex);
                rotation.value = withTiming(0, {
                    duration: FLIP_DURATION,
                    easing: Easing.inOut(Easing.cubic),
                });
                isShowingFront.current = true;
            }
        }
    }, [currentIndex]);

    // ─── Android animated styles ───
    const layerAStyle = useAnimatedStyle(() => ({
        opacity: interpolate(crossfade.value, [0, 1], [1, 0]),
        transform: [{ scale: interpolate(crossfade.value, [0, 0.5, 1], [1, 1.04, 1.08], Extrapolation.CLAMP) }],
    } as any));
    const layerBStyle = useAnimatedStyle(() => ({
        opacity: crossfade.value,
        transform: [{ scale: interpolate(crossfade.value, [0, 0.5, 1], [1.08, 1.04, 1], Extrapolation.CLAMP) }],
    } as any));

    // ─── Web/iOS animated styles ───
    const frontAnimStyle = useAnimatedStyle(() => ({
        transform: [
            { perspective: 3000 },
            { rotateY: rotation.value + 'deg' },
        ],
    } as any));
    const backAnimStyle = useAnimatedStyle(() => ({
        transform: [
            { perspective: 3000 },
            { rotateY: (rotation.value - 180) + 'deg' },
        ],
    } as any));

    if (isAndroid) {
        // Android: two stacked layers with crossfade — simple, reliable, smooth
        return (
            <View style={style}>
                <Animated2.View style={[fStyles.glow, glowSelfStyle, glowSelfOpacityStyle]} pointerEvents="none" />
                <Animated2.View style={[fStyles.glow, glowGiftStyle, glowGiftOpacityStyle]} pointerEvents="none" />
                <View style={fStyles.face}>
                    <Animated2.View style={[fStyles.crossfadeLayer, layerAStyle]}>
                        <Image
                            source={{ uri: images[imageA] }}
                            style={[fStyles.img, flipIndices.includes(imageA) && { transform: [{ scaleX: -1 }] }]}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                        />
                    </Animated2.View>
                    <Animated2.View style={[fStyles.crossfadeLayer, layerBStyle]}>
                        <Image
                            source={{ uri: images[imageB] }}
                            style={[fStyles.img, flipIndices.includes(imageB) && { transform: [{ scaleX: -1 }] }]}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                        />
                    </Animated2.View>
                    <View style={fStyles.labelWrap}>
                        <View style={fStyles.labelPill}>
                            <Text style={fStyles.label}>{label}</Text>
                        </View>
                    </View>
                </View>
            </View>
        );
    }

    // Web/iOS: 3D flip
    return (
        <View style={style}>
            {/* Back face */}
            <Animated2.View style={[fStyles.faceOuter, backAnimStyle]}>
                <Animated2.View style={[fStyles.glow, glowSelfStyle, glowSelfOpacityStyle]} pointerEvents="none" />
                <Animated2.View style={[fStyles.glow, glowGiftStyle, glowGiftOpacityStyle]} pointerEvents="none" />
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
                <Animated2.View style={[fStyles.glow, glowSelfStyle, glowSelfOpacityStyle]} pointerEvents="none" />
                <Animated2.View style={[fStyles.glow, glowGiftStyle, glowGiftOpacityStyle]} pointerEvents="none" />
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
        // Web/iOS: backfaceVisibility hides the reverse side during 3D rotateY
        // Android: ignored (opacity crossfade handles it instead)
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
    crossfadeLayer: {
        ...StyleSheet.absoluteFillObject,
    },
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
        backgroundColor: Colors.overlay,
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
    const { t } = useTranslation();
    const colors = useColors();
    const { width: screenW } = useWindowDimensions();
    const cardW = Math.min((screenW - CARDS_PADDING * 2) / 2, 260);
    const cardH = Platform.OS === 'android'
        ? Math.min(cardW * 1.5, 340)
        : cardW * (0.9 + 0.75 * VH);
    const styles = useMemo(() => createStyles(colors, screenW, cardW, cardH), [colors, screenW, cardW, cardH]);
    const SELF_CONFIG = useMemo(() => getSelfConfig(colors, t), [colors, t]);
    const GIFT_CONFIG = useMemo(() => getGiftConfig(colors, t), [colors, t]);
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
    const [rewardImagesLoading, setRewardImagesLoading] = useState(true);
    const [rewardImagesLoadError, setRewardImagesLoadError] = useState(false);
    const lastRewardRef = useRef<string | undefined>(undefined);

    // Fetch experience cover images for reward card
    useEffect(() => {
        let mounted = true;
        setRewardImagesLoadError(false);
        experienceService.getAllExperiences()
            .then((experiences) => {
                if (!mounted) return;
                const covers = experiences
                    .map(e => e.coverImageUrl)
                    .filter((url): url is string => !!url);
                if (covers.length >= 2) {
                    setRewardImages(shuffleNoRepeat(covers));
                }
            })
            .catch((e) => {
                logger.error('Failed to load experiences:', e);
                if (mounted) setRewardImagesLoadError(true);
            })
            .finally(() => {
                if (mounted) setRewardImagesLoading(false);
            });
        return () => { mounted = false; };
    }, []);

    // Animation values
    const sliderAnim = useSharedValue(initialMode === 'gift' ? 1 : 0);
    const contentFade = useSharedValue(1);

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
        analyticsService.trackEvent('screen_view', 'navigation', { screen: 'ChallengeLandingScreen' }, 'ChallengeLandingScreen');
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

    // Animated style for content fade + subtle slide on toggle
    const contentFadeStyle = useAnimatedStyle(() => ({
        opacity: contentFade.value,
        transform: [
            { translateY: interpolate(contentFade.value, [0, 1], [6, 0], Extrapolation.CLAMP) },
            { scale: interpolate(contentFade.value, [0, 1], [0.98, 1], Extrapolation.CLAMP) },
        ],
    } as any));

    const switchMode = useCallback((newMode: LandingMode) => {
        if (newMode === mode) return;

        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        analyticsService.trackEvent('landing_mode_toggled', 'engagement', { mode: newMode });

        // Animate slider + color transitions (Reanimated — runs on UI thread, 60fps everywhere)
        sliderAnim.value = withSpring(newMode === 'gift' ? 1 : 0, {
            damping: 18,
            stiffness: 140,
            mass: 0.8,
        });

        // Fade out, swap content (hidden behind opacity 0), then fade in after React renders
        contentFade.value = withTiming(0, { duration: CONTENT_FADE_MS });
        setTimeout(() => {
            setMode(newMode);
            // Wait one frame for React to render new content, then fade in
            requestAnimationFrame(() => {
                contentFade.value = withTiming(1, { duration: CONTENT_FADE_MS });
            });
        }, CONTENT_FADE_MS);
    }, [mode]);

    const ctaNavigatingRef = useRef(false);
    const handleCta = useCallback(() => {
        if (ctaNavigatingRef.current) return;
        ctaNavigatingRef.current = true;
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        analyticsService.trackEvent('landing_cta_tapped', 'conversion', {
            mode,
            destination: config.navigateTo,
        });
        navigation.navigate(config.navigateTo);
        setTimeout(() => { ctaNavigatingRef.current = false; }, 1000);
    }, [navigation, config.navigateTo, mode]);

    const currentWord = config.rotatingWords[wordIndex % config.rotatingWords.length];

    // ─── Animated color interpolations (smooth transitions) ───
    const TOGGLE_PAD = 3;
    const SLIDER_FALLBACK_WIDTH = 150;
    const sliderWidth = toggleBarWidth > 0 ? (toggleBarWidth - TOGGLE_PAD * 2) / 2 : SLIDER_FALLBACK_WIDTH;

    // ─── Reanimated animated styles (UI thread — 60fps on all platforms) ───
    const sliderBgStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(sliderAnim.value, [0, 1], [colors.primaryDark, colors.warning]),
    }));
    const giftGradientStyle = useAnimatedStyle(() => ({
        opacity: sliderAnim.value,
    }));
    const toggleSliderAnimStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(sliderAnim.value, [0, 1], [colors.primaryDark, colors.warning]),
        transform: [{ translateX: interpolate(sliderAnim.value, [0, 1], [0, sliderWidth]) }],
    }));
    const brandDotStyle = useAnimatedStyle(() => ({
        color: interpolateColor(sliderAnim.value, [0, 1], [colors.secondary, colors.warning]),
    }));
    const statColorStyle = useAnimatedStyle(() => ({
        color: interpolateColor(sliderAnim.value, [0, 1], [colors.secondary, colors.warning]),
    }));
    const sectionLabelStyle = useAnimatedStyle(() => ({
        color: interpolateColor(sliderAnim.value, [0, 1], [colors.primary, colors.warning]),
    }));
    const stepNumberBgStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(sliderAnim.value, [0, 1], [colors.gray800, colors.warningMedium]),
    }));
    const stepDividerStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(sliderAnim.value, [0, 1], [colors.backgroundLight, colors.warningBorder]),
    }));
    const badgeBgStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(sliderAnim.value, [0, 1], [Colors.primaryAlpha10, Colors.warningAlpha10]),
    }));
    const badgeBorderStyle = useAnimatedStyle(() => ({
        borderColor: interpolateColor(sliderAnim.value, [0, 1], [Colors.primaryAlpha30, Colors.warningAlpha30]),
    }));
    const founderRoleStyle = useAnimatedStyle(() => ({
        color: interpolateColor(sliderAnim.value, [0, 1], [colors.primary, colors.warning]),
    }));
    const incubatorBorderStyle = useAnimatedStyle(() => ({
        borderColor: interpolateColor(sliderAnim.value, [0, 1], [colors.primaryBorder, colors.warningBorder]),
    }));
    const glowSelfOpacityStyle = useAnimatedStyle(() => ({
        opacity: interpolate(sliderAnim.value, [0, 1], [1, 0]),
    }));
    const glowGiftOpacityStyle = useAnimatedStyle(() => ({
        opacity: sliderAnim.value,
    }));

    return (
        <ErrorBoundary screenName="ChallengeLandingScreen" userId={state.user?.id}>
            <View style={styles.container}>
                <StatusBar style="light" />
                <ScrollView
                    bounces={false}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom }]}
                >
                    {/* Hero Section — stacked gradients for smooth cross-fade */}
                    <View style={[styles.hero, { paddingTop: insets.top + vh(Platform.OS === 'ios' ? 80 : 56) }]}>
                        <LinearGradient
                            colors={[...SELF_CONFIG.gradient]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <Animated2.View style={[StyleSheet.absoluteFill, giftGradientStyle]}>
                            <LinearGradient
                                colors={[...GIFT_CONFIG.gradient]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={StyleSheet.absoluteFill}
                            />
                        </Animated2.View>

                        {/* Top bar */}
                        {navigation.canGoBack() && (
                            <TouchableOpacity
                                style={[styles.backButton, { top: insets.top + 8 }]}
                                onPress={() => navigation.goBack()}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityLabel={t('landing.challenge.nav.goBackAlt')}
                            >
                                <ChevronLeft color={colors.textPrimary} size={24} strokeWidth={2.5} />
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={[styles.loginButton, { top: Math.max(insets.top, 16) + 14 }]}
                            onPress={() => isLoggedIn
                                ? navigation.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'Goals' } })
                                : navigation.navigate('Auth', { mode: 'signin' })
                            }
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={isLoggedIn ? t('landing.challenge.nav.goToAppAlt') : t('landing.challenge.nav.logInAlt')}
                        >
                            <Text style={styles.loginButtonText}>
                                {isLoggedIn ? t('landing.challenge.nav.goToApp') : t('landing.challenge.nav.logIn')}
                            </Text>
                            <Text style={[styles.loginButtonText, { lineHeight: 18 }]}>{'\u203A'}</Text>
                        </TouchableOpacity>

                        {/* Brand — centered, aligned with login button */}
                        <View style={[styles.brandSection, { top: Math.max(insets.top, 16) }]}>
                            <Text style={styles.brandTitle}>
                                ernit<Animated2.Text style={brandDotStyle}>.</Animated2.Text>
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
                                        <Animated2.View
                                            style={[
                                                styles.toggleSlider,
                                                { width: sliderWidth },
                                                toggleSliderAnimStyle,
                                            ]}
                                        />
                                        <TouchableOpacity
                                            style={styles.toggleBtn}
                                            onPress={() => switchMode('self')}
                                            activeOpacity={0.8}
                                            accessibilityRole="button"
                                            accessibilityLabel={t('landing.challenge.toggle.self')}
                                        >
                                            <Text style={[
                                                styles.toggleBtnText,
                                                mode === 'self' && styles.toggleBtnTextActive,
                                            ]}>
                                                {t('landing.challenge.toggle.self')}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.toggleBtn}
                                            onPress={() => switchMode('gift')}
                                            activeOpacity={0.8}
                                            accessibilityRole="button"
                                            accessibilityLabel={t('landing.challenge.toggle.gift')}
                                        >
                                            <Text style={[
                                                styles.toggleBtnText,
                                                mode === 'gift' && styles.toggleBtnTextActive,
                                            ]}>
                                                {t('landing.challenge.toggle.gift')}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* ─── Text content (fades on toggle) ─── */}
                                <Animated2.View style={contentFadeStyle}>
                                    <View style={styles.heroTitleContainer}>
                                        {/* Ambient glow behind title */}
                                        <Animated2.View style={[styles.titleGlow, sliderBgStyle]} />
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
                                </Animated2.View>
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
                                                glowSelfOpacityStyle={glowSelfOpacityStyle}
                                                glowGiftOpacityStyle={glowGiftOpacityStyle}
                                                label={mode === 'self' ? t('landing.challenge.cards.goalSelf') : t('landing.challenge.cards.goalGift')}
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
                                                glowSelfOpacityStyle={glowSelfOpacityStyle}
                                                glowGiftOpacityStyle={glowGiftOpacityStyle}
                                                label={mode === 'self' ? t('landing.challenge.cards.rewardSelf') : t('landing.challenge.cards.rewardGift')}
                                                cardW={cardW}
                                                cardH={cardH}
                                            />
                                        </View>
                                        {rewardImagesLoadError && !rewardImagesLoading && (
                                            <ErrorRetry
                                                onRetry={() => {
                                                    setRewardImagesLoadError(false);
                                                    setRewardImagesLoading(true);
                                                    experienceService.getAllExperiences()
                                                        .then((experiences) => {
                                                            const covers = experiences
                                                                .map(e => e.coverImageUrl)
                                                                .filter((url): url is string => !!url);
                                                            if (covers.length >= 2) setRewardImages(shuffleNoRepeat(covers));
                                                        })
                                                        .catch((e) => {
                                                            logger.error('Failed to reload experiences:', e);
                                                            setRewardImagesLoadError(true);
                                                        })
                                                        .finally(() => setRewardImagesLoading(false));
                                                }}
                                                message={t('landing.challenge.errors.couldNotLoadRewardImages')}
                                            />
                                        )}
                                    </View>
                                </View>
                            </MotiView>

                            {/* ─── Stat + CTA + Badge (text fades, colors animate) ─── */}
                            <MotiView
                                from={{ opacity: 0, translateY: 20 }}
                                animate={{ opacity: 1, translateY: 0 }}
                                transition={{ type: 'timing', duration: 500, delay: 400 }}
                            >
                                <Animated2.View style={contentFadeStyle}>
                                    <View style={styles.statContainer}>
                                        <Text style={styles.statText} numberOfLines={2}>
                                            {config.stat}
                                            <Animated2.Text style={[Typography.subheading, statColorStyle]}>
                                                {config.statHighlight}
                                            </Animated2.Text>
                                            {config.statSuffix}
                                        </Text>
                                        {config.statSource && (
                                            <Text style={styles.statSource}>{config.statSource}</Text>
                                        )}
                                    </View>
                                </Animated2.View>

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
                                        <Animated2.View style={[StyleSheet.absoluteFill, giftGradientStyle]}>
                                            <LinearGradient
                                                colors={[...GIFT_CONFIG.ctaGradient]}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={StyleSheet.absoluteFill}
                                            />
                                        </Animated2.View>
                                        <Animated2.View style={[styles.ctaInner, contentFadeStyle]} layout={LinearTransition.duration(250)}>
                                            <Text style={styles.ctaText}>{config.ctaText}</Text>
                                            <ChevronRight color={colors.gray800} size={20} strokeWidth={3} />
                                        </Animated2.View>
                                    </View>
                                </TouchableOpacity>

                                {/* Badge — animated colors */}
                                <View style={styles.badgeWrapper}>
                                    <Animated2.View style={[styles.badge, badgeBgStyle, badgeBorderStyle]} layout={LinearTransition.duration(250)}>
                                        <Animated2.View style={contentFadeStyle}>
                                            <Text style={[styles.badgeText, { color: colors.gray800 }]}>
                                                {config.badgeText}
                                            </Text>
                                        </Animated2.View>
                                    </Animated2.View>
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
                                <Animated2.Text style={[styles.sectionLabel, sectionLabelStyle]}>
                                    {t('landing.challenge.howItWorks.title')}
                                </Animated2.Text>
                                <Text style={styles.sectionTitle}>{t('landing.challenge.howItWorks.sectionTitle')}</Text>
                            </MotiView>

                            <Animated2.View style={[styles.stepsContainer, contentFadeStyle]}>
                                {config.steps.map((step, i) => (
                                    <React.Fragment key={`${mode}-step-${i}`}>
                                        {i > 0 && (
                                            <Animated2.View style={[styles.stepDivider, stepDividerStyle]} />
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
                                                    <Animated2.View style={[styles.stepNumber, stepNumberBgStyle]}>
                                                        <Text style={styles.stepNumberText}>{i + 1}</Text>
                                                    </Animated2.View>
                                                </View>
                                                <View style={styles.stepContent}>
                                                    <Text style={styles.stepTitle}>{step.title}</Text>
                                                    <Text style={styles.stepDesc}>{step.desc}</Text>
                                                </View>
                                            </View>
                                        </MotiView>
                                    </React.Fragment>
                                ))}
                            </Animated2.View>
                        </View>
                    </View>

                    {/* Co-Founders Section */}
                    <View style={[styles.foundersSection, { backgroundColor: colors.white }]}>
                        <View style={styles.foundersWrapper}>
                            <MotiView
                                from={{ opacity: 0, translateY: 20 }}
                                animate={{ opacity: 1, translateY: 0 }}
                                transition={{ type: 'timing', duration: 500 }}
                            >
                                <Animated2.Text style={[styles.sectionLabel, sectionLabelStyle, { marginBottom: Spacing.md }]}>
                                    {t('landing.challenge.team.title')}
                                </Animated2.Text>
                            </MotiView>

                            <View style={styles.foundersRow}>
                                {[
                                    {
                                        name: 'Raul Marquez',
                                        role: t('landing.challenge.team.coFounderCeo'),
                                        image: 'https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/founder%20photos%2F20260116_DBP0431.jpg?alt=media&token=c8e102c4-7068-4d45-8bcb-32f8714cc62c',
                                    },
                                    {
                                        name: 'Nuno Castilho',
                                        role: t('landing.challenge.team.coFounderCto'),
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
                                        <Animated2.Text style={[styles.founderRole, founderRoleStyle]}>{founder.role}</Animated2.Text>
                                    </MotiView>
                                ))}
                            </View>

                            <MotiView
                                from={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ type: 'spring', damping: 28, delay: 400 }}
                            >
                                <Animated2.View style={[styles.incubatorBadge, incubatorBorderStyle]}>
                                    <Text style={styles.incubatorText}>{t('landing.challenge.incubator.incubatedAt')}</Text>
                                    <TouchableOpacity
                                        onPress={() => Linking.openURL('https://unicornfactorylisboa.com')}
                                        activeOpacity={0.7}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('landing.challenge.incubator.visitWebsite')}
                                    >
                                        <Image
                                            source={{ uri: 'https://unicornfactorylisboa.com/wp-content/uploads/2021/11/Layer-1-2.png' }}
                                            style={styles.incubatorLogo}
                                            contentFit="contain"
                                            cachePolicy="memory-disk"
                                            accessibilityLabel={t('landing.challenge.incubator.logoAlt')}
                                        />
                                    </TouchableOpacity>
                                </Animated2.View>
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
                        <Animated2.View style={contentFadeStyle}>
                            <Text style={styles.finalCtaTitle}>{config.finalTitle}</Text>
                            <Text style={styles.finalCtaSubtitle}>{config.finalSubtitle}</Text>
                        </Animated2.View>

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
                                <Animated2.View style={[StyleSheet.absoluteFill, giftGradientStyle]}>
                                    <LinearGradient
                                        colors={[...GIFT_CONFIG.ctaGradient]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={StyleSheet.absoluteFill}
                                    />
                                </Animated2.View>
                                <Animated2.View style={[styles.ctaInner, contentFadeStyle]} layout={LinearTransition.duration(250)}>
                                    <Text style={styles.ctaText}>{config.finalCtaText}</Text>
                                    <ChevronRight color={colors.gray800} size={20} strokeWidth={3} />
                                </Animated2.View>
                            </View>
                        </TouchableOpacity>
                        <Text style={styles.footerBrand}>
                            ernit<Animated2.Text style={brandDotStyle}>.</Animated2.Text>
                        </Text>
                        <View style={styles.finalFooterSocials}>
                            <TouchableOpacity
                                style={styles.socialBtn}
                                onPress={() => Linking.openURL('https://www.linkedin.com/company/ernit-app/')}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel={t('landing.challenge.footer.linkedinAlt')}
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
                                accessibilityLabel={t('landing.challenge.footer.instagramAlt')}
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
                                accessibilityLabel={t('landing.challenge.footer.tiktokAlt')}
                            >
                                <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.gray800}>
                                    <Path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48v-7.1a8.16 8.16 0 005.58 2.2V11.3a4.85 4.85 0 01-3.58-1.58V6.69h3.58z" />
                                </Svg>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.footerCopy}>
                            {t('landing.challenge.footer.copyright', { year: new Date().getFullYear() })}
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
        paddingTop: Platform.OS === 'android' ? 64 : vh(Platform.OS === 'ios' ? 100 : 80),
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
        marginTop: vh(18),
        marginBottom: vh(8),
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
        borderRadius: BorderRadius.circle,
        ...Platform.select({
            web: {
                top: '20%', left: '10%', right: '10%', bottom: '10%',
                opacity: 0.12,
                filter: 'blur(40px)',
            },
            ios: {
                top: '20%', left: '10%', right: '10%', bottom: '10%',
                opacity: 0.12,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 40,
                shadowOpacity: 1,
            },
            android: {
                // No blur/shadow spread on Android — hide entirely
                opacity: 0,
            },
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
        ...Typography.brandLogo,
        fontFamily: Platform.select({ web: '"Plus Jakarta Sans", system-ui, sans-serif', default: 'Outfit_800ExtraBold' }),
        fontWeight: '800',
        textTransform: 'uppercase',
        lineHeight: WORD_SLOT_HEIGHT,
        letterSpacing: 2,
        textAlign: 'center',
        ...Platform.select({
            default: {
                textShadowColor: Colors.primaryAlpha40,
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
        left: screenW / 2 - cardW + 5,
        transform: [{ rotate: '-6deg' }],
        zIndex: 1,
    },
    cardRewardPos: {
        left: screenW / 2 - 15,
        transform: [{ rotate: '6deg' }],
        zIndex: 2,
    },
    cardGlowSelf: {
        ...Platform.select({
            web: {
                outlineColor: colors.primary,
                boxShadow: `0 0 8px ${colors.primary}80, 0 0 20px ${colors.primary}40, 0 0 40px ${colors.primary}20`,
            },
            ios: {
                borderColor: colors.primary,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 12,
                shadowOpacity: 0.6,
            },
            android: {
                borderColor: colors.primary,
                boxShadow: `0 0 12 2 ${colors.primary}99, 0 0 24 0 ${colors.primary}40`,
            },
        }),
    } as any,
    cardGlowGift: {
        ...Platform.select({
            web: {
                outlineColor: colors.warning,
                boxShadow: `0 0 8px ${colors.warning}80, 0 0 20px ${colors.warning}40, 0 0 40px ${colors.warning}20`,
            },
            ios: {
                borderColor: colors.warning,
                shadowColor: colors.warning,
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 12,
                shadowOpacity: 0.6,
            },
            android: {
                borderColor: colors.warning,
                boxShadow: `0 0 12 2 ${colors.warning}99, 0 0 24 0 ${colors.warning}40`,
            },
        }),
    } as any,
    // cardImg, cardLabelWrap, cardLabel moved to flipStyles

    statContainer: {
        alignItems: 'center',
        paddingHorizontal: Spacing.xxxl,
        marginBottom: Spacing.xxs,
        minHeight: vh(86),
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
        width: Math.min(200, (screenW - Spacing.xxxl * 3) / 2),
    },
    founderPhoto: {
        width: 96,
        height: 96,
        borderRadius: BorderRadius.pill,
        marginBottom: Spacing.lg,
        borderWidth: 3,
        borderColor: Colors.whiteAlpha15,
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
        backgroundColor: Colors.whiteAlpha06,
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
