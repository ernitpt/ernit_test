import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import type { ReactionType } from '../types';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import * as Haptics from 'expo-haptics';

interface ReactionBarProps {
    reactionCounts: {
        muscle: number;
        heart: number;
        like: number;
    };
    userReaction?: ReactionType | null;
    onReact: (type: ReactionType) => void;
}

const ReactionBar: React.FC<ReactionBarProps> = ({
    reactionCounts,
    userReaction,
    onReact,
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const reactions = [
        { type: 'muscle' as ReactionType, emoji: '💪', count: reactionCounts.muscle },
        { type: 'heart' as ReactionType, emoji: '❤️', count: reactionCounts.heart },
        { type: 'like' as ReactionType, emoji: '👍', count: reactionCounts.like },
    ];

    const handleReact = (type: ReactionType) => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onReact(type);
    };

    return (
        <View style={styles.container}>
            {reactions.map((reaction) => {
                const isActive = userReaction === reaction.type;
                return (
                    <TouchableOpacity
                        key={reaction.type}
                        style={[
                            styles.reactionButton,
                            isActive && styles.reactionButtonActive,
                        ]}
                        onPress={() => handleReact(reaction.type)}
                        activeOpacity={0.7}
                        accessibilityLabel={`React with ${reaction.type}`}
                        accessibilityHint="Double tap to react"
                    >
                        <Text style={styles.emoji}>{reaction.emoji}</Text>
                        {reaction.count > 0 && (
                            <Text style={[styles.count, isActive && styles.countActive]}>
                                {reaction.count}
                            </Text>
                        )}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    container: {
        flexDirection: 'row',
        gap: Spacing.sm,
        paddingVertical: Spacing.sm,
    },
    reactionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.circle,
        backgroundColor: colors.backgroundLight,
        gap: Spacing.xs,
        minHeight: 44,
        justifyContent: 'center',
    },
    reactionButtonActive: {
        backgroundColor: colors.primarySurface,
        borderWidth: 1,
        borderColor: colors.secondary,
    },
    emoji: {
        fontSize: Typography.heading3.fontSize,
    },
    count: {
        ...Typography.small,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    countActive: {
        color: colors.secondary,
    },
});

export default ReactionBar;
