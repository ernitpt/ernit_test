# UI & UX System Architecture

## 1. Design Philosophy
-   **Aesthetics**: Glassmorphism, Neumorphism, and High-Quality Visuals.
-   **Interactions**: Haptic feedback on all actions; Smooth transitions (LayoutAnimation, Reanimated).
-   **Loading**: Skeleton loaders for all async states (never spinners).

## 2. Core Components

### SharedHeader
-   **Path**: `src/components/SharedHeader.tsx`
-   **Usage**: The standard header for all screens.
-   **Layout**: `flex-row`, `justify-space-between`.
-   **Spacing**: Uses `gap: 12` for right-side action buttons.
-   **Variants**: `default` (white), `transparent` (for hero images), `solid`.

### ExperienceCard
-   **Path**: `src/screens/giver/CategorySelectionScreen.tsx` (Internal component, candidate for extraction)
-   **Style**: 200px fixed height, shadow-lg, rounded-xl.
-   **Heart Icon**: Absolute positioned top-right.

## 3. Animation Patterns

### Search Bar Toggle
-   **Implementation**: `Animated.timing` + `Animated.View`.
-   **Properties**:
    -   `opacity`: 0 -> 1
    -   `height`: 0 -> 80
    -   `translateY`: -20 -> 0
-   **Easing**: `Easing.out(Easing.cubic)`
-   **Logic**: Condition rendering *after* close animation completes.

## 4. Color Palette (Tailwind/NativeWind)
-   **Primary**: `#8B5CF6` (Violet-500)
-   **Background**: `#F9FAFB` (Gray-50)
-   **Text**: `#111827` (Gray-900)
-   **Success**: `#10B981` (Emerald-500)
-   **Error**: `#EF4444` (Red-500)
