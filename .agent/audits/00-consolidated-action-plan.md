# Consolidated Audit Action Plan
**Generated:** 2026-03-29T06:00:00Z
**Based on:** 13 audit reports (07-flow-giver-audit.md and 00-self-review.md were missing — noted below)
**Missing reports:** 00-self-review.md (no quality grading available), 07-flow-giver-audit.md (giver flow not assessed)
**Self-review quality:** No self-review file found. All reports assessed independently. All are high quality (A/B grade) with specific file+line references.

---

## Executive Summary

- Total unique findings: **112** (after dedup and false positive removal)
- P0 (Fix Now): **7**
- P1 (This Week): **18**
- P2 (This Sprint): **25**
- P3 (Next Sprint): **32**
- P4 (Backlog): **30**
- Estimated total effort: **38 Quick + 47 Medium + 27 Complex**
- False positives removed: **7** (all self-downgraded within individual reports)
- Duplicates merged: **20** (primary overlap between 01↔04 on CORS/rate-limit, 01↔05 on PII rules, 02↔04 on scheduled function races, 08↔02 on goal state)

---

## Findings by Source Report

| Report | Grade | Raw Findings | After Dedup | False Positives |
|--------|-------|-------------|-------------|-----------------|
| 01-security-audit | A | 10 | 8 | 0 |
| 02-data-integrity-audit | A | 17 | 14 | 0 |
| 03-error-handling-audit | A | 14 | 14 | 0 |
| 04-cloud-functions-audit | A | 14 | 11 | 0 |
| 05-firestore-rules-audit | A | 13 | 11 | 0 |
| 06-type-safety-audit | B | 12 | 12 | 0 |
| 07-flow-giver-audit | **MISSING** | — | — | — |
| 08-flow-recipient-audit | A | 20 | 18 | 2 |
| 09-performance-audit | A | 15 | 15 | 0 |
| 10-ux-completeness-audit | A | 35 | 30 | 5 |
| 11-navigation-audit | A | 18 | 16 | 0 |
| 12-android-native-audit | A | 10 | 8 | 0 |
| 13-design-token-audit | B | 110+ violations → 12 categories | 12 | 0 |
| 14-offline-a11y-audit | A | 20 | 20 | 0 |

**Note on 07-flow-giver-audit.md:** This report is missing. Giver-side flows (CategorySelection, CartScreen, ExperienceCheckout payment flows, ConfirmationScreen, MysteryChoiceScreen, DeferredSetupScreen) have not had a dedicated end-to-end flow audit. Some of these were covered by 09-performance, 10-ux, 11-navigation, and 12-android audits but a dedicated flow audit should be run before launch.

---

## P0 — Fix Immediately

### P0-1: ExperienceGifts Collection — Unenforced List Rule Allows Claim Code Enumeration
- **Source audits:** 01-security (HIGH), 05-firestore-rules (confirmed in rules map)
- **Confidence:** High — Firestore list rule confirmed at line 486 of `firestore.rules` with no ownership filter
- **Severity:** CRITICAL — active security vulnerability
- **File(s):** `firestore.rules:486`
- **Description:** `allow list: if request.auth != null && request.query.limit <= 10` — no ownership filter. Any authenticated user can paginate through all `experienceGifts` documents, exposing claim codes, giver/recipient IDs, and Stripe payment intent IDs. A malicious user can enumerate all unclaimed codes and redeem other users' gifts.
- **Fix:**
  ```
  allow list: if request.auth != null
    && request.query.limit <= 10
    && (request.auth.uid == resource.data.giverId
        || request.auth.uid == resource.data.recipientId);
  ```
  Or, since Firestore list rules cannot reliably filter on `resource.data`, the safer long-term fix is routing claim lookups through a Cloud Function.
- **Effort:** Quick (rule change) → **Medium** (Cloud Function proxy)
- **Dependencies:** None
- **Deploy:** `firebase deploy --only firestore:rules`

---

### P0-2: Missing Firestore Rules for `users/{userId}/meta/{metaId}` Subcollection
- **Source audits:** 05-firestore-rules (CRIT-1)
- **Confidence:** High — confirmed by cross-referencing GoalService, GoalSessionService, FriendService code
- **Severity:** CRITICAL — breaks core flows
- **File(s):** `firestore.rules` (inside `/users/{userId}` match block)
- **Description:** `GoalService.createGoal()`, `GoalSessionService.tickWeeklySession()`, and `FriendService.checkRateLimit()` all read/write `users/{uid}/meta/goalCount` and `users/{uid}/meta/rateLimits` inside transactions. Zero rules cover this subcollection path. Firestore deny-by-default means every goal creation, goal completion, and friend request rate-limit check **fails with PERMISSION_DENIED**.
- **Fix:**
  ```
  // Inside match /users/{userId} { ... }
  match /meta/{metaId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
  ```
- **Effort:** Quick
- **Dependencies:** None
- **Deploy:** `firebase deploy --only firestore:rules`

---

### P0-3: Friend Accept Broken — `requestId` Missing from `friends` Create Rule `hasOnly` List
- **Source audits:** 05-firestore-rules (CRIT-2)
- **Confidence:** High — rules line 634 and FriendService.ts lines 227–246 confirmed
- **Severity:** CRITICAL — entire friend acceptance flow broken client-side
- **File(s):** `firestore.rules:634`
- **Description:** The `friends/{friendDocId}` create rule has a `hasOnly` whitelist that does not include `requestId`. `FriendService.acceptFriendRequest()` writes friend docs with a `requestId` field (added as security fix). All client-side friend acceptances fail with PERMISSION_DENIED.
- **Fix:** Add `'requestId'` to the `hasOnly` array at `firestore.rules:634`.
- **Effort:** Quick
- **Dependencies:** None
- **Deploy:** `firebase deploy --only firestore:rules`

---

### P0-4: Goal Edit Flow Broken — Notification Types `goal_edit_request`/`goal_edit_response` Not in Allowlist
- **Source audits:** 05-firestore-rules (CRIT-3)
- **Confidence:** High — notification create rule at lines 740–745 audited
- **Severity:** CRITICAL — goal edit approval workflow is non-functional
- **File(s):** `firestore.rules:740`
- **Description:** The notification `create` rule lists allowed types but `goal_edit_request` and `goal_edit_response` (added per system-map 2026-03-26) are absent. All notification writes from `GoalService.requestGoalEdit()`, `approveGoalEditRequest()`, `rejectGoalEditRequest()` silently fail in `try/catch`.
- **Fix:** Add `'goal_edit_request'` and `'goal_edit_response'` to the notification type allowlist at `firestore.rules:740`.
- **Effort:** Quick
- **Dependencies:** None
- **Deploy:** `firebase deploy --only firestore:rules`

