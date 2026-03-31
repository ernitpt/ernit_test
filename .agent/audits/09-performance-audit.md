# Performance Audit — Ernit App (Web)

**Audit Date:** 2026-03-29
**Auditor:** Automated scheduled task (Claude)
**Scope:** All screens, components, context providers, hooks, services, navigation, utils

---

## Executive Summary

The codebase demonstrates **strong performance awareness** overall. React.memo, useMemo, and useCallback are used consistently throughout. FlatList configurations are well-tuned on primary screens. Context providers use best-practice split patterns. No catastrophic anti-patterns (render loops, unbounded listeners) were found.

The main issues are a cluster of **medium-severity** problems: sort/filter operations that run inside Firestore listener callbacks instead of being memoized, a handful of missing `useCallback`/`useMemo` on specific handlers, inline object creation in JSX props, and three screens using ScrollView + `.map()` for unbounded lists.

**No CRITICAL (visible jank/freeze) issues found. Eleven HIGH/MEDIUM issues require attention.**

---

## Category 1 — Unnecessary Re-renders

### HIGH — GoalsScreen: `.reduce()` in ListHeaderComponent (not memoized)

**File:** `src/screens/GoalsScreen.tsx:377-378`

```tsx
weeklyDone={currentGoals.reduce((acc, g) => acc + (g.weeklyCount || 0), 0)}
weeklyTarget={currentGoals.reduce((acc, g) => acc + (g.sessionsPerWeek || 0), 0)}
```

Two `.reduce()` calls run inline in the `ListHeaderComponent` prop on every FlatList render cycle. The `ListHeaderComponent` itself is not memoized, so it re-executes on any parent state change regardless of whether `currentGoals` changed.

**Fix:** Extract both values into a single `useMemo`:
```tsx
const { weeklyDone, weeklyTarget } = useMemo(() => ({
  weeklyDone: currentGoals.reduce((acc, g) => acc + (g.weeklyCount || 0), 0),
  weeklyTarget: currentGoals.reduce((acc, g) => acc + (g.sessionsPerWeek || 0), 0),
}), [currentGoals]);
```

---

### MEDIUM — FeedPost: Inline objects in shadow/style props

**File:** `src/components/FeedPost.tsx:345-386`

Multiple inline style objects (shadow configs, transform arrays) are created fresh on every render, causing shallow comparison mismatches and downstream re-renders for child components that receive them as props. The component is wrapped in `React.memo` but the benefit is negated by unstable prop references.

**Fix:** Move stable style objects into the `useMemo(() => createStyles(colors), [colors])` call that already exists at line 47.

---

### MEDIUM — FeedPostHeader: Color string concatenation in render

**File:** `src/components/feed/FeedPostHeader.tsx:39`

```tsx
backgroundColor: typeColor + '4D'  // and typeColor + '1A'
```

String concatenation produces a new string object on every render. Because `FeedPostHeader` is inside a memoized `FeedPost`, this only matters when `FeedPost` re-renders, but it's a consistent source of new object identity.

**Fix:** Memoize the derived color strings:
```tsx
const badgeColors = useMemo(() => ({
  bg: typeColor + '4D',
  text: typeColor + '1A',
}), [typeColor]);
```

---

### MEDIUM — ExperienceDetailModal: Images array recreated every render

**File:** `src/components/ExperienceDetailModal.tsx:107-109`

The images array (built from `experience.coverImageUrl` and `experience.additionalImages`) is constructed inline with no memoization. Every render creates a new array, which invalidates any downstream `React.memo` checks.

**Fix:**
```tsx
const images = useMemo(() => [
  experience?.coverImageUrl,
  ...(experience?.additionalImages ?? []),
].filter(Boolean), [experience?.coverImageUrl, experience?.additionalImages]);
```

---

## Category 2 — Missing useCallback / useMemo

### HIGH — GoalsScreen: Sort operations run inside onSnapshot callback

**File:** `src/screens/GoalsScreen.tsx:124-145`

Both sort passes (`activeGoals.sort(...)` and `finished.sort(...)`) run synchronously inside the Firestore `onSnapshot` callback. Each snapshot (including no-op updates from unrelated field changes) triggers two O(n log n) sort operations plus `new Date()` object creation for every goal. With 10+ goals this adds up during high-frequency listening sessions.

