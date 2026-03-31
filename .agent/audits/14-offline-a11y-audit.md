# Audit 14 — Offline Resilience & Accessibility
**Date:** 2026-03-29
**Auditor:** Scheduled agent (automated)
**Scope:** Full codebase read-only analysis — offline resilience (Part A) + accessibility (Part B)

---

## Files Audited

**Offline / Network:**
- `src/services/firebase.ts`
- `src/hooks/useNetworkStatus.ts`
- `src/context/AppContext.tsx`
- `src/utils/retry.ts`
- `src/services/GoalSessionService.ts`
- `src/services/GoalService.ts` (partial)
- `src/services/stripeService.ts`
- `src/services/StorageService.ts`
- `src/services/FeedService.ts`
- `src/services/NotificationService.ts`
- `src/screens/MainScreen.tsx`
- `src/screens/GoalsScreen.tsx`
- `src/screens/GoalDetailScreen.tsx`
- `src/screens/FeedScreen.tsx`
- `src/screens/recipient/JourneyScreen.tsx`
- `src/screens/recipient/components/SessionActionArea.tsx`
- `src/screens/giver/ExperienceCheckoutScreen.tsx`

**Accessibility (grep-surveyed all 84 .tsx files + full reads of key components):**
- `src/config/colors.ts`
- `src/config/typography.ts`
- `src/config/spacing.ts`
- `src/components/Button.tsx`
- `src/components/BaseModal.tsx`
- `src/components/FooterNavigation.tsx`
- `src/components/Toast.tsx`
- `src/components/ReactionBar.tsx`
- `src/components/CompactReactionBar.tsx`
- `src/components/SkeletonLoader.tsx` (grep)
- All screens (grep for `accessibilityLabel`, `accessibilityRole`, `allowFontScaling`)

---

## PART A — Offline Resilience

### A1 — Firestore Offline Persistence

| Severity | Finding |
|----------|---------|
| **HIGH** | **Native app has NO Firestore offline persistence.** In `firebase.ts`, `dbOptions` is `{}` for non-web platforms (the `persistentLocalCache` branch is web-only). The React Native Firestore SDK does *not* enable disk persistence by default. Writes made while offline are queued in memory only and are **lost if the app is force-closed or killed before reconnecting**. This affects iOS and Android users. |
| MEDIUM | Web persistence is correctly configured: `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` enables IndexedDB-backed caching with multi-tab synchronization. Firestore reads (including `onSnapshot`) will serve from cache when offline — good. |
| LOW | Auth persistence is correct on both platforms: `browserLocalPersistence` (web) and `getReactNativePersistence(AsyncStorage)` (native) — users stay logged in offline. |

**Details:**
```ts
// firebase.ts — line 45–47
const dbOptions = (Platform.OS === 'web')
  ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }
  : {};  // ← native gets no offline persistence
```

**Risk:** A native user who logs a session, reacts to a feed post, or creates a goal while offline — and then force-quits the app before reconnecting — will lose that data. Firestore's in-memory queue is not durable.

---

### A2 — Network Status Handling

| Severity | Finding |
|----------|---------|
| GOOD | `useNetworkStatus` (NetInfo) correctly monitors connectivity, shows a toast on disconnect ("No internet connection") and on reconnect ("Back online"). First-check logic avoids false "Back online" toasts on launch. |
| GOOD | `MainScreen.tsx` renders a persistent red banner when `!isConnected` — present on all wrapped screens. |
| MEDIUM | **No screen-level offline guards.** Individual screens (GoalsScreen, JourneyScreen, FeedScreen, etc.) do not check `isConnected` before initiating critical writes. Users can tap "Start Session" or "Log Session" while offline and receive a generic error rather than a preemptive "You're offline" message. |
| LOW | `useNetworkStatus` is instantiated only in `MainScreen`. Screens outside `MainScreen` (pre-auth flows: `AuthScreen`, `ChallengeLandingScreen`, `LandingScreen`) have no network awareness. |

---

### A3 — Service Resilience

