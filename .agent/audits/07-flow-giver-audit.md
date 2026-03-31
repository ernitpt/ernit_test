# Giver-Side Flow Logic Audit Report
**Generated:** 2026-03-29
**Auditor:** Claude Agent

## Summary
- CRITICAL: 3
- HIGH: 5
- MEDIUM: 5
- LOW: 3
- Total findings: 16

---

## Findings

### [CRITICAL] F1 — Category-only Together path sends request that will always fail (400)

- **File:** `src/screens/GiftFlowScreen.tsx` (lines 623-670) / `functions/src/createFreeGift.ts` (lines 91-94)
- **Category:** Free Gift Flow
- **Description:** When a giver selects "Together" challenge type and picks a reward *category* instead of a specific experience, the client calls `createFreeGift` with `preferredRewardCategory` but **no `experienceId`**. The server function validates `experienceId` at line 91 (`if (!experienceId || typeof experienceId !== 'string' || experienceId.length > 128)`) and returns HTTP 400. The entire "Surprise Me" category path for Together challenges is broken.
- **Evidence:** Client sends `{ challengeType: 'shared', preferredRewardCategory, ... }` (GiftFlowScreen line 634). Server destructures `experienceId` from `req.body` (createFreeGift line 69) but the client never sends it in this code path. Server validation at line 91 rejects the request.
- **Impact:** Users who choose the category-only Together flow always get "Failed to create challenge" error. The entire "surprise them with a category" feature is non-functional.
- **Suggested Fix:** Either (a) make `experienceId` optional in `createFreeGift` when `preferredRewardCategory` is provided, storing the category preference on the gift doc instead of a snapshot, or (b) have the client pick a random experience from the category before calling the function.
- **False Positive Check:** Confirmed by tracing the exact request body composition at GiftFlowScreen line 633-644 against server validation at createFreeGift line 91-94. No `experienceId` is included.

---

### [CRITICAL] F2 — "Pay Now" path for shared/together challenges loses all challenge metadata

- **File:** `src/screens/GiftFlowScreen.tsx` (lines 678-693), `src/screens/giver/ExperienceCheckoutScreen.tsx` (line 541), `functions/src/stripeCreatePaymentIntent.ts` (lines 199-208), `functions/src/stripeWebhook.ts` (lines 260-330)
- **Category:** Paid Gift Flow / Together Mode
- **Description:** When a giver selects "Together" + "Pay Now", GiftFlowScreen passes `challengeType`, `revealMode`, `goalName`, `goalType`, and `sameExperienceForBoth` to ExperienceCheckoutScreen via route params (line 683-691). However, ExperienceCheckoutScreen only extracts `cartItems`, `goalId`, and `isMystery` (line 541). The challenge metadata is silently dropped. The `stripeCreatePaymentIntent` function only stores `giverId`, `giverName`, `cart`, `personalizedMessage`, and `isMystery` in the PaymentIntent metadata. The webhook creates gifts without `challengeType`, `revealMode`, or `togetherData`. No giver goal is created. The shared challenge is silently downgraded to a solo gift.
- **Evidence:** ExperienceCheckoutScreen route params type: `{ cartItems?: CartItem[]; goalId?: string; isMystery?: boolean }` (line 541). The `as never` cast at GiftFlowScreen line 692 explicitly bypasses type checking for the extra params. The TODO comment on the same line acknowledges this: `"TODO: ExperienceCheckout route type needs to accept these params - tracked as tech debt"`.
- **Impact:** Giver pays real money expecting a shared challenge. The gift created has no together data, no giver goal is created, and the recipient gets a solo gift. Money is collected but the product promise (shared challenge) is not delivered.
- **Suggested Fix:** ExperienceCheckoutScreen must read `challengeType`, `revealMode`, `goalName`, `goalType`, and other together-mode params from route params. These must be embedded in the PaymentIntent metadata so the webhook can create the gift with proper `togetherData` and atomically create the giver goal.
- **False Positive Check:** Verified that `stripeWebhook.ts` contains zero references to `challengeType`, `revealMode`, or `togetherData`. The `as never` cast and TODO comment confirm this is known tech debt.

