# Data Integrity Audit — Ernit App

**Date:** 2026-03-29
**Auditor:** Automated scheduled task (claude-sonnet-4-6)
**Scope:** Client services, Cloud Functions, types, AppContext

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 2     |
| MEDIUM   | 7     |
| LOW      | 5     |
| INFO     | 3     |
| **Total**| **17**|

The core financial flows (Stripe charge, deferred gift, idempotency guards) are well-protected. Transactions are used correctly in the session logging, goal creation, friend request, and reaction paths. The main gaps are in user-lifecycle cleanup, a few TOCTOU windows in non-transactional paths, and some unmaintained counter fields.

---

## Findings

---

### FINDING 01 — HIGH
**Category:** Orphaned Documents
**File:** _(no file — missing Cloud Function)_

**Description:**
There is no Cloud Function or Auth trigger that handles user account deletion. When a Firebase Auth user is deleted (via the console, Admin SDK, or account deletion flow), all their Firestore data remains permanently:
- `goals/` documents (and subcollections: sessions, hints, motivations)
- `feedPosts/` documents
- `friends/` documents (bidirectional)
- `friendRequests/` documents
- `notifications/` documents
- `experienceGifts/` where they are giverId or recipientId
- `users/` document and subcollections (meta/, etc.)

**Evidence:**
```bash
grep -r "onUserDeleted\|deleteUser\|auth.user().onDelete" functions/src/
# No matches found
```
No `functions.auth.user().onDelete` trigger exists anywhere in `functions/src/`.

**Impact:**
Orphaned data grows indefinitely. If a user ID is recycled by Firebase Auth (unlikely but possible), a new user could see old data. Partners of deleted users retain `partnerGoalId` references pointing to deleted goals. Friends of deleted users see stale entries. GDPR/data retention implications if users request account deletion.

**Suggested Fix:**
Create a `functions.auth.user().onDelete` trigger that:
1. Deletes/anonymizes `users/{uid}` and subcollections.
2. Marks `goals/{uid}` as deleted (or soft-deletes).
3. Removes bidirectional `friends` entries.
4. Cleans up `notifications` for the user.
5. Orphans `friendRequests` involving this user.

**False Positive Check:**
Confirmed no deletion trigger exists. The `deleteGoal` function only handles goal-level cleanup, not account-level.

---

### FINDING 02 — HIGH
**Category:** Missing Validation
**File:** `src/services/GoalService.ts:488-508`

**Description:**
`GoalService.updateGoal()` uses a field whitelist but allows writing sensitive state fields (`isCompleted`, `currentCount`, `sessionsPerWeek`, `targetCount`) with **no server-side value validation**. A client can call `updateGoal({ isCompleted: false })` to uncomplete a completed goal, or set `currentCount` higher than `targetCount`, or set `sessionsPerWeek: 0`.

**Evidence:**
```ts
// src/services/GoalService.ts:488
const allowedFields = [
  'weeklyCount', 'weeklyLogDates', 'isWeekCompleted', 'isCompleted',
  'currentCount', 'weekStartAt', 'hints', 'personalizedNextHint',
  ...
  'targetCount', 'sessionsPerWeek', ...
];
// No bounds check: sessionsPerWeek could be written as 0 or negative
// No guard preventing isCompleted: false (uncomplete a completed goal)
// No guard preventing currentCount > targetCount
```

The ownership check is a plain `getDoc` outside a transaction:
```ts
// src/services/GoalService.ts:480-481
const goalDoc = await getDoc(doc(db, 'goals', goalId));
if (!goalDoc.exists() || goalDoc.data()?.userId !== auth.currentUser?.uid) {
```
There is then a separate `updateDoc` call — there's a TOCTOU window where a goal could change ownership between the check and the write (in theory).