```ts
// Inside onSnapshot:
activeGoals.sort((a, b) => {
  const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return bDate - aDate;
});
```

**Fix:** Store the raw goals array in state and sort/filter via `useMemo`:
```tsx
const [rawGoals, setRawGoals] = useState<Goal[]>([]);

const currentGoals = useMemo(() =>
  rawGoals
    .filter(g => !g.isCompleted && g.currentCount < g.targetCount)
    .sort((a, b) => (b.createdAt ? new Date(b.createdAt).getTime() : 0)
                  - (a.createdAt ? new Date(a.createdAt).getTime() : 0)),
[rawGoals]);

const completedGoals = useMemo(() =>
  rawGoals
    .filter(g => g.isCompleted || g.currentCount >= g.targetCount)
    .sort((a, b) => (b.createdAt ? new Date(b.createdAt).getTime() : 0)
                  - (a.createdAt ? new Date(a.createdAt).getTime() : 0)),
[rawGoals]);
```

---

### MEDIUM — BookingCalendar: Event handlers not memoized

**File:** `src/components/BookingCalendar.tsx`

`goToPreviousMonth`, `goToNextMonth`, and `handleDateSelect` are defined as plain functions without `useCallback`. They are passed as `onPress` props to child `TouchableOpacity` elements. While `BookingCalendar` itself is memoized, any re-render of it causes new function identity for each handler, preventing memoization benefit of any downstream children.

**Fix:** Wrap all three in `useCallback`.

---

### MEDIUM — CommentSection: `handleLike` not memoized

**File:** `src/components/CommentSection.tsx:36`

`handleLike` is defined inline without `useCallback`. It is mapped over the comments array and passed as `onPress` to each comment item. On every render of `CommentSection` (which is memoized externally), new function references are created for each mapped comment.

**Fix:** `useCallback` with `[comments]` dependency, or extract a memoized `CommentItem` sub-component that owns its own handler.

---

### MEDIUM — FeedPostContent: `Array.from()` in render

**File:** `src/components/feed/FeedPostContent.tsx:39,61`

```tsx
Array.from({ length: completedWeeks }).map(...)
Array.from({ length: totalWeeks }).map(...)
```

These create new arrays on every render. Although `FeedPostContent` is wrapped in `React.memo`, the arrays are created before any prop comparison, consuming allocation on every parent render cycle.

**Fix:** Wrap in `useMemo` keyed on `completedWeeks` and `totalWeeks`.

---

### LOW — GoalChangeSuggestionModal: Inline numeric validation in onChange handlers

**File:** `src/components/GoalChangeSuggestionModal.tsx:109-112,125-127`

Inline input validation logic (numeric range clamping) runs inline in the `onChange` prop. Minor allocation issue, but consistently fires on each keystroke.

**Fix:** Extract min/max derived values into `useMemo` and wrap handlers in `useCallback`.

---

## Category 3 — Heavy Computations in Render

### HIGH — GoalsScreen: `new Date()` objects in sort comparators (see Category 2)

Already documented above. Creating Date objects inside a sort comparator that runs on every snapshot is the heaviest single render-path computation found.

---

### MEDIUM — NotificationsScreen: FlatList keyExtractor uses index fallback

**File:** `src/screens/NotificationsScreen.tsx:1207`

```tsx
keyExtractor={(item, index) => item.id || index.toString()}
```

When `item.id` is falsy (e.g., transient notifications), the fallback to `index.toString()` causes React Native to treat the item as positionally keyed. Any list reorder will trigger unmount/remount of items at shifted positions instead of just moving them. This causes unnecessary full re-renders of affected items.

**Fix:** Ensure all notification documents written to Firestore always have an `id` field. The fallback should be a stable derived key (e.g., `item.createdAt + item.type`), not the index.

---

## Category 4 — Firestore Listener Cleanup

### Summary: All primary listeners are properly cleaned up.

Confirmed cleanup in:
- `GoalsService.listenToUserGoals()` → returns `unsub`, called in `GoalsScreen:173`
- `FeedService.listenToFeed()` → returns `unsubscribe`, properly used
- `NotificationService.listenToUserNotifications()` → returns `unsubscribe`
- `JourneyScreen:996` → `return () => { isMounted = false; unsub(); }`
- `DetailedGoalCard:318` → `return () => unsubscribe()`
- `useNetworkStatus.ts:46` → `return () => unsubscribe()`

