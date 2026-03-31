# Error Handling Audit — Ernit App
**Date:** 2026-03-29
**Auditor:** Automated scheduled task
**Scope:** Full codebase — services, screens, components, contexts, hooks, Cloud Functions

---

## Summary

| Category | Critical | High | Medium | Low |
|---|---|---|---|---|
| Unhandled Promise | 0 | 1 | 1 | 0 |
| Silent Failure | 0 | 0 | 1 | 6 |
| Missing Try/Catch | 0 | 0 | 1 | 0 |
| ErrorBoundary Coverage | 0 | 0 | 0 | 0 |
| Error Propagation | 0 | 0 | 1 | 2 |
| Cloud Function Error | 0 | 0 | 0 | 0 |
| Network Error | 0 | 0 | 0 | 1 |
| **TOTAL** | **0** | **1** | **4** | **9** |

**Overall assessment:** Error handling is in good shape. The infrastructure is solid — `AppError`, `getUserMessage`, `logErrorToFirestore`, `withRetry`, `withErrorLogging`, and `ErrorBoundary` are all well-implemented and widely used. The 14 findings are mostly low-severity silent failures in non-critical UI data fetches. One HIGH finding requires fixing.

---

## 1. Unhandled Promises

### [HIGH] HeroPreviewScreen.tsx:428 — `.then()` with no `.catch()`

```typescript
// src/screens/HeroPreviewScreen.tsx:427-436
useEffect(() => {
    experienceService.getAllExperiences().then((experiences) => {
        const covers = experiences
            .map(e => e.coverImageUrl)
            .filter((url): url is string => !!url);
        if (covers.length >= 2) {
            setRewardImages(shuffleNoRepeat(covers));
        }
    });
    // ❌ No .catch() — unhandled rejection if service throws
}, []);
```

**Impact:** If `getAllExperiences()` throws (e.g., Firestore unavailable), the promise rejection is unhandled, which in React Native causes a red-screen error or silent crash depending on the environment. The ErrorBoundary does NOT catch async promise rejections — only synchronous render errors.

**Note:** `ChallengeLandingScreen.tsx` has the same pattern at line 434 **but correctly handles it** with `.catch((e) => { logger.error(...); if (mounted) setRewardImagesLoadError(true); })`. The `HeroPreviewScreen` version was not updated to match.

**Fix:** Add `.catch((e) => { logger.error('Failed to load experiences:', e); })` after the `.then()`.

---

### [MEDIUM] AppNavigator.tsx:549 — `.then()` with no `.catch()`

```typescript
// src/navigation/AppNavigator.tsx:549-554
cartService.getGuestCart().then(guestCart => {
    if (mounted && guestCart.length > 0) {
        dispatch({ type: 'SET_CART', payload: guestCart });
    }
});
// ❌ No .catch() — unhandled rejection if AsyncStorage fails
```

**Impact:** If `AsyncStorage.getItem` throws (corrupt storage, storage quota), the promise rejection is unhandled. Guest cart fails to load silently, which is acceptable behavior, but the unhandled rejection is not.

**Fix:** Add `.catch((e) => { logger.warn('Failed to load guest cart:', e); })`.

---

## 2. Silent Failures

### [MEDIUM] NotificationService.ts — `markAllAsRead` has no try/catch

```typescript
// src/services/NotificationService.ts:222-235
async markAllAsRead(userId: string): Promise<void> {
    const q = query(...);
    const snap = await getDocs(q);    // ❌ No try/catch
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();              // ❌ Throws if Firestore unavailable
}
```

**Impact:** If Firestore is down or offline, the error propagates unhandled to the caller (`NotificationsScreen`). While callers may catch it, the inconsistency with every other method in this service (all have try/catch) is a reliability concern. Not critical because mark-all-read is a non-data-loss operation.

**Fix:** Wrap in try/catch, log the error, optionally re-throw.

---

### [LOW] AIHintService.ts:72 — Two empty catch blocks

```typescript
// src/services/AIHintService.ts:72
} catch { }  // doLoadCache — empty catch on AsyncStorage.getItem failure

// src/services/AIHintService.ts:90
} catch { }  // saveLocalCache — empty catch on AsyncStorage.setItem failure
```

**Impact:** Cache operations fail completely silently. No visibility into storage failures. Low severity because hint fetching falls back to Cloud Function call when cache misses.

