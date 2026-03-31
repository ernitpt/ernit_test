# Firestore Rules Alignment Audit — Pass 1 & 2
**Date:** 2026-03-29
**Scope:** `firestore.rules` (1033 lines), `storage.rules` (101 lines), all `src/services/*.ts` files, `functions/src/` (admin SDK — bypasses rules), `.agent/knowledge/system-map.md`

---

## MAP A — Rules Summary

| Collection Path | Read | Create | Update | Delete |
|---|---|---|---|---|
| `/users/{userId}` | Any auth | Owner | Owner (field-restricted) | Owner |
| `/users/{userId}/coupons/{couponId}` | Owner | Owner | Owner | Owner |
| **`/users/{userId}/meta/{metaId}`** | **❌ NO RULE** | **❌ NO RULE** | **❌ NO RULE** | **❌ NO RULE** |
| `/partnerUsers/{partnerId}` | Any auth `get`; owner `read`; admin `list` | Owner (with invite) | Owner, admin | No client delete |
| `/partnerUsers/{partnerId}/coupons/{couponId}` | Owner + admin | Users (goal validation) | Owner + admin (status only) | Owner + partner |
| `/goals/{goalId}` | Any auth | Owner (gift/free-goal validated) | Complex (owner/giver/special) | Blocked |
| `/goals/{goalId}/sessions/{sessionId}` | Goal owner | Goal owner | Goal owner | Blocked |
| `/goals/{goalId}/hints/{hintId}` | Goal owner | Goal owner | Goal owner | Blocked |
| `/goals/{goalId}/motivations/{motivationId}` | Goal owner + author | Any auth except goal owner | Goal owner (`seen` only) | No rule |
| `/valentineChallenges/{challengeId}` | Participants | Blocked | Participants (limited fields) | Blocked |
| `/sharedChallenges/{challengeId}` | Participants | Blocked | Participants (limited fields) | Blocked |
| `/experienceGifts/{giftId}` | Giver/recipient | Blocked | Complex (claiming/message) | Blocked |
| `/hints/{hintId}` (flat) | Owner | Owner | Owner | Owner |
| `/friendRequests/{requestId}` | Sender/recipient | Sender | Sender (cancel) / Recipient (accept/reject) | Sender/recipient |
| `/friends/{friendDocId}` | userId or friendId | Either user (`hasOnly` list) | Either friend (name/image only) | Either user |
| `/notifications/{notificationId}` | Owner | Complex (type-based + relationships) | Owner (`read/updatedAt/isStale`); special cases | Owner + special |
| `/experiences/{experienceId}` | Public | Admin `write` (all ops) | Admin `write` | Admin `write` |
| `/categories/{categoryId}` | Public | Admin `write` | Admin `write` | Admin `write` |
| `/partnerInvites/{inviteId}` | Admin or email match | Admin only | Admin | Admin |
| `/feedPosts/{postId}` | Any auth | Owner / giver (goal_approved) | Owner / others (counts only, bounded) | Owner |
| `/feedPosts/{postId}/reactions/{reactionId}` | Any auth (list ≤50) | Own uid | — | Own uid |
| `/feedPosts/{postId}/comments/{commentId}` | Any auth (list ≤50) | Own uid | Owner / like (uid-in-array check) | Owner |
| `/goalSessions/{goalId}/sessions/{sessionId}` | Goal owner | Goal owner (write) | Goal owner | — |
| `/processedPayments/{paymentId}` | Blocked | Blocked | Blocked | Blocked |
| `/rateLimits/{limitId}` | Blocked | Blocked | Blocked | Blocked |
| `/events/{eventId}` | Blocked | Any auth (field-validated) | Blocked | Blocked |
| `/errors/{errorId}` | Blocked | Anyone (field-validated) | Blocked | Blocked |
| `/partnerCoupons/{partnerId}/coupons/{couponId}` | Partner | Blocked | Partner (status/redeemedAt) | Blocked |

---

## MAP B — Code Access Summary

