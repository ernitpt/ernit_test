# Cloud Functions Audit — Pass 1 + Pass 2
**Date:** 2026-03-29
**Scope:** All Cloud Functions in `functions/src/`
**Auditor:** Automated scheduled agent

---

## Files Audited

**Callable / HTTP:**
`index.ts`, `stripeCreatePaymentIntent.ts`, `stripeWebhook.ts`, `updatePaymentIntentMetadata.ts`, `createFreeGift.ts`, `createDeferredGift.ts`, `deleteGoal.ts`, `retryFailedCharges.ts`, `searchUsers.ts`, `sendContactEmail.ts`, `aiGenerateHint.ts`, `createExperience.ts`, `updateExperience.ts`, `deleteExperience.ts`, `getGiftsByPaymentIntent.ts`

**B2B:**
`b2bCreateCompany.ts`, `b2bInviteEmployee.ts`, `b2bAcceptInvite.ts`, `b2bCreateGoal.ts`, `b2bLogSession.ts`, `b2bGoalMilestone.ts`, `b2bConfig.ts`

**Triggers:**
`triggers/chargeDeferredGift.ts`, `triggers/onNotificationCreated.ts`

**Scheduled:**
`scheduled/checkUnstartedGoals.ts`, `scheduled/sendSessionReminders.ts`, `scheduled/sendInactivityNudges.ts`, `scheduled/sendWeeklyRecap.ts`, `scheduled/sendBookingReminders.ts`

**Utilities:**
`cors.ts`, `utils/stripeCustomer.ts`, `utils/notificationSender.ts`, `utils/giftStateMachine.ts`, `utils/giftEmailTemplate.ts`, `hintCategories.ts`

---

## Summary

| Category | Findings | Severity |
|---|---|---|
| Input Validation | 4 findings | Low–Medium |
| Error Handling | 2 findings | Low |
| Idempotency | 1 finding | Medium |
| Rate Limiting | 2 findings | Medium |
| Webhook Security | PASS | — |
| Scheduled Robustness | 2 findings | Medium |
| Trigger Edge Cases | 1 finding | Low |
| CORS | 2 findings | Low–Medium |
| Secrets | PASS | — |

---

## 1. Input Validation

### ✅ Strong Coverage (no finding)

| Function | Parameters | Status |
|---|---|---|
| `stripeCreatePaymentIntent` | `amount` (server-recalculated, never trusted), `giverId` (identity-matched), `cart` (array, size 0–50, per-item experienceId+quantity), `contentLength` (payload cap 10KB) | ✅ Pass |
| `createFreeGift` | `experienceId` (type+len 128), `challengeType` (enum), `revealMode` (enum), `giverName`/`personalizedMessage`/`goalName` (sanitized with length caps) | ✅ Pass |
| `createDeferredGift` | Same as createFreeGift | ✅ Pass |
| `sendContactEmail` | `type` (enum), `subject` (str, ≤200), `message` (str, ≤5000) | ✅ Pass |
| `aiGenerateHint` | All fields validated: string lengths, integer ranges, array limits, style enum | ✅ Pass |
| `updatePaymentIntentMetadata` | `paymentIntentId` (str, ≤100), `personalizedMessage` (str, ≤1000), ownership verified on Stripe | ✅ Pass |
| `b2bCreateCompany` | `companyName` (str, ≥2, ≤100), `billingEmail` (full regex), `industry` (≤100) | ✅ Pass |
| `b2bCreateGoal` | All required fields checked; KPI ownership check, employee membership check | ✅ Pass |
| `b2bLogSession` | `goalId` (type), ownership verified inside transaction | ✅ Pass |
| `createExperience` / `updateExperience` | Category enum, price range, MIME allowlist, 5MB cap, path traversal guard | ✅ Pass |