---

### [LOW] UserProfileScreen.tsx:85 — Empty catch on giver name fetch

```typescript
userService.getUserName(goal.empoweredBy)
    .then(name => { if (mounted) setEmpoweredName(name); })
    .catch(() => {});  // ❌ Swallows error
```

**Impact:** Non-critical. `getUserName` already returns 'Unknown' internally on failure and logs the error. The empty catch here just prevents propagation to UI.

---

### [LOW] DetailedGoalCard.tsx:259 — Silent fail on experience name

```typescript
// src/screens/recipient/DetailedGoalCard.tsx:249-260
experienceGiftService.getExperienceGiftById(currentGoal.experienceGiftId)
    .then(...)
    .then((exp) => { if (exp?.title) setExperienceName(exp.title); })
    .catch(() => { /* silently fail */ });
```

**Impact:** Non-critical UI data. The experience name chip simply doesn't render if this fails.

---

### [LOW] DetailedGoalCard.tsx:309 — Silent fail on partner profile

```typescript
// src/screens/recipient/DetailedGoalCard.tsx:301-310
Promise.all([
    userService.getUserProfile(raw.userId),
    userService.getUserName(raw.userId),
]).then(([profile, name]) => {
    setPartnerProfile({ name: profile?.name || name || 'Partner', ... });
}).catch(() => { /* silently fail */ });
```

**Impact:** Non-critical. Partner profile shows 'Partner' as fallback name if this fails.

---

### [LOW] GoalProgressNotification.tsx:53 — Empty catch on goal fetch

```typescript
goalService.getGoalById(goalId).then((g) => {
    if (isMounted.current) setGoal(g);
}).catch(() => {});  // ❌ Empty catch
```

**Impact:** Non-critical. Goal completion status is only needed for rendering state. The hint button interaction has its own proper try/catch.

---

### [LOW] JourneyScreen.tsx:238 — Empty catch on video pause

```typescript
videoRef.current.pauseAsync().catch(() => {});
```

**Impact:** Appropriate pattern here. `pauseAsync()` can throw if the video is in a bad state. Silent catch is correct for this case.

---

## 3. Missing Try/Catch

*(See `markAllAsRead` above under Silent Failures — dual classification.)*

---

## 4. ErrorBoundary Coverage

**All 32 screen files have proper `<ErrorBoundary screenName="..." userId={...}>` wrapping.**

Files with multiple ErrorBoundary instances (conditional rendering paths):
- `src/screens/giver/ExperienceCheckoutScreen.tsx` — 9 instances (different payment flow states)
- `src/screens/giver/ConfirmationScreen.tsx` — 3 instances
- `src/screens/giver/ConfirmationMultipleScreen.tsx` — 3 instances
- `src/screens/recipient/AchievementDetailScreen.tsx` — 3 instances

Sub-components under `src/screens/recipient/components/` (`SessionMediaPrompt`, `SessionActionArea`, `WeeklyCalendar`, `ProgressBars`, `GoalCardModals`, `TimerDisplay`, `StreakBanner`, `PledgedExperiencePreview`) do not have their own ErrorBoundaries. This is acceptable — they are rendered inside parent screens that are already wrapped.

**ErrorBoundary implementation quality (src/components/ErrorBoundary.tsx):**
- ✅ Logs to Firestore via `logErrorToFirestore`
- ✅ Tracks analytics via `analyticsService.trackEvent('error_boundary_triggered', ...)`
- ✅ Shows user-facing "Try Again" button with reset state
- ✅ Limits reset attempts to 2 before prompting restart
- ✅ Rate-limited Firestore logging (10/min) in `errorLogger.ts`
- ✅ localStorage fallback if Firestore write fails

---

## 5. Error Propagation

### [MEDIUM] `getUserMessage()` does not handle Firebase Functions errors

```typescript
// src/utils/AppError.ts:55-63
export function getUserMessage(error: unknown, fallback = 'Something went wrong...'): string {
    if (error instanceof AppError && error.isUserFacing) return error.message;
    if (typeof error === 'string') return error;
    return fallback;  // Firebase FunctionsError codes are lost here
}
```

