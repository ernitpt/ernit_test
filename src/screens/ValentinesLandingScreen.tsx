import React, { useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Dimensions,
    Animated,
    Platform,
    Image, // Added Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Heart, Sparkles, Users, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { RootStackParamList } from '../types';

const { width, height } = Dimensions.get('window');

type ValentinesLandingNavigationProp = NativeStackNavigationProp<
    RootStackParamList,
    'ValentinesLanding'
>;

export default function ValentinesLandingScreen() {
    const navigation = useNavigation<ValentinesLandingNavigationProp>();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    React.useEffect(() => {
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

    const handleCreateChallenge = () => {
        navigation.navigate('ValentinesChallenge');
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Hero Section */}
                <View style={styles.hero}>
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
                                Push Each Other{'\n'}To Be <Text style={{ fontStyle: 'italic' }}>Better</Text>
                            </Text>

                            <Text style={styles.heroSubtitle}>
                                Turn your relationship goals into an unforgettable shared journey. Set challenges together, grow closer, and unlock the perfect Valentine's experience.
                            </Text>

                            <TouchableOpacity
                                style={styles.primaryCta}
                                onPress={handleCreateChallenge}
                                activeOpacity={0.9}
                            >
                                <LinearGradient
                                    colors={['#FF6B9D', '#FF4081']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.ctaGradient}
                                >
                                    <Text style={styles.ctaText}>Start Your Journey</Text>
                                    <ChevronRight color="#fff" size={20} strokeWidth={3} />
                                </LinearGradient>
                            </TouchableOpacity>

                            <View style={[styles.badge, { marginTop: 24, marginBottom: 0 }]}>
                                <Sparkles color="#FF6B9D" size={14} />
                                <Text style={styles.badgeText}>Valentine's Special</Text>
                            </View>
                        </Animated.View>
                    </View>

                    {/* Floating Hearts Decoration */}
                    <View style={styles.floatingDecor}>
                        <Heart color="#FFE5EF" size={120} fill="#FFE5EF" opacity={0.3} style={styles.heart1} />
                        <Heart color="#FFD1E3" size={80} fill="#FFD1E3" opacity={0.4} style={styles.heart2} />
                        <Heart color="#FFC0D9" size={60} fill="#FFC0D9" opacity={0.5} style={styles.heart3} />
                    </View>
                </View>

                {/* How It Works Section */}
                <View style={styles.howSection}>
                    <View style={styles.howWrapper}>
                        <Text style={styles.sectionLabel}>How It Works</Text>
                        <Text style={styles.sectionTitle}>Three Simple Steps</Text>

                        <View style={styles.stepsContainer}>
                            <View style={styles.stepCard}>
                                <View style={styles.stepIconContainer}>
                                    <View style={[styles.stepIconBg, { backgroundColor: '#FFF0F5' }]}>
                                        <Heart color="#FF6B9D" size={24} strokeWidth={2.5} />
                                    </View>
                                    <View style={styles.stepNumber}>
                                        <Text style={styles.stepNumberText}>1</Text>
                                    </View>
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={styles.stepTitle}>Choose Together</Text>
                                    <Text style={styles.stepDesc}>
                                        Browse curated experiences and pick the perfect reward for both of you
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.stepDivider} />

                            <View style={styles.stepCard}>
                                <View style={styles.stepIconContainer}>
                                    <View style={[styles.stepIconBg, { backgroundColor: '#F0F4FF' }]}>
                                        <Users color="#6366F1" size={24} strokeWidth={2.5} />
                                    </View>
                                    <View style={styles.stepNumber}>
                                        <Text style={styles.stepNumberText}>2</Text>
                                    </View>
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={styles.stepTitle}>Build Habits</Text>
                                    <Text style={styles.stepDesc}>
                                        Set personal or shared goals and support each other through the journey
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.stepDivider} />

                            <View style={styles.stepCard}>
                                <View style={styles.stepIconContainer}>
                                    <View style={[styles.stepIconBg, { backgroundColor: '#FFF9E6' }]}>
                                        <Sparkles color="#F59E0B" size={24} strokeWidth={2.5} />
                                    </View>
                                    <View style={styles.stepNumber}>
                                        <Text style={styles.stepNumberText}>3</Text>
                                    </View>
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={styles.stepTitle}>Unlock & Enjoy</Text>
                                    <Text style={styles.stepDesc}>
                                        Complete your challenge and celebrate with the experience you both earned
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
                            "The challenge brought us closer. By the time we unlocked our dinner, we'd already won."
                        </Text>
                        <View style={styles.authorRow}>
                            <View style={styles.authorDot} />
                            <Text style={styles.authorText}>Maria & João, Lisbon</Text>
                        </View>
                    </View>
                </View>

                {/* Final CTA */}
                <View style={styles.finalCtaSection}>
                    <Text style={styles.finalCtaTitle}>Ready to Begin?</Text>
                    <Text style={styles.finalCtaSubtitle}>
                        Create a journey you'll both remember
                    </Text>

                    <TouchableOpacity
                        style={styles.primaryCta}
                        onPress={handleCreateChallenge}
                        activeOpacity={0.9}
                    >
                        <LinearGradient
                            colors={['#FF6B9D', '#FF4081']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.ctaGradient}
                        >
                            <Text style={styles.ctaText}>Create Your Challenge</Text>
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
        backgroundColor: '#FFF0F5',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#FFE5EF',
        marginBottom: 24,
    },
    badgeText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#FF6B9D',
        letterSpacing: 0.3,
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
        shadowColor: '#FF6B9D',
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
    heart1: {
        position: 'absolute',
        top: 100,
        right: -20,
        transform: [{ rotate: '15deg' }],
    },
    heart2: {
        position: 'absolute',
        top: 220,
        right: 60,
        transform: [{ rotate: '-10deg' }],
    },
    heart3: {
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
        color: '#FF6B9D',
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
        borderLeftColor: '#FF6B9D',
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
        backgroundColor: '#FF6B9D',
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
    secondaryCta: {
        backgroundColor: '#1F2937',
        paddingHorizontal: 40,
        paddingVertical: 18,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },
    secondaryCtaText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
    },
});