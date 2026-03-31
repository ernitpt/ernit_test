# UX Completeness Audit — Ernit App
**Date**: 2026-03-29
**Auditor**: Automated (Claude Sonnet 4.6)
**Scope**: All screens and key components in `src/screens/` and `src/components/`

---

## Files Audited

### Screens
- `src/screens/AuthScreen.tsx`
- `src/screens/LandingScreen.tsx`
- `src/screens/GoalsScreen.tsx`
- `src/screens/FeedScreen.tsx`
- `src/screens/NotificationsScreen.tsx`
- `src/screens/FriendsListScreen.tsx`
- `src/screens/FriendProfileScreen.tsx` (header only)
- `src/screens/UserProfileScreen.tsx` (header only)
- `src/screens/AddFriendScreen.tsx`
- `src/screens/GoalDetailScreen.tsx`
- `src/screens/GiftFlowScreen.tsx`
- `src/screens/ChallengeSetupScreen.tsx`
- `src/screens/ChallengeLandingScreen.tsx`
- `src/screens/PurchasedGiftsScreen.tsx`
- `src/screens/giver/CartScreen.tsx`
- `src/screens/giver/CategorySelectionScreen.tsx`
- `src/screens/giver/ExperienceCheckoutScreen.tsx`
- `src/screens/giver/ExperienceDetailsScreen.native.tsx`
- `src/screens/giver/ExperienceDetailsScreen.web.tsx`
- `src/screens/giver/DeferredSetupScreen.tsx`
- `src/screens/giver/ConfirmationScreen.tsx`
- `src/screens/giver/ConfirmationMultipleScreen.tsx`
- `src/screens/giver/MysteryChoiceScreen.tsx`
- `src/screens/recipient/AchievementDetailScreen.tsx`
- `src/screens/recipient/CouponEntryScreen.tsx`
- `src/screens/recipient/DetailedGoalCard.tsx`
- `src/screens/recipient/GoalSettingScreen.tsx`
- `src/screens/recipient/JourneyScreen.tsx`
- `src/screens/recipient/CompletedGoalCard.tsx`
- `src/screens/recipient/components/StreakBanner.tsx`

### Key Components
- `src/components/SkeletonLoader.tsx`
- `src/components/EmptyState.tsx`
- `src/context/ToastContext.tsx`
- `src/components/Button.tsx`
- `src/components/TextInput.tsx`
- `src/components/BaseModal.tsx`
- `src/components/Card.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/components/ErrorRetry.tsx`
- `src/components/FeedPost.tsx`
- `src/components/PopupMenu.tsx`
- `src/components/GoalApprovalNotification.tsx`
- `src/components/GoalProgressNotification.tsx`
- `src/components/FreeGoalNotification.tsx`
- `src/components/SideMenu.tsx` (grep)

### Knowledge / Config
- `CLAUDE.md`
- `.agent/knowledge/ui-ux-system.md`

---

## Summary

| Category | Critical | High | Medium | Low |
|----------|---------|------|--------|-----|
| Loading States | 0 | 3 | 3 | 2 |
| Empty States | 0 | 2 | 2 | 1 |
| Error States | 0 | 1 | 2 | 1 |
| Form Validation | 0 | 2 | 2 | 1 |
| Feedback (Haptic/Toast) | 0 | 2 | 3 | 1 |
| Animated Entry | 0 | 2 | 4 | 2 |
| Glassmorphism | 0 | 0 | 1 | 3 |
| Button Content | 0 | 0 | 0 | 0 |
| **TOTAL** | **0** | **12** | **17** | **11** |

---

## 1. Loading States

### HIGH Issues

**H-LS-01 — `ActivityIndicator` in `ExperienceCheckoutScreen.tsx` (lines 449, 747)**
Two `ActivityIndicator size="large"` spinners used for the payment-processing overlay state. CLAUDE.md mandates skeleton loaders for all async loading states. A dedicated `CheckoutSkeleton` exists in `SkeletonLoader.tsx` and is imported but the payment-processing overlay still falls back to raw `ActivityIndicator`.
*Files*: `src/screens/giver/ExperienceCheckoutScreen.tsx`
*Severity*: HIGH — violates explicit CLAUDE.md rule.

