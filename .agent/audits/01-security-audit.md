# Security Audit Report
**Generated:** 2026-03-29T00:00:00Z
**Auditor:** Claude Scheduled Task (claude-sonnet-4-6)

## Summary
- CRITICAL: 0
- HIGH: 1
- MEDIUM: 4
- LOW: 3
- INFORMATIONAL: 2
- Total findings: 10

---

## Findings

### [HIGH] ExperienceGifts Collection — Unenforced List Filter Allows Claim Code Enumeration

- **File:** `firestore.rules` (line 486)
- **Category:** Firestore Rules
- **Description:** The `experienceGifts` collection `list` rule allows any authenticated user to list documents with no ownership filter. Only a `limit <= 10` guard is applied. A malicious authenticated user can paginate through all gift documents using repeated queries with `startAfter()`, exposing claim codes, personalized messages, Stripe payment intent IDs, and Stripe customer IDs for all gifts.
- **Evidence:**
  ```
  allow list: if request.auth != null && request.query.limit <= 10;
  ```
  The `get` rule (lines 492–494) correctly restricts by `giverId`/`recipientId`, but the `list` rule has no such filter.
- **Impact:** A malicious authenticated user can enumerate all unclaimed gift claim codes and redeem gifts sent to other recipients, effectively stealing gifts. Stripe `paymentIntentId` and `stripeCustomerId` fields are also exposed, though they are not directly actionable on their own.
- **Suggested Fix:** Add a filter requirement to the list rule:
  ```
  allow list: if request.auth != null
    && request.query.limit <= 10
    && (request.auth.uid == resource.data.giverId
        || request.auth.uid == resource.data.recipientId);
  ```
  Alternatively, require all queries to filter by `giverId == request.auth.uid` or `claimCode == <known code>` (which is already the client-side behavior). Firestore rules can enforce `request.query.filters` in some configurations, but the simpler and safer fix is restricting to `resource.data.giverId == request.auth.uid` style. Since list rules cannot inspect `resource.data` for individual documents, the best approach is a Cloud Function proxy for claim lookups.
- **False Positive Check:** Confirmed real. The `allow list` rule at line 486 has no ownership check. The `allow get` rule at lines 492–494 has an ownership check, but `list` queries are evaluated separately and do not inherit the `get` restriction.

---

### [MEDIUM] Goals Collection — All Goal Data Readable by Any Authenticated User

- **File:** `firestore.rules` (line 149)
- **Category:** Firestore Rules
- **Description:** Any authenticated user can read any goal document by ID (get by ID AND list queries). The rule comment acknowledges this is required for feed, friend profiles, partner progress, and notifications. However, goals contain sensitive fields: `personalizedNextHint`, `approvalStatus`, `giverMessage`, `sessionHours`, and linked payment info.
- **Evidence:**
  ```
  allow read: if request.auth != null;
  ```
- **Impact:** A curious user can read goal details of any other user they know the goalId of (obtainable via feed posts which expose `goalId`). `personalizedNextHint` (the surprise hint) is readable, defeating the surprise element for any user who looks it up.
- **Suggested Fix:** Consider field-level masking via a Cloud Function or use field transforms. At minimum, move `personalizedNextHint` to a separate subcollection with tighter read rules (giver can write, recipient can read by ID only).
- **False Positive Check:** Confirmed intentional design decision but represents a meaningful privacy/surprise-defeating risk.

---

### [MEDIUM] partnerUsers Collection — PII Readable by All Authenticated Users

- **File:** `firestore.rules` (lines 68–71)
- **Category:** Firestore Rules
- **Description:** The `allow get: if request.auth != null` rule allows any authenticated user to fetch any `partnerUser` document. The comment acknowledges "Exposes partner PII to all authenticated users." Partner documents may include email addresses, billing information, or other sensitive fields.
- **Evidence:**
  ```
  allow get: if request.auth != null;
  // NOTE: Exposes partner PII to all authenticated users.
  ```
