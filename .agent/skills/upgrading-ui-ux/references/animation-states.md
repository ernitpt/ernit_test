# Animation & States Guide — Ernit App

All animation configs are in `src/config/animations.ts`.

## Animation Tokens

### Durations
| Token | Value | Use |
|-------|-------|-----|
| `Animations.durations.fast` | 200ms | Micro-interactions: button press, toggle, checkbox |
| `Animations.durations.normal` | 300ms | Screen transitions, modal open/close, card expand |
| `Animations.durations.slow` | 500ms | Complex animations: onboarding, celebration, empty state entrance |

### Spring Configs
| Token | Config | Use |
|-------|--------|-----|
| `Animations.springs.gentle` | damping:20, stiffness:120, mass:1 | Cards, modals, page transitions |
| `Animations.springs.bouncy` | damping:12, stiffness:180, mass:0.8 | Button presses, toggles, taps |
| `Animations.springs.snappy` | damping:18, stiffness:300, mass:0.6 | Snackbars, toasts, quick alerts |

### Easing Curves
| Token | Type | Use |
|-------|------|-----|
| `Animations.easing.standard` | bezier(0.4, 0, 0.2, 1) | Most transitions (default) |
| `Animations.easing.decelerate` | bezier(0, 0, 0.2, 1) | Elements entering screen |
| `Animations.easing.accelerate` | bezier(0.4, 0, 1, 1) | Elements leaving screen |

---

## Press Feedback

Every tappable element must have press feedback.

### Button Press (Handled by Button Component)
- Scale: 0.97 (spring-based)
- Spring: `Animations.springs.bouncy`
- Already built into `<Button>` — no extra work needed

### Card Press (Handled by Card Component)
- Scale: 0.97 (spring-based)
- Triggered when `onPress` prop is provided
- Already built into `<Card>` — no extra work needed

### Custom Tappable Elements
For any tappable element NOT using `<Button>` or `<Card>`:

```tsx
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import Animations from '../config/animations';

const scale = useSharedValue(1);
const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ scale: scale.value }],
}));

<Animated.View style={animatedStyle}>
  <TouchableOpacity
    onPressIn={() => { scale.value = withSpring(0.97, Animations.springs.bouncy); }}
    onPressOut={() => { scale.value = withSpring(1, Animations.springs.bouncy); }}
    onPress={handlePress}
    activeOpacity={0.9}
  >
    {children}
  </TouchableOpacity>
</Animated.View>
```

---

## Loading States

### Rule: Skeleton Loaders Only — No Spinners

Every loading state must use a skeleton that matches the final content layout.

### Skeleton Pattern
```tsx
import SkeletonPlaceholder from 'react-native-skeleton-placeholder';

// Match the actual content layout
if (loading) return (
  <View style={{ padding: Spacing.screenPadding }}>
    <SkeletonPlaceholder borderRadius={BorderRadius.md}>
      {/* Match card layout */}
      <SkeletonPlaceholder.Item
        height={200}
        borderRadius={BorderRadius.lg}
        marginBottom={Spacing.md}
      />
      {/* Match title */}
      <SkeletonPlaceholder.Item
        height={20}
        width="60%"
        marginBottom={Spacing.sm}
      />
      {/* Match body text */}
      <SkeletonPlaceholder.Item
        height={16}
        width="80%"
        marginBottom={Spacing.xs}
      />
      <SkeletonPlaceholder.Item
        height={16}
        width="45%"
      />
    </SkeletonPlaceholder>
  </View>
);
```

### Skeleton Rules
1. **Match final layout exactly** — same heights, widths, spacing
2. **Use wave animation** (left-to-right shimmer) — default in library
3. **Include only structural elements** — no small icons or fine details
4. **Progressive replacement** — replace skeleton parts as data arrives
5. **Don't leave on screen too long** — if loading >5s, show error state
6. **Theme-aware** — use appropriate bg color for light/dark mode

### When to Show Skeletons
- Initial data fetch (screen first load)
- Pull-to-refresh (show skeleton + existing data, not replace)
- Pagination (skeleton at bottom of list)
- Image loading (skeleton placeholder until image loads)

### When NOT to Show Skeletons
- Button loading (use `loading` prop on `<Button>`)
- Inline updates (use optimistic UI)
- Very fast operations (<300ms)

---

## Empty States

### Use `<EmptyState>` Component
```tsx
import { EmptyState } from '../components/EmptyState';

<EmptyState
  icon="📭"
  title="No Messages Yet"
  message="When you receive messages, they'll appear here"
  actionLabel="Start a Conversation"
  onAction={() => navigation.navigate('NewMessage')}
/>
```

### Empty State Rules
1. **Always provide a path forward** — include actionLabel + onAction
2. **Icon should be contextual** — relevant emoji for the empty content type
3. **Title is brief** — 3-5 words, tells what's empty
4. **Message is helpful** — tells user what to do or what will appear
5. **Centered in container** — component handles this automatically
6. **Fade-in entrance** — component handles 400ms animation

