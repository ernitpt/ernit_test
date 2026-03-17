import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Animated } from 'react-native';
import { Send } from 'lucide-react-native';
import type { FeedPost as FeedPostType } from '../../types';
import { Colors, Typography, Spacing, BorderRadius, Shadows, Animations } from '../../config';

interface FeedPostEmpowerActionsProps {
    post: FeedPostType;
    currentUserId?: string;
    canMotivate: boolean;
    goalHasGift?: boolean;
    onEmpower: () => void;
    onMotivate: () => void;
}

const FeedPostEmpowerActions: React.FC<FeedPostEmpowerActionsProps> = ({
    post,
    currentUserId,
    canMotivate,
    goalHasGift,
    onEmpower,
    onMotivate,
}) => {
    const empowerScale = useRef(new Animated.Value(1)).current;
    const motivateScale = useRef(new Animated.Value(1)).current;

    const handleEmpowerPressIn = () => {
        Animated.spring(empowerScale, { toValue: 0.97, ...Animations.springs.bouncy, useNativeDriver: true }).start();
    };
    const handleEmpowerPressOut = () => {
        Animated.spring(empowerScale, { toValue: 1, ...Animations.springs.bouncy, useNativeDriver: true }).start();
    };
    const handleMotivatePressIn = () => {
        Animated.spring(motivateScale, { toValue: 0.97, ...Animations.springs.bouncy, useNativeDriver: true }).start();
    };
    const handleMotivatePressOut = () => {
        Animated.spring(motivateScale, { toValue: 1, ...Animations.springs.bouncy, useNativeDriver: true }).start();
    };

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
                            <Text style={styles.experiencePreviewCtaText}>Gift</Text>
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
                            Loves {post.preferredRewardCategory.charAt(0).toUpperCase() + post.preferredRewardCategory.slice(1)} experiences
                        </Text>
                    </View>
                    <View style={styles.experiencePreviewCta}>
                        <Text style={styles.experiencePreviewCtaText}>Gift</Text>
                    </View>
                </TouchableOpacity>
            )}

            {/* Free Goal: Empower Button */}
            {post.isFreeGoal && post.userId !== currentUserId && !goalHasGift && (post.pledgedExperienceId || post.preferredRewardCategory) && !(
                (post.type === 'session_progress' || post.type === 'goal_completed') &&
                post.experienceTitle && !post.isMystery
            ) && !(
                (post.type === 'session_progress' || post.type === 'goal_completed') &&
                post.preferredRewardCategory && !post.pledgedExperienceId
            ) && (
                <View style={styles.freeGoalActions}>
                    <Animated.View style={[{ flex: 1, transform: [{ scale: empowerScale }] }]}>
                        <TouchableOpacity
                            style={styles.empowerButton}
                            onPress={onEmpower}
                            onPressIn={handleEmpowerPressIn}
                            onPressOut={handleEmpowerPressOut}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={`Empower ${post.userName} with this experience`}
                        >
                            <Image
                                source={require('../../assets/favicon.png')}
                                style={styles.empowerButtonLogo}
                            />
                            <Text style={styles.empowerButtonText}>Empower</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            )}

            {/* Motivate Button — all goals (only latest session, not completed) */}
            {canMotivate && (
                <View style={styles.motivateActions}>
                    <Animated.View style={[{ flex: 1, transform: [{ scale: motivateScale }] }]}>
                        <TouchableOpacity
                            style={styles.motivateButton}
                            onPress={onMotivate}
                            onPressIn={handleMotivatePressIn}
                            onPressOut={handleMotivatePressOut}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={`Send motivation message to ${post.userName}`}
                        >
                            <Send color={Colors.primary} size={16} />
                            <Text style={styles.motivateButtonText}>Motivate</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            )}
        </>
    );
};

const styles = StyleSheet.create({
    freeGoalActions: {
        flexDirection: 'row',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        marginTop: Spacing.xs,
        marginBottom: Spacing.md,
    },
    motivateActions: {
        paddingHorizontal: Spacing.lg,
        marginTop: Spacing.xs,
        marginBottom: Spacing.md,
    },
    empowerButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.primary,
        ...Shadows.colored(Colors.primary),
    },
    empowerButtonLogo: {
        width: 18,
        height: 18,
        borderRadius: BorderRadius.xs,
    },
    empowerButtonText: {
        ...Typography.small,
        fontWeight: '600',
        color: Colors.white,
    },
    motivateButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.primarySurface,
        borderWidth: 1,
        borderColor: Colors.primaryTint,
    },
    motivateButtonText: {
        ...Typography.small,
        fontWeight: '600',
        color: Colors.primary,
    },
    experiencePreviewCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primarySurface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.xs,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: Colors.primaryTint,
        ...Shadows.sm,
    },
    experiencePreviewImage: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.border,
    },
    experiencePreviewInfo: {
        flex: 1,
        marginLeft: Spacing.md,
    },
    experiencePreviewTitle: {
        ...Typography.caption,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    experiencePreviewPrice: {
        ...Typography.caption,
        fontWeight: '800',
        color: Colors.primary,
        marginTop: Spacing.xxs,
    },
    experiencePreviewCta: {
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
    },
    experiencePreviewCtaText: {
        color: Colors.white,
        ...Typography.caption,
        fontWeight: '700',
    },
    categoryHintCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.xs,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadows.sm,
    },
    categoryHintEmoji: {
        fontSize: 24,
        marginRight: Spacing.md,
    },
    categoryHintInfo: {
        flex: 1,
    },
    categoryHintText: {
        ...Typography.caption,
        fontWeight: '600',
        color: Colors.gray700,
    },
});

export default React.memo(FeedPostEmpowerActions);
