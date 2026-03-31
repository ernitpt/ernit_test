# Navigation & Routing Audit — Ernit App
**Date:** 2026-03-29
**Auditor:** Automated navigation audit agent
**Scope:** Full navigation system — routes, deep links, auth guards, back navigation, param validation

---

## Files Audited

| File | Purpose |
|---|---|
| `src/navigation/AppNavigator.tsx` | Core navigation config, route definitions, auth flow |
| `src/types/navigation.ts` | Navigation prop types, typed hooks |
| `src/types/index.ts` | RootStackParamList, GiverStackParamList, RecipientStackParamList |
| `src/components/ProtectedRoute.tsx` | Auth guard component |
| `src/components/FooterNavigation.tsx` | Footer tab navigation |
| `src/context/AuthGuardContext.tsx` | Auth guard context, login prompt, post-login redirect |
| `src/hooks/useAuthGuard.ts` | Re-export shim (deprecated) |
| `src/hooks/useBeforeRemove.ts` | Back navigation guard hook |
| `src/utils/serializeNav.ts` | Navigation param serialization |
| `app.config.js` | Expo config, scheme: "ernit" |
| All screen files in `src/screens/**/*.tsx` | Navigation calls, param access |

---

## Summary

| Severity | Count |
|---|---|
| HIGH | 2 |
| MEDIUM | 6 |
| LOW | 5 |
| INFO | 5 |

---

## Category: Dead Route

### DR-01 — `Landing` screen is unreachable from within the app
**Severity:** MEDIUM
**File:** `src/navigation/AppNavigator.tsx:292`, `src/screens/LandingScreen.tsx`

`LandingScreen` is registered as a route (`Landing`) but no in-app `navigation.navigate('Landing')` call exists anywhere. The initial route for guests is `ChallengeLanding`, not `Landing`. `LandingScreen` is only accessible via the deep link `ernit://landing`. The screen was likely a predecessor to `ChallengeLandingScreen` and should be removed or its deep link path redirected.

**Impact:** Dead code in the navigator; no functional regression.

---

### DR-02 — `GiftLanding` route never navigated to programmatically
**Severity:** LOW
**File:** `src/navigation/AppNavigator.tsx:298`

`GiftLanding` is registered as a deep-link entry point (`ernit://gift`) aliasing `ChallengeLandingScreen` with `initialParams={{ mode: 'gift' }}`. No in-app screen calls `navigation.navigate('GiftLanding')`. All flows navigate directly to `GiftFlow` or `ChallengeLanding`. This route exists exclusively as a deep link alias and is dead code within the app's internal navigation graph.

---

### DR-03 — `HeroPreview` screen is unreachable from within the app
**Severity:** LOW
**File:** `src/navigation/AppNavigator.tsx:449`, `src/screens/HeroPreviewScreen.tsx`

`HeroPreviewScreen` is registered as a public route. No `navigation.navigate('HeroPreview')` call exists in any screen. Accessible via deep link `ernit://hero-preview` only. Appears to be a design preview/dev screen that was never connected to the main navigation flow.

---

### DR-04 — `AnimationPreview` only conditionally registered and never navigated to
**Severity:** INFO
**File:** `src/navigation/AppNavigator.tsx:439–447`

`AnimationPreview` is only added to the navigator when `config.debugEnabled` is true. No screen ever navigates to it. Pure dead code in production.

---

## Category: Protected Route

### PR-01 — `PROTECTED_ROUTES` array defined but never used
**Severity:** MEDIUM
**File:** `src/navigation/AppNavigator.tsx:60–77`

```ts
const PROTECTED_ROUTES: (keyof RootStackParamList)[] = [
  'GiverFlow', 'Confirmation', 'ConfirmationMultiple', 'Profile',
  'Goals', 'GoalDetail', 'Journey', 'ExperienceCheckout',
  'RecipientFlow', 'Notification', 'Feed', 'AddFriend',
  'FriendProfile', 'FriendsList', 'PurchasedGifts', 'AchievementDetail',
];
```

