import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Trophy, Clock, Calendar, CheckCircle2 } from 'lucide-react-native';
import { MotiView } from 'moti';
import type { Goal } from '../../types';
import Colors from '../../config/colors';
import { useRecipientNavigation } from '../../types/navigation';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { useApp } from '../../context/AppContext';

interface CompletedGoalCardProps {
    goal: Goal;
    index?: number;
}

const CompletedGoalCard: React.FC<CompletedGoalCardProps> = ({ goal, index = 0 }) => {
    const navigation = useRecipientNavigation();
    const { state } = useApp();

    const totalSessions = goal.targetCount * goal.sessionsPerWeek;
    const hasPledgedExperience = !!goal.pledgedExperience;
    const hasExperienceGift = !!goal.experienceGiftId && !goal.isFreeGoal;
    const isSelfAchievement = goal.isFreeGoal && !hasPledgedExperience;

    const handlePress = () => {
        navigation.navigate('Journey', { goal });
    };

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
                                <CheckCircle2 size={12} color={Colors.primary} />
                                <Text style={styles.completedBadgeText}>Completed</Text>
                            </View>
                        </View>
                        <View style={styles.trophyCircle}>
                            <Trophy size={16} color={Colors.primary} />
                        </View>
                    </View>

                    {/* Stats row */}
                    <View style={styles.statsRow}>
                        <View style={styles.stat}>
                            <Calendar size={13} color={Colors.textSecondary} />
                            <Text style={styles.statText}>
                                {goal.targetCount} {goal.targetCount === 1 ? 'week' : 'weeks'}
                            </Text>
                        </View>
                        <View style={styles.statDot} />
                        <View style={styles.stat}>
                            <Clock size={13} color={Colors.textSecondary} />
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

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        backgroundColor: Colors.white,
        borderRadius: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: Colors.primaryBorder,
        overflow: 'hidden',
        shadowColor: Colors.textPrimary,
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    accentBar: {
        width: 4,
        backgroundColor: Colors.primary,
    },
    content: {
        flex: 1,
        padding: 14,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    titleArea: {
        flex: 1,
        marginRight: 10,
    },
    title: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    completedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    completedBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.primary,
    },
    trophyCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: Colors.primarySurface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    stat: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    statText: {
        fontSize: 13,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    statDot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: Colors.textMuted,
    },
    experienceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Colors.border,
    },
    experienceThumb: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: Colors.backgroundLight,
    },
    experienceTitle: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: Colors.textSecondary,
    },
    selfBadge: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Colors.border,
    },
    selfBadgeText: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.primary,
    },
});

export default CompletedGoalCard;
