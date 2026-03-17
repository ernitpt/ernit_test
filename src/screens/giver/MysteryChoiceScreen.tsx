import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    ScrollView,
    Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, ChevronRight, Eye, Sparkles, MessageSquare, Lock, Unlock } from 'lucide-react-native';
import { MotiView, AnimatePresence } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList, Experience } from '../../types';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { analyticsService } from '../../services/AnalyticsService';
import Colors from '../../config/colors';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';

type MysteryChoiceNav = NativeStackNavigationProp<RootStackParamList, 'MysteryChoice'>;

// ─── Hint Demo Data ──────────────────────────────────────────────────
// Faithful to how AI hints actually work: 4 difficulty bands
const HINT_BANDS = [
    {
        band: 'Vague',
        progress: '0–20%',
        session: 'Session 2',
        hint: '"Get ready to feel like a kid again — this one\'s going to be a thrill."',
        revealLevel: 0.08,
        color: Colors.categoryIndigo,
        bgColor: Colors.infoLight,
    },
    {
        band: 'Thematic',
        progress: '21–60%',
        session: 'Session 5',
        hint: '"You might want to bring comfortable shoes — and work on that grip strength."',
        revealLevel: 0.25,
        color: Colors.categoryAmber,
        bgColor: Colors.warningLighter,
    },
    {
        band: 'Strong',
        progress: '61–90%',
        session: 'Session 8',
        hint: '"Ever wondered what it feels like to scale new heights? You\'re about to find out."',
        revealLevel: 0.55,
        color: Colors.secondary,
        bgColor: Colors.successLighter,
    },
    {
        band: 'Finale',
        progress: '91–100%',
        session: 'Session 10',
        hint: '"Get your climbing shoes ready — you\'re heading to the wall!"',
        revealLevel: 0.85,
        color: Colors.primary,
        bgColor: Colors.primarySurface,
    },
];