This array is defined but **never referenced** in any runtime logic. The actual protection is implemented by wrapping each `Stack.Screen` render function in `<ProtectedRoute>`. The array is incomplete documentation:
- `GoalSetting` IS wrapped in ProtectedRoute but NOT in the array
- `AnimationPreview` IS wrapped in ProtectedRoute but NOT in the array

**Risk:** Developers may trust this array to determine what's protected, leading to oversight when adding new routes.

---

### PR-02 — `DeferredSetup` is a public route involving payment card collection
**Severity:** MEDIUM
**File:** `src/navigation/AppNavigator.tsx:300`, `src/screens/giver/DeferredSetupScreen.tsx`

`DeferredSetup` is not wrapped in `ProtectedRoute`. An unauthenticated user who follows `ernit://gift/setup-payment` (or who is deep-linked with crafted params) would see the Stripe PaymentElement card-setup UI before authenticating. The missing-params guard in `NativeDeferredSetup` (line 270) would redirect to `ChallengeLanding` if `setupIntentClientSecret` is absent. However:

1. The web version (`SetupInner`) accesses `routeParams.setupIntentClientSecret` without an equivalent null guard → potential null dereference if params are present but malformed.
2. A SetupIntent client secret obtained by a third party could theoretically be passed to this screen, showing the card-save UI without authentication.

**Recommendation:** Add `ProtectedRoute` wrapper to `DeferredSetup`. The server-side Stripe webhook validates ownership anyway, but defense-in-depth requires auth at the route level too.

---

### PR-03 — `GiftFlow` and `ChallengeSetup` are public routes with inline auth
**Severity:** INFO
**File:** `src/navigation/AppNavigator.tsx:296, 299`

By design, unauthenticated users can reach `GiftFlowScreen` and `ChallengeSetupScreen`. Auth is enforced inline before the payment step (`navigation.navigate('Auth', { mode: 'signup' })`). This is intentional to minimize friction for new users. Documented here for completeness.

---

## Category: Deep Link

### DL-01 — `ExperienceDetails` deep link param type mismatch (crash risk)
**Severity:** HIGH
**File:** `src/navigation/AppNavigator.tsx:227`, `src/screens/giver/ExperienceDetailsScreen.native.tsx`, `src/screens/giver/ExperienceDetailsScreen.web.tsx`

Linking config:
```ts
ExperienceDetails: 'experience/:id',
```
But `RootStackParamList` defines:
```ts
ExperienceDetails: { experience: Experience };
```
When a user taps `ernit://experience/abc123`, React Navigation parses the URL and sets `route.params = { id: "abc123" }`. The screen code destructures `route.params.experience` as a full `Experience` object and immediately accesses `.id`, `.title`, `.category`, etc. — this produces **undefined property access** errors or a crash.

Neither `ExperienceDetailsScreen.native.tsx` nor `ExperienceDetailsScreen.web.tsx` validates `route.params.experience` before use.

**Fix options:**
- Add a `parse` mapping to load the experience by ID on mount when params contain an `id` field
- Add a null-guard with redirect to `CategorySelection` if `experience` is undefined/non-object

---

### DL-02 — Multiple deep link paths map to object params that cannot be serialized from URLs
**Severity:** MEDIUM
**File:** `src/navigation/AppNavigator.tsx:205–255`

The following routes have linking paths configured but require full object params that cannot arrive from a URL. Each is listed with its current fallback behavior:

| Route | Deep Link Path | Required Params | Fallback |
|---|---|---|---|
| `Journey` | `journey` | `{ goal: Goal }` | Redirects to Goals ✓ |
| `AchievementDetail` | `achievement` | `{ goal: Goal }` | Navigates to Profile ✓ |
| `Confirmation` | `confirmation` | `{ experienceGift: ExperienceGift }` | SCA recovery → CategorySelection ✓ |
| `ConfirmationMultiple` | `confirmation-multiple` | `{ experienceGifts: ExperienceGift[] }` | Redirects to CategorySelection ✓ |
| `GoalSetting` | `goal-setting` | `{ experienceGift: ExperienceGift }` | Redirects to RecipientFlow ✓ |
| `DeferredSetup` | `gift/setup-payment` | `{ setupIntentClientSecret: string; experienceGift: ExperienceGift }` | Redirects to ChallengeLanding ✓ |

