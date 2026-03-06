/**
 * Ernit App — Border Radius Tokens
 *
 * Consistent roundness presets used across buttons, cards, modals, etc.
 * Usage:  import { BorderRadius } from '../config';
 *         style={{ borderRadius: BorderRadius.md }}
 */

export const BorderRadius = {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    pill: 50,    // fully rounded badges, tags, progress bars
    circle: 9999,  // perfect circles (avatars, FABs)
} as const;

export default BorderRadius;
