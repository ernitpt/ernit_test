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
};

export default Typography;
