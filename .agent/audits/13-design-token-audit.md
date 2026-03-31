# Design Token Compliance Audit Report
**Generated:** 2026-03-29

## Summary
| Category | Violations | Files Affected |
|----------|-----------|----------------|
| Hardcoded hex colors | 2 | 1 |
| Hardcoded rgba colors | 19 | 3 |
| Hardcoded font sizes | 11 | 1 |
| Hardcoded border radius | 27 | 12 |
| Hardcoded spacing (padding/margin/gap) | 51 | 14 |
| Missing shared component (TouchableOpacity instead of Button) | 67 files use TouchableOpacity | 32 screens, 35 components |
| Missing BaseModal (direct RN Modal import) | 1 | 1 |
| Button content violations | 0 | — |
| **Total token violations (excl. TouchableOpacity)** | **110** | **— ** |

---

## Worst Offender Files
| Rank | File | Violations | Breakdown |
|------|------|-----------|-----------|
| 1 | `src/screens/recipient/AchievementDetailScreen.tsx` | 51 | 2 hex, 7 rgba, 11 font-size, 5 borderRadius, 15 spacing |
| 2 | `src/components/JourneyDemo.tsx` | 13 | 5 borderRadius, 8 spacing |
| 3 | `src/screens/ChallengeLandingScreen.tsx` | 10 | 6 rgba, 2 borderRadius, 2 spacing |
| 4 | `src/screens/HeroPreviewScreen.tsx` | 10 | 6 rgba, 2 borderRadius, 2 spacing |
| 5 | `src/components/SkeletonLoader.tsx` | 9 | 9 spacing (marginBottom) |
| 6 | `src/screens/FriendProfileScreen.tsx` | 7 | 3 spacing (paddingBottom:80), 1 gap |
| 7 | `src/screens/UserProfileScreen.tsx` | 3 | 3 spacing (paddingBottom:80+) |
| 8 | `src/components/FooterNavigation.tsx` | 3 | 3 borderRadius |
| 9 | `src/components/SideMenu.tsx` | 2 | 2 borderRadius |
| 10 | `src/components/AudioPlayer.tsx` | 2 | 2 borderRadius |

---

## Findings by Category

### 1. Hardcoded Hex Colors

| File | Line | Value | Suggested Token |
|------|------|-------|----------------|
| `src/screens/recipient/AchievementDetailScreen.tsx` | 978 | `shadowColor: '#000'` | `Colors.black` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 982 | `shadowColor: '#000'` | `Colors.black` |

**Note:** The `src/config/shadows.ts` tokens themselves use `'#000000'` inline in their definitions (lines 20, 29, 37, 45). This is acceptable only within the config file itself, not in screen/component files.

---

### 2. Hardcoded RGBA Colors

These should use existing `Colors.*` tokens wherever possible.

