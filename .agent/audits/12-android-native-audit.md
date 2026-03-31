# Android/Native Compatibility Audit
**Date:** 2026-03-29
**Scope:** D:/ErnitAppWeb_Test — Android readiness audit (web must not break)
**Auditor:** Automated scheduled task (read-only)

---

## Executive Summary

The codebase is well-structured with consistent platform branching patterns. Most web-only API calls (localStorage, window, document) are properly guarded with `Platform.OS === 'web'` checks. However, two **critical** issues would cause silent failures on Android, and several **high-severity** issues would produce visible layout bugs.

| Severity | Count | Impact |
|----------|-------|--------|
| CRITICAL | 2 | Silent crashes / features completely broken |
| HIGH | 3 | Visible layout / UX failures |
| MEDIUM | 3 | Inconsistent behavior, potential keyboard issues |
| LOW | 2 | Minor / theoretical |

---

## Files Audited

**Platform-specific:**
- `src/screens/giver/ExperienceDetailsScreen.native.tsx`
- `src/components/NativeStripeProvider.tsx`
- `src/components/NativeStripeProvider.web.tsx`
- `src/hooks/useNativePaymentSheet.tsx`
- `src/hooks/useNativePaymentSheet.web.tsx`

**Context & Services:**
- `src/context/TimerContext.tsx`
- `src/context/AppContext.tsx`
- `src/services/PushNotificationService.ts`
- `src/services/stripeService.ts`

**Config & Utilities:**
- `app.config.js`
- `src/utils/responsive.ts`
- `src/config/shadows.ts`

**Navigation:**
- `src/navigation/AppNavigator.tsx`

**Screens (all .tsx):**
- `src/screens/AuthScreen.tsx`
- `src/screens/FeedScreen.tsx`
- `src/screens/GoalsScreen.tsx`
- `src/screens/GiftFlowScreen.tsx`
- `src/screens/ChallengeLandingScreen.tsx`
- `src/screens/ChallengeSetupScreen.tsx`
- `src/screens/NotificationsScreen.tsx`
- `src/screens/UserProfileScreen.tsx`
- `src/screens/FriendProfileScreen.tsx`
- `src/screens/FriendsListScreen.tsx`
- `src/screens/AddFriendScreen.tsx`
- `src/screens/giver/CartScreen.tsx`
- `src/screens/giver/CategorySelectionScreen.tsx`
- `src/screens/giver/DeferredSetupScreen.tsx`
- `src/screens/giver/ExperienceCheckoutScreen.tsx`
- `src/screens/giver/ConfirmationScreen.tsx`
- `src/screens/giver/ConfirmationMultipleScreen.tsx`
- `src/screens/recipient/AchievementDetailScreen.tsx`
- `src/screens/recipient/CouponEntryScreen.tsx`
- `src/screens/recipient/DetailedGoalCard.tsx`
- `src/screens/recipient/GoalSettingScreen.tsx`
- `src/screens/recipient/JourneyScreen.tsx`

**Components (selected):**
- `src/components/BaseModal.tsx`
- `src/components/CommentModal.tsx`
- `src/components/ContactModal.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/components/FooterNavigation.tsx`
- `src/components/ImageViewer.tsx`
- `src/components/MotivationModal.tsx`
- `src/components/PersonalizedHintModal.tsx`
- `src/components/PWAInstaller.tsx`
- `src/components/SideMenu.tsx`

---

## Category: Timer / Notification

### FINDING 1 — CRITICAL: No Android Notification Channel Configured

**Severity:** CRITICAL
**Web Impact:** None (web uses Firebase Messaging, separate path)

`expo-notifications` on Android 8.0+ (API 26+) requires at least one notification channel to be created before scheduling any notification. Without a channel, **all local notifications silently fail** — no error thrown, no notification shown.

**Affected code:**
- `src/services/PushNotificationService.ts` — `scheduleSessionCompletionNotification()` (line 334), `showTimerProgressNotification()` (line 512)
- Neither method calls `Notifications.setNotificationChannelAsync()` before scheduling

The timer sticky notification (`showTimerProgressNotification`) and the session-completion notification will both silently do nothing on every Android 8+ device. The `requestLocalNotificationPermissions()` method (line 289) also does not create a channel.

**Fix approach (native-only, no web impact):**
Add an Android channel setup call (guarded with `Platform.OS === 'android'`) at app startup, before any notification is scheduled:
```ts
if (Platform.OS === 'android') {
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Ernit Notifications',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#00C896',
  });
}
```

---

### FINDING 2 — CRITICAL: GestureHandlerRootView Missing from App Root

**Severity:** CRITICAL
**Web Impact:** None (gesture handler is native-only)

