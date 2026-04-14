/**
 * Ernit App — Shadow Tokens
 *
 * Platform-aware shadow presets.
 * - iOS: shadowColor / shadowOpacity / shadowRadius / shadowOffset
 * - Android (New Arch, RN 0.81+): native boxShadow (colored, blurred, spread)
 * - Web: CSS boxShadow
 *
 * Usage:  import { Shadows } from '../config';
 *         style={{ ...Shadows.md }}
 */

import { Platform, ViewStyle } from 'react-native';

export const Shadows: {
    sm: ViewStyle;
    md: ViewStyle;
    lg: ViewStyle;
    xl: ViewStyle;
    colored: (color: string) => ViewStyle;
} = {
    /** Subtle — cards, list items */
    sm: Platform.select({
        ios: {
            shadowColor: '#000000',
            shadowOpacity: 0.08,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
        },
        android: {
            boxShadow: '0 2 4 0 rgba(0,0,0,0.08)',
        },
        default: {},
    }) as ViewStyle,

    /** Medium — modals, popovers, floating elements */
    md: Platform.select({
        ios: {
            shadowColor: '#000000',
            shadowOpacity: 0.12,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
        },
        android: {
            boxShadow: '0 3 8 0 rgba(0,0,0,0.12)',
        },
        default: {},
    }) as ViewStyle,

    /** Heavy — FABs, prominent CTAs */
    lg: Platform.select({
        ios: {
            shadowColor: '#000000',
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
        },
        android: {
            boxShadow: '0 6 12 0 rgba(0,0,0,0.18)',
        },
        default: {},
    }) as ViewStyle,

    /** Extra Heavy — high-prominence modals, overlays */
    xl: Platform.select({
        ios: {
            shadowColor: '#000000',
            shadowOpacity: 0.25,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
        },
        android: {
            boxShadow: '0 8 16 0 rgba(0,0,0,0.25)',
        },
        default: {},
    }) as ViewStyle,

    /** Brand-colored glow — primary-action buttons */
    colored: (color: string): ViewStyle => Platform.select({
        ios: {
            shadowColor: color,
            shadowOpacity: 0.45,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 0 },
        },
        android: {
            boxShadow: `0 0 20 4 ${color}80`,
        },
        web: {
            boxShadow: `0 0 8px ${color}80, 0 0 20px ${color}40`,
        },
        default: {},
    }) as ViewStyle,
};

export default Shadows;
