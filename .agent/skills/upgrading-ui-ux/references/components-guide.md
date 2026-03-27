# Components Guide — Ernit App

All shared components are in `src/components/`. **Always use these** — never build custom equivalents.

## Button (`src/components/Button.tsx`)

### Variants
| Variant | Appearance | Use When |
|---------|-----------|----------|
| `primary` | Emerald→teal gradient, white text, colored shadow | Main CTA (one per screen) |
| `secondary` | Transparent bg, secondary-colored text + border | Supporting actions |
| `danger` | Red background, white text | Destructive actions (delete, remove) |
| `ghost` | No bg, muted text | Tertiary actions (cancel, skip, dismiss) |
| `icon` | Circular gradient, white icon | Floating action buttons, icon-only actions |

### Sizes
| Size | Height | Font | Use When |
|------|--------|------|----------|
| `sm` | ~36px | `small` (14px) | Inline actions, card footers, compact UI |
| `md` | ~44px | `bodyBold` (15px) | Standard buttons, form submits |
| `lg` | ~52px | `subheading` (16px) | Full-width CTAs, prominent actions |

### Props Reference
```tsx
<Button
  variant="primary"      // primary | secondary | danger | ghost | icon
  size="md"              // sm | md | lg
  onPress={handlePress}
  loading={isLoading}    // Shows spinner, disables button
  disabled={isDisabled}  // 50% opacity, no interaction
  fullWidth              // Stretches to container width
  icon={<IconComponent />}  // Left icon
  iconRight={<IconComponent />}  // Right icon
  accessibilityLabel="Save changes"
>
  Save
</Button>
```

### Button Layout Rules
- **One primary CTA per screen** — never two gradient buttons side by side
- **Side-by-side**: ghost/secondary + primary (left to right, secondary → primary)
- **Stacked**: primary on top, secondary below, ghost at bottom
- **Gap**: `Spacing.sm` (8px) side-by-side, `Spacing.md` (12px) stacked
- **Full-width CTAs** at bottom of forms/modals
- **Disabled = 50% opacity** — handled automatically by component

### Features
- Spring-based press animation (scale 0.97 via `Animations.springs.bouncy`)
- Gradient background on primary/icon variants
- Auto-loading state (spinner replaces text)
- Colored shadow on primary variant (`Shadows.colored`)
- Haptic feedback should be triggered by the parent screen

---

## Card (`src/components/Card.tsx`)

### Variants
| Variant | Appearance | Use When |
|---------|-----------|----------|
| `default` | White bg, small shadow | Standard content cards |
| `elevated` | White bg, medium shadow | Featured content, highlighted cards |
| `outlined` | White bg, 1px border, no shadow | Lists, settings items, subtle containers |
| `glassmorphism` | Frosted white bg, subtle border | Premium/featured areas, over images |

### Props Reference
```tsx
<Card
  variant="elevated"     // default | elevated | outlined | glassmorphism
  onPress={handlePress}  // Makes card tappable (adds press animation)
  noPadding              // Removes internal 16px padding
  style={customStyle}    // Additional styles
>
  {children}
</Card>
```

### Card Layout Rules
- **Default padding**: 16px (`Spacing.cardPadding`) — built into component
- **Border radius**: 16px (`BorderRadius.lg`) — built into component
- **Press animation**: scale(0.97) when `onPress` is provided
- **Between cards**: `Spacing.listItemGap` (12px) in lists, `Spacing.sectionGap` (24px) between sections
- **Use `noPadding`** when card has full-width image at top

### Content Structure Inside Cards
```tsx
<Card variant="elevated">
  {/* Header row */}
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
    <Text style={[Typography.heading3, { color: colors.textPrimary }]}>Title</Text>
    <Text style={[Typography.caption, { color: colors.textMuted }]}>2h ago</Text>
  </View>

  {/* Body — sm gap after header */}
  <View style={{ marginTop: Spacing.sm }}>
    <Text style={[Typography.body, { color: colors.textSecondary }]}>Content</Text>
  </View>

  {/* Footer — lg gap before actions */}
  <View style={{ marginTop: Spacing.lg, flexDirection: 'row', gap: Spacing.sm }}>
    <Button variant="ghost" size="sm">Skip</Button>
    <Button variant="secondary" size="sm">Action</Button>
  </View>
</Card>
```

### When to Use Each Variant
- **List of items** → `outlined` (subtle, no shadow competition)
- **Featured content** → `elevated` (stands out with deeper shadow)
- **Standard content** → `default` (light shadow, balanced)
- **Over images/gradients** → `glassmorphism` (frosted glass effect)

---

## TextInput (`src/components/TextInput.tsx`)

### Props Reference
```tsx
<TextInput
  label="Email Address"      // Label above input
  value={email}
  onChangeText={setEmail}
  placeholder="Enter email"
  error="Invalid email"      // Red border + error text below
  success="Looks good!"      // Green border + success text
  helperText="We'll send a verification code"  // Muted text below
  leftIcon={<MailIcon />}
  rightIcon={<CheckIcon />}
  disabled={false}
  multiline={false}          // Expands to textarea (min 100px height)
  secureTextEntry={false}    // Password field
  keyboardType="email-address"
  autoCapitalize="none"
/>
```