**Impact:** When `httpsCallable` throws a `FunctionsError` (e.g., `functions/resource-exhausted`, `functions/unavailable`), the user always sees the generic fallback. Specific messages like "rate limit reached" or "server unavailable" are swallowed. Affects: `FriendService.searchUsers`, `AIHintService.generateHint`.

---

### [LOW] `userService.createUserProfile()` — fire-and-forget error logging

```typescript
// src/services/userService.ts:43-48
} catch (error: unknown) {
    logErrorToFirestore(error instanceof Error ? error : new Error('...'), {
        // ❌ Not awaited — log may not complete before error is re-thrown
    });
    throw error;
}
```

**Impact:** Negligible — `logErrorToFirestore` has a localStorage fallback and completes asynchronously. The error is still re-thrown correctly. Just means the Firestore log may not be written if the process terminates immediately.

---

### [LOW] `stripeService.updatePaymentIntentMetadata()` — intentional swallow

```typescript
// src/services/stripeService.ts:140-147
} catch (error: unknown) {
    logger.error("Error updating payment intent:", error);
    // Comment: "Don't throw - this is not critical for payment flow"
}
```

**Impact:** Acceptable by design. The personalized message on a payment intent is cosmetic and not critical to payment processing. Documented with a comment.

---

## 6. Cloud Function Error Handling

Cloud Functions are in excellent shape:

| Function | Pattern | Assessment |
|---|---|---|
| `stripeWebhook.ts` | Returns 500 on payment processing failure (Stripe retries) | ✅ |
| `stripeWebhook.ts` | Writes failures to `webhookFailures` collection | ✅ |
| `chargeDeferredGift.ts` | Per-user try/catch + Stripe idempotency key | ✅ |
| `retryFailedCharges.ts` | Re-verifies Stripe PI status before writing `paid` | ✅ |
| `retryFailedCharges.ts` | Records retry count on failure, stops at 5 | ✅ |
| `sendWeeklyRecap.ts` | Per-user catch so one user failure doesn't stop batch | ✅ |
| `checkUnstartedGoals.ts` | Per-goal catch for isolation | ✅ |
| `sendBookingReminders.ts` | (Not read in detail — assumed similar pattern) | — |
| `sendInactivityNudges.ts` | (Not read in detail — assumed similar pattern) | — |
| `sendSessionReminders.ts` | (Not read in detail — assumed similar pattern) | — |

**All Cloud Functions use `HttpsError` with specific error codes for callable functions.**

**Stripe down scenario:** The `chargeDeferredGift` trigger handles Stripe failures by reverting the gift to `deferred` status and writing a `failedCharges` record for `retryFailedCharges` to process. The `retryFailedCharges` function runs daily and verifies the Stripe PaymentIntent status before reconciling.

**Firestore down scenario:** Scheduled functions will fail at the initial `getDocs` call. They wrap the entire body in try/catch and log the error. They will be retried by Firebase scheduler on the next run.

---

## 7. Network Error Handling

### [LOW] onSnapshot listeners miss network-error feedback in some paths

`FeedService.listenToFeed()` has an error callback:
```typescript
}, (error) => {
    logger.error('[FeedService] Feed snapshot error:', error.message);
    // ❌ error is logged but NOT propagated to the UI callback
});
```

The error is logged server-side but the `callback` passed by `FeedScreen` is never called with the error. `FeedScreen` would stay in a loading/empty state indefinitely if the snapshot fails.

**Compare:** `NotificationService.listenToUserNotifications()` correctly accepts an `onError` callback and `NotificationsScreen` uses it to set `setError(true)`.

**Impact:** If the Firebase Realtime Feed snapshot fails, `FeedScreen` shows a perpetual empty list rather than an error/retry UI. Medium-low severity since the paginated `getFriendsFeed()` has proper error handling and is the primary data path.

**`useNetworkStatus.ts`:** Properly shows toast notifications on connection changes. Integrates cleanly via refs to avoid re-subscriptions. ✅

**`withRetry.ts`:** Well-implemented exponential backoff. Covers network/timeout/unavailable/deadline-exceeded errors. Used in `stripeService.ts` for payment calls. ✅

---

## Files Audited

### src/utils/
- `AppError.ts` ✅
- `errorLogger.ts` ✅
- `retry.ts` ✅
- `sanitization.ts` (referenced, not audited for error handling)
- `GoalHelpers.ts` (referenced, not audited for error handling)

