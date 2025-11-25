import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Easing,
} from 'react-native';
import type { ReactionType } from '../types';

interface ReactionPickerProps {
    visible: boolean;
    onSelect: (type: ReactionType) => void;
    userReaction: ReactionType | null;
}

const REACTIONS: { type: ReactionType; emoji: string }[] = [
    { type: 'like', emoji: '👍' },
    { type: 'heart', emoji: '❤️' },
    { type: 'muscle', emoji: '💪' },
];

const ReactionPicker: React.FC<ReactionPickerProps> = ({
    visible,
    onSelect,
    userReaction,
}) => {
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 150,
                    friction: 7,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 150,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(scaleAnim, {
                    toValue: 0,
                    duration: 100,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 0,
                    duration: 100,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible]);

    if (!visible) return null;

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    opacity: opacityAnim,
                    transform: [{ scale: scaleAnim }],
                },
            ]}
        >
            {REACTIONS.map((reaction, index) => {
                const isSelected = userReaction === reaction.type;
                const delay = index * 30;

                return (
                    <TouchableOpacity
                        key={reaction.type}
                        style={[
                            styles.reactionButton,
                            isSelected && styles.selectedReaction,
                        ]}
                        onPress={() => onSelect(reaction.type)}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                    </TouchableOpacity>
                );
            })}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        flexDirection: 'row',
        backgroundColor: '#ffffff',
        borderRadius: 30,
        paddingHorizontal: 8,
        paddingVertical: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
        gap: 4,
    },
    reactionButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
    },
    selectedReaction: {
        backgroundColor: '#e0e7ff',
        transform: [{ scale: 1.1 }],
    },
    reactionEmoji: {
        fontSize: 24,
    },
});

export default ReactionPicker;
