# Spacing & Layout Guide — Ernit App

## Spacing Scale

All values from `src/config/spacing.ts`. Never use raw numbers — always reference `Spacing.*`.

### Base Scale
| Token | Value | Use |
|-------|-------|-----|
| `xxs` | 2px | Hairline gaps (icon-to-badge) |
| `xs` | 4px | Tight gaps (icon padding, inline spacing) |
| `tinyGap` | 6px | Skeleton rows, reaction icon gaps |
| `sm` | 8px | Between closely related items |
| `md` | 12px | List item gaps, form field spacing |
| `lg` | 16px | Card padding, standard gaps |
| `xl` | 20px | Screen edge padding |
| `xxl` | 24px | Between major sections |
| `xxxl` | 32px | Major section breaks |
| `huge` | 40px | Hero section padding |
| `jumbo` | 60px | Landing page section gaps |

### Semantic Aliases (Prefer These)
| Token | Value | Use |
|-------|-------|-----|
| `screenPadding` | 20px | Horizontal padding on all screens |
| `cardPadding` | 16px | Internal padding in cards and modals |
| `sectionGap` | 24px | Vertical gap between major sections |
| `listItemGap` | 12px | Vertical gap between list items |
| `sectionVertical` | 64px | Landing page vertical sections |
| `textareaMinHeight` | 120px | Minimum textarea height |

---

## Layout Rules

### Screen Structure
```tsx
<SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
  <ScrollView contentContainerStyle={{ padding: Spacing.screenPadding }}>
    {/* Screen title */}
    <Text style={[Typography.display, { color: colors.textPrimary }]}>Title</Text>

    {/* Section gap */}
    <View style={{ height: Spacing.sectionGap }} />

    {/* Content section */}
    <Card>...</Card>

    {/* List items */}
    <FlatList
      contentContainerStyle={{ gap: Spacing.listItemGap }}
      ...
    />
  </ScrollView>
</SafeAreaView>
```

### Internal <= External Rule

Content grouping relies on spacing proximity:
- **Internal spacing** (padding inside a component) must be **less than or equal to** external spacing (margin between components)
- This creates clear visual grouping

| Component | Internal (padding) | External (margin/gap) |
|-----------|-------------------|----------------------|
| Card | 16px (`cardPadding`) | 12-24px (`listItemGap` to `sectionGap`) |
| Modal | 16-20px | N/A (overlay-based) |
| Button | 8-12px vertical | 8-16px between buttons |
| Form field | 12-16px | 12px (`listItemGap`) between fields |
| Section | N/A | 24px (`sectionGap`) between sections |

### Consistent Edge Padding
- **All screens**: `Spacing.screenPadding` (20px) on left and right
- **Cards**: `Spacing.cardPadding` (16px) on all sides
- **Modals**: 16-20px content padding
- **Never**: different horizontal padding on the same screen

---

## Touch Targets

### Minimum Sizes (Accessibility)
| Platform | Minimum | Standard |
|----------|---------|----------|
| iOS (Apple HIG) | 44 x 44 pt | 44pt recommended |
| Android (Material) | 48 x 48 dp | 48dp recommended |
| **App standard** | **44 x 44 px** | Use padding to extend hit area |

### Touch Target Rules

1. **Buttons**: Already handled by `<Button>` component (sm=36px, md=44px, lg=52px height)
2. **List items**: Minimum 44px height with full-width tap area
3. **Icon buttons**: If icon is 24px, add 10px padding to reach 44px
4. **Spacing between targets**: Minimum 8px gap to prevent mis-taps
5. **Bottom navigation items**: 44pt minimum each

### Extending Hit Areas
```tsx
// Icon button with adequate touch target
<TouchableOpacity
  style={{ padding: Spacing.sm, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
  onPress={onPress}
>
  <Icon size={24} />
</TouchableOpacity>
```

---

## Component Spacing Reference

### Button Sizes (from Button.tsx)
| Size | Height | Horizontal Padding | Vertical Padding | Font |
|------|--------|-------------------|-----------------|------|
| `sm` | ~36px | 16px | 8px | `small` (14px) |
| `md` | ~44px | 24px | 12px | `bodyBold` (15px) |
| `lg` | ~52px | 32px | 16px | `subheading` (16px) |