| File | Line | Value | Suggested Token |
|------|------|-------|----------------|
| `src/screens/HeroPreviewScreen.tsx` | 390 | `backgroundColor: 'rgba(0,0,0,0.5)'` | `Colors.overlay` |
| `src/screens/HeroPreviewScreen.tsx` | 560 | `'rgba(16, 185, 129, 0.1)'` in outputRange | Add token: `Colors.secondaryAlpha10` |
| `src/screens/HeroPreviewScreen.tsx` | 560 | `'rgba(245, 158, 11, 0.1)'` in outputRange | `Colors.warningAlpha25` closest; add `Colors.warningAlpha10` |
| `src/screens/HeroPreviewScreen.tsx` | 564 | `'rgba(16, 185, 129, 0.3)'` in outputRange | Add token: `Colors.secondaryAlpha30` |
| `src/screens/HeroPreviewScreen.tsx` | 564 | `'rgba(245, 158, 11, 0.3)'` in outputRange | `Colors.warningAlpha25` closest; add `Colors.warningAlpha30` |
| `src/screens/HeroPreviewScreen.tsx` | 1253 | `textShadowColor: 'rgba(16, 185, 129, 0.4)'` | Add token: `Colors.primaryAlpha40` |
| `src/screens/HeroPreviewScreen.tsx` | 1541 | `borderColor: 'rgba(255,255,255,0.15)'` | `Colors.whiteAlpha15` |
| `src/screens/HeroPreviewScreen.tsx` | 1565 | `backgroundColor: 'rgba(255,255,255,0.06)'` | `Colors.whiteAlpha08` (closest) |
| `src/screens/ChallengeLandingScreen.tsx` | 392 | `backgroundColor: 'rgba(0,0,0,0.5)'` | `Colors.overlay` |
| `src/screens/ChallengeLandingScreen.tsx` | 576 | `'rgba(16, 185, 129, 0.1)'` in outputRange | Add token: `Colors.secondaryAlpha10` |
| `src/screens/ChallengeLandingScreen.tsx` | 576 | `'rgba(245, 158, 11, 0.1)'` in outputRange | Add `Colors.warningAlpha10` |
| `src/screens/ChallengeLandingScreen.tsx` | 580 | `'rgba(16, 185, 129, 0.3)'` in outputRange | Add token: `Colors.secondaryAlpha30` |
| `src/screens/ChallengeLandingScreen.tsx` | 580 | `'rgba(245, 158, 11, 0.3)'` in outputRange | Add `Colors.warningAlpha30` |
| `src/screens/ChallengeLandingScreen.tsx` | 1290 | `textShadowColor: 'rgba(16, 185, 129, 0.4)'` | Add token: `Colors.primaryAlpha40` |
| `src/screens/ChallengeLandingScreen.tsx` | 1578 | `borderColor: 'rgba(255,255,255,0.15)'` | `Colors.whiteAlpha15` |
| `src/screens/ChallengeLandingScreen.tsx` | 1602 | `backgroundColor: 'rgba(255,255,255,0.06)'` | `Colors.whiteAlpha08` (closest) |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1006 | `color: 'rgba(255,255,255,0.7)'` | `Colors.whiteAlpha70` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1008 | `backgroundColor: 'rgba(255,255,255,0.2)'` | `Colors.whiteAlpha20` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1011 | `color: 'rgba(255,255,255,0.7)'` | `Colors.whiteAlpha70` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1015 | `backgroundColor: 'rgba(255,255,255,0.2)'` | `Colors.whiteAlpha20` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1018 | `color: 'rgba(255,255,255,0.7)'` | `Colors.whiteAlpha70` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1027 | `color: 'rgba(255,255,255,0.4)'` | `Colors.whiteAlpha40` |

**Note:** `src/components/FeedPost.tsx:380-381` uses `rgba()` inside template literal CSS shadow strings for web — these are web-specific and not RN style objects; treated as a lower-severity deviation.

---

### 3. Hardcoded Font Sizes

All violations are in a single file: `src/screens/recipient/AchievementDetailScreen.tsx`.
This is the achievement/share card render path (~lines 970–1030).

| File | Line | Value | Status | Suggested Fix |
|------|------|-------|--------|--------------|
| `AchievementDetailScreen.tsx` | 979 | `fontSize: 120` | No token exists | Add `Typography.emojiXL` or `Typography.shareHero` |
| `AchievementDetailScreen.tsx` | 986 | `fontSize: 120` | No token exists | Same as above |
| `AchievementDetailScreen.tsx` | 994 | `fontSize: 52` | No token exists | Add `Typography.displayXL` |
| `AchievementDetailScreen.tsx` | 998 | `fontSize: 56` | No token exists | Add `Typography.displayXXL` |
| `AchievementDetailScreen.tsx` | 1005 | `fontSize: 80` | No token exists | Add `Typography.statHero` |
| `AchievementDetailScreen.tsx` | 1006 | `fontSize: 28` | Has token: `Typography.emojiBase` | Use `Typography.emojiBase.fontSize` |
| `AchievementDetailScreen.tsx` | 1010 | `fontSize: 80` | No token exists | Add `Typography.statHero` |
| `AchievementDetailScreen.tsx` | 1011 | `fontSize: 28` | Has token: `Typography.emojiBase` | Use `Typography.emojiBase.fontSize` |
| `AchievementDetailScreen.tsx` | 1017 | `fontSize: 80` | No token exists | Add `Typography.statHero` |
| `AchievementDetailScreen.tsx` | 1018 | `fontSize: 28` | Has token: `Typography.emojiBase` | Use `Typography.emojiBase.fontSize` |
| `AchievementDetailScreen.tsx` | 1027 | `fontSize: 32` | Has token: `Typography.display` | Use `Typography.display.fontSize` or spread `...Typography.display` |