| Severity | Finding |
|----------|---------|
| **HIGH** | **`withRetry` is used only in `stripeService.ts`.** All Firestore-calling services (`GoalService`, `GoalSessionService`, `FeedService`, `FriendService`, `NotificationService`, `ExperienceService`, etc.) call Firestore directly without retry logic. They rely entirely on the Firestore SDK's internal retry behavior, which does not cover all transient failure cases. |
| **HIGH** | **`tickWeeklySession` uses `runTransaction` which requires a server round-trip.** Firestore transactions are not served from cache and will throw `unavailable` when offline. The session-logging flow will fail with a raw error rather than a user-friendly offline message. No `withRetry` wrapper is applied. |
| MEDIUM | `StorageService` uploads use `uploadBytes` (no retry). Each upload method has a 30s `fetch` timeout and re-throws errors. If mid-upload network drop occurs, the error propagates to the caller with no queuing or offline detection — the upload is silently lost. |
| MEDIUM | `FeedService.listenToFeed` — the async `getFriends()` setup call is wrapped in `.catch()` that only logs. If the initial friend-list fetch fails due to network, the `onSnapshot` listener is never registered. The user sees an empty feed with no error state or retry mechanism. |
| LOW | `onSnapshot` listeners in `GoalsService.listenToUserGoals` and `NotificationService.listenToUserNotifications` include error callbacks that log errors, but do not attempt re-subscription or inform the UI of listener failure. After a network-induced listener death, users will see stale data until they manually pull-to-refresh. |

---

### A4 — Critical Offline Scenarios

| Scenario | Behavior | Risk |
|----------|----------|------|
| **Log a session while offline (native)** | `tickWeeklySession` fires a Firestore `runTransaction` → SDK throws `unavailable`. The error propagates up. Caller shows a generic error toast. Session is NOT saved. | **DATA LOSS** — session is lost if user does not retry. |
| **Log a session while offline (web)** | Same transaction path — Firestore transactions require network even with IndexedDB persistence. Session is NOT saved offline. | **DATA LOSS** — same risk as native. |
| **Make a payment while offline** | `stripeService.createPaymentIntent` uses `withRetry` (3 attempts) + 30s AbortController timeout. Network failure results in timeout → retry → error shown to user. No partial-charge risk. | LOW — clean failure. |
| **Browse cached goals offline (web)** | `onSnapshot` and `getDoc` serve from IndexedDB cache. Goals list remains visible. Pull-to-refresh will fail silently (listener set up again when reconnected). | LOW — acceptable. |
| **Browse cached goals offline (native)** | No disk persistence — `onSnapshot` and `getDocs` will fail. `GoalsScreen` has a 15-second skeleton timeout safety valve that shows an error state. | MEDIUM — user sees error/empty state. |
| **App goes offline mid-upload (photo/video)** | `StorageService.uploadSessionMedia` aborts at the 30s timeout, throws. The session media prompt in `SessionMediaPrompt` must handle this. No partial-upload cleanup. | MEDIUM — upload silently fails; user must retry manually. |
| **Comment/reaction while offline** | `FeedService.updateReactionCount` and `CommentService` call Firestore directly — write is queued in memory on web (with persistence), lost on native if app is killed. | MEDIUM (native) / LOW (web). |

---

### A5 — Cloud Function Failure Handling

| Severity | Finding |
|----------|---------|
| MEDIUM | Client-callable Cloud Functions (`functions/src/b2bLogSession`, etc.) are called via `httpsCallable`. On network failure, the SDK throws a `FirebaseFunctionsError` with code `unavailable`. None of the client-side callers use `withRetry`; they catch and surface errors but do not retry. |
| MEDIUM | No idempotency keys are passed from the client for critical Cloud Function calls. If a Cloud Function completes but the client never receives the response (network drop after server success), the client may retry and trigger duplicate side-effects (e.g., duplicate feed posts, double-logging sessions). |
| LOW | `stripeService` correctly uses `withRetry` (3 attempts, exponential backoff, correctly classifies `network`/`timeout`/`unavailable`/`failed to fetch` as retryable). Payment flows are well-protected. |

---

## PART B — Accessibility

### B1 — Screen Reader Labels