### Between Multiple Buttons
```tsx
// Side by side
<View style={{ flexDirection: 'row', gap: Spacing.sm }}>
  <Button variant="ghost">Cancel</Button>
  <Button variant="primary">Save</Button>
</View>

// Stacked
<View style={{ gap: Spacing.md }}>
  <Button variant="primary" fullWidth>Primary Action</Button>
  <Button variant="secondary" fullWidth>Secondary Action</Button>
</View>
```

### Card Content Spacing
```tsx
<Card variant="elevated">
  {/* Card padding is built-in (16px) */}
  <Text style={[Typography.heading3, { color: colors.textPrimary }]}>Title</Text>
  <View style={{ height: Spacing.sm }} />  {/* 8px after title */}
  <Text style={[Typography.body, { color: colors.textSecondary }]}>Body text</Text>
  <View style={{ height: Spacing.lg }} /> {/* 16px before action */}
  <Button variant="secondary" size="sm">Action</Button>
</Card>
```

### Form Field Spacing
```tsx
<View style={{ gap: Spacing.lg }}>  {/* 16px between form fields */}
  <TextInput label="Name" value={name} onChangeText={setName} />
  <TextInput label="Email" value={email} onChangeText={setEmail} />
  <TextInput label="Message" value={msg} onChangeText={setMsg} multiline />
  <View style={{ height: Spacing.sm }} />  {/* Extra space before submit */}
  <Button variant="primary" fullWidth onPress={onSubmit}>Submit</Button>
</View>
```

### Section Spacing
```tsx
// Between major sections on a screen
<View style={{ gap: Spacing.sectionGap }}>  {/* 24px */}
  <SectionA />
  <SectionB />
  <SectionC />
</View>
```

### List Spacing
```tsx
// Between list items
<FlatList
  data={items}
  contentContainerStyle={{
    padding: Spacing.screenPadding,
    gap: Spacing.listItemGap,  // 12px between items
  }}
  renderItem={...}
/>
```

---

## Responsive Scaling

Use `vh()` from `src/utils/responsive.ts` for layout dimensions that must scale with screen height.

### When to Use `vh()`
- Hero section heights
- Spacing that needs to compress on small screens
- Image/illustration containers
- Bottom padding for scroll content

### When NOT to Use `vh()`
- Text sizes (use Typography presets — they're fixed)
- Standard component padding (use Spacing tokens)
- Touch targets (must stay 44px minimum regardless)
- Icon sizes

```tsx
import { vh } from '../utils/responsive';

// Scales proportionally: 200px on 900px screen, ~144px on 648px screen
<View style={{ height: vh(200) }} />

// Hero section that scales
<View style={{ paddingVertical: vh(40), paddingHorizontal: Spacing.screenPadding }}>
```

---

## Border Radius Reference

From `src/config/borderRadius.ts`:

| Token | Value | Use |
|-------|-------|-----|
| `xs` | 6px | Small inline elements |
| `sm` | 8px | Chips, small tags |
| `md` | 12px | Buttons, cards, inputs (default) |
| `lg` | 16px | Large cards, modals |
| `xl` | 20px | Extra large modals |
| `xxl` | 24px | Bottom sheet top corners |
| `pill` | 50px | Badges, progress bars, pills |
| `circle` | 9999px | Avatars, FABs, circular icons |

### Nested Radius Rule
When nesting rounded elements, the inner radius should be:
`inner radius = outer radius - padding`

Example: Card with `lg` (16px) radius and 16px padding → inner elements use `xs` (6px) or no radius.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `padding: 20` hardcoded | `padding: Spacing.screenPadding` |
| `marginBottom: 24` hardcoded | `marginBottom: Spacing.sectionGap` |
| `gap: 10` between list items | `gap: Spacing.listItemGap` (12px) |
| Inconsistent screen padding (16 on one, 20 on another) | Always `Spacing.screenPadding` (20px) |
| Icon button with no padding (24px icon = 24px target) | Add padding to reach 44px minimum |
| `height: Dimensions.get('window').height * 0.3` | `height: vh(270)` |
| Different gap values for same type of list | Use `Spacing.listItemGap` consistently |
| No gap between form fields | Use `gap: Spacing.lg` (16px) in form container |
