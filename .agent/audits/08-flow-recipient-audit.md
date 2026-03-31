# Recipient-Side Flow Logic Audit — Pass 1 + Pass 2

**Date**: 2026-03-29
**Auditor**: Automated (scheduled task)
**Scope**: End-to-end recipient flows — goal lifecycle, session logging, streak, friends, notifications, feed, coupon, AI hints
**Mode**: READ-ONLY — no files modified except this report

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| 🔴 HIGH | Data loss, security bypass, or broken core flow |
| 🟡 MEDIUM | Degraded UX, race condition, or missing guard with real user impact |
| 🟢 LOW | Edge case, minor inconsistency, UX polish gap |
| ✅ GOOD | Correctly implemented; documented for completeness |

---

## 1. Goal Lifecycle

### 🟡 MEDIUM — Session can be logged on a completed goal

**File**: `src/services/GoalSessionService.ts` (lines ~187–318)
**Description**: `tickWeeklySession` has no explicit early-exit guard for `g.isCompleted === true`. The inline sweep skips completed goals (`!g.isCompleted`), but the code then continues to the day-duplicate check and week-complete check without blocking. If a goal is completed (from a previous session) but `weeklyCount < sessionsPerWeek` and today is not in `weeklyLogDates`, the transaction will log another session and increment counts on a completed goal.

**Reproduction path**: Complete a goal on Day 1 of a week (first session meeting the target), then log another session on Day 2. The goal is `isCompleted = true` but `weeklyLogDates` only has Day 1, so the Day 2 session passes both guards.

**Impact**: Corrupted goal state — `currentCount` and `weeklyCount` are incremented on an already-complete goal. Feed posts, notifications, and analytics events are emitted spuriously.

**Fix**: Add at the top of the `tickWeeklySession` transaction (after `normalizeGoal`):
```
if (g.isCompleted) {
  throw new AppError('GOAL_COMPLETE', 'This goal is already completed.', 'business');
}
```

---

### 🟡 MEDIUM — `requestGoalEdit` uses non-atomic read-check-write

**File**: `src/services/GoalService.ts` (lines ~943–966)
**Description**: `requestGoalEdit` reads the goal with `getDoc`, checks `if (pendingEditRequest)`, then writes with `updateDoc`. This is NOT inside a transaction. A user who double-taps the request button, or two concurrent requests from different devices, could both pass the `pendingEditRequest` check and both write — the second overwriting the first silently.

**Contrast**: `approveGoalEditRequest` correctly uses `runTransaction` with the same check inside. `requestGoalEdit` should do the same.

**Impact**: Silent overwrite of a pending edit request, potentially with different parameters than the user intended. Low frequency but possible on slow connections with retries.

**Fix**: Wrap the `pendingEditRequest` check and `updateDoc` inside `runTransaction`.

---

### 🟢 LOW — Auto-approval only runs client-side

**File**: `src/screens/GoalsScreen.tsx` (lines ~178–202, `runAutoApprove`)
**Description**: `checkAndAutoApprove` is triggered from a `useEffect` in GoalsScreen that fires when the user opens the app. No server-side scheduled function enforces the `approvalDeadline`. If the recipient never opens the app after the deadline, the goal stays in `pending` forever.

**Impact**: Goals requiring giver approval but where the giver is inactive could be permanently stuck. Low frequency in practice (most users open the app regularly).

**Fix**: Add a daily Cloud Function to check `approvalStatus == 'pending' && approvalDeadline < now` and auto-approve.

---

### 🟢 LOW — GoalsScreen active/completed filter can double-count a goal

**File**: `src/screens/GoalsScreen.tsx` (lines ~124–145)
**Description**: Active goals: `!g.isCompleted && g.currentCount < g.targetCount`. Completed goals: `g.isCompleted || g.currentCount >= g.targetCount`. If `isCompleted = false` but `currentCount >= targetCount` (e.g., from a sweep race or migration edge case), the goal appears in both `activeGoals` and `completedGoals`, rendering it twice.

**Impact**: Duplicate goal card in GoalsScreen. Cosmetic but confusing.

---

### ✅ GOOD — Goal giver approval flow (approve/suggest/respond)

