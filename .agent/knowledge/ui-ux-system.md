# UI & UX System Architecture

## 1. Design Philosophy
-   **Aesthetics**: Glassmorphism, Neumorphism, and High-Quality Visuals.
-   **Interactions**: Haptic feedback on all actions; Smooth transitions.
-   **Loading**: Skeleton loaders for all async states (never spinners).

## 2. Styling Stack
- **Primary approach**: React Native `StyleSheet.create()` + design tokens from `src/config/`. Components follow the `const colors = useColors(); const styles = useMemo(() => createStyles(colors), [colors]);` pattern.
- **Theme-aware colors**: `useColors()` hook from `src/themes/useColors.ts` (re-exported from `src/config`). Resolves via `ThemeContext`. Used in 116+ files. **This is the canonical runtime color access pattern.**
- **Static tokens**: `Typography.*`, `Spacing.*`, `BorderRadius.*`, `Shadows.*` — imported from `src/config`, used directly in `StyleSheet`. Static `Colors.*` is available but theme-blind — prefer `useColors()` for anything that must adapt to theme.
- **Moti** (`moti` + `react-native-reanimated`): Layout animations (fade, slide, stagger, presence). See `.agent/skills/moti/SKILL.md`.
- **NativeWind**: installed but **not used** — zero `className=` occurrences in the codebase. Do not introduce it.

### Canonical Component Pattern
```tsx
import React, { useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useColors, Typography, Spacing, BorderRadius } from '../config';

export const MyCard = () => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Hi</Text>
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: Spacing.cardPadding,
    borderRadius: BorderRadius.md,
  },
  title: { ...Typography.heading3, color: colors.textPrimary },
});
```

### Theme & Dark Mode
- **`ThemeContext`** (`src/themes/ThemeContext.tsx`): wraps the app, exposes current theme + setter.
- **`useColors()`**: resolves the active theme to a concrete palette. Every new screen must be checked in both light and dark modes — invisible text, lost borders, and harsh contrast are the typical failure modes.

## 3. Color System

### Single Source of Truth: `src/config/colors.ts`
All brand colors live here. **Always import from `Colors`**, never hardcode hex values.

**Current Palette: Emerald / Teal** (migrated from Violet)

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#059669` (emerald-600) | Buttons, links, active states |
| `primaryDark` | `#047857` (emerald-700) | Pressed states |
| `primaryDeep` | `#065F46` (emerald-900) | Gradient dark end |
| `secondary` | `#10B981` (emerald-500) | Success, secondary accent |
| `accent` | `#14B8A6` (teal-500) | Gradient light end, highlights |
| `primarySurface` | `#ECFDF5` (emerald-50) | Card/button bg tint |
| `primaryTint` | `#A7F3D0` (emerald-200) | Selected-state bg, badges |
| `primaryBorder` | `#6EE7B7` (emerald-300) | Visible borders on white |
| `error` | `#EF4444` | Error states |
| `textPrimary` | `#111827` | Body text |
| `textSecondary` | `#6B7280` | Muted text |
| `surface` | `#F9FAFB` | Page background |

### Gradient Presets (from `Colors`)
- `gradientPrimary`: `['#059669', '#14B8A6']` — default brand gradient
- `gradientDark`: `['#059669', '#065F46']` — dark variant
- `gradientAuth`: `['#047857', '#0F766E', '#14B8A6']` — auth screens

### SVG Icons
All icons in `src/assets/icons/` use linearGradient with `#065F46` → `#14B8A6` (emerald-900 to teal-500). Gradient IDs are namespaced per icon (e.g., `settings_grad1`, `home_grad`).

## 4. Core Components

### SharedHeader
-   **Path**: `src/components/SharedHeader.tsx`
-   **Usage**: Standard header for all screens.
-   **Layout**: `flex-row`, `justify-space-between`.
-   **Spacing**: Uses `gap: 12` for right-side action buttons.
-   **Variants**: `default` (white), `transparent` (for hero images), `solid`.

### ExperienceCard
-   **Path**: `src/screens/giver/CategorySelectionScreen.tsx` (internal component)
-   **Style**: 200px fixed height, shadow-lg, rounded-xl.
-   **Heart Icon**: Absolute positioned top-right.

## 5. Animation Patterns

### Moti (Preferred for layout animations)
-   **Mounting**: `MotiView` with `from={{ opacity: 0, translateY: 20 }}` → `animate={{ opacity: 1, translateY: 0 }}`
-   **Staggered lists**: `delay: index * 100`
-   **Exit**: Wrap with `AnimatePresence` for unmount animations
-   **Springs > Timing**: Prefer `transition={{ type: 'spring', damping: 15 }}`

### Animated API (Legacy / search bar toggle)
-   `Animated.timing` + `Animated.View` for opacity/height/translateY.
-   `Easing.out(Easing.cubic)` for easing.

## 6. Security & Data Utilities
- **`sanitizeText`** (`src/utils/sanitization.ts`): MUST be called before ALL Firestore writes on any user-supplied text fields.
- **`vh()`** (`src/utils/responsive.ts`): MUST be used for responsive vertical sizing — do not use raw pixel values for height-dependent layouts.

## 7. Accessibility Patterns
- **`accessibilityViewIsModal`**: Required on all modal content containers.
- **`accessibilityLiveRegion="polite"`**: Required on elements that transition from loading skeleton to real content.

## 8. Error States
- **`ErrorRetry`** component is used on 7+ screens for displaying error states with a retry action.

## 9. Performance Patterns
- **Firestore offline persistence**: Enabled via `persistentLocalCache` configuration.
- **Code splitting**: `React.lazy` is used for 3 screens to reduce initial bundle size.
