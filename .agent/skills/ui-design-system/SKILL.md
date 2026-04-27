---
name: ui-design-system
description: Enforces consistent UI styling across the Ernit app. Use whenever creating, modifying, or reviewing any screen or component that involves styling — colors, typography, spacing, shadows, or border radii.
---

# UI Design System

## Overview

The Ernit app has a centralized design token system in `src/config/`. Every screen and component **must** use these tokens instead of hardcoded values.

**Role of this skill vs. `upgrading-ui-ux`:**
- **`ui-design-system` (this skill)** = the rulebook. Use when creating new components/screens or adding new styles — defines what's allowed.
- **`upgrading-ui-ux`** = the audit workflow. Use when reviewing/upgrading existing screens. See its `references/` subfolder for full token tables (color, typography, spacing, border-radius, shadows).

**Announce at start:** "I'm using the ui-design-system skill to ensure consistent styling."

## Token Files

| File | Import | Purpose |
|------|--------|---------|
| `config/colors.ts` | `Colors` | Brand colors, gradients, semantic colors |
| `config/typography.ts` | `Typography` | Font size / weight / lineHeight presets |
| `config/spacing.ts` | `Spacing` | Padding, margin, gap values |
| `config/borderRadius.ts` | `BorderRadius` | Roundness for cards, buttons, avatars |
| `config/shadows.ts` | `Shadows` | Platform-aware shadow presets |

**Preferred import:**
```tsx
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../config';
```

## Rules — The Non-Negotiables

### 1. Never Hardcode Colors
```tsx
// ❌ BAD
color: '#059669'
backgroundColor: '#6b7280'

// ✅ GOOD
color: Colors.primary
color: Colors.textSecondary
```

### 2. Always Use Typography Presets
```tsx
// ❌ BAD
{ fontSize: 22, fontWeight: '700' }

// ✅ GOOD
Typography.heading2
```

Available presets: `heading1` (26), `heading2` (22), `heading3` (18), `body` (15), `bodyBold` (15/600), `small` (14), `smallBold` (14/600), `caption` (12), `captionBold` (12/600), `tiny` (11).

### 3. Always Use Spacing Constants
```tsx
// ❌ BAD
padding: 16
marginBottom: 12

// ✅ GOOD
padding: Spacing.cardPadding
marginBottom: Spacing.listItemGap
```

Key aliases: `screenPadding` (20), `cardPadding` (16), `sectionGap` (24), `listItemGap` (12).

### 4. Always Use BorderRadius Constants
```tsx
// ❌ BAD
borderRadius: 12

// ✅ GOOD
borderRadius: BorderRadius.md
```

Scale: `xs` (6), `sm` (8), `md` (12), `lg` (16), `xl` (20), `xxl` (24), `pill` (50), `circle` (9999).

### 5. Always Use Shadow Presets
```tsx
// ❌ BAD
shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, ...

// ✅ GOOD
...Shadows.sm             // subtle card shadow
...Shadows.lg             // prominent FAB shadow
...Shadows.colored(Colors.primary)  // brand glow on CTAs
```

## Standard Patterns

### Screen Structure
Every screen follows this skeleton:
```tsx
<MainScreen activeRoute="Goals">
  <StatusBar style="light" />
  <SharedHeader title="Screen Title" subtitle="Optional subtitle" />
  {/* Content */}
</MainScreen>
```

### Card Pattern
```tsx
const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.cardPadding,
    marginBottom: Spacing.listItemGap,
    ...Shadows.sm,
  },
});
```

### Empty State Pattern
**Always use the shared `<EmptyState>` component** from [src/components/EmptyState.tsx](../../../src/components/EmptyState.tsx). Do not hand-roll centered layouts with raw `TouchableOpacity` — CLAUDE.md forbids this.

```tsx
import { EmptyState } from '../components/EmptyState';

<EmptyState
  icon="🎯"
  title="No goals yet"
  message="Set your first challenge and start earning rewards"
  actionLabel="Create Goal"
  onAction={handleCreateGoal}
/>
```

