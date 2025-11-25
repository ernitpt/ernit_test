import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    FlatList,
    Dimensions,
    Animated,
    StyleSheet,
    Platform,
    ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { userService } from '../services/userService';
import { auth } from '../services/firebase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type OnboardingNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

interface Slide {
    id: number;
    title: string;
    description: string;
    emoji: string;
    color1: string;
    color2: string;
}

const slides: Slide[] = [
    {
        id: 1,
        title: 'The Gift of Motivation',
        description: 'Ernit isn\'t just about gifts. It\'s about helping friends achieve their dreams with a little extra incentive.',
        emoji: '🎁',
        color1: '#8B5CF6',
        color2: '#6366F1',
    },
    {
        id: 2,
        title: 'Send an Experience',
        description: 'Pick a meaningful reward for your friend. The surprise stays hidden, and they\'ll discover it piece by piece through motivating hints.',
        emoji: '🎯',
        color1: '#EC4899',
        color2: '#8B5CF6',
    },
    {
        id: 3,
        title: 'Earn Your Reward',
        description: 'Set goals, track your progress, and prove you\'ve earned it. The harder you work, the closer you get.',
        emoji: '📈',
        color1: '#3B82F6',
        color2: '#06B6D4',
    },
    {
        id: 4,
        title: 'Celebrate Success',
        description: 'Hit your milestones to unlock your gift! The best rewards are the ones you truly earn.',
        emoji: '🏆',
        color1: '#F59E0B',
        color2: '#EF4444',
    },
];