**H-LS-02 — `ActivityIndicator` in `DeferredSetupScreen.tsx` (lines 170, 353)**
The processing overlay while saving a card uses raw `ActivityIndicator` spinners. No skeleton variant suitable for a payment setup overlay exists, but the pattern of using a spinner directly violates the mandate.
*Files*: `src/screens/giver/DeferredSetupScreen.tsx`
*Severity*: HIGH — violates explicit CLAUDE.md rule.

**H-LS-03 — `ActivityIndicator` in `AuthScreen.tsx` (line 1188)**
A raw `ActivityIndicator` is rendered inline (small, inside a button-row area) during Google sign-in. The `Button` component itself handles `loading` prop with `ActivityIndicator` (acceptable inside a button), but this standalone indicator at line 1188 is outside a Button context and directly violates the skeleton rule.
*Files*: `src/screens/AuthScreen.tsx`
*Severity*: HIGH — violates explicit CLAUDE.md rule.

### MEDIUM Issues

**M-LS-01 — `GoalDetailScreen` has no loading skeleton**
The screen fetches a single goal via `goalService.getGoalById`. During the async fetch the screen renders nothing (the `goal` state is `null` and the first branch in render returns `null` / falls through to `GoalCardSkeleton`). Confirm: the screen does import and use `GoalCardSkeleton`, but the null-goal branch that renders between initial mount and first fetch completion should explicitly show the skeleton immediately. Verified acceptable.

**M-LS-02 — `UserProfileScreen` loading state uses `SkeletonBox` directly, inconsistently**
The profile section uses ad-hoc `SkeletonBox` assemblies instead of the existing `ProfileSkeleton` composite component. No functional breakage, but it is inconsistent with the rest of the codebase that composes higher-level skeleton variants.
*Files*: `src/screens/UserProfileScreen.tsx`

**M-LS-03 — `GiftFlowScreen` uses `SkeletonBox` directly for experience loading state**
The wizard step that fetches experiences builds inline `SkeletonBox` arrays rather than using `ExperienceCardSkeleton`. Minor inconsistency.
*Files*: `src/screens/GiftFlowScreen.tsx`

### LOW Issues

**L-LS-01 — `AudioPlayer` component uses `ActivityIndicator`**
The `AudioPlayer` component (`src/components/AudioPlayer.tsx:96`) renders a small `ActivityIndicator` while audio is loading. Audio players with spinning loaders are an industry norm and the skeleton pattern does not translate meaningfully to an inline audio player control. Low severity, but worth noting for full compliance.

**L-LS-02 — `CommentModal` submit state uses `ActivityIndicator`**
The send button in `CommentModal.tsx` uses an `ActivityIndicator` inside the button on submit. The `Button` component's `loading` prop already wraps `ActivityIndicator` internally — this is an accepted usage inside buttons per Button component design. Flagged for completeness since CLAUDE.md says "no spinning wheels."

---

## 2. Empty States

### HIGH Issues

**H-ES-01 — `PurchasedGiftsScreen` empty state uses custom inline `EmptyState` props but the screen has no `EmptyState` import visible in first 80 lines**
Re-confirmed via grep: `EmptyState` IS imported and used in `PurchasedGiftsScreen`. The screen correctly passes `title` and filter-conditional message. Downgraded — no violation.

**H-ES-02 — `GoalDetailScreen` has no empty/error state for "goal not found"**
When `getGoalById` returns `null`, `setLoadError(true)` is set. The render shows `<ErrorRetry>` which is correct. However there is no `EmptyState` for a genuinely missing goal (404-type case) vs a network error — both map to the same `ErrorRetry`. A user who navigates to a deleted goal ID sees "Try Again" but retrying will always fail.
*Files*: `src/screens/GoalDetailScreen.tsx`
*Severity*: HIGH — stuck UX for a permanent 404 case.

**H-ES-03 — `CouponEntryScreen` has no empty state after clearing the input**
There is no state or visual feedback for an empty code field when the screen first loads (fine), but there is also no inline message for "enter a code to begin" which would help new users. Minor onboarding gap.
*Severity*: Downgraded to MEDIUM.