The component handles the centered layout, motion entry (`translateY: 8 → 0`, 400ms timing), `useColors()` theming, and the action button (which internally uses `<Button variant="secondary" size="sm">`).

**Props:**
- `icon?: string` — emoji or icon char
- `title: string` — **required**
- `message?: string` — body text
- `actionLabel?: string` + `onAction?: () => void` — optional CTA (both required together)
- `style?: ViewStyle` — container style override

### Button Variants
**Always use the shared `<Button>` component** from [src/components/Button.tsx](../../../src/components/Button.tsx). Do not define custom button styles — CLAUDE.md forbids this. The component handles press feedback (scale 0.97 bouncy spring), loading state, disabled state, and theme-aware colors via `useColors()`.

```tsx
import Button from '../components/Button';

// Primary (filled brand button — default)
<Button variant="primary" size="md" title="Save Goal" onPress={handleSave} />

// Secondary (soft primary surface with border)
<Button variant="secondary" size="sm" title="Edit" onPress={handleEdit} />

// Danger (destructive)
<Button variant="danger" size="md" title="Delete" onPress={handleDelete} />

// Ghost (transparent, text-only)
<Button variant="ghost" size="sm" title="Cancel" onPress={onClose} />

// Icon-only (44x44 circle — meets accessibility minimum touch target)
<Button variant="icon" icon={<X size={20} color={colors.white} />} onPress={onClose} />

// Gradient primary (for hero CTAs)
<Button variant="primary" size="lg" title="Get Started" onPress={start} gradient fullWidth />

// Loading state (preserves button size, swaps content for spinner)
<Button variant="primary" title="Save" onPress={save} loading={submitting} disabled={!isValid} />
```

**Props:**
- `variant: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon'` — defaults to `'primary'`
- `size: 'sm' | 'md' | 'lg'` — defaults to `'md'` (ignored for `icon` variant)
- `title?: string` — required unless `variant === 'icon'`
- `onPress: () => void` — required
- `disabled?: boolean` — auto-dims to opacity 0.5
- `loading?: boolean` — swaps content for native spinner while preserving size
- `icon?: ReactNode` + `iconPosition?: 'left' | 'right'` — accompanying icon next to text
- `fullWidth?: boolean` — stretches to container width
- `gradient?: boolean` — applies `gradientPrimary` (primary/icon variants only)
- `accessibilityLabel?: string` — falls back to `title`

**Per CLAUDE.md:** no emoji characters or icon components in button **text labels**. The `icon` prop is for accompanying icons alongside text, not replacing it. The `icon` variant is the exception (icon-only is intentional for close/menu buttons).

### List Mounting Animation (via Moti)
```tsx
import { MotiView } from 'moti';

<MotiView
  from={{ opacity: 0, translateY: 16 }}
  animate={{ opacity: 1, translateY: 0 }}
  transition={{ type: 'spring', damping: 15 }}
  style={styles.card}
>
  {/* card content */}
</MotiView>
```

## Loading States — Skeleton Loaders

**CLAUDE.md mandate:** All async/loading states MUST use skeleton loaders, never spinning wheels.

Use the shared `SkeletonBox` from `src/components/SkeletonLoader.tsx`:

```tsx
import { SkeletonBox, FeedPostSkeleton, NotificationSkeleton } from '../components/SkeletonLoader';

// Generic skeleton block
<SkeletonBox width="70%" height={16} />
<SkeletonBox width={48} height={48} borderRadius={24} />

// Pre-built skeletons for common screens
<FeedPostSkeleton />
<NotificationSkeleton />
```

**Pattern for loading state in a screen:**
```tsx
if (loading) {
  return (
    <View style={{ padding: Spacing.screenPadding }}>
      {[1, 2, 3].map((i) => (
        <FeedPostSkeleton key={i} />
      ))}
    </View>
  );
}
```