All three paths use `runTransaction` for atomic read-modify-write. Authorization checks (`empoweredBy`, `userId`) are inside transactions. Backward-compatibility fallback `approvalStatus ?? 'approved'` prevents old goals from being blocked.

---

### ✅ GOOD — Shared challenge completion blocking

Goals with `challengeType === 'shared'` and no `partnerGoalId` set `isReadyToComplete = true` instead of `isCompleted = true`, correctly blocking premature completion until both partners are linked.

---

## 2. Session Logging

### 🟡 MEDIUM — See Goal Lifecycle #1 (duplicate entry)

Session logging on a completed goal is repeated here for category completeness.

---

### 🟢 LOW — `MAX_SESSION_SECONDS` (8 hours) not enforced as cap

**File**: `src/screens/recipient/DetailedGoalCard.tsx` (line 76)
**Description**: `MAX_SESSION_SECONDS = 28800` is defined and used for progress percentage calculation inside the card UI, but is never applied as a hard cap on `timeElapsed`. A session timer running for >8 hours would still produce a valid `canFinish = true` state. The `sessionService.saveSession` would record the actual (very long) duration.

**Impact**: Unusually long sessions could inflate stats and feed posts. Low practical risk.

---

### 🟢 LOW — Timer storage key is shared (not namespaced per-user)

**File**: `src/services/GoalSessionService.ts` and `src/context/TimerContext.tsx`
**Description**: The `TIMER_STORAGE_KEY = 'global_timer_state'` AsyncStorage key is not namespaced by userId. On a shared device where two users log in/out, the second user could see stale timer state from the first user's goals.

**Impact**: Extremely rare (shared device scenarios), but could surface as a phantom running timer.

---

### ✅ GOOD — Timer persistence across app kills

`TimerContext` persists `startTime` (epoch ms) to AsyncStorage on background/inactive. On resume, elapsed is computed as `Date.now() - startTime`, so the timer correctly accounts for time while the app was killed.

---

### ✅ GOOD — Double-tap prevention on `tickWeeklySession`

The transaction is atomic (Firestore read-modify-write). Even if two taps fire simultaneously, the second will read the already-incremented `weeklyLogDates` and the day-duplicate guard will short-circuit. The `loading` state in `DetailedGoalCard` also prevents the UI from sending two concurrent requests.

---

### ✅ GOOD — Session for the same day blocked

`weeklyLogDates.includes(todayIso)` check prevents duplicate same-day sessions unless `DEBUG_ALLOW_MULTIPLE_PER_DAY` is true (development only, guarded by `config.debugEnabled`).

---

## 3. Streak Calculation

### 🟢 LOW — Streak uses UTC date, not user's local date

**File**: `src/services/GoalSessionService.ts` (lines ~340–366)
**Description**: `todayIsoStreak = new Date().toISOString().split('T')[0]` computes the streak date in UTC. Users in UTC+ timezones (e.g., Australia, UTC+11) logging a session at 11pm local time are on the following UTC date. If their `lastSessionDate` was set to today (UTC) and they log at 23:00 local (00:00 UTC next day), the system correctly increments the streak. But if they log at 22:00 local (11:00 UTC same day), both sessions land on the same UTC date, and the second session's `daysSince = 0`, incrementing the streak again.

**Impact**: Streak can over-increment for users in UTC+ timezones logging two sessions close to midnight. Low frequency.

---

### 🟢 LOW — `startedGoalCount` is read outside the streak transaction

**File**: `src/services/GoalSessionService.ts` (lines ~326–332)
**Description**: `startedGoalsSnap` is fetched before entering the streak `runTransaction`. A concurrent goal deletion between the fetch and the transaction write could cause `startedGoalCount` to be 1 higher than reality, preventing a correct streak reset.

**Impact**: Streak may not reset when it should for single-goal users at the exact moment a concurrent deletion occurs. Extremely rare.

---

### ✅ GOOD — Week-boundary streak extension

When `g.isWeekCompleted`, `lastSessionDate` is set to `nextWeekStart`, preventing the 7-day inactivity countdown from starting until the next week begins. This is correct and prevents false streak resets between weeks.

---

### ✅ GOOD — Missed week resets streak for single-goal users