**Severity note:** Font sizes 52, 56, 80, and 120 have **no existing token**. These are new tokens that need to be defined first.

---

### 4. Hardcoded Border Radius

Valid `BorderRadius` token values: `6(xs), 8(sm), 12(md), 16(lg), 20(xl), 24(xxl), 50(pill), 9999(circle)`.

| File | Line | Value | Status | Suggested Fix |
|------|------|-------|--------|--------------|
| `src/screens/AuthScreen.tsx` | 992 | `borderRadius: 7` | No token (radio button circle) | `BorderRadius.sm` (8) or add `BorderRadius.radioBtn: 7` |
| `src/screens/AuthScreen.tsx` | 1002 | `borderRadius: 7` | No token | Same |
| `src/screens/AuthScreen.tsx` | 1012 | `borderRadius: 7` | No token | Same |
| `src/screens/AuthScreen.tsx` | 1022 | `borderRadius: 7` | No token | Same |
| `src/screens/AuthScreen.tsx` | 1032 | `borderRadius: 7` | No token | Same |
| `src/screens/ChallengeLandingScreen.tsx` | 1244 | `borderRadius: 999` | Hardcoded (use circle token) | `BorderRadius.circle` (9999) |
| `src/screens/HeroPreviewScreen.tsx` | 1207 | `borderRadius: 999` | Hardcoded (use circle token) | `BorderRadius.circle` (9999) |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 978 | `borderRadius: 40` | No token | Add `BorderRadius.xxxl: 40` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 982 | `borderRadius: 40` | No token | Same |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1003 | `borderRadius: 30` | No token | Add `BorderRadius.rounded: 30` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1008 | `borderRadius: 1` | No token (thin divider line) | Acceptable for 1px visual separator; or add `BorderRadius.hairline: 1` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1015 | `borderRadius: 1` | No token | Same |
| `src/screens/recipient/components/StreakBanner.tsx` | 343 | `borderRadius: 36` | No token | Add `BorderRadius.xxxl` or use `BorderRadius.pill` |
| `src/components/AudioPlayer.tsx` | 167 | `borderRadius: 2` | No token (progress bar) | Add `BorderRadius.xxs: 2` |
| `src/components/AudioPlayer.tsx` | 174 | `borderRadius: 3` | No token | Add `BorderRadius.xs2: 3` |
| `src/components/ExperienceDetailModal.tsx` | 395 | `borderRadius: 4` | No token | Add `BorderRadius.xs2: 4` or use `BorderRadius.xs` (6) |
| `src/components/FooterNavigation.tsx` | 284 | `borderRadius: 18` | No token | `BorderRadius.lg` (16) or add `BorderRadius.lg2: 18` |
| `src/components/FooterNavigation.tsx` | 291 | `borderRadius: 18` | No token | Same |
| `src/components/FooterNavigation.tsx` | 296 | `borderRadius: 18` | No token | Same |
| `src/components/feed/FeedPostContent.tsx` | 248 | `borderRadius: 18` | No token | Same |
| `src/components/JourneyDemo.tsx` | 408 | `borderRadius: 2` | No token (progress bar) | Add `BorderRadius.xxs: 2` |
| `src/components/JourneyDemo.tsx` | 415 | `borderRadius: 2` | No token | Same |
| `src/components/JourneyDemo.tsx` | 494 | `borderRadius: 3` | No token | Add `BorderRadius.xs2: 3` |
| `src/components/JourneyDemo.tsx` | 500 | `borderRadius: 3` | No token | Same |
| `src/components/ImageViewer.tsx` | 253 | `borderRadius: 24` | Token exists: `BorderRadius.xxl` | `BorderRadius.xxl` |
| `src/components/ImageViewer.tsx` | 275 | `borderRadius: 4` | No token | Add or use nearest |
| `src/components/MotivationModal.tsx` | 576 | `borderRadius: 2` | No token | Add `BorderRadius.xxs: 2` |
| `src/components/PersonalizedHintModal.tsx` | 528 | `borderRadius: 2` | No token | Same |
| `src/components/SharedHeader.tsx` | 307 | `borderRadius: 9` | No token | `BorderRadius.sm` (8) or add |
| `src/components/SideMenu.tsx` | 897 | `borderRadius: 13` | No token | `BorderRadius.md` (12) or add |
| `src/components/SideMenu.tsx` | 908 | `borderRadius: 11` | No token | `BorderRadius.md` (12) |

