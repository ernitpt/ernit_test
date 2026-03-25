import React, { useMemo, memo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Trophy, Clock, Calendar, CheckCircle2 } from 'lucide-react-native';
import { MotiView } from 'moti';
import type { Goal } from '../../types';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { useRecipientNavigation } from '../../types/navigation';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { useApp } from '../../context/AppContext';

interface CompletedGoalCardProps {
    goal: Goal;
    index?: number;
}

const CompletedGoalCard: React.FC<CompletedGoalCardProps> = ({ goal, index = 0 }) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const navigation = useRecipientNavigation();
    const { state } = useApp();

    const totalSessions = goal.targetCount * goal.sessionsPerWeek;
    const hasPledgedExperience = !!goal.pledgedExperience;
    const hasExperienceGift = !!goal.experienceGiftId && !goal.isFreeGoal;
    const isSelfAchievement = goal.isFreeGoal && !hasPledgedExperience;

    const handlePress = useCallback(() => {
        navigation.navigate('Journey', { goal });
    }, [navigation, goal]);

    return (
        <ErrorBoundary screenName="CompletedGoalCard" userId={state.user?.id}>
            <MotiView
                from={{ opacity: 0, translateY: 10 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 300, delay: index * 60 }}
            >
                <TouchableOpacity
                    style={styles.card}
                    activeOpacity={0.7}
                    onPress={handlePress}
                    accessibilityRole="button"
                    accessibilityLabel={`View completed goal: ${goal.title}`}
                >
                {/* Left accent */}
                <View style={styles.accentBar} />

                <View style={styles.content}>
                    {/* Top row: title + badge */}
                    <View style={styles.topRow}>
                        <View style={styles.titleArea}>
                            <Text style={styles.title} numberOfLines={1}>{goal.title}</Text>
                            <View style={styles.completedBadge}>
                                <CheckCircle2 size={12} color={colors.primary} />
                                <Text style={styles.completedBadgeText}>Completed</Text>
                            </View>
                        </View>
                        <View style={styles.trophyCircle}>
                            <Trophy size={16} color={colors.primary} />
                        </View>
                    </View>

                    {/* Stats row */}
                    <View style={styles.statsRow}>
                        <View style={styles.stat}>
                            <Calendar size={13} color={colors.textSecondary} />
                            <Text style={styles.statText}>
                                {goal.targetCount} {goal.targetCount === 1 ? 'week' : 'weeks'}
                            </Text>
                        </View>
                        <View style={styles.statDot} />
                        <View style={styles.stat}>
                            <Clock size={13} color={colors.textSecondary} />
                            <Text style={styles.statText}>
                                {totalSessions} {totalSessions === 1 ? 'session' : 'sessions'}
                            </Text>
                        </View>
                    </View>

                    {/* Experience row (if applicable) */}
                    {hasPledgedExperience && goal.pledgedExperience && (
                        <View style={styles.experienceRow}>
                            {goal.pledgedExperience.coverImageUrl ? (
                                <Image
                                    source={{ uri: goal.pledgedExperience.coverImageUrl }}
                                    style={styles.experienceThumb}
                                    resizeMode="cover"
                                    accessibilityLabel={`${goal.pledgedExperience.title} thumbnail`}
                                />
                            ) : null}
                            <Text style={styles.experienceTitle} numberOfLines={1}>
                                {goal.pledgedExperience.title}
                            </Text>
                        </View>
                    )}

                    {/* Self-achievement badge (free goal, no experience) */}
                    {isSelfAchievement && (
                        <View style={styles.selfBadge}>
                            <Text style={styles.selfBadgeText}>🏆 Self-Achievement</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        </MotiView>
        </ErrorBoundary>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    card: {
        flexDirection: 'row',
        backgroundColor: colors.white,
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: colors.primaryBorder,
        overflow: 'hidden',
        shadowColor: colors.textPrimary,
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    accentBar: {
        width: 4,
        backgroundColor: colors.primary,
    },
    content: {
        flex: 1,
        padding: Spacing.md,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: Spacing.sm,
    },
    titleArea: {
        flex: 1,
        marginRight: Spacing.sm,
    },
    title: {
        ...Typography.body,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: Spacing.xs,
    },
    completedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    completedBadgeText: {
        ...Typography.caption,
        fontWeight: '600',
        color: colors.primary,
    },
    trophyCircle: {
        width: 34,
        height: 34,
        borderRadius: BorderRadius.xl,
        backgroundColor: colors.primarySurface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        marginBottom: Spacing.xs,
    },
    stat: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    statText: {
        ...Typography.caption,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    statDot: {
        width: 3,
        height: 3,
        borderRadius: BorderRadius.xs,
        backgroundColor: colors.textMuted,
    },
    experienceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginTop: Spacing.sm,
        paddingTop: Spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    experienceThumb: {
        width: 32,
        height: 32,
        borderRadius: BorderRadius.xs,
        backgroundColor: colors.backgroundLight,
    },
    experienceTitle: {
        flex: 1,
        ...Typography.caption,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    selfBadge: {
        marginTop: Spacing.sm,
        paddingTop: Spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    selfBadgeText: {
        ...Typography.caption,
        fontWeight: '600',
        color: colors.primary,
    },
});

export default memo(CompletedGoalCard);
