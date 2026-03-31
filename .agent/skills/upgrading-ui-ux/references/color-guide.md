# Color Guide — Ernit App

## WCAG Contrast Requirements

| Requirement | Ratio | Applies To |
|-------------|-------|------------|
| AA Normal Text | 4.5:1 | Body text, labels, captions (below 18px) |
| AA Large Text | 3:1 | Headings 18px+ or bold 14px+ |
| AAA Normal Text | 7:1 | Enhanced accessibility |
| UI Components | 3:1 | Borders, icons, focus indicators |

## Pre-Computed Contrast Ratios (App Palette)

### Light Theme (white #FFFFFF background)
| Color | Hex | Ratio vs White | Pass AA? |
|-------|-----|---------------|----------|
| textPrimary | `#111827` | 17.4:1 | YES |
| textSecondary | `#6B7280` | 5.0:1 | YES |
| textMuted | `#6B7280` | 5.0:1 | YES — upgraded from #9CA3AF |
| primary | `#166534` | 8.5:1 | YES — AA all text sizes |
| secondary | `#15803D` | 5.9:1 | YES — AA all text sizes |
| error | `#DC2626` | 4.6:1 | YES — AA compliant |
| success | `#22C55E` | 2.5:1 | NO — use successDark for text |
| warning | `#F59E0B` | 2.3:1 | NO — use warningDark for text |

### Light Theme (surface #FAFAF5 background)
| Color | Hex | Ratio vs Surface | Pass AA? |
|-------|-----|------------------|----------|
| textPrimary | `#111827` | 16.1:1 | YES |
| textSecondary | `#6B7280` | 4.9:1 | YES |
| primary | `#166534` | 8.3:1 | YES — AA all text sizes |

### Dark Theme (#1C1C1C surface)
| Color | Hex | Ratio vs Dark Surface | Pass AA? |
|-------|-----|----------------------|----------|
| textPrimary (dark) | `#F9FAFB` | 15.2:1 | YES |
| textSecondary (dark) | `#9CA3AF` | 6.2:1 | YES |
| primary (dark) | `#22C55E` | 7.2:1 | YES |
| accent (dark) | `#86EFAC` | 10.8:1 | YES |

### Key Takeaways
- `textMuted` (#6B7280) passes AA at 5.0:1 — safe for secondary content
- `primary` (#166534) passes AA for ALL text sizes at 8.5:1 — can be used as text color on white
- `secondary` (#15803D) passes AA for all text sizes at 5.9:1
- `accent` (#22C55E) at 2.5:1 on white — use for icons/large text only, not small body text
- On dark surfaces, the lighter palette variants (dark theme) all pass comfortably

---

## Color Hierarchy Rules

### Button Colors
| Variant | Background | Text | Border | Shadow |
|---------|-----------|------|--------|--------|
| `primary` | Gradient `[#166534, #14532D]` | `#FFFFFF` (white) | none | `Shadows.colored(primary)` |
| `secondary` | `transparent` | `colors.secondary` | `colors.secondary` | none |
| `danger` | `colors.error` (#DC2626) | `#FFFFFF` (white) | none | none |
| `ghost` | `transparent` | `colors.textSecondary` | none | none |
| `icon` | Gradient `[#166534, #14532D]` | `#FFFFFF` (white) | none | `Shadows.colored(primary)` |

### CTA Hierarchy (Per Screen)
- **One primary CTA** per screen — most important action (gradient button)
- **Secondary actions** — supporting actions (outline/text style)
- **Ghost/text buttons** — tertiary actions (cancel, dismiss, "skip")
- **Danger buttons** — destructive only (delete, remove)

### When to Use Gradients
- Primary CTA buttons (the one main action per screen)
- Header/hero sections (onboarding, landing)
- Progress indicators, achievement badges
- **Never**: cards, backgrounds of content sections, form elements

---

## Semantic Color Usage

### Status Colors — When to Use Each
| Status | Color Token | Use Cases |
|--------|------------|-----------|
| Error | `colors.error` (#EF4444) | Form validation errors, failed actions, destructive warnings |
| Success | `colors.success` (#22C55E) | Completed actions, approved states, positive metrics |
| Warning | `colors.warning` (#F59E0B) | Cautions, pending states, approaching limits |
| Info | `colors.info` (#3B82F6) | Tips, informational banners, help text |

### Status Color Rules
1. **Never rely on color alone** — always pair with icon + text
2. Use `*Light` variants for backgrounds: `colors.errorLight`, `colors.successLight`, `colors.warningLight`
3. Use base color for icons and borders
4. Use `*Dark` variant for text on light backgrounds (better contrast)

### Category Colors (Goal/Experience Chips)
| Category | Color | Hex |
|----------|-------|-----|
| Pink | `colors.categoryPink` | `#EC4899` |
| Amber | `colors.categoryAmber` | `#F59E0B` |
| Violet | `colors.categoryViolet` | `#8B5CF6` |
| Blue | `colors.categoryBlue` | `#3B82F6` |
| Indigo | `colors.categoryIndigo` | `#6366F1` |

- Use as chip/badge backgrounds with white text
- Ensure 4.5:1 contrast for text on these backgrounds
- In dark mode, these may need lightened variants

---

## Dark Mode Rules

### Background Surfaces
- **Never use pure black** (#000000) — use `#1C1C1C` or darker grays
- Surface hierarchy: `background` < `surface` < `surfaceElevated`
- Use alpha-based tints for depth: `whiteAlpha10`, `whiteAlpha15`, `whiteAlpha20`

### Color Adjustments
- **Desaturate vibrant colors** — saturated colors "vibrate" on dark backgrounds
- Light theme `#166534` → dark theme `#22C55E` (lighter, brighter on dark)
- Light theme `#15803D` → dark theme `#4ADE80` (lighter green for dark surfaces)
- Test: if a color "glows" against dark surface, it's too saturated

### Text on Dark Surfaces
- Primary text: `#F9FAFB` (off-white, not pure white #FFFFFF)
- Secondary text: `#9CA3AF` (comfortable contrast without harshness)
- Muted/placeholder: reduced alpha white (`whiteAlpha60`)

### Borders & Dividers
- Light theme: `#E5E7EB` (gray-200) on white
- Dark theme: `whiteAlpha15` or `whiteAlpha20` on dark surface
- Must be visible but subtle — test at different screen brightness levels

### Shadows
- Light theme: dark shadows work naturally
- Dark theme: shadows are less visible — consider:
  - Increasing elevation differentiation via surface color instead
  - Using `Shadows.colored(primary)` for branded glow effects
  - Using border instead of shadow for card separation

---

## Anti-Patterns

| Anti-Pattern | Fix |
|-------------|-----|
| Hardcoded `#6B7280` in styles | Use `colors.textSecondary` via `useColors()` |
| `Colors.primary` import instead of hook | Use `const colors = useColors()` for theme-awareness |
| `accent` (#22C55E) text on white background | Only use `accent` for large text (18px+) or icons — `primary` and `secondary` are safe for all text sizes |
| Same color for text and icons | Icons can use `textMuted`, text should use `textPrimary`/`textSecondary` |
| Red text without icon for errors | Always pair `colors.error` with an error icon |
| Category chip with low-contrast text | Ensure white text on category colors, or use `*Light` bg with dark text |
| Gradient on non-CTA elements | Reserve gradients for primary buttons and hero sections only |
| Opacity < 0.3 for meaningful content | Opacity below 0.3 is nearly invisible — use at least 0.4 for visible elements |