**Impact:**
- Un-completing a goal could potentially re-trigger `chargeDeferredGift` if the goal transitions `isCompleted: false → true` again in a future session, leading to a double charge (though the 'processing' guard in chargeDeferredGift would likely prevent it for deferred gifts, it's still exploitable).
- Setting `sessionsPerWeek: 0` causes `weeklyCount >= sessionsPerWeek` to always be `true`, immediately marking every week completed, advancing `currentCount` rapidly, and potentially completing the goal in the next sweep.
- Setting `currentCount >= targetCount` triggers completion on the next sweep.

**Suggested Fix:**
In `updateGoal`, validate numeric fields before writing:
```ts
if ('sessionsPerWeek' in sanitizedUpdates && (sanitizedUpdates.sessionsPerWeek < 1 || sanitizedUpdates.sessionsPerWeek > 7)) throw ...;
if ('targetCount' in sanitizedUpdates && (sanitizedUpdates.targetCount < 1 || sanitizedUpdates.targetCount > 52)) throw ...;
if ('isCompleted' in sanitizedUpdates) {
  // Only allow Cloud Function or internal service to set isCompleted
  throw new AppError('FORBIDDEN', 'isCompleted cannot be set via updateGoal', 'validation');
}
```
Consider using Firestore security rules as a backstop, or moving goal state updates to a Cloud Function.

**False Positive Check:**
Firestore security rules were not audited in this pass. If rules deny writes to `isCompleted`/`currentCount` from clients, the risk is reduced but still exists as the client SDK path (used in tests/debug) would be blocked.

---

### FINDING 03 — MEDIUM
**Category:** Race Condition
**File:** `src/services/CommentService.ts:149-168`

**Description:**
`deleteComment()` reads the comment document for an ownership check, then uses a `writeBatch` to delete it and decrement `commentCount`. The ownership check and the delete are **not inside the same transaction**. Two concurrent delete calls by the same user (double-tap, network retry) could:
1. Both read the comment (both pass ownership check).
2. Both create a batch: delete the comment + decrement count by 1.
3. Both batches commit — comment is already deleted by first batch (idempotent for comment doc), but **both batches decrement `commentCount`**, resulting in `commentCount` going to `(original - 2)` even though only one comment was deleted.

**Evidence:**
```ts
// src/services/CommentService.ts:151-162
const commentRef = doc(db, 'feedPosts', postId, 'comments', commentId);
const commentDoc = await getDoc(commentRef);                    // <-- read
if (!commentDoc.exists() || ...) { throw ... }                  // <-- check
const batch = writeBatch(db);
batch.delete(commentRef);
batch.update(postRef, { commentCount: increment(-1) });         // <-- write
await batch.commit();                                           // <-- not atomic with read
```

**Impact:**
`commentCount` can go negative or become permanently incorrect. Feed posts will show wrong comment counts, affecting UX. Repeated occurrences accumulate drift.

**Suggested Fix:**
Replace the read-check-batch pattern with a `runTransaction` that reads the comment, verifies ownership, then deletes and decrements atomically:
```ts
await runTransaction(db, async (tx) => {
  const commentSnap = await tx.get(commentRef);
  if (!commentSnap.exists()) return; // already deleted, skip decrement
  if (commentSnap.data()?.userId !== auth.currentUser?.uid) throw ...;
  tx.delete(commentRef);
  tx.update(postRef, { commentCount: increment(-1) });
});
```

**False Positive Check:**
The batch commits atomically, so partial failure isn't an issue. The race is specifically between the read and the write across concurrent calls.

---

### FINDING 04 — MEDIUM
**Category:** Race Condition
**File:** `functions/src/scheduled/sendWeeklyRecap.ts:115-179`

**Description:**
The idempotency guard for weekly recap reads `primaryGoal.lastWeeklyRecapWeek` from a Firestore snapshot fetched in the outer `getDocs` call, **before** the guard check and batch write. If two Cloud Function instances run concurrently (e.g., retry after timeout), both can read the same stale snapshot, both see `lastWeeklyRecapWeek !== weekKey`, both pass the guard, and both send the recap.

**Evidence:**
```ts
// sendWeeklyRecap.ts:115-119
if (primaryGoal?.lastWeeklyRecapWeek === weekKey) {
  continue; // guard check — but primaryGoal is from earlier getDocs, not a transaction
}
// ... builds message ...
const batch = db.batch();
batch.set(notifRef, { ... });
batch.update(primaryGoal._ref, { lastWeeklyRecapWeek: weekKey }); // stamps after check
await batch.commit();
```

**Impact:**
Users receive duplicate weekly recap notifications.

**Suggested Fix:**
Wrap the guard check and batch write in a transaction:
```ts
await db.runTransaction(async (tx) => {
  const freshGoal = await tx.get(primaryGoal._ref);
  if (freshGoal.data()?.lastWeeklyRecapWeek === weekKey) return; // already sent
  // create notification ref, stamp key
  tx.set(notifRef, { ... });
  tx.update(primaryGoal._ref, { lastWeeklyRecapWeek: weekKey });
});
```

**False Positive Check:**
Cloud Scheduler normally guarantees at-most-once delivery per trigger invocation, but retries and overlapping invocations do occur, especially near timeout boundaries.

---

### FINDING 05 — MEDIUM
**Category:** Race Condition
**File:** `functions/src/retryFailedCharges.ts:89-129`

**Description:**
`retryFailedCharges` reads the gift document outside a transaction (`giftSnap = await db.collection(...).get()`), checks that `payment !== 'processing'`, then writes `payment: 'paid'` directly. There is a time window between the status check and the update write where `chargeDeferredGift` could simultaneously also try to process the gift.

**Evidence:**
```ts
// retryFailedCharges.ts:89-128
const giftSnap = await db.collection('experienceGifts').doc(giftId).get(); // <-- read outside tx
if (giftData.payment !== 'processing') { ... delete stale doc; return; }
// ... some time passes ...
await db.collection('experienceGifts').doc(giftId).update({    // <-- write without re-check
  payment: 'paid', status: 'completed', ...
});
```

If `chargeDeferredGift` set `payment: 'processing'` between the read and the write here, `retryFailedCharges` would overwrite the `processing` state with `paid` before Stripe has actually confirmed the second charge.

**Impact:**
Low probability but could result in a gift being marked `paid` before the Stripe charge is confirmed, leading to a false-positive payment status. The gift would not be charged again (since `payment: 'paid'` means chargeDeferredGift skips it) but the gift state would be inaccurate.

**Suggested Fix:**
Use a transaction for the final write:
```ts
await db.runTransaction(async (tx) => {
  const freshGift = await tx.get(giftRef);
  if (freshGift.data()?.payment !== 'processing') throw new Error('STATE_CHANGED');
  if (freshGift.data()?.paymentIntentId !== paymentIntentId) throw new Error('PI_MISMATCH');
  tx.update(giftRef, { payment: 'paid', status: 'completed', ... });
  tx.delete(doc.ref);
});
```

**False Positive Check:**
The `retryFailedCharges` function is designed for a narrow scenario (Stripe succeeded, Firestore write failed). The window is narrow and requires simultaneous execution of both functions at the exact same time. Low probability in practice.

---

### FINDING 06 — MEDIUM
**Category:** Race Condition
**File:** `functions/src/stripeWebhook.ts:199-203` and `functions/src/createFreeGift.ts:155-156`

**Description:**
Claim codes are generated and uniqueness-checked **outside** the transaction that writes the gift document. The check queries `experienceGifts` collection for duplicates, then the code is used inside a later `runTransaction`. Between the check and the transaction commit, another concurrent payment could write the same claim code.

**Evidence:**
```ts
// stripeWebhook.ts (handleSuccessfulPayment)
const claimCodes: string[] = [];
for (let i = 0; i < totalClaimCodes; i++) {
  claimCodes.push(await generateUniqueClaimCode()); // <-- Firestore read, outside transaction
}
// ... later ...
return await db.runTransaction(async (transaction) => {
  // claimCodes already generated — no re-check inside transaction
  transaction.set(db.doc(`experienceGifts/${id}`), { claimCode, ... });
});
```

The `generateUniqueClaimCode` function does a Firestore query, but this query is not part of the transaction's read set. Two concurrent webhook calls could generate the same code.

**Impact:**
Two gifts with duplicate claim codes. Only one would be redeemable; the other would fail or cause confusion. Probability is very low (~1/3.2 quadrillion per code) but non-zero for high-volume deployments.

**Suggested Fix:**
Either: (1) include the claim code uniqueness check inside the transaction using a deterministic document ID based on the code, or (2) add a Firestore unique index on `claimCode` and catch write errors to retry with a new code.

**False Positive Check:**
The collision probability per code is 1/(36^12) ≈ 3×10⁻¹⁹. At current scale this is essentially impossible, but worth noting for production rigor.

---

### FINDING 07 — MEDIUM
**Category:** Orphaned Documents
**File:** `functions/src/deleteGoal.ts:256-303`

**Description:**
When a goal is deleted, notifications that reference the deleted `goalId` are **not cleaned up**. Types such as `goal_progress`, `session_reminder`, `free_goal_milestone`, `free_goal_completed`, `personalized_hint_left`, and `weekly_recap` all carry `data.goalId`. These remain visible in the user's notification tray and may render broken UI when tapped.

**Evidence:**
```ts
// deleteGoal.ts — subcollections cleaned
const subcollections = ['sessions', 'hints', 'motivations'];
// Feed posts soft-deleted
// MISSING: No query on notifications collection to clean up goal-referencing notifications
```

**Impact:**
Stale notifications pointing to deleted goals. If the notification taps navigate to `GoalDetailScreen`, the app may crash or show an empty state with no explanation.

**Suggested Fix:**
After the main transaction, add a cleanup step for goal-related notifications:
```ts
const notifSnap = await db.collection('notifications')
  .where('data.goalId', '==', goalId).limit(500).get();
const batch = db.batch();
notifSnap.docs.forEach(d => batch.delete(d.ref));
await batch.commit();
```

**False Positive Check:**
Some notification types (e.g., `free_goal_completed` friends notifications) are sent to *other users* and intentionally remain (they may want to see the completed event). Only notifications for the goal owner (`userId == goalData.userId`) need cleanup.

---

### FINDING 08 — MEDIUM
**Category:** Data Consistency
**File:** `src/types/index.ts:36-38`, `src/services/` (all)

**Description:**
`UserProfile` defines three counter fields — `activityCount`, `followersCount`, `followingCount` — but **no service file ever updates these fields**. A grep across all services shows zero writes to these fields. The `friends` collection is queried directly for friend lists, bypassing these counters entirely.

**Evidence:**
```bash
grep -r "followersCount\|followingCount\|activityCount" src/services/
# No matches found — only in src/types/index.ts
```

```ts
// src/types/index.ts:36-38
activityCount: number;
followersCount: number;
followingCount: number;
```

**Impact:**
If any screen or component displays `user.profile.followersCount` or similar, it will always show `0` or a stale value from profile creation. This is a data consistency problem — the declared schema doesn't match the actual write behavior.

**Suggested Fix:**
Either: (1) remove these fields from the type if they're unused, or (2) add `increment(1)` / `increment(-1)` to `FriendService.acceptFriendRequest()` and `FriendService.removeFriend()` to maintain the counters.

**False Positive Check:**
A UI search would be needed to confirm whether any screen renders these fields. If no screen uses them, this is a dormant schema mismatch rather than an active user-facing bug.

---

### FINDING 09 — LOW
**Category:** Data Consistency
**File:** `src/services/GoalSessionService.ts:325-377`

**Description:**
The session logging transaction and the streak update transaction are **two separate transactions**. If the goal transaction (marking session logged, updating weeklyCount) commits successfully but the streak transaction fails, the session is permanently logged but the streak is not updated. There is no compensation or retry for streak failures.

**Evidence:**
```ts
// GoalSessionService.ts:192 — main session transaction
const txResult = await runTransaction(db, async (transaction) => {
  // ... updates weeklyCount, isCompleted, etc. (COMMITTED)
});
// GoalSessionService.ts:335 — separate streak transaction
await runTransaction(db, async (streakTx) => {
  // ... updates sessionStreak (may FAIL silently)
});
// streak failure is catch'd and logged, not rethrown
```

**Impact:**
Streak can lag behind actual session count. Over time, if streak transactions fail repeatedly (e.g., user document contention), the displayed streak will be lower than the actual completion rate. This is non-critical but affects UX gamification accuracy.

**Suggested Fix:**
Move the streak update inside the same transaction as the session update (compute new streak values before the transaction and write them atomically). This is feasible since streak calculation only requires the user document (readable inside a transaction with `transaction.get(userRef)`).

**False Positive Check:**
Streak errors are intentionally swallowed (`try/catch` with `logger.error`). This is a documented design choice to not block session logging on streak updates. The finding stands but is low priority.

---

### FINDING 10 — LOW
**Category:** Orphaned Documents
**File:** `functions/src/createFreeGift.ts`, `functions/src/createDeferredGift.ts`, `functions/src/stripeWebhook.ts`

**Description:**
Experience gifts with `status: 'pending'` that are never redeemed (recipient never enters claim code, or email is wrong) have no automatic cleanup mechanism. They expire (`expiresAt = now + 365 days`) but there is no scheduled function to purge expired gifts or release their claim codes.

**Evidence:**
No scheduled function querying `experienceGifts` where `expiresAt < now` exists. The `retryFailedCharges` function only handles `deferred` payment gifts, not `free` pending gifts.

**Impact:**
Database accumulates stale gift records indefinitely. Claim codes are never recycled. Not a functional bug but a storage and operational concern.

**Suggested Fix:**
Add a weekly scheduled function to query `experienceGifts where status == 'pending' and expiresAt < now` and update `status: 'expired'` (or archive/delete).

**False Positive Check:**
The `expiresAt` field is set on all created gifts. The state machine correctly declares `expired` as a terminal state.

---

### FINDING 11 — LOW
**Category:** Missing Validation
**File:** `src/services/GoalSessionService.ts:79-83`, `src/utils/GoalHelpers.ts:81-85`

**Description:**
If a goal has `sessionsPerWeek: 0` or `targetCount: 0` stored in Firestore (e.g., from a client bug or direct DB write), the sweep logic immediately marks the goal completed on the first sweep cycle.

**Evidence:**
```ts
// GoalSessionService.ts:81-82
const weekWasCompleted = g.isWeekCompleted || g.weeklyCount >= g.sessionsPerWeek;
// If sessionsPerWeek=0: 0 >= 0 = true → week always completed → currentCount advances
if (g.currentCount >= g.targetCount) {
// If targetCount=0: 0 >= 0 = true → goal immediately completes
```

`normalizeGoal` defaults `sessionsPerWeek` to `1` if it's not a number, but if it's stored as `0` (a valid number), it will pass through unchanged:
```ts
// GoalHelpers.ts:85
sessionsPerWeek: typeof g.sessionsPerWeek === 'number' ? g.sessionsPerWeek : 1,
// 0 is a number, so 0 passes through
```

**Impact:**
A goal with `sessionsPerWeek=0` would complete itself on the next sweep without the user doing anything. Edge case, unlikely in practice.

**Suggested Fix:**
In `normalizeGoal`, clamp minimum values:
```ts
sessionsPerWeek: Math.max(1, typeof g.sessionsPerWeek === 'number' ? g.sessionsPerWeek : 1),
targetCount: Math.max(1, typeof g.targetCount === 'number' ? g.targetCount : 1),
```

**False Positive Check:**
Cloud Function gift creation code clamps `sessionsPerWeek` to `[1, 7]`. The risk is only from goals created via older paths or direct DB writes.

---

### FINDING 12 — LOW
**Category:** Race Condition
**File:** `functions/src/scheduled/sendInactivityNudges.ts:113-166`, `functions/src/scheduled/checkUnstartedGoals.ts:86-131`

**Description:**
Both scheduled functions read the dedup state (`lastNudgeLevel` and `sentUnstartedNotificationDays`) from the outer `getDocs` snapshot, then batch-commit with `arrayUnion`/level update. If two Cloud Function instances ran concurrently for the same goal, both could pass the dedup check and both send the notification.

**Evidence:**
```ts
// sendInactivityNudges.ts:114-115
const lastNudgeLevel = goal.lastNudgeLevel || 0;  // from outer getDocs, not inside batch
if (lastNudgeLevel >= currentLevel) { continue; }
// ... later ...
batch.update(goalDoc.ref, { lastNudgeLevel: currentLevel });  // stamps after check
await batch.commit();
```

**Impact:**
Users could receive duplicate inactivity nudges or unstarted goal reminders. Low probability since Cloud Scheduler at-most-once delivery is standard for these functions.

**Suggested Fix:**
Use a transaction to wrap the dedup check and the write (same pattern as `sendWeeklyRecap` fix above).

**False Positive Check:**
This only manifests on concurrent invocations of the same schedule, which is rare. `arrayUnion` for `sentUnstartedNotificationDays` is idempotent (won't duplicate the day entry), but the notification itself would be duplicated.

---

### FINDING 13 — LOW
**Category:** Race Condition
**File:** `functions/src/scheduled/sendSessionReminders.ts:89-94`

**Description:**
`sendSessionReminders` checks `user.lastReminderSentDate === todayInUserTz` from the outer users collection snapshot, then batch-commits with the updated date. Two concurrent instances could both pass this check and send a duplicate reminder to the same user.

**Evidence:**
```ts
// sendSessionReminders.ts:89-94
if (user.lastReminderSentDate === todayInUserTz) {
  continue; // guard from outer snapshot, not transaction
}
// ...
batch.update(db.collection("users").doc(userDoc.id), {
  lastReminderSentDate: todayInUserTz, // stamped after check
});
```

**Impact:**
Users receive two session reminders in one hour. Annoying but not data-corrupting.

**Suggested Fix:**
Use a transaction for the dedup check, or use idempotent notification document IDs (e.g., `session_reminder_{userId}_{date}`) so duplicate writes are no-ops.

**False Positive Check:**
The function runs hourly. Two concurrent instances for the same hour would require an unusual invocation overlap. Low probability.

---

## Informational Notes

### INFO 01 — Gift deferred payment Stripe failures have no automatic retry
**File:** `functions/src/triggers/chargeDeferredGift.ts:490-499`

When Stripe returns a payment error (e.g., card declined), the function reverts the gift to `payment: 'deferred'` and sends a `payment_failed` notification. There is no automatic retry for Stripe-side failures — the giver must manually update their payment method. This is a product decision, not a bug, but means a completed goal can remain unrewarded indefinitely if the giver ignores the notification.

---

### INFO 02 — `listenToFeed` truncates real-time feed at 30 friends
**File:** `src/services/FeedService.ts:222-229`

Real-time feed subscriptions are limited to 30 user IDs (Firestore `in` operator limit). Users with 29+ friends will have incomplete real-time feeds. The paginated `getFriendsFeed` handles this correctly via batched queries but the real-time path silently truncates. A comment in the code acknowledges this but there's no fallback mechanism.

---

### INFO 03 — Shared challenge giver goals bypass the 3-goal active limit
**File:** `functions/src/createFreeGift.ts:256-316`, `functions/src/createDeferredGift.ts:302-364`

Giver goals created by Cloud Functions for shared challenges have `experienceGiftId` set, making `isPaidGiftedGoal = true`, which bypasses the 3-goal active goal counter. This is intentional design (shared challenge givers should not be penalized with a slot), but means a user can accumulate more than 3 active goals by creating multiple shared challenges as the giver.

---

## Gift State Machine Analysis

The `giftStateMachine.ts` is correctly defined with terminal states (`completed`, `expired`, `cancelled`). Valid transitions are enforced in `chargeDeferredGift` via `validateGiftTransition`. However, **not all code paths that update gift status call `validateGiftTransition`**:

- `deleteGoal.ts` sets `status: 'cancelled'` and `status: 'active'` (restore) without calling `validateGiftTransition`.
- `retryFailedCharges.ts` sets `status: 'completed'` without calling `validateGiftTransition`.
- `createFreeGift.ts` and `stripeWebhook.ts` create gifts with initial `status: 'pending'` — creation is not a transition, so this is fine.

The state machine comment in `giftStateMachine.ts` itself lists these callsites as needing to adopt `validateGiftTransition`. This is a documentation acknowledgment of the gap.

---

## Files Audited

**Client Services (`src/services/`):**
- GoalService.ts
- GoalSessionService.ts
- FriendService.ts
- NotificationService.ts
- ReactionService.ts
- ExperienceGiftService.ts
- FeedService.ts
- CommentService.ts
- userService.ts

**Cloud Functions (`functions/src/`):**
- stripeWebhook.ts
- stripeCreatePaymentIntent.ts
- createFreeGift.ts
- createDeferredGift.ts
- deleteGoal.ts
- retryFailedCharges.ts
- updatePaymentIntentMetadata.ts
- triggers/chargeDeferredGift.ts
- triggers/onNotificationCreated.ts *(not available — not listed in glob output)*
- scheduled/sendWeeklyRecap.ts
- scheduled/sendSessionReminders.ts
- scheduled/sendInactivityNudges.ts
- scheduled/checkUnstartedGoals.ts
- scheduled/sendBookingReminders.ts *(not read — not in scope)*
- utils/giftStateMachine.ts

**Supporting Files:**
- src/types/index.ts
- src/utils/GoalHelpers.ts (normalizeGoal)