`react-native-gesture-handler` is used in `src/components/HintPopup.tsx` (PanGestureHandler, lines 5–7) but the app root is never wrapped in `<GestureHandlerRootView>`. Without this wrapper:
- On Android, gesture handler may produce an error ("No root view found") or silently fail
- Swipe gestures on HintPopup will not work on Android

**Affected code:**
- `src/components/HintPopup.tsx` — imports `PanGestureHandler` from `react-native-gesture-handler`
- `src/navigation/AppNavigator.tsx` — root wrapper (needs `GestureHandlerRootView` here)

**Fix approach (native-only, no web impact):**
Wrap the root in `AppNavigator.tsx` with platform guard:
```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// ...
return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    {/* existing NavigationContainer */}
  </GestureHandlerRootView>
);
```
`GestureHandlerRootView` renders as a plain `View` on web via its `.web.js` stub, so this is safe.

---

### FINDING 3 — HIGH: No Foreground Service for Long Timer Sessions

**Severity:** HIGH
**Web Impact:** None

Android aggressively kills background processes. A user who starts a session timer and then backgrounds the app for >10 minutes on Android will likely have the JS process killed, stopping the timer and preventing the session-completion notification from being delivered by `expo-notifications` (which relies on a JS timeout/trigger).

**Affected code:**
- `src/context/TimerContext.tsx` — `setInterval` running in JS context (line 68–89); on Android background, this will be killed
- `src/services/PushNotificationService.ts` — `scheduleSessionCompletionNotification()` uses `Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL` (line 342) — this is a foreground-scheduled trigger and should survive app kill, but the timer elapsed display in `TimerContext` will stop updating

**Note:** The scheduled notification itself (`Notifications.scheduleNotificationAsync`) *will* survive app backgrounding on Android since Expo hands it off to the Android alarm system. The real issue is that the in-app timer display (`TimerContext`) will freeze/reset after Android kills the JS process. The elapsed time is recovered on next launch via `AsyncStorage` (the `loadTimers()` path at line 119), so data integrity is preserved — but the real-time counter display during a session will stop.

---

## Category: Keyboard Behavior

### FINDING 4 — MEDIUM: `KeyboardAvoidingView behavior={undefined}` on Android

**Severity:** MEDIUM
**Web Impact:** None

Three locations set `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` for `KeyboardAvoidingView`. On Android, `behavior={undefined}` disables the component entirely, leaving the keyboard potentially obscuring inputs.

| File | Line | Current Android behavior |
|------|------|--------------------------|
| `src/components/CommentModal.tsx` | 294 | `undefined` — KAV inactive |
| `src/screens/ChallengeSetupScreen.tsx` | 1528 | `undefined` — KAV inactive |
| `src/screens/recipient/GoalSettingScreen.tsx` | 1342 | `undefined` — KAV inactive |

**Context:** `app.config.js` sets `softwareKeyboardLayoutMode: "pan"` (line 23) for Android. With `pan` mode, Android itself pans the layout when the keyboard appears. This means `undefined` may be intentional to prevent double-adjustment. However, `pan` mode pans the *entire window* and can scroll content out of view, while `KAV` with `behavior="height"` adjusts only the component height. In modals (which float above the window), `pan` mode does NOT apply — so CommentModal will have no adjustment at all.

**Recommendation:** For `CommentModal` specifically, change `undefined` to `'height'` since it is a floating modal and `pan` mode does not apply to it. For `ChallengeSetupScreen` and `GoalSettingScreen` (full-screen), the `pan` mode interaction should be tested manually.

---

## Category: StatusBar

### FINDING 5 — HIGH: Hardcoded Platform-Specific Status Bar Offsets

**Severity:** HIGH
**Web Impact:** None (offsets are only used on native)

Two screens use hardcoded pixel values for top padding instead of `insets.top`, which will produce incorrect layout on Android devices with non-standard status bar heights (e.g., devices with punch-hole cameras, large notches, or no notch).

| File | Line | Issue |
|------|------|-------|
| `src/screens/GiftFlowScreen.tsx` | 2028 | `paddingTop: Platform.OS === 'ios' ? vh(56) : vh(40)` |
| `src/screens/giver/DeferredSetupScreen.tsx` | 494 | `paddingTop: Platform.OS === 'ios' ? vh(50) : vh(40)` |

`vh(40)` = ~29px on a 900px screen. Android status bar height varies from 24dp to 44dp+ on modern devices. Content will overlap the status bar or leave excessive whitespace.

Both files already import `useSafeAreaInsets` — the fix is to use `insets.top + Spacing.md` instead of the hardcoded value.

**Additional instance:**
- `src/screens/giver/DeferredSetupScreen.tsx` line 606: `paddingBottom: Platform.OS === 'ios' ? Spacing.xl : Spacing.md` — bottom padding should use `insets.bottom` to handle gesture home bar on Android.

