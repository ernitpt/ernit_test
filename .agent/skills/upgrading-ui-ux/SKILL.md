---
name: upgrading-ui-ux
description: "Audit and upgrade UI/UX quality across the Ernit React Native app. Use when reviewing screens for visual quality, fixing spacing/color/typography issues, upgrading component usage, or performing a full UI audit. Triggers: 'upgrade UI', 'fix spacing', 'audit screen', 'improve design', 'polish UI', 'review visual quality', 'UI cleanup', 'design review', 'make it look better', 'fix colors', 'fix typography'."
---

# Upgrading UI/UX — Ernit App Audit & Fix Skill

Systematic workflow for auditing and upgrading screens to match production-grade UI/UX standards. Uses the app's existing design tokens and shared components.

**Role of this skill vs. `ui-design-system`:**
- **`upgrading-ui-ux` (this skill)** = the audit workflow. Use when reviewing/upgrading an existing screen — per-screen checklist, common fix patterns, token reference tables.
- **`ui-design-system`** = the rulebook / enforcement reference. Use when writing new code — defines the non-negotiable rules (tokens only, shared components, skeleton loaders).

## When to Use

**Must use:**
- Auditing any screen for visual quality
- Fixing spacing, color, or typography inconsistencies
- Upgrading screens to use shared components (`Button`, `Card`, `TextInput`, etc.)
- Preparing screens for production polish

**Skip:**
- Backend/API work, pure logic changes, infrastructure

## Audit Workflow

### Per-Screen Process

1. **Read the screen file** completely
2. **Run the Quick Audit Checklist** below (mark pass/fail)
3. **Check references** for specific fix patterns:
   - [Color Guide](references/color-guide.md) — palette, contrast, dark mode
   - [Typography Guide](references/typography-guide.md) — type scale, weights, readability
   - [Spacing & Layout Guide](references/spacing-layout.md) — grid, touch targets, padding
   - [Components Guide](references/components-guide.md) — buttons, cards, inputs, modals
   - [Animation & States Guide](references/animation-states.md) — loading, empty, error, press feedback
4. **Apply fixes** using the app's tokens and components
5. **Verify** dark mode + light mode both look correct

### Batch Audit (Full App)

1. List all screens: `src/screens/**/*.tsx`
2. Prioritize: user-facing flows first (onboarding → home → goals → social → settings)
3. Audit each screen using the per-screen process
4. Track progress with TodoWrite

---

## Quick Audit Checklist

Run this on every screen. Items are ordered by visual impact.

### Colors (Priority 1)
- [ ] All colors from `useColors()` hook — no hardcoded hex values
- [ ] Text on backgrounds meets 4.5:1 contrast (3:1 for large text 18px+)
- [ ] Primary actions use `colors.primary` / gradient — not custom colors
- [ ] Error/success/warning use semantic tokens (`colors.error`, `colors.success`, `colors.warning`)
- [ ] Dark mode tested — no invisible text, no lost borders, no harsh contrast

### Typography (Priority 2)
- [ ] All text uses `Typography` presets — no inline `fontSize`/`fontWeight`
- [ ] Headings use `heading1-3` (weight 700), not body with bold
- [ ] Body text is `body` (15px) or `small` (14px) — never below 11px
- [ ] Labels use `smallBold` or `captionBold` — not body
- [ ] Emoji uses emoji scale presets, not arbitrary sizes

### Spacing (Priority 3)
- [ ] Screen padding is `Spacing.screenPadding` (20px)
- [ ] Card internal padding is `Spacing.cardPadding` (16px)
- [ ] Section gaps use `Spacing.sectionGap` (24px)
- [ ] List items separated by `Spacing.listItemGap` (12px)
- [ ] No magic numbers — all spacing from `Spacing.*` tokens
- [ ] Touch targets are 44px+ minimum (buttons, icons, list items)

### Components (Priority 4)
- [ ] All buttons use `<Button>` component — no custom `TouchableOpacity` buttons
- [ ] All cards use `<Card>` component — no custom card containers
- [ ] All text inputs use `<TextInput>` component — no custom inputs
- [ ] All modals use `<BaseModal>` component — no custom modals
- [ ] All avatars use `<Avatar>` component — no custom image circles
- [ ] Empty lists use `<EmptyState>` component

### States (Priority 5)
- [ ] Loading states use skeleton loaders — no spinners
- [ ] Empty states have icon + message + CTA button
- [ ] Error states show inline message with recovery action
- [ ] Disabled elements have 50% opacity
- [ ] Form inputs have error/success/focus states

### Animation & Feedback (Priority 6)
- [ ] Tappable elements have press feedback (scale 0.97 spring)
- [ ] Screen transitions use consistent animation
- [ ] List items stagger entrance (30-50ms per item)
- [ ] Modals slide in (bottom: from below, center: fade+scale)
- [ ] Haptic feedback on important actions (save, delete, approve)

---

## Token Quick Reference

### Imports
```tsx
// Static tokens (safe to use in StyleSheet.create and outside components)
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import { Animations } from '../config/animations';

// Theme-aware hook (use inside components, resolves via ThemeContext)
import { useColors } from '../config';       // re-exported from src/config
// or equivalently: import { useColors } from '../themes/useColors';

// Responsive vertical sizing
import { vh } from '../utils/responsive';
```

Inside a component:
```tsx
const colors = useColors();
// then use colors.primary, colors.textPrimary, etc. — these adapt to theme
```

