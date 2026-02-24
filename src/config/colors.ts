/**
 * Ernit App — Central Color Tokens
 *
 * All brand colors live here. To swap the palette, edit this file only.
 * Current palette: Emerald / Teal
 */

export const Colors = {
    // ─── Primary brand color ────────────────────────────────────────────
    primary: '#059669',       // emerald-600  — was #7C3AED
    primaryDark: '#047857',   // emerald-700  — was #9333EA
    primaryDeep: '#065F46',   // emerald-900  — was #6D28D9
    primaryDeeper: '#064E3B', // emerald-950  — was #5B21B6

    // ─── Secondary / accent ─────────────────────────────────────────────
    secondary: '#10B981',     // emerald-500  — was #8B5CF6
    accent: '#14B8A6',        // teal-500     — was #3B82F6
    accentDark: '#0D9488',    // teal-600     — was #6366F1
    accentDeep: '#0F766E',    // teal-700     — was #2563EB

    // ─── Light tints (backgrounds, surfaces, borders) ───────────────────
    //  • primarySurface: very light bg — used as card/button background tint
    //  • primaryTint: light tint — used as selected-state bg, badges
    //  • primaryBorder: medium tint — used as visible borders/dividers
    primarySurface: '#ECFDF5', // emerald-50  — near-white tinted surface (was #F5F3FF / #EDE9FE / #FAF5FF / #F3E8FF)
    primaryTint: '#A7F3D0',    // emerald-200 — clearly tinted, good for selected bg (was #E9D5FF / #DDD6FE)
    primaryBorder: '#6EE7B7',  // emerald-300 — visible border on white bg (prevents invisible borders)

    // ─── Gradients (convenience arrays for LinearGradient) ──────────────
    gradientPrimary: ['#059669', '#14B8A6'] as [string, string],     // was ['#7C3AED', '#3B82F6']
    gradientDark: ['#059669', '#065F46'] as [string, string],         // was ['#7C3AED', '#6D28D9']
    gradientTriple: ['#059669', '#047857', '#059669'] as [string, string, string], // was ['#7C3AED', '#9333EA', '#7C3AED']
    gradientOnboarding: ['#10B981', '#065F46', '#10B981'] as [string, string, string], // was ['#8B5CF6', '#6D28D9', '#5B21B6']
    gradientAuth: ['#047857', '#0F766E', '#14B8A6'] as [string, string, string], // was ['#9333EA', '#2563EB', '#3B82F6']

    // ─── Semantic / neutral (unchanged) ─────────────────────────────────
    white: '#FFFFFF',
    black: '#000000',
    error: '#EF4444',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    border: '#E5E7EB',
    surface: '#F9FAFB',
    backgroundLight: '#F3F4F6',
};

export default Colors;