### Input States
| State | Border Color | Border Width | Additional |
|-------|-------------|-------------|------------|
| Default | `colors.border` | 1px | — |
| Focused | `colors.secondary` | 1.5px | — |
| Error | `colors.error` | 1.5px | Red error text below |
| Success | `colors.success` | 1.5px | Green success text below |
| Disabled | `colors.border` | 1px | 60% opacity, gray bg |

### Form Layout
```tsx
<View style={{ gap: Spacing.lg }}>  {/* 16px between fields */}
  <TextInput label="Name" ... />
  <TextInput label="Email" ... />
  <TextInput label="Password" secureTextEntry ... />
  <View style={{ height: Spacing.sm }} />
  <Button variant="primary" fullWidth>Sign Up</Button>
</View>
```

### Rules
- **Always provide `label`** — never use placeholder as label
- **Show errors after interaction** — not on initial render
- **Use `keyboardType`** for email, phone, number fields
- **Use `autoCapitalize="none"`** for email, username fields
- **Multiline** inputs get min 100px height automatically

---

## BaseModal (`src/components/BaseModal.tsx`)

### Variants
| Variant | Appearance | Use When |
|---------|-----------|----------|
| `center` | Centered card, fade+slide animation | Confirmations, alerts, small forms |
| `bottom` | Bottom sheet, slide-up animation | Action sheets, pickers, longer content |

### Props Reference
```tsx
<BaseModal
  visible={isVisible}
  onClose={handleClose}
  variant="bottom"           // center | bottom
  title="Choose Option"      // Header title (optional)
>
  {children}
</BaseModal>
```

### Features
- **Blur overlay** (intensity 30, dark tint)
- **Drag handle** on bottom sheet variant
- **Close button** (X) in top-right
- **ScrollView** for content overflow
- **Max height**: 80% Android, 85% iOS
- **Width**: 90% (center), full (bottom)

### When to Use Each Variant
- **Confirmations** (delete, logout) → `center`
- **Simple forms** (1-3 inputs) → `center`
- **Action sheets** (list of options) → `bottom`
- **Complex forms** (4+ inputs) → `bottom`
- **Pickers** (date, color, category) → `bottom`

### Content Layout Inside Modals
```tsx
<BaseModal visible={show} onClose={close} variant="bottom" title="Edit Profile">
  <View style={{ gap: Spacing.lg }}>
    <TextInput label="Name" ... />
    <TextInput label="Bio" multiline ... />
    <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
      <Button variant="ghost" onPress={close}>Cancel</Button>
      <Button variant="primary" onPress={save} style={{ flex: 1 }}>Save</Button>
    </View>
  </View>
</BaseModal>
```

---

## Avatar (`src/components/Avatar.tsx`)

### Sizes
| Size | Pixels | Use When |
|------|--------|----------|
| `xs` | 24px | Inline mentions, compact lists |
| `sm` | 32px | Comment lists, notification items |
| `md` | 44px | Standard list items, card headers |
| `lg` | 80px | Profile headers, detail views |
| `xl` | 120px | Profile edit, hero sections |

### Props Reference
```tsx
<Avatar
  uri={user.photoURL}
  name={user.displayName}  // Fallback to first initial
  size="md"                // xs | sm | md | lg | xl
/>
```

### Features
- Auto-fallback to first initial of `name` when no `uri`
- Circular shape (border-radius = size / 2)
- Fallback bg: `colors.primaryTint`, text: `colors.primary`
- Image caching (memory + disk)
- 200ms load transition

---

## EmptyState (`src/components/EmptyState.tsx`)

### Props Reference
```tsx
<EmptyState
  icon="📭"                    // Emoji icon (centered)
  title="No Messages Yet"      // heading3 style
  message="Start a conversation to see messages here"  // body style
  actionLabel="Start Chat"     // Optional CTA button
  onAction={handleAction}      // CTA handler
/>
```

### Features
- Entrance animation: fade-in + slide-up (400ms)
- Centered layout
- Optional action button (secondary variant, sm size)

### When to Use
- Empty FlatList / SectionList
- No search results
- No data loaded yet (after loading completes)
- First-time user states

### Rules
- **Always include `title` and `message`** — never just an icon
- **Include `actionLabel` + `onAction`** when there's a clear next step
- **Icon should be relevant** to the empty context (not generic)
- **Message should be helpful** — tell the user what to do, not just what's missing

---

## Anti-Patterns

| Anti-Pattern | Correct Approach |
|-------------|-----------------|
| Custom `TouchableOpacity` styled as button | Use `<Button variant="..." size="...">` |
| Custom `View` with shadow styled as card | Use `<Card variant="...">` |
| Custom `TextInput` from react-native | Use `<TextInput>` from `src/components/TextInput` |
| Custom modal with `Modal` from react-native | Use `<BaseModal variant="...">` |
| Custom circular `Image` for avatars | Use `<Avatar size="..." uri="...">` |
| Custom empty state view | Use `<EmptyState icon="..." title="..." message="...">` |
| `ActivityIndicator` as loading state | Use skeleton loader matching final layout |
| Multiple primary (gradient) buttons on one screen | One primary max — rest should be secondary/ghost |