### Context-Specific Icons
| Context | Icon | Title Example |
|---------|------|---------------|
| No goals | 🎯 | "No Goals Yet" |
| No messages | 📭 | "No Messages Yet" |
| No friends | 👥 | "No Friends Yet" |
| No activity | 📊 | "No Activity Yet" |
| No search results | 🔍 | "No Results Found" |
| No notifications | 🔔 | "All Caught Up" |
| Error loading | ⚠️ | "Something Went Wrong" |

---

## Error States

### Form Validation Errors
```tsx
// TextInput handles this automatically via error prop
<TextInput
  label="Email"
  value={email}
  onChangeText={setEmail}
  error={emailError}  // Shows red border + error text below
/>
```

### Error State Rules
1. **Show errors after interaction** — not on initial render
2. **Inline placement** — error message directly below the field
3. **Red border + text + icon** — don't rely on color alone
4. **Clear recovery path** — tell user what to fix
5. **Auto-focus first error** — after form submit, focus the first invalid field

### Screen-Level Errors
```tsx
// When entire screen fails to load
<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.screenPadding }}>
  <EmptyState
    icon="⚠️"
    title="Something Went Wrong"
    message="We couldn't load this content. Please try again."
    actionLabel="Retry"
    onAction={handleRetry}
  />
</View>
```

### Toast Errors (Brief)
- Auto-dismiss in 3-5 seconds
- Use for non-critical errors (network blip, minor validation)
- Include retry action if applicable
- Position: top or bottom, not center (doesn't block content)

---

## Disabled States

### Rules
- **Opacity: 50%** (0.5) — consistent across all components
- **No interaction** — onPress should be ignored
- **Clear visual distinction** — user must understand it's not interactive
- `<Button>` handles this automatically via `disabled` prop
- `<TextInput>` handles this via `disabled` prop (60% opacity + gray bg)

### Custom Disabled Elements
```tsx
<View style={{ opacity: isDisabled ? 0.5 : 1 }} pointerEvents={isDisabled ? 'none' : 'auto'}>
  {children}
</View>
```

---

## Screen Transitions

### Navigation Animations
- **Forward navigation**: Slide from right (iOS default)
- **Back navigation**: Slide from left
- **Modal presentation**: Slide from bottom
- **Tab switch**: Crossfade (fast, 200ms)

### List Item Stagger
When rendering a list of items, stagger entrance by 30-50ms per item:

```tsx
import Animated, { FadeInDown } from 'react-native-reanimated';

const renderItem = ({ item, index }) => (
  <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
    <Card>...</Card>
  </Animated.View>
);
```

### Stagger Rules
- **Max stagger items**: 10 (beyond that, enter all at once)
- **Delay per item**: 30-50ms
- **Animation**: FadeInDown + spring for natural feel
- **Don't stagger on re-render** — only initial mount

---

## Modal Animations

### Center Modal
- **Enter**: Fade in + slide down from 300px offset
- **Exit**: Reverse
- **Duration**: `Animations.durations.normal` (300ms)
- Handled by `<BaseModal variant="center">`

### Bottom Sheet
- **Enter**: Slide up from screen bottom
- **Exit**: Slide down
- **Duration**: `Animations.durations.normal` (300ms)
- Drag handle for swipe-to-dismiss
- Handled by `<BaseModal variant="bottom">`

---

## Haptic Feedback

Use haptic feedback for important actions — but don't overuse.

### When to Use
- Save/submit confirmations
- Delete/destructive action confirmations
- Toggle switches
- Pull-to-refresh trigger
- Achievement/reward moments
- Approval/rejection actions

### When NOT to Use
- Regular navigation
- Scrolling
- Typing
- Every button tap (only significant actions)

### Implementation
```tsx
import * as Haptics from 'expo-haptics';

// Light tap (toggles, selections)
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

// Medium tap (confirmations, saves)
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

// Success notification (completed actions)
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

// Warning (destructive action about to happen)
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

// Error (action failed)
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
```

---

## Accessibility: Reduced Motion

Always respect the user's reduced motion preference:

```tsx
import { AccessibilityInfo } from 'react-native';
import { useEffect, useState } from 'react';

const [reduceMotion, setReduceMotion] = useState(false);

useEffect(() => {
  AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
  return () => sub.remove();
}, []);

// Use in animations
const entering = reduceMotion ? FadeIn.duration(0) : FadeInDown.springify();
```

### Rules
- **Skip entrance animations** when reduced motion is enabled
- **Keep functional animations** (loading spinners → use opacity pulse instead)
- **Never disable press feedback** — reduced motion doesn't mean no feedback
- **Crossfade instead of slide** for screen transitions