---

### [CRITICAL] F3 — Deferred gift for shared challenge: giver goal missing `goalType` field

- **File:** `functions/src/createDeferredGift.ts` (lines 74-86, 323-357)
- **Category:** Deferred Gift Flow / Together Mode
- **Description:** `createDeferredGift` destructures `goalName`, `duration`, `frequency`, `sessionTime`, `sameExperienceForBoth` from `req.body` but NOT `goalType` or `customGoalText`. The giver goal is always created with `type: 'custom'` (line 329). In contrast, `createFreeGift` correctly destructures and uses `goalType` (line 81). When the giver selects "Gym" or "Yoga" as the goal type, the deferred path loses this information and the giver goal displays as a generic "custom" challenge.
- **Evidence:** `createDeferredGift` body destructuring (lines 74-86) is missing `goalType` and `customGoalText`. The giver goal data at line 329 hardcodes `type: 'custom'`. Compare with `createFreeGift` which correctly uses `goalType` at line 81 and passes it to the goal data.
- **Impact:** Giver's goal shows incorrect type (always "custom") even when they selected Gym/Yoga/Dance. This is a data integrity issue that affects goal display, analytics, and future category-based features.
- **Suggested Fix:** Add `goalType` and `customGoalText` to the destructured body fields in `createDeferredGift`. Pass `goalType` to the giver goal data instead of hardcoding `'custom'`.
- **False Positive Check:** Confirmed by comparing the destructured fields in `createDeferredGift` (lines 74-86) with `createFreeGift` (lines 69-83). `goalType` is present in the latter but absent from the former.

---

### [HIGH] F4 — Double-submit protection not fully restored on error in GiftFlowScreen

- **File:** `src/screens/GiftFlowScreen.tsx` (lines 591-758)
- **Category:** Wizard State
- **Description:** The `confirmCreateGoal` function uses both `submittingRef.current` (synchronous guard) and `isSubmitting` (state). On successful completion (any path), `submittingRef.current` is reset in the `finally` block (line 757). However, on the "payLater with missing setupIntentClientSecret" path (lines 739-742), the function returns early with `showError` but does NOT reset `submittingRef.current = false`. The `finally` block does reset it, but the `isSubmitting` state is set to `true` at line 613 and the `finally` block at line 756 sets it to `false`. The real issue: if the "payNow" path succeeds (line 693 returns early), the `finally` block at line 756-757 never runs because the early return exits the `try` block before reaching `finally`. This means `isSubmitting` stays `true` and `submittingRef.current` stays `true` if the user navigates back.
- **Evidence:** Line 693: `return;` inside the try block exits the function after successful payNow navigation. But `finally` blocks DO run after `return` in JavaScript, so this is actually fine. However, line 670 (`return;`) for the category path is the same. Both `return` statements inside `try` will trigger `finally`. This finding is downgraded upon re-analysis -- the `finally` block does run. The actual issue is narrower: on the error catch path (line 754), `submittingRef.current = false` is set, then the `finally` block (line 757) redundantly sets it again. No actual bug, but the `giftCreatedRef.current = true` at line 655 prevents the discard alert, and then if the user navigates back to GiftFlowScreen, the screen state would be stale.
- **Evidence (revised):** After the "payNow" path at line 680, `giftCreatedRef.current = true` is set and the user navigates away. If they press back (hardware), `useBeforeRemove` skips the alert because `giftCreatedRef.current` is true. But the gift was NOT yet created (only navigated to ExperienceCheckout). If the user then abandons ExperienceCheckout, they return to GiftFlowScreen with `giftCreatedRef.current = true`, meaning the discard guard is disabled. They can navigate away without warning, losing their wizard state.
- **Impact:** After navigating to ExperienceCheckout and then going back, the user can leave GiftFlowScreen without the "Discard changes?" prompt, losing their progress silently.
- **Suggested Fix:** Only set `giftCreatedRef.current = true` after the gift is actually confirmed/created (in the payLater and free paths), not when merely navigating to ExperienceCheckout for payNow.
- **False Positive Check:** Confirmed: `giftCreatedRef.current = true` is set at line 680 before navigating to ExperienceCheckout, which is before payment is completed.