### Color Palette (Light)
| Token | Hex | Use |
|-------|-----|-----|
| `primary` | `#166534` | Primary actions, CTA (8.5:1 AA all sizes) |
| `secondary` | `#15803D` | Secondary actions, links (5.9:1 AA) |
| `accent` | `#22C55E` | Accents, highlights, icons |
| `textPrimary` | `#111827` | Main text |
| `textSecondary` | `#6B7280` | Supporting text |
| `textMuted` | `#6B7280` | Placeholders, hints |
| `surface` | `#FAFAF5` | Card backgrounds (warm white) |
| `border` | `#E5E7EB` | Dividers, borders |
| `error` | `#DC2626` | Errors, destructive |
| `success` | `#22C55E` | Success confirmations |
| `warning` | `#F59E0B` | Warnings, cautions |

### Typography Scale
| Preset | Size | Weight | Use |
|--------|------|--------|-----|
| `display` | 32 | 700 | Page titles |
| `heading1` | 26 | 700 | Section titles |
| `heading2` | 22 | 700 | Card titles |
| `heading3` | 18 | 700 | Subsection titles |
| `subheading` | 16 | 600 | Emphasized labels |
| `body` | 15 | 400 | Body text |
| `bodyBold` | 15 | 600 | Emphasized body |
| `small` | 14 | 400 | Secondary info |
| `smallBold` | 14 | 600 | Labels, tags |
| `caption` | 12 | 400 | Timestamps, hints |
| `captionBold` | 12 | 600 | Badge text |
| `tiny` | 11 | 600 | Minimal labels |
| `tag` | 10 | 800 | Tags, chips |

### Spacing Scale
| Token | Value | Use |
|-------|-------|-----|
| `xs` | 4 | Icon gaps, tight spacing |
| `sm` | 8 | Between related items |
| `md` | 12 | List item gaps |
| `lg` | 16 | Card padding, standard gap |
| `xl` | 20 | Screen padding |
| `xxl` | 24 | Section gaps |
| `xxxl` | 32 | Major section breaks |
| `screenPadding` | 20 | Full-width screen edges |
| `cardPadding` | 16 | Inside cards/modals |
| `sectionGap` | 24 | Between major sections |
| `listItemGap` | 12 | Between list items |

### Border Radius
| Token | Value | Use |
|-------|-------|-----|
| `sm` | 8 | Small chips, tags |
| `md` | 12 | Buttons, cards, inputs |
| `lg` | 16 | Large cards, modals |
| `xl` | 20 | Extra large modals |
| `pill` | 50 | Badges, progress bars |
| `circle` | 9999 | Avatars, FABs |

### Shadows
| Token | Use |
|-------|-----|
| `Shadows.sm` | Cards, list items |
| `Shadows.md` | Modals, floating elements |
| `Shadows.lg` | FABs, prominent CTAs |
| `Shadows.colored(color)` | Brand-colored glow |

---

## Common Fix Patterns

### Fix: Hardcoded color
```tsx
// BAD
<Text style={{ color: '#6B7280' }}>Hello</Text>

// GOOD
const colors = useColors();
<Text style={[Typography.body, { color: colors.textSecondary }]}>Hello</Text>
```

### Fix: Custom button instead of shared component
```tsx
// BAD
<TouchableOpacity style={styles.button} onPress={onSave}>
  <Text style={styles.buttonText}>Save</Text>
</TouchableOpacity>

// GOOD
import { Button } from '../components/Button';
<Button variant="primary" size="md" onPress={onSave}>Save</Button>
```

### Fix: Missing skeleton loader
Use the project's shared `SkeletonBox` from [src/components/SkeletonLoader.tsx](../../../src/components/SkeletonLoader.tsx) (plus pre-built `FeedPostSkeleton`, `NotificationSkeleton`).

```tsx
// BAD
if (loading) return <ActivityIndicator />;

// GOOD — use SkeletonBox that matches the final layout
import { SkeletonBox } from '../components/SkeletonLoader';

if (loading) return (
  <View style={{ padding: Spacing.screenPadding, gap: Spacing.sm }}>
    <SkeletonBox width="100%" height={200} borderRadius={BorderRadius.lg} />
    <SkeletonBox width="60%" height={20} />
    <SkeletonBox width="40%" height={16} />
  </View>
);
```

### Fix: Inline font size instead of Typography preset
```tsx
// BAD
<Text style={{ fontSize: 18, fontWeight: '700' }}>Title</Text>

// GOOD
<Text style={[Typography.heading3, { color: colors.textPrimary }]}>Title</Text>
```

### Fix: Magic number spacing
```tsx
// BAD
<View style={{ padding: 20, marginBottom: 24 }}>

// GOOD
<View style={{ padding: Spacing.screenPadding, marginBottom: Spacing.sectionGap }}>
```

### Fix: Missing press feedback on tappable card
```tsx
// BAD
<TouchableOpacity onPress={onPress}>
  <View style={styles.card}>...</View>
</TouchableOpacity>

// GOOD
<Card variant="elevated" onPress={onPress}>...</Card>
```

---

## Dark Mode Verification

After any visual change, verify both themes:

1. Check `useColors()` is used (not raw `Colors` import) in components
2. Text is readable on dark surfaces (`colors.textPrimary` on `colors.surface`)
3. Borders are visible (`colors.border` adjusts per theme)
4. Shadows work on both themes (dark mode may need `colored()` shadow)
5. Status colors (error/success/warning) have sufficient contrast on dark backgrounds
6. Overlays use alpha-based colors (`colors.overlay`, `colors.whiteAlpha*`)

---

## After Completing Audit

1. Run `npm run log "style: upgraded [ScreenName] UI/UX"` for each screen
2. Test on both iOS and Android simulators
3. Verify dark mode and light mode
4. Check responsive scaling with `vh()` utility for layout dimensions