| Service | Path Accessed | Operations |
|---|---|---|
| `GoalService` | `goals/` | create, read, update (hints, approval, counts, couponCode, pendingEditRequest, targetCount, sessionsPerWeek, duration, endDate, totalSessions, empowerPending, description) |
| `GoalService` | **`users/{uid}/meta/goalCount`** | **read+write** (transaction) |
| `GoalService` | `feedPosts/` | create |
| `GoalService` | `users/{uid}` | read |
| `GoalSessionService` | `goals/{id}` | read, update (weeklyCount, currentCount, isCompleted, weekStartAt, etc.) |
| `GoalSessionService` | **`users/{uid}/meta/goalCount`** | **read+write** (transaction) |
| `GoalSessionService` | `users/{uid}` | read, update (`sessionStreak`, `longestSessionStreak`, `lastSessionDate`) |
| `ExperienceGiftService` | `experienceGifts/` | read, update (`personalizedMessage`) |
| `FeedService` | `feedPosts/` | create, read, update (`reactionCounts`, `commentCount`) |
| `NotificationService` | `notifications/` | create, read, update, delete (batch) |
| `CouponService` | `partnerUsers/{pid}/coupons/` | create (transaction, `requestId` field on goal doc) |
| `CouponService` | `goals/{id}` | read, update (`couponCode`, `couponGeneratedAt`) |
| `FriendService` | `friends/` | read, create (with `requestId` field), delete (batch) |
| `FriendService` | `friendRequests/` | read, create, delete |
| `FriendService` | `notifications/` | read, delete |
| `FriendService` | **`users/{uid}/meta/rateLimits`** | **read+write** (transaction) |
| `MotivationService` | `goals/{id}/motivations/` | read (query), create (transaction), update (`seen`) |
| `ReactionService` | `feedPosts/{id}/reactions/` | create, delete, read |
| `ReactionService` | `feedPosts/{id}` | update (`reactionCounts.*`) |
| `CommentService` | `feedPosts/{id}/comments/` | create, read, update (`text`, `updatedAt`, `likedBy`), delete |
| `CommentService` | `feedPosts/{id}` | update (`commentCount`) |
| `AnalyticsService` | `events/` | create |
| `UserService` | `users/` | create, read, update |
| `PartnerService` | `partnerUsers/{id}` | read (get by ID) |
| `StorageService` | `hints/{uid}/audio/`, `hints/{uid}/images/` | write |
| `StorageService` | `motivations/{uid}/audio/`, `motivations/{uid}/images/` | write |
| `StorageService` | `sessions/{uid}/{goalId}/` | write |

---

## Findings

### 🔴 CRITICAL — Breaks Core App Flows

---

#### [CRIT-1] MISSING RULE: `users/{userId}/meta/{metaId}` sub-collection

**Category:** Missing Rules
**Severity:** CRITICAL
**Exploitability:** Client SDK only — no client-side path. All affected flows fail silently or with `PERMISSION_DENIED`.

**Detail:**
`GoalService.createGoal()`, `createFreeGoal()`, `GoalSessionService.tickWeeklySession()`, and `GoalSessionService.sweepExpiredWeeks()` all use `runTransaction` to read and write `users/{userId}/meta/goalCount`. `FriendService.checkRateLimit()` similarly reads and writes `users/{userId}/meta/rateLimits`. There are **zero rules** covering the `users/{userId}/meta/{metaId}` sub-collection path. Because Firestore rules are deny-by-default, all of these operations will fail with `PERMISSION_DENIED`, breaking:

- Goal creation (3-goal limit enforcement via `goalCount`)
- Goal completion / session tick (counter decrement via `goalCount`)
- Friend request rate limiting (`rateLimits`)

**Affected files:**
- `src/services/GoalService.ts` (lines 112–128, 188–206)
- `src/services/GoalSessionService.ts` (lines 119–155, 313–315)
- `src/services/FriendService.ts` (lines 71–101)

**Fix:**
Add inside the existing `/users/{userId}` match block:
```
match /meta/{metaId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

---

#### [CRIT-2] `friends` CREATE RULE — `requestId` field not in `hasOnly` list

**Category:** Rule Logic Bug
**Severity:** CRITICAL
**Exploitability:** All friend acceptances fail client-side. No security bypass — this is a correctness bug.

**Detail:**
The `friends/{friendDocId}` create rule at line 634 has:
```
&& request.resource.data.keys().hasOnly([
     'userId', 'friendId', 'friendName', 'friendProfileImageUrl', 'createdAt', 'addedAt'
   ])