All fallbacks are safe. However, these deep link paths serve no useful function — a share URL pointing to `ernit://achievement` lands the user on `Profile` with zero context. If these paths are advertised anywhere (emails, push notifications), they provide a degraded experience.

**Recommendation:** Either remove these link paths from the linking config, or add ID-based deep link formats with proper Firestore lookups on mount.

---

### DL-03 — `ChallengeLanding` mapped to empty path `''`
**Severity:** LOW
**File:** `src/navigation/AppNavigator.tsx:248`

```ts
ChallengeLanding: '',
```

This maps the root URL (`https://ernit.app/`) to `ChallengeLanding`. On web, this is correct behavior — the landing page is the default. However, if `NavigationContainer` decides there's no matching path for a given URL, it may fall back to this empty path, potentially showing the landing screen unexpectedly for malformed deep links.

---

### DL-04 — Push notification cold-start navigation loses destination if user not authenticated
**Severity:** MEDIUM
**File:** `src/navigation/AppNavigator.tsx:164–200`

When a push notification is tapped on cold start and the user is not authenticated, the code calls:
```ts
navigationRef.current.navigate('GoalDetail', { goalId: data.goalId });
```
`ProtectedRoute` fires on `GoalDetail`, calls `requireAuth()` storing `{ routeName: 'GoalDetail', params: { goalId } }` as pending navigation, and redirects to `ChallengeLanding`. After login, `handleAuthSuccess` dispatches `CommonActions.navigate({ name: 'GoalDetail', params: { goalId } })`.

This path is **functionally correct** but depends on ProtectedRoute extracting the route params from `navigation.getState()` at the moment it fires. If the navigation state hasn't fully settled when ProtectedRoute runs (race condition with the 0ms timer), the params could be lost. The `setTimeout(() => {...}, 0)` on line 42 of `ProtectedRoute.tsx` introduces a tick where navigation state may be stale.

---

## Category: Back Navigation

### BN-01 — `ConfirmationScreen` has no back-navigation guard after payment
**Severity:** HIGH
**File:** `src/screens/giver/ConfirmationScreen.tsx`, `src/screens/giver/ExperienceCheckoutScreen.tsx:290`

After a successful payment, `ExperienceCheckoutScreen` navigates to `ConfirmationScreen` with `navigation.navigate()` (not `replace()`):

```ts
// ExperienceCheckoutScreen.tsx:290
navigation.navigate("Confirmation", { experienceGift: gifts[0], goalId });
```

`ConfirmationScreen` does not import or use `useBeforeRemove`. On native, the user can press the hardware back button or swipe to return to `ExperienceCheckoutScreen`. The payment intent is already consumed — `initRef.current = true` blocks re-initialization, but the UI still shows the payment form and the "Pay" button remains tappable. A user who presses back, sees the payment form, and re-submits could trigger a new Stripe PaymentIntent creation call (a new `stripeCreatePaymentIntent` Cloud Function invocation), potentially resulting in:
- A duplicate charge if the old intent is re-used
- Confusing UX: user thinks they're re-paying

The same issue exists for `ConfirmationMultipleScreen` (line 298).

**Fix:** Change `navigation.navigate("Confirmation", ...)` to `navigation.replace("Confirmation", ...)` in ExperienceCheckoutScreen after successful payment, so back-press from Confirmation has nowhere to go (or stack is reset). Alternatively, add `useBeforeRemove` to ConfirmationScreen that intercepts back and resets to CategorySelection.

---

