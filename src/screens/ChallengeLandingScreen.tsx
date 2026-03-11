import React, { useEffect, useState, useCallback } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Target, Calendar, Users, Sparkles, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { MotiView } from 'moti';
import { RootStackParamList } from '../types';
import { useApp } from '../context/AppContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import Colors from '../config/colors';
import { Typography } from '../config/typography';
import { Shadows } from '../config/shadows';
import JourneyDemo from '../components/JourneyDemo';

// Height of the rotating word slot (must match font metrics)
const WORD_SLOT_HEIGHT = 46;

const ROTATING_WORDS = [
    { word: 'workout', color: Colors.secondary },
    { word: 'read', color: Colors.accent },
    { word: 'run', color: '#EC4899' },
    { word: 'walk', color: '#10B981' },
    { word: 'do yoga', color: '#F59E0B' },
];

const HERO_IMAGES = [
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?fit=crop&w=800&q=80', // Workout
    'https://images.unsplash.com/photo-1512820790803-83ca734da794?fit=crop&w=800&q=80', // Read
    'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?fit=crop&w=800&q=80', // Run
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?fit=crop&w=800&q=80', // Walk
    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?fit=crop&w=800&q=80', // Yoga
];

// ─── Hero carousel sizing ─────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;
const HERO_IMG_W = Math.min(SCREEN_W * 0.82, 480);
const HERO_IMG_H = HERO_IMG_W * 0.62;
const HERO_SLIDE_STEP = HERO_IMG_W * 0.85;

/** Shortest wraparound distance from item i to current */
function wrapOffset(i: number, current: number, total: number): number {
    let diff = i - current;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;
    return diff;
}

type ChallengeLandingNavigationProp = NativeStackNavigationProp<
    RootStackParamList,
    'ChallengeLanding'
>;

