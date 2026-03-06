/**
 * Ernit App — Shadow Tokens
 *
 * Platform-aware shadow presets (iOS shadowXxx + Android elevation).
 * Usage:  import { Shadows } from '../config';
 *         style={{ ...Shadows.md }}
 */

import { ViewStyle } from 'react-native';

export const Shadows: {
    sm: ViewStyle;
    md: ViewStyle;
    lg: ViewStyle;
    colored: (color: string) => ViewStyle;
} = {
    /** Subtle — cards, list items */
    sm: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },

    /** Medium — modals, popovers, floating elements */
    md: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },

    /** Heavy — FABs, prominent CTAs */
    lg: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
    },

    /** Brand-colored glow — primary-action buttons */
    colored: (color: string): ViewStyle => ({
        shadowColor: color,
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    }),
};

export default Shadows;
