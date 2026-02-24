import React, { useRef, useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Dimensions,
    Animated,
    Platform,
    Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Target, Calendar, Users, Sparkles, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { RootStackParamList } from '../types';
import Colors from '../config/colors';

const { width } = Dimensions.get('window');

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
    { word: 'yoga', color: '#F59E0B', emoji: '\u{1F9D8}', label: 'Yoga Practice', placeholder: true },
];

type ChallengeLandingNavigationProp = NativeStackNavigationProp<
    RootStackParamList,
    'ChallengeLanding'
>;

export default function ChallengeLandingScreen() {
    const navigation = useNavigation<ChallengeLandingNavigationProp>();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    // Rotating word + image animation
    const [wordIndex, setWordIndex] = useState(0);
    const [prevWordIndex, setPrevWordIndex] = useState(0);
    const wordOpacity = useRef(new Animated.Value(1)).current;
    const imageInOpacity = useRef(new Animated.Value(1)).current;
    const imageOutOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            // Fade out word + current image
            Animated.parallel([
                Animated.timing(wordOpacity, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(imageInOpacity, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                // Swap: previous becomes current for crossfade
                setPrevWordIndex(wordIndex);
                const nextIndex = (wordIndex + 1) % ROTATING_WORDS.length;
                setWordIndex(nextIndex);

                // Reset opacities for crossfade in
                imageOutOpacity.setValue(0);
                imageInOpacity.setValue(0);

                Animated.parallel([
                    Animated.timing(wordOpacity, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: true,
                    }),
                    Animated.timing(imageInOpacity, {
                        toValue: 1,
                        duration: 500,
                        useNativeDriver: true,
                    }),
                ]).start();
            });
        }, 3000);

        return () => clearInterval(interval);
    }, [wordIndex]);

    const handleStartChallenge = () => {
        navigation.navigate('ChallengeSetup');
    };

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
                        <Animated.View
                            style={[
                                styles.heroContent,
                                {
                                    opacity: fadeAnim,
                                    transform: [{ translateY: slideAnim }],
                                }
                            ]}
                        >
                            <Text style={styles.heroTitle}>
                                I want to{'\n'}
                                <Animated.Text
                                    style={{
                                        color: currentWord.color,
                                        fontStyle: 'italic',
                                        opacity: wordOpacity,
                                    }}
                                >
                                    {currentWord.word}
                                </Animated.Text>
                                {' '}more
                            </Text>

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

                            <View style={[styles.badge, { marginTop: 24, marginBottom: 0 }]}>
                                <Sparkles color="#10B981" size={14} />
                                <Text style={[styles.badgeText, { color: '#10B981' }]}>100% Free</Text>
                            </View>

                            {/* Image Carousel — synced with rotating word */}
                            <View style={styles.carouselContainer}>
                                <View style={styles.carouselImageWrapper}>
                                    {/* Current image (fades in) */}
                                    <Animated.View style={[styles.carouselSlide, { opacity: imageInOpacity }]}>
                                        {currentWord.placeholder ? (
                                            <View style={[styles.carouselPlaceholder, { backgroundColor: currentWord.color + '18' }]}>
                                                <Text style={styles.carouselEmoji}>{currentWord.emoji}</Text>
                                            </View>
                                        ) : (
                                            <Image
                                                source={currentWord.image}
                                                style={styles.carouselImage}
                                                resizeMode="cover"
                                            />
                                        )}
                                    </Animated.View>
                                </View>
                                {/* Label under image */}
                                <Animated.Text
                                    style={[
                                        styles.carouselLabel,
                                        { color: currentWord.color, opacity: imageInOpacity },
                                    ]}
                                >
                                    {currentWord.label}
                                </Animated.Text>
                            </View>
                        </Animated.View>
                    </View>

                    {/* Floating Decoration */}
                    <View style={styles.floatingDecor}>
                        <Target color={Colors.primarySurface} size={120} opacity={0.3} style={styles.decor1} />
                        <Sparkles color={Colors.primaryTint} size={80} opacity={0.4} style={styles.decor2} />
                        <Target color="#C4B5FD" size={60} opacity={0.5} style={styles.decor3} />
                    </View>
                </LinearGradient>

                {/* How It Works Section */}
                <View style={styles.howSection}>
                    <View style={styles.howWrapper}>
                        <Text style={styles.sectionLabel}>How It Works</Text>
                        <Text style={styles.sectionTitle}>Three Simple Steps</Text>

                        <View style={styles.stepsContainer}>
                            <View style={styles.stepCard}>
                                <View style={styles.stepIconContainer}>
                                    <View style={[styles.stepIconBg, { backgroundColor: Colors.primarySurface }]}>
                                        <Target color={Colors.primary} size={24} strokeWidth={2.5} />
                                    </View>
                                    <View style={styles.stepNumber}>
                                        <Text style={styles.stepNumberText}>1</Text>
                                    </View>
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={styles.stepTitle}>Pick Your Challenge</Text>
                                    <Text style={styles.stepDesc}>
                                        Choose what you want to improve and for how long — gym, yoga, running, reading, or anything you want
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.stepDivider} />

                            <View style={styles.stepCard}>
                                <View style={styles.stepIconContainer}>
                                    <View style={[styles.stepIconBg, { backgroundColor: Colors.accentDeep + '18' }]}>
                                        <Calendar color={Colors.accent} size={24} strokeWidth={2.5} />
                                    </View>
                                    <View style={styles.stepNumber}>
                                        <Text style={styles.stepNumberText}>2</Text>
                                    </View>
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={styles.stepTitle}>Track Your Progress</Text>
                                    <Text style={styles.stepDesc}>
                                        Complete sessions, build streaks, and stay on track with your personal timer and calendar
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.stepDivider} />

                            <View style={styles.stepCard}>
                                <View style={styles.stepIconContainer}>
                                    <View style={[styles.stepIconBg, { backgroundColor: '#FDF2F8' }]}>
                                        <Users color="#EC4899" size={24} strokeWidth={2.5} />
                                    </View>
                                    <View style={styles.stepNumber}>
                                        <Text style={styles.stepNumberText}>3</Text>
                                    </View>
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={styles.stepTitle}>Friends Cheer You On</Text>
                                    <Text style={styles.stepDesc}>
                                        Get motivated by friends who follow your journey, leave messages, and can even reward you along the way
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Social Proof */}
                <View style={styles.testimonialSection}>
                    <View style={styles.testimonialCard}>
                        <Text style={styles.quoteText}>
                            "I committed to running 3x a week. My friends' messages before each session kept me going. 4 weeks later, I actually did it."
                        </Text>
                        <View style={styles.authorRow}>
                            <View style={styles.authorDot} />
                            <Text style={styles.authorText}>Sarah, Dublin</Text>
                        </View>
                    </View>
                </View>

                {/* Final CTA */}
                <View style={styles.finalCtaSection}>
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
                </View>

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
        fontSize: 22,
        fontWeight: '800',
        fontStyle: 'italic',
        color: '#1F2937',
        letterSpacing: -1,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: '#ECFDF5',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#D1FAE5',
        marginBottom: 24,
    },
    badgeText: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    // Image carousel
    carouselContainer: {
        alignItems: 'center',
        marginTop: 28,
    },
    carouselImageWrapper: {
        width: Math.min(width - 80, 320),
        height: Math.min(width - 80, 320) * 0.65,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#F3F4F6',
        position: 'relative',
    },
    carouselSlide: {
        ...StyleSheet.absoluteFillObject,
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
        fontSize: 72,
    },
    carouselLabel: {
        marginTop: 12,
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    heroTitle: {
        fontSize: 42,
        fontWeight: '800',
        color: '#1F2937',
        marginBottom: 20,
        lineHeight: 58,
        letterSpacing: -1,
        textAlign: 'center',
    },
    heroSubtitle: {
        fontSize: 17,
        color: '#6B7280',
        lineHeight: 28,
        marginBottom: 36,
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
