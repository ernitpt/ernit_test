import { Dimensions } from 'react-native';

const SCREEN_H = Dimensions.get('window').height;
const VH = Math.min(1, Math.max(0.72, SCREEN_H / 900));

/**
 * Continuous scale factor: 1.0 at 900px+, scales down to 0.72 at ~648px.
 * Exported for cases where the raw factor is needed (e.g. derived sizing).
 */
export { VH };

/**
 * Viewport-height scaling: returns px scaled proportionally to screen height.
 * On a 900px+ screen returns the input value unchanged.
 * On smaller screens (down to ~648px) scales down to 72%.
 */
export const vh = (px: number): number => Math.round(px * VH);
