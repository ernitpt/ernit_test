import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Trophy, Gift } from 'lucide-react-native';
import Button from '../Button';
import type { FeedPost as FeedPostType, RootStackParamList } from '../../types';
import { Colors, useColors, Typography, Spacing, BorderRadius } from '../../config';
import { vh } from '../../utils/responsive';

interface FeedPostContentProps {
    post: FeedPostType;
    currentUserId?: string;
    goalHasGift?: boolean;
    onEmpowerContext: () => void;
    onNavigate: <S extends keyof RootStackParamList>(screen: S, params?: RootStackParamList[S]) => void;
}

const FeedPostContent: React.FC<FeedPostContentProps> = ({
    post,
    currentUserId,
    goalHasGift,
    onEmpowerContext,
    onNavigate,
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <View style={styles.content}>
            {post.type === 'session_progress' && post.sessionNumber && post.totalSessions && (
                <>
                    <View style={styles.progressBlock}>
                        <View style={styles.progressHeader}>
                            <Text style={styles.progressLabel}>Sessions this week</Text>
                            <Text style={styles.progressText}>
                                {post.weeklyCount || 0}/{post.sessionsPerWeek || 1}
                            </Text>
                        </View>
                        <View style={styles.capsuleRow}>
                            {Array.from({ length: post.sessionsPerWeek || 1 }, (_, i) => (
                                <View
                                    key={i}
                                    style={[
                                        styles.capsule,
                                        i < (post.weeklyCount || 0)
                                            ? { backgroundColor: colors.primary }
                                            : { backgroundColor: colors.border },
                                    ]}
                                />
                            ))}
                        </View>
                    </View>

                    <View style={styles.progressBlock}>
                        <View style={styles.progressHeader}>
                            <Text style={styles.progressLabel}>Weeks completed</Text>
                            <Text style={styles.progressText}>
                                {Math.floor((post.sessionNumber - (post.weeklyCount || 0)) / (post.sessionsPerWeek || 1))}/{Math.floor((post.totalSessions || 1) / (post.sessionsPerWeek || 1))}
                            </Text>
                        </View>
                        <View style={styles.capsuleRow}>
                            {Array.from({ length: Math.min(Math.floor((post.totalSessions || 1) / (post.sessionsPerWeek || 1)), 20) }, (_, i) => (
                                <View
                                    key={i}
                                    style={[
                                        styles.capsule,
                                        i < Math.floor((post.sessionNumber - (post.weeklyCount || 0)) / (post.sessionsPerWeek || 1))
                                            ? { backgroundColor: colors.secondary }
                                            : { backgroundColor: colors.border },
                                    ]}
                                />
                            ))}
                        </View>
                    </View>
                </>
            )}
            {post.type === 'goal_completed' && post.experienceTitle && !(post.isFreeGoal && !post.experienceGiftId) ? (
                <View style={styles.experienceSection}>
                    {post.isMystery ? (
                        <View style={[styles.experienceImage, styles.experienceImagePlaceholder, { backgroundColor: colors.warningLight }]}>
                            <Text style={styles.experienceImagePlaceholderText}>?</Text>
                        </View>
                    ) : post.experienceImageUrl ? (
                        <Image source={{ uri: post.experienceImageUrl }} style={styles.experienceImage} cachePolicy="memory-disk" accessible={false} />
                    ) : (
                        <View style={[styles.experienceImage, styles.experienceImagePlaceholder]}>
                            <Text style={styles.experienceImagePlaceholderText}>🎁</Text>
                        </View>
                    )}
                    <View style={styles.experienceContent}>
                        <Text style={styles.experienceTitle} numberOfLines={1}>
                            {post.isMystery ? 'Mystery Experience' : post.experienceTitle}
                        </Text>
                        {!post.isMystery && post.partnerName && (
                            <Text style={styles.partnerName} numberOfLines={1}>
                                {post.partnerName}
                            </Text>
                        )}
                        <Text style={styles.goalDescriptionText} numberOfLines={2}>
                            Goal: {post.goalDescription}
                        </Text>
                        {post.totalSessions && post.sessionsPerWeek && (
                            <Text style={styles.experienceMeta}>
                                {post.totalSessions} sessions • {Math.floor(post.totalSessions / post.sessionsPerWeek)} weeks
                            </Text>
                        )}
                    </View>
                </View>
            ) : post.type === 'goal_completed' && !post.experienceTitle ? (
                <View style={styles.achievementCard}>
                    <View style={styles.achievementIconRow}>
                        <View style={styles.achievementIcon}>
                            <Trophy size={18} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.achievementGoal} numberOfLines={2}>{post.goalDescription}</Text>
                            {post.totalSessions && post.sessionsPerWeek && (
                                <Text style={styles.achievementStats}>
                                    {post.totalSessions} sessions • {Math.floor(post.totalSessions / post.sessionsPerWeek)} weeks
                                </Text>
                            )}
                        </View>
                    </View>
                    {post.userId !== currentUserId && !post.isFreeGoal && !goalHasGift && (
                        <Button
                            title="Gift an Experience"
                            onPress={() => {
                                onEmpowerContext();
                                onNavigate('CategorySelection');
                            }}
                            variant="primary"
                            size="sm"
                            fullWidth
                            icon={<Gift size={15} color={colors.white} />}
                            style={{ marginTop: Spacing.md }}
                        />
                    )}
                </View>
            ) : post.type !== 'session_progress' ? (
                <View>
                    <Text style={styles.activityText}>
                        <Text style={styles.progressLabel}>{post.goalDescription}</Text>
                    </Text>
                </View>
            ) : null}
        </View>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    content: {
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.sm,
    },
    activityText: {
        ...Typography.body,
        lineHeight: 22,
        color: colors.gray700,
    },
    progressBlock: {
        marginBottom: Spacing.sm,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    progressLabel: {
        ...Typography.caption,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    progressText: {
        ...Typography.caption,
        color: colors.textPrimary,
        fontWeight: '600',
    },
    capsuleRow: {
        flexDirection: 'row',
        gap: Spacing.tinyGap,
    },
    capsule: {
        flex: 1,
        height: 8,
        borderRadius: BorderRadius.pill,
    },
    experienceSection: {
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors.border,
        marginTop: Spacing.sm,
    },
    experienceImage: {
        width: '100%',
        height: vh(140),
        backgroundColor: colors.border,
    },
    experienceImagePlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    experienceImagePlaceholderText: {
        fontSize: Typography.displayLarge.fontSize,
        opacity: 0.5,
    },
    experienceContent: {
        padding: Spacing.md,
    },
    experienceTitle: {
        ...Typography.subheading,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: Spacing.xs,
    },
    partnerName: {
        ...Typography.small,
        color: colors.textSecondary,
        marginBottom: Spacing.xs,
    },
    goalDescriptionText: {
        ...Typography.small,
        color: colors.textSecondary,
        marginBottom: Spacing.tinyGap,
    },
    experienceMeta: {
        ...Typography.caption,
        color: colors.textMuted,
    },
    achievementCard: {
        backgroundColor: colors.primarySurface,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        borderWidth: 1,
        borderColor: colors.primaryBorder,
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
    },
    achievementIconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    achievementIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.primaryTint,
        alignItems: 'center',
        justifyContent: 'center',
    },
    achievementGoal: {
        ...Typography.small,
        fontWeight: '600',
        color: colors.textPrimary,
        lineHeight: 20,
    },
    achievementStats: {
        ...Typography.caption,
        color: colors.textMuted,
        marginTop: Spacing.xxs,
    },
});

export default React.memo(FeedPostContent);