---

## Category: Platform Code Branching

### FINDING 6 — LOW: iOS-Only Platform Check in ExperienceDetailsScreen.native.tsx

**Severity:** LOW
**Web Impact:** None (this file is native-only)

`src/screens/giver/ExperienceDetailsScreen.native.tsx` has no iOS/Android distinction beyond what `MainScreen` provides. The WebView for maps (lines 165–173) works on both iOS and Android — no issue here. The screen is clean.

**Status: PASS**

### FINDING 7 — PASS: Web API Calls Properly Guarded

All identified web-only API calls are correctly guarded:

| Location | API Used | Guard |
|----------|----------|-------|
| `AppContext.tsx:366,377` | `localStorage` | `Platform.OS === 'web'` ✓ |
| `AppNavigator.tsx:81,125,268` | `localStorage`, `window`, `document` | `Platform.OS !== 'web'` / `Platform.OS === 'web'` ✓ |
| `TimerContext.tsx:105–110` | `document.addEventListener` | `Platform.OS === 'web'` ✓ |
| `SideMenu.tsx:234–246` | `document.body.style` | `Platform.OS === 'web'` ✓ |
| `GiftFlowScreen.tsx:307,316` | `localStorage` | `Platform.OS === 'web'` ✓ |
| `DeferredSetupScreen.tsx:87–89` | `window.location.origin` | `Platform.OS === 'web'` ✓ |
| `ExperienceCheckoutScreen.tsx:76–96,252` | `localStorage`, `window.location` | `Platform.OS === 'web'` ✓ |
| `DetailedGoalCard.tsx:348,387,412` | `Notification`, `document` | `Platform.OS === 'web'` ✓ |
| `AchievementDetailScreen.tsx:870` | `navigator.canShare`, `document` | `Platform.OS === 'web'` ✓ |
| `ChallengeLandingScreen.tsx:462` | `document.createElement` | `Platform.OS === 'web'` ✓ |
| `PushNotificationService.ts:19,46,74` | `Notification`, `window`, `navigator` | `Platform.OS !== 'web'` guards ✓ |

**Status: PASS — No unguarded web API calls found.**

---

## Category: Stripe Platform Integration

### FINDING 8 — PASS: Stripe Platform Split is Correct

**Severity:** N/A
**Web Impact:** None (correctly isolated)

| Component | Platform | Status |
|-----------|----------|--------|
| `NativeStripeProvider.tsx` | iOS/Android | Uses `@stripe/stripe-react-native` `StripeProvider` ✓ |
| `NativeStripeProvider.web.tsx` | Web | Passthrough `<>{children}</>` ✓ |
| `useNativePaymentSheet.tsx` | iOS/Android | Re-exports from `@stripe/stripe-react-native` ✓ |
| `useNativePaymentSheet.web.tsx` | Web | Stub — prevents bundler from pulling native SDK ✓ |
| `app.config.js` | Android/iOS | `merchantIdentifier: "merchant.app.ernit"` in plugin config ✓ |

`ExperienceCheckoutScreen.tsx` uses the platform-resolved `usePaymentSheet` hook and has separate web-only `loadStripe()` initialization (guarded with `Platform.OS === 'web'`). The native payment sheet flow is properly isolated.

**Status: PASS**

---

## Category: SafeAreaView

### FINDING 9 — PASS: SafeArea Coverage is Adequate

Most screens use one of two correct patterns:
1. Rendered inside `MainScreen` which wraps with `<SafeAreaView edges={['top']}>` (`src/screens/MainScreen.tsx:57`)
2. Use `useSafeAreaInsets()` directly and apply insets to layout padding

Screens confirmed using safe area:
- `AuthScreen.tsx` — wraps with `<SafeAreaView>` + `useSafeAreaInsets()` ✓
- `LandingScreen.tsx` — uses `SafeAreaView` from safe-area-context ✓
- `GoalsScreen.tsx`, `FeedScreen.tsx`, `NotificationsScreen.tsx` — `useSafeAreaInsets()` ✓
- `CartScreen.tsx`, `CategorySelectionScreen.tsx`, `DeferredSetupScreen.tsx` — `useSafeAreaInsets()` ✓
- `JourneyScreen.tsx`, `AchievementDetailScreen.tsx`, `CouponEntryScreen.tsx` — `useSafeAreaInsets()` ✓

**Caveat:** See FINDING 5 — some screens retrieve insets but apply hardcoded values instead.

---

## Category: Gestures

### FINDING 10 — PASS: Gesture Conflicts Minimal