### BN-02 — `ChallengeSetupScreen` and `GiftFlowScreen` use `useBeforeRemove` correctly
**Severity:** INFO
**File:** `src/screens/ChallengeSetupScreen.tsx:189`, `src/screens/GiftFlowScreen.tsx:287`

Both multi-step wizard screens implement `useBeforeRemove` with an Alert to prevent accidental data loss. The guard is bypassed after goal creation via `goalCreatedRef.current = true`. This is the correct pattern.

---

### BN-03 — `GoalSettingScreen` uses `useBeforeRemove` correctly
**Severity:** INFO
**File:** `src/screens/recipient/GoalSettingScreen.tsx:148`

Same correct pattern as BN-02. Noted for completeness.

---

## Category: Param Validation

### PV-01 — All critical screens validate params with graceful redirects
**Severity:** INFO

The following screens properly handle missing/invalid route params:

| Screen | Validated Param | Guard | Redirect |
|---|---|---|---|
| `GoalDetailScreen` | `goalId` | `useEffect` null check | Resets to Goals |
| `JourneyScreen` | `goal` | `useEffect` null check | Navigate to Goals |
| `AchievementDetailScreen` | `goal` | `useEffect` null check | Navigate to Profile |
| `GoalSettingScreen` | `experienceGift` | `hasValidData` check | Reset to RecipientFlow |
| `ConfirmationScreen` | `experienceGift` | `hasValidData` + SCA recovery | Reset to CategorySelection |
| `ConfirmationMultipleScreen` | `experienceGifts[]` | `hasValidData` check | Reset to CategorySelection |
| `ExperienceCheckoutScreen` (native) | `cartItems` | empty array check | goBack or reset |
| `DeferredSetupScreen` | `setupIntentClientSecret` + `experienceGift` | null check | Replace with ChallengeLanding |

**Gap: `ExperienceDetailsScreen` (see DL-01)** — no validation for `route.params.experience` being a valid object.

---

### PV-02 — `ExperienceDetails` and `Journey` receive non-serializable object params
**Severity:** MEDIUM
**File:** `src/screens/UserProfileScreen.tsx:103`, `src/screens/recipient/CompletedGoalCard.tsx:32`

Screens pass full `Goal` and `Experience` objects via navigation params:
```ts
navigation.navigate('Journey', { goal: serializeNav(goal) });
navigation.navigate('ExperienceDetails', { experience });
```

`serializeNav()` correctly converts `Date` and Firestore `Timestamp` fields to ISO strings, preventing the "Non-serializable values were found in the navigation state" warning. This is the correct approach.

However, these large objects (potentially 2–10KB each) are embedded in the navigation state. On web, React Navigation persists navigation state in `window.history`, serializing all params. Large objects increase serialization overhead and history state size.

---

## Category: State Persistence

### SP-01 — Navigation state not persisted across app restarts
**Severity:** INFO
**File:** `src/navigation/AppNavigator.tsx:258`

`NavigationContainer` has no `initialState` prop. On cold start, users always land on `Goals` (authenticated) or `ChallengeLanding` (guest). Multi-step wizard progress (ChallengeSetup, GiftFlow) is lost on force-quit. This is acceptable standard behavior for mobile.

---

### SP-02 — Payment redirect recovery is implemented correctly
**Severity:** INFO
**File:** `src/screens/giver/ExperienceCheckoutScreen.tsx:244–303`

For redirect-based payment methods (MB Way, etc.), `ExperienceCheckoutScreen` stores the pending payment in AsyncStorage/localStorage under key `pending_payment_${clientSecret}`. On return from redirect, it retrieves the PaymentIntent status and polls for gift creation. Edge cases (poll timeout, missing gifts) are handled with user-visible messages and navigation to `PurchasedGifts`. This is a robust implementation.

---

## Category: Nested Navigator

### NN-01 — `PurchasedGifts`, `ConfirmationMultiple`, `MysteryChoice` in `GiverStackParamList` but not in `GiverNavigator`
**Severity:** MEDIUM
**File:** `src/types/index.ts:685–694`, `src/navigation/AppNavigator.tsx:94–101`