**Never do:**
```tsx
// ❌ BAD — spinning wheel
{loading && <ActivityIndicator />}

// ✅ GOOD — skeleton placeholder
{loading && <FeedPostSkeleton />}
```

## User Feedback Patterns

**CLAUDE.md mandate:** All actions (save, delete, update) must have haptic or visual feedback.

### Success Feedback (inline animation)
For actions like "message sent" or "item saved" — show inline success state, then auto-dismiss:

```tsx
const [showSuccess, setShowSuccess] = useState(false);

// After successful action:
setShowSuccess(true);
setTimeout(() => {
  setShowSuccess(false);
  onClose();
}, 1500);

// In JSX:
{showSuccess ? (
  <MotiView
    from={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ type: 'spring' }}
    style={{ alignItems: 'center', gap: Spacing.md }}
  >
    <CheckCircle color={Colors.secondary} size={48} />
    <Text style={{ ...Typography.heading3, color: Colors.textPrimary }}>Message sent!</Text>
  </MotiView>
) : (
  /* normal form content */
)}
```

### Error Feedback
For failed operations — use `Alert.alert()` for critical errors, inline error text for form validation:

```tsx
// Critical error (network failure, server error)
Alert.alert('Error', 'Could not save your changes. Please try again.');

// Inline form validation
<Text style={{ ...Typography.caption, color: Colors.error, marginTop: Spacing.xs }}>
  This field is required
</Text>
```

### Disabled State
Buttons that are not actionable should show reduced opacity:

```tsx
<TouchableOpacity
  style={[styles.button, disabled && { opacity: 0.5 }]}
  disabled={disabled}
>
```

## Accessibility

### Minimum Touch Targets
All interactive elements must be at least **44x44 points**:

```tsx
// ❌ BAD — too small
<TouchableOpacity style={{ width: 24, height: 24 }}>

// ✅ GOOD — meets minimum target
<TouchableOpacity style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}>
  <X size={16} />  {/* icon can be smaller, touch target is 44pt */}
</TouchableOpacity>
```

### Accessibility Labels
All interactive elements MUST have `accessibilityLabel` and `accessibilityRole`:

```tsx
<TouchableOpacity
  accessibilityLabel="Close notification"
  accessibilityRole="button"
  onPress={handleClose}
>
  <X size={16} />
</TouchableOpacity>

<TextInput
  accessibilityLabel="Enter your message"
  placeholder="Type here..."
/>
```

### Color Contrast
- Body text on white: use `Colors.textPrimary` (#111827) or `Colors.textSecondary` (#6B7280) — both pass WCAG AA
- Muted text: `Colors.textMuted` (#9CA3AF) — use only for non-essential labels, never for actionable text
- Error text: `Colors.error` (#EF4444) on white — passes AA
- Never use `Colors.primaryTint` or `Colors.primaryBorder` for text — insufficient contrast

### Images
All images that convey meaning need `accessibilityLabel`:

```tsx
<Image
  source={{ uri: profileUrl }}
  accessibilityLabel={`${userName}'s profile photo`}
  style={styles.avatar}
/>
```

## Checklist — Before Submitting Any UI Change

- [ ] No hex color literals — all from `Colors`
- [ ] No magic-number font sizes — all from `Typography`
- [ ] No magic-number padding/margin — all from `Spacing`
- [ ] No magic-number borderRadius — all from `BorderRadius`
- [ ] No inline shadow definitions — all from `Shadows`
- [ ] Screen uses `MainScreen` + `SharedHeader`
- [ ] Cards use the standard card pattern
- [ ] Empty states use the standard empty state pattern
- [ ] Loading states use skeleton loaders (not spinners)
- [ ] Actions have visual feedback (success animation, error alert)
- [ ] All touch targets are at least 44x44 points
- [ ] Interactive elements have `accessibilityLabel` + `accessibilityRole`