```
`FriendService.acceptFriendRequest()` writes both friend docs with a `requestId` field (added as part of security fix S2 for friendRequest existence verification). Since `requestId` is NOT in the `hasOnly` list, the rule evaluates to `false` for every friend creation attempt, yielding `PERMISSION_DENIED`. **The entire friend-acceptance flow is broken on the client.**

**Affected file:**
- `src/services/FriendService.ts` (lines 227–246)

**Fix:**
Add `'requestId'` to the `hasOnly` list in `firestore.rules` line 634. Optionally, also add an `exists()` check on the referenced friendRequest to enforce the security property the comment describes.

---

#### [CRIT-3] MISSING NOTIFICATION TYPES: `goal_edit_request` and `goal_edit_response`

**Category:** Missing Rules
**Severity:** CRITICAL (breaks Goal Edit feature entirely)
**Exploitability:** Client-side notification creation for these types fails silently (notification is swallowed in `try/catch`).

**Detail:**
The notification `create` rule lists allowed goal-related types at lines 740–745:
```
'goal_completed', 'goal_progress', 'goal_approval_request',
'goal_change_suggested', 'goal_approval_response',
'personalized_hint_left', 'motivation_received',
'free_goal_completed', 'free_goal_milestone',
'shared_session', 'shared_start', 'shared_unlock',
'shared_completion', 'payment_charged', 'payment_failed'
```
The new `goal_edit_request` and `goal_edit_response` notification types (added per system-map.md in session 2026-03-26) are **absent from this list**. Calls to `GoalService.requestGoalEdit()`, `approveGoalEditRequest()`, and `rejectGoalEditRequest()` silently fail to deliver notifications to the giver/recipient, making the goal edit approval flow non-functional.

**Affected file:**
- `src/services/GoalService.ts` (lines 972–979, ~1025, ~1065)

**Fix:**
Add `'goal_edit_request'` and `'goal_edit_response'` to the type list in the notification create rule (around line 740 in `firestore.rules`).

---

### 🟠 HIGH — Incorrect Behavior / Partial Security Bypass

---

#### [HIGH-1] Comment UNLIKE denied by rules for non-owners

**Category:** Rule Logic Bug
**Severity:** HIGH (feature breakage)
**Exploitability:** Any user who liked another user's comment cannot undo it.

**Detail:**
The `comments/{commentId}` update rule for non-owners (lines 916–918):
```
request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likedBy', 'likeCount'])
&& request.auth.uid in request.resource.data.likedBy
```
The condition `request.auth.uid in request.resource.data.likedBy` requires the caller's UID to be **present in the result array**. `CommentService.unlikeComment()` calls `arrayRemove(userId)` — after the write, the UID is no longer in the array, so the rule evaluates to `false` and the unlike is denied. Users can like but not unlike others' comments.

**Affected file:**
- `src/services/CommentService.ts` (lines 192–205)

**Fix:**
Change the rule to check `request.auth.uid in resource.data.likedBy` (current state, not future state), or allow the operation when the UID is in the *existing* array:
```
|| (request.auth.uid in resource.data.likedBy
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likedBy', 'likeCount']))
```

---

#### [HIGH-2] `experiences` and `categories` use `allow write` (includes delete)

**Category:** Overly Permissive
**Severity:** HIGH
**Exploitability:** Requires admin credentials. A compromised/malicious admin can delete catalog items referenced by existing goals.

**Detail:**
Lines 786–798:
```
match /experiences/{experienceId} {
  allow read: if true;
  allow write: if request.auth != null && ...isAdmin == true && ...userType == 'partner';
}
```
`write` covers `create`, `update`, **and `delete`**. Experience documents are referenced by `experienceGifts` and `goals` (via `pledgedExperience.experienceId`). Deletion would silently break experience display for any goal/gift referencing that document. Same issue in `/categories/{categoryId}`.

**Fix:**
Replace `allow write:` with `allow create, update:` in both rules. Add a separate `allow delete:` only if catalog deletion is intentionally supported.

---

### 🟡 MEDIUM — Security or Data Integrity Risk

---

#### [MED-1] `events` collection — no `userId == request.auth.uid` constraint

**Category:** Overly Permissive
**Severity:** MEDIUM
**Exploitability:** Any authenticated user can write analytics events attributed to arbitrary user IDs, poisoning analytics data.

**Detail:**
The `events/{eventId}` create rule validates field presence and sizes but only requires `request.resource.data.userId is string` — it does not enforce `request.resource.data.userId == request.auth.uid`. A user can fabricate events for other users' IDs.

**Fix:**
Add `&& request.resource.data.userId == request.auth.uid` to the events create rule.

---

#### [MED-2] Goals update rule is overly broad when `approvalStatus == 'approved'`

**Category:** Overly Permissive
**Severity:** MEDIUM
**Exploitability:** A goal owner whose goal is in `approved` state can overwrite any field, including `empoweredBy`, `isFreeGoal`, `experienceGiftId`, `isCompleted`, etc. (The numeric validators at the end only apply constraints on the fields they target, not a whitelist.)

**Detail:**
The receiver update branch (1) at lines 195–246 has two sub-branches:
- If `approvalStatus == 'approved'` or no approval: **all updates allowed** (subject to numeric validators).
- If `pending/suggested/rejected`: restricted set.

When approved, the goal owner can change `empoweredBy` (detach the giver), flip `isFreeGoal`, or modify other sensitive flags. The only checks are on `weeklyCount`, `targetCount`, `sessionsPerWeek`, `isCompleted`, and `currentCount`.

**Fix:**
Add a `hasOnly` whitelist for the approved-state branch, enumerating all fields the receiver is legitimately allowed to change.

---

#### [MED-3] `partnerUsers` — `allow get: if request.auth != null` exposes full PII

**Category:** Overly Permissive
**Severity:** MEDIUM (acknowledged in comments at line 64–68)
**Exploitability:** Any authenticated Ernit user can do `getDoc(doc(db, 'partnerUsers', anyPartnerId))` and receive the full document including `email`, `phone`, `address`, `contactEmail`.

**Detail:**
The rule comment acknowledges this as intentional for experience card display. However, only public fields (name, logo, description) are needed for experience cards. A Cloud Function proxy returning only public fields would eliminate the PII exposure.

**Fix (low priority):** Consider a Cloud Function proxy or a separate `publicPartnerProfile` sub-document for fields needed by non-partner users. Until then, document explicitly which fields are safe to expose.

---

#### [MED-4] `notifications` — `creating notification for yourself` allows any type for self

**Category:** Overly Permissive
**Severity:** MEDIUM
**Exploitability:** Any authenticated user can call `addDoc(collection(db, 'notifications'), {userId: myUid, type: 'anything', ...})` to create self-notifications of any type.

**Detail:**
Line 710–711:
```
request.auth.uid == request.resource.data.userId
```
This unconditional branch matches any notification where `userId == request.auth.uid`. The type-based validation below only applies to the OR branches for other-user notifications. A user could create fake notifications (e.g., `type: 'goal_completed'`) for themselves.

**Fix:**
Add a type whitelist or restrict self-notifications to types that legitimately originate from the client (e.g., `goal_progress`, analytics). Alternatively, move all notification creation to Cloud Functions and set `allow create: if false`.

---

### 🔵 LOW — Informational / Minor

---

#### [LOW-1] `goalSessions/{goalId}/sessions` — dead-code rules

**Category:** Missing Rules (inverse — rules with no corresponding code)
**Severity:** LOW

**Detail:**
Lines 930–937 define rules for a top-level `goalSessions/{goalId}/sessions/{sessionId}` path. All client code uses `goals/{goalId}/sessions/{sessionId}` (nested). The `goalSessions` top-level collection does not appear to be accessed anywhere in `src/services/`. These rules are dead code.

**Action:** Verify with a Firestore console query. If confirmed unused, remove to reduce rule-file complexity.

---

#### [LOW-2] Storage: `hints/{userId}` and `motivations/{userId}` — any authenticated user can read

**Category:** Overly Permissive (Storage)
**Severity:** LOW
**Exploitability:** Requires auth token + knowledge of file path. URLs are not guessable but could be leaked through screenshots or network inspection.

**Detail:**
Storage rules (lines 20–42):
```
match /hints/{userId}/{allPaths=**} { allow read: if request.auth != null; }
match /motivations/{userId}/{allPaths=**} { allow read: if request.auth != null; }
```
Any signed-in user can read any hint/motivation audio or image if they know the path. A strict rule would scope reads to `userId` (the giver) or the goal recipient.

**Fix:**
```
allow read: if request.auth != null
  && (request.auth.uid == userId || ...goal_recipient_check...);
```
Since recipient verification would require a Firestore `get()` from storage rules (unsupported), a practical fix is to scope reads to `request.auth.uid == userId` and serve recipient URLs via a Cloud Function or short-lived signed URLs.

---

#### [LOW-3] `feedPosts` — privacy enforced only client-side

**Category:** Overly Permissive (acknowledged)
**Severity:** LOW (intentional, documented)

**Detail:**
Lines 841–852 document the intentional decision to allow any authenticated user to read feed posts, with friend-filtering enforced client-side. This is an acceptable trade-off for the current scale but means any authenticated user can enumerate posts of any user.

**Note:** Consider migrating to per-user feed subcollections (fan-out write model) if stricter privacy is required.

---

#### [LOW-4] `goals/{goalId}/hints` subcollection rules — potentially unused by client

**Category:** Overly Permissive (rules with no code match)
**Severity:** LOW

**Detail:**
Lines 342–348 define rules for `goals/{goalId}/hints/{hintId}` (a subcollection). Client code in `GoalService.appendHint()` writes hints as an **array field on the goal document itself** (`goals/{goalId}.hints`), not as subcollection documents. The subcollection rules may be for Cloud Functions internal use or legacy. Clarify whether the subcollection is used; if not, remove.

---

## Summary Table

| ID | Category | Severity | Description |
|---|---|---|---|
| CRIT-1 | Missing Rule | CRITICAL | No rules for `users/{userId}/meta/{metaId}` — breaks goal creation, completion, rate-limiting |
| CRIT-2 | Rule Logic Bug | CRITICAL | `friends` create `hasOnly` excludes `requestId` — breaks all friend acceptances |
| CRIT-3 | Missing Rule | CRITICAL | `goal_edit_request`/`goal_edit_response` not in notification type allowlist |
| HIGH-1 | Rule Logic Bug | HIGH | Comment unlike denied (uid-in-future-array check) |
| HIGH-2 | Overly Permissive | HIGH | `experiences`/`categories` use `write` (includes delete) |
| MED-1 | Overly Permissive | MEDIUM | `events` create — no `userId == request.auth.uid` |
| MED-2 | Overly Permissive | MEDIUM | Goals update rule — all fields writable when `approved` |
| MED-3 | Overly Permissive | MEDIUM | `partnerUsers` get exposes full PII to all auth users |
| MED-4 | Overly Permissive | MEDIUM | Self-notifications allow any type |
| LOW-1 | Dead Code | LOW | `goalSessions` rules unused by client code |
| LOW-2 | Overly Permissive | LOW | Storage `hints`/`motivations` readable by any auth user |
| LOW-3 | Overly Permissive | LOW | Feed posts readable by all auth users (intentional, documented) |
| LOW-4 | Dead Code | LOW | `goals/{goalId}/hints` subcollection rules unused by client |

---

## Files Audited

**Firestore/Storage Rules:**
- `firestore.rules` (all 1033 lines)
- `storage.rules` (all 101 lines)

**Client Services (`src/services/`):**
- `GoalService.ts`, `GoalSessionService.ts`, `ExperienceGiftService.ts`
- `FeedService.ts`, `NotificationService.ts`, `CouponService.ts`
- `FriendService.ts`, `StorageService.ts`, `MotivationService.ts`
- `ReactionService.ts`, `CommentService.ts`, `AnalyticsService.ts`
- `AIHintService.ts`, `PartnerService.ts`, `userService.ts`

**Knowledge:**
- `.agent/knowledge/system-map.md`

**Cloud Functions** (admin SDK, bypasses rules — audited for data model only):
- `functions/src/` (file list reviewed; individual files not fully read)