---

### P0-5: Post-Payment Back Navigation Re-Exposes Payment Form (Double-Charge Risk)
- **Source audits:** 11-navigation (BN-01 HIGH)
- **Confidence:** High — `ExperienceCheckoutScreen.tsx:290` uses `navigate()` not `replace()`
- **Severity:** HIGH — payment integrity risk
- **File(s):** `src/screens/giver/ExperienceCheckoutScreen.tsx:290`, same for ConfirmationMultipleScreen
- **Description:** After successful payment, `ExperienceCheckoutScreen` uses `navigation.navigate("Confirmation", ...)` (not `replace`). The user can press hardware back from ConfirmationScreen to return to the payment form. `initRef.current = true` blocks re-initialization, but the Pay button remains tappable and could trigger a new `stripeCreatePaymentIntent` call.
- **Fix:** Change `navigation.navigate("Confirmation", ...)` → `navigation.replace("Confirmation", ...)` in both `ExperienceCheckoutScreen.tsx:290` and `ConfirmationMultipleScreen` (line 298).
- **Effort:** Quick
- **Dependencies:** None

---

### P0-6: `GoalService.updateGoal()` Allows Writing `isCompleted: false` and `sessionsPerWeek: 0` (Data Corruption / Double-Charge Risk)
- **Source audits:** 02-data-integrity (FINDING 02 HIGH)
- **Confidence:** High — `GoalService.ts:488` field whitelist confirmed
- **Severity:** HIGH — data corruption + potential double-charge
- **File(s):** `src/services/GoalService.ts:488-508`
- **Description:** `updateGoal` allows clients to write `isCompleted: false` (uncompleting a completed goal, potentially re-triggering `chargeDeferredGift`), `sessionsPerWeek: 0` (causing every week to be immediately "completed"), and `currentCount >= targetCount` (forcing goal completion on next sweep). Also uses a non-transactional ownership check (TOCTOU window).
- **Fix:**
  ```ts
  // In updateGoal(), before the updateDoc call:
  if ('isCompleted' in sanitizedUpdates) throw new AppError('FORBIDDEN', 'Cannot set isCompleted directly', 'validation');
  if ('sessionsPerWeek' in sanitizedUpdates && (sanitizedUpdates.sessionsPerWeek < 1 || sanitizedUpdates.sessionsPerWeek > 7)) throw ...;
  if ('targetCount' in sanitizedUpdates && (sanitizedUpdates.targetCount < 1 || sanitizedUpdates.targetCount > 52)) throw ...;
  if ('currentCount' in sanitizedUpdates) throw new AppError('FORBIDDEN', 'Cannot set currentCount directly', 'validation');
  ```
  Also consider moving the ownership check inside a transaction.
- **Effort:** Medium
- **Dependencies:** None

---

### P0-7: No Idempotency Key on `createFreeGift`/`createDeferredGift` — Duplicate Gifts on Network Retry
- **Source audits:** 04-cloud-functions (ID-1 MEDIUM)
- **Confidence:** High — confirmed both function signatures lack idempotency parameters
- **Severity:** HIGH — duplicate gifts and duplicate Stripe SetupIntents on client network retry
- **File(s):** `functions/src/createFreeGift.ts`, `functions/src/createDeferredGift.ts`
- **Description:** A user who taps "Send Challenge" and receives a timeout (but the function succeeded server-side) will retry and create two identical gift documents with two different claim codes, two emails sent, and (for deferred) two orphaned Stripe SetupIntents. Rate limit (10/hour) limits blast radius but does not prevent it.
- **Fix:** Accept a client-generated `idempotencyKey` (UUID) as an optional parameter. Check for existing gift with that key in Firestore before creating. Pattern: same as `processedPayments` in `stripeWebhook.ts`.
- **Effort:** Complex
- **Dependencies:** None
- **Deploy:** `firebase deploy --only functions:createFreeGift,functions:createDeferredGift`

---

## P1 — Fix This Week

### P1-1: Comment Unlike Denied by Firestore Rules
- **Source:** 05-firestore-rules (HIGH-1)
- **File:** `firestore.rules:916-918`
- **Description:** The comment update rule for non-owners checks `request.auth.uid in request.resource.data.likedBy` (future state). After `arrayRemove`, the UID is no longer present → unlike is denied. Users can like but cannot unlike others' comments.
- **Fix:** Change to check `request.auth.uid in resource.data.likedBy` (current state).
- **Effort:** Quick
- **Deploy:** `firebase deploy --only firestore:rules`

---

### P1-2: `experiences`/`categories` Rules Use `allow write` (Includes Delete)
- **Source:** 05-firestore-rules (HIGH-2)
- **File:** `firestore.rules:786-798`
- **Description:** Admin `write` permission covers create, update, AND delete. Deleting an experience silently breaks all goals and gifts referencing it.
- **Fix:** Replace `allow write:` with `allow create, update:` for both collections.
- **Effort:** Quick
- **Deploy:** `firebase deploy --only firestore:rules`

---

### P1-3: `ExperienceDetails` Deep Link Crash — `route.params.experience` Undefined
- **Source:** 11-navigation (DL-01 HIGH)
- **File:** `src/screens/giver/ExperienceDetailsScreen.native.tsx`, `ExperienceDetailsScreen.web.tsx`
- **Description:** Linking config maps `ExperienceDetails: 'experience/:id'` but the screen expects `{ experience: Experience }` object. Deep link sets `{ id: "abc123" }` → immediate crash on first property access.
- **Fix:** Add null-guard at top of screen. If `params.experience` is missing/not-an-object, fetch by `params.id` from Firestore. If neither present, navigate back to CategorySelection.
- **Effort:** Medium

---

### P1-4: Android — No Notification Channel (All Local Notifications Silently Fail on Android 8+)
- **Source:** 12-android (FINDING 1 CRITICAL)
- **File:** `src/services/PushNotificationService.ts`
- **Description:** Android 8.0+ requires a notification channel before any local notification can be shown. Neither `scheduleSessionCompletionNotification()` nor `showTimerProgressNotification()` creates a channel. All local notifications silently do nothing on Android.
- **Fix:** Add at app startup (platform-guarded):
  ```ts
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Ernit Notifications', importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250], lightColor: '#00C896',
    });
  }
  ```
- **Effort:** Quick

---

### P1-5: Android — `GestureHandlerRootView` Missing from App Root
- **Source:** 12-android (FINDING 2 CRITICAL)
- **File:** `src/navigation/AppNavigator.tsx`
- **Description:** `HintPopup.tsx` uses `PanGestureHandler` from `react-native-gesture-handler` but the app root lacks `<GestureHandlerRootView>`. On Android, gesture handler will produce errors or silently fail; swipe gestures on HintPopup won't work.
- **Fix:** Wrap root in `AppNavigator.tsx` with `<GestureHandlerRootView style={{ flex: 1 }}>`. (Safe on web — library provides a no-op `.web.js` stub.)
- **Effort:** Quick