---

### [HIGH] F5 — Deferred shared challenge: `togetherData` missing `goalType` field

- **File:** `functions/src/createDeferredGift.ts` (lines 288-296)
- **Category:** Together Mode
- **Description:** The `togetherData` object on the deferred gift document is missing the `goalType` field. Compare with `createFreeGift` which includes `goalType` (line 250). When the recipient claims the gift, the `togetherData.goalType` field is used to configure their goal. Missing this field means the recipient's goal type defaults to an unknown/empty value.
- **Evidence:** `createDeferredGift` lines 289-296 create `togetherData` with: `goalName`, `duration`, `frequency`, `sessionTime`, `sameExperienceForBoth`. But NOT `goalType`. `createFreeGift` lines 245-252 include `goalType: goalType || "custom"`.
- **Impact:** Recipients of deferred shared challenges may see incorrect goal type when claiming the gift. Goal type information is lost for deferred gifts.
- **Suggested Fix:** Add `goalType: sanitize(req.body.goalType, 50) || 'custom'` to the `togetherData` object in `createDeferredGift`.
- **False Positive Check:** Direct comparison of the two function implementations confirms the discrepancy.

---

### [HIGH] F6 — Webhook gift creation does not include `revealMode` or `challengeType`

- **File:** `functions/src/stripeWebhook.ts` (lines 260-330)
- **Category:** Paid Gift Flow / Mystery/Reveal Mode
- **Description:** When the webhook creates gifts after successful payment, it sets `isMystery: metadata.isMystery === "true"` (line 321) but does NOT set `challengeType` or `revealMode` on the gift document. Gifts created via the "Pay Now" path will have `isMystery` but no `revealMode` or `challengeType`. This means the recipient's experience of the gift (revealed vs. secret, solo vs. shared) is not reliably determined from the gift document.
- **Evidence:** The `newGift` object in `stripeWebhook.ts` (lines 308-325) contains `isMystery` but no `challengeType` or `revealMode` fields. These fields ARE present in gifts created by `createFreeGift` (lines 225-227) and `createDeferredGift` (lines 271-273).
- **Impact:** Gifts purchased via the "Pay Now" (Stripe checkout) path are missing classification fields. Any downstream logic that checks `gift.challengeType` or `gift.revealMode` will get `undefined`. The `isMystery` boolean is set but `revealMode` is not, creating an inconsistency.
- **Suggested Fix:** Add `challengeType` and `revealMode` to the PaymentIntent metadata in `stripeCreatePaymentIntent` (requires passing from client), then read them in the webhook and set them on the gift document.
- **False Positive Check:** Grep for `challengeType` and `revealMode` in `stripeWebhook.ts` returns zero results.

---

### [HIGH] F7 — `chargeDeferredGift` shared unlock uses non-atomic batch after successful charge

