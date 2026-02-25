# UI & UX System Architecture

## 1. Design Philosophy
-   **Aesthetics**: Glassmorphism, Neumorphism, and High-Quality Visuals.
-   **Interactions**: Haptic feedback on all actions; Smooth transitions.
-   **Loading**: Skeleton loaders for all async states (never spinners).

## 2. Styling Stack
-   **NativeWind** (Tailwind CSS for React Native): Primary styling approach. Use `className` props.
-   **Moti** (`moti` + `react-native-reanimated`): Layout animations (fade, slide, stagger, presence).
-   See `.agent/skills/moti/SKILL.md` for animation patterns and gotchas.

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