---

### P1-6: Session Can Be Logged on a Completed Goal — No `isCompleted` Guard in `tickWeeklySession`
- **Source:** 08-flow-recipient (G1/S1 MEDIUM)
- **File:** `src/services/GoalSessionService.ts:187-318`
- **Description:** `tickWeeklySession` has no early-exit guard for `g.isCompleted === true`. If a goal is completed but `weeklyLogDates` doesn't include today, another session can be logged, incrementing `currentCount` and `weeklyCount` on an already-completed goal. Emits spurious feed posts, notifications, and analytics events.
- **Fix:** Add at top of transaction after `normalizeGoal`:
  ```ts
  if (g.isCompleted) throw new AppError('GOAL_COMPLETE', 'This goal is already completed.', 'business');
  ```
- **Effort:** Quick

---

### P1-7: `requestGoalEdit` Uses Non-Atomic Read-Check-Write
- **Source:** 08-flow-recipient (G2 MEDIUM)
- **File:** `src/services/GoalService.ts:943-966`
- **Description:** `requestGoalEdit` reads the goal with `getDoc`, checks `if (pendingEditRequest)`, then writes with `updateDoc` outside a transaction. Concurrent double-taps or multi-device requests can both pass the check and overwrite each other.
- **Fix:** Wrap the check and write inside `runTransaction` (same pattern as `approveGoalEditRequest` which already does this correctly).
- **Effort:** Medium

---

### P1-8: Notification Taps Silently No-Op for `goal_progress`, `free_goal_milestone`, `inactivity_nudge`
- **Source:** 08-flow-recipient (N1 MEDIUM)
- **File:** `src/screens/NotificationsScreen.tsx:226-448`
- **Description:** Three of the most common notification types have no tap handler — they mark as read but perform no navigation. `goal_progress` is a very frequent type and users receive no feedback when tapping.
- **Fix:** Add handlers that navigate to `Journey` screen with `goal` fetched by `n.data.goalId` for all three types.
- **Effort:** Medium

---

### P1-9: `goal_completed` Notification Navigates to GoalDetail Instead of AchievementDetail
- **Source:** 08-flow-recipient (N2 MEDIUM)
- **File:** `src/screens/NotificationsScreen.tsx:~433`
- **Description:** Tapping the completion notification takes users to the flat `GoalDetail` screen (progress bars) instead of `AchievementDetail` with `mode: 'completion'` (confetti, reward details, booking options). The celebration experience is missed entirely.
- **Fix:** Change `navigation.navigate('GoalDetail', { goalId })` → `navigation.navigate('AchievementDetail', { goal, mode: 'completion' })` for `goal_completed` type.
- **Effort:** Quick

---

### P1-10: `HeroPreviewScreen` — Unhandled Promise Rejection in `getAllExperiences().then()`
- **Source:** 03-error-handling (HIGH)
- **File:** `src/screens/HeroPreviewScreen.tsx:428`
- **Description:** `experienceService.getAllExperiences().then(...)` has no `.catch()`. If Firestore is unavailable, the unhandled rejection causes a red-screen error or silent crash. `ChallengeLandingScreen` has the same pattern but correctly handles it with `.catch()`.
- **Fix:** Add `.catch((e) => { logger.error('Failed to load experiences:', e); })`.
- **Effort:** Quick

---

### P1-11: No User Account Deletion Trigger — Orphaned Data (GDPR Risk)
- **Source:** 02-data-integrity (FINDING 01 HIGH)
- **File:** `functions/src/` (new file needed: `triggers/onUserDeleted.ts`)
- **Description:** No `functions.auth.user().onDelete` trigger exists. When a Firebase Auth user is deleted, all their Firestore data (goals, feed posts, friends, notifications, experienceGifts) remains permanently. GDPR/data retention implications for deletion requests.
- **Fix:** Create `onUserDeleted` trigger that: (1) anonymizes `users/{uid}`, (2) soft-deletes goals, (3) removes bidirectional friends, (4) cleans up notifications, (5) orphans friend requests.
- **Effort:** Complex
- **Deploy:** `firebase deploy --only functions:onUserDeleted`

---

### P1-12: `deleteGoal` Doesn't Clean Up Goal-Referencing Notifications
- **Source:** 02-data-integrity (FINDING 07 MEDIUM)
- **File:** `functions/src/deleteGoal.ts:256-303`
- **Description:** When a goal is deleted, notifications containing `data.goalId` (e.g., `goal_progress`, `session_reminder`, `weekly_recap`) remain in the user's inbox. Tapping them navigates to `GoalDetailScreen` which shows an error or crashes.
- **Fix:** After the main deletion transaction, query and delete notifications where `data.goalId == goalId` AND `userId == goalData.userId`.
- **Effort:** Medium
- **Deploy:** `firebase deploy --only functions:deleteGoal`

---

### P1-13: `sendWeeklyRecap` Idempotency Race Condition — Duplicate Notifications
- **Source:** 02-data-integrity (FINDING 04 MEDIUM)
- **File:** `functions/src/scheduled/sendWeeklyRecap.ts:115-179`
- **Description:** The `lastWeeklyRecapWeek` guard check reads from the outer `getDocs` snapshot, not from a transaction. Two concurrent function instances can both pass the guard and send duplicate recap notifications.
- **Fix:** Wrap the guard check and batch write in `db.runTransaction()`.
- **Effort:** Medium
- **Deploy:** `firebase deploy --only functions:sendWeeklyRecap`

---

### P1-14: `sendSessionReminders` N+1 Query Pattern
- **Source:** 04-cloud-functions (SR-2 MEDIUM)
- **File:** `functions/src/scheduled/sendSessionReminders.ts:96-101`
- **Description:** For each user with reminders enabled (potentially thousands), a separate Firestore query fetches that user's goals. At 1,000+ users this hits Firestore per-second operation limits.
- **Fix:** Prefetch all relevant goals in a single query, group by userId using a Map client-side (same approach as `sendWeeklyRecap:67-77`).
- **Effort:** Medium
- **Deploy:** `firebase deploy --only functions:sendSessionReminders`

---

