import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Check } from 'lucide-react-native';
import { MotiView } from 'moti';
import { RootStackParamList, Experience, CartItem } from '../../types';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import Button from '../../components/Button';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { FOOTER_HEIGHT } from '../../components/FooterNavigation';
import { analyticsService } from '../../services/AnalyticsService';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { vh } from '../../utils/responsive';

type MysteryChoiceNav = NativeStackNavigationProp<RootStackParamList, 'MysteryChoice'>;

type RevealMode = 'revealed' | 'secret';

const getRevealOptions = (colors: typeof Colors): { key: RevealMode; emoji: string; label: string; tagline: string; color: string; badge?: string }[] => [
    {
        key: 'revealed',
        emoji: '\u{1F441}\uFE0F',
        label: 'Revealed',
        tagline: 'They know the reward from day one. Full motivation to earn it.',
        color: colors.warning,
    },
    {
        key: 'secret',
        emoji: '\u{1F512}',
        label: 'Secret',
        tagline: 'The reward stays hidden. Ernit drops hints every session.',
        color: colors.secondary,
        badge: 'Surprise factor',
    },
];

const MysteryChoiceScreen = () => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const REVEAL_OPTIONS = useMemo(() => getRevealOptions(colors), [colors]);
    const navigation = useNavigation<MysteryChoiceNav>();
    const route = useRoute();
    const routeParams = route.params as { experience?: Experience; cartItems?: CartItem[] } | undefined;
    const experience = routeParams?.experience;
    const cartItems = routeParams?.cartItems;
    const isCartFlow = !!cartItems && cartItems.length > 0;
    const { state, dispatch } = useApp();
    const empowerContext = state.empowerContext;

    const [revealMode, setRevealMode] = useState<RevealMode | null>(null);

    // Redirect if neither experience nor cart items are provided
    useEffect(() => {
        if (!experience && !isCartFlow) {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('CategorySelection');
        }
    }, [experience, isCartFlow, navigation]);

    const handleContinue = useCallback(() => {
        if (!revealMode) return;
        if (!experience && !isCartFlow) return;

        const isMystery = revealMode === 'secret';
        analyticsService.trackEvent('mystery_choice_selected', 'social', {
            choice: revealMode,
            experienceId: experience?.id,
            isCartFlow,
        }, 'MysteryChoiceScreen');

        if (empowerContext) {
            dispatch({
                type: 'SET_EMPOWER_CONTEXT',
                payload: { ...empowerContext, isMystery },
            });
        }

        const checkoutCartItems = isCartFlow
            ? cartItems!
            : [{ experienceId: experience!.id, quantity: 1 }];

        navigation.navigate('ExperienceCheckout', {
            cartItems: checkoutCartItems,
            isMystery,
        } as any);
    }, [revealMode, experience, isCartFlow, cartItems, empowerContext, dispatch, navigation]);

    if (!experience && !isCartFlow) {
        return (
            <ErrorBoundary screenName="MysteryChoiceScreen" userId={state.user?.id}>
                <MainScreen activeRoute="Home">
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ color: colors.textSecondary, ...Typography.subheading }}>Redirecting...</Text>
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
                            <ChevronLeft color={colors.textPrimary} size={24} strokeWidth={2.5} />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Gift a Challenge</Text>
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
                            <Text style={styles.stepTitle}>How is the reward revealed?</Text>
                            <Text style={styles.stepSubtitle}>
                                Should they know what they're working towards?
                            </Text>
                        </MotiView>

                        {/* Options — exact match of GiftFlowScreen renderRevealStep */}
                        {REVEAL_OPTIONS.map((option, index) => {
                            const isActive = revealMode === option.key;
                            return (
                                <MotiView
                                    key={option.key}
                                    from={{ opacity: 0, translateY: 16 }}
                                    animate={{ opacity: 1, translateY: 0 }}
                                    transition={{ type: 'timing', duration: 300, delay: index * 80 }}
                                >
                                    <TouchableOpacity
                                        style={[
                                            styles.rewardChoice,
                                            isActive && styles.rewardChoiceActive,
                                        ]}
                                        onPress={() => setRevealMode(option.key)}
                                        activeOpacity={0.8}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Select ${option.label} reveal mode`}
                                    >
                                        <View style={styles.rewardChoiceHeader}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.rewardChoiceTitle, isActive && styles.rewardChoiceTitleActive]}>
                                                    {option.label}
                                                </Text>
                                                <Text style={styles.rewardChoiceDesc}>{option.tagline}</Text>
                                                {option.badge && (
                                                    <View style={styles.revealBadge}>
                                                        <Text style={styles.revealBadgeText}>{option.badge}</Text>
                                                    </View>
                                                )}
                                            </View>
                                            {isActive && (
                                                <View style={styles.rewardChoiceCheck}>
                                                    <Check color={colors.white} size={14} strokeWidth={3} />
                                                </View>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                </MotiView>
                            );
                        })}
                    </ScrollView>

                    {/* Footer CTA */}
                    <View style={styles.footer}>
                        <Button
                            title="Continue"
                            variant="primary"
                            size="lg"
                            fullWidth
                            gradient
                            onPress={handleContinue}
                            disabled={!revealMode}
                        />
                    </View>
                </View>
            </MainScreen>
        </ErrorBoundary>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.surface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.xl,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.backgroundLight,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: BorderRadius.md,
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        ...Typography.heading3,
        color: colors.textPrimary,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.xxl,
        paddingBottom: vh(120),
    },
    stepTitle: {
        ...Typography.heading1,
        fontWeight: '800',
        color: colors.gray800,
        marginBottom: vh(8),
    },
    stepSubtitle: {
        ...Typography.body,
        color: colors.textSecondary,
        marginBottom: vh(24),
    },

    // Reward choice cards — exact copy from GiftFlowScreen
    rewardChoice: {
        backgroundColor: colors.white,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        borderWidth: 2,
        borderColor: colors.border,
        marginBottom: vh(10),
    },
    rewardChoiceActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primarySurface,
    },
    rewardChoiceHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    rewardChoiceTitle: {
        ...Typography.subheading,
        color: colors.gray800,
        marginBottom: Spacing.xxs,
    },
    rewardChoiceTitleActive: {
        color: colors.primary,
    },
    rewardChoiceDesc: {
        ...Typography.caption,
        color: colors.textSecondary,
        lineHeight: 18,
    },
    rewardChoiceCheck: {
        width: 24,
        height: 24,
        borderRadius: BorderRadius.md,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    revealBadge: {
        alignSelf: 'flex-start',
        backgroundColor: colors.categoryAmber + '20',
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xxs,
        marginTop: Spacing.xs,
    },
    revealBadgeText: {
        ...Typography.tiny,
        color: colors.categoryAmber,
        fontWeight: '700',
    },

    // Footer
    footer: {
        paddingHorizontal: Spacing.xl,
        paddingBottom: Platform.OS === 'ios' ? vh(34) : vh(18),
        paddingTop: Spacing.lg,
        backgroundColor: colors.white,
        borderTopWidth: 1,
        marginBottom: FOOTER_HEIGHT,
        borderTopColor: colors.backgroundLight,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 8,
    },
});

export default MysteryChoiceScreen;