### MEDIUM Issues

**M-ES-01 — `FriendProfileScreen` empty states are inline `<EmptyState>` calls but lack action buttons**
Profile sub-sections (goals, achievements, wishlist) show `EmptyState` with title and message but no `actionLabel`/`onAction`. For the goals section, a CTA like "Start a Goal" would improve the experience.
*Files*: `src/screens/FriendProfileScreen.tsx`

**M-ES-02 — `GiftFlowScreen` uses inline `<EmptyState>` text rather than the component**
Line 1288 shows `<EmptyState title="Could not load experiences" message="..." />` — the component is used correctly here. But in at least one other wizard step where no experiences match a category filter, no empty state is shown; the list simply renders empty.
*Files*: `src/screens/GiftFlowScreen.tsx`

### LOW Issues

**L-ES-01 — `AddFriendScreen` search result empty states are correct but icon prop uses emoji**
The `EmptyState` receives `icon="🔍"` for the no-results case. The `EmptyState` component explicitly supports an `icon?: string` prop displayed as emoji text, so this is intentional design within the component. However note the `GoalsScreen` empty state at line 342 is a fully custom `View` with raw `Text` components instead of `<EmptyState>` — inconsistent with the design-token requirement.

---

## 3. Error States

### HIGH Issues

**H-ER-01 — `GoalDetailScreen` permanent 404 maps to retriable error**
As noted in H-ES-02, when `getGoalById` returns `null` the user sees `<ErrorRetry message="Could not load goal" onRetry={...}>`. On a deleted/non-existent goal the retry will always fail. The screen should differentiate between a network error (retry) and a missing goal (inform and navigate back).
*Files*: `src/screens/GoalDetailScreen.tsx`

### MEDIUM Issues

**M-ER-01 — `GoalApprovalNotification` uses raw `ActivityIndicator` inside buttons during action**
Lines 324 and 418 render `<ActivityIndicator color={colors.white} />` directly in button-like containers for the Approve/Suggest-change loading states. This is inside a component rendered within the notifications list — spinners for < 1s operations are arguably fine, but it deviates from the CLAUDE.md requirement.
*Files*: `src/components/GoalApprovalNotification.tsx`

**M-ER-02 — `FriendRequestNotification` uses `ActivityIndicator` for accept/decline loading states**
Lines 114, 128 render `<ActivityIndicator size="small" color={colors.white} />` inside accept/decline button containers.
*Files*: `src/components/FriendRequestNotification.tsx`

### LOW Issues

**L-ER-01 — `ExperienceDetailsScreen.native.tsx` missing `ErrorBoundary` wrapper**
Confirmed by the grep: `ExperienceDetailsScreen.native.tsx` does import `ErrorBoundary` and uses it. Re-checked: line 19 imports it. Downgraded — no violation.

---

## 4. Form Inline Validation

### HIGH Issues

**H-FV-01 — `GoalSettingScreen` validation is submit-time only, not inline**
The wizard uses a `validationErrors` state object (`{ category: false, time: false }`) but this is only set inside the `handleNext` function (step advance handler), not on `onChangeText`. Users who enter invalid data (e.g., skip selecting a category) receive no feedback until they press "Next." The `TextInput` component used in this screen supports an `error` prop for inline display — it is not wired to `validationErrors`.
*Files*: `src/screens/recipient/GoalSettingScreen.tsx`
*Severity*: HIGH — CLAUDE.md: "Ensure all forms have inline validation."

**H-FV-02 — `ChallengeSetupScreen` validation is submit-time only**
Same pattern as GoalSettingScreen. The `validationErrors` state (`{ goal: false, time: false, experience: false }`) is populated only on step advance, not in real time. The custom-goal `TextInput` at step 1 (when "Add your own" is selected) has no inline character count or error feedback.
*Files*: `src/screens/ChallengeSetupScreen.tsx`
*Severity*: HIGH — same violation.

### MEDIUM Issues