| Severity | Finding |
|----------|---------|
| **HIGH** | **`Button` component has no `accessibilityLabel` prop.** The `ButtonProps` interface does not expose `accessibilityLabel`. `Button` variant=`"icon"` (44×44 circular button) displays only an icon with no text — screen readers will have no label for these buttons across the entire app. |
| **HIGH** | **Progress bars have no accessibility value.** `GoalDetailScreen` renders weekly and overall progress bars (`View` with `width: X%`) with no `accessibilityRole="progressbar"`, no `accessibilityValue`, and no `accessibilityLabel`. Screen readers cannot convey progress to users. |
| MEDIUM | `GoalDetailScreen` day-letter calendar: seven `View`+`Text` pairs rendered with no `accessibilityLabel`. A screen reader would read "M T W T F S S" without context explaining these are day-of-week labels. |
| MEDIUM | `SessionActionArea` start button: has `accessibilityRole="button"` and `accessibilityLabel="Start session"` — GOOD. But the "Waiting for approval" disabled state (`disabledStartContainer`) is a `View`+`Text` with no `accessibilityRole` or `accessibilityState={{ disabled: true }}`. |
| LOW | `FeedPost`, `FeedPostContent`, `FeedPostEmpowerActions` have partial coverage (3 labels total per component) but post cards have no overall `accessibilityLabel` — screen readers will serially read all nested text elements, which may be confusing. |
| GOOD | `FooterNavigation` NavButton: `accessibilityRole="tab"`, `accessibilityState={{ selected: isActive }}`, `accessibilityLabel="{label} tab"` — complete and correct. |
| GOOD | `BaseModal` close button: `accessibilityLabel="Close"`, `accessibilityRole="button"`, `accessibilityViewIsModal={true}` — correct focus trapping. |
| GOOD | `Toast` overlay: `accessibilityLiveRegion="polite"` — toasts are announced to screen readers. |
| GOOD | `ReactionBar` buttons: `accessibilityLabel="React with {type}"` and `accessibilityHint="Double tap to react"`. |

---

### B2 — Touch Target Sizes (minimum 44×44 pt per Apple HIG / WCAG 2.5.5)

| Component | Measured Size | Status |
|-----------|---------------|--------|
| `Button` variant=`"icon"` | `width: 44, height: 44` | ✅ PASSES (exactly) |
| `ReactionBar` buttons | `paddingVertical: 4 (xs)` + emoji text ~20px → effective ~28pt height | ❌ FAILS — ~16pt short |
| Toast dismiss `X` | `size={16}` + `hitSlop: 8` on each side → effective 32×32pt | ❌ FAILS — 12pt short |
| `BaseModal` close button | `size={22}` + `hitSlop: 10` on each side → effective 42×42pt | ⚠️ BORDERLINE — 2pt short |
| `FooterNavigation` NavButton | ~72px height (FOOTER_HEIGHT) ÷ 1 → full height | ✅ PASSES |
| `Button` size=`"sm"` | `paddingVertical: 8 (sm)` + body text 15px → effective ~31pt | ⚠️ BORDERLINE — 13pt short; relies on content height |

**Most impactful:** `ReactionBar` — social reactions are a key engagement feature and the primary tap target is too small. This affects `FeedPost` and `FeedScreen` where reactions appear.

---

### B3 — Color Contrast

WCAG AA requires 4.5:1 for normal text, 3:1 for large text (≥18px normal or ≥14px bold).

| Color Pair | Contrast Ratio | WCAG AA | Usage |
|------------|---------------|---------|-------|
| `primary #059669` on `white #FFFFFF` | ~3.0:1 | ❌ FAILS normal text | Primary buttons, links, badges with small text |
| `textSecondary #6B7280` on `white #FFFFFF` | ~4.6:1 | ✅ PASSES | Secondary text, ghost button text |
| `textMuted #9CA3AF` on `white #FFFFFF` | ~2.4:1 | ❌ FAILS | Inactive nav labels, timestamps, hint text — widespread |
| `textMuted #9CA3AF` on `surface #F9FAFB` | ~2.3:1 | ❌ FAILS | Same elements on light surface background |
| `success #22C55E` on `white #FFFFFF` | ~1.73:1 | ❌ FAILS | Success badges, checkmarks (decorative intent, but some carry meaning) |
| `warning #F59E0B` on `white #FFFFFF` | ~2.8:1 | ❌ FAILS normal text | Warning banners with text — borderline for large text only |
| `error #DC2626` on `white #FFFFFF` | ~4.6:1 | ✅ PASSES | Error messages, inline validation |
| `primary #059669` on `gradientPrimary` bg | ~3.5–3.8:1 | ⚠️ MARGINAL | Gradient button backgrounds |

