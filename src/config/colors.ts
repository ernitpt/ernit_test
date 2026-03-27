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
    gradientPrimary: ['#059669', '#0D9488'] as [string, string],     // emerald-600 → teal-600 (3.5:1 → 3.8:1 vs white)
    gradientDark: ['#059669', '#065F46'] as [string, string],         // was ['#7C3AED', '#6D28D9']
    gradientTriple: ['#059669', '#047857', '#059669'] as [string, string, string], // was ['#7C3AED', '#9333EA', '#7C3AED']
    gradientOnboarding: ['#10B981', '#065F46', '#10B981'] as [string, string, string], // was ['#8B5CF6', '#6D28D9', '#5B21B6']
    gradientAuth: ['#047857', '#0F766E', '#14B8A6'] as [string, string, string], // was ['#9333EA', '#2563EB', '#3B82F6']

    // ─── Semantic / neutral (unchanged) ─────────────────────────────────
    white: '#FFFFFF',
    black: '#000000',
    error: '#DC2626',         // red-600 (4.6:1 vs white — AA compliant)
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
    warningAlpha25: 'rgba(245, 158, 11, 0.25)',
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
    whiteAlpha20: 'rgba(255, 255, 255, 0.2)',
    whiteAlpha10: 'rgba(255, 255, 255, 0.1)',
    blackAlpha20: 'rgba(0, 0, 0, 0.2)',
    blackAlpha25: 'rgba(0, 0, 0, 0.25)',

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

    // ─── Notification action colors (derived from success/error scale) ─
    approveLight: '#DCFCE7',       // successLight (green-100)
    approveDark: '#16A34A',        // successMedium (green-600)
    declineLight: '#FEE2E2',       // errorLight (red-100)
    declineDark: '#DC2626',        // error (red-600)
    actionGreen: '#22C55E',        // success (green-500)
    actionBlue: '#3B82F6',         // info (blue-500)

    // ─── Theme-invariant (same in light AND dark — for image overlays) ─
    textOnImage: '#FFFFFF',
    overlayOnImage: 'rgba(0, 0, 0, 0.45)',
    overlayOnImageLight: 'rgba(0, 0, 0, 0.4)',
    revealGradientStart: 'rgba(6, 79, 70, 0.55)',
    revealGradientEnd: 'rgba(0, 0, 0, 0.72)',

    // ─── Landing / marketing page backgrounds (theme-invariant dark) ──
    landingBg: '#0F172A',           // slate-900
    landingSectionBg: '#111827',    // gray-900
    landingGradientTeal: '#0F2A2E', // dark teal midpoint for self-challenge gradient
    landingGradientAmber: '#2A1A0F', // dark amber midpoint for gift gradient
    orange: '#EA580C',               // orange-600 — CTA gradient endpoint

    // ─── Additional alpha variants ──────────────────────────────────
    whiteAlpha70: 'rgba(255, 255, 255, 0.7)',
    whiteAlpha08: 'rgba(255, 255, 255, 0.08)',

    // ─── Disabled state ───────────────────────────────────────────────
    disabled: '#D1D5DB',
    disabledText: '#6B7280',

    // ─── Disabled gradients ───────────────────────────────────────────
    gradientDisabled: ['#9CA3AF', '#6B7280'] as [string, string],

    // ─── Decorative / rotating word colors (ChallengeLanding, HeroPreview) ─
    decorativeWarm: '#C4A882',     // warm tan
    decorativeGold: '#D4A04A',     // golden-brown
    decorativeRose: '#E08080',     // mauve/rose
    decorativeYellow: '#D4C462',   // golden-yellow

    // ─── Card dark surface ─────────────────────────────────────────────
    cardDarkBg: '#1a1a2e',         // dark navy — card bg on dark marketing sections
    cardDarkBorder: '#1C1C1C',     // near-black border for dark cards
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

    // ─── Gradients (brightened for dark surface contrast) ──────────────
    gradientPrimary: ['#10B981', '#14B8A6'] as [string, string],  // emerald-500 → teal-500 (lighter for dark bg)
    gradientDark: ['#10B981', '#047857'] as [string, string],
    gradientTriple: ['#10B981', '#059669', '#10B981'] as [string, string, string],
    gradientOnboarding: ['#34D399', '#047857', '#34D399'] as [string, string, string],
    gradientAuth: ['#059669', '#0D9488', '#2DD4BF'] as [string, string, string],

    // ─── Semantic / neutral (inverted for dark) ───────────────────────
    // NOTE: `white` maps to near-black (#141414) — it represents the "base surface" role, not literal white
    white: '#141414',
    black: '#FFFFFF',
    error: '#EF4444',         // kept brighter than light-mode #DC2626 for dark surface contrast
    errorLight: 'rgba(239, 68, 68, 0.15)',
    errorDark: '#FCA5A5',
    textPrimary: '#F9FAFB',
    textSecondary: '#9CA3AF',
    textMuted: '#8B95A3',          // brightened from #6B7280 for WCAG AA contrast (~5.2:1 on dark surfaces)
    border: '#2E2E2E',
    surface: '#1C1C1C',
    backgroundLight: '#222222',

    // ─── Extended grays (role-swapped for dark) ─────────────────────
    gray300: '#333333',
    gray600: '#9CA3AF',
    gray700: '#D1D5DB',
    gray800: '#E5E7EB',

    // ─── Warning / amber ────────────────────────────────────────────
    warning: '#F59E0B',
    warningLight: 'rgba(245, 158, 11, 0.15)',
    warningLighter: 'rgba(245, 158, 11, 0.08)',
    warningBorder: 'rgba(245, 158, 11, 0.3)',
    warningAlpha25: 'rgba(245, 158, 11, 0.25)',
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
    surfaceFrosted: 'rgba(20, 20, 20, 0.95)',
    surfaceFrosted92: 'rgba(28, 28, 28, 0.92)',
    primaryTintAlpha40: 'rgba(52, 211, 153, 0.3)',

    // ─── Semi-transparent (dark equivalents) ────────────────────────
    whiteAlpha90: 'rgba(20, 20, 20, 0.9)',
    whiteAlpha88: 'rgba(20, 20, 20, 0.88)',
    whiteAlpha80: 'rgba(20, 20, 20, 0.8)',
    whiteAlpha60: 'rgba(26, 26, 46, 0.6)',
    whiteAlpha40: 'rgba(26, 26, 46, 0.4)',
    whiteAlpha25: 'rgba(255, 255, 255, 0.15)',
    whiteAlpha15: 'rgba(255, 255, 255, 0.1)',
    whiteAlpha20: 'rgba(255, 255, 255, 0.12)',
    whiteAlpha10: 'rgba(255, 255, 255, 0.06)',
    blackAlpha20: 'rgba(255, 255, 255, 0.1)',
    blackAlpha25: 'rgba(255, 255, 255, 0.12)',

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

    // ─── Notification action colors (derived from success/error scale) ─
    approveLight: 'rgba(34, 197, 94, 0.15)',  // successLight dark equiv
    approveDark: '#86EFAC',                    // green-300 (bright on dark)
    declineLight: 'rgba(239, 68, 68, 0.15)',   // errorLight dark equiv
    declineDark: '#FCA5A5',                    // red-300 (bright on dark)
    actionGreen: '#86EFAC',                    // green-300
    actionBlue: '#93C5FD',                     // blue-300

    // ─── Theme-invariant (same in light AND dark — for image overlays) ─
    textOnImage: '#FFFFFF',
    overlayOnImage: 'rgba(0, 0, 0, 0.45)',
    overlayOnImageLight: 'rgba(0, 0, 0, 0.4)',
    revealGradientStart: 'rgba(6, 79, 70, 0.55)',
    revealGradientEnd: 'rgba(0, 0, 0, 0.72)',

    // ─── Landing / marketing page backgrounds (theme-invariant dark) ──
    landingBg: '#0F172A',           // slate-900
    landingSectionBg: '#111827',    // gray-900
    landingGradientTeal: '#0F2A2E', // dark teal midpoint for self-challenge gradient
    landingGradientAmber: '#2A1A0F', // dark amber midpoint for gift gradient
    orange: '#EA580C',               // orange-600 — CTA gradient endpoint

    // ─── Additional alpha variants ──────────────────────────────────
    whiteAlpha70: 'rgba(255, 255, 255, 0.7)',
    whiteAlpha08: 'rgba(255, 255, 255, 0.08)',

    // ─── Disabled state ─────────────────────────────────────────────
    disabled: '#3D4556',
    disabledText: '#556270',

    // ─── Disabled gradients ─────────────────────────────────────────
    gradientDisabled: ['#3D4556', '#2A3042'] as [string, string],

    // ─── Decorative / rotating word colors (same in dark — decorative intent) ─
    decorativeWarm: '#D4B896',     // lightened for dark bg
    decorativeGold: '#E4B05A',
    decorativeRose: '#F09090',
    decorativeYellow: '#E4D472',

    // ─── Card dark surface ─────────────────────────────────────────────
    cardDarkBg: '#1a1a2e',         // same — already dark
    cardDarkBorder: '#2E2E2E',     // lighter border for visibility on dark
} satisfies typeof Colors;
