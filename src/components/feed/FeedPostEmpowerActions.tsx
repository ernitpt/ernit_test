import React, { useRef, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Gift, Heart } from 'lucide-react-native';
import type { FeedPost as FeedPostType } from '../../types';
import { Colors, useColors, Typography, Spacing, BorderRadius, Shadows, Animations } from '../../config';

interface FeedPostEmpowerActionsProps {
    post: FeedPostType;
    currentUserId?: string;
    canMotivate: boolean;
    alreadySent?: boolean;
    goalHasGift?: boolean;
    onEmpower: () => void;
    onMotivate: () => void;
}

const FeedPostEmpowerActions: React.FC<FeedPostEmpowerActionsProps> = ({
    post,
    currentUserId,
    canMotivate,
    alreadySent = false,
    goalHasGift,
    onEmpower,
    onMotivate,
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const empowerScale = useRef(new Animated.Value(1)).current;
    const motivateScale = useRef(new Animated.Value(1)).current;

    const handleEmpowerPressIn = useCallback(() => {
        Animated.spring(empowerScale, { toValue: 0.97, ...Animations.springs.bouncy, useNativeDriver: true }).start();
    }, [empowerScale]);
    const handleEmpowerPressOut = useCallback(() => {
        Animated.spring(empowerScale, { toValue: 1, ...Animations.springs.bouncy, useNativeDriver: true }).start();
    }, [empowerScale]);
    const handleMotivatePressIn = useCallback(() => {
        Animated.spring(motivateScale, { toValue: 0.97, ...Animations.springs.bouncy, useNativeDriver: true }).start();
    }, [motivateScale]);
    const handleMotivatePressOut = useCallback(() => {
        Animated.spring(motivateScale, { toValue: 1, ...Animations.springs.bouncy, useNativeDriver: true }).start();
    }, [motivateScale]);

    return (
        <>
            {/* Free Goal: Experience Card Preview (milestone/completion posts) */}
            {post.isFreeGoal && post.pledgedExperienceId && post.userId !== currentUserId &&
                !goalHasGift &&
                (post.type === 'session_progress' || post.type === 'goal_completed') &&
                post.experienceTitle && !post.isMystery && (
                    <TouchableOpacity style={styles.experiencePreviewCard} onPress={onEmpower} activeOpacity={0.85}>
                        {post.experienceImageUrl && (
                            <Image
                                source={{ uri: post.experienceImageUrl }}
                                style={styles.experiencePreviewImage}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                accessibilityLabel={`${post.experienceTitle} experience`}
                            />
                        )}
                        <View style={styles.experiencePreviewInfo}>
                            <Text style={styles.experiencePreviewTitle} numberOfLines={1}>{post.experienceTitle}</Text>
                            {post.pledgedExperiencePrice && (
                                <Text style={styles.experiencePreviewPrice}>{'\u20AC'}{post.pledgedExperiencePrice}</Text>
                            )}
                        </View>
                        <View style={styles.experiencePreviewCta}>
                            <Text style={styles.experiencePreviewCtaText}>{t('feed.empowerActions.gift')}</Text>
                        </View>
                    </TouchableOpacity>
                )}

            {/* Free Goal: Category Hint Card (no pledged experience, but has category preference) */}
            {post.isFreeGoal && !post.pledgedExperienceId && post.preferredRewardCategory &&
                post.userId !== currentUserId && !goalHasGift &&
                (post.type === 'session_progress' || post.type === 'goal_completed') && (
                <TouchableOpacity style={styles.categoryHintCard} onPress={onEmpower} activeOpacity={0.85}>
                    <Text style={styles.categoryHintEmoji}>
                        {post.preferredRewardCategory === 'adventure' ? '🏔️' : post.preferredRewardCategory === 'wellness' ? '🧘' : '🎨'}
                    </Text>
                    <View style={styles.categoryHintInfo}>
                        <Text style={styles.categoryHintText}>
                            {t('feed.empowerActions.lovesCategory', { category: post.preferredRewardCategory.charAt(0).toUpperCase() + post.preferredRewardCategory.slice(1) })}
                        </Text>
                    </View>
                    <View style={styles.experiencePreviewCta}>
                        <Text style={styles.experiencePreviewCtaText}>{t('feed.empowerActions.gift')}</Text>
                    </View>
                </TouchableOpacity>
            )}

            {/* Action Buttons: Empower + Motivate in a single row */}
            {(() => {
                const showEmpower = post.isFreeGoal && post.userId !== currentUserId && !goalHasGift
                    && (post.pledgedExperienceId || post.preferredRewardCategory)
                    && !((post.type === 'session_progress' || post.type === 'goal_completed') && post.experienceTitle && !post.isMystery)
                    && !((post.type === 'session_progress' || post.type === 'goal_completed') && post.preferredRewardCategory && !post.pledgedExperienceId);

                if (!showEmpower && !canMotivate) return null;

                return (
                    <View style={styles.actionRow}>
                        {showEmpower && (
                            <Animated.View style={[{ flex: 1, transform: [{ scale: empowerScale }] }]}>
                                <TouchableOpacity
                                    style={styles.empowerButton}
                                    onPress={onEmpower}
                                    onPressIn={handleEmpowerPressIn}
                                    onPressOut={handleEmpowerPressOut}
                                    activeOpacity={0.8}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('feed.empowerActions.empowerA11y', { name: post.userName })}
                                >
                                    <Gift color={colors.white} size={16} />
                                    <Text style={styles.empowerButtonText}>{t('feed.empowerActions.empower')}</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        )}
                        {canMotivate && (
                            alreadySent ? (
                                <View style={[styles.motivateButton, styles.motivateButtonDisabled, { flex: 1 }]}>
                                    <Heart color={colors.textMuted} size={16} />
                                    <Text style={[styles.motivateButtonText, styles.motivateButtonTextDisabled]}>
                                        {t('feed.empowerActions.motivationSent')}
                                    </Text>
                                </View>
                            ) : (
                                <Animated.View style={[{ flex: 1, transform: [{ scale: motivateScale }] }]}>
                                    <TouchableOpacity
                                        style={styles.motivateButton}
                                        onPress={onMotivate}
                                        onPressIn={handleMotivatePressIn}
                                        onPressOut={handleMotivatePressOut}
                                        activeOpacity={0.8}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('feed.empowerActions.motivateA11y', { name: post.userName })}
                                    >
                                        <Heart color={colors.primary} size={16} />
                                        <Text style={styles.motivateButtonText}>{t('feed.empowerActions.motivate')}</Text>
                                    </TouchableOpacity>
                                </Animated.View>
                            )
                        )}
                    </View>
                );
            })()}
        </>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    actionRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.md,
        marginTop: Spacing.xs,
        marginBottom: Spacing.sm,
    },
    empowerButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.xs,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.primary,
    },
    empowerButtonLogo: {
        width: 18,
        height: 18,
        borderRadius: BorderRadius.xs,
    },
    empowerButtonText: {
        ...Typography.smallBold,
        color: colors.white,
    },
    motivateButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.xs,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.primarySurface,
        borderWidth: 1,
        borderColor: colors.primaryBorder,
    },
    motivateButtonText: {
        ...Typography.smallBold,
        color: colors.primary,
    },
    motivateButtonDisabled: {
        backgroundColor: colors.backgroundLight,
        borderColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.xs,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
    },
    motivateButtonTextDisabled: {
        color: colors.textMuted,
    },
    experiencePreviewCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.primarySurface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.xs,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: colors.primaryTint,
        ...Shadows.sm,
    },
    experiencePreviewImage: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.border,
    },
    experiencePreviewInfo: {
        flex: 1,
        marginLeft: Spacing.md,
    },
    experiencePreviewTitle: {
        ...Typography.caption,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    experiencePreviewPrice: {
        ...Typography.caption,
        fontWeight: '800',
        color: colors.primary,
        marginTop: Spacing.xxs,
    },
    experiencePreviewCta: {
        backgroundColor: colors.primary,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
    },
    experiencePreviewCtaText: {
        color: colors.white,
        ...Typography.caption,
        fontWeight: '700',
    },
    categoryHintCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.xs,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
        ...Shadows.sm,
    },
    categoryHintEmoji: {
        fontSize: Typography.emojiSmall.fontSize,
        marginRight: Spacing.md,
    },
    categoryHintInfo: {
        flex: 1,
    },
    categoryHintText: {
        ...Typography.caption,
        fontWeight: '600',
        color: colors.gray700,
    },
});

export default React.memo(FeedPostEmpowerActions);