### FINDING IV-1: `recipientEmail` uses weak `includes('@')` validation
**Files:** `createFreeGift.ts:326`, `createDeferredGift.ts:385`, `b2bInviteEmployee.ts:30`
**Severity:** Low
**Description:** All three functions use `recipientEmail.includes('@')` or `!email.includes("@")` as the email validation check. This accepts clearly invalid values such as `@`, `@@`, `a@` and any string containing the `@` character anywhere (e.g., `not-an-email@`). While the worst outcome is a delivery failure rather than a security bypass, it can result in email being attempted to garbage addresses and leaking giver/inviter information to bounce handlers.
**Recommendation:** Apply the same `EMAIL_REGEX` used in `b2bCreateCompany.ts:38` to all three sites.

### FINDING IV-2: Unvalidated metadata fields in `stripeCreatePaymentIntent`
**File:** `stripeCreatePaymentIntent.ts:199–208`
**Severity:** Low
**Description:** `giverName` (line 202) and `personalizedMessage` (line 205) are passed directly into Stripe `PaymentIntent.metadata` without length validation. Stripe metadata keys and values have a 500-character value limit and a combined 8KB total limit. Exceeding these will cause the Stripe API to reject the request with a 400 error, which propagates to the user as a generic `Payment processing failed` error — the root cause is not surfaced. `giverName` is similarly unvalidated in the request body before being used.
**Recommendation:** Truncate `giverName` to 100 chars and `personalizedMessage` to 500 chars before writing to Stripe metadata.

### FINDING IV-3: `b2bInviteEmployee` has no rate limit on invitations
**File:** `b2bInviteEmployee.ts`
**Severity:** Low
**Description:** Unlike all B2C callable functions, `b2bInviteEmployee` has no rate limiting. A compromised admin account could send an unbounded number of invite emails via the function, using Ernit's email infrastructure as a spam relay. Each call does make a Firestore write (invite document), which provides natural cost pressure, but email is the more impactful channel.
**Recommendation:** Add a transactional rate limit (e.g., 50 invites/hour per admin UID) matching the pattern in `sendContactEmail.ts`.

### FINDING IV-4: `deleteGoal` and `updatePaymentIntentMetadata` have no rate limits
**Files:** `deleteGoal.ts`, `updatePaymentIntentMetadata.ts`
**Severity:** Low
**Description:** `updatePaymentIntentMetadata` makes a Stripe API call (retrieve + update) on every invocation with no per-user rate limit. A malicious but authenticated user could trigger hundreds of Stripe API calls per minute. `deleteGoal` has no rate limit either, though Firestore cost is the natural throttle there. Neither function is on the critical payment path but both interact with Stripe.
**Recommendation:** Add a modest rate limit (e.g., 20/hour) on `updatePaymentIntentMetadata` to avoid Stripe rate-limit errors cascading back to users.

---

## 2. Error Handling

### ✅ Strong Coverage (no finding)
All callable functions consistently throw `HttpsError` with appropriate codes (`unauthenticated`, `invalid-argument`, `permission-denied`, `not-found`, `resource-exhausted`). HTTP functions return structured JSON with appropriate status codes. No raw `Error` objects exposed to clients. Internal details (Stripe keys, Firestore paths) are never leaked to responses. `chargeDeferredGift` wraps Stripe errors and reverts the gift to `deferred` status on failure.

### FINDING EH-1: `b2bGoalMilestone` batch commit is uncaught
**File:** `b2bGoalMilestone.ts:109`
**Severity:** Low
**Description:** The `await batch.commit()` call on line 109 is not wrapped in a try/catch. If the Firestore batch fails (e.g., transient network error, permission denied), the error propagates unhandled, the trigger terminates with an exception, and the Firebase platform will retry the trigger with at-least-once semantics. Because the feed post IDs are deterministic (`milestone_<goalId>_<milestoneType>`), the retry is idempotent, so data corruption is unlikely. However, the unhandled exception generates noisy error logs.
**Recommendation:** Wrap `batch.commit()` in a try/catch with `logger.error` to prevent retry noise.

