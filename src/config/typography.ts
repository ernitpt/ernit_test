/**
 * Ernit App — Typography Tokens
 *
 * Centralized font-size / weight / line-height presets.
 * Usage:  import { Typography } from '../config';
 *         <Text style={Typography.heading2}>Hello</Text>
 */

import { Platform, TextStyle } from 'react-native';

// Disable font scaling on native to prevent Android system font size from breaking layouts.
// The app is designed with fixed line-heights that do not reflow gracefully at larger sizes.
// WCAG 1.4.4 note: this is a known trade-off — revisit with a full layout audit before enabling.
const noScale: TextStyle = Platform.OS !== 'web' ? { allowFontScaling: false } : {};

export const Typography: Record<string, TextStyle> = {
    // ─── Display ────────────────────────────────────────────────────
    display: { fontSize: 32, fontWeight: '700', lineHeight: 40, ...noScale },

    // ─── Headings ─────────────────────────────────────────────────────
    heading1: { fontSize: 26, fontWeight: '700', lineHeight: 32, ...noScale },
    heading2: { fontSize: 22, fontWeight: '700', lineHeight: 28, ...noScale },
    heading3: { fontSize: 18, fontWeight: '700', lineHeight: 24, ...noScale },

    // ─── Subheading ──────────────────────────────────────────────────
    subheading: { fontSize: 16, fontWeight: '600', lineHeight: 22, ...noScale },

    // ─── Large ───────────────────────────────────────────────────────
    large: { fontSize: 20, fontWeight: '700', lineHeight: 26, ...noScale },

    // ─── Body ─────────────────────────────────────────────────────────
    body: { fontSize: 15, fontWeight: '400', lineHeight: 22, ...noScale },
    bodyBold: { fontSize: 15, fontWeight: '600', lineHeight: 22, ...noScale },

    // ─── Small ────────────────────────────────────────────────────────
    small: { fontSize: 14, fontWeight: '400', lineHeight: 20, ...noScale },
    smallBold: { fontSize: 14, fontWeight: '600', lineHeight: 20, ...noScale },

    // ─── Caption ──────────────────────────────────────────────────────
    caption: { fontSize: 12, fontWeight: '400', lineHeight: 16, ...noScale },
    captionBold: { fontSize: 12, fontWeight: '600', lineHeight: 16, ...noScale },

    // ─── Tiny ─────────────────────────────────────────────────────────
    tiny: { fontSize: 11, fontWeight: '600', lineHeight: 14, ...noScale },

    // ─── Tag / label (earned badges, pill labels) ────────────────────
    tag: { fontSize: 10, fontWeight: '800', lineHeight: 14, ...noScale },

    // ─── Micro (badges, nav labels) ─────────────────────────────────
    micro: { fontSize: 9, fontWeight: '700', lineHeight: 12, ...noScale },

    // ─── Medium weight variants ─────────────────────────────────────
    bodyMedium: { fontSize: 15, fontWeight: '500', lineHeight: 22, ...noScale },
    smallMedium: { fontSize: 14, fontWeight: '500', lineHeight: 20, ...noScale },

    // ─── Extra bold variants ─────────────────────────────────────────
    displayBold: { fontSize: 32, fontWeight: '800', lineHeight: 40, ...noScale },
    heading1Bold: { fontSize: 26, fontWeight: '800', lineHeight: 32, ...noScale },

    // ─── Hero (celebration stats, large displays) ───────────────────
    hero: { fontSize: 72, fontWeight: '800', lineHeight: 80, ...noScale },
    heroSub: { fontSize: 42, fontWeight: '700', lineHeight: 50, ...noScale },

    // ─── Display large (profile/placeholder/celebration) ───────────
    displayLarge: { fontSize: 40, fontWeight: '700', lineHeight: 48, ...noScale },

    // ─── Emoji display sizes ────────────────────────────────────────
    emojiSmall: { fontSize: 24, fontWeight: '400', lineHeight: 32, ...noScale },
    emojiBase: { fontSize: 28, fontWeight: '400', lineHeight: 34, ...noScale },
    emojiMedium: { fontSize: 36, fontWeight: '400', lineHeight: 44, ...noScale },
    emoji: { fontSize: 48, fontWeight: '400', lineHeight: 56, ...noScale },
    emojiLarge: { fontSize: 64, fontWeight: '400', lineHeight: 72, ...noScale },

    // ─── Brand logo (Landing screen title) ──────────────────────────
    brandLogo: { fontSize: 46, fontWeight: '800', lineHeight: 54, ...noScale },
};

export default Typography;