export default function ChallengeLandingScreen() {
    const navigation = useNavigation<ChallengeLandingNavigationProp>();
    const { state } = useApp();
    const isLoggedIn = !!state.user?.id;
    const [wordIndex, setWordIndex] = useState(0);

    // Redirect authenticated users to Goals
    useEffect(() => {
        if (isLoggedIn) {
            navigation.reset({ index: 0, routes: [{ name: 'Goals' }] });
        }
    }, [isLoggedIn, navigation]);

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
        <ErrorBoundary screenName="ChallengeLandingScreen" userId={state.user?.id}>
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
                    {/* Top bar — back button + login */}
                    {navigation.canGoBack() && (
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => navigation.goBack()}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel="Go back"
                        >
                            <ChevronLeft color="#1F2937" size={24} strokeWidth={2.5} />
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
                        <ChevronRight color={Colors.primary} size={16} strokeWidth={3} />
                    </TouchableOpacity>

                    <View style={styles.heroWrapper}>
                        {/* Hero content fades + slides in on mount */}
                        <MotiView
                            from={{ opacity: 0, translateY: 30 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 700 }}
                            style={styles.heroContent}
                        >
                            {/* Brand mark — modern typographic */}
                            <View style={styles.brandSection}>
                                <Text style={styles.brandTitle}>
                                    ernit<Text style={{ color: Colors.secondary }}>.</Text>
                                </Text>
                            </View>

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

                            {/* Hero image carousel — synced with rotating word */}
                            <View style={styles.heroCarousel}>
                                {HERO_IMAGES.map((url, i) => {
                                    const imgIdx = wordIndex % HERO_IMAGES.length;
                                    const offset = wrapOffset(i, imgIdx, HERO_IMAGES.length);
                                    const isCenter = offset === 0;
                                    const isAdjacent = Math.abs(offset) === 1;
                                    return (
                                        <MotiView
                                            key={i}
                                            animate={{
                                                translateX: offset * HERO_SLIDE_STEP,
                                                scale: isCenter ? 1 : 0.88,
                                                opacity: isCenter ? 1 : isAdjacent ? 0.55 : 0,
                                            }}
                                            transition={{
                                                type: 'spring',
                                                damping: 22,
                                                stiffness: 100,
                                                mass: 0.9,
                                            }}
                                            style={[
                                                styles.heroImageCard,
                                                { zIndex: isCenter ? 3 : isAdjacent ? 2 : 1 },
                                            ]}
                                        >
                                            <Image
                                                source={{ uri: url }}
                                                style={styles.heroImg}
                                                resizeMode="cover"
                                                accessibilityLabel={`Challenge activity example ${i + 1}`}
                                            />
                                        </MotiView>
                                    );
                                })}
                            </View>

                            {/* Subtitle / Stat */}
                            <MotiView
                                from={{ opacity: 0, translateY: 10 }}
                                animate={{ opacity: 1, translateY: 0 }}
                                transition={{ type: 'timing', duration: 500, delay: 300 }}
                                style={{
                                    alignItems: 'center',
                                    paddingHorizontal: 32,
                                    marginBottom: 32,
                                }}
                            >
                                <Text style={{
                                    ...Typography.subheading,
                                    color: Colors.textSecondary,
                                    textAlign: 'center',
                                }}>
                                    You are <Text style={{ color: Colors.secondary, fontWeight: '700' }}>600%</Text> more likely to achieve your goals with friends backing you.
                                </Text>
                            </MotiView>

                            <TouchableOpacity
                                style={styles.primaryCta}
                                onPress={handleStartChallenge}
                                activeOpacity={0.9}
                                accessibilityRole="button"
                                accessibilityLabel="Start my challenge"
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
                                    <Text style={[styles.badgeText, { color: Colors.secondary }]}>100% Free</Text>
                                </View>
                            </MotiView>
                        </MotiView>
                    </View>


                </LinearGradient>
                <JourneyDemo />

                {/* How It Works Section */}
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

                        {/* Interactive journey demo */}

                        <View style={styles.stepsContainer}>
                            {[
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
                                    icon: <Users color="#EC4899" size={24} strokeWidth={2.5} />,
                                    iconBg: '#FDF2F8',
                                    title: 'Earn it',
                                    desc: 'Finish your challenge and have the reward you deserve!',
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


                {/* Co-Founders Section */}
                <View style={styles.foundersSection}>
                    <View style={styles.foundersWrapper}>
                        <MotiView
                            from={{ opacity: 0, translateY: 20 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 500 }}
                        >
                            <Text style={styles.sectionLabel}>The Team {'\n'}{'\n'}</Text>
                        </MotiView>

                        <View style={styles.foundersRow}>
                            {[
                                {
                                    name: 'Raul Marquez',
                                    role: 'Co-Founder & CEO',
                                    image: 'https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/founder%20photos%2F20260116_DBP0431.jpg?alt=media&token=c8e102c4-7068-4d45-8bcb-32f8714cc62c',
                                    linkedin: 'https://www.linkedin.com/in/raulferreiramarquez/',
                                },
                                {
                                    name: 'Nuno Castilho',
                                    role: 'Co-Founder & CTO',
                                    image: 'https://firebasestorage.googleapis.com/v0/b/ernit-3fc0b.firebasestorage.app/o/founder%20photos%2Ffoto.jpeg?alt=media&token=4c4b8d02-1741-40ee-88fc-8cd658133864',
                                    linkedin: 'https://www.linkedin.com/in/nuno-del-castilho-5929b298/',
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

                        {/* Incubated at Unicorn Factory */}
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
                    <Text style={styles.finalCtaTitle}>Ready to challenge{'\n'}yourself?</Text>
                    <Text style={styles.finalCtaSubtitle}>
                        Join thousands building better habits with friends.
                    </Text>

                    <TouchableOpacity
                        style={styles.primaryCta}
                        onPress={handleStartChallenge}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel="Create my challenge"
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

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerBrand}>
                        ernit<Text style={{ color: Colors.secondary }}>.</Text>
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
                            onPress={() => Linking.openURL('www.instagram.com/ernitapp__/')}
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
        borderRadius: 12,
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
        gap: 2,
        zIndex: 10,
    },
    loginButtonText: {
        ...Typography.bodyBold,
        color: Colors.primary,
    },
    brandSection: {
        alignItems: 'center',
        marginBottom: 20,
    },
    brandTitle: {
        fontSize: 44,
        fontWeight: '900',
        fontStyle: 'italic',
        color: Colors.textPrimary,
        letterSpacing: -1.5,
    },
    // ── Dial-style rotating word ──────────────────
    heroTitleContainer: {
        alignItems: 'center',
        marginBottom: 14,
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
    // ──────────────────────────────────────────────
    heroSubtitle: {
        ...Typography.subheading,
        color: Colors.textSecondary,
        lineHeight: 28,
        marginBottom: 16,
        textAlign: 'center',
    },

    // ── Hero image carousel ──────────────────────
    heroCarousel: {
        width: SCREEN_W,
        height: HERO_IMG_H + 20,
        alignSelf: 'center',
        marginHorizontal: -24,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 16,
    },
    heroImageCard: {
        position: 'absolute',
        width: HERO_IMG_W,
        height: HERO_IMG_H,
        borderRadius: 20,
        overflow: 'hidden',
        ...Shadows.lg,
    },
    heroImg: {
        width: '100%',
        height: '100%',
    },
    badgeWrapper: {
        alignItems: 'center',
        marginTop: 16,
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
        marginBottom: 36,
    },
    badgeText: {
        ...Typography.small,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    primaryCta: {
        alignSelf: 'center',
        borderRadius: 16,
        ...Shadows.colored(Colors.primary),
        shadowRadius: 16,
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
        color: Colors.white,
        ...Typography.heading3,
    },
    howSection: {
        paddingVertical: 64,
        paddingHorizontal: 24,
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
        color: Colors.primary,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        marginBottom: 8,
        textAlign: 'center',
    },
    sectionTitle: {
        ...Typography.display,
        fontWeight: '800',
        color: Colors.gray800,
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
    stepDivider: {
        width: 2,
        height: 32,
        backgroundColor: Colors.backgroundLight,
        marginLeft: 27,
        marginVertical: 16,
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
        backgroundColor: Colors.gray800,
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
        paddingTop: 4,
    },
    stepTitle: {
        ...Typography.large,
        color: Colors.gray800,
        marginBottom: 8,
    },
    stepDesc: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    testimonialSection: {
        paddingVertical: 14,
        backgroundColor: Colors.white,
        width: '100%',
        maxWidth: 800,
        alignSelf: 'center',
        paddingHorizontal: 24,
    },
    testimonialCard: {
        backgroundColor: Colors.surface,
        padding: 32,
        borderRadius: 24,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary,
        width: '100%',
    },
    quoteText: {
        ...Typography.heading3,
        fontStyle: 'italic',
        color: Colors.gray700,
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
        ...Typography.smallBold,
        color: Colors.textSecondary,
    },
    finalCtaSection: {
        paddingVertical: 64,
        backgroundColor: Colors.surface,
        width: '100%',
        maxWidth: 1200,
        alignSelf: 'center',
        paddingHorizontal: 24,
        alignItems: 'center',
    },
    finalCtaTitle: {
        ...Typography.display,
        fontWeight: '800',
        color: Colors.gray800,
        marginBottom: 12,
        textAlign: 'center',
    },
    finalCtaSubtitle: {
        ...Typography.subheading,
        color: Colors.textSecondary,
        marginBottom: 32,
        textAlign: 'center',
    },

    // ── Co-Founders Section ───────────────────────
    foundersSection: {
        paddingVertical: 64,
        paddingHorizontal: 24,
        backgroundColor: Colors.primarySurface,
        alignItems: 'center',
    },
    foundersWrapper: {
        width: '100%',
        maxWidth: 600,
        alignItems: 'center',
    },
    foundersTitle: {
        ...Typography.display,
        fontWeight: '800',
        color: Colors.gray800,
        marginBottom: 40,
        textAlign: 'center',
    },
    foundersRow: {
        flexDirection: 'row',
        gap: 24,
        justifyContent: 'center',
        flexWrap: 'wrap',
        marginBottom: 32,
    },
    founderCard: {
        alignItems: 'center',
        width: 200,
    },
    founderPhoto: {
        width: 96,
        height: 96,
        borderRadius: 48,
        marginBottom: 16,
        borderWidth: 3,
        borderColor: Colors.white,
        ...Shadows.md,
        shadowOpacity: 0.1,
    },
    founderName: {
        ...Typography.heading3,
        fontWeight: '800',
        color: Colors.gray800,
        marginBottom: 4,
        textAlign: 'center',
    },
    founderRole: {
        ...Typography.small,
        fontWeight: '600',
        color: Colors.primary,
        marginBottom: 10,
        textAlign: 'center',
    },
    linkedinBtn: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: '#0A66C2',
        justifyContent: 'center',
        alignItems: 'center',
    },
    linkedinIcon: {
        ...Typography.body,
        fontWeight: '900',
        color: Colors.white,
        fontStyle: 'italic',
    },
    founderQuote: {
        ...Typography.small,
        fontStyle: 'italic',
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    incubatorBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: Colors.white,
        borderRadius: 24,
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
        paddingVertical: 40,
        paddingHorizontal: 24,
        backgroundColor: Colors.textPrimary,
    },
    footerBrand: {
        fontSize: 28,
        fontWeight: '900',
        fontStyle: 'italic',
        color: Colors.white,
        letterSpacing: -1,
        marginBottom: 20,
    },
    footerSocials: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 24,
    },
    socialBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
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
        color: 'rgba(255,255,255,0.4)',
    },
});