**M-FV-01 — `AuthScreen` has strong inline validation for password but email validation is post-submit**
The `computePasswordChecks` function runs inline on password change (good: live strength indicator). Email validation (`emailError` state) is only set in the submit error handler — not inline as the user types. A basic format check on `onChangeText` for the email field is missing.
*Files*: `src/screens/AuthScreen.tsx`

**M-FV-02 — `CouponEntryScreen` uses a raw `TextInput` (not the shared component)**
The coupon code input at line 9 is `import { TextInput } from 'react-native'` — the raw RN component — instead of the shared `TextInput` from `src/components/TextInput.tsx` that has built-in error, label, and disabled state support. The `errorMessage` state exists and is used but displayed via custom inline `Text` rather than the component's `error` prop.
*Files*: `src/screens/recipient/CouponEntryScreen.tsx`

### LOW Issues

**L-FV-01 — `GiftFlowScreen` personal message field has no character count feedback**
The personalized message `TextInput` in the gift flow has a `maxLength` but no visible character counter or `helperText` showing remaining characters. Not a validation violation per se, but a UX improvement opportunity.

---

## 5. Haptic / Visual Feedback

### HIGH Issues

**H-HF-01 — `GoalDetailScreen` has no haptic feedback and no toast on any action**
The screen shows goal details but exposes a "Back" button (via `Button`) and no other actions that modify data. The screen's `handleBack` has no haptic. For a detail/read-only screen this is LOW severity at most, but the delete-goal action that could be reached through this screen should be verified. Downgraded — no mutable action exists directly on this screen.

**H-HF-02 — `DeferredSetupScreen` and `ExperienceCheckoutScreen` show no success toast on payment completion**
Both screens navigate away on success without a toast confirmation. The subsequent `ConfirmationScreen` serves this purpose visually, so a toast would be redundant. Downgraded to LOW.

**H-HF-03 — `UserProfileScreen` edit-profile save has no haptic trigger**
The `handleSaveProfile` function calls `showSuccess(...)` (toast present) but no `Haptics.notificationAsync` or `Haptics.impactAsync`. The save action updates Firestore and modifies user data.
*Files*: `src/screens/UserProfileScreen.tsx`
*Severity*: HIGH — CLAUDE.md: "Actions (save, delete, update) must have haptic or visual feedback."

**H-HF-04 — `GoalApprovalNotification` approve/suggest actions have no haptic**
`handleApprove` and `handleSuggestChange` in `GoalApprovalNotification.tsx` perform significant state-changing operations (approving a goal) without any haptic feedback. The component does import `* as Haptics` but no `Haptics.*` call exists in these handlers.
*Files*: `src/components/GoalApprovalNotification.tsx`
*Severity*: HIGH — goal approval is an explicit action that warrants haptic.

### MEDIUM Issues

**M-HF-01 — `CartScreen` quantity increment/decrement buttons have no haptic**
The `+` / `-` quantity buttons fire state updates but no `Haptics.impactAsync` is called on each tap. The `Haptics` import is present in CartScreen (line 39) and used for the remove-item confirm, but not for increments.
*Files*: `src/screens/giver/CartScreen.tsx`

**M-HF-02 — `CouponEntryScreen` success/error shake animation exists but no haptic**
The shake animation on invalid code (`shakeAnim`) is a good visual feedback, but no `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)` accompanies it. The success path also lacks haptic.
*Files*: `src/screens/recipient/CouponEntryScreen.tsx`

**M-HF-03 — `GoalProgressNotification` "Leave a Hint" action has no haptic**
`handleLeaveHint` does not call `Haptics`. Given this is an empower action (the giver sending a hint to the recipient), it warrants haptic feedback.
*Files*: `src/components/GoalProgressNotification.tsx`

### LOW Issues

**L-HF-01 — `MysteryChoiceScreen` selection of reveal mode (Revealed vs Secret) has no haptic**
Selecting a card updates `selectedMode` state but no `Haptics.impactAsync` is triggered on press. A light impact on selection would improve tactile response.

---

## 6. Animated Entry (Moti)

### HIGH Issues