### LOW — GoalService: Async per-goal processing in onSnapshot callback

**File:** `src/services/GoalService.ts:318-344`

```ts
const unsub = onSnapshot(qy, async (snap) => {
  const results = await Promise.all(
    snap.docs.map(async (d) => {
      // applyExpiredWeeksSweep(data) — async per goal
    })
  );
  cb(results);
});
```

Every snapshot (including no-op field updates) triggers `applyExpiredWeeksSweep` for every goal in parallel. With 20+ goals, this creates a burst of async microtasks on every Firestore update. The delay before calling `cb(results)` means the UI update is deferred by the slowest async sweep.

**Fix:** Consider moving `applyExpiredWeeksSweep` to a debounced background task or caching sweep results per goal ID with a TTL, only re-sweeping when the relevant `weekStart` field actually changed.

---

### LOW — AudioPlayer: Playback status callback cleanup is sound but indirect

**File:** `src/components/AudioPlayer.tsx:41-45,61-71`

The `setOnPlaybackStatusUpdate` listener set at line 61 is cleaned up by unloading the sound in the `useEffect` cleanup at line 43 (`sound.unloadAsync()`). This is correct — unloading removes the callback. However, there is a brief window between when `createAsync` resolves and when `setSound(newSound)` is called (both async operations) during which the component could unmount. This is guarded by `mountedRef.current` at line 55, which correctly calls `newSound.unloadAsync()` in that case. No action required — this is noted for awareness only.

---

## Category 5 — Image Optimization

### GOOD — Consistent `expo-image` with `cachePolicy="memory-disk"` ✅

`expo-image` is used in 20+ components/screens as the primary image component. All usages reviewed include `cachePolicy="memory-disk"` and `contentFit="cover"`, providing LRU memory + disk caching with proper aspect-ratio rendering.

Confirmed in:
- `Avatar.tsx`, `FeedPost.tsx`, `FriendProfileScreen.tsx`, `UserProfileScreen.tsx`
- `JourneyScreen.tsx`, `HintHistoryModal.tsx`, `ExperiencePurchaseCTA.tsx`
- `ConfirmationScreen.tsx`, `ConfirmationMultipleScreen.tsx`, `CartScreen.tsx`, and others

### GOOD — `compressImageBlob` used in StorageService ✅

**File:** `src/services/StorageService.ts:115,168,202`

Image compression is applied in three upload paths (profile photo, session media, hint images) before upload. The implementation correctly:
- Skips files under 500KB
- Skips files under 2MB that are within dimension limits
- Applies Canvas-based resize to 1200px max dimension at 80% JPEG quality
- Falls back to original blob on failure

### LOW — imageCompression.ts is web-only (Canvas API)

**File:** `src/utils/imageCompression.ts:27-29`

```ts
if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
  return blob;  // No-op on native
}
```

On native (iOS/Android), `compressImageBlob` silently returns the original uncompressed blob. Large images (e.g., 4K from camera) are uploaded without compression on native platforms. Since the app targets React Native via Expo, this means the compression utility provides no benefit for mobile users uploading from their camera roll.

**Fix:** Implement native compression using `expo-image-manipulator` with a platform-aware branch, or use `expo-image-picker`'s built-in `quality` option (already available in the picker config) to compress at capture time.

---

## Category 6 — Bundle Size

### GOOD — Console log removal in production ✅

**File:** `babel.config.js:10`

```js
isProduction && ['transform-remove-console', { exclude: ['error', 'warn'] }]
```

`transform-remove-console` is correctly configured to strip `console.log` and `console.info` in production builds while preserving `error` and `warn`.

### GOOD — No `import *` patterns found ✅

Grep across all `src/` files returned no wildcard imports. All imports are named, enabling tree-shaking.

### GOOD — Reanimated plugin positioned last ✅

**File:** `babel.config.js:12`

`react-native-reanimated/plugin` is the last Babel plugin as required by the library.

### MEDIUM — AppNavigator: All 40+ screens imported eagerly

**File:** `src/navigation/AppNavigator.tsx:20-50` (approximately)