### FINDING EH-2: `recipientId` in `failedCharges` records is likely null
**File:** `triggers/chargeDeferredGift.ts:479`
**Severity:** Low
**Description:** When writing a `failedCharges` record, the code sets `recipientId: freshGiftData.userId || null`. However, the `experienceGifts` document schema stores the giver's uid as `giverId`, not `userId`. The `userId` field is not written to gift documents in any of the creation paths (`stripeWebhook.ts`, `createFreeGift.ts`, `createDeferredGift.ts`). As a result, `freshGiftData.userId` will be `undefined`, and `recipientId` will always be `null` in `failedCharges`. The correct value is `afterData.userId` (the goal owner) which is already in scope.
**Recommendation:** Replace `recipientId: freshGiftData.userId || null` with `recipientId: afterData.userId || null`.

---

## 3. Idempotency

### ✅ Strong Coverage (no finding)
- `stripeWebhook`: `processedPayments` collection keyed on `paymentIntentId` prevents duplicate gift creation ✅
- `chargeDeferredGift`: Atomic `payment: 'processing'` claim inside a transaction prevents double-charge ✅
- `chargeDeferredGift` (shared): `notificationSent` flag with atomic check prevents duplicate unlock notifications ✅
- `onNotificationCreated`: `pushSentAt` guard prevents duplicate FCM pushes on retry ✅
- `checkUnstartedGoals`: `sentUnstartedNotificationDays` array per goal ✅
- `sendInactivityNudges`: `lastNudgeLevel` per goal ✅
- `sendBookingReminders`: `bookingReminderDays` array per goal ✅
- `sendWeeklyRecap`: `lastWeeklyRecapWeek` ISO week key per goal ✅
- `b2bGoalMilestone`: deterministic `milestone_<goalId>_<milestoneType>` document IDs ✅
- `retryFailedCharges`: re-verifies Stripe PaymentIntent status AND checks `payment !== 'processing'` before writing ✅

### FINDING ID-1: `createFreeGift` and `createDeferredGift` have no idempotency key
**Files:** `createFreeGift.ts`, `createDeferredGift.ts`
**Severity:** Medium
**Description:** Neither function accepts or generates an idempotency key. A client network retry (e.g., request timed out at the client but succeeded server-side) will create two identical gift documents with two different `giftId` values and two different `claimCode` values. The rate limit (10/hour) limits the blast radius but does not prevent this. For deferred gifts, this also creates two orphaned `SetupIntent`s on Stripe.
**Real-world scenario:** User taps "Send Challenge" → receives a timeout → taps again → two gifts created, two emails sent.
**Recommendation:** Accept a client-generated idempotency key (UUID) as an optional parameter. Persist it in Firestore (`requestIdempotencyKey`) indexed on the `experienceGifts` collection, and check for it before creating a new gift. This is the same pattern used for `processedPayments` in `stripeWebhook.ts`.

---

## 4. Rate Limiting

### ✅ Atomic transactions used consistently
All five rate-limited functions use `db.runTransaction()` to perform the read-check-increment atomically, preventing TOCTOU races. Consistent pattern across `stripeCreatePaymentIntent`, `createFreeGift`, `createDeferredGift`, `sendContactEmail`, and `aiGenerateHint`.

### FINDING RL-1: `searchUsers` rate limiting is non-transactional
**File:** `searchUsers.ts:48–73`
**Severity:** Medium
**Description:** `searchUsers` performs rate limiting with a non-transactional read-then-write:
```
const rateLimitDoc = await rateLimitRef.get();  // read
// check count...
await rateLimitRef.set({ requests: [...recentRequests, now], ... });  // write (separate op)
```
Two concurrent requests can both read the same document state before either has written the updated timestamp array. Both will see `recentRequests.length < RATE_LIMIT` and both will proceed. The race window is small but real under high concurrency. All other rate-limited functions avoid this by using `db.runTransaction()`.
**Note:** The `searchUsers` rate-limiting approach uses a rolling window (array of timestamps) rather than the count+windowStart pattern, which also has the issue of unbounded array growth if the TTL filtering fails.
**Recommendation:** Wrap the rate-limit check and update in a `db.runTransaction()` call, matching the pattern in `aiGenerateHint.ts:354–378`.

