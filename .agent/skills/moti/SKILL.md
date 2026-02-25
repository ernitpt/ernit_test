---
name: moti-animations
description: Use whenever adding layout animations, transitions, or micro-interactions to components. Defines the standard approach for combining NativeWind styling with Moti motion.
---

# Moti Animations & Motion

## Overview

Moti is our standard library for UI motion, powered by `react-native-reanimated` under the hood. It provides a declarative, styled-components-like API for highly performant animations.

We use **NativeWind for Styling** and **Moti for Motion**. They should be combined where possible to avoid messy `StyleSheet` objects.

## Core Principles

1.  **Don't over-animate**: Motion should be functional (e.g. feedback, loading, revealing), not distracting.
2.  **Springs > timing**: Prefer spring physics (`type: 'spring'`) over fixed-duration timing (`type: 'timing'`) for a more natural, fluid feel.
3.  **Combine with NativeWind**: Use the `className` prop directly on Moti components.

## When to Use

*   **Entering/Exiting**: Modals, snackbars, list items mounting or unmounting.
*   **Micro-interactions**: Hover effects, press scaling on buttons.
*   **Loading States**: Skeleton screens shimmering or pulsing.
*   **Layout Changes**: Expanding/collapsing accordions or dynamic lists.

## Common Patterns

### 1. Basic Mounting Animation (Fade & Slide)

When a component appears on screen, give it a soft entrance.

```tsx
import { MotiView } from 'moti';

// Renders a View using NativeWind classes that fades in and slides up
export function SuccessCard() {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 20 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 15 }}
      className="bg-white rounded-2xl p-5 shadow-lg"
    >
      <Text className="text-xl font-bold">Goal Completed!</Text>
    </MotiView>
  );
}
```

### 2. Staggered List Items

List items should animate in sequentially, not all at once. Use the `delay` property combined with the item's index.

```tsx
import { MotiView } from 'moti';

export function FeedList({ items }) {
  return (
    <View className="flex-1">
      {items.map((item, index) => (
        <MotiView
          key={item.id}
          from={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            type: 'spring',
            delay: index * 100, // Stagger effect
          }}
          className="mb-4 bg-gray-50 p-4 rounded-xl"
        >
          <Text>{item.title}</Text>
        </MotiView>
      ))}
    </View>
  );
}
```

### 3. Presence (Exit Animations)

For things that mount and unmount based on state (like modals or dropdowns), use `AnimatePresence` to let the exit animation finish before removing the element from the DOM.

```tsx
import { MotiView, AnimatePresence } from 'moti';

export function HintPopup({ isVisible, hint }) {
  return (
    <AnimatePresence>
      {isVisible && (
        <MotiView
          from={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring' }}
          className="absolute bottom-10 bg-purple-600 rounded-full p-4"
        >
          <Text className="text-white">{hint}</Text>
        </MotiView>
      )}
    </AnimatePresence>
  );
}
```

## Setup & Gotchas

*   Requires `react-native-reanimated` plugin in `babel.config.js` (must be the LAST plugin).
*   If Moti animations glitch or don't trigger, usually it's because the Expo bundler cache needs clearing (`npx expo start -c`).
*   Avoid using `SafeAreaView` wrapped inside a `MotiView` if layout jumping occurs; instead, animate inner containers.