All screen components are statically imported at the top of the navigator file. On the web target (Metro bundler), this prevents any code-splitting benefit — the entire app module graph is loaded before the first screen renders.

**Fix (web):** Use `React.lazy()` + `Suspense` for non-critical routes (giver flow screens, profile screens, settings). Keep core screens (FeedScreen, GoalsScreen, JourneyScreen) as static imports for fast initial render.

**Note:** On native, Metro produces a single bundle regardless, so this has no effect on the native TTI. The benefit is exclusively for the web build.

### LOW — No FlashList usage

The codebase uses `FlatList` everywhere. For the primary content-heavy screens (FeedScreen, NotificationsScreen, GoalsScreen), FlatList with tuned `windowSize`/`maxToRenderPerBatch` is adequate. However, for screens with complex heterogeneous row heights (NotificationsScreen with 8 different notification types), `@shopify/flash-list` would provide measurable scroll performance improvement by eliminating the blank-area calculation overhead.

This is an optimization opportunity, not a current bug.

---

## Category 7 — FlatList Performance

### Summary: FlatList usage is well-configured on all primary screens.

| Screen | `keyExtractor` | `getItemLayout` | `initialNumToRender` | `windowSize` | `renderItem memoized` |
|---|---|---|---|---|---|
| FeedScreen | ✅ `item.id` | ❌ (variable height) | ✅ 5 | ✅ 5 | ✅ useCallback |
| GoalsScreen | ✅ `item.id` | ❌ (variable height) | ✅ 5 | ✅ 5 | ✅ useCallback |
| NotificationsScreen | ⚠️ index fallback | ❌ (variable height) | ✅ 8 | ✅ 5 | ✅ useCallback |
| FriendsListScreen | ✅ `item.id` | ✅ 88px fixed | ✅ 10 | ✅ 5 | ✅ useCallback |
| AddFriendScreen | ✅ `item.id` | ✅ 72px fixed | ✅ 10 | ✅ 5 | ✅ useCallback |
| PurchasedGiftsScreen | ✅ `item.id` | ✅ 120px fixed | ✅ 6 | ✅ 5 | ✅ useCallback |
| CategorySelectionScreen | ✅ `item.id` | ❌ | ✅ 4-5 | ✅ 3 | unverified |

### MEDIUM — CartScreen, ConfirmationScreen, ConfirmationMultipleScreen: ScrollView + `.map()` for item lists

**Files:**
- `src/screens/giver/CartScreen.tsx`
- `src/screens/giver/ConfirmationScreen.tsx`
- `src/screens/giver/ConfirmationMultipleScreen.tsx`

Cart items and confirmation steps are rendered via `.map()` inside `ScrollView`. These are giver-flow screens where the item count is bounded in practice (cart typically < 10 items), so this is not causing visible jank today. However, it is an anti-pattern that will degrade if cart size grows.

**Fix:** For CartScreen: Convert the cart items section to a `FlatList` with `scrollEnabled={false}` nested in the parent ScrollView. For ConfirmationScreen and ConfirmationMultipleScreen: The steps arrays are static and finite — no change required, anti-pattern is acceptable at this scale.

---

## Category 8 — Animation Performance

### GOOD — Moti and Reanimated usage is correct ✅

- `babel-preset-expo` + `react-native-reanimated/plugin` configured correctly (babel.config.js)
- `newArchEnabled: true` in `app.config.js` enables JSI-based Reanimated 3, which runs worklets natively on the UI thread
- `moti` animations in SkeletonLoader, PopupMenu, FeedPostEmpowerActions use declarative `animate`/`exit` patterns that delegate to Reanimated

### GOOD — SideMenu stagger animation uses `useRef` ✅

**File:** `src/components/SideMenu.tsx:116-238`

The stagger animation creates `Animated.Value` refs in a `useRef` array at mount time (not re-created on each render), preventing memory churn from animation value recreation.

### LOW — useModalAnimation: Config dependency array may cause re-animation

**File:** `src/hooks/useModalAnimation.ts:49`

```ts
useEffect(() => {
  // ... start animation
}, [visible, initialValue, toValue, tension, friction, useSpring, duration]);
```

If the caller passes config values as inline literals (e.g., `tension={40}`), React re-evaluates the primitives each render and they remain stable. However, if any config prop is an object or computed value, the animation re-fires on every parent render. Currently all call sites use literal numbers, so this is low risk.