---

### 5. Hardcoded Spacing (Padding / Margin / Gap)

Valid `Spacing` token values: `2(xxs), 4(xs), 6(tinyGap), 8(sm), 12(md), 16(lg/cardPadding), 20(xl/screenPadding), 24(xxl/sectionGap), 32(xxxl), 40(huge), 60(jumbo), 64(sectionVertical), 120(textareaMinHeight)`.

Values 0 and 1 are exempted per audit rules.

#### Padding Violations

| File | Line | Value | Status | Suggested Fix |
|------|------|-------|--------|--------------|
| `src/screens/ChallengeSetupScreen.tsx` | 2268 | `paddingRight: 28` | No token | Add `Spacing.xxl2: 28` or use `Spacing.xxxl` (32) |
| `src/screens/GiftFlowScreen.tsx` | 2513 | `paddingRight: 28` | No token | Same |
| `src/screens/FriendProfileScreen.tsx` | 968 | `paddingBottom: 80` | No token | Add `Spacing.huge2: 80` or `Spacing.jumbo` (60) + offset |
| `src/screens/FriendProfileScreen.tsx` | 971 | `paddingBottom: 80` | No token | Same |
| `src/screens/FriendProfileScreen.tsx` | 974 | `paddingBottom: 80` | No token | Same |
| `src/screens/UserProfileScreen.tsx` | 990 | `paddingBottom: 80 + FOOTER_HEIGHT + insets.bottom` | No token for 80 | Define `SCROLL_BOTTOM_OFFSET = 80` constant or add `Spacing.tabBarClearance: 80` |
| `src/screens/UserProfileScreen.tsx` | 993 | Same | Same | Same |
| `src/screens/UserProfileScreen.tsx` | 996 | Same | Same | Same |
| `src/screens/recipient/JourneyScreen.tsx` | 1531 | `padding: 80` | No token | `Spacing.huge` (40) × 2 or add `Spacing.huge2: 80` |
| `src/screens/recipient/CouponEntryScreen.tsx` | 421 | `paddingBottom: 100` | No token | Add `Spacing.xxhuge: 100` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 973 | `padding: 100` | No token | Same |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1003 | `paddingVertical: 40` | Has token: `Spacing.huge` | `Spacing.huge` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1003 | `paddingHorizontal: 80` | No token | Add `Spacing.huge2: 80` |
| `src/screens/ChallengeLandingScreen.tsx` | 1272 | `paddingHorizontal: 16` | Has token: `Spacing.lg` | `Spacing.lg` |
| `src/screens/HeroPreviewScreen.tsx` | 1235 | `paddingHorizontal: 16` | Has token: `Spacing.lg` | `Spacing.lg` |
| `src/components/ModernSlider.tsx` | 133 | `paddingVertical: 20` | Has token: `Spacing.xl` | `Spacing.xl` |
| `src/components/feed/FeedPostHeader.tsx` | 88 | `paddingVertical: 2` | Has token: `Spacing.xxs` | `Spacing.xxs` |
| `src/components/JourneyDemo.tsx` | 586 | `paddingVertical: 3` | No token | `Spacing.xxs` (2) or add `Spacing.xs2: 3` |
| `src/components/SharedHeader.tsx` | 312 | `paddingHorizontal: 3` | No token | `Spacing.xxs` (2) or add `Spacing.xs2: 3` |
| `src/components/SideMenu.tsx` | 900 | `paddingHorizontal: 2` | Has token: `Spacing.xxs` | `Spacing.xxs` |
| `src/components/SkeletonLoader.tsx` | 119 | `padding: 10` | No token | Add `Spacing.sm2: 10` or use `Spacing.sm` (8) |

#### Margin Violations

