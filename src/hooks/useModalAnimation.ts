import { useRef, useEffect } from 'react';
import { Animated } from 'react-native';

interface UseModalAnimationConfig {
    initialValue?: number;
    toValue?: number;
    tension?: number;
    friction?: number;
    useSpring?: boolean;
    duration?: number;
}

export const useModalAnimation = (visible: boolean, config: UseModalAnimationConfig = {}) => {
    const {
        initialValue = 300,
        toValue = 0,
        tension = 70,
        friction = 11,
        useSpring = true,
        duration = 200,
    } = config;

    const anim = useRef(new Animated.Value(initialValue)).current;

    useEffect(() => {
        if (visible) {
            if (useSpring) {
                Animated.spring(anim, {
                    toValue,
                    tension,
                    friction,
                    useNativeDriver: true,
                }).start();
            } else {
                Animated.timing(anim, {
                    toValue,
                    duration,
                    useNativeDriver: true,
                }).start();
            }
        } else {
            anim.setValue(initialValue);
        }
    }, [visible, initialValue, toValue, tension, friction, useSpring, duration]);

    return anim;
};