---

## Files Audited

### Screens (40 files)
`FeedScreen.tsx`, `GoalsScreen.tsx`, `GoalDetailScreen.tsx`, `NotificationsScreen.tsx`, `UserProfileScreen.tsx`, `FriendProfileScreen.tsx`, `FriendsListScreen.tsx`, `AddFriendScreen.tsx`, `PurchasedGiftsScreen.tsx`, `GiftFlowScreen.tsx`, `ChallengeLandingScreen.tsx`, `ChallengeSetupScreen.tsx`, `AuthScreen.tsx`, `AnimationPreviewScreen.tsx`, `HeroPreviewScreen.tsx`, `LandingScreen.tsx`, `MainScreen.tsx`, `giver/CartScreen.tsx`, `giver/CategorySelectionScreen.tsx`, `giver/ConfirmationScreen.tsx`, `giver/ConfirmationMultipleScreen.tsx`, `giver/DeferredSetupScreen.tsx`, `giver/ExperienceCheckoutScreen.tsx`, `giver/ExperienceDetailsScreen.native.tsx`, `giver/ExperienceDetailsScreen.web.tsx`, `giver/MysteryChoiceScreen.tsx`, `recipient/AchievementDetailScreen.tsx`, `recipient/CompletedGoalCard.tsx`, `recipient/CouponEntryScreen.tsx`, `recipient/DetailedGoalCard.tsx`, `recipient/GoalSettingScreen.tsx`, `recipient/JourneyScreen.tsx`, `recipient/components/GoalCardModals.tsx`, `recipient/components/PledgedExperiencePreview.tsx`, `recipient/components/ProgressBars.tsx`, `recipient/components/SessionActionArea.tsx`, `recipient/components/SessionMediaPrompt.tsx`, `recipient/components/StreakBanner.tsx`, `recipient/components/TimerDisplay.tsx`, `recipient/components/WeeklyCalendar.tsx`

### Components (60 files)
`AudioPlayer.tsx`, `Avatar.tsx`, `BaseModal.tsx`, `BookingCalendar.tsx`, `Button.tsx`, `Card.tsx`, `Chip.tsx`, `ClaimExperienceModal.tsx`, `CommentModal.tsx`, `CommentSection.tsx`, `CompactReactionBar.tsx`, `ConfirmationDialog.tsx`, `ContactModal.tsx`, `DefaultUserIcon.tsx`, `DiscoveryQuizModal.tsx`, `EmptyState.tsx`, `EmpowerChoiceModal.tsx`, `ErrorBoundary.tsx`, `ErrorRetry.tsx`, `ExperienceDetailModal.tsx`, `ExperiencePurchaseCTA.tsx`, `ExperienceRevealModal.tsx`, `FeedPost.tsx`, `FooterNavigation.tsx`, `FreeGoalNotification.tsx`, `FriendRequestNotification.tsx`, `GoalApprovalNotification.tsx`, `GoalChangeSuggestionModal.tsx`, `GoalChangeSuggestionNotification.tsx`, `GoalEditApprovalNotification.tsx`, `GoalEditModal.tsx`, `GoalProgressNotification.tsx`, `HintHistoryModal.tsx`, `HintPopup.tsx`, `HowItWorksModal.tsx`, `ImageViewer.tsx`, `JourneyDemo.tsx`, `LoginPrompt.tsx`, `LogoutConfirmation.tsx`, `ModernSlider.tsx`, `MotivationModal.tsx`, `NativeStripeProvider.tsx`, `NativeStripeProvider.web.tsx`, `PersonalizedHintModal.tsx`, `PopupMenu.tsx`, `ProgressBar.tsx`, `ProtectedRoute.tsx`, `PWAInstaller.tsx`, `ReactionBar.tsx`, `ReactionIcons.tsx`, `ReactionPicker.tsx`, `ReactionViewerModal.tsx`, `SharedHeader.tsx`, `SideMenu.tsx`, `SkeletonLoader.tsx`, `SpriteAnimation.tsx`, `TextInput.tsx`, `Toast.tsx`, `VenueSelectionModal.tsx`, `WizardProgressBar.tsx`, `feed/FeedPostContent.tsx`, `feed/FeedPostEmpowerActions.tsx`, `feed/FeedPostHeader.tsx`