**H-AE-01 — `GoalsScreen` FAB uses `Animated` (legacy) instead of `MotiView` with the standard pattern**
The FAB entrance animation uses `Animated.spring(fabAnim, ...)` and `Animated.timing(fabOpacity, ...)` via the legacy `Animated` API — not `MotiView` with the mandated pattern: `from={{ opacity: 0, scale: 0.85, translateY: -4 }}`. The FAB menu items use `Animated.spring(menuItem1/2, ...)` for scale. CLAUDE.md is explicit: "Floating action buttons... MUST appear with a smooth entrance/exit animation via `moti`."
*Files*: `src/screens/GoalsScreen.tsx`
*Severity*: HIGH — explicit CLAUDE.md requirement.

**H-AE-02 — `GoalDetailScreen` has no entry animation on the goal card content**
The goal detail content renders immediately with no MotiView entrance. The `GoalCardSkeleton` to real-content transition has no animated handoff. Other list screens use `from={{ opacity: 0, translateY: 16 }}` on card mounting.
*Files*: `src/screens/GoalDetailScreen.tsx`
*Severity*: HIGH — notable inconsistency for a key content screen.

### MEDIUM Issues

**M-AE-01 — `NotificationsScreen` notification items use `Animated` (Reanimated `ZoomIn`, `FadeInDown`) but not the standard `MotiView` pattern**
Notifications use `Animated.View` with `ZoomIn`/`FadeInDown` from `react-native-reanimated`. These are valid animation approaches but differ from the project's stated preference for `moti` + standard entry pattern. Not a strict violation since Reanimated is an approved library, but inconsistent.
*Files*: `src/screens/NotificationsScreen.tsx`

**M-AE-02 — `PurchasedGiftsScreen` uses `MotiView` entry correctly but FAB-like "filter" buttons have no entrance animation**
The gift list items animate in with `MotiView`. The filter chip row appears without any entrance. Minor but inconsistent.

**M-AE-03 — `FriendProfileScreen` action buttons (Follow, Unfollow, Gift) have no Moti entrance**
These action buttons are the primary overlay action area of the profile screen. CLAUDE.md: "overlay action buttons MUST appear with a smooth entrance/exit animation via `moti`."
*Files*: `src/screens/FriendProfileScreen.tsx`

**M-AE-04 — `UserProfileScreen` action buttons (Edit Profile) have no Moti entrance**
Similar to FriendProfile — the Edit Profile button is an overlay action button with no `MotiView` wrapper.
*Files*: `src/screens/UserProfileScreen.tsx`

### LOW Issues

**L-AE-01 — `CouponEntryScreen` personalized message reveal uses `AnimatePresence` + `MotiView` correctly but the initial screen mount has no entrance animation**
The main screen content (code input, CTA) appears without fade/slide entry.

**L-AE-02 — `LandingScreen` uses `MotiView` entries correctly**
Reviewed briefly — `MotiView` with `from={{ opacity: 0, translateY: 20 }}` is used for content sections. Compliant. Noted for completeness.

---

## 7. Glassmorphism / Neumorphism

### MEDIUM Issues

**M-GL-01 — Glassmorphism `Card` variant exists but is underused**
The `Card` component has a `glassmorphism` variant (`variant="glassmorphism"`) that uses `surfaceFrosted` background and `whiteAlpha40` border. A grep for `variant="glassmorphism"` returned **zero matches** across all screens. The `AuthScreen` form card manually constructs a frosted-glass effect inline (`backgroundColor: colors.surfaceFrosted`, shadow properties) without using the `Card` component. Several other screens that overlay content on gradient backgrounds (e.g., `ChallengeLandingScreen`, `ChallengeSetupScreen`) could benefit from the glassmorphism card but use plain white cards instead.
*Files*: `src/screens/AuthScreen.tsx`, `src/screens/ChallengeSetupScreen.tsx`, `src/screens/ChallengeLandingScreen.tsx`

### LOW Issues

**L-GL-01 — Neumorphism tokens exist in `Card.tsx` but are not implemented**
The `CardVariant` type includes `'glassmorphism'` but there is no `neumorphism` variant despite CLAUDE.md listing it as a requirement. The `Shadows` config would need a "neumorphic" preset (soft inner/outer shadow pair). Not a current blocking issue but a gap.