| File | Line | Value | Status | Suggested Fix |
|------|------|-------|--------|--------------|
| `src/navigation/AppNavigator.tsx` | 597 | `marginTop: 24` | Has token: `Spacing.xxl` | `Spacing.xxl` |
| `src/screens/ChallengeLandingScreen.tsx` | 1476 | `marginLeft: 27` | No token | Nearest: `Spacing.xxxl` (32) or `Spacing.xxl` (24) |
| `src/screens/HeroPreviewScreen.tsx` | 1439 | `marginLeft: 27` | No token | Same |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 976 | `marginBottom: 80` | No token | Add `Spacing.huge2: 80` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 992 | `marginBottom: 24` | Has token: `Spacing.xxl` | `Spacing.xxl` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 998 | `marginBottom: 60` | Has token: `Spacing.jumbo` | `Spacing.jumbo` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1003 | `marginBottom: 80` | No token | Add `Spacing.huge2: 80` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1026 | `marginBottom: 16` | Has token: `Spacing.lg` | `Spacing.lg` |
| `src/components/JourneyDemo.tsx` | 219 | `marginTop: 20` (moti animate) | Has token: `Spacing.xl` | `Spacing.xl` |
| `src/components/JourneyDemo.tsx` | 263 | `marginTop: 16` (moti animate) | Has token: `Spacing.lg` | `Spacing.lg` |
| `src/components/JourneyDemo.tsx` | 280 | `marginTop: 20` (moti animate) | Has token: `Spacing.xl` | `Spacing.xl` |
| `src/components/JourneyDemo.tsx` | 460 | `marginTop: 2` | Has token: `Spacing.xxs` | `Spacing.xxs` |
| `src/components/JourneyDemo.tsx` | 563 | `marginBottom: 14` | No token | Add `Spacing.sm2: 14` or use `Spacing.md` (12) |
| `src/components/SkeletonLoader.tsx` | 120 | `marginBottom: 6` | Has token: `Spacing.tinyGap` | `Spacing.tinyGap` |
| `src/components/SkeletonLoader.tsx` | 153 | `marginBottom: 6` | Has token: `Spacing.tinyGap` | `Spacing.tinyGap` |
| `src/components/SkeletonLoader.tsx` | 154 | `marginBottom: 6` | Has token: `Spacing.tinyGap` | `Spacing.tinyGap` |
| `src/components/SkeletonLoader.tsx` | 170 | `marginBottom: 6` | Has token: `Spacing.tinyGap` | `Spacing.tinyGap` |
| `src/components/SkeletonLoader.tsx` | 206 | `marginTop: 6` | Has token: `Spacing.tinyGap` | `Spacing.tinyGap` |
| `src/components/SkeletonLoader.tsx` | 220 | `marginBottom: 6` | Has token: `Spacing.tinyGap` | `Spacing.tinyGap` |
| `src/components/SkeletonLoader.tsx` | 241 | `marginBottom: 10` | No token | Add `Spacing.sm2: 10` |
| `src/components/SkeletonLoader.tsx` | 281 | `marginBottom: 6` | Has token: `Spacing.tinyGap` | `Spacing.tinyGap` |
| `src/components/VenueSelectionModal.tsx` | 587 | `marginTop: 2` | Has token: `Spacing.xxs` | `Spacing.xxs` |
| `src/components/VenueSelectionModal.tsx` | 75 (SkeletonBox) | `marginBottom: 6` | Has token: `Spacing.tinyGap` | `Spacing.tinyGap` |

#### Gap Violations

| File | Line | Value | Status | Suggested Fix |
|------|------|-------|--------|--------------|
| `src/screens/recipient/AchievementDetailScreen.tsx` | 992 | `gap: 20` | Has token: `Spacing.xl` | `Spacing.xl` |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1003 | `gap: 60` | Has token: `Spacing.jumbo` | `Spacing.jumbo` |
| `src/screens/FriendProfileScreen.tsx` | 1104 | `gap: 32` | Has token: `Spacing.xxxl` | `Spacing.xxxl` |
| `src/components/JourneyDemo.tsx` | 435 | `gap: 14` | No token | Add `Spacing.sm2: 14` or use `Spacing.md` (12) |
| `src/components/JourneyDemo.tsx` | 513 | `gap: 3` | No token | `Spacing.xxs` (2) or add `Spacing.xs2: 3` |

---

### 6. Missing Shared Components

#### TouchableOpacity / Pressable as Action Buttons (should use `<Button>`)

