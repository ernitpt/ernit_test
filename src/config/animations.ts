/**
 * Ernit App — Animation Tokens
 *
 * Centralized animation durations, spring configs, and easing presets.
 * Usage:  import { Animations } from '../config';
 *         Animated.spring(value, Animations.springs.gentle)
 */

import { Easing } from 'react-native';

export const Animations = {
    // ─── Durations (ms) ─────────────────────────────────────────────────
    durations: {
        fast: 200,
        normal: 300,
        slow: 500,
    },

    // ─── Spring configs (for Animated.spring) ───────────────────────────
    springs: {
        /** Smooth, subtle — cards, modals, fade-ins */
        gentle: {
            damping: 20,
            stiffness: 120,
            mass: 1,
            useNativeDriver: true,
        },
        /** Lively — button presses, toggles */
        bouncy: {
            damping: 12,
            stiffness: 180,
            mass: 0.8,
            useNativeDriver: true,
        },
        /** Quick, decisive — snackbars, tooltips */
        snappy: {
            damping: 18,
            stiffness: 300,
            mass: 0.6,
            useNativeDriver: true,
        },
    },

    // ─── Easing presets (for Animated.timing) ───────────────────────────
    easing: {
        /** Standard material ease — most transitions */
        standard: Easing.bezier(0.4, 0, 0.2, 1),
        /** Decelerate — elements entering the screen */
        decelerate: Easing.bezier(0, 0, 0.2, 1),
        /** Accelerate — elements leaving the screen */
        accelerate: Easing.bezier(0.4, 0, 1, 1),
    },
} as const;

export default Animations;
