---
name: moti-animations
description: Use whenever adding layout animations, transitions, or micro-interactions to components. Defines the standard approach for Moti motion with StyleSheet and design tokens.
---

# Moti Animations & Motion

## Overview

Moti is our standard library for UI motion, powered by `react-native-reanimated` under the hood. It provides a declarative API for highly performant animations.

We use **StyleSheet + design tokens for styling** and **Moti for motion**. All styles must use the centralized config tokens (`Colors`, `Spacing`, `BorderRadius`, `Shadows`).

**Announce at start:** "I'm using the moti-animations skill to add consistent motion patterns."

## Core Principles

1.  **Don't over-animate**: Motion should be functional (feedback, loading, revealing), not distracting.
2.  **Springs > timing**: Prefer spring physics (`type: 'spring'`) over fixed-duration timing (`type: 'timing'`) for a more natural, fluid feel. Exception: skeleton loaders use `timing` with `loop: true`.
3.  **StyleSheet + tokens**: Always use `StyleSheet.create()` with design token imports — never inline styles or className props.
4.  **Performance**: Moti uses the native driver by default. Avoid animating `width`, `height`, or `flex` — stick to `opacity`, `translateY`, `translateX`, `scale`, `rotate`.

## When to Use

*   **Entering/Exiting**: Modals, snackbars, list items mounting or unmounting.
*   **Micro-interactions**: Press scaling on buttons, toggle switches.
*   **Loading States**: Skeleton screens shimmering or pulsing.
*   **Layout Changes**: Expanding/collapsing accordions or dynamic lists.

## Common Patterns

### 1. Basic Mounting Animation (Fade & Slide)

When a component appears on screen, give it a soft entrance.

```tsx
import { MotiView } from 'moti';
import { Text, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadows } from '../config';

export function SuccessCard() {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 20 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 15 }}
      style={styles.card}
    >
      <Text style={styles.title}>Goal Completed!</Text>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    ...Shadows.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
```

### 2. Staggered List Items

List items should animate in sequentially, not all at once. Use the `delay` property combined with the item's index.

```tsx
import { MotiView } from 'moti';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../config';

export function FeedList({ items }: { items: { id: string; title: string }[] }) {
  return (
    <View style={styles.container}>
      {items.map((item, index) => (
        <MotiView
          key={item.id}
          from={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            type: 'spring',
            delay: index * 100, // Stagger effect
          }}
          style={styles.card}
        >
          <Text style={styles.text}>{item.title}</Text>
        </MotiView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    marginBottom: Spacing.listItemGap,
    backgroundColor: Colors.surface,
    padding: Spacing.cardPadding,
    borderRadius: BorderRadius.lg,
  },
  text: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
});
```

**Performance note:** For long lists (>20 items), cap the delay at `Math.min(index, 8) * 100` to avoid animating offscreen items. For `FlatList`, animate only visible items or skip stagger entirely.

### 3. Presence (Exit Animations)

For things that mount and unmount based on state (like modals or dropdowns), use `AnimatePresence` to let the exit animation finish before removing the element.

```tsx
import { MotiView, AnimatePresence } from 'moti';
import { Text, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../config';

export function HintPopup({ isVisible, hint }: { isVisible: boolean; hint: string }) {
  return (
    <AnimatePresence>
      {isVisible && (
        <MotiView
          from={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring' }}
          style={styles.popup}
        >
          <Text style={styles.popupText}>{hint}</Text>
        </MotiView>
      )}
    </AnimatePresence>
  );
}

const styles = StyleSheet.create({
  popup: {
    position: 'absolute',
    bottom: Spacing.huge,
    alignSelf: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.pill,
    padding: Spacing.cardPadding,
  },
  popupText: {
    color: Colors.white,
    fontWeight: '600',
  },
});
```

### 4. Skeleton Loader (Loading State)

Use `MotiView` with `timing` loop for shimmering skeleton placeholders. See `src/components/SkeletonLoader.tsx` for the shared `SkeletonBox` component.

```tsx
import { MotiView } from 'moti';
import { StyleSheet } from 'react-native';
import { Colors, BorderRadius } from '../config';

// Low-level skeleton block — prefer using <SkeletonBox> from SkeletonLoader.tsx
export function SkeletonBlock({ width, height }: { width: number | string; height: number }) {
  return (
    <MotiView
      from={{ opacity: 0.3 }}
      animate={{ opacity: 1 }}
      transition={{
        type: 'timing',
        duration: 800,
        loop: true,
        repeatReverse: true,
      }}
      style={[styles.skeleton, { width, height }]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.xs,
  },
});
```

## What NOT to Animate

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `width` / `height` | Not native-driver compatible, janky | `scale` or `translateY` to reveal |
| `flex` / `flexGrow` | Layout recalculation each frame | `LayoutAnimation` for layout shifts |
| `borderRadius` | Platform inconsistencies | Set static, animate opacity/scale |
| Large `FlatList` items | Re-renders kill performance | Animate only first ~8 visible items |

## Setup & Gotchas

*   Requires `react-native-reanimated` plugin in `babel.config.js` (must be the LAST plugin).
*   If Moti animations glitch or don't trigger, clear the Expo bundler cache (`npx expo start -c`).
*   Avoid wrapping `SafeAreaView` inside a `MotiView` if layout jumping occurs — animate inner containers instead.
*   On Web (Expo for Web), spring animations may feel different. Test both platforms.

## Checklist — Before Submitting Animation Changes

- [ ] All styles use `StyleSheet.create()` with design tokens — no inline styles
- [ ] Animation property is native-driver compatible (opacity, translate, scale, rotate)
- [ ] Spring used for UI motion, timing only for looping effects (skeletons)
- [ ] Staggered lists cap delay for large datasets
- [ ] Exit animations use `AnimatePresence` when element unmounts
