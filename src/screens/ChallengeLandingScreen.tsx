import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Dimensions,
    Platform,
    Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Target, Calendar, Users, Sparkles, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { MotiView, AnimatePresence } from 'moti';
import { RootStackParamList } from '../types';
import Colors from '../config/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Height of the rotating word slot (must match font metrics)
const WORD_SLOT_HEIGHT = 52;

// ── Horizontal carousel sizing ────────────────
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.55, 240);
const CARD_HEIGHT = CARD_WIDTH * 0.7;
const CARD_GAP = 14;
const CARD_STEP = CARD_WIDTH + CARD_GAP;

/** Shortest wraparound distance from item i to current */
function wrapOffset(i: number, current: number, total: number): number {
    let diff = i - current;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;
    return diff;
}

// ──────────────────────────────────────────────
// TO USE YOUR OWN IMAGES:
// 1. Drop your images in  src/assets/challenge/
//    Name them: workout.jpg, read.jpg, run.jpg, walk.jpg, yoga.jpg
// 2. Replace the `image` values below with require() calls, e.g.:
//    image: require('../assets/challenge/workout.jpg'),
// 3. Remove the `placeholder: true` field once you add real images.
// ──────────────────────────────────────────────
const ROTATING_WORDS = [
    { word: 'workout', color: Colors.secondary, emoji: '\u{1F3CB}\u{FE0F}', label: 'Strength Training', placeholder: true },
    { word: 'read', color: Colors.accent, emoji: '\u{1F4DA}', label: 'Daily Reading', placeholder: true },
    { word: 'run', color: '#EC4899', emoji: '\u{1F3C3}', label: 'Morning Runs', placeholder: true },
    { word: 'walk', color: '#10B981', emoji: '\u{1F6B6}', label: 'Outdoor Walks', placeholder: true },
    { word: 'do yoga', color: '#F59E0B', emoji: '\u{1F9D8}', label: 'Yoga Practice', placeholder: true },
];

type ChallengeLandingNavigationProp = NativeStackNavigationProp<
    RootStackParamList,
    'ChallengeLanding'
>;

