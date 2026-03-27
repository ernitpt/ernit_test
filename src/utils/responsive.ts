import { Dimensions } from 'react-native';

let _screenH = Dimensions.get('window').height;

// Keep _screenH current on orientation changes (Android multi-window, etc.)
Dimensions.addEventListener('change', ({ window }) => {
    _screenH = window.height;
});

const computeVH = (): number => Math.min(1, Math.max(0.72, _screenH / 900));

/**
 * Continuous scale factor: 1.0 at 900px+, scales down to 0.72 at ~648px.
 * Exported for cases where the raw factor is needed (e.g. derived sizing).
 * Note: snapshot at module init — prefer vh() for dynamic calls.
 */
export const VH = computeVH();

/**
 * Viewport-height scaling: returns px scaled proportionally to screen height.
 * On a 900px+ screen returns the input value unchanged.
 * On smaller screens (down to ~648px) scales down to 72%.
 */
export const vh = (px: number): number => Math.round(px * computeVH());