`hadIncompleteSweep` flag is correctly propagated from the inline sweep inside `tickWeeklySession`. For single-started-goal users who missed a week, `newStreak = 1` resets the streak.

---

## 4. Friend Request Flow

### 🟢 LOW — `removeFriend` does not clean up historical notifications

**File**: `src/services/FriendService.ts` (lines ~398–424)
**Description**: `removeFriend` atomically batch-deletes both directional `friends` documents. It does NOT delete any notifications from the removed friend (e.g., `post_reaction`, `motivation_received`). Feed is filtered client-side (server-side `in` query), so removed-friend posts disappear from feed correctly. But notification inbox may still show interactions from the removed friend.

**Impact**: Minor UX — removed friend's reactions/comments still appear as notifications.

---

### 🟢 LOW — No blocking mechanism

**Description**: After `removeFriend`, the removed user can immediately re-send a friend request. There is no block/ignore system. This appears to be intentional product design.

---

### ✅ GOOD — Self-friending prevented

`senderId === recipientId` throws `SELF_REQUEST` before any Firestore writes.

---

### ✅ GOOD — Duplicate and reverse-direction requests blocked

`getFriendRequest(senderId, recipientId)` and `getFriendRequest(recipientId, senderId)` both checked before adding a new request. `alreadyFriends` also checked.

---

### ✅ GOOD — Accept uses atomic transaction with status guard

`acceptFriendRequest` reads `requestData.status`, checks it equals `'pending'`, then atomically creates bidirectional friend docs and deletes the request in a single transaction. Prevents double-accept race.

---

### ✅ GOOD — Notification cleanup on accept/decline

Both `acceptFriendRequest` and `declineFriendRequest` clean up `friend_request` type notifications via a post-transaction `getDocs + deleteDoc` sweep.

---

### ✅ GOOD — Rate limiting on friend requests

`checkRateLimit` uses a Firestore transaction to atomically increment the window counter. 10 requests/hour limit. Prevents spam.

---

## 5. Notification Flow

### 🟡 MEDIUM — Several notification types silently do nothing when tapped

**File**: `src/screens/NotificationsScreen.tsx` (`handlePress`, lines ~226–448)
**Description**: The following notification types have NO tap handler in `handlePress`:

| Type | Expected action | Actual behavior |
|------|----------------|-----------------|
| `goal_progress` | Navigate to Journey | Mark as read, do nothing |
| `free_goal_milestone` | Navigate to Journey | Mark as read, do nothing |
| `inactivity_nudge` | Navigate to Journey | Mark as read, do nothing |

The notifications are marked as read but no navigation or feedback is provided to the user.

**Impact**: Users tapping these notifications experience a confusing no-op. `goal_progress` is one of the most common notification types.

**Fix**: Add handlers for these types — they should navigate to `Journey` screen with the goal fetched by `n.data.goalId`.

---

### 🟡 MEDIUM — `goal_completed` notification navigates to GoalDetail instead of AchievementDetail

**File**: `src/screens/NotificationsScreen.tsx` (line ~433)
**Description**: `n.type === 'goal_completed'` navigates to `GoalDetail` with just `{ goalId }`. `GoalDetail` is a minimal summary screen (progress bars, week window). The expected completion experience is `AchievementDetail` with mode `completion`, which shows confetti, reward details, and booking options.

**Impact**: Post-completion notification delivers a flat, unexciting experience. The achievement celebration is missed entirely if the user enters via notification.

**Fix**: Change `navigation.navigate('GoalDetail', { goalId })` to `navigation.navigate('AchievementDetail', { goal, mode: 'completion' })` for `goal_completed` type.

---

### 🟢 LOW — `experience_booking_reminder` tap silently fails if goal is null

**File**: `src/screens/NotificationsScreen.tsx` (lines ~376–392)
**Description**: `if (goal) { ... }` — if `getGoalById` returns null (deleted goal), the code falls through silently. No `showError` is called for this path (unlike most other handlers which have a null-check with `showError`).

**Impact**: Tapping a booking reminder for a deleted goal silently marks it read with no feedback.

---

### ✅ GOOD — Tap handlers for missing data show errors

