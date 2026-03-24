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
    primaryTint: '#99F6E4',    // teal-200 — warmer teal-green for selected bg
    primaryBorder: '#5EEAD4',  // teal-300 — visible border, less minty
    primaryLight: '#CCFBF1',   // teal-100 — light tint for borders/badges
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
    overlayMedium: 'rgba(0, 0, 0, 0.45)',
    overlayLight: 'rgba(0, 0, 0, 0.3)',
    overlayDark: 'rgba(0, 0, 0, 0.92)',
    overlayHeavy: 'rgba(0, 0, 0, 0.7)',
    surfaceFrosted: 'rgba(255, 255, 255, 1)',
    surfaceFrosted92: 'rgba(249, 250, 251, 1)',
    primaryTintAlpha40: 'rgba(153, 246, 228, 0.4)',

    // ─── Semi-transparent whites ──────────────────────────────────────
    whiteAlpha90: 'rgba(255, 255, 255, 0.9)',
    whiteAlpha88: 'rgba(255, 255, 255, 0.88)',
    whiteAlpha80: 'rgba(255, 255, 255, 0.8)',
    whiteAlpha60: 'rgba(255, 255, 255, 0.6)',
    whiteAlpha40: 'rgba(255, 255, 255, 0.4)',
    whiteAlpha25: 'rgba(255, 255, 255, 0.25)',
    whiteAlpha15: 'rgba(255, 255, 255, 0.15)',
    whiteAlpha10: 'rgba(255, 255, 255, 0.1)',
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

    // ─── Theme-invariant (same in light AND dark — for image overlays) ─
    textOnImage: '#FFFFFF',
    overlayOnImage: 'rgba(0, 0, 0, 0.45)',

    // ─── Landing / marketing page backgrounds (theme-invariant dark) ──
    landingBg: '#0F172A',           // slate-900
    landingSectionBg: '#111827',    // gray-900

    // ─── Additional alpha variants ──────────────────────────────────
    whiteAlpha70: 'rgba(255, 255, 255, 0.7)',
    whiteAlpha08: 'rgba(255, 255, 255, 0.08)',

    // ─── Disabled state ───────────────────────────────────────────────
    disabled: '#D1D5DB',
    disabledText: '#6B7280',

    // ─── Disabled gradients ───────────────────────────────────────────
    gradientDisabled: ['#9CA3AF', '#6B7280'] as [string, string],
};

export default Colors;

/**
 * Ernit App — Dark Mode Color Tokens
 *
 * Mirrors every key in Colors with dark-appropriate values.
 * TypeScript enforces completeness via `satisfies typeof Colors`.
 */
