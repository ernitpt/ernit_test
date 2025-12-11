import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Image,
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
    onViewReactions?: () => void;
}

const REACTION_IMAGES: Record<ReactionType, any> = {
    like: require('../assets/reactions/like.png'),
    heart: require('../assets/reactions/heart.png'),
    muscle: require('../assets/reactions/muscle.png'),
};


const CompactReactionBar: React.FC<CompactReactionBarProps> = ({
    reactionCounts,
    userReaction,
    onReact,
    onViewReactions,
}) => {
    const [showPicker, setShowPicker] = useState(false);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    // Individual animation values for each reaction type
    const likeAnim = useRef(new Animated.Value(0)).current;
    const heartAnim = useRef(new Animated.Value(1)).current;
    const muscleAnim = useRef(new Animated.Value(0)).current;

    const activeReactions = (Object.keys(reactionCounts) as ReactionType[])
        .filter((type) => reactionCounts[type] > 0)
        .sort((a, b) => {
            if (a === userReaction) return -1;
            if (b === userReaction) return 1;
            return reactionCounts[b] - reactionCounts[a];
        });

    const animateReaction = (type: ReactionType) => {
        switch (type) {
            case 'like':
                // Bounce up animation (thumbs up gesture)
                Animated.sequence([
                    Animated.timing(likeAnim, {
                        toValue: -5,
                        duration: 150,
                        useNativeDriver: true,
                    }),
                    Animated.timing(likeAnim, {
                        toValue: 0,
                        duration: 200,
                        useNativeDriver: true,
                    }),
                ]).start();
                break;

            case 'heart':
                // Heartbeat pulse animation
                Animated.sequence([
                    Animated.spring(heartAnim, {
                        toValue: 1.4,
                        tension: 180,
                        friction: 3,
                        useNativeDriver: true,
                    }),
                    Animated.spring(heartAnim, {
                        toValue: 1.15,
                        tension: 180,
                        friction: 3,
                        useNativeDriver: true,
                    }),
                    Animated.spring(heartAnim, {
                        toValue: 1.3,
                        tension: 180,
                        friction: 3,
                        useNativeDriver: true,
                    }),
                    Animated.spring(heartAnim, {
                        toValue: 1,
                        tension: 120,
                        friction: 5,
                        useNativeDriver: true,
                    }),
                ]).start();
                break;

            case 'muscle':
                // Flex shake animation (left-right wiggle)
                Animated.sequence([
                    Animated.timing(muscleAnim, {
                        toValue: 12,
                        duration: 80,
                        useNativeDriver: true,
                    }),
                    Animated.timing(muscleAnim, {
                        toValue: -12,
                        duration: 80,
                        useNativeDriver: true,
                    }),
                    Animated.timing(muscleAnim, {
                        toValue: 8,
                        duration: 80,
                        useNativeDriver: true,
                    }),
                    Animated.timing(muscleAnim, {
                        toValue: 0,
                        duration: 80,
                        useNativeDriver: true,
                    }),
                ]).start();
                break;
        }
    };

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

        // Trigger theme-specific animation for the selected reaction
        animateReaction(type);

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
                        {activeReactions.map((type) => {
                            // Get the appropriate animation transform for each reaction type
                            const getAnimatedStyle = () => {
                                switch (type) {
                                    case 'like':
                                        return { transform: [{ translateY: likeAnim }] };
                                    case 'heart':
                                        return { transform: [{ scale: heartAnim }] };
                                    case 'muscle':
                                        return {
                                            transform: [{
                                                rotate: muscleAnim.interpolate({
                                                    inputRange: [-12, 12],
                                                    outputRange: ['-12deg', '12deg'],
                                                })
                                            }]
                                        };
                                    default:
                                        return {};
                                }
                            };

                            return (
                                <TouchableOpacity
                                    key={type}
                                    style={[
                                        styles.reactionCount,
                                        type === userReaction && styles.userReactionCount,
                                    ]}
                                    onPress={onViewReactions}
                                    activeOpacity={0.7}
                                >
                                    <Animated.Image
                                        source={REACTION_IMAGES[type]}
                                        style={[styles.reactionImage, getAnimatedStyle()]}
                                        resizeMode="contain"
                                    />
                                    <Text
                                        style={[
                                            styles.countText,
                                            type === userReaction && styles.userCountText,
                                        ]}
                                    >
                                        {reactionCounts[type]}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
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
        borderRadius: 2,
        gap: 4,
    },
    userReactionCount: {
        backgroundColor: '#e0e7ff',
        borderWidth: 1,
        borderColor: '#8b5cf6',
    },
    reactionImage: {
        width: 28,
        height: 28,
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