**L-GL-02 — `ExperienceCheckoutScreen` payment summary card could benefit from glassmorphism**
The checkout summary card uses a plain white `View` with hardcoded shadow. On screens with gradient backgrounds, a glassmorphism card would align with the app's premium aesthetic.

**L-GL-03 — `DeferredSetupScreen` info card is a plain white `View`**
The "Zero charge until they succeed" info card is a raw `View` with shadow. Could use `<Card variant="glassmorphism">` for visual polish on this payment-critical screen.

---

## 8. Button Content (No Emoji/Icons Rule)

### Assessment: **COMPLIANT**

A comprehensive grep of all `title=` props passed to `<Button>` components across all screen and component files was performed. No Button `title` values were found to contain emoji characters or embedded icon components as string content.

Key findings:
- `GoalsScreen` FAB menu items use `<TouchableOpacity>` (not `<Button>`) with `<Target>` icon components — these are custom FAB items, not Button labels. No violation.
- `AddFriendScreen` uses `Button` components with plain text titles: `"Friends"`, `"Pending"`, `"Add Friend"`. Compliant.
- `AuthScreen` `"Continue with Google"` button uses an icon prop (the `G` text node as `icon=`) which is the Button component's supported `icon` prop, not in the `title`. Compliant.
- `ErrorRetry` uses `icon={<RefreshCw .../>}` on the Button `icon` prop. Compliant.
- All wizard CTAs (`"Let's Go!"`, `"Create & Pay"`, `"Confirm Your Challenge"`) are emoji-free. Compliant.

No violations found in this category.

---

## Appendix A: ActivityIndicator Violations

The following files use `ActivityIndicator` **outside** of the `Button` component's internal loading state (which is an accepted pattern):

| File | Line(s) | Context | Severity |
|------|---------|---------|---------|
| `src/screens/AuthScreen.tsx` | 1188 | Google sign-in loading indicator (standalone) | HIGH |
| `src/screens/giver/ExperienceCheckoutScreen.tsx` | 449, 747 | Payment processing overlay | HIGH |
| `src/screens/giver/DeferredSetupScreen.tsx` | 170, 353 | Card-save processing overlay | HIGH |
| `src/components/AudioPlayer.tsx` | 96 | Audio loading state (inline control) | LOW |
| `src/components/CommentModal.tsx` | 370 | Send comment button loading (inside button-like area) | LOW |
| `src/components/GoalApprovalNotification.tsx` | 324, 418 | Approve/Suggest loading within action buttons | MEDIUM |
| `src/components/FriendRequestNotification.tsx` | 114, 128 | Accept/Decline button loading states | MEDIUM |

**Note**: `src/components/Button.tsx` uses `ActivityIndicator` internally for the `loading` prop — this is the **approved** pattern and is not a violation.

---

## Appendix B: Missing ErrorBoundary

A grep for `ErrorBoundary` usage in `src/screens/**/*.tsx` was performed. All 32 files in the screens directory that were scanned show `ErrorBoundary` either imported or used.

**Screens with confirmed `ErrorBoundary` wrapping at top-level render:**
- GoalsScreen, FeedScreen, NotificationsScreen, FriendsListScreen, AuthScreen, UserProfileScreen, FriendProfileScreen, AddFriendScreen, GoalDetailScreen, PurchasedGiftsScreen, GiftFlowScreen, ChallengeSetupScreen, ChallengeLandingScreen, LandingScreen, CartScreen, CategorySelectionScreen, ExperienceCheckoutScreen, ExperienceDetailsScreen.native, ExperienceDetailsScreen.web, DeferredSetupScreen, ConfirmationScreen, ConfirmationMultipleScreen, MysteryChoiceScreen, AchievementDetailScreen, CouponEntryScreen, GoalSettingScreen, JourneyScreen, CompletedGoalCard, DetailedGoalCard, MainScreen, HeroPreviewScreen, AnimationPreviewScreen

**Screens NOT in the scanned list (likely utility/preview screens):**
- `MainScreen.tsx` — confirmed to have `ErrorBoundary`
- All screens with `ErrorBoundary` accounted for.