The `CLAUDE.md` rule: *"ALWAYS use `<Button>` from `src/components/Button.tsx` for interactive button elements."*

**32 screen files** and **35 component files** currently import `TouchableOpacity`. Many of these are legitimate uses (wrapping image thumbnails, list row tap targets, non-button interactive elements). However, for standalone action buttons that could use the design system Button component, these are violations.

**High-confidence Button violations** (clear CTA / action buttons using TouchableOpacity):

| File | Lines | Description |
|------|-------|-------------|
| `src/screens/recipient/AchievementDetailScreen.tsx` | 1153, 1174, 1185, 1192, 1198, 1279, 1287, 1296, 1321, 1324, 1336 | Copy button, WhatsApp/email scheduling buttons, share/CTA buttons |
| `src/screens/ChallengeLandingScreen.tsx` | 628, 639, 690, 704, 860, 1015, 1046, 1078, 1089, 1100 | Mode selection, CTA buttons |
| `src/screens/GiftFlowScreen.tsx` | Multiple (20 instances) | Various gift flow actions |
| `src/screens/recipient/JourneyScreen.tsx` | Multiple | Journey action buttons |
| `src/screens/recipient/GoalSettingScreen.tsx` | Multiple | Goal setting CTAs |
| `src/components/GoalApprovalNotification.tsx` | Multiple | Approve/Decline action buttons |
| `src/components/FreeGoalNotification.tsx` | Multiple | Notification action buttons |
| `src/components/ExperiencePurchaseCTA.tsx` | Multiple | Purchase CTA button |

#### Direct React Native Modal Import (should use `<BaseModal>`)

| File | Line | Details |
|------|------|---------|
| `src/components/BookingCalendar.tsx` | 2 | `import { ..., Modal, ... } from 'react-native'` — should be refactored to use `BaseModal` |

#### React Native TextInput Import
- **No violations found.** All TextInput usage correctly uses the shared `src/components/TextInput.tsx` component.

---

### 7. Button Content Violations

**0 violations found.** No emoji characters or icon components were detected inside Button labels or titles via the audit scan.

---

## Missing Tokens (Need to be Added to Config First)

Before fixing the violations above, these tokens do not yet exist and must be added to the relevant config files:

### `src/config/typography.ts`
| Token Name | Value | Use Case |
|-----------|-------|---------|
| `statHero` | `{ fontSize: 80, fontWeight: '800', lineHeight: 90 }` | Achievement stat numbers (sessions, streak count) |
| `displayXL` | `{ fontSize: 52, fontWeight: '800', lineHeight: 60 }` | Achievement "GOAL COMPLETED" label |
| `displayXXL` | `{ fontSize: 56, fontWeight: '700', lineHeight: 64 }` | Achievement goal name display |
| `shareHero` | `{ fontSize: 120, fontWeight: '400', lineHeight: 130 }` | Share card emoji display |

### `src/config/spacing.ts`
| Token Name | Value | Use Case |
|-----------|-------|---------|
| `huge2` | `80` | Scroll padding, achievement card spacers |
| `xxhuge` | `100` | Full-screen hero padding |
| `tabBarClearance` | `80` | Tab bar scroll clearance offset |
| `sm2` | `10` | Small gap between skeleton items |
| `xs2` | `14` | Compact item gap in JourneyDemo |

### `src/config/borderRadius.ts`
| Token Name | Value | Use Case |
|-----------|-------|---------|
| `xxs` | `2` | Progress bar caps, thin divider lines |
| `xs2` | `3` or `4` | Small image thumbnails, compact chips |
| `xxxl` | `40` | Achievement share card corners |
| `rounded` | `30` | Achievement stats container |
| `lg2` | `18` | Footer nav active pill, post media corners |

### `src/config/colors.ts` (add to both `Colors` and `DarkColors`)
| Token Name | Value | Use Case |
|-----------|-------|---------|
| `secondaryAlpha10` | `rgba(16, 185, 129, 0.1)` | Animated background range start |
| `secondaryAlpha30` | `rgba(16, 185, 129, 0.3)` | Animated background range end |
| `primaryAlpha40` | `rgba(5, 150, 105, 0.4)` | Text shadow color |
| `warningAlpha10` | `rgba(245, 158, 11, 0.1)` | Animated warning tint start |
| `warningAlpha30` | `rgba(245, 158, 11, 0.3)` | Animated warning tint end |