`gift_received`, `personalized_hint_left`, `post_reaction`, `post_comment` all call `showError('Could not open — data unavailable')` when required data fields are absent or the referenced entity is not found.

---

### ✅ GOOD — Double-tap prevention via `tappingRef`

`tappingRef.current = true` is set at the start of `handlePress` and cleared after 500ms in `finally`. Concurrent invocations are blocked at the UI layer.

---

### ✅ GOOD — `payment_failed` URL validation

Recovery URL is validated with `url.startsWith('https://')` before calling `Linking.openURL`. Non-https and malformed URLs are rejected with `showError`.

---

## 6. Feed & Social

### 🟡 MEDIUM — Feed cut off at 30 friends (Firestore `in` query limit)

**File**: `src/services/FeedService.ts` (`listenToFeed`)
**Description**: `where('userId', 'in', [...friendIds])` — Firestore `in` queries have a hard limit of 30 values. Users with >30 friends will not see posts from friend #31+. The knowledge doc acknowledges this but marks it as an architectural note, not a tracked issue.

**Impact**: For power users with many friends, the feed is silently incomplete. No truncation warning is shown.

**Fix**: Paginate friend IDs in batches of 30, merge results client-side, or migrate to a fan-out feed model.

---

### 🟢 LOW — Self-reactions allowed

**File**: `src/services/ReactionService.ts` (lines ~99–102)
**Description**: `if (reactionAdded && postOwnerId && postOwnerId !== userId)` correctly skips the self-reaction notification. However, the reaction itself is not blocked. A user can react to their own post, which inflates reaction counts and may appear in the reaction viewer.

**Impact**: Minor data integrity / UX question. Depends on product intent.

---

### 🟢 LOW — Feed filter `sessions` label matches `session_progress` post type, but `goal_progress` posts exist

**File**: `src/screens/FeedScreen.tsx` (lines ~76–79)
**Description**: The `sessions` filter checks `p.type === 'session_progress'`. However, `FeedService` creates posts with type `goal_progress` for weekly milestone posts (`createGoalProgressPost`). These are not captured by any filter — not `sessions` (expects `session_progress`), not `goals`, not `completed`. They appear only in `all` mode.

**Impact**: Weekly milestone posts are invisible in the `sessions` filter tab.

---

### ✅ GOOD — Comment on deleted post is blocked by batch

`addComment` uses a `writeBatch` with both `batch.set(newCommentRef)` and `batch.update(postRef, { commentCount: increment(1) })`. Firestore `update` inside a batch throws if the document doesn't exist, causing the batch to fail atomically. No orphan comments are created on deleted posts.

---

### ✅ GOOD — Reaction toggle is atomic

`ReactionService.addReaction` wraps everything in `runTransaction`. Toggle-off, type-switch, and new-reaction all read and write atomically. Duplicate reaction IDs are prevented via deterministic `${postId}_${userId}` doc ID.

---

## 7. Coupon Redemption

### 🟡 MEDIUM — Race condition window between CouponEntry validation and GoalSetting claim

**File**: `src/screens/recipient/CouponEntryScreen.tsx` (lines ~160–231)
**Description**: `CouponEntryScreen` queries `experienceGifts` for `status in ['pending', 'active']` to validate a code, but explicitly does NOT modify the gift document ("Validation only — actual claim is performed atomically in GoalSettingScreen"). Two users who obtain the same claim code (e.g., code shared externally, or a retry race) could both pass validation before either claims the gift. Only the first to complete `GoalSettingScreen` would succeed; the second would get a mid-wizard error.

**Impact**: The second user experiences a confusing failure after completing multi-step setup. Rare in practice (requires code sharing), but the UX failure point is at a late stage.

**Note**: The server-side atomic claim in GoalSetting does protect data integrity — no double-claim is possible. The issue is purely UX-layer.

---

### 🟢 LOW — Auto-friend request on coupon claim has no dedup guard for already-friends

**File**: `src/screens/recipient/CouponEntryScreen.tsx` (lines ~204–218)
**Description**: `friendService.sendFriendRequest(...)` is called unconditionally when `experienceGift.giverId !== state.user.id`. If the giver is already a friend, this throws `ALREADY_FRIENDS`. The catch silently logs a warn — which is correct. But the log message says "may already exist" when the actual reason could also be rate limit, not just an existing request. Minor log clarity issue.