const OnboardingScreen = () => {
    const navigation = useNavigation<OnboardingNavigationProp>();
    const { requireAuth } = useAuthGuard();
    const [currentIndex, setCurrentIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;
    const slidesRef = useRef<FlatList>(null);
    const fadeAnim = useRef(new Animated.Value(1)).current;

    const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
        if (viewableItems.length > 0) {
            const newIndex = viewableItems[0].index;
            console.log('📍 Viewable items changed to index:', newIndex, 'slide:', slides[newIndex]?.title);
            setCurrentIndex(newIndex);
        }
    }).current;

    // Additional handler to ensure button updates when swiping
    const handleMomentumScrollEnd = (event: any) => {
        const contentOffset = event.nativeEvent.contentOffset.x;
        const newIndex = Math.round(contentOffset / SCREEN_WIDTH);
        console.log('🔄 Scroll ended at index:', newIndex, 'slide:', slides[newIndex]?.title);
        setCurrentIndex(newIndex);
    };

    const handleNext = () => {
        console.log('🔵 Next button pressed');
        console.log('   Current index:', currentIndex);
        console.log('   Current slide:', slides[currentIndex]?.title);
        console.log('   Total slides:', slides.length);
        console.log('   Is last slide?', currentIndex === slides.length - 1);

        if (currentIndex < slides.length - 1) {
            const nextIndex = currentIndex + 1;
            console.log('   ✅ Advancing to index:', nextIndex, 'slide:', slides[nextIndex]?.title);

            // Manually update the index BEFORE scrolling
            setCurrentIndex(nextIndex);

            // Platform-specific scrolling
            if (Platform.OS === 'web') {
                // For web, access the underlying DOM element
                const flatListNode = slidesRef.current as any;
                if (flatListNode && flatListNode._listRef) {
                    const scrollView = flatListNode._listRef._scrollRef;
                    if (scrollView) {
                        scrollView.scrollTo({
                            x: nextIndex * SCREEN_WIDTH,
                            animated: true,
                        });
                    }
                }
            } else {
                // For native, use scrollToIndex
                slidesRef.current?.scrollToIndex({ index: nextIndex, animated: true });
            }
        } else {
            console.log('   ✅ Last slide - calling handleGetStarted');
            handleGetStarted();
        }
    };

    const handleSkip = () => {
        handleGetStarted();
    };

    const handleGetStarted = async () => {
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            await AsyncStorage.setItem('hasSeenOnboarding', 'true');

            const currentUser = auth.currentUser;
            if (currentUser) {
                await userService.updateOnboardingStatus(currentUser.uid, 'completed');
            }
        } catch (error) {
            console.error('Error saving onboarding status:', error);
        }

        Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            navigation.replace('CategorySelection');
            setTimeout(() => {
                requireAuth('Welcome to Ernit! Sign in to get started.');
            }, 500);
        });
    };

    const Paginator = ({ data, scrollX }: { data: Slide[], scrollX: Animated.Value }) => {
        return (
            <View style={styles.paginatorContainer}>
                {data.map((_, i) => {
                    const inputRange = [(i - 1) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 1) * SCREEN_WIDTH];

                    const dotWidth = scrollX.interpolate({
                        inputRange,
                        outputRange: [10, 28, 10],
                        extrapolate: 'clamp',
                    });

                    const opacity = scrollX.interpolate({
                        inputRange,
                        outputRange: [0.3, 1, 0.3],
                        extrapolate: 'clamp',
                    });

                    return (
                        <Animated.View
                            key={i.toString()}
                            style={[styles.dot, { width: dotWidth, opacity }]}
                        />
                    );
                })}
            </View>
        );
    };

    const renderItem = ({ item, index }: { item: Slide, index: number }) => {
        const inputRange = [
            (index - 1) * SCREEN_WIDTH,
            index * SCREEN_WIDTH,
            (index + 1) * SCREEN_WIDTH
        ];

        const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.6, 1, 0.6],
            extrapolate: 'clamp',
        });

        const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
        });

        const translateY = scrollX.interpolate({
            inputRange,
            outputRange: [60, 0, 60],
            extrapolate: 'clamp',
        });

        const rotate = scrollX.interpolate({
            inputRange,
            outputRange: ['-15deg', '0deg', '15deg'],
            extrapolate: 'clamp',
        });

        return (
            <View style={styles.slide}>
                <Animated.View
                    style={[
                        styles.emojiContainer,
                        {
                            transform: [
                                { scale },
                                { rotate },
                            ],
                            opacity
                        }
                    ]}
                >
                    <LinearGradient
                        colors={[item.color1, item.color2]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.emojiBackground}
                    >
                        <Text style={styles.emoji}>{item.emoji}</Text>
                    </LinearGradient>

                    {/* Decorative rings */}
                    <View style={[styles.ring, styles.ring1]} />
                    <View style={[styles.ring, styles.ring2]} />
                </Animated.View>

                <Animated.View
                    style={[
                        styles.textContainer,
                        {
                            transform: [{ translateY }],
                            opacity
                        }
                    ]}
                >
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.description}>{item.description}</Text>
                </Animated.View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            <LinearGradient
                colors={['#0F0728', '#1a0f3d', '#2d1b69']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {/* Animated background elements */}
            <View style={styles.bgCircle1} />
            <View style={styles.bgCircle2} />
            <View style={styles.bgCircle3} />

            <View style={styles.contentContainer}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={handleSkip}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.skipButton}
                    >
                        <Text style={styles.skipText}>Skip</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.slidesContainer}>
                    <FlatList
                        data={slides}
                        renderItem={renderItem}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        pagingEnabled
                        bounces={false}
                        scrollEnabled={true}
                        directionalLockEnabled={true}
                        disableIntervalMomentum={true}
                        overScrollMode="never"
                        keyExtractor={(item) => item.id.toString()}
                        onScroll={Animated.event(
                            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                            { useNativeDriver: false }
                        )}
                        scrollEventThrottle={16}
                        onViewableItemsChanged={onViewableItemsChanged}
                        viewabilityConfig={viewConfig}
                        onMomentumScrollEnd={handleMomentumScrollEnd}
                        ref={slidesRef}
                        style={styles.flatList}
                    />
                </View>

                <View style={styles.footer}>
                    <Paginator data={slides} scrollX={scrollX} />

                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleNext}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={['#8B5CF6', '#6D28D9', '#5B21B6']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.buttonGradient}
                        >
                            <Text style={styles.buttonText}>
                                {currentIndex === slides.length - 1 ? 'Get Started 🚀' : 'Next'}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F0728',
        overflow: 'hidden',
    },
    contentContainer: {
        flex: 1,
        zIndex: 10,
    },
    bgCircle1: {
        position: 'absolute',
        top: -150,
        right: -100,
        width: 400,
        height: 400,
        borderRadius: 200,
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        zIndex: 0,
    },
    bgCircle2: {
        position: 'absolute',
        bottom: -100,
        left: -150,
        width: 350,
        height: 350,
        borderRadius: 175,
        backgroundColor: 'rgba(59, 130, 246, 0.12)',
        zIndex: 0,
    },
    bgCircle3: {
        position: 'absolute',
        top: '40%',
        right: -80,
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: 'rgba(236, 72, 153, 0.1)',
        zIndex: 0,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: 10,
    },
    skipButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    skipText: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 15,
        fontWeight: '600',
    },
    slidesContainer: {
        flex: 1,
        overflow: 'hidden',
    },
    flatList: {
        flex: 1,
    },
    slide: {
        width: SCREEN_WIDTH,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    emojiContainer: {
        marginBottom: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emojiBackground: {
        width: 160,
        height: 160,
        borderRadius: 80,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.5,
        shadowRadius: 30,
        elevation: 20,
    },
    emoji: {
        fontSize: 80,
        textAlign: 'center',
    },
    ring: {
        position: 'absolute',
        borderRadius: 1000,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    ring1: {
        width: 200,
        height: 200,
    },
    ring2: {
        width: 240,
        height: 240,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    textContainer: {
        alignItems: 'center',
        paddingHorizontal: 20,
        maxWidth: SCREEN_WIDTH - 80,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 12,
        letterSpacing: 0.5,
    },
    description: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.75)',
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 320,
    },
    footer: {
        paddingHorizontal: 32,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        alignItems: 'center',
    },
    paginatorContainer: {
        flexDirection: 'row',
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dot: {
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FFFFFF',
        marginHorizontal: 5,
    },
    button: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    buttonGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 28,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});

export default OnboardingScreen;