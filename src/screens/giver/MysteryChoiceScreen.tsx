import React, { useState, useEffect } from 'react';
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
import { Eye, Sparkles, ChevronDown, ChevronUp } from 'lucide-react-native';
import { RootStackParamList, Experience } from '../../types';
import { useApp } from '../../context/AppContext';
import SharedHeader from '../../components/SharedHeader';
import MainScreen from '../MainScreen';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { analyticsService } from '../../services/AnalyticsService';
import Colors from '../../config/colors';

type MysteryChoiceNav = NativeStackNavigationProp<RootStackParamList, 'MysteryChoice'>;

const MysteryChoiceScreen = () => {
    const navigation = useNavigation<MysteryChoiceNav>();
    const route = useRoute();
    const routeParams = route.params as { experience?: Experience } | undefined;
    const experience = routeParams?.experience;
    const { state, dispatch } = useApp();
    const empowerContext = state.empowerContext;
    const userName = empowerContext?.userName || 'your friend';

    const [showHowItWorks, setShowHowItWorks] = useState(false);

    // Redirect if experience is missing
    useEffect(() => {
        if (!experience) {
            navigation.goBack();
        }
    }, [experience, navigation]);

    if (!experience) {
        return (
            <ErrorBoundary screenName="MysteryChoiceScreen" userId={state.user?.id}>
            <MainScreen activeRoute="Home">
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: Colors.textSecondary, fontSize: 16 }}>Redirecting...</Text>
                </View>
            </MainScreen>
            </ErrorBoundary>
        );
    }

    const handleOpenGift = () => {
        analyticsService.trackEvent('mystery_choice_selected', 'social', { choice: 'open', experienceId: experience.id }, 'MysteryChoiceScreen');
        if (empowerContext) {
            dispatch({
                type: 'SET_EMPOWER_CONTEXT',
                payload: { ...empowerContext, isMystery: false },
            });
        }
        navigation.navigate('ExperienceCheckout', {
            cartItems: [{ experienceId: experience.id, quantity: 1 }],
        });
    };

    const handleMysteryGift = () => {
        analyticsService.trackEvent('mystery_choice_selected', 'social', { choice: 'mystery', experienceId: experience.id }, 'MysteryChoiceScreen');
        if (empowerContext) {
            dispatch({
                type: 'SET_EMPOWER_CONTEXT',
                payload: { ...empowerContext, isMystery: true },
            });
        }
        navigation.navigate('ExperienceCheckout', {
            cartItems: [{ experienceId: experience.id, quantity: 1 }],
        });
    };

    return (
        <ErrorBoundary screenName="MysteryChoiceScreen" userId={state.user?.id}>
        <MainScreen activeRoute="Home">
            <SharedHeader title="Gift Style" showBack />

            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                <Text style={styles.heading}>
                    How should {userName} receive this?
                </Text>

                {/* Option 1: Gift Openly */}
                <TouchableOpacity
                    style={styles.optionCard}
                    onPress={handleOpenGift}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Gift openly"
                >
                    <View style={styles.optionHeader}>
                        <View style={styles.optionIconContainer}>
                            <Eye color={Colors.secondary} size={24} />
                        </View>
                        <Text style={styles.optionTitle}>Gift Openly</Text>
                    </View>

                    <View style={styles.experiencePreview}>
                        <Image
                            source={{ uri: experience.coverImageUrl }}
                            style={styles.previewImage}
                            accessibilityLabel={`${experience.title} preview image`}
                        />
                        <View style={styles.previewInfo}>
                            <Text style={styles.previewTitle} numberOfLines={2}>
                                {experience.title}
                            </Text>
                            <Text style={styles.previewPrice}>
                                {'\u20AC'}{experience.price}
                            </Text>
                        </View>
                    </View>

                    <Text style={styles.optionDescription}>
                        {userName} will see the experience details right away
                    </Text>
                </TouchableOpacity>

                {/* Option 2: Make it a Mystery */}
                <TouchableOpacity
                    style={[styles.optionCard, styles.optionCardMystery]}
                    onPress={handleMysteryGift}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Make it a mystery"
                >
                    <View style={styles.optionHeader}>
                        <View style={[styles.optionIconContainer, styles.mysteryIconContainer]}>
                            <Sparkles color="#f59e0b" size={24} />
                        </View>
                        <Text style={styles.optionTitle}>Make it a Mystery</Text>
                    </View>

                    <View style={styles.experiencePreview}>
                        <View style={styles.mysteryImageContainer}>
                            <Image
                                source={{ uri: experience.coverImageUrl }}
                                style={[styles.previewImage, styles.mysteryImageBlur]}
                                accessibilityLabel="Mystery experience hidden image"
                            />
                            <View style={styles.mysteryOverlay}>
                                <Text style={styles.mysteryOverlayText}>?</Text>
                            </View>
                        </View>
                        <View style={styles.previewInfo}>
                            <Text style={styles.previewTitle} numberOfLines={2}>
                                Mystery Experience
                            </Text>
                            <Text style={styles.mysterySubtext}>Hidden until completion</Text>
                        </View>
                    </View>

                    <Text style={styles.optionDescription}>
                        The experience stays hidden — AI hints guide them each session
                    </Text>
                </TouchableOpacity>

                {/* How Hints Work */}
                <TouchableOpacity
                    style={styles.howItWorksToggle}
                    onPress={() => setShowHowItWorks(!showHowItWorks)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={showHowItWorks ? "Hide how mystery hints work" : "Show how mystery hints work"}
                >
                    <Sparkles color="#f59e0b" size={18} />
                    <Text style={styles.howItWorksTitle}>How Mystery Hints Work</Text>
                    {showHowItWorks ? (
                        <ChevronUp color={Colors.textSecondary} size={18} />
                    ) : (
                        <ChevronDown color={Colors.textSecondary} size={18} />
                    )}
                </TouchableOpacity>

                {showHowItWorks && (
                    <View style={styles.howItWorksContent}>
                        <Text style={styles.howItWorksText}>
                            When you make a gift a mystery, {userName} won't know what it is.
                            Instead, they'll receive a clever AI-generated hint before each session
                            that gets more revealing as they progress:
                        </Text>

                        <View style={styles.exampleContainer}>
                            <Text style={styles.exampleTitle}>
                                Example: If you gift "Rock Climbing at Climb Dublin"
                            </Text>

                            <View style={styles.exampleHint}>
                                <Text style={styles.exampleSession}>Session 2</Text>
                                <Text style={styles.exampleText}>
                                    "Think comfort and flexibility — you might be reaching for new heights..."
                                </Text>
                            </View>

                            <View style={styles.exampleHint}>
                                <Text style={styles.exampleSession}>Session 5</Text>
                                <Text style={styles.exampleText}>
                                    "Your reward involves a harness and some serious grip strength"
                                </Text>
                            </View>

                            <View style={styles.exampleHint}>
                                <Text style={styles.exampleSession}>Session 10</Text>
                                <Text style={styles.exampleText}>
                                    "You'll be scaling walls at a spot in Dublin city centre!"
                                </Text>
                            </View>
                        </View>

                        <Text style={styles.howItWorksFooter}>
                            The mystery is revealed when they complete the challenge!
                        </Text>
                    </View>
                )}
            </ScrollView>
        </MainScreen>
        </ErrorBoundary>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    heading: {
        fontSize: 22,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 20,
        textAlign: 'center',
    },
    optionCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
        borderWidth: 2,
        borderColor: Colors.border,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
    },
    optionCardMystery: {
        borderColor: '#fde68a',
        backgroundColor: '#fffbeb',
    },
    optionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
    },
    optionIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: Colors.primarySurface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mysteryIconContainer: {
        backgroundColor: '#fef3c7',
    },
    optionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    experiencePreview: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: Colors.surface,
        padding: 10,
        borderRadius: 12,
        marginBottom: 12,
    },
    previewImage: {
        width: 56,
        height: 56,
        borderRadius: 10,
        backgroundColor: Colors.border,
    },
    previewInfo: {
        flex: 1,
    },
    previewTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    previewPrice: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.primary,
        marginTop: 2,
    },
    mysteryImageContainer: {
        position: 'relative',
        width: 56,
        height: 56,
        borderRadius: 10,
        overflow: 'hidden',
    },
    mysteryImageBlur: {
        opacity: 0.3,
    },
    mysteryOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(245,158,11,0.15)',
    },
    mysteryOverlayText: {
        fontSize: 24,
        fontWeight: '700',
        color: '#f59e0b',
    },
    mysterySubtext: {
        fontSize: 12,
        color: '#92400e',
        marginTop: 2,
        fontStyle: 'italic',
    },
    optionDescription: {
        fontSize: 14,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
    howItWorksToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: '#fffbeb',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#fde68a',
        marginTop: 6,
    },
    howItWorksTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        color: '#92400e',
    },
    howItWorksContent: {
        backgroundColor: '#fffbeb',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#fde68a',
        borderTopWidth: 0,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        padding: 16,
        marginTop: -1,
    },
    howItWorksText: {
        fontSize: 14,
        color: '#78350f',
        lineHeight: 21,
        marginBottom: 16,
    },
    exampleContainer: {
        backgroundColor: 'rgba(255,255,255,0.6)',
        borderRadius: 10,
        padding: 14,
        marginBottom: 14,
    },
    exampleTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#92400e',
        marginBottom: 12,
    },
    exampleHint: {
        marginBottom: 10,
        paddingLeft: 12,
        borderLeftWidth: 2,
        borderLeftColor: '#fbbf24',
    },
    exampleSession: {
        fontSize: 12,
        fontWeight: '700',
        color: '#b45309',
        marginBottom: 2,
    },
    exampleText: {
        fontSize: 13,
        color: '#78350f',
        lineHeight: 19,
        fontStyle: 'italic',
    },
    howItWorksFooter: {
        fontSize: 14,
        fontWeight: '600',
        color: '#92400e',
        textAlign: 'center',
    },
});

export default MysteryChoiceScreen;