### Context / Hooks / Services
`AppContext.tsx`, `TimerContext.tsx`, `ToastContext.tsx`, `AuthGuardContext.tsx`, `useMediaComposer.ts`, `useNetworkStatus.ts`, `useModalAnimation.ts`, `useAuthGuard.ts`, `GoalService.ts`, `FeedService.ts`, `NotificationService.ts`, `FriendService.ts`, `AnalyticsService.ts`

### Navigation & Config
`AppNavigator.tsx`, `app.config.js`, `babel.config.js`, `metro.config.js`, `src/utils/imageCompression.ts`, `src/utils/responsive.ts`

---

## Consolidated Issue List

| # | Severity | Category | File | Issue |
|---|---|---|---|---|
| 1 | HIGH | Re-renders | `GoalsScreen.tsx:377-378` | `.reduce()` inline in FlatList ListHeaderComponent on every render |
| 2 | HIGH | Memoization | `GoalsScreen.tsx:124-145` | Sort+filter runs inside onSnapshot callback; should be `useMemo` |
| 3 | HIGH | Image | `imageCompression.ts:27-29` | Canvas compression is web-only; native uploads are uncompressed |
| 4 | MEDIUM | Re-renders | `FeedPost.tsx:345-386` | Inline shadow/style objects cause identity churn on memoized component |
| 5 | MEDIUM | Re-renders | `FeedPostHeader.tsx:39` | Color string concatenation creates new string identity every render |
| 6 | MEDIUM | Re-renders | `ExperienceDetailModal.tsx:107-109` | Images array recreated on every render |
| 7 | MEDIUM | Memoization | `BookingCalendar.tsx` | `goToPreviousMonth`, `goToNextMonth`, `handleDateSelect` not useCallback |
| 8 | MEDIUM | Memoization | `CommentSection.tsx:36` | `handleLike` not useCallback; new reference per render per comment |
| 9 | MEDIUM | Memoization | `FeedPostContent.tsx:39,61` | `Array.from()` creates new array on every render |
| 10 | MEDIUM | FlatList | `CartScreen.tsx` | ScrollView+`.map()` for cart items; not virtualized |
| 11 | MEDIUM | FlatList | `NotificationsScreen.tsx:1207` | `keyExtractor` falls back to index when `item.id` is falsy |
| 12 | MEDIUM | Bundle | `AppNavigator.tsx` | All 40+ screens imported eagerly (web code-split opportunity) |
| 13 | LOW | Listener | `GoalService.ts:318-344` | Async sweep per goal in every snapshot callback |
| 14 | LOW | Memoization | `GoalChangeSuggestionModal.tsx:109-127` | Inline validation logic in onChange handlers |
| 15 | LOW | Animation | `useModalAnimation.ts:49` | Dep array could cause re-animation if caller passes object config |

---

## Well-Implemented Patterns (No Action Needed)

- **React.memo** applied to all list item components and reusable components throughout
- **useMemo for styles** — consistent `useMemo(() => createStyles(colors), [colors])` pattern in all screens and components
- **Context split** — `ToastContext` correctly separates actions from state; `TimerContext` similarly split; `AppContext` uses reducer pattern
- **FlatList tuning** — `initialNumToRender`, `maxToRenderPerBatch`, `windowSize` properly set on all primary FlatList screens
- **Stable keyExtractors** — all FlatLists except NotificationsScreen use `item.id`
- **`getItemLayout`** for fixed-height lists (FriendsListScreen, AddFriendScreen, PurchasedGiftsScreen, ImageViewer)
- **Firestore listener cleanup** — all `onSnapshot` subscriptions have proper `return () => unsub()` patterns
- **expo-image** with `cachePolicy="memory-disk"` used consistently across all image rendering sites
- **Image compression** before upload via StorageService (web path)
- **`transform-remove-console`** in production Babel config
- **No `import *`** patterns anywhere in the codebase
- **`newArchEnabled: true`** — JSI bridge enabled for Reanimated 3 native thread execution
- **Debounced AsyncStorage** in TimerContext (5s window)
- **Buffered Firestore writes** in AnalyticsService (10-event or 30s flush)
- **AnalyticsService cleanup** — interval and AppState listener properly cleaned in `destroy()`