### FINDING RL-2: Rate limit documents are never cleaned up
**Files:** All functions with `rateLimits` collection writes
**Severity:** Low
**Description:** The `rateLimits` collection grows indefinitely — one document per user per rate-limited function. For `searchUsers`, each document contains a `requests` array that could grow to 10 entries (at most 10 timestamps from the past minute), which is fine. However, none of the `rateLimits` documents have a TTL configured via Firestore TTL policies. Over time this creates a large, unbounded collection.
**Recommendation:** Set a Firestore TTL on the `rateLimits` collection (e.g., `updatedAt` + 7 days) to automatically expire stale documents.

---

## 5. Webhook Security

### ✅ Full Pass — No Findings

| Check | Status |
|---|---|
| `stripe-signature` header verified before any processing (`stripeWebhook.ts:35–54`) | ✅ |
| `req.rawBody` used for signature verification (not parsed body) | ✅ |
| STRIPE_WEBHOOK_SECRET via `defineSecret()` — not hardcoded | ✅ |
| Signature failure returns 400 (Stripe will not retry) | ✅ |
| Unknown event types fall through to `200 OK` (Stripe best practice) | ✅ |
| `payment_intent.payment_failed` idempotency check before writing notification | ✅ |
| `webhookFailures` collection uses `event.id` as document ID for atomic increment | ✅ |

---

## 6. Scheduled Function Robustness

### ✅ Per-user/per-goal failures are isolated
All scheduled functions wrap per-item operations in try/catch blocks, allowing one user's failure to not abort the rest of the run. Atomic batch commits pair notification creation with dedup-stamp writes.

### FINDING SR-1: All scheduled functions use unbounded Firestore queries
**Files:** `checkUnstartedGoals.ts:31–35`, `sendSessionReminders.ts:33–37`, `sendInactivityNudges.ts:37–41`, `sendWeeklyRecap.ts:59–63`
**Severity:** Medium
**Description:** Four of five scheduled functions execute collection-level queries with no `limit()` clause:
- `checkUnstartedGoals`: `.where("weekStartAt", "==", null).where("isCompleted", "==", false).get()` — all unstarted goals
- `sendSessionReminders`: `.where("profile.reminderEnabled", "==", true).get()` — all enabled users
- `sendInactivityNudges`: `.where("isCompleted", "==", false).where("weekStartAt", "!=", null).get()` — all active goals
- `sendWeeklyRecap`: `.where("isCompleted", "==", false).get()` — all active goals

Cloud Functions have a 540-second timeout (9 minutes). At 100k+ documents, these queries risk OOM errors or timeout. `sendSessionReminders` additionally issues per-user goal queries inside the user loop (N+1 pattern). `sendBookingReminders` is partially protected by a 30-day time window.
**Recommendation:** Implement cursor-based pagination using `.orderBy('createdAt').startAfter(lastDoc).limit(500)` in a while loop. Alternatively, use Firestore batch processing or migrate to a fan-out architecture where each user is processed by a queued Cloud Task.

### FINDING SR-2: `sendSessionReminders` has an N+1 query inside user loop
**File:** `sendSessionReminders.ts:96–101`
**Severity:** Medium
**Description:** For each user with reminders enabled (potentially thousands), the function executes a separate Firestore query: `db.collection("goals").where("userId", "==", userDoc.id).where("isCompleted", "==", false).get()`. This is an N+1 query pattern. For 1,000 users, this is 1,001 Firestore reads per scheduled invocation. At 10,000 users, this hits Firestore's per-second operation limits and will start seeing `RESOURCE_EXHAUSTED` errors.
**Recommendation:** Prefetch all relevant goals in a single query (group by userId client-side using a Map), similar to how `sendWeeklyRecap` already does this correctly at lines 67–77.

