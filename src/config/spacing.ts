/**
 * Ernit App — Spacing Tokens
 *
 * 8-point-ish scale + semantic aliases for common layout values.
 * Usage:  import { Spacing } from '../config';
 *         style={{ padding: Spacing.cardPadding }}
 */

export const Spacing = {
    // ─── Scale ────────────────────────────────────────────────────────
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    huge: 40,

    // ─── Semantic aliases ─────────────────────────────────────────────
    /** Horizontal padding for full-width screens */
    screenPadding: 20,

    /** Internal padding of cards and modals */
    cardPadding: 16,

    /** Gap between major page sections */
    sectionGap: 24,

    /** Gap between list items / card rows */
    listItemGap: 12,
} as const;

export default Spacing;