- **Impact:** Any authenticated regular user can look up partner company PII (email, name, billing details) by partner UID. If an attacker knows or can enumerate partner UIDs (e.g., from experience documents which contain `partnerId`), they can exfiltrate partner contact info.
- **Suggested Fix:** Create a public-facing `partnerProfiles` subcollection containing only display-safe fields (name, logo, public description). Restrict reads of the full `partnerUsers` doc to `request.auth.uid == partnerId || isAdmin(request.auth.uid)`. Use a Cloud Function to fetch partner data for client-side experience display.
- **False Positive Check:** Confirmed real. `partnerId` is stored in `experiences` documents which are publicly readable. Any authenticated user can cross-reference to get full partner PII.

---

### [MEDIUM] Users Collection — Email Addresses Readable by All Authenticated Users

- **File:** `firestore.rules` (line 32)
- **Category:** Firestore Rules
- **Description:** Any authenticated user can read any other user's full document, which includes the `email` field.
- **Evidence:**
  ```
  allow read: if request.auth != null;
  ```
- **Impact:** User email addresses are exposed to all authenticated users. A malicious user could harvest email addresses of all platform users for spam or phishing. The `searchUsers` Cloud Function intentionally omits email from results, but a direct Firestore SDK client bypasses this.
- **Suggested Fix:** Remove `email` from user documents or move it to a private subcollection. Store only a hashed email for deduplication if needed. Display names and profile images needed by social features do not require exposing raw email.
- **False Positive Check:** Confirmed. The `users` collection is list-readable by any authenticated user and `email` is stored at the top level.

---

### [LOW] CORS Configuration — Localhost Origins Always Included in Production

- **File:** `functions/src/cors.ts` (lines 15–26)
- **Category:** CORS
- **Description:** The `allowedOrigins` export always includes `http://localhost:8081` and `http://localhost:3000`, regardless of environment. The comment states these "cannot be spoofed remotely," which is true for server-to-server attacks, but CORS is a browser control. A developer with local malware running on port 8081/3000 could make cross-origin requests to production Cloud Functions.
- **Evidence:**
  ```typescript
  const DEV_ORIGINS = [
    "http://localhost:8081",
    "http://localhost:3000",
  ];
  /** Dev origins (localhost) are always included... */
  export const allowedOrigins: string[] = [...DEV_ORIGINS, ...PRODUCTION_ORIGINS];
  ```
- **Impact:** Low practical risk because all affected Cloud Functions (onCall type) still require valid Firebase Auth tokens. CORS bypass alone does not allow unauthorized access. Risk only materializes if a developer machine is compromised.
- **Suggested Fix:**
  ```typescript
  export const allowedOrigins: string[] = isEmulator
    ? [...DEV_ORIGINS, ...PRODUCTION_ORIGINS]
    : PRODUCTION_ORIGINS;
  ```
  Note: `stripeCreatePaymentIntent`, `createFreeGift`, `createDeferredGift`, `updatePaymentIntentMetadata`, and `deleteGoal` all use their own hardcoded allowedOrigins (only `https://ernit.app`) and are **not** affected by this issue — they are already correctly restricted.
- **False Positive Check:** Confirmed. The shared `cors.ts` is only used by `onCall` functions (searchUsers, aiGenerateHint, sendContactEmail, createExperience, updateExperience, deleteExperience, b2b* functions). All require auth tokens, so practical risk is low.

---

### [LOW] searchUsers Cloud Function — Non-Atomic Rate Limiting (TOCTOU)

- **File:** `functions/src/searchUsers.ts` (lines 48–73)
- **Category:** Input Validation
- **Description:** The `searchUsers` function's rate limiting uses a non-atomic read-check-write pattern. Two concurrent requests could both read the rate limit document before either writes the updated count, both passing the rate limit check and both appending to the requests array.
- **Evidence:**
  ```typescript
  const rateLimitDoc = await rateLimitRef.get(); // read
  if (recentRequests.length >= RATE_LIMIT) throw; // check
  await rateLimitRef.set({ requests: [...recentRequests, now] }); // write (non-atomic)
  ```
  Compare with the atomic pattern in `stripeCreatePaymentIntent`, `createFreeGift`, etc., which all use `db.runTransaction()`.