---

## 7. Trigger Edge Cases

### ✅ `chargeDeferredGift` — comprehensive edge case handling
- Rapid concurrent completion events: atomic `processing` claim ✅
- Shared gift with `partnerGoalId` missing: explicit guard and skip ✅
- Partner goal deleted between setup and completion: marks `payment: 'failed'` with reason ✅
- Expired gift: expiry check before charge attempt, notifies both parties ✅
- Firestore update failure after successful Stripe charge: 3-retry loop + `failedCharges` record for `retryFailedCharges` ✅
- SetupIntent with no payment method: user notified, function returns cleanly ✅
- Zero `deferredAmount`: treated as free (gift marked paid without charging) ✅

### ✅ `onNotificationCreated` — correct at-least-once handling
- `pushSentAt` guard prevents duplicate FCM sends on retry ✅
- Missing `userId` exits cleanly ✅
- Invalid FCM tokens cleaned up from user document ✅

### FINDING TE-1: `chargeDeferredGift` `payment_failed` idempotency depends on external state
**File:** `triggers/chargeDeferredGift.ts:580–621`
**Severity:** Low
**Description:** The outer `catch` block (line 580) that sends `payment_failed` notifications to the giver does not check for duplicate notification delivery. If the trigger crashes after the Stripe charge failure notification is written but before the function returns null, the platform will retry, potentially sending a second `payment_failed` notification to the giver. This is an at-least-once delivery gap — the `payment_failed` notification writer at the bottom of the function lacks the idempotency guard that the `shared_unlock` notification path has.
**Real-world impact:** Low — the giver receiving two "payment failed" push notifications is inconvenient but not harmful.
**Recommendation:** Check whether a `payment_failed` notification with the same `giftId` already exists before creating a new one, or add a `chargeFailureNotified` flag to the gift document.

---

## 8. CORS

### FINDING CORS-1: `cors.ts` always includes `localhost` origins regardless of environment
**File:** `cors.ts:26`
**Severity:** Medium
**Description:** The comment on line 24 states "Dev origins (localhost) are always included", but the `isEmulator` variable defined on line 21 is never actually used to gate them. The exported `allowedOrigins` array always contains `http://localhost:8081` and `http://localhost:3000` in production. While this does not bypass Firebase Auth token verification (which provides the real security), it does mean that any browser on the user's local machine (e.g., a localhost-served malicious page) can make cross-origin requests to production `onCall` functions with valid CORS headers. This is an unnecessary expansion of the attack surface.
**Recommendation:** Change line 26 to conditionally include dev origins:
```ts
export const allowedOrigins: string[] = isEmulator
  ? [...DEV_ORIGINS, ...PRODUCTION_ORIGINS]
  : [...PRODUCTION_ORIGINS];
```

### FINDING CORS-2: HTTP functions use inconsistent CORS origin lists
**Files:** `stripeCreatePaymentIntent.ts:24–29`, `createFreeGift.ts:27–33`, `createDeferredGift.ts:32–38`, `updatePaymentIntentMetadata.ts:18–23`
**Severity:** Low
**Description:** These four HTTP functions define their own inline CORS lists restricted to `["https://ernit.app", "https://www.ernit.app"]` rather than importing the shared `allowedOrigins` from `cors.ts`. This means they do not allow `https://ernitpartner.vercel.app`, `https://teams.ernit.app`, or the other production origins listed in `cors.ts`. `deleteGoal.ts` correctly uses the shared `allowedOrigins` from `cors.ts`.
**Note:** The stricter list is actually more secure for payment-critical functions. However, if the partner portal at `ernitpartner.vercel.app` ever needs to call these functions from the browser, it will fail silently with a CORS error. The inconsistency is also a maintenance hazard.
**Recommendation:** Document the intentional narrowing in a comment, or consolidate CORS origin management into `cors.ts` with named export sets (e.g., `paymentOrigins`, `allOrigins`).

