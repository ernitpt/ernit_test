# Typography Guide — Ernit App

## Type Scale — Complete Reference

All presets are in `src/config/typography.ts`. Always use these — never inline `fontSize` or `fontWeight`.

### Display & Heading Tier (Structural Hierarchy)
| Preset | Size | Weight | Line Height | Ratio | When to Use |
|--------|------|--------|-------------|-------|-------------|
| `hero` | 72 | 800 | 80 | 1.11 | Landing page hero numbers |
| `heroSub` | 42 | 700 | 50 | 1.19 | Landing hero subtitles |
| `displayLarge` | 40 | 700 | 48 | 1.20 | Onboarding titles |
| `brandLogo` | 46 | 800 | 54 | 1.17 | Brand/logo text only |
| `display` | 32 | 700 | 40 | 1.25 | Page-level titles (top of screen) |
| `heading1` | 26 | 700 | 32 | 1.23 | Major section titles |
| `heading2` | 22 | 700 | 28 | 1.27 | Card titles, modal titles |
| `heading3` | 18 | 700 | 24 | 1.33 | Subsection titles, list group headers |
| `large` | 20 | 700 | 26 | 1.30 | Emphasized numbers, stats |

### Body Tier (Content)
| Preset | Size | Weight | Line Height | Ratio | When to Use |
|--------|------|--------|-------------|-------|-------------|
| `subheading` | 16 | 600 | 22 | 1.38 | Emphasized labels, nav items |
| `body` | 15 | 400 | 22 | 1.47 | Default body text |
| `bodyBold` | 15 | 600 | 22 | 1.47 | Emphasized body (names, amounts) |
| `bodyMedium` | 15 | 500 | 22 | 1.47 | Medium-emphasis body text |

### Small Tier (Supporting)
| Preset | Size | Weight | Line Height | Ratio | When to Use |
|--------|------|--------|-------------|-------|-------------|
| `small` | 14 | 400 | 20 | 1.43 | Secondary info, descriptions |
| `smallBold` | 14 | 600 | 20 | 1.43 | Labels, form labels, tab items |
| `smallMedium` | 14 | 500 | 20 | 1.43 | Medium-emphasis secondary text |

### Caption & Micro Tier (Metadata)
| Preset | Size | Weight | Line Height | Ratio | When to Use |
|--------|------|--------|-------------|-------|-------------|
| `caption` | 12 | 400 | 16 | 1.33 | Timestamps, helper text, hints |
| `captionBold` | 12 | 600 | 16 | 1.33 | Badge counts, chip text |
| `tiny` | 11 | 600 | 14 | 1.27 | Minimal labels, legal text |
| `tag` | 10 | 800 | 14 | 1.40 | Tags, small chips, status labels |
| `micro` | 9 | 700 | 12 | 1.33 | Absolute minimum — use sparingly |

### Emoji Scale
| Preset | Size | When to Use |
|--------|------|-------------|
| `emojiSmall` | 24 | Inline with body text |
| `emojiBase` | 28 | List item icons |
| `emojiMedium` | 36 | Card decorations |
| `emoji` | 48 | Empty state icons |
| `emojiLarge` | 64 | Hero/feature icons |

---

## Weight Hierarchy Rules

| Weight | Value | Role | Example |
|--------|-------|------|---------|
| ExtraBold | 800 | Brand/display only | Logo, hero numbers, tags |
| Bold | 700 | Headings, emphasis | Page titles, section headers |
| SemiBold | 600 | Subheadings, labels | Form labels, nav items, bold body |
| Medium | 500 | Subtle emphasis | Medium-weight variants |
| Regular | 400 | Body text, descriptions | Default reading text |

### Rules
1. **Maximum 2 weights per text block** — e.g., heading (700) + body (400)
2. **Never use bold (700) for body text** — use `bodyBold` (600) for emphasis
3. **Never use regular (400) for headings** — minimum 600 for any heading role
4. **Tags/chips use 800** — small text needs extra weight to be readable
5. **Numbers in data displays** use `large` (700) or `bodyBold` (600)