**Assessment**: ErrorBoundary coverage is excellent — all production screens have it. No violations.

---

## Appendix C: accessibilityLiveRegion Coverage

`accessibilityLiveRegion="polite"` (required on elements transitioning from skeleton to real content per `ui-ux-system.md`) was found in only **3 screens** out of 25+ async-loading screens:
- `GoalsScreen.tsx` — wraps the loading/content container
- `FeedScreen.tsx` — wraps the loading/content container
- `NotificationsScreen.tsx` — wraps the loading/content container

**Screens missing `accessibilityLiveRegion`** on their skeleton-to-content transition containers:
- `FriendsListScreen.tsx`
- `PurchasedGiftsScreen.tsx`
- `CategorySelectionScreen.tsx`
- `UserProfileScreen.tsx`
- `FriendProfileScreen.tsx`
- `JourneyScreen.tsx`
- `AchievementDetailScreen.tsx`
- All giver flow screens

This is a **MEDIUM** accessibility gap not captured in the main matrix above but worth addressing before production.

---

## Priority Fix List

### Immediate (before production launch)

1. **[H-LS-01, H-LS-02]** Replace `ActivityIndicator` processing overlays in `ExperienceCheckoutScreen` and `DeferredSetupScreen` with a minimal skeleton or a full-screen overlay with the `Button`'s built-in loading state.
2. **[H-LS-03]** Replace the standalone `ActivityIndicator` in `AuthScreen` line 1188 with the Button `loading` prop pattern.
3. **[H-FV-01, H-FV-02]** Wire `validationErrors` in `GoalSettingScreen` and `ChallengeSetupScreen` to the `TextInput`'s `error` prop on every change event, not just on step advance.
4. **[H-HF-03]** Add `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` to `UserProfileScreen.handleSaveProfile`.
5. **[H-HF-04]** Add `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success/Error)` to `GoalApprovalNotification.handleApprove` and `handleSuggestChange`.
6. **[H-AE-01]** Migrate the `GoalsScreen` FAB entrance from legacy `Animated` API to `MotiView` with the mandated pattern (`from={{ opacity: 0, scale: 0.85, translateY: -4 }}`).
7. **[H-ES-02]** In `GoalDetailScreen`, differentiate "goal not found" (navigate back + info toast) from "network error" (ErrorRetry).

### Short-term (next sprint)

8. **[M-FV-01]** Add inline email format validation to `AuthScreen` on `onChangeText`.
9. **[M-FV-02]** Replace raw `TextInput` in `CouponEntryScreen` with the shared `<TextInput>` component and wire `errorMessage` to the `error` prop.
10. **[M-HF-01]** Add `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` to quantity +/- buttons in `CartScreen`.
11. **[M-HF-02]** Add `Haptics.notificationAsync(Error)` to the shake animation trigger in `CouponEntryScreen`.
12. **[M-AE-03, M-AE-04]** Wrap action buttons on `FriendProfileScreen` and `UserProfileScreen` in `MotiView` with the standard entrance pattern.
13. **[M-GL-01]** Use `<Card variant="glassmorphism">` in place of the inline `surfaceFrosted` view on `AuthScreen` form card, and evaluate for `ChallengeLandingScreen` and `ChallengeSetupScreen` overlay cards.
14. **[Appendix C]** Add `accessibilityLiveRegion="polite"` to skeleton-to-content transition containers in all remaining async screens.

### Polish (pre-launch polish sprint)

15. **[M-AE-01]** Standardize `NotificationsScreen` item animations to use `MotiView` rather than Reanimated `ZoomIn`/`FadeInDown`.
16. **[M-HF-03]** Add haptic to `GoalProgressNotification.handleLeaveHint`.
17. **[L-HF-01]** Add haptic on reveal-mode card selection in `MysteryChoiceScreen`.
18. **[L-GL-02, L-GL-03]** Apply `Card glassmorphism` variant to checkout and deferred setup info cards.
19. **[L-ES-01]** Migrate `GoalsScreen` custom empty `View` (lines 342-354) to use the `<EmptyState>` component for consistency.
