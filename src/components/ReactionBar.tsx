import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ReactionType } from '../types';

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
    const reactions = [
        { type: 'muscle' as ReactionType, emoji: '💪', count: reactionCounts.muscle },
        { type: 'heart' as ReactionType, emoji: '❤️', count: reactionCounts.heart },
        { type: 'like' as ReactionType, emoji: '👍', count: reactionCounts.like },
    ];

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
                        onPress={() => onReact(reaction.type)}
                        activeOpacity={0.7}
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

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        gap: 8,
        paddingVertical: 8,
    },
    reactionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: '#f3f4f6',
        gap: 4,
    },
    reactionButtonActive: {
        backgroundColor: '#ede9fe',
        borderWidth: 1,
        borderColor: '#8b5cf6',
    },
    emoji: {
        fontSize: 18,
    },
    count: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6b7280',
    },
    countActive: {
        color: '#8b5cf6',
    },
});

export default ReactionBar;
