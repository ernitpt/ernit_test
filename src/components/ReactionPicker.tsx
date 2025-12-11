import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Easing,
    Image,
} from 'react-native';
import type { ReactionType } from '../types';

interface ReactionPickerProps {
    visible: boolean;
    onSelect: (type: ReactionType) => void;
    userReaction: ReactionType | null;
}

const REACTIONS: { type: ReactionType; image: any }[] = [
    { type: 'like', image: require('../assets/reactions/like.png') },
    { type: 'heart', image: require('../assets/reactions/heart.png') },
    { type: 'muscle', image: require('../assets/reactions/muscle.png') },
];

const ReactionPicker: React.FC<ReactionPickerProps> = ({
    visible,
    onSelect,
    userReaction,
}) => {
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const buttonScaleAnims = useRef(
        REACTIONS.map(() => new Animated.Value(1))
    ).current;

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

    const handlePress = (type: ReactionType, index: number) => {
        // Smooth scale animation when clicking
        Animated.sequence([
            Animated.spring(buttonScaleAnims[index], {
                toValue: 1.3,
                tension: 200,
                friction: 3,
                useNativeDriver: true,
            }),
            Animated.spring(buttonScaleAnims[index], {
                toValue: 1,
                tension: 200,
                friction: 5,
                useNativeDriver: true,
            }),
        ]).start();

        onSelect(type);
    };

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

                return (
                    <Animated.View
                        key={reaction.type}
                        style={{
                            transform: [{ scale: buttonScaleAnims[index] }],
                        }}
                    >
                        <TouchableOpacity
                            style={[
                                styles.reactionButton,
                                isSelected && styles.selectedReaction,
                            ]}
                            onPress={() => handlePress(reaction.type, index)}
                            activeOpacity={0.7}
                        >
                            <Image
                                source={reaction.image}
                                style={styles.reactionImage}
                                resizeMode="contain"
                            />
                        </TouchableOpacity>
                    </Animated.View>
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
    reactionImage: {
        width: 32,
        height: 32,
    },
});

export default ReactionPicker;