- **Impact:** A user could exceed the 10-searches-per-minute limit under concurrent load by making multiple simultaneous requests. The `searchUsers` function scans 500 user documents per call, so burst bypass could enable minor data scraping (user names, profile images, countries).
- **Suggested Fix:** Wrap the rate limit check and write in `db.runTransaction()`, matching the pattern used in all other rate-limited functions.
- **False Positive Check:** Confirmed. The function uses `get()` + `set()` without a transaction. All other rate-limited functions in the codebase use `runTransaction()` for this exact reason.

---

### [LOW] Storage Rules — Hints and Motivations Readable by Any Authenticated User

- **File:** `storage.rules` (lines 22, 36)
- **Category:** Firestore Rules / Storage
- **Description:** Any authenticated user can read files in `hints/{userId}/` and `motivations/{userId}/` paths. The comment notes "URLs are only shared with recipient," relying on URL obscurity for access control.
- **Evidence:**
  ```
  match /hints/{userId}/{allPaths=**} {
    allow read: if request.auth != null; // any authenticated user
  ```
- **Impact:** If a hint file URL is exposed (e.g., via Firestore goal data, network traffic, or Firebase Storage console), any authenticated user can download it. For secret/mystery gifts, this could reveal the surprise (audio or image hints) to unintended users.
- **Suggested Fix:** Restrict reads to the goal recipient and giver:
  ```
  allow read: if request.auth != null
    && (request.auth.uid == userId  // giver owns this path
        || exists hint linking to this user's goal for recipient);
  ```
  Or use signed URLs with short expiry generated server-side (Cloud Function) for hint delivery.
- **False Positive Check:** Confirmed. The `hints/` path allows reads to any authenticated user at line 22. Requires knowing the storage path, but paths may be constructible from Firestore data.

---

### [INFORMATIONAL] Stripe Functions Use Local CORS Arrays Instead of Shared cors.ts

- **File:** `functions/src/stripeCreatePaymentIntent.ts` (lines 24–28), `functions/src/createFreeGift.ts` (lines 27–33), `functions/src/createDeferredGift.ts` (lines 32–38), `functions/src/updatePaymentIntentMetadata.ts` (lines 18–22), `functions/src/deleteGoal.ts` (line 18)
- **Category:** CORS
- **Description:** Payment and financial functions define their own restricted `allowedOrigins` arrays (`["https://ernit.app", "https://www.ernit.app"]`) rather than using the shared `cors.ts`. This is actually more restrictive than the shared config and is **intentional behavior**.
- **Evidence:**
  ```typescript
  const allowedOrigins: string[] = [
    "https://ernit.app",
    "https://www.ernit.app",
  ];
  ```
- **Impact:** None — this is correct and secure. However, it means these functions cannot be called from the partner portal or other allowed domains. Confirm this is intentional and document it.
- **Suggested Fix:** Add a comment explaining why these functions intentionally use a stricter subset. Consider a `PAYMENT_ORIGINS` constant in `cors.ts` for consistency.

---

### [INFORMATIONAL] Email Subject Line Uses HTML Escaping in Plain-Text Context

- **File:** `functions/src/sendContactEmail.ts` (line 204)
- **Category:** Input Validation
- **Description:** The email `subject` field uses `escapeHtml()` (correct for HTML body) but also applies HTML escaping to the email subject header, which is a plain-text field. This would cause subjects containing `<` to display as `&lt;` in email clients.
- **Evidence:**
  ```typescript
  subject: `[${type.toUpperCase()}] ${escapeHtml(subject)}`,
  ```
- **Impact:** Minor display issue — no security impact. Email subject injection is prevented by length validation (`subject.length > 200` check at line 121).
- **Suggested Fix:** Use a plain-text sanitizer for the subject (trim, limit length, strip control characters) rather than HTML escaping.

---

## Positives Noted

The following security controls were found to be well-implemented:

1. **Stripe Webhook Signature Verification** — `stripeWebhook.ts` uses `stripe.webhooks.constructEvent()` with a server-side secret. Signatures are verified before any processing. ✅
2. **Server-Side Price Validation** — `stripeCreatePaymentIntent.ts` fetches experience prices from Firestore and compares to client-sent amount. Client cannot manipulate payment amounts. ✅
3. **Auth Token Verification** — All `onRequest` Cloud Functions verify Firebase ID tokens via `admin.auth().verifyIdToken()`. No endpoint trusts client-supplied user IDs without verification. ✅
4. **Rate Limiting** — All high-value operations (payment creation, gift creation, AI hints, search, contact emails) have per-user rate limits. Most use atomic transactions. ✅
5. **Idempotency Guards** — Stripe webhook processing uses a `processedPayments` collection to prevent double-processing. `chargeDeferredGift` uses a `processing` state lock. ✅
6. **Input Sanitization Coverage** — Most services importing sanitization functions: GoalService, UserService, FeedService, CommentService, MotivationService, ReactionService, FriendService. ✅
7. **No Hardcoded Secrets** — No API keys, passwords, or tokens found hardcoded in `.ts`/`.tsx` files. Firebase config uses env vars via `EXPO_PUBLIC_*`. ✅
8. **.gitignore Coverage** — `.env`, `google-services.json`, `serviceAccountKey.json`, `play-store-service-account.json` are all ignored. ✅
9. **No eval() / innerHTML / dangerouslySetInnerHTML** — None found in the client codebase. ✅
10. **Protected Routes** — All sensitive app routes are wrapped in `ProtectedRoute` component. The `PROTECTED_ROUTES` array in `AppNavigator.tsx` is comprehensive. ✅
11. **Firestore Rules Field Validation** — Goals update rules validate numeric ranges (`targetCount`, `sessionsPerWeek`, `weeklyCount`) and prevent direct `isCompleted` manipulation. ✅
12. **Coupon Replay Prevention** — The coupon `status` field has a forward-only transition rule (`active → redeemed` is allowed, `redeemed → active` is blocked). ✅

---

## Files Audited

**Auth & Firebase:**
- `src/services/firebase.ts` (via context of other files — not read directly; service referenced in AppContext and AuthGuardContext)
- `src/config/firebaseConfig.ts`
- `src/context/AppContext.tsx`
- `src/context/AuthGuardContext.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/navigation/AppNavigator.tsx`
- `src/screens/AuthScreen.tsx` (first 100 lines)

**Sanitization & Rules:**
- `src/utils/sanitization.ts`
- `firestore.rules` (all 500+ lines across 3 reads)
- `storage.rules`

**Cloud Functions:**
- `functions/src/index.ts`
- `functions/src/cors.ts`
- `functions/src/stripeWebhook.ts`
- `functions/src/stripeCreatePaymentIntent.ts`
- `functions/src/createFreeGift.ts`
- `functions/src/createDeferredGift.ts`
- `functions/src/sendContactEmail.ts`
- `functions/src/searchUsers.ts`
- `functions/src/aiGenerateHint.ts`
- `functions/src/deleteGoal.ts`
- `functions/src/retryFailedCharges.ts`
- `functions/src/updatePaymentIntentMetadata.ts`
- `functions/src/createExperience.ts`
- `functions/src/updateExperience.ts`
- `functions/src/triggers/chargeDeferredGift.ts`
- `functions/src/triggers/onNotificationCreated.ts`
- `functions/src/b2bCreateCompany.ts`
- `functions/src/b2bAcceptInvite.ts`
- `functions/src/b2bLogSession.ts`
- `functions/src/b2bGoalMilestone.ts`

**Client Services (sampled):**
- `src/services/GoalService.ts` (first 100 lines)
- `src/services/userService.ts` (first 100 lines)
- `src/services/CommentService.ts`
- `src/services/FeedService.ts` (first 60 lines)
- `src/services/GoalSessionService.ts` (first 130 lines)
- `src/services/MotivationService.ts` (first 60 lines)
- `src/services/stripeService.ts` (first 30 lines)

**Sanitization grep across all services** — identified 11 services importing sanitization functions.

**Config:**
- `app.config.js`
- `.gitignore` (relevant lines)