- **File:** `functions/src/triggers/chargeDeferredGift.ts` (lines 505-515)
- **Category:** Together Mode / Deferred Gift Flow
- **Description:** After the deferred charge succeeds for a shared challenge, the code unlocks both goals using a batch write (lines 506-515). However, this batch is NOT inside a transaction. If it fails (network error, Firestore timeout), the charge has already been collected but the goals remain locked. There is no retry mechanism for this batch. The notification sending also uses a separate batch (lines 539-562) that is independent of the goal unlock.
- **Evidence:** Lines 506-515 use `db.batch()` for goal unlocking (not `db.runTransaction()`). Lines 539-562 use a separate `db.batch()` for notifications. If either fails, the other may have already committed. Compare with the free shared path (lines 165-185) which correctly uses a transaction for atomicity.
- **Impact:** If the goal unlock batch fails after successful charge, the giver is charged but both goals remain locked. Users have no way to unlock manually. Requires manual database intervention.
- **Suggested Fix:** Wrap the goal unlock in a transaction with retry, similar to the free shared path. If it fails after 3 retries, write to a `failedUnlocks` collection for manual reconciliation.
- **False Positive Check:** The free shared path (lines 165-185) correctly uses `db.runTransaction()` for the same operation. The deferred path does not.

---

### [HIGH] F8 — Cart checkout path: no atomicity across multiple gift documents

- **File:** `functions/src/stripeWebhook.ts` (lines 205-342)
- **Category:** Paid Gift Flow
- **Description:** When a cart checkout with multiple items succeeds, the webhook creates all gift documents inside a single Firestore transaction (line 205). This provides atomicity. However, the experience documents are fetched OUTSIDE the transaction (lines 247-257), creating a TOCTOU window. If an experience is deleted between the pre-fetch and the transaction commit, the gift will be created with a `null` `pledgedExperience` snapshot. The code handles this gracefully (sets `pledgedExperience: null` at line 291), but the gift document is created with no experience reference.
- **Evidence:** Line 247-257: experience documents fetched outside transaction. Line 291: `pledgedExperience` set from pre-fetched data, which can be `null`. The gift is still created with `pledgedExperience: null`.
- **Impact:** If an experience is deleted/hidden between payment and webhook processing, the gift is created but has no experience data. The recipient receives a claim code for a gift with no associated experience. Low probability but non-zero.
- **Suggested Fix:** Validate that all experience snapshots are non-null before proceeding with gift creation. If any are null, throw an error so the webhook returns 500 and Stripe retries later when the data may be consistent.
- **False Positive Check:** The `pledgedExperience` field can be `null` as shown at line 291: `pledgedExperience = expData ? { ... } : null`.

---

### [MEDIUM] F9 — `createFreeGift` validates `revealMode` but category-only path does not set it

- **File:** `src/screens/GiftFlowScreen.tsx` (lines 623-644), `functions/src/createFreeGift.ts` (lines 101-104)
- **Category:** Free Gift Flow / Mystery/Reveal Mode
- **Description:** The category-only Together path (GiftFlowScreen line 633) does not include `revealMode` in the request body. The server validates `revealMode` at line 101-104 and returns 400 if missing. Combined with F1 (missing `experienceId`), this is a second validation failure for the same path, but independently it means `revealMode` is also needed.
- **Evidence:** GiftFlowScreen lines 633-644: the request body for the category-only path does not include `revealMode`. Server at line 101: `if (!revealMode || !['revealed', 'secret'].includes(revealMode))` returns 400.
- **Impact:** Even if F1 were fixed (making `experienceId` optional), the request would still fail due to missing `revealMode`. Both issues must be fixed together.
- **Suggested Fix:** Either include `revealMode` in the category-only request body (defaulting to 'secret'), or make `revealMode` optional on the server when `preferredRewardCategory` is provided.
- **False Positive Check:** Confirmed by inspecting the request body at GiftFlowScreen line 633-644 and the server validation at createFreeGift line 101-104.

---

### [MEDIUM] F10 — Giver goal created without `partnerUserId` field