export const DarkColors = {
    // ─── Primary brand color (brightened for dark surface contrast) ────
    primary: '#10B981',       // emerald-500
    primaryDark: '#059669',   // emerald-600
    primaryDeep: '#047857',   // emerald-700
    primaryDeeper: '#065F46', // emerald-900

    // ─── Secondary / accent (brightened) ──────────────────────────────
    secondary: '#34D399',     // emerald-400
    accent: '#2DD4BF',        // teal-400
    accentDark: '#14B8A6',    // teal-500
    accentDeep: '#0D9488',    // teal-600

    // ─── Tints (ghost tints on dark surfaces) ─────────────────────────
    primarySurface: '#202040',
    primaryTint: 'rgba(52, 211, 153, 0.25)',
    primaryBorder: 'rgba(52, 211, 153, 0.35)',
    primaryLight: 'rgba(16, 185, 129, 0.15)',
    primaryOverlay: 'rgba(16, 185, 129, 0.9)',

    // ─── Gradients (unchanged — render on gradient backgrounds) ───────
    gradientPrimary: ['#10B981', '#2DD4BF'] as [string, string],
    gradientDark: ['#10B981', '#047857'] as [string, string],
    gradientTriple: ['#10B981', '#059669', '#10B981'] as [string, string, string],
    gradientOnboarding: ['#34D399', '#047857', '#34D399'] as [string, string, string],
    gradientAuth: ['#059669', '#0D9488', '#2DD4BF'] as [string, string, string],

    // ─── Semantic / neutral (inverted for dark) ───────────────────────
    white: '#1A1A2E',
    black: '#FFFFFF',
    error: '#EF4444',
    errorLight: 'rgba(239, 68, 68, 0.15)',
    errorDark: '#FCA5A5',
    textPrimary: '#F9FAFB',
    textSecondary: '#9CA3AF',
    textMuted: '#8B95A3',          // brightened from #6B7280 for WCAG AA contrast (~5.2:1 on dark surfaces)
    border: '#334155',
    surface: '#242438',
    backgroundLight: '#1E2A4A',

    // ─── Extended grays (role-swapped for dark) ─────────────────────
    gray300: '#3D4556',
    gray600: '#9CA3AF',
    gray700: '#D1D5DB',
    gray800: '#E5E7EB',

    // ─── Warning / amber ────────────────────────────────────────────
    warning: '#F59E0B',
    warningLight: 'rgba(245, 158, 11, 0.15)',
    warningLighter: 'rgba(245, 158, 11, 0.08)',
    warningBorder: 'rgba(245, 158, 11, 0.3)',
    warningMedium: '#FBBF24',
    warningDark: '#FDE68A',
    warningDeep: '#FEF3C7',

    // ─── Info / blue ────────────────────────────────────────────────
    info: '#60A5FA',
    infoLight: 'rgba(59, 130, 246, 0.15)',
    infoBorder: 'rgba(59, 130, 246, 0.35)',
    infoDark: '#93C5FD',

    // ─── Cyan ────────────────────────────────────────────────────────
    cyan: '#22D3EE',

    // ─── Violet ──────────────────────────────────────────────────────
    violet: '#A78BFA',

    // ─── Success / green ────────────────────────────────────────────
    success: '#4ADE80',
    successLight: 'rgba(34, 197, 94, 0.15)',
    successLighter: 'rgba(34, 197, 94, 0.08)',
    successMedium: '#22C55E',
    successBorder: 'rgba(34, 197, 94, 0.25)',

    // ─── Error extended ─────────────────────────────────────────────
    errorBorder: 'rgba(239, 68, 68, 0.25)',

    // ─── Pink (motivation/social) ───────────────────────────────────
    pink: '#F472B6',
    pinkLight: 'rgba(236, 72, 153, 0.15)',

    // ─── Overlays ───────────────────────────────────────────────────
    overlay: 'rgba(0, 0, 0, 0.6)',
    overlayMedium: 'rgba(0, 0, 0, 0.55)',
    overlayLight: 'rgba(0, 0, 0, 0.4)',
    overlayDark: 'rgba(0, 0, 0, 0.95)',
    overlayHeavy: 'rgba(0, 0, 0, 0.8)',
    surfaceFrosted: 'rgba(26, 26, 46, 0.95)',
    surfaceFrosted92: 'rgba(36, 36, 56, 0.92)',
    primaryTintAlpha40: 'rgba(52, 211, 153, 0.3)',

    // ─── Semi-transparent (dark equivalents) ────────────────────────
    whiteAlpha90: 'rgba(26, 26, 46, 0.9)',
    whiteAlpha88: 'rgba(26, 26, 46, 0.88)',
    whiteAlpha80: 'rgba(26, 26, 46, 0.8)',
    whiteAlpha60: 'rgba(26, 26, 46, 0.6)',
    whiteAlpha40: 'rgba(26, 26, 46, 0.4)',
    whiteAlpha25: 'rgba(255, 255, 255, 0.15)',
    whiteAlpha15: 'rgba(255, 255, 255, 0.1)',
    whiteAlpha10: 'rgba(255, 255, 255, 0.06)',
    blackAlpha20: 'rgba(255, 255, 255, 0.1)',

    // ─── Brand colors (unchanged — third-party identity) ────────────
    whatsappGreen: '#25D366',
    whatsappGreenDark: '#1ebe57',
    googleBlue: '#4285F4',
    linkedIn: '#0A66C2',

    // ─── Category colors (vivid, work on dark) ─────────────────────
    categoryPink: '#F472B6',
    categoryAmber: '#FBBF24',
    categoryViolet: '#A78BFA',
    categoryBlue: '#60A5FA',
    categoryIndigo: '#818CF8',

    // ─── Celebration / decorative ───────────────────────────────────
    celebrationGold: '#fbbf24',
    celebrationGoldLight: 'rgba(251, 191, 36, 0.15)',
    celebrationGoldBorder: 'rgba(251, 191, 36, 0.3)',

    // ─── Extended pink ──────────────────────────────────────────────
    pinkLighter: 'rgba(236, 72, 153, 0.12)',

    // ─── Notification action colors ─────────────────────────────────
    approveLight: 'rgba(112, 179, 115, 0.25)',
    approveDark: '#86EFAC',
    declineLight: 'rgba(155, 41, 41, 0.25)',
    declineDark: '#FCA5A5',
    actionGreen: '#86EFAC',
    actionBlue: '#93C5FD',

    // ─── Theme-invariant (same in light AND dark — for image overlays) ─
    textOnImage: '#FFFFFF',
    overlayOnImage: 'rgba(0, 0, 0, 0.45)',

    // ─── Landing / marketing page backgrounds (theme-invariant dark) ──
    landingBg: '#0F172A',           // slate-900
    landingSectionBg: '#111827',    // gray-900

    // ─── Additional alpha variants ──────────────────────────────────
    whiteAlpha70: 'rgba(255, 255, 255, 0.7)',
    whiteAlpha08: 'rgba(255, 255, 255, 0.08)',

    // ─── Disabled state ─────────────────────────────────────────────
    disabled: '#3D4556',
    disabledText: '#556270',

    // ─── Disabled gradients ─────────────────────────────────────────
    gradientDisabled: ['#3D4556', '#2A3042'] as [string, string],
} satisfies typeof Colors;