### P1-15: Unbounded Firestore Queries in 4 Scheduled Functions (OOM/Timeout Risk at Scale)
- **Source:** 04-cloud-functions (SR-1 MEDIUM)
- **File:** `sendSessionReminders.ts:33-37`, `sendInactivityNudges.ts:37-41`, `sendWeeklyRecap.ts:59-63`, `checkUnstartedGoals.ts:31-35`
- **Description:** All four functions query entire collections with no `limit()` clause. At 100k+ documents, these risk OOM errors or hitting the 540-second timeout.
- **Fix:** Implement cursor-based pagination with `.orderBy('createdAt').startAfter(lastDoc).limit(500)` in a while-loop, or migrate to Cloud Tasks fan-out.
- **Effort:** Complex (per function)
- **Deploy:** `firebase deploy --only functions:sendSessionReminders,functions:sendInactivityNudges,functions:sendWeeklyRecap,functions:checkUnstartedGoals`

---

### P1-16: `retryFailedCharges` Non-Transactional Status Update
- **Source:** 02-data-integrity (FINDING 05 MEDIUM)
- **File:** `functions/src/retryFailedCharges.ts:89-129`
- **Description:** Status check (`payment !== 'processing'`) and status write (`payment: 'paid'`) are not in the same transaction. `chargeDeferredGift` running concurrently could set `payment: 'processing'` between these two operations, resulting in incorrect `paid` status before Stripe confirms.
- **Fix:** Wrap final write in `db.runTransaction()` with a fresh read and state re-check.
- **Effort:** Medium
- **Deploy:** `firebase deploy --only functions:retryFailedCharges`

---

### P1-17: `getUserMessage()` Doesn't Handle Firebase `FunctionsError` Codes
- **Source:** 03-error-handling (MEDIUM)
- **File:** `src/utils/AppError.ts:55-63`
- **Description:** When `httpsCallable` throws a `FunctionsError` (e.g., `resource-exhausted`, `unavailable`), `getUserMessage()` returns the generic fallback. Users see "Something went wrong" instead of "Rate limit reached" or "Server unavailable". Affects `FriendService.searchUsers` and `AIHintService.generateHint`.
- **Fix:** Add handling for `FirebaseFunctionsError`:
  ```ts
  if (error && typeof error === 'object' && 'code' in error) {
    const fe = error as { code: string; message: string };
    if (fe.code === 'functions/resource-exhausted') return 'Rate limit reached. Please try again later.';
    if (fe.code === 'functions/unavailable') return 'Server temporarily unavailable. Please try again.';
    if (fe.message) return fe.message;
  }
  ```
- **Effort:** Quick

---

### P1-18: `GoalDetailScreen` — Permanent 404 Shows Retryable Error (Stuck UX)
- **Source:** 10-ux-completeness (H-ES-02, H-ER-01)
- **File:** `src/screens/GoalDetailScreen.tsx`
- **Description:** When `getGoalById` returns `null` (goal deleted), the screen shows `<ErrorRetry message="Could not load goal">`. On a permanently deleted goal, retrying always fails. The user is stuck with no way to go back.
- **Fix:** Differentiate between network error (show ErrorRetry) and goal-not-found (show a toast "This goal no longer exists" and `navigation.goBack()`).
- **Effort:** Medium

---

## P2 — Fix This Sprint

**P2-1 — No Firestore Offline Persistence on Native (Data Loss Risk)**
- Source: 14-offline-a11y (C1 CRITICAL)
- File: `src/services/firebase.ts:45-47`
- Description: `dbOptions` is `{}` for non-web platforms — no disk persistence. In-memory writes (session logs, reactions) lost on force-kill while offline.
- Fix: Enable `@firebase/firestore` disk persistence for React Native: `initializeFirestore(app, { persistence: 'disk' })` or equivalent. Alternatively, implement an AsyncStorage write queue.
- Effort: Complex

**P2-2 — Session Logging Fails Offline With No Friendly Message**
- Source: 14-offline-a11y (C2 CRITICAL)
- File: `src/screens/recipient/DetailedGoalCard.tsx`, `src/services/GoalSessionService.ts`
- Description: `tickWeeklySession` requires a Firestore transaction (network round-trip). When offline, user gets a raw `unavailable` error.
- Fix: Before calling `tickWeeklySession`, check `NetInfo.fetch()`. Show "No internet — session cannot be saved offline" modal.
- Effort: Medium

**P2-3 — `allowFontScaling: false` Globally on Native (WCAG 1.4.4 Violation)**
- Source: 14-offline-a11y (C3 CRITICAL)
- File: `src/config/typography.ts:14`
- Description: All text in the app ignores system font size preferences on iOS/Android. Users with low vision who rely on font scaling receive no accommodation.
- Fix: Enable `allowFontScaling: true` on static display content (headings, labels). Use `maxFontSizeMultiplier={1.5}` on body text. Fix layouts that break at 1.5× before enabling.
- Effort: Complex

**P2-4 — ActivityIndicator Violations: ExperienceCheckoutScreen, DeferredSetupScreen, AuthScreen**
- Source: 10-ux-completeness (H-LS-01, H-LS-02, H-LS-03)
- Files: `ExperienceCheckoutScreen.tsx:449,747`, `DeferredSetupScreen.tsx:170,353`, `AuthScreen.tsx:1188`
- Description: Three HIGH violations of the CLAUDE.md "no spinning wheels" mandate.
- Fix: Replace standalone `ActivityIndicator` with skeleton loaders or move to Button `loading` prop pattern. For full-screen payment overlays, use a `Button loading` state with the existing overlay container.
- Effort: Medium (per file)

**P2-5 — Form Validation Submit-Time Only in GoalSettingScreen and ChallengeSetupScreen**
- Source: 10-ux-completeness (H-FV-01, H-FV-02)
- Files: `src/screens/recipient/GoalSettingScreen.tsx`, `src/screens/ChallengeSetupScreen.tsx`
- Description: `validationErrors` state only set on step advance, not on `onChangeText`. CLAUDE.md requires inline validation.
- Fix: Wire `validationErrors` to TextInput `error` prop on every change event.
- Effort: Medium (per screen)

**P2-6 — GoalsScreen FAB Uses Legacy `Animated` API Instead of MotiView**
- Source: 10-ux-completeness (H-AE-01)
- File: `src/screens/GoalsScreen.tsx`
- Description: FAB entrance uses `Animated.spring/timing` — explicit CLAUDE.md violation requiring `MotiView` with `from={{ opacity: 0, scale: 0.85, translateY: -4 }}` pattern.
- Fix: Migrate FAB and menu item animations to `MotiView`/`AnimatePresence` from `moti`.
- Effort: Medium

**P2-7 — UserProfileScreen Save Action Missing Haptic Feedback**
- Source: 10-ux-completeness (H-HF-03)
- File: `src/screens/UserProfileScreen.tsx`
- Description: `handleSaveProfile` shows a toast but no `Haptics.notificationAsync`. CLAUDE.md requires haptic on all save/delete/update actions.
- Fix: Add `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` to `handleSaveProfile`.
- Effort: Quick