- **File:** `functions/src/createFreeGift.ts` (lines 277-311), `functions/src/createDeferredGift.ts` (lines 323-357)
- **Category:** Together Mode
- **Description:** Both `createFreeGift` and `createDeferredGift` create the giver's goal for shared challenges but do NOT set `partnerUserId` on the goal document. The `GoalShared` type includes `partnerUserId?: string`. The `chargeDeferredGift` trigger reads `afterData.userId` as the completing user, and reads the partner goal to get `partnerGoalData?.userId` for notifications. However, the giver goal itself has no `partnerUserId` field, making it inconsistent with recipient goals that may have this field set.
- **Evidence:** Giver goal data in `createFreeGift` lines 277-311 does not include `partnerUserId`. Same in `createDeferredGift` lines 323-357. The `GoalShared` interface in types defines `partnerUserId?: string`.
- **Impact:** If any client-side logic checks `goal.partnerUserId` to determine the partner, it will be `undefined` for giver goals until the recipient links their goal. This is partially mitigated by `togetherData.giverGoalId` on the gift document, but creates an asymmetry.
- **Suggested Fix:** Document that `partnerUserId` is only populated after the recipient claims, or populate it on both goals during claim.
- **False Positive Check:** Confirmed by searching for `partnerUserId` in both cloud function files -- zero results.

---

### [MEDIUM] F11 — Wizard step clamp may cause infinite loop with `useEffect`

- **File:** `src/screens/GiftFlowScreen.tsx` (lines 414-418)
- **Category:** Wizard State
- **Description:** The `useEffect` at lines 414-418 clamps `currentStep` to `totalSteps` when `totalSteps` changes. However, `totalSteps` depends on `needsRevealStep` and `needsPaymentStep` (lines 224-228), which depend on `selectedExperience` and `challengeType`. When the user selects a category in Together mode (clearing `selectedExperience`), `totalSteps` drops. If `currentStep > totalSteps`, the effect sets `currentStep` to `totalSteps`. But changing `currentStep` could change `needsRevealStep`/`needsPaymentStep` via the step-mapping functions, which could change `totalSteps` again, causing the effect to re-fire. In practice, the step count converges quickly, but the dependency on `currentStep` in the effect creates an unnecessary re-render cycle.
- **Evidence:** Line 414: `useEffect(() => { if (currentStep > totalSteps) setCurrentStep(totalSteps); }, [totalSteps, currentStep]);`. Both `totalSteps` and `currentStep` are dependencies and both can trigger state changes.
- **Impact:** Extra re-renders on step/selection changes. No infinite loop in practice because the clamp converges in one step, but it's a code smell.
- **Suggested Fix:** Remove `currentStep` from the dependency array and use a ref or conditional check.
- **False Positive Check:** The effect body only runs when `currentStep > totalSteps`, so it converges. Not a true infinite loop, but unnecessary re-render churn.

---

### [MEDIUM] F12 — `updatePaymentIntentMetadata` overwrites all metadata

- **File:** `functions/src/updatePaymentIntentMetadata.ts` (lines 95-100)
- **Category:** Paid Gift Flow
- **Description:** The `stripe.paymentIntents.update()` call at lines 95-100 sets metadata to `{ personalizedMessage, giverId }`. Stripe's metadata update behavior REPLACES all metadata keys that are specified. However, the original PaymentIntent has many metadata keys (`type`, `cart`, `giverName`, `primaryPartnerId`, `isMystery`, `source`). By only specifying `personalizedMessage` and `giverId`, the other keys are preserved (Stripe merge behavior). However, if `giverId` is already set and the update changes it, this could cause issues. In practice, `giverId` is set to `userId` which should match, so this is a minor concern.
- **Evidence:** Lines 95-100: `metadata: { personalizedMessage: personalizedMessage || "", giverId: userId }`. Stripe's update API merges metadata keys, so unmentioned keys are preserved.
- **Impact:** Low risk. Metadata keys not mentioned in the update call are preserved by Stripe. The `giverId` is redundantly re-set to the authenticated user, which should always match.
- **Suggested Fix:** Only update `personalizedMessage` to avoid any accidental override: `metadata: { personalizedMessage: personalizedMessage || "" }`.
- **False Positive Check:** Stripe API docs confirm that `metadata` in `paymentIntents.update()` merges with existing metadata. Keys not specified are not removed. Confirmed low risk.

---

