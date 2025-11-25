import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
} from 'react-native';
import { SmilePlus } from 'lucide-react-native';
import type { ReactionType } from '../types';
import ReactionPicker from './ReactionPicker';

interface CompactReactionBarProps {
    reactionCounts: {
        muscle: number;
        heart: number;
        like: number;
    };
    userReaction: ReactionType | null;
    onReact: (type: ReactionType) => void;
}

const REACTION_EMOJIS: Record<ReactionType, string> = {
    like: '👍',
    heart: '❤️',
    muscle: '💪',
};

const CompactReactionBar: React.FC<CompactReactionBarProps> = ({
    reactionCounts,
    userReaction,
    onReact,
}) => {
    const [showPicker, setShowPicker] = useState(false);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const activeReactions = (Object.keys(reactionCounts) as ReactionType[])
        .filter((type) => reactionCounts[type] > 0)
        .sort((a, b) => {
            if (a === userReaction) return -1;
            if (b === userReaction) return 1;
            return reactionCounts[b] - reactionCounts[a];
        });

    const handleTogglePicker = () => {
        Animated.sequence([
            Animated.spring(scaleAnim, {
                toValue: 0.95,
                friction: 3,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 3,
                useNativeDriver: true,
            }),
        ]).start();

        setShowPicker(!showPicker);
    };

    const handleSelectReaction = (type: ReactionType) => {
        setShowPicker(false);
        onReact(type);

        Animated.sequence([
            Animated.spring(scaleAnim, {
                toValue: 1.2,
                friction: 3,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 3,
                useNativeDriver: true,
            }),
        ]).start();
    };

    const handleDismiss = () => {
        setShowPicker(false);
    };

    return (
        <View style={styles.container}>
            {showPicker && (
                <TouchableOpacity
                    style={styles.pickerBackdrop}
                    activeOpacity={1}
                    onPress={handleDismiss}
                />
            )}

            <View style={styles.reactionsRow}>
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                    <TouchableOpacity
                        style={[
                            styles.reactButton,
                            (userReaction || showPicker) && styles.reactButtonActive,
                        ]}
                        onPress={handleTogglePicker}
                        activeOpacity={0.8}
                    >
                        <SmilePlus
                            color={(showPicker || userReaction) ? "#8b5cf6" : "#6b7280"}
                            size={20}
                        />
                    </TouchableOpacity>
                </Animated.View>

                {activeReactions.length > 0 && (
                    <View style={styles.countsContainer}>
                        {activeReactions.map((type) => (
                            <View
                                key={type}
                                style={[
                                    styles.reactionCount,
                                    type === userReaction && styles.userReactionCount,
                                ]}
                            >
                                <Text style={styles.reactionEmoji}>{REACTION_EMOJIS[type]}</Text>
                                <Text
                                    style={[
                                        styles.countText,
                                        type === userReaction && styles.userCountText,
                                    ]}
                                >
                                    {reactionCounts[type]}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>

            <ReactionPicker
                visible={showPicker}
                onSelect={handleSelectReaction}
                userReaction={userReaction}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: 8,
        position: 'relative',
    },
    pickerBackdrop: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1,
    },
    reactionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    reactButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#f3f4f6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    reactButtonActive: {
        backgroundColor: '#e0e7ff',
    },
    countsContainer: {
        flexDirection: 'row',
        gap: 6,
        flexWrap: 'wrap',
    },
    reactionCount: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    userReactionCount: {
        backgroundColor: '#e0e7ff',
        borderWidth: 1,
        borderColor: '#8b5cf6',
    },
    reactionEmoji: {
        fontSize: 14,
    },
    countText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#6b7280',
    },
    userCountText: {
        color: '#8b5cf6',
    },
});

export default CompactReactionBar;