---

## Files Audited

### Config Files
- `src/config/colors.ts`
- `src/config/typography.ts`
- `src/config/spacing.ts`
- `src/config/borderRadius.ts`
- `src/config/shadows.ts`
- `src/config/animations.ts`
- `src/config/index.ts`

### Shared Components
- `src/components/Button.tsx`
- `src/components/Card.tsx`
- `src/components/TextInput.tsx`
- `src/components/Avatar.tsx`
- `src/components/EmptyState.tsx`
- `src/components/BaseModal.tsx`

### Screens (40 files scanned)
- `src/screens/AnimationPreviewScreen.tsx`
- `src/screens/AuthScreen.tsx`
- `src/screens/AddFriendScreen.tsx`
- `src/screens/ChallengeLandingScreen.tsx`
- `src/screens/ChallengeSetupScreen.tsx`
- `src/screens/FeedScreen.tsx`
- `src/screens/FriendProfileScreen.tsx`
- `src/screens/FriendsListScreen.tsx`
- `src/screens/GiftFlowScreen.tsx`
- `src/screens/GoalDetailScreen.tsx`
- `src/screens/GoalsScreen.tsx`
- `src/screens/HeroPreviewScreen.tsx`
- `src/screens/LandingScreen.tsx`
- `src/screens/MainScreen.tsx`
- `src/screens/NotificationsScreen.tsx`
- `src/screens/PurchasedGiftsScreen.tsx`
- `src/screens/UserProfileScreen.tsx`
- `src/screens/giver/CartScreen.tsx`
- `src/screens/giver/CategorySelectionScreen.tsx`
- `src/screens/giver/ConfirmationMultipleScreen.tsx`
- `src/screens/giver/ConfirmationScreen.tsx`
- `src/screens/giver/DeferredSetupScreen.tsx`
- `src/screens/giver/ExperienceCheckoutScreen.tsx`
- `src/screens/giver/ExperienceDetailsScreen.native.tsx`
- `src/screens/giver/ExperienceDetailsScreen.web.tsx`
- `src/screens/giver/MysteryChoiceScreen.tsx`
- `src/screens/recipient/AchievementDetailScreen.tsx`
- `src/screens/recipient/CompletedGoalCard.tsx`
- `src/screens/recipient/CouponEntryScreen.tsx`
- `src/screens/recipient/DetailedGoalCard.tsx`
- `src/screens/recipient/GoalSettingScreen.tsx`
- `src/screens/recipient/JourneyScreen.tsx`
- `src/screens/recipient/components/GoalCardModals.tsx`
- `src/screens/recipient/components/ProgressBars.tsx`
- `src/screens/recipient/components/SessionActionArea.tsx`
- `src/screens/recipient/components/SessionMediaPrompt.tsx`
- `src/screens/recipient/components/StreakBanner.tsx`
- `src/screens/recipient/components/TimerDisplay.tsx`
- `src/screens/recipient/components/WeeklyCalendar.tsx`
- `src/screens/recipient/components/PledgedExperiencePreview.tsx`

### Components (55 files scanned)
All files under `src/components/**/*.tsx` — see glob output for full list.

---

## Priority Recommendations

1. **Immediate / High Impact** — Fix `AchievementDetailScreen.tsx` (51 violations). This one file accounts for ~46% of all token violations. Add the 4 missing Typography tokens first, then replace hardcoded values.

2. **Quick Wins** — `SkeletonLoader.tsx` has 9 `marginBottom: 6` that all map to `Spacing.tinyGap`. Mechanical find-replace.

3. **Color Token gaps** — Add 5 rgba tokens to `colors.ts`, then fix `ChallengeLandingScreen.tsx` and `HeroPreviewScreen.tsx` (mirror files — same changes needed in both).

4. **BorderRadius token gaps** — Add 5 new `borderRadius` tokens, then fix the 31 hardcoded values across 12 files.

5. **TouchableOpacity audit** — Perform a file-by-file review of the 67 files with `TouchableOpacity` to migrate explicit CTA/action buttons to `<Button>`. The `src/components/BookingCalendar.tsx` RN Modal import should be refactored to `BaseModal`.