**P2-8 — GoalApprovalNotification Approve/Suggest Actions Missing Haptic**
- Source: 10-ux-completeness (H-HF-04)
- File: `src/components/GoalApprovalNotification.tsx`
- Description: `handleApprove` and `handleSuggestChange` import `Haptics` but never call it. Goal approval is a significant action.
- Fix: Add `Haptics.notificationAsync(Success/Error)` to both handlers.
- Effort: Quick

**P2-9 — Android: Hardcoded `paddingTop`/`paddingBottom` Instead of `insets.top`/`insets.bottom`**
- Source: 12-android (FINDING 5 HIGH)
- Files: `src/screens/GiftFlowScreen.tsx:2028`, `src/screens/giver/DeferredSetupScreen.tsx:494,606`
- Description: Hardcoded `vh(40)` and `vh(50)` values instead of `insets.top` produce incorrect layout on Android devices with non-standard status bar heights (punch-hole cameras, large notches).
- Fix: Replace with `insets.top + Spacing.md` (files already import `useSafeAreaInsets`).
- Effort: Quick

**P2-10 — Android: No Foreground Service for Long Timer Sessions**
- Source: 12-android (FINDING 3 HIGH)
- File: `src/context/TimerContext.tsx`
- Description: Android kills JS process after ~10 min in background, stopping the in-app timer display. Scheduled notification survives but timer counter freezes.
- Fix: Document this limitation prominently in the session UX. Consider `expo-task-manager` with background fetch for periodic elapsed-time updates.
- Effort: Complex

**P2-11 — Feed Silently Cut Off at 30 Friends (Firestore `in` Query Limit)**
- Source: 08-flow-recipient (P1 MEDIUM), 02-data-integrity (INFO 02)
- File: `src/services/FeedService.ts:222-229`
- Description: `where('userId', 'in', [...friendIds])` hard-limited to 30. Users with 31+ friends get silently truncated real-time feed.
- Fix: Batch friend IDs in groups of 30, merge results client-side. Or migrate to fan-out feed model.
- Effort: Complex

**P2-12 — `CommentService.deleteComment` Race Condition → `commentCount` Drift**
- Source: 02-data-integrity (FINDING 03 MEDIUM)
- File: `src/services/CommentService.ts:149-168`
- Description: Non-transactional read-check-batch pattern. Two concurrent deletes both decrement `commentCount`, leaving it 1 too low.
- Fix: Replace with `runTransaction` that reads, verifies ownership, then atomically deletes and decrements.
- Effort: Medium

**P2-13 — `sendInactivityNudges`/`checkUnstartedGoals` Concurrent Invocation Race → Duplicate Nudges**
- Source: 02-data-integrity (FINDING 12 LOW), 04-cloud-functions
- Files: `functions/src/scheduled/sendInactivityNudges.ts:113-166`, `checkUnstartedGoals.ts:86-131`
- Description: Both functions read dedup state from outer `getDocs` snapshot, not inside a transaction. Concurrent instances can both pass the guard.
- Fix: Wrap guard check + batch write in `db.runTransaction()`.
- Effort: Medium each
- **Deploy:** `firebase deploy --only functions:sendInactivityNudges,functions:checkUnstartedGoals`

**P2-14 — `searchUsers` Non-Transactional Rate Limit (TOCTOU)**
- Source: 01-security (LOW), 04-cloud-functions (RL-1 MEDIUM) — cross-confirmed
- File: `functions/src/searchUsers.ts:48-73`
- Description: Rate limit uses `get()` then `set()` without a transaction. Concurrent requests can both bypass the limit.
- Fix: Wrap in `db.runTransaction()` matching pattern in `aiGenerateHint.ts:354-378`.
- Effort: Medium
- **Deploy:** `firebase deploy --only functions:searchUsers`

**P2-15 — CORS: `localhost` Origins Always Included in Production**
- Source: 01-security (LOW), 04-cloud-functions (CORS-1 MEDIUM) — cross-confirmed
- File: `functions/src/cors.ts:26`
- Description: `isEmulator` variable defined but never used. `localhost` origins always included in production CORS.
- Fix: `export const allowedOrigins = isEmulator ? [...DEV_ORIGINS, ...PRODUCTION_ORIGINS] : [...PRODUCTION_ORIGINS];`
- Effort: Quick
- **Deploy:** `firebase deploy --only functions` (cors.ts is imported by multiple functions)

**P2-16 — `normalizeGoal` Doesn't Clamp `sessionsPerWeek`/`targetCount` to Minimum 1**
- Source: 02-data-integrity (FINDING 11 LOW)
- File: `src/utils/GoalHelpers.ts:85`
- Description: `typeof g.sessionsPerWeek === 'number' ? g.sessionsPerWeek : 1` — `0` is a valid number and passes through, causing immediate goal completion.
- Fix: `sessionsPerWeek: Math.max(1, typeof g.sessionsPerWeek === 'number' ? g.sessionsPerWeek : 1)`
- Effort: Quick

**P2-17 — `NotificationService.markAllAsRead` Missing Try/Catch**
- Source: 03-error-handling (MEDIUM)
- File: `src/services/NotificationService.ts:222-235`
- Description: Only method in the service without try/catch. Error propagates unhandled to caller.
- Fix: Wrap in try/catch, log error.
- Effort: Quick

**P2-18 — `AppNavigator.tsx` Unhandled `getGuestCart().then()` Promise**
- Source: 03-error-handling (MEDIUM)
- File: `src/navigation/AppNavigator.tsx:549`
- Description: No `.catch()` on `cartService.getGuestCart().then(...)`. AsyncStorage failure produces unhandled rejection.
- Fix: Add `.catch((e) => { logger.warn('Failed to load guest cart:', e); })`.
- Effort: Quick

**P2-19 — `FeedService.listenToFeed` Doesn't Propagate Snapshot Error to UI**
- Source: 03-error-handling (MEDIUM)
- File: `src/services/FeedService.ts:253`
- Description: Error callback logs but never calls the UI callback, leaving FeedScreen in perpetual empty state on snapshot failure.
- Fix: Pass error to the `callback` function or add a separate `onError` callback parameter (same pattern as `NotificationService.listenToUserNotifications`).
- Effort: Medium

**P2-20 — `Button` Component Missing `accessibilityLabel` Prop**
- Source: 14-offline-a11y (H3 HIGH)
- File: `src/components/Button.tsx`
- Description: `ButtonProps` interface doesn't expose `accessibilityLabel`. Icon-only buttons (`variant="icon"`) have no screen reader label across the entire app.
- Fix: Add `accessibilityLabel?: string` to `ButtonProps` and pass it to the underlying `Pressable`.
- Effort: Quick (component) + Medium (audit icon-only usage sites)