---

## 9. Secrets

### ✅ Full Pass — No Findings

| Secret | Management | Status |
|---|---|---|
| `STRIPE_SECRET_KEY` | `defineSecret()` | ✅ |
| `STRIPE_WEBHOOK_SECRET` | `defineSecret()` | ✅ |
| `GENERAL_EMAIL_USER` / `GENERAL_EMAIL_PASS` | `defineSecret()` | ✅ |
| `EMAIL_USER` / `EMAIL_PASS` | `defineSecret()` | ✅ |
| `OPENROUTER_KEY` / `OPENROUTER_MODEL` | `defineSecret()` | ✅ |
| `LLM_PROVIDER` | `defineSecret()` | ✅ |
| No hardcoded credentials, tokens, or API keys found in any file | — | ✅ |
| B2B functions access `ernitxfi` via named database parameter, not a connection string | — | ✅ |

---

## Consolidated Findings Table

| ID | Category | File(s) | Severity | Description |
|---|---|---|---|---|
| IV-1 | Input Validation | `createFreeGift.ts:326`, `createDeferredGift.ts:385`, `b2bInviteEmployee.ts:30` | Low | Weak `includes('@')` email validation |
| IV-2 | Input Validation | `stripeCreatePaymentIntent.ts:202,205` | Low | `giverName` / `personalizedMessage` unvalidated before Stripe metadata |
| IV-3 | Input Validation | `b2bInviteEmployee.ts` | Low | No rate limit on invitations |
| IV-4 | Input Validation | `deleteGoal.ts`, `updatePaymentIntentMetadata.ts` | Low | No rate limit; `updatePaymentIntentMetadata` makes unbounded Stripe calls |
| EH-1 | Error Handling | `b2bGoalMilestone.ts:109` | Low | Uncaught `batch.commit()` failure → noisy retry errors |
| EH-2 | Error Handling | `chargeDeferredGift.ts:479` | Low | `recipientId` in `failedCharges` uses wrong field (`freshGiftData.userId` is always null) |
| ID-1 | Idempotency | `createFreeGift.ts`, `createDeferredGift.ts` | **Medium** | No idempotency key → network retries create duplicate gifts |
| RL-1 | Rate Limiting | `searchUsers.ts:48–73` | **Medium** | Non-transactional rate limit check is TOCTOU-vulnerable |
| RL-2 | Rate Limiting | All `rateLimits` collection writers | Low | Rate limit documents never cleaned up (unbounded collection growth) |
| SR-1 | Scheduled Robustness | 4 scheduled functions | **Medium** | Unbounded Firestore queries risk OOM/timeout at scale |
| SR-2 | Scheduled Robustness | `sendSessionReminders.ts:96–101` | **Medium** | N+1 per-user goal query inside user loop |
| TE-1 | Trigger Edge Case | `chargeDeferredGift.ts:580–621` | Low | `payment_failed` notification path lacks at-least-once idempotency guard |
| CORS-1 | CORS | `cors.ts:26` | **Medium** | `localhost` origins always included in production (unused `isEmulator` flag) |
| CORS-2 | CORS | 4 HTTP functions | Low | Inconsistent CORS origin lists across HTTP functions |

---

## Priority Remediation Order

1. **ID-1** — Idempotency key for `createFreeGift`/`createDeferredGift` (user-visible bug: duplicate gifts on retry)
2. **SR-1** — Paginate unbounded scheduled queries (availability risk at scale)
3. **RL-1** — Transactionalize `searchUsers` rate limit (TOCTOU race)
4. **CORS-1** — Remove localhost from production CORS origins
5. **SR-2** — Eliminate N+1 in `sendSessionReminders`
6. **EH-2** — Fix `recipientId` field in `failedCharges` (data integrity)
7. **IV-1** — Upgrade email validation to regex
8. All Low severity findings can be addressed in a maintenance sweep