### [MEDIUM] F13 — Deferred gift charge: `validateGiftTransition` may throw on unexpected status

- **File:** `functions/src/triggers/chargeDeferredGift.ts` (lines 434-437)
- **Category:** Gift State Machine
- **Description:** After successfully charging, the code calls `validateGiftTransition(currentStatus, 'completed')` at line 436. If the gift status is 'pending' (the initial status set at creation), this transition is invalid per the state machine (`pending` can only go to `active`, `expired`, or `cancelled`). The expected status at charge time should be 'claimed' (recipient has accepted), but there is no guarantee the status was updated to 'claimed' before the charge fires. If the gift is still 'pending', the transition validation will throw `InvalidGiftTransitionError`, and the gift will be stuck in 'processing' with the charge already collected.
- **Evidence:** State machine at `giftStateMachine.ts` lines 22-23: `pending: ['active', 'expired', 'cancelled']`. The transition `pending -> completed` is invalid. The gift status at creation is `'pending'` (createDeferredGift line 261). It must transition to `'active' -> 'claimed'` before charge. But `chargeDeferredGift` doesn't verify the status is 'claimed' before charging.
- **Impact:** If the charge trigger fires before the gift status has been updated to 'claimed' (e.g., the recipient's goal is linked but the gift status wasn't updated in the flow), the state machine validation throws, the Firestore update fails, and the charge is orphaned. The failedCharges collection catches this, but it requires manual intervention.
- **Suggested Fix:** Check the status before charging (not just before writing). If status is not 'claimed', skip the state machine validation or handle the transition `pending -> completed` explicitly for deferred gifts.
- **False Positive Check:** The `validateGiftTransition` call at line 436 will throw for any status that cannot transition to 'completed' (pending, expired, cancelled). The only valid source is 'claimed'. If the gift is still 'pending', the throw is real.

---

### [LOW] F14 — `handleBack` in experience picker mode inconsistently decrements step for solo

- **File:** `src/screens/GiftFlowScreen.tsx` (lines 539-554)
- **Category:** Wizard State
- **Description:** When `showExperiencePicker` is true and the user presses back, `handleBack` sets `showExperiencePicker = false`, clears `selectedExperience`, and for solo challenges decrements `currentStep` (line 544-546). However, for solo challenges, the experience step IS step 2, and going back should return to step 1. The decrement `prev => prev - 1` brings step 2 to step 1, which is correct. But in the Together flow, pressing back in the experience picker only closes the picker without decrementing (correct, since the category fork is still on the same step). This is correct behavior but the conditional `if (challengeType === 'solo' && currentStep > 1)` means that if solo is at step 2 and presses back in picker, it goes to step 1 AND closes the picker. The user would need to re-select experience type and re-enter the picker. Minor UX friction.
- **Evidence:** Lines 540-553: Back handler has branching logic for `showExperiencePicker` state.
- **Impact:** Minor UX friction -- solo users backing out of the experience browser return to the challenge type selection instead of staying on the experience step. They need to re-advance to step 2.
- **Suggested Fix:** For solo flow, just close the picker without decrementing the step, since the picker is a sub-view of step 2.
- **False Positive Check:** Confirmed by reading the conditional logic. Solo at step 2 with picker open -> back -> step 1 + picker closed.

---

### [LOW] F15 — `DeferredSetupScreen` allows skipping card setup