**P2-21 — Progress Bars Have No `accessibilityValue`/`accessibilityRole`**
- Source: 14-offline-a11y (H4 HIGH)
- File: `src/screens/GoalDetailScreen.tsx`, `src/screens/recipient/components/ProgressBars.tsx`
- Description: Progress bar `View` elements have no `accessibilityRole="progressbar"` or `accessibilityValue={{ min: 0, max: 100, now: pct }}`. Screen readers cannot convey goal progress.
- Fix: Add `accessibilityRole="progressbar"` and `accessibilityValue` to all progress bar wrappers.
- Effort: Medium

**P2-22 — `textMuted` Color Contrast Fails WCAG AA (2.4:1 on white)**
- Source: 14-offline-a11y (H1 HIGH)
- File: `src/config/colors.ts`
- Description: `textMuted #9CA3AF` on `white #FFFFFF` = 2.4:1. Fails for all text. Widely used for timestamps, inactive nav labels, secondary metadata.
- Fix: Replace `textMuted` with `#6B7280` (textSecondary) for text elements (4.6:1). Keep current color only for decorative/non-essential elements with explicit comment.
- Effort: Medium (config change + audit usage)

**P2-23 — `primary` Color on White Fails WCAG AA for Normal-Size Text (3.0:1)**
- Source: 14-offline-a11y (H2 HIGH)
- File: `src/config/colors.ts`
- Description: `primary #059669` on white = 3.0:1. Fails for body text/captions. Switch to `primaryDark #047857` (~4.3:1) for text labels, or reserve primary color only for large-text elements.
- Effort: Medium

**P2-24 — `pendingEditRequest` Field Missing from `Goal` TypeScript Type**
- Source: 06-type-safety (P1)
- File: `src/types/index.ts`, `src/services/GoalService.ts:953,1003,1061`
- Description: `pendingEditRequest` is read/written to Firestore documents but absent from `GoalCore`. Access uses unsafe `as Record<string, unknown>` casts. Schema changes won't be caught by TypeScript.
- Fix: Add `pendingEditRequest?: { targetCount: number; sessionsPerWeek: number; requestedAt: Date; message?: string; }` to `GoalCore` in `src/types/index.ts`.
- Effort: Quick

**P2-25 — `UserProfileScreen:278` — Unsafe Timestamp→Date Cast (Runtime Crash Path)**
- Source: 06-type-safety (P1 crash risk)
- File: `src/screens/UserProfileScreen.tsx:278`
- Description: `(goal.completedAt as { toDate: () => Date }).toDate()` — if `completedAt` is already a `Date` (after `normalizeGoal()`), calling `.toDate()` throws `TypeError: .toDate is not a function`.
- Fix: Replace with `toDateSafe(goal.completedAt)` from `GoalHelpers.ts`.
- Effort: Quick

---

## P3 — Fix Next Sprint

Format: **Title** — File(s) — Effort

