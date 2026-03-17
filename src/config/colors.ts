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
    primarySurface: '#F8FAFC', // slate-50 — neutral surface (was #ECFDF5 emerald-50)
    primaryTint: '#A7F3D0',    // emerald-200 — clearly tinted, good for selected bg (was #E9D5FF / #DDD6FE)
    primaryBorder: '#6EE7B7',  // emerald-300 — visible border on white bg (prevents invisible borders)
    primaryLight: '#D1FAE5',   // emerald-100 — very light tint for borders/badges
    primaryOverlay: 'rgba(5, 150, 105, 0.9)', // primary at 90% opacity

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
    errorLight: '#FEE2E2',
    errorDark: '#991B1B',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    border: '#E5E7EB',
    surface: '#F9FAFB',
    backgroundLight: '#F3F4F6',

    // ─── Extended grays (complete the Tailwind gray-* scale) ──────────
    gray300: '#D1D5DB',
    gray600: '#4B5563',
    gray700: '#374151',
    gray800: '#1F2937',

    // ─── Warning / amber ──────────────────────────────────────────────
    warning: '#F59E0B',
    warningLight: '#FEF3C7',
    warningLighter: '#FFFBEB',  // amber-50
    warningBorder: '#FDE68A',   // amber-200
    warningMedium: '#D97706',   // amber-600
    warningDark: '#92400E',     // amber-800
    warningDeep: '#854D0E',     // amber-900

    // ─── Info / blue ──────────────────────────────────────────────────
    info: '#3B82F6',
    infoLight: '#DBEAFE',
    infoBorder: '#93C5FD',      // blue-300
    infoDark: '#1E40AF',

    // ─── Cyan ──────────────────────────────────────────────────────────
    cyan: '#0891B2',            // cyan-600

    // ─── Violet ────────────────────────────────────────────────────────
    violet: '#4C1D95',          // violet-900

    // ─── Success / green ──────────────────────────────────────────────
    success: '#22C55E',
    successLight: '#DCFCE7',
    successLighter: '#F0FDF4',  // green-50
    successMedium: '#16A34A',   // green-600
    successBorder: '#BBF7D0',   // green-200

    // ─── Error extended ───────────────────────────────────────────────
    errorBorder: '#FECACA',     // red-200

    // ─── Pink (motivation/social) ───────────────────────────────────
    pink: '#EC4899',
    pinkLight: '#FDF2F8',

    // ─── Overlays ───────────────────────────────────────────────────────
    overlay: 'rgba(0, 0, 0, 0.5)',
    overlayLight: 'rgba(0, 0, 0, 0.3)',
    overlayDark: 'rgba(0, 0, 0, 0.92)',
    overlayHeavy: 'rgba(0, 0, 0, 0.7)',
    surfaceFrosted: 'rgba(255, 255, 255, 0.95)',

    // ─── Semi-transparent whites ──────────────────────────────────────
    whiteAlpha90: 'rgba(255, 255, 255, 0.9)',
    whiteAlpha80: 'rgba(255, 255, 255, 0.8)',
    whiteAlpha40: 'rgba(255, 255, 255, 0.4)',
    whiteAlpha25: 'rgba(255, 255, 255, 0.25)',
    whiteAlpha15: 'rgba(255, 255, 255, 0.15)',
    blackAlpha20: 'rgba(0, 0, 0, 0.2)',

    // ─── Brand colors (third-party) ──────────────────────────────────
    whatsappGreen: '#25D366',
    whatsappGreenDark: '#1ebe57',
    googleBlue: '#4285F4',
    linkedIn: '#0A66C2',

    // ─── Category colors (for goal/experience type chips) ───────────
    categoryPink: '#EC4899',
    categoryAmber: '#F59E0B',
    categoryViolet: '#8B5CF6',
    categoryBlue: '#3B82F6',
    categoryIndigo: '#6366F1',

    // ─── Celebration / decorative ───────────────────────────────────
    celebrationGold: '#fbbf24',
    celebrationGoldLight: '#fef3c7',
    celebrationGoldBorder: '#fde68a',

    // ─── Extended pink ──────────────────────────────────────────────
    pinkLighter: '#fce7f3',    // pink-100

    // ─── Notification action colors ──────────────────────────────────
    approveLight: '#abd8b2',
    approveDark: '#3e802a',
    declineLight: '#ddb1b1',
    declineDark: '#9b2929',
    actionGreen: '#70b373',
    actionBlue: '#567cb1',

    // ─── Disabled state ───────────────────────────────────────────────
    disabled: '#D1D5DB',
    disabledText: '#6B7280',

    // ─── Disabled gradients ───────────────────────────────────────────
    gradientDisabled: ['#9CA3AF', '#6B7280'] as [string, string],
};

export default Colors;