---

### ✅ GOOD — Code format validation before Firestore query

`/^[A-Z0-9]{12}$/` validated before any network call. Shake animation + error message on invalid format.

---

### ✅ GOOD — Expiry check on the gift

`expiresAt` is normalized from Timestamp/Date/string and compared to `new Date()`. Expired gifts are rejected with user-visible error.

---

### ✅ GOOD — Coupon generation is atomic (in CouponService)

`generateCouponForGoal` uses `runTransaction` to check for existing coupon, generate new code, and write to both `goals` and `partnerUsers/{partnerId}/coupons` atomically. Payment-pending guard blocks coupon issuance for deferred gifts.

---

## 8. AI Hints

### 🟢 LOW — Rate limit error not surfaced with a user-friendly message

**File**: `src/services/AIHintService.ts` + `functions/src/aiGenerateHint.ts`
**Description**: The Cloud Function throws `HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again later.')`. On the client, `aiHintService.generateHint()` propagates this error. In `GoalSettingScreen`, the hint is requested in a background `try/catch` that calls `showError(...)` — but the displayed message would be a generic error rather than the informative "Rate limit exceeded" message from the function.

**Impact**: Users who hit the 20/hour rate limit see a confusing generic error rather than "You've requested too many hints. Try again in X minutes."

---

### 🟢 LOW — Local hint cache not invalidated when server-side hint is updated

**File**: `src/services/AIHintService.ts` (lines ~41–91)
**Description**: The local `localCache` and AsyncStorage cache have a 30-day TTL. If a hint stored in Firestore `goalSessions/{goalId}/sessions/{n}` is corrected server-side (e.g., it accidentally leaked the experience), the cached (incorrect) version would be served for up to 30 days.

**Impact**: Stale hints served to clients after a server-side correction. Low probability event but irreversible until cache expires.

---

### ✅ GOOD — Rate limiting is server-side and atomic

`aiGenerateHint` Cloud Function uses `db.runTransaction` to check and increment the rate limit counter. Concurrent requests cannot both bypass the limit via TOCTOU.

---

### ✅ GOOD — Anti-repetition: previous hints + categories sent to LLM

`AIHintService.generateHint` fetches last 15 sessions' hints AND categories, sends both to the Cloud Function. The prompt explicitly forbids synonyms and paraphrasing of previous hints. Categories are tracked and rotated via `selectHintCategory`.

---

### ✅ GOOD — Mystery hint resolves experience server-side

`aiGenerateHint` Cloud Function, when receiving `goalId` without `experienceType`, reads the goal → gift → experience chain server-side. Ownership is verified (`goalData.userId !== userId` throws `permission-denied`). No experience details leak to the client.

---

### ✅ GOOD — Hint cache bounded (100 entries, 30-day TTL)

`localCache` is capped at 100 entries with LRU eviction. AsyncStorage entries expire after 30 days. Old format (plain string) is migrated on load.

---

## Summary Table