- `ExperienceDetailsScreen.native.tsx`: WebView inside ScrollView uses `scrollEnabled={false}` and `nestedScrollEnabled={false}` (lines 170–171) ✓
- `ImageViewer.tsx`: `BackHandler` correctly implemented for Android back button (only usage found in codebase) ✓
- `HintPopup.tsx`: Uses `PanGestureHandler` — blocked by FINDING 2 (no root view wrapper)

**BackHandler gap:** Only `ImageViewer.tsx` handles the Android hardware back button. Modals like `CommentModal`, `BaseModal`, and `HowItWorksModal` do not use `BackHandler`. On Android, pressing the hardware back button inside these modals will navigate away from the screen rather than closing the modal. This is a **MEDIUM** UX issue but not a crash.

---

## Category: Responsive Scaling

### FINDING 11 — PASS: `vh()` Utility is Android-Safe

`src/utils/responsive.ts` correctly:
- Uses `Dimensions.addEventListener('change', ...)` to update on orientation change (line 6)
- Clamps between 0.72–1.0 to prevent extreme values on large Android tablets
- `VH` is a snapshot export; `vh()` function computes live — correct usage pattern

**Status: PASS**

---

## Category: Android-Specific

### FINDING 12 — PASS: Shadows are Platform-Aware

`src/config/shadows.ts` includes both iOS shadow properties (`shadowColor`, `shadowOpacity`, `shadowRadius`, `shadowOffset`) and Android `elevation` in every preset. No platform branching needed at usage sites.

**Status: PASS**

### FINDING 13 — LOW: `softwareKeyboardLayoutMode: "pan"` + KAV Interaction

`app.config.js:23` sets `softwareKeyboardLayoutMode: "pan"`. With this setting:
- Android pans the entire layout up when the keyboard appears
- `KeyboardAvoidingView` with `behavior="height"` *additionally* shrinks the component
- Combined effect: content may pan up twice on some screens

This affects `AuthScreen`, `GiftFlowScreen`, `DeferredSetupScreen`, `UserProfileScreen`, `CouponEntryScreen` which use `behavior="height"` on Android. In practice, `pan` mode at the activity level and `behavior="height"` at the component level tend to work together without doubling because RN coordinates these, but it should be verified on a real Android device.

The `behavior={undefined}` choices (FINDING 4) may be partly intentional for this reason.

---

## Summary Table

| # | Category | Finding | Severity | Web Impact |
|---|----------|---------|----------|------------|
| 1 | Timer/Notification | No Android notification channel — all local notifications silently fail on Android 8+ | **CRITICAL** | None |
| 2 | Gestures | GestureHandlerRootView missing from app root — gesture handler fails on Android | **CRITICAL** | None |
| 3 | Timer/Notification | No foreground service — JS timer killed on Android after ~10min background | HIGH | None |
| 4 | Keyboard | KAV `behavior={undefined}` on Android in CommentModal, ChallengeSetupScreen, GoalSettingScreen | MEDIUM | None |
| 5 | StatusBar | Hardcoded `paddingTop`/`paddingBottom` instead of `insets.top`/`insets.bottom` in GiftFlowScreen, DeferredSetupScreen | HIGH | None |
| 6 | Platform Code | iOS/Android split in ExperienceDetailsScreen.native.tsx — OK | PASS | — |
| 7 | Platform Code | All web-only API calls (localStorage, window, document) properly guarded | PASS | — |
| 8 | Stripe | Native/web Stripe split correctly implemented | PASS | — |
| 9 | SafeAreaView | Most screens use SafeAreaView or insets correctly | PASS | — |
| 10 | Gestures | BackHandler only in ImageViewer; modals lack it (UX regression, not crash) | MEDIUM | None |
| 11 | Responsive | vh() utility is orientation-aware and Android-safe | PASS | — |
| 12 | Android-Specific | Shadows use elevation + shadowXxx — correctly dual-platform | PASS | — |
| 13 | Android-Specific | softwareKeyboardLayoutMode "pan" + KAV interaction needs device testing | LOW | None |

---

## Recommended Fix Order

1. **[CRITICAL]** Create Android notification channel at app startup in `PushNotificationService.ts`
2. **[CRITICAL]** Wrap app root with `GestureHandlerRootView` in `AppNavigator.tsx`
3. **[HIGH]** Replace hardcoded `paddingTop` values with `insets.top` in `GiftFlowScreen` and `DeferredSetupScreen`
4. **[HIGH]** Document/address foreground service limitation for long timer sessions
5. **[MEDIUM]** Fix `CommentModal` KAV behavior (floating modal — `pan` mode doesn't apply)
6. **[MEDIUM]** Add `BackHandler` to primary modals (`CommentModal`, `BaseModal` center variant, `HowItWorksModal`)
