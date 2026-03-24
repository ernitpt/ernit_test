import React, { useState, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Image,
    Platform,
} from 'react-native';
import { SmilePlus } from 'lucide-react-native';
import type { ReactionType } from '../types';
import ReactionPicker from './ReactionPicker';
import { Colors, useColors, BorderRadius } from '../config';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';

let Haptics: typeof import('expo-haptics') | null = null;
if (Platform.OS !== 'web') {
    import('expo-haptics').then(mod => { Haptics = mod; }).catch(() => {});
}

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

const REACTION_IMAGES: Record<ReactionType, ReturnType<typeof require>> = {
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
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [showPicker, setShowPicker] = useState(false);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    // Individual animation values for each reaction type
    const likeAnim = useRef(new Animated.Value(0)).current;
    const heartAnim = useRef(new Animated.Value(1)).current;
    const muscleAnim = useRef(new Animated.Value(0)).current;

    const activeReactions = useMemo(() =>
        (Object.keys(reactionCounts) as ReactionType[])
            .filter((type) => reactionCounts[type] > 0)
            .sort((a, b) => {
                if (a === userReaction) return -1;
                if (b === userReaction) return 1;
                return reactionCounts[b] - reactionCounts[a];
            }),
        [reactionCounts, userReaction]
    );

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

        // Haptic feedback on reaction
        if (Platform.OS !== 'web' && Haptics) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

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
                        accessibilityRole="button"
                        accessibilityLabel="React to this post"
                        accessibilityHint="Opens reaction picker"
                    >
                        <SmilePlus
                            color={(showPicker || userReaction) ? colors.secondary : colors.textSecondary}
                            size={18}
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
                                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${reactionCounts[type]} ${type} reactions`}
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

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    container: {
        paddingVertical: Spacing.xs,
        position: 'relative',
    },
    pickerBackdrop: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1,
    },
    reactionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    reactButton: {
        width: 36,
        height: 36,
        borderRadius: BorderRadius.circle,
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    reactButtonActive: {
        backgroundColor: colors.primaryTint,
    },
    countsContainer: {
        flexDirection: 'row',
        gap: Spacing.xs,
        flexWrap: 'wrap',
    },
    reactionCount: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.backgroundLight,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.pill,
        gap: Spacing.xs,
    },
    userReactionCount: {
        backgroundColor: colors.primaryTint,
        borderWidth: 1,
        borderColor: colors.secondary,
    },
    reactionImage: {
        width: 22,
        height: 22,
    },
    countText: {
        ...Typography.caption,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    userCountText: {
        color: colors.secondary,
    },
});

export default CompactReactionBar;