- **File:** `src/screens/giver/DeferredSetupScreen.tsx` (lines 139-142)
- **Category:** Deferred Gift Flow
- **Description:** The `handleSkip` callback allows the giver to skip the card setup step and proceed directly to the Confirmation screen. The gift is created (with SetupIntent) but the card is never confirmed. When the recipient completes the goal, `chargeDeferredGift` will attempt to retrieve the SetupIntent's payment method, which will be `null` because the setup was never completed. The function handles this at line 292 by sending a notification to the giver, but the recipient's goal stays locked.
- **Evidence:** DeferredSetupScreen line 139-142: `handleSkip` navigates to Confirmation without confirming the SetupIntent. chargeDeferredGift line 290-304: checks for null `paymentMethodId` and sends notification but does not unlock the goal.
- **Impact:** The giver can skip card entry, the recipient completes the goal, but the charge fails because no card is on file. The giver gets a notification to add a payment method, but there's no in-app flow to re-attempt the card setup for this specific gift.
- **Suggested Fix:** Either (a) remove the skip option, (b) mark the gift as `payment: 'free'` if skipped (since no card was saved), or (c) add a "retry card setup" flow in the Purchased Gifts screen.
- **False Positive Check:** The `showInfo` message at line 140 says "You can add payment details later from Purchased Gifts" but the Purchased Gifts screen has no such functionality.

---

### [LOW] F16 — Free solo gift: no state machine validation on creation

- **File:** `functions/src/createFreeGift.ts` (lines 162-321)
- **Category:** Gift State Machine
- **Description:** `createFreeGift` creates gifts with `status: "pending"` and `payment: "free"` but does not call `validateGiftTransition`. This is technically correct because creation is the initial state, not a transition. However, the gift state machine comments (giftStateMachine.ts line 16) list `createFreeGift.ts` as a file that "should adopt validateGiftTransition", suggesting this was intended but not implemented.
- **Evidence:** giftStateMachine.ts line 16: `*   - src/createFreeGift.ts               (status: 'pending' on creation)`. No call to `validateGiftTransition` in createFreeGift.ts.
- **Impact:** Minimal -- creation is not a transition, so validation is not strictly needed. However, if future code changes the initial status, the state machine won't catch invalid initial states.
- **Suggested Fix:** Add a comment in createFreeGift.ts noting that creation is the initial state and does not require transition validation.
- **False Positive Check:** No actual bug -- this is a documentation/consistency issue.

---

## Files Audited

### Knowledge Documents
- `.agent/knowledge/experiences-gifts-system.md`
- `.agent/knowledge/payments-system.md`
- `.agent/knowledge/system-map.md`
- `.agent/knowledge/goals-system.md`

### Screens
- `src/screens/GiftFlowScreen.tsx` (full, 1800+ lines)
- `src/screens/ChallengeLandingScreen.tsx` (first 100 lines)
- `src/screens/giver/ExperienceCheckoutScreen.tsx` (full, 600+ lines)
- `src/screens/giver/DeferredSetupScreen.tsx` (full, 200+ lines)
- `src/screens/giver/ConfirmationScreen.tsx` (full, 976 lines)
- `src/screens/giver/ConfirmationMultipleScreen.tsx` (first 60 lines)
- `src/screens/giver/CartScreen.tsx` (first 100 lines)
- `src/screens/giver/MysteryChoiceScreen.tsx` (full, 150 lines)

### Cloud Functions
- `functions/src/createFreeGift.ts` (full, 381 lines)
- `functions/src/createDeferredGift.ts` (full, 437 lines)
- `functions/src/stripeCreatePaymentIntent.ts` (full, 224 lines)
- `functions/src/stripeWebhook.ts` (full, 392 lines)
- `functions/src/updatePaymentIntentMetadata.ts` (full, 110 lines)
- `functions/src/triggers/chargeDeferredGift.ts` (full, 623 lines)

### Utilities
- `functions/src/utils/giftStateMachine.ts` (full, 58 lines)
- `src/utils/wizardHelpers.ts` (full, 25 lines)
- `src/types/index.ts` (relevant type definitions)

### Services
- `src/services/ExperienceGiftService.ts` (full, 146 lines)
- `src/services/ExperienceService.ts` (first 60 lines)
- `src/services/stripeService.ts` (full, 203 lines)
- `src/services/CartService.ts` (first 80 lines)
- `src/services/GoalService.ts` (relevant methods)
- `src/services/GoalSessionService.ts` (relevant methods)