`GiverStackParamList` declares:
```ts
export type GiverStackParamList = {
  CategorySelection: ...
  ExperienceDetails: ...
  ExperienceCheckout: ...
  Confirmation: ...
  Cart: ...
  ConfirmationMultiple: ...  // ← NOT in GiverNavigator
  MysteryChoice: ...         // ← NOT in GiverNavigator
  PurchasedGifts: ...        // ← NOT in GiverNavigator
};
```
But `GiverNavigator` only registers: `CategorySelection`, `ExperienceDetails`, `ExperienceCheckout`, `Cart`, `Confirmation`.

When code using `GiverNavigationProp` calls `navigation.navigate('PurchasedGifts')` etc., TypeScript doesn't complain (the type says it's valid) but React Navigation falls through to the RootStack. This is a **type-system lie** — TypeScript says it's a GiverStack route but runtime treats it as a RootStack route. This causes silent type confusion.

---

### NN-02 — RecipientStack `Profile` vs RootStack `Profile`
**Severity:** LOW
**File:** `src/navigation/AppNavigator.tsx:105–110`

`RecipientNavigator` registers a `Profile` screen (UserProfileScreen). `AchievementDetailScreen` inside RecipientStack calls:
```ts
navigation.navigate('Profile');
```
This navigates to the **RecipientStack's** `Profile`, not the RootStack's `Profile`. Both render `UserProfileScreen`, so behavior is functionally identical. However, the stack depth differs — from RecipientStack, back-press after navigating to `Profile` returns to CouponEntry, not to the expected parent in RootStack. This can produce unexpected back-navigation behavior in the recipient redemption flow.

---

### NN-03 — `FooterNavigation` correctly uses `useRootNavigation()`
**Severity:** INFO
**File:** `src/components/FooterNavigation.tsx:153`

FooterNavigation uses the typed `useRootNavigation()` hook, ensuring footer tab presses always navigate at the RootStack level, even when rendered from within a nested stack. This is the correct pattern.

---

## Category: Screen Transition

### ST-01 — All navigators use `animation: 'fade'` globally
**Severity:** INFO
**File:** `src/navigation/AppNavigator.tsx:95, 106, 287`

All three navigators (GiverStack, RecipientStack, RootStack) set `animation: 'fade'` in `screenOptions`. This provides a consistent transition experience. No conflicting custom animations found.

---

### ST-02 — `LoginPromptModal` transparent modal may flash on fade-out transitions
**Severity:** LOW
**File:** `src/navigation/AppNavigator.tsx:452–466`

`LoginPromptModal` uses `presentation: 'transparentModal'` with `animation: 'fade'`. When dismissed while the underlying screen is also fading, both animations run simultaneously. On some platforms this can cause a brief double-fade artifact. Low priority but worth testing on Android hardware.

---

## Critical Fix Priority

1. **[HIGH] BN-01** — Change `navigate("Confirmation", ...)` to `replace()` after successful payment in `ExperienceCheckoutScreen` to prevent back-navigation to the payment form.
2. **[HIGH] DL-01** — Add null-guard in `ExperienceDetailsScreen` for missing `route.params.experience` and handle the `:id`-only deep link case by fetching the experience by ID.
3. **[MEDIUM] PR-01** — Delete the `PROTECTED_ROUTES` array (it's misleading unused dead code) or turn it into an actual runtime check.
4. **[MEDIUM] PR-02** — Wrap `DeferredSetup` in `ProtectedRoute`.
5. **[MEDIUM] NN-01** — Remove `ConfirmationMultiple`, `MysteryChoice`, `PurchasedGifts` from `GiverStackParamList` since they're not in `GiverNavigator`, to fix the type-system lie.
6. **[MEDIUM] DL-04** — Add integration test for cold-start notification tap → auth → GoalDetail navigation to verify the ProtectedRoute param extraction is reliable.

---

## Deployment Notes

No infrastructure changes required for navigation fixes. All changes are client-side TypeScript/React Native.