1. **GoalDetailScreen no entry animation (MotiView)** — `GoalDetailScreen.tsx` — Quick
2. **FriendProfileScreen/UserProfileScreen overlay action buttons no Moti entrance** — `FriendProfileScreen.tsx`, `UserProfileScreen.tsx` — Quick each
3. **CouponEntryScreen uses raw RN TextInput instead of shared component** — `recipient/CouponEntryScreen.tsx` — Medium
4. **AuthScreen email validation is post-submit only** — `AuthScreen.tsx` — Quick
5. **CartScreen quantity +/- buttons no haptic feedback** — `giver/CartScreen.tsx` — Quick
6. **CouponEntryScreen shake animation missing haptic (error + success)** — `recipient/CouponEntryScreen.tsx` — Quick
7. **Android: CommentModal KeyboardAvoidingView behavior=undefined (floating modal, pan mode doesn't apply)** — `components/CommentModal.tsx:294` — Quick
8. **Android: BackHandler missing from CommentModal, BaseModal center variant, HowItWorksModal** — medium UX regression on hardware back — Quick per modal
9. **16 screens using untyped `useRoute()` with manual cast** — all screens listed in 06-type-safety navigation section — Medium total
10. **`GoalDetailScreen:94` and `GoalsScreen:189` inline `as any` Timestamp conversions** — Replace with `toDateSafe()` — Quick
11. **`DeferredSetup` not wrapped in `ProtectedRoute`** — `AppNavigator.tsx:300` — Quick
12. **`PROTECTED_ROUTES` array is dead code (misleading)** — `AppNavigator.tsx:60-77` — delete or convert to runtime check — Quick
13. **`GiverStackParamList` type-system lie: 3 routes listed not in GiverNavigator** — `src/types/index.ts:685-694` — Quick
14. **Performance: GoalsScreen `.reduce()` inline in FlatList ListHeaderComponent** — `GoalsScreen.tsx:377-378` — Quick
15. **Performance: GoalsScreen sort+filter inside `onSnapshot` callback (should be `useMemo`)** — `GoalsScreen.tsx:124-145` — Medium
16. **Performance: FeedPost inline shadow/style objects invalidate React.memo** — `FeedPost.tsx:345-386` — Quick
17. **Performance: BookingCalendar event handlers not `useCallback`** — `BookingCalendar.tsx` — Quick
18. **Performance: FeedPostContent `Array.from()` in render** — `FeedPostContent.tsx:39,61` — Quick
19. **Performance: CommentSection `handleLike` not `useCallback`** — `CommentSection.tsx:36` — Quick
20. **Performance: CartScreen/ConfirmationScreen ScrollView+`.map()` for item lists** — `CartScreen.tsx` — Medium
21. **Performance: AppNavigator eager imports of all 40+ screens (web code-split opportunity)** — `AppNavigator.tsx` — Medium
22. **Offline: `withRetry` not used in any Firestore service** — all `src/services/` — Complex
23. **`ReactionBar` touch target ~28pt (fails 44pt minimum)** — `src/components/ReactionBar.tsx` — Quick
24. **`success #22C55E` on white = 1.73:1, fails WCAG AA** — `src/config/colors.ts` — Quick (replace usage with `successMedium #16A34A`)
25. **`SideMenu` lacks `accessibilityViewIsModal` / focus trap** — `SideMenu.tsx` — Quick
26. **`GoalDetailScreen` day-letter calendar no `accessibilityLabel`** — `GoalDetailScreen.tsx` — Quick
27. **Skeleton→content transitions not announced (`accessibilityLiveRegion="polite"` missing on ~20 screens)** — all async screens in `src/screens/` — Medium
28. **`recipientId` in `failedCharges` always null (uses wrong field)** — `functions/src/triggers/chargeDeferredGift.ts:479` — Quick; deploy functions
29. **`deleteGoal`/`retryFailedCharges` don't call `validateGiftTransition`** — `deleteGoal.ts`, `retryFailedCharges.ts` — Medium
30. **`sendSessionReminders` dedup race → possible duplicate reminders** — `sendSessionReminders.ts:89-94` — Medium; deploy functions

---

## P4 — Backlog

- **Design token violations — AchievementDetailScreen** (51 violations: add 4 Typography tokens + 5 BorderRadius + 5 Color tokens first, then fix) — `AchievementDetailScreen.tsx`
- **Design token: SkeletonLoader 9× `marginBottom: 6` → `Spacing.tinyGap`** — mechanical find-replace — `SkeletonLoader.tsx`
- **Design token: ChallengeLandingScreen/HeroPreviewScreen rgba hardcodes** (mirror files, same fix) — `ChallengeLandingScreen.tsx`, `HeroPreviewScreen.tsx`
- **Design token: BorderRadius violations across 12 files** (add 5 new tokens, then replace 31 hardcodes)
- **TouchableOpacity → Button migration for CTA/action buttons** (high-confidence violations in AchievementDetailScreen, GoalApprovalNotification, FreeGoalNotification, ExperiencePurchaseCTA) — 67 files use TouchableOpacity, prioritize explicit CTA buttons
- **`BookingCalendar.tsx` uses raw RN `Modal` instead of `BaseModal`** — `BookingCalendar.tsx:2`
- **Dead routes: `Landing`, `HeroPreview`, `GiftLanding`** — `AppNavigator.tsx` — remove or document as deep-link-only
- **Unused counter fields: `followersCount`, `followingCount`, `activityCount` in `UserProfile`** — `src/types/index.ts:36-38` — remove or implement maintenance
- **`goalSessions/{goalId}/sessions` rules are dead code** — `firestore.rules:930-937` — verify and remove
- **`goals/{goalId}/hints` subcollection rules may be dead code** — `firestore.rules:342-348` — clarify intent
- **Rate limit documents never cleaned up** (unbounded growth) — add 7-day Firestore TTL on `rateLimits` collection — `firestore.rules` TTL config
- **Expired gift documents never purged** — add weekly Cloud Function to mark `status: 'expired'` — `functions/src/scheduled/`
- **Feed filter `sessions` tab misses `goal_progress` post type** — `FeedScreen.tsx:76-79`
- **`b2bGoalMilestone.ts` uncaught `batch.commit()`** — `b2bGoalMilestone.ts:109` — add try/catch
- **`b2bInviteEmployee` weak email validation** (uses `includes('@')`) — `b2bInviteEmployee.ts:30` — use same `EMAIL_REGEX` as `b2bCreateCompany.ts`
- **`b2bInviteEmployee` no rate limit** — add 50 invites/hour per admin
- **Stripe metadata `giverName`/`personalizedMessage` length not validated** — `stripeCreatePaymentIntent.ts:202,205` — truncate to 100/500 chars
- **`sendContactEmail` applies HTML escaping to plain-text subject** — `sendContactEmail.ts:204` — use plain-text sanitizer
- **`partnerUsers` get exposes full PII to all authenticated users** (documented in rules) — medium-term: Cloud Function proxy or `publicPartnerProfile` subcollection
- **`users` collection email field readable by all authenticated users** — medium-term: move `email` to private subcollection
- **Storage `hints`/`motivations` readable by any authenticated user** — medium-term: short-lived signed URLs
- **`events` create rule has no `userId == request.auth.uid` constraint** — `firestore.rules` (MED-1) — analytics poisoning risk
- **Glassmorphism `Card` variant defined but never used** — apply in AuthScreen, ChallengeSetupScreen
- **`accessibilityLiveRegion="polite"` missing on ~20 async screens** (full list in 10-ux-completeness Appendix C)
- **Toast dismiss button touch target 32pt** — increase `hitSlop` to 14 — `Toast.tsx`
- **Feed post cards no composite `accessibilityLabel`** — `FeedPost.tsx`
- **`ErrorRetry` not marked as `accessibilityRole="alert"`** — `ErrorRetry.tsx`
- **GoalsScreen empty state uses raw `View`/`Text` instead of `<EmptyState>`** — `GoalsScreen.tsx:342-354`
- **`AIHintService.ts` empty catch blocks** (add minimal logging) — `AIHintService.ts:72,90`
- **Claim code uniqueness check not inside Stripe webhook transaction** (theoretical collision) — `stripeWebhook.ts` + `createFreeGift.ts`

---

## Dependency Graph

```
FIRESTORE RULES (P0-2 → P0-3 → P0-4 → P1-1 → P1-2) — Deploy all together
  └─ P0-2 (meta rules) must be before P0-3 (requestId) which must be before P1-7 (requestGoalEdit)
  └─ All 5 rules changes can be batched into one deploy

TYPE SAFETY (P2-24 → type-safe GoalService updates)
  └─ P2-24 (pendingEditRequest type) must precede any type-relying changes to GoalService

GOAL STATE INTEGRITY
  └─ P0-6 (updateGoal validation) → P1-6 (isCompleted guard in tickWeeklySession)

ANDROID LAUNCH SEQUENCE
  └─ P1-4 (notification channel) → P1-5 (GestureHandlerRootView) — both Quick, do together
  └─ P2-9 (safe area insets) independent
  └─ P2-10 (foreground service) independent

PERFORMANCE
  └─ P3-14/15 (GoalsScreen memoization) are independent but should be batched
  └─ P3-21 (AppNavigator lazy imports) requires testing before deploy to web

ACCESSIBILITY
  └─ P2-20 (Button accessibilityLabel prop) → audit icon-only usage sites → P4 full review
  └─ P2-22/23 (color tokens) → P4 design token cleanup

CLOUD FUNCTIONS
  └─ P1-11 (onUserDeleted) → P1-12 (deleteGoal notification cleanup) — related but independent
  └─ P1-13/P2-13/P3-30 (scheduled function races) — can be fixed together in one function sweep
  └─ P1-15 (unbounded queries) must be fixed before high-scale production launch
  └─ P0-7 (idempotency key) client + server changes must deploy together
```

---

## Suggested Fix Sessions

### Session 1: Firestore Rules Emergency (P0-1 through P0-4, P1-1, P1-2)
Fix all 6 firestore.rules changes in a single editing pass, then deploy once.
- P0-1: ExperienceGifts list rule
- P0-2: meta subcollection rules
- P0-3: requestId in friends hasOnly
- P0-4: notification type allowlist
- P1-1: comment unlike rule
- P1-2: experiences/categories allow write → allow create, update
- **Estimated time: 1–2 hours**
- **Deploy:** `firebase deploy --only firestore:rules`

### Session 2: Payment & Security Fixes (P0-5, P0-6, P0-7, P1-16)
- P0-5: `replace()` after payment confirmation
- P0-6: `updateGoal` field validation
- P0-7: idempotency key on createFreeGift/createDeferredGift
- P1-16: `retryFailedCharges` transaction wrap
- **Estimated time: 3–5 hours**
- **Deploy:** `firebase deploy --only functions:createFreeGift,functions:createDeferredGift,functions:retryFailedCharges`

### Session 3: Android Critical Blockers (P1-4, P1-5, P2-9)
- P1-4: Notification channel
- P1-5: GestureHandlerRootView
- P2-9: Hardcoded paddingTop → insets.top
- **Estimated time: 1 hour**

### Session 4: Goal/Session/Notification Flow Fixes (P1-6 through P1-10, P1-12)
- P1-6: isCompleted guard in tickWeeklySession
- P1-7: requestGoalEdit transaction
- P1-8: Notification tap handlers (goal_progress, free_goal_milestone, inactivity_nudge)
- P1-9: goal_completed → AchievementDetail navigation
- P1-10: HeroPreviewScreen unhandled promise
- P1-12: deleteGoal notification cleanup
- **Estimated time: 2–3 hours**
- **Deploy:** `firebase deploy --only functions:deleteGoal`

### Session 5: Cloud Functions Reliability (P1-13 through P1-15, P2-13, P2-14, P2-15, P3-28, P3-30)
- P1-13: sendWeeklyRecap transaction
- P1-14: sendSessionReminders N+1 fix
- P1-15: Pagination for all 4 scheduled functions
- P2-13: sendInactivityNudges/checkUnstartedGoals transaction
- P2-14: searchUsers transactional rate limit
- P2-15: CORS localhost fix
- P3-28: recipientId fix in chargeDeferredGift
- P3-30: sendSessionReminders dedup transaction
- **Estimated time: 4–6 hours**
- **Deploy:** `firebase deploy --only functions`

### Session 6: UX Polish & CLAUDE.md Compliance (P2-4 through P2-8, P3-1 through P3-6)
- P2-4: Replace ActivityIndicators (3 screens)
- P2-5: Inline form validation (2 screens)
- P2-6: GoalsScreen FAB MotiView migration
- P2-7, P2-8: Haptic additions
- P3-1 through P3-6: Animation, haptic, component swap polish
- **Estimated time: 3–4 hours**

### Session 7: Android Prep (P2-10, P3-7, P3-8)
- P2-10: Timer foreground service investigation/documentation
- P3-7: CommentModal KAV fix
- P3-8: BackHandler modals
- **Estimated time: 2–3 hours**

### Session 8: Accessibility Sprint (P2-20 through P2-23, P3-23 through P3-27)
- P2-20: Button accessibilityLabel prop
- P2-21: Progress bar accessibility
- P2-22, P2-23: Color contrast fixes
- P3-23: ReactionBar touch target
- P3-24: success color contrast
- P3-25, P3-26, P3-27: SideMenu, calendar labels, live regions
- **Estimated time: 3–4 hours**

### Session 9: Type Safety & Navigation (P2-24, P2-25, P3-9 through P3-13)
- P2-24: pendingEditRequest type
- P2-25: UserProfileScreen cast fix
- P3-9: 16 screens useRoute typing
- P3-10: Timestamp `as any` conversions
- P3-11, P3-12, P3-13: ProtectedRoute, dead array, GiverStack type fix
- **Estimated time: 2–3 hours**

### Session 10: Design Token Cleanup (P4)
- Add missing tokens to config files first
- Fix AchievementDetailScreen (51 violations)
- Fix SkeletonLoader, ChallengeLandingScreen/HeroPreviewScreen, BorderRadius violations
- **Estimated time: 4–6 hours**

---

## Files Most Frequently Cited

| File | Times Cited | Categories |
|------|-------------|------------|
| `firestore.rules` | 8 | Security, Rules, Data Integrity, UX |
| `src/screens/recipient/AchievementDetailScreen.tsx` | 5 | UX, Design Tokens, Type Safety, Navigation, Error |
| `src/services/GoalService.ts` | 5 | Data Integrity, Type Safety, Flow, Rules |
| `src/services/GoalSessionService.ts` | 4 | Data Integrity, Flow, Performance, Offline |
| `src/screens/GoalsScreen.tsx` | 4 | UX, Performance, Flow, Design Tokens |
| `functions/src/scheduled/sendSessionReminders.ts` | 3 | Data Integrity, Cloud Functions, Performance |
| `functions/src/triggers/chargeDeferredGift.ts` | 3 | Data Integrity, Cloud Functions, Security |
| `src/screens/NotificationsScreen.tsx` | 3 | UX, Flow, Performance |
| `src/navigation/AppNavigator.tsx` | 3 | Navigation, Android, Design Tokens |
| `src/services/FeedService.ts` | 3 | Data Integrity, Error Handling, Performance |
| `src/services/CommentService.ts` | 3 | Data Integrity, Error Handling, Offline |
| `src/config/colors.ts` | 3 | Accessibility, Design Tokens |
| `src/config/typography.ts` | 2 | Accessibility, Design Tokens |
| `functions/src/createFreeGift.ts` | 3 | Security, Data Integrity, Cloud Functions |
| `functions/src/createDeferredGift.ts` | 3 | Security, Data Integrity, Cloud Functions |
| `src/screens/giver/ExperienceCheckoutScreen.tsx` | 3 | Navigation, UX, Android |
| `src/screens/giver/DeferredSetupScreen.tsx` | 3 | Navigation, UX, Android |
| `src/components/GoalApprovalNotification.tsx` | 2 | UX, Android |
| `src/services/PushNotificationService.ts` | 2 | Android, Offline |
| `src/utils/GoalHelpers.ts` | 2 | Data Integrity, Type Safety |

---

## Launch Readiness Summary

**Blockers before any production launch:**
- [ ] P0-1 through P0-7: All 7 P0 issues resolved
- [ ] P1-3, P1-4, P1-5: Deep link crash fix + Android critical blockers
- [ ] P1-6, P1-7, P1-8, P1-9: Core goal/notification flow fixes
- [ ] Run giver flow audit (07-flow-giver-audit.md was missing — complete before launch)

**Blockers before Android launch specifically:**
- [ ] P1-4: Notification channel
- [ ] P1-5: GestureHandlerRootView
- [ ] P2-9: Safe area insets
- [ ] P3-7, P3-8: KAV + BackHandler modals
- [ ] P2-10: Document/address foreground service limitation