| # | Category | Severity | Issue |
|---|----------|----------|-------|
| G1 | Goal Lifecycle | 🟡 MEDIUM | Session logged on completed goal — no `isCompleted` guard in `tickWeeklySession` |
| G2 | Goal Lifecycle | 🟡 MEDIUM | `requestGoalEdit` non-atomic read-check-write |
| G3 | Goal Lifecycle | 🟢 LOW | Auto-approval only runs client-side (no server-side scheduled function) |
| G4 | Goal Lifecycle | 🟢 LOW | GoalsScreen filter can double-count goal if `isCompleted=false` but `currentCount>=targetCount` |
| S1 | Session Logging | 🟡 MEDIUM | (Same as G1) Completed goal session logging |
| S2 | Session Logging | 🟢 LOW | `MAX_SESSION_SECONDS` not enforced as hard cap |
| S3 | Session Logging | 🟢 LOW | Timer AsyncStorage key not namespaced per-user |
| T1 | Streak | 🟢 LOW | Streak date computed in UTC — timezone edge case near midnight |
| T2 | Streak | 🟢 LOW | `startedGoalCount` fetched outside streak transaction |
| F1 | Friend Request | 🟢 LOW | `removeFriend` doesn't clean up old notifications from removed friend |
| N1 | Notifications | 🟡 MEDIUM | `goal_progress`, `free_goal_milestone`, `inactivity_nudge` taps silently no-op |
| N2 | Notifications | 🟡 MEDIUM | `goal_completed` navigates to GoalDetail instead of AchievementDetail |
| N3 | Notifications | 🟢 LOW | `experience_booking_reminder` tap silently fails if goal is null |
| P1 | Feed & Social | 🟡 MEDIUM | Feed silently cuts off at 30 friends (Firestore `in` limit) |
| P2 | Feed & Social | 🟢 LOW | Self-reactions allowed (no notification, but count inflated) |
| P3 | Feed & Social | 🟢 LOW | `goal_progress` post type not captured by `sessions` filter tab |
| C1 | Coupon | 🟡 MEDIUM | Race condition window between CouponEntry validation and GoalSetting claim |
| C2 | Coupon | 🟢 LOW | Auto-friend request log message not specific about failure reason |
| A1 | AI Hints | 🟢 LOW | Rate limit error not surfaced as user-friendly message |
| A2 | AI Hints | 🟢 LOW | Local hint cache not invalidated on server-side hint correction |

### Counts

| Severity | Count |
|----------|-------|
| 🔴 HIGH | 0 |
| 🟡 MEDIUM | 6 |
| 🟢 LOW | 14 |
| ✅ GOOD (noted) | 24 |

---

## Priority Fixes (in order)

1. **G1/S1** — Add `if (g.isCompleted) throw ...` at start of `tickWeeklySession` transaction (5-min fix, prevents goal state corruption)
2. **N1** — Add `handlePress` tap handlers for `goal_progress`, `free_goal_milestone`, `inactivity_nudge` navigating to Journey (10-min fix, significant UX improvement)
3. **N2** — Change `goal_completed` notification to navigate to AchievementDetail instead of GoalDetail (2-min fix, restores intended post-completion celebration)
4. **G2** — Wrap `requestGoalEdit` check+write in `runTransaction` (10-min fix, prevents silent overwrite)
5. **P1** — Investigate feed pagination for >30 friends (requires architectural decision)
6. **C1** — Consider showing a loading indicator or optimistic claim during the CouponEntry → GoalSetting transition to reduce the UX impact of a late race failure

---

## Files Audited

### Screens
- `src/screens/recipient/GoalSettingScreen.tsx`
- `src/screens/recipient/JourneyScreen.tsx`
- `src/screens/recipient/AchievementDetailScreen.tsx`
- `src/screens/recipient/CouponEntryScreen.tsx`
- `src/screens/recipient/DetailedGoalCard.tsx`
- `src/screens/GoalDetailScreen.tsx`
- `src/screens/GoalsScreen.tsx`
- `src/screens/FeedScreen.tsx`
- `src/screens/NotificationsScreen.tsx`

### Services
- `src/services/GoalService.ts`
- `src/services/GoalSessionService.ts`
- `src/services/FriendService.ts`
- `src/services/NotificationService.ts` (knowledge doc)
- `src/services/FeedService.ts` (knowledge doc)
- `src/services/CommentService.ts`
- `src/services/ReactionService.ts`
- `src/services/CouponService.ts`
- `src/services/AIHintService.ts`

### Cloud Functions
- `functions/src/scheduled/checkUnstartedGoals.ts`
- `functions/src/scheduled/sendSessionReminders.ts`
- `functions/src/aiGenerateHint.ts`
- `functions/src/deleteGoal.ts`

### Utilities & Context
- `src/context/TimerContext.tsx`
- `src/utils/GoalHelpers.ts` (via GoalService imports)

### Knowledge Docs
- `.agent/knowledge/system-map.md`
- `.agent/knowledge/goals-system.md`
- `.agent/knowledge/notifications-system.md`
- `.agent/knowledge/social-feed-system.md`
- `.agent/knowledge/ai-hints-system.md`
- `.agent/knowledge/hints-coupons-system.md`