**Most impactful failures:**
1. `textMuted` — used for inactive nav tab labels, timestamps, secondary metadata. Represents the most frequently seen low-contrast text in the app. Affects users with moderate vision impairment in normal ambient lighting.
2. `primary` on `white` — emerald green fails for body/caption text on white backgrounds (only passes for large text ≥18px).

**Dark mode:** `DarkColors.textMuted: '#8B95A3'` on `DarkColors.surface: '#1C1C1C'` — contrast ≈ 5.2:1 — PASSES (noted in comment). Dark mode is better on this metric.

---

### B4 — Focus Order

| Severity | Finding |
|----------|---------|
| GOOD | `BaseModal` uses `accessibilityViewIsModal={true}` — screen reader focus is correctly trapped inside open modals. |
| MEDIUM | No explicit `accessibilityOrder` or `importantForAccessibility` used to establish logical reading order in complex layouts (e.g., `JourneyScreen`, `GoalDetailScreen` with multiple card sections). React Native's default DOM order is used, which may not be logical for all layouts. |
| LOW | `SideMenu` (15 accessibilityRole/label occurrences) — appears well-labeled but no focus-trap or `accessibilityViewIsModal` — screen reader users may tab out of the side menu into background content. |

---

### B5 — Dynamic Content Announcements

| Severity | Finding |
|----------|---------|
| GOOD | `Toast` overlay uses `accessibilityLiveRegion="polite"` — all toasts are announced to screen readers. |
| MEDIUM | **Skeleton → content transitions are not announced.** When `GoalsScreen`, `FeedScreen`, or `JourneyScreen` finishes loading (skeleton disappears, content appears), there is no `accessibilityLiveRegion` announcement. Screen reader users may not know the page has loaded. |
| LOW | Error states (e.g., `ErrorRetry` component) are rendered as visible views but have no `accessibilityRole="alert"` or `accessibilityLiveRegion="assertive"`. Screen readers will only read them if focus moves there. |

---

### B6 — Text Scaling

| Severity | Finding |
|----------|---------|
| **HIGH** | **`allowFontScaling: false` on ALL native typography.** `src/config/typography.ts` line 14 sets `allowFontScaling: false` for `Platform.OS !== 'web'` on every typography token. This means all text in the app ignores the user's system font size preference on iOS and Android. The file comments acknowledge this as a WCAG 1.4.4 violation ("Revisit with a full layout audit before enabling"). Users with low vision who rely on system font scaling receive no accommodation. This is a systemic, app-wide issue. |
| LOW | No `maxFontSizeMultiplier` fallback is used — some apps use this as a middle ground to allow scaling up to 1.5× without breaking layouts. Not implemented. |

---

## Summary — Prioritized Findings

### Critical (fix before production)

| # | Category | Issue |
|---|----------|-------|
| C1 | Offline Persistence | No Firestore offline persistence on native — in-memory writes lost on app kill while offline |
| C2 | Offline — Session | `tickWeeklySession` fails completely offline; no user-friendly message, no queuing |
| C3 | A11y — Text Scaling | `allowFontScaling: false` globally on native — WCAG 1.4.4 violation, blocks all users who rely on system font size |

### High (fix in next sprint)

| # | Category | Issue |
|---|----------|-------|
| H1 | A11y — Contrast | `textMuted #9CA3AF` on white: 2.4:1 — fails WCAG AA across all screens |
| H2 | A11y — Contrast | `primary #059669` on white: 3.0:1 — fails for normal-size text labels |
| H3 | A11y — Buttons | `Button` component missing `accessibilityLabel` prop — icon buttons are invisible to screen readers |
| H4 | A11y — Progress | Progress bars have no `accessibilityValue`/`accessibilityRole` — screen readers cannot convey goal progress |
| H5 | Offline — Retry | `withRetry` not used in any Firestore service — transient failures not retried |

