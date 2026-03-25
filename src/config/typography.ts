/**
 * Ernit App — Typography Tokens
 *
 * Centralized font-size / weight / line-height presets.
 * Usage:  import { Typography } from '../config';
 *         <Text style={Typography.heading2}>Hello</Text>
 */

import { TextStyle } from 'react-native';

export const Typography: Record<string, TextStyle> = {
    // ─── Display ────────────────────────────────────────────────────
    display: { fontSize: 32, fontWeight: '700', lineHeight: 40 },

    // ─── Headings ─────────────────────────────────────────────────────
    heading1: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
    heading2: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
    heading3: { fontSize: 18, fontWeight: '700', lineHeight: 24 },

    // ─── Subheading ──────────────────────────────────────────────────
    subheading: { fontSize: 16, fontWeight: '600', lineHeight: 22 },

    // ─── Large ───────────────────────────────────────────────────────
    large: { fontSize: 20, fontWeight: '700', lineHeight: 26 },

    // ─── Body ─────────────────────────────────────────────────────────
    body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
    bodyBold: { fontSize: 15, fontWeight: '600', lineHeight: 22 },

    // ─── Small ────────────────────────────────────────────────────────
    small: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
    smallBold: { fontSize: 14, fontWeight: '600', lineHeight: 20 },

    // ─── Caption ──────────────────────────────────────────────────────
    caption: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
    captionBold: { fontSize: 12, fontWeight: '600', lineHeight: 16 },

    // ─── Tiny ─────────────────────────────────────────────────────────
    tiny: { fontSize: 11, fontWeight: '600', lineHeight: 14 },

    // ─── Tag / label (earned badges, pill labels) ────────────────────
    tag: { fontSize: 10, fontWeight: '800', lineHeight: 14 },

    // ─── Micro (badges, nav labels) ─────────────────────────────────
    micro: { fontSize: 9, fontWeight: '700', lineHeight: 12 },

    // ─── Medium weight variants ─────────────────────────────────────
    bodyMedium: { fontSize: 15, fontWeight: '500', lineHeight: 22 },
    smallMedium: { fontSize: 14, fontWeight: '500', lineHeight: 20 },

    // ─── Extra bold variants ─────────────────────────────────────────
    displayBold: { fontSize: 32, fontWeight: '800', lineHeight: 40 },
    heading1Bold: { fontSize: 26, fontWeight: '800', lineHeight: 32 },

    // ─── Hero (celebration stats, large displays) ───────────────────
    hero: { fontSize: 72, fontWeight: '800', lineHeight: 80 },
    heroSub: { fontSize: 42, fontWeight: '700', lineHeight: 50 },

    // ─── Display large (profile/placeholder/celebration) ───────────
    displayLarge: { fontSize: 40, fontWeight: '700', lineHeight: 48 },

    // ─── Emoji display sizes ────────────────────────────────────────
    emojiSmall: { fontSize: 24, fontWeight: '400', lineHeight: 32 },
    emojiMedium: { fontSize: 36, fontWeight: '400', lineHeight: 44 },
    emoji: { fontSize: 48, fontWeight: '400', lineHeight: 56 },
    emojiLarge: { fontSize: 64, fontWeight: '400', lineHeight: 72 },

    // ─── Brand logo (Landing screen title) ──────────────────────────
    brandLogo: { fontSize: 46, fontWeight: '800', lineHeight: 54 },
};

export default Typography;