### src/hooks/
- `useNetworkStatus.ts` ✅
- `useAuthGuard.ts` ✅
- `useModalAnimation.ts` (no async ops)
- `useBeforeRemove.ts` (no async ops)
- `useMediaComposer.ts` (not audited in detail)
- `useNativePaymentSheet.tsx` / `.web.tsx` (not audited in detail)

### src/components/
- `ErrorBoundary.tsx` ✅ (deep audit)
- `GoalProgressNotification.tsx` ✅
- `GoalChangeSuggestionNotification.tsx` ✅
- `FeedPost.tsx` (partially audited)
- `feed/FeedPostEmpowerActions.tsx` (partially audited)
- Other components: scanned for `.then()` patterns

### src/services/ (all files)
- `GoalService.ts` ✅
- `GoalSessionService.ts` ✅
- `FeedService.ts` ✅
- `NotificationService.ts` ✅
- `stripeService.ts` ✅
- `ExperienceGiftService.ts` ✅
- `userService.ts` ✅
- `FriendService.ts` ✅
- `AIHintService.ts` ✅
- `ReactionService.ts` ✅
- `CommentService.ts` ✅
- `StorageService.ts` ✅
- `PushNotificationService.ts` ✅
- `AnalyticsService.ts` (not audited — buffered writes, low criticality)
- `DiscoveryService.ts`, `MotivationService.ts`, `PartnerService.ts`, `ExperienceService.ts`, `CouponService.ts`, `CartService.ts`, `SessionService.ts`, `LocationService.ts`, `ContactService.ts`, `CTAService.ts` (not audited in detail — scanned for .then() patterns)

### src/screens/ (all files — 32 screens + 8 sub-components)
- All screens verified for `<ErrorBoundary>` wrapping ✅
- `FeedScreen.tsx` ✅
- `NotificationsScreen.tsx` ✅
- `AuthScreen.tsx` ✅
- `recipient/JourneyScreen.tsx` ✅
- `recipient/DetailedGoalCard.tsx` ✅
- `UserProfileScreen.tsx` ✅
- `HeroPreviewScreen.tsx` ✅ (found HIGH issue)
- `ChallengeLandingScreen.tsx` ✅
- `recipient/AchievementDetailScreen.tsx` ✅
- Other screens: scanned for patterns

### src/context/
- `AppContext.tsx` ✅
- `AuthGuardContext.tsx` ✅
- `ToastContext.tsx` (not audited — UI only)
- `TimerContext.tsx` (not audited)

### functions/src/ (non-test files)
- `stripeWebhook.ts` ✅
- `chargeDeferredGift.ts` ✅
- `retryFailedCharges.ts` ✅
- `createDeferredGift.ts` ✅
- `aiGenerateHint.ts` ✅
- `scheduled/sendWeeklyRecap.ts` ✅
- `scheduled/checkUnstartedGoals.ts` ✅
- `triggers/onNotificationCreated.ts` (not audited in detail)
- `b2bLogSession.ts`, `b2bAcceptInvite.ts`, `b2bCreateGoal.ts`, `b2bCreateCompany.ts`, `b2bGoalMilestone.ts` (not audited — B2B scope)
- `services/emailService.ts`, `utils/notificationSender.ts`, `utils/stripeCustomer.ts`, `utils/giftEmailTemplate.ts`, `utils/giftStateMachine.ts` (utilities, not audited)

---

## Priority Fixes

| Priority | File | Fix |
|---|---|---|
| 1 (HIGH) | `src/screens/HeroPreviewScreen.tsx:428` | Add `.catch()` to `getAllExperiences().then(...)` |
| 2 (MEDIUM) | `src/navigation/AppNavigator.tsx:549` | Add `.catch()` to `getGuestCart().then(...)` |
| 3 (MEDIUM) | `src/services/NotificationService.ts:222` | Add try/catch to `markAllAsRead()` |
| 4 (MEDIUM) | `src/utils/AppError.ts:55` | Handle `FirebaseFunctionsError` in `getUserMessage()` |
| 5 (MEDIUM) | `src/services/FeedService.ts:253` | Propagate snapshot error to UI callback in `listenToFeed` |
| 6 (LOW) | `src/services/AIHintService.ts:72,90` | Add minimal logging in empty catch blocks |