### Medium (address in upcoming sprints)

| # | Category | Issue |
|---|----------|-------|
| M1 | Offline — UX | No screen-level offline guards — users get raw errors instead of "you're offline" messages on session log/payment attempts |
| M2 | Offline — Storage | No retry or user feedback on mid-upload network failure |
| M3 | Offline — Feed | `FeedService.listenToFeed` silent failure when initial friend fetch fails — empty feed, no error state |
| M4 | A11y — Touch | `ReactionBar` buttons: ~28pt effective height — fails 44pt minimum; primary social engagement mechanism |
| M5 | A11y — Touch | Toast dismiss button: 32pt effective — fails 44pt minimum |
| M6 | A11y — Dynamic | No live region announcement when screens finish loading (skeleton→content) |
| M7 | A11y — Focus | `SideMenu` lacks `accessibilityViewIsModal`/focus trap |
| M8 | A11y — Contrast | `success #22C55E` on white: 1.73:1 — fails (use `successMedium #16A34A` which is ~5.1:1) |

### Low (track and address over time)

| # | Category | Issue |
|---|----------|-------|
| L1 | Offline — Native | Native `onSnapshot` listeners silently die on extended offline — stale data, no auto-resubscription |
| L2 | Offline — CF | No idempotency keys for client Cloud Function calls — duplicate risk on retry |
| L3 | A11y — Touch | `BaseModal` close button: 42pt (2pt short of 44pt minimum) |
| L4 | A11y — Touch | `Button` size=`"sm"`: ~31pt height (borderline); consider padding increase |
| L5 | A11y — Labels | Day-letter calendar (GoalDetailScreen) lacks descriptive accessibilityLabel |
| L6 | A11y — Labels | Feed post cards not wrapped with a composite `accessibilityLabel` — VoiceOver reads all nested text linearly |
| L7 | A11y — Dynamic | `ErrorRetry` component not marked as `accessibilityRole="alert"` |
| L8 | A11y — Scaling | No `maxFontSizeMultiplier` fallback even for partial font scaling support |

---

## Recommendations

### Immediate (Critical)

**C1 — Native offline persistence:** Enable Firestore disk persistence for React Native using the `@firebase/firestore` `enableIndexedDbPersistence` equivalent or switch to modular `initializeFirestore` with `persistentLocalCache` for all platforms. Alternatively, consider using `@firebase/firestore` long-polling mode with AsyncStorage.

**C2 — Session logging offline:** Before calling `tickWeeklySession`, check `NetInfo.fetch()` for connectivity. Show a "No internet — session cannot be saved offline" modal rather than a raw error. Consider a local queue (AsyncStorage) that syncs on reconnect.

**C3 — Font scaling:** Create a tiered fix: (1) Enable `allowFontScaling: true` on static display content (headings, labels), (2) use `maxFontSizeMultiplier={1.5}` on body text to allow scaling while capping layout-breaking sizes, (3) fix layouts that cannot handle scaled text.

### High Priority

**H1/H2 — Contrast:**
- Replace `textMuted` from `#9CA3AF` → `#6B7280` (which is `textSecondary`, ratio 4.6:1) for text elements.
- For purely decorative/non-essential hints, maintain current color but add a comment.
- For `primary` used on small text labels, switch to `primaryDark (#047857)` which is ~4.3:1 on white (borderline AA) or add a text shadow for gradient backgrounds.

**H3 — Button accessibilityLabel:** Add `accessibilityLabel?: string` to `ButtonProps`. Apply to all `variant="icon"` usage sites.

**H4 — Progress bars:** Add `accessibilityRole="progressbar"`, `accessibilityValue={{ min: 0, max: 100, now: weeklyPct }}`, and `accessibilityLabel="Weekly progress"` to progress bar `View` elements.

### Medium Priority

**M4 — ReactionBar touch target:** Increase `paddingVertical` from `Spacing.xs (4)` to `Spacing.md (12)`. This brings effective height to ~39pt; add `minHeight: 44` to the button style.

**M5 — Toast dismiss:** Increase `hitSlop` from `8` to `14` to achieve 44pt effective target.
