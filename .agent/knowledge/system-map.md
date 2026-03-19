# System Knowledge Map

This directory contains the "Source of Truth" for Ernit's architecture.

## Available Documentation

| System | File | Description |
|--------|------|-------------|
| **Goals** | `goals-system.md` | Core progression, weekly cadence, Shared challenges, Free Goals, Motivations. |
| **Notifications** | `notifications-system.md` | In-app alerts, push integration, and aggregation logic. |
| **Auth & User** | `auth-user-system.md` | AuthGuard, Profile, and Cart management. |
| **Social & Feed** | `social-feed-system.md` | Friend graph, Activity Feed, Empower mechanic. |
| **AI Hints** | `ai-hints-system.md` | Llama-3 generation, caching, and anti-repetition logic. |
| **Payments** | `payments-system.md` | Stripe Intents, Webhooks, Deferred Gifts, and Security. |
| **Experiences** | `experiences-gifts-system.md` | Product catalog, Gift objects, Gift Flow (free/deferred/shared), and Empower flow. |
| **Hints & Coupons** | `hints-coupons-system.md` | AI/Personal hints storage and coupon reward logic. |
| **UI & UX** | `ui-ux-system.md` | Color system (Emerald/Teal), Moti animations, NativeWind, components. |
| **Analytics** | `analytics-system.md` | AnalyticsService, event tracking, Firestore events collection. |

## Usage
Use the `accessing-knowledge` skill to read these files. Do NOT try to memorize them. Read them when needed to ensure you have the latest context.

---

## Recent Architecture Changes (session 2026-03-18)

### New Screens
- `src/screens/GiftFlowScreen.tsx` — Multi-step gift creation wizard (challenge type → experience → payment → reveal → confirm). Supports `solo` and `shared` challenge modes. Accepts optional `GiftFlowPrefill` route param.
- `src/screens/giver/DeferredSetupScreen.tsx` — Stripe SetupIntent card collection screen. Shown after `GiftFlowScreen` when `paymentChoice === 'payLater'`. Uses `@stripe/react-stripe-js` `PaymentElement` in setup mode to save the giver's card for off-session charging.

### New Cloud Functions
| Function | File | Description |
|----------|------|-------------|
| `createFreeGift` | `functions/src/createFreeGift.ts` | Creates an `ExperienceGift` with `payment: 'free'`. For `shared` challenges, atomically batch-writes the giver's goal at the same time (`togetherData.giverGoalId` embedded on the gift). Sends optional recipient email. |
| `createDeferredGift` | `functions/src/createDeferredGift.ts` | Creates a Stripe `SetupIntent` (off-session) + an `ExperienceGift` with `payment: 'deferred'`. For `shared` challenges, also creates the giver goal atomically. Returns `setupIntentClientSecret` for `DeferredSetupScreen`. |
| `chargeDeferredGift` | `functions/src/triggers/chargeDeferredGift.ts` | Firestore trigger on `goals/{goalId}`. Fires when `isCompleted` transitions to `true`. Handles: (1) deferred payment — charges Stripe via saved payment method with idempotency key; (2) free shared challenge — when both partners complete, atomically unlocks both goals and sends `shared_unlock` notifications; (3) free solo — no-op. |
| Test variants | `*_Test.ts` files | `createFreeGift_Test`, `createDeferredGift_Test`, `chargeDeferredGift_Test` — identical logic against the `ernitclone2` test database. |

### New / Renamed Types (`src/types/index.ts`)
- `GoalShared` — Replaces `GoalValentine`. Represents shared/together challenge fields (`partnerGoalId`, `partnerUserId`, etc.). `GoalValentine` is kept as a type alias for backward compatibility.
- `GiftFlowData` — Full state object for the `GiftFlowScreen` wizard: `challengeType`, `experience`, `revealMode`, `paymentChoice`, together-mode fields (goalName, duration, frequency, sessionTime).
- `GiftFlowPrefill extends Partial<GiftFlowData>` — Optional route param for `GiftFlow` navigation to pre-populate wizard steps.
- `GiftChallengeType` — `'solo' | 'shared'`
- `GiftRevealMode` — `'revealed' | 'secret'`
- `GiftPaymentChoice` — `'payLater' | 'free'`

### New Utilities
- `src/utils/responsive.ts` — Exports `vh(px: number): number` and `VH` constant. Scales pixel values proportionally to screen height: 1.0 at ≥900px, down to 0.72 at ~648px. Use `vh()` instead of hardcoded sizes in screens that need density-responsive layouts.
- `src/utils/sanitization.ts` — XSS/injection-safe text sanitization. Exports `sanitizeText`, `escapeHtml`, `sanitizeEmail`, `sanitizeNumber`, `sanitizeUrl`, `sanitizeProfileData`, `sanitizeGoalData`, `sanitizeComment`. Used across 13+ files (see Code Standards in CLAUDE.md).
- `src/utils/wizardHelpers.ts` — `EXPERIENCE_CATEGORIES` constant, `setStorageItem`, `sanitizeNumericInput`. Shared by `GiftFlowScreen` and `ChallengeSetupScreen`.

### Together/Shared Challenge System
The "Shared" challenge (`challengeType: 'shared'`) is a bidirectional goal where both giver and recipient work toward the same challenge together.

**Creation flow:**
1. Giver completes `GiftFlowScreen` with `challengeType: 'shared'`, fills in goal name/duration/frequency/session time.
2. `createFreeGift` or `createDeferredGift` is called. The function atomically creates: (a) the `ExperienceGift` doc with `togetherData` embedded, and (b) the giver's `goals` document (with `challengeType: 'shared'`, `giverActionTaken: true`). The giver goal ID is written back into `togetherData.giverGoalId` on the gift.
3. Recipient claims gift → accepts challenge → their goal is created and linked via `partnerGoalId`.

**Completion / charge logic (`chargeDeferredGift` trigger):**
- For `payment: 'deferred'` (solo or shared): charges Stripe when the completing goal's `isCompleted` transitions to `true`. An idempotency key prevents double charges.
- For `payment: 'free'` shared: waits for **both** partner goals to be `isCompleted`. When both are done, a Firestore transaction atomically unlocks both goals (`isUnlocked: true`) and writes `shared_unlock` notifications for both users.

### Firestore Offline Persistence
Enabled in `src/services/firebase.ts` via `initializeFirestore` with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`. Active only in production environment (`EXPO_PUBLIC_APP_ENV === 'production'`). Uses IndexedDB on web (Firebase v10+). Falls back gracefully in non-production/test environments.