export default function ChallengeLandingScreen() {
    const navigation = useNavigation<ChallengeLandingNavigationProp>();
    const [wordIndex, setWordIndex] = useState(0);

    // Cycle the rotating word every 3 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const handleStartChallenge = useCallback(() => {
        navigation.navigate('ChallengeSetup');
    }, [navigation]);

    const currentWord = ROTATING_WORDS[wordIndex];

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Hero Section */}
                <LinearGradient
                    colors={[Colors.primarySurface, '#EDF7F3', '#FFFFFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.hero}
                >
                    {/* Header */}
                    <View style={styles.topHeader}>
                        <View style={styles.headerLeft}>
                            {navigation.canGoBack() && (
                                <TouchableOpacity
                                    style={styles.backButton}
                                    onPress={() => navigation.goBack()}
                                    activeOpacity={0.8}
                                >
                                    <ChevronLeft color="#1F2937" size={24} strokeWidth={2.5} />
                                </TouchableOpacity>
                            )}
                            <Image
                                source={require('../assets/icon.png')}
                                style={styles.logo}
                                resizeMode="contain"
                            />
                        </View>
                        <Text style={styles.brandTitle}>Ernit</Text>
                    </View>

                    <View style={styles.heroWrapper}>
                        {/* Hero content fades + slides in on mount */}
                        <MotiView
                            from={{ opacity: 0, translateY: 30 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 700 }}
                            style={styles.heroContent}
                        >
                            {/* Title with dial-rotating word */}
                            <View style={styles.heroTitleContainer}>
                                <Text style={styles.heroTitle}>I want to</Text>

                                {/* Dial word + "more" on same line */}
                                <View style={styles.dialRow}>
                                    <View style={styles.dialSlot}>
                                        {/* Invisible sizer — sits in normal flow to give the slot its width */}
                                        <Text style={[styles.dialWord, { opacity: 0 }]}>
                                            {currentWord.word}
                                        </Text>
                                        {/* Animated words — absolute on top */}
                                        {ROTATING_WORDS.map((item, i) => {
                                            const offset = wrapOffset(i, wordIndex, ROTATING_WORDS.length);
                                            const isActive = offset === 0;
                                            return (
                                                <MotiView
                                                    key={`dial-${i}`}
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
                                                    <Text
                                                        style={[
                                                            styles.dialWord,
                                                            { color: item.color },
                                                        ]}
                                                    >
                                                        {item.word}
                                                    </Text>
                                                </MotiView>
                                            );
                                        })}
                                    </View>
                                    <Text style={styles.heroTitle}>{' '}more</Text>
                                </View>


                            </View>

                            <Text style={styles.heroSubtitle}>
                                Set a challenge. Track your progress.{'\n'}Friends hold you accountable.
                            </Text>

                            <TouchableOpacity
                                style={styles.primaryCta}
                                onPress={handleStartChallenge}
                                activeOpacity={0.9}
                            >
                                <LinearGradient
                                    colors={Colors.gradientDark}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.ctaGradient}
                                >
                                    <Text style={styles.ctaText}>Start My Challenge</Text>
                                    <ChevronRight color="#fff" size={20} strokeWidth={3} />
                                </LinearGradient>
                            </TouchableOpacity>

                            <MotiView
                                from={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ type: 'spring', damping: 32, delay: 400 }}
                                style={styles.badgeWrapper}
                            >
                                <View style={styles.badge}>
                                    <Sparkles color={Colors.secondary} size={14} />
                                    <Text style={[styles.badgeText, { color: Colors.secondary }]}>100% Free</Text>
                                </View>
                            </MotiView>

                            {/* Horizontal Image Carousel — synced with rotating word */}
                            <View style={styles.carouselContainer}>
                                <View style={styles.carouselTrackClip}>
                                    <View style={styles.carouselTrack}>
                                        {ROTATING_WORDS.map((item, i) => {
                                            const offset = wrapOffset(i, wordIndex, ROTATING_WORDS.length);
                                            const isActive = offset === 0;
                                            const isNeighbor = Math.abs(offset) === 1;
                                            const targetOpacity = isActive ? 1 : isNeighbor ? 0.4 : 0;
                                            const targetScale = isActive ? 1 : 0.88;

                                            return (
                                                <MotiView
                                                    key={`card-${i}`}
                                                    animate={{
                                                        translateX: offset * CARD_STEP,
                                                        opacity: targetOpacity,
                                                        scale: targetScale,
                                                    }}
                                                    transition={{
                                                        type: 'spring',
                                                        damping: 20,
                                                        stiffness: 120,
                                                        mass: 0.8,
                                                    }}
                                                    style={[styles.carouselCard, {
                                                        // Center all cards on top of each other; translateX spreads them
                                                        position: 'absolute',
                                                        left: 0,
                                                        width: CARD_WIDTH,
                                                        height: CARD_HEIGHT,
                                                    }]}
                                                >
                                                    {item.placeholder ? (
                                                        <View style={[styles.carouselPlaceholder, { backgroundColor: item.color + '18' }]}>
                                                            <Text style={styles.carouselEmoji}>{item.emoji}</Text>
                                                        </View>
                                                    ) : (
                                                        <Image
                                                            source={(item as any).image}
                                                            style={styles.carouselImage}
                                                            resizeMode="cover"
                                                        />
                                                    )}
                                                </MotiView>
                                            );
                                        })}
                                    </View>
                                </View>
                                {/* Label under carousel */}
                                <AnimatePresence exitBeforeEnter>
                                    <MotiView
                                        key={`label-${wordIndex}`}
                                        from={{ opacity: 0, translateY: 8 }}
                                        animate={{ opacity: 1, translateY: 0 }}
                                        exit={{ opacity: 0, translateY: -8 }}
                                        transition={{ type: 'timing', duration: 300 }}
                                    >
                                        <Text style={[styles.carouselLabel, { color: currentWord.color }]}>
                                            {currentWord.label}
                                        </Text>
                                    </MotiView>
                                </AnimatePresence>
                            </View>
                        </MotiView>
                    </View>


                </LinearGradient>

                {/* How It Works Section — staggered entrance */}
                <View style={styles.howSection}>
                    <View style={styles.howWrapper}>
                        <MotiView
                            from={{ opacity: 0, translateY: 20 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 500 }}
                        >
                            <Text style={styles.sectionLabel}>How It Works</Text>
                            <Text style={styles.sectionTitle}>Three Simple Steps</Text>
                        </MotiView>

                        <View style={styles.stepsContainer}>
                            {[
                                {
                                    icon: <Target color={Colors.primary} size={24} strokeWidth={2.5} />,
                                    iconBg: Colors.primarySurface,
                                    title: 'Pick Your Challenge',
                                    desc: 'Choose what you want to improve and for how long \u2014 gym, yoga, running, reading, or anything you want',
                                },
                                {
                                    icon: <Calendar color={Colors.accent} size={24} strokeWidth={2.5} />,
                                    iconBg: Colors.accentDeep + '18',
                                    title: 'Track Your Progress',
                                    desc: 'Complete sessions, build streaks, and stay on track with your personal timer and calendar',
                                },
                                {
                                    icon: <Users color="#EC4899" size={24} strokeWidth={2.5} />,
                                    iconBg: '#FDF2F8',
                                    title: 'Friends Cheer You On',
                                    desc: 'Get motivated by friends who follow your journey, leave messages, and can even reward you along the way',
                                },
                            ].map((step, i) => (
                                <React.Fragment key={i}>
                                    {i > 0 && <View style={styles.stepDivider} />}
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
                                                <View style={styles.stepNumber}>
                                                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                                                </View>
                                            </View>
                                            <View style={styles.stepContent}>
                                                <Text style={styles.stepTitle}>{step.title}</Text>
                                                <Text style={styles.stepDesc}>{step.desc}</Text>
                                            </View>
                                        </View>
                                    </MotiView>
                                </React.Fragment>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Social Proof */}
                <MotiView
                    from={{ opacity: 0, translateY: 20 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{ type: 'timing', duration: 500, delay: 200 }}
                    style={styles.testimonialSection}
                >
                    <View style={styles.testimonialCard}>
                        <Text style={styles.quoteText}>
                            "I committed to running 3x a week. My friends' messages before each session kept me going. 4 weeks later, I actually did it."
                        </Text>
                        <View style={styles.authorRow}>
                            <View style={styles.authorDot} />
                            <Text style={styles.authorText}>Sarah, Dublin</Text>
                        </View>
                    </View>
                </MotiView>

                {/* Final CTA */}
                <MotiView
                    from={{ opacity: 0, translateY: 20 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{ type: 'timing', duration: 500, delay: 300 }}
                    style={styles.finalCtaSection}
                >
                    <Text style={styles.finalCtaTitle}>Ready to challenge{'\n'}yourself?</Text>
                    <Text style={styles.finalCtaSubtitle}>
                        Join thousands building better habits with friends.
                    </Text>

                    <TouchableOpacity
                        style={styles.primaryCta}
                        onPress={handleStartChallenge}
                        activeOpacity={0.9}
                    >
                        <LinearGradient
                            colors={Colors.gradientDark}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.ctaGradient}
                        >
                            <Text style={styles.ctaText}>Create My Challenge</Text>
                            <ChevronRight color="#fff" size={20} strokeWidth={3} />
                        </LinearGradient>
                    </TouchableOpacity>
                </MotiView>

                <View style={{ height: 60 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAFAFA',
    },
    scrollContent: {
        flexGrow: 1,
        backgroundColor: '#fff',
    },
    hero: {
        paddingTop: Platform.OS === 'ios' ? 120 : 100,
        paddingBottom: 20,
        paddingHorizontal: 24,
        backgroundColor: '#fff',
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
    topHeader: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 50 : 30,
        left: 24,
        right: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    logo: {
        width: 38,
        height: 38,
        borderRadius: 8,
    },
    brandTitle: {
        fontSize: 28,
        fontWeight: '800',
        fontStyle: 'italic',
        color: '#1F2937',
        letterSpacing: -1,
    },
    // ── Dial-style rotating word ──────────────────
    heroTitleContainer: {
        alignItems: 'center',
        marginBottom: 20,
    },
    heroTitle: {
        fontSize: 42,
        fontWeight: '800',
        color: '#1F2937',
        lineHeight: 52,
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
        fontSize: 42,
        fontWeight: '800',
        fontStyle: 'italic',
        lineHeight: WORD_SLOT_HEIGHT,
        letterSpacing: -1,
        textAlign: 'center',
    },
    // ──────────────────────────────────────────────
    heroSubtitle: {
        fontSize: 17,
        color: '#6B7280',
        lineHeight: 28,
        marginBottom: 36,
        textAlign: 'center',
    },
    badgeWrapper: {
        alignItems: 'center',
        marginTop: 24,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: Colors.primarySurface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#D1FAE5',
    },
    badgeText: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    // ── Horizontal image carousel ──────────────
    carouselContainer: {
        alignItems: 'center',
        marginTop: 28,
    },
    carouselTrackClip: {
        width: CARD_WIDTH + CARD_STEP * 2,
        height: CARD_HEIGHT,
        overflow: 'hidden',
    },
    carouselTrack: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        // Center the track within the clip so offset 0 = center
        marginLeft: CARD_STEP,
    },
    carouselCard: {
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#F3F4F6',
    },
    carouselImage: {
        width: '100%',
        height: '100%',
    },
    carouselPlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    carouselEmoji: {
        fontSize: 60,
    },
    carouselLabel: {
        marginTop: 14,
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    primaryCta: {
        alignSelf: 'center',
        borderRadius: 16,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    ctaGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 32,
        paddingVertical: 18,
        borderRadius: 16,
    },
    ctaText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
    },
    floatingDecor: {
        position: 'absolute',
        top: 0,
        right: -40,
        width: 300,
        height: 400,
        zIndex: 1,
    },
    decor1: {
        position: 'absolute',
        top: 100,
        right: -20,
        transform: [{ rotate: '15deg' }],
    },
    decor2: {
        position: 'absolute',
        top: 220,
        right: 60,
        transform: [{ rotate: '-10deg' }],
    },
    decor3: {
        position: 'absolute',
        top: 320,
        right: 10,
        transform: [{ rotate: '20deg' }],
    },
    howSection: {
        paddingVertical: 64,
        paddingHorizontal: 24,
        backgroundColor: '#fff',
        alignItems: 'center',
    },
    howWrapper: {
        width: '100%',
        maxWidth: 600,
    },
    sectionLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: Colors.primary,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        marginBottom: 8,
        textAlign: 'center',
    },
    sectionTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#1F2937',
        marginBottom: 48,
        textAlign: 'center',
    },
    stepsContainer: {
        gap: 0,
    },
    stepCard: {
        flexDirection: 'row',
        gap: 20,
    },
    stepIconContainer: {
        position: 'relative',
    },
    stepIconBg: {
        width: 56,
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepNumber: {
        position: 'absolute',
        top: -8,
        right: -8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#1F2937',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#fff',
    },
    stepNumberText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '800',
    },
    stepContent: {
        flex: 1,
        paddingTop: 4,
    },
    stepTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1F2937',
        marginBottom: 8,
    },
    stepDesc: {
        fontSize: 15,
        color: '#6B7280',
        lineHeight: 22,
    },
    stepDivider: {
        width: 2,
        height: 32,
        backgroundColor: '#F3F4F6',
        marginLeft: 27,
        marginVertical: 16,
    },
    testimonialSection: {
        paddingVertical: 14,
        backgroundColor: '#fff',
        width: '100%',
        maxWidth: 800,
        alignSelf: 'center',
        paddingHorizontal: 24,
    },
    testimonialCard: {
        backgroundColor: '#FAFAFA',
        padding: 32,
        borderRadius: 24,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary,
        width: '100%',
    },
    quoteText: {
        fontSize: 18,
        fontStyle: 'italic',
        color: '#374151',
        lineHeight: 28,
        marginBottom: 20,
    },
    authorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    authorDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Colors.primary,
    },
    authorText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
    },
    finalCtaSection: {
        paddingVertical: 64,
        backgroundColor: '#FAFAFA',
        width: '100%',
        maxWidth: 1200,
        alignSelf: 'center',
        paddingHorizontal: 24,
        alignItems: 'center',
    },
    finalCtaTitle: {
        fontSize: 36,
        fontWeight: '800',
        color: '#1F2937',
        marginBottom: 12,
        textAlign: 'center',
    },
    finalCtaSubtitle: {
        fontSize: 17,
        color: '#6B7280',
        marginBottom: 32,
        textAlign: 'center',
    },
});
