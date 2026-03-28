import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Easing,
    Image,
    ImageSourcePropType,
} from 'react-native';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import type { ReactionType } from '../types';

interface ReactionPickerProps {
    visible: boolean;
    onSelect: (type: ReactionType) => void;
    userReaction: ReactionType | null;
}

const REACTIONS: { type: ReactionType; image: ImageSourcePropType }[] = [
    { type: 'like', image: require('../assets/reactions/like.png') },
    { type: 'heart', image: require('../assets/reactions/heart.png') },
    { type: 'muscle', image: require('../assets/reactions/muscle.png') },
];

const ReactionPicker: React.FC<ReactionPickerProps> = ({
    visible,
    onSelect,
    userReaction,
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    // Keep component mounted during exit animation
    const [shouldRender, setShouldRender] = useState(visible);

    const scaleAnim = useRef(new Animated.Value(0)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const buttonScaleAnims = useRef(
        REACTIONS.map(() => new Animated.Value(1))
    ).current;

    useEffect(() => {
        if (visible) {
            setShouldRender(true);
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
        } else if (shouldRender) {
            Animated.parallel([
                Animated.timing(scaleAnim, {
                    toValue: 0.85,
                    duration: 150,
                    easing: Easing.in(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 0,
                    duration: 150,
                    easing: Easing.in(Easing.ease),
                    useNativeDriver: true,
                }),
            ]).start(() => {
                setShouldRender(false);
            });
        }
    }, [visible]);

    const handlePress = (type: ReactionType, index: number) => {
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

    if (!shouldRender) return null;

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
                            accessibilityLabel={`Select ${reaction.type} reaction`}
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

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        container: {
            position: 'absolute',
            bottom: 40,
            left: 0,
            flexDirection: 'row',
            backgroundColor: colors.white,
            borderRadius: BorderRadius.pill,
            paddingHorizontal: Spacing.sm,
            paddingVertical: Spacing.xs,
            shadowColor: colors.black,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
            gap: Spacing.xs,
        },
        reactionButton: {
            width: 48,
            height: 48,
            borderRadius: BorderRadius.circle,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.backgroundLight,
        },
        selectedReaction: {
            backgroundColor: colors.primaryTint,
            transform: [{ scale: 1.1 }],
        },
        reactionImage: {
            width: 32,
            height: 32,
        },
    });

export default React.memo(ReactionPicker);