---

## Context-Specific Typography

### Screen Titles
```tsx
// Top of screen
<Text style={[Typography.display, { color: colors.textPrimary }]}>Screen Title</Text>

// With subtitle
<Text style={[Typography.display, { color: colors.textPrimary }]}>Title</Text>
<Text style={[Typography.body, { color: colors.textSecondary }]}>Subtitle description</Text>
```

### Modal Titles
```tsx
// Center modal
<Text style={[Typography.heading2, { color: colors.textPrimary }]}>Modal Title</Text>

// Bottom sheet
<Text style={[Typography.heading3, { color: colors.textPrimary }]}>Sheet Title</Text>
```

### Card Content
```tsx
// Card header
<Text style={[Typography.heading3, { color: colors.textPrimary }]}>Card Title</Text>
// Card body
<Text style={[Typography.body, { color: colors.textSecondary }]}>Description text</Text>
// Card metadata
<Text style={[Typography.caption, { color: colors.textMuted }]}>2 hours ago</Text>
```

### List Items
```tsx
// Primary text
<Text style={[Typography.bodyBold, { color: colors.textPrimary }]}>Item Name</Text>
// Secondary text
<Text style={[Typography.small, { color: colors.textSecondary }]}>Supporting info</Text>
```

### Form Labels
```tsx
// Input label (handled by TextInput component, but for reference)
<Text style={[Typography.smallBold, { color: colors.textPrimary }]}>Label</Text>
// Helper text
<Text style={[Typography.caption, { color: colors.textMuted }]}>Helper text here</Text>
// Error text
<Text style={[Typography.caption, { color: colors.error }]}>Error message</Text>
```

### Badges & Tags
```tsx
// Status badge
<Text style={[Typography.captionBold, { color: colors.white }]}>Active</Text>
// Small tag
<Text style={[Typography.tag, { color: colors.white }]}>NEW</Text>
```

### Empty States
```tsx
// Title
<Text style={[Typography.heading3, { color: colors.textPrimary }]}>No Items Yet</Text>
// Message
<Text style={[Typography.body, { color: colors.textSecondary }]}>Description</Text>
```

---

## Readability Rules

### Minimum Sizes
| Context | Minimum Size | Preset |
|---------|-------------|--------|
| Body text | 15px | `body` |
| Secondary text | 14px | `small` |
| Captions/metadata | 12px | `caption` |
| Absolute minimum | 11px | `tiny` |
| **Never below** | 9px | `micro` (rare) |

### Line Height
- All presets have pre-set line heights — always use the preset, not custom line height
- Body text ratio: ~1.47 (22/15) — comfortable for reading
- Headings: 1.2-1.3 ratio — tighter for visual impact
- Caption: 1.33 (16/12) — adequate for small text

### Line Length
- Mobile screens naturally constrain line length
- For wider layouts (tablets), max-width text to ~75 characters
- Use `Spacing.screenPadding` (20px) on both sides to constrain

### Letter Spacing
- Trust the system font defaults (Inter/SF Pro) — don't add custom letterSpacing
- Exception: `tag` and `micro` presets may benefit from +0.5 tracking
- Never use negative letter spacing on mobile

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `fontSize: 18, fontWeight: '700'` inline | Use `Typography.heading3` |
| `fontSize: 14, fontWeight: '600'` inline | Use `Typography.smallBold` |
| Using `body` for a card title | Use `heading3` (18px/700) for card titles |
| Using `heading3` for body text | Use `body` (15px/400) for readable content |
| Using `caption` for primary content | Caption (12px) is for metadata only — use `small` (14px) minimum |
| Custom emoji sizing `fontSize: 48` | Use `Typography.emoji` preset |
| Missing color alongside Typography | Always pair: `[Typography.body, { color: colors.textPrimary }]` |
| Using `fontWeight: 'bold'` string | Use numeric: `fontWeight: '700'` (but prefer Typography presets) |