// ─── Main Component ──────────────────────────────────────────────────
const MysteryChoiceScreen = () => {
    const navigation = useNavigation<MysteryChoiceNav>();
    const route = useRoute();
    const routeParams = route.params as { experience?: Experience } | undefined;
    const experience = routeParams?.experience;
    const { state, dispatch } = useApp();
    const empowerContext = state.empowerContext;
    const userName = empowerContext?.userName || 'your friend';

    const [selected, setSelected] = useState<'open' | 'mystery' | null>(null);
    const [activeHintStep, setActiveHintStep] = useState(0);

    // Auto-cycle through hint steps when mystery is selected
    useEffect(() => {
        if (selected !== 'mystery') {
            setActiveHintStep(0);
            return;
        }
        const interval = setInterval(() => {
            setActiveHintStep(prev => (prev + 1) % HINT_BANDS.length);
        }, 3000);
        return () => clearInterval(interval);
    }, [selected]);

    // Redirect if experience is missing
    useEffect(() => {
        if (!experience) {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('CategorySelection');
        }
    }, [experience, navigation]);

    const handleContinue = useCallback(() => {
        if (!selected || !experience) return;

        const isMystery = selected === 'mystery';
        analyticsService.trackEvent('mystery_choice_selected', 'social', {
            choice: selected,
            experienceId: experience.id,
        }, 'MysteryChoiceScreen');

        if (empowerContext) {
            dispatch({
                type: 'SET_EMPOWER_CONTEXT',
                payload: { ...empowerContext, isMystery },
            });
        }

        navigation.navigate('ExperienceCheckout', {
            cartItems: [{ experienceId: experience.id, quantity: 1 }],
        });
    }, [selected, experience, empowerContext, dispatch, navigation]);

    if (!experience) {
        return (
            <ErrorBoundary screenName="MysteryChoiceScreen" userId={state.user?.id}>
                <MainScreen activeRoute="Home">
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ color: Colors.textSecondary, ...Typography.subheading }}>Redirecting...</Text>
                    </View>
                </MainScreen>
            </ErrorBoundary>
        );
    }

    return (
        <ErrorBoundary screenName="MysteryChoiceScreen" userId={state.user?.id}>
            <MainScreen activeRoute="Home">
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => {
                                if (navigation.canGoBack()) navigation.goBack();
                                else navigation.navigate('CategorySelection');
                            }}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel="Go back"
                        >
                            <ChevronLeft color={Colors.textPrimary} size={24} strokeWidth={2.5} />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Gift Style</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <ScrollView
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Title */}
                        <MotiView
                            from={{ opacity: 0, translateY: 10 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 300 }}
                        >
                            <Text style={styles.stepTitle} accessibilityRole="header">
                                How should {userName} receive this?
                            </Text>
                            <Text style={styles.stepSubtitle}>
                                Choose how the experience gift is revealed
                            </Text>
                        </MotiView>

                        {/* Experience Preview */}
                        <View style={styles.experienceCard}>
                            <Image
                                source={{ uri: experience.coverImageUrl }}
                                style={styles.experienceImage}
                                accessibilityLabel={`${experience.title} preview`}
                            />
                            <View style={styles.experienceInfo}>
                                <Text style={styles.experienceTitle} numberOfLines={2}>
                                    {experience.title}
                                </Text>
                                <Text style={styles.experiencePrice}>
                                    {'\u20AC'}{experience.price}
                                </Text>
                            </View>
                        </View>

                        {/* Option Cards */}
                        <View style={styles.optionsContainer}>
                            {/* Gift Openly */}
                            <TouchableOpacity
                                style={[
                                    styles.optionCard,
                                    selected === 'open' && styles.optionCardSelected,
                                ]}
                                onPress={() => setSelected('open')}
                                activeOpacity={0.85}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: selected === 'open' }}
                                accessibilityLabel="Gift openly"
                            >
                                <View style={styles.optionRow}>
                                    <View style={[
                                        styles.optionIcon,
                                        selected === 'open' && styles.optionIconSelected,
                                    ]}>
                                        <Eye
                                            color={selected === 'open' ? Colors.white : Colors.secondary}
                                            size={22}
                                        />
                                    </View>
                                    <View style={styles.optionTextBlock}>
                                        <Text style={[
                                            styles.optionTitle,
                                            selected === 'open' && styles.optionTitleSelected,
                                        ]}>Gift Openly</Text>
                                        <Text style={styles.optionDesc}>
                                            {userName} will see the experience right away
                                        </Text>
                                    </View>
                                    <View style={[
                                        styles.radio,
                                        selected === 'open' && styles.radioSelected,
                                    ]}>
                                        {selected === 'open' && <View style={styles.radioInner} />}
                                    </View>
                                </View>
                            </TouchableOpacity>

                            {/* Mystery */}
                            <TouchableOpacity
                                style={[
                                    styles.optionCard,
                                    selected === 'mystery' && styles.optionCardMystery,
                                ]}
                                onPress={() => setSelected('mystery')}
                                activeOpacity={0.85}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: selected === 'mystery' }}
                                accessibilityLabel="Make it a mystery"
                            >
                                <View style={styles.optionRow}>
                                    <View style={[
                                        styles.optionIcon,
                                        { backgroundColor: Colors.warningLight },
                                        selected === 'mystery' && styles.optionIconMystery,
                                    ]}>
                                        <Sparkles
                                            color={selected === 'mystery' ? Colors.white : Colors.warning}
                                            size={22}
                                        />
                                    </View>
                                    <View style={styles.optionTextBlock}>
                                        <Text style={[
                                            styles.optionTitle,
                                            selected === 'mystery' && styles.optionTitleMystery,
                                        ]}>Make it a Mystery</Text>
                                        <Text style={styles.optionDesc}>
                                            AI hints reveal the gift gradually each session
                                        </Text>
                                    </View>
                                    <View style={[
                                        styles.radio,
                                        selected === 'mystery' && styles.radioMystery,
                                    ]}>
                                        {selected === 'mystery' && <View style={styles.radioInnerMystery} />}
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </View>

                        {/* Mystery Explanation — animated panel */}
                        <AnimatePresence>
                            {selected === 'mystery' && (
                                <MotiView
                                    key="mystery-explainer"
                                    from={{ opacity: 0, translateY: -20, scale: 0.95 }}
                                    animate={{ opacity: 1, translateY: 0, scale: 1 }}
                                    exit={{ opacity: 0, translateY: -20, scale: 0.95 }}
                                    transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                                    style={styles.explainerContainer}
                                >
                                    {/* Section title */}
                                    <View style={styles.explainerHeader}>
                                        <Sparkles color={Colors.warning} size={16} />
                                        <Text style={styles.explainerTitle}>How Mystery Hints Work</Text>
                                    </View>

                                    <Text style={styles.explainerIntro}>
                                        Before each session, {userName} receives an AI-generated hint
                                        that gets progressively more revealing as they get closer to finishing.
                                    </Text>

                                    {/* Animated experience reveal */}
                                    <View style={styles.revealDemo}>
                                        <View style={styles.revealImageContainer}>
                                            <Image
                                                source={{ uri: experience.coverImageUrl }}
                                                style={[
                                                    styles.revealImage,
                                                    { opacity: HINT_BANDS[activeHintStep].revealLevel },
                                                ]}
                                            />
                                            <View style={[
                                                styles.revealOverlay,
                                                { opacity: 1 - HINT_BANDS[activeHintStep].revealLevel },
                                            ]}>
                                                <Text style={styles.revealQuestionMark}>?</Text>
                                            </View>

                                            {/* Reveal progress indicator */}
                                            <View style={styles.revealProgressBar}>
                                                <MotiView
                                                    animate={{
                                                        width: `${(activeHintStep + 1) * 25}%` as any,
                                                    }}
                                                    transition={{ type: 'spring', damping: 15, stiffness: 120 }}
                                                    style={[
                                                        styles.revealProgressFill,
                                                        { backgroundColor: HINT_BANDS[activeHintStep].color },
                                                    ]}
                                                />
                                            </View>
                                        </View>

                                        <View style={styles.revealLabelRow}>
                                            <Lock color={Colors.textMuted} size={12} />
                                            <Text style={styles.revealLabel}>Hidden</Text>
                                            <View style={{ flex: 1 }} />
                                            <Text style={styles.revealLabel}>Revealed</Text>
                                            <Unlock color={Colors.primary} size={12} />
                                        </View>
                                    </View>

                                    {/* Example tag */}
                                    <View style={styles.exampleTag}>
                                        <Text style={styles.exampleTagText}>
                                            Example: Gifting "Rock Climbing Adventure"
                                        </Text>
                                    </View>

                                    {/* Timeline of hint stages */}
                                    <View style={styles.timeline}>
                                        {HINT_BANDS.map((band, i) => (
                                            <MotiView
                                                key={band.band}
                                                from={{ opacity: 0, translateX: 20 }}
                                                animate={{
                                                    opacity: 1,
                                                    translateX: 0,
                                                    scale: activeHintStep === i ? 1.02 : 1,
                                                }}
                                                transition={{
                                                    type: 'spring',
                                                    damping: 18,
                                                    stiffness: 180,
                                                    delay: i * 100,
                                                }}
                                            >
                                                <View style={[
                                                    styles.timelineItem,
                                                    activeHintStep === i && {
                                                        backgroundColor: band.bgColor,
                                                        borderColor: band.color,
                                                        borderWidth: 1.5,
                                                    },
                                                ]}>
                                                    {/* Timeline connector */}
                                                    {i < HINT_BANDS.length - 1 && (
                                                        <View style={[
                                                            styles.timelineConnector,
                                                            { backgroundColor: HINT_BANDS[i + 1].color + '30' },
                                                        ]} />
                                                    )}

                                                    {/* Band indicator */}
                                                    <View style={styles.timelineTop}>
                                                        <View style={[
                                                            styles.bandBadge,
                                                            { backgroundColor: band.color + '18' },
                                                        ]}>
                                                            <View style={[
                                                                styles.bandDot,
                                                                { backgroundColor: band.color },
                                                            ]} />
                                                            <Text style={[
                                                                styles.bandLabel,
                                                                { color: band.color },
                                                            ]}>
                                                                {band.band}
                                                            </Text>
                                                        </View>
                                                        <Text style={styles.sessionLabel}>
                                                            {band.session}
                                                        </Text>
                                                    </View>

                                                    {/* Hint bubble */}
                                                    <View style={styles.hintBubble}>
                                                        <MessageSquare
                                                            color={band.color}
                                                            size={14}
                                                            style={{ marginTop: 2 }}
                                                        />
                                                        <Text style={styles.hintText}>
                                                            {band.hint}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </MotiView>
                                        ))}
                                    </View>

                                    {/* Footer note */}
                                    <View style={styles.explainerFooter}>
                                        <Sparkles color={Colors.warning} size={14} />
                                        <Text style={styles.explainerFooterText}>
                                            The mystery is revealed when {userName} completes the goal!
                                        </Text>
                                    </View>
                                </MotiView>
                            )}
                        </AnimatePresence>

                        {/* Open gift explanation */}
                        <AnimatePresence>
                            {selected === 'open' && (
                                <MotiView
                                    key="open-explainer"
                                    from={{ opacity: 0, translateY: -20, scale: 0.95 }}
                                    animate={{ opacity: 1, translateY: 0, scale: 1 }}
                                    exit={{ opacity: 0, translateY: -20, scale: 0.95 }}
                                    transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                                    style={styles.openExplainer}
                                >
                                    <Image
                                        source={{ uri: experience.coverImageUrl }}
                                        style={styles.openPreviewImage}
                                    />
                                    <View style={styles.openPreviewInfo}>
                                        <Text style={styles.openPreviewTitle}>
                                            {userName} will see:
                                        </Text>
                                        <Text style={styles.openPreviewName} numberOfLines={2}>
                                            {experience.title}
                                        </Text>
                                        <Text style={styles.openPreviewSub}>
                                            Full details visible from the start
                                        </Text>
                                    </View>
                                </MotiView>
                            )}
                        </AnimatePresence>

                        <View style={{ height: 120 }} />
                    </ScrollView>

                    {/* Footer CTA */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.ctaButton, !selected && { opacity: 0.5 }]}
                            onPress={handleContinue}
                            activeOpacity={0.9}
                            disabled={!selected}
                            accessibilityRole="button"
                            accessibilityLabel="Continue to checkout"
                        >
                            <LinearGradient
                                colors={selected === 'mystery'
                                    ? [Colors.warning, Colors.warningMedium] as [string, string]
                                    : Colors.gradientDark
                                }
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.ctaGradient}
                            >
                                <Text style={styles.ctaText}>
                                    {selected === 'mystery' ? 'Continue with Mystery' : 'Continue'}
                                </Text>
                                <ChevronRight color={Colors.white} size={20} strokeWidth={3} />
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </MainScreen>
        </ErrorBoundary>
    );
};

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.surface,
    },

    // Header (matches GoalSettingScreen)
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: Spacing.lg,
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
        color: Colors.textPrimary,
    },

    // Scroll
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.xxl,
        paddingBottom: Spacing.xl,
    },

    // Step title (matches GoalSettingScreen)
    stepTitle: {
        ...Typography.heading1,
        fontWeight: '800',
        color: Colors.textPrimary,
        marginBottom: Spacing.sm,
    },
    stepSubtitle: {
        ...Typography.body,
        color: Colors.textSecondary,
        marginBottom: Spacing.xl,
    },

    // Experience card
    experienceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.xxl,
        borderWidth: 1,
        borderColor: Colors.backgroundLight,
    },
    experienceImage: {
        width: 56,
        height: 56,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.border,
    },
    experienceInfo: {
        flex: 1,
        marginLeft: Spacing.md,
    },
    experienceTitle: {
        ...Typography.body,
        fontWeight: '700',
        color: Colors.textPrimary,
        lineHeight: 20,
    },
    experiencePrice: {
        ...Typography.small,
        fontWeight: '800',
        color: Colors.primary,
        marginTop: 2,
    },

    // Option cards
    optionsContainer: {
        gap: Spacing.md,
        marginBottom: Spacing.xl,
    },
    optionCard: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        borderWidth: 2,
        borderColor: Colors.border,
    },
    optionCardSelected: {
        borderColor: Colors.secondary,
        backgroundColor: Colors.primarySurface,
    },
    optionCardMystery: {
        borderColor: Colors.warning,
        backgroundColor: Colors.warningLighter,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    optionIcon: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.lg,
        backgroundColor: Colors.primarySurface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    optionIconSelected: {
        backgroundColor: Colors.secondary,
    },
    optionIconMystery: {
        backgroundColor: Colors.warning,
    },
    optionTextBlock: {
        flex: 1,
    },
    optionTitle: {
        ...Typography.subheading,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    optionTitleSelected: {
        color: Colors.primaryDark,
    },
    optionTitleMystery: {
        color: Colors.warningDark,
    },
    optionDesc: {
        ...Typography.caption,
        color: Colors.textSecondary,
        lineHeight: 18,
    },

    // Radio
    radio: {
        width: 22,
        height: 22,
        borderRadius: BorderRadius.md,
        borderWidth: 2,
        borderColor: Colors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioSelected: {
        borderColor: Colors.secondary,
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: BorderRadius.xs,
        backgroundColor: Colors.secondary,
    },
    radioMystery: {
        borderColor: Colors.warning,
    },
    radioInnerMystery: {
        width: 12,
        height: 12,
        borderRadius: BorderRadius.xs,
        backgroundColor: Colors.warning,
    },

    // Mystery explainer
    explainerContainer: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.xl,
        padding: Spacing.xl,
        borderWidth: 1,
        borderColor: Colors.backgroundLight,
        marginBottom: Spacing.lg,
    },
    explainerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    explainerTitle: {
        ...Typography.subheading,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    explainerIntro: {
        ...Typography.small,
        color: Colors.textSecondary,
        lineHeight: 21,
        marginBottom: Spacing.xl,
    },

    // Reveal demo
    revealDemo: {
        marginBottom: Spacing.xl,
    },
    revealImageContainer: {
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        height: 120,
        backgroundColor: Colors.gray800,
        position: 'relative',
    },
    revealImage: {
        width: '100%',
        height: '100%',
        position: 'absolute',
    },
    revealOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: Colors.gray800,
        justifyContent: 'center',
        alignItems: 'center',
    },
    revealQuestionMark: {
        fontSize: Typography.displayLarge.fontSize,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
    },
    revealProgressBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 4,
        backgroundColor: Colors.whiteAlpha15,
    },
    revealProgressFill: {
        height: '100%',
        borderRadius: BorderRadius.xs,
    },
    revealLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        marginTop: Spacing.sm,
        paddingHorizontal: Spacing.xs,
    },
    revealLabel: {
        ...Typography.tiny,
        color: Colors.textMuted,
    },

    // Example tag
    exampleTag: {
        backgroundColor: Colors.warningLight,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        marginBottom: Spacing.lg,
        alignSelf: 'flex-start',
    },
    exampleTagText: {
        ...Typography.caption,
        fontWeight: '700',
        color: Colors.warningDark,
    },

    // Timeline
    timeline: {
        gap: Spacing.sm,
        marginBottom: Spacing.lg,
    },
    timelineItem: {
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        position: 'relative',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    timelineConnector: {
        position: 'absolute',
        bottom: -10,
        left: 24,
        width: 2,
        height: 10,
        borderRadius: BorderRadius.xs,
    },
    timelineTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.sm,
    },
    bandBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.sm,
    },
    bandDot: {
        width: 7,
        height: 7,
        borderRadius: BorderRadius.xs,
    },
    bandLabel: {
        ...Typography.caption,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    sessionLabel: {
        ...Typography.caption,
        fontWeight: '600',
        color: Colors.textMuted,
    },
    hintBubble: {
        flexDirection: 'row',
        gap: Spacing.sm,
        alignItems: 'flex-start',
    },
    hintText: {
        flex: 1,
        ...Typography.caption,
        color: Colors.textPrimary,
        lineHeight: 19,
        fontStyle: 'italic',
    },

    // Explainer footer
    explainerFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: Colors.warningLighter,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
    },
    explainerFooterText: {
        flex: 1,
        ...Typography.small,
        fontWeight: '600',
        color: Colors.warningDark,
        lineHeight: 20,
    },

    // Open gift explainer
    openExplainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primarySurface,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.primaryBorder,
        marginBottom: Spacing.lg,
        gap: Spacing.md,
    },
    openPreviewImage: {
        width: 64,
        height: 64,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.border,
    },
    openPreviewInfo: {
        flex: 1,
    },
    openPreviewTitle: {
        ...Typography.caption,
        fontWeight: '600',
        color: Colors.textSecondary,
        marginBottom: 2,
    },
    openPreviewName: {
        ...Typography.body,
        fontWeight: '700',
        color: Colors.primaryDeep,
        lineHeight: 20,
    },
    openPreviewSub: {
        ...Typography.caption,
        color: Colors.textMuted,
        marginTop: 2,
    },

    // Footer CTA (matches GoalSettingScreen)
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: Spacing.xl,
        paddingBottom: Platform.OS === 'ios' ? 34 : Spacing.xl,
        paddingTop: Spacing.lg,
        backgroundColor: Colors.white,
        borderTopWidth: 1,
        borderTopColor: Colors.backgroundLight,
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 8,
    },
    ctaButton: {
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
    },
    ctaGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.lg,
    },
    ctaText: {
        ...Typography.subheading,
        fontWeight: '700',
        color: Colors.white,
    },
});

export default MysteryChoiceScreen;
