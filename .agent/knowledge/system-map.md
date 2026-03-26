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

---

## Recent Architecture Changes (branch claude/eager-jones — 2026-03-26)

### New Components

| Component | File | Description |
|-----------|------|-------------|
| `GoalEditModal` | `src/components/GoalEditModal.tsx` | Bottom-sheet modal for editing goal parameters (weeks duration, sessions/week). Self-owned goals edit directly via `selfEditGoal`; gifted goals send a request via `requestGoalEdit`. Steppers with min/max guards, message field (sanitized), success/error feedback, haptic feedback. React.memo wrapped. |
| `GoalEditApprovalNotification` | `src/components/GoalEditApprovalNotification.tsx` | Notification card rendered in NotificationsScreen for `goal_edit_request` type. Shows requested weeks/sessions + recipient's message. Approve/Decline buttons call `approveGoalEditRequest`/`rejectGoalEditRequest`. React.memo wrapped. |

### New JourneyScreen Sub-components (all React.memo)

All defined inline in `src/screens/recipient/JourneyScreen.tsx`:

| Component | Description |
|-----------|-------------|
| `SegmentedControl` | Story/Square share format toggle with `accessibilityState={{ selected }}` and haptic feedback. |
| `SessionCard` | Individual session item in the journey timeline. Shows date, duration, media thumbnail, share button. |
| `MilestoneCard` | Badge between session cards for week-completion and session-count milestones (e.g. "Week 2 Complete!", "10 Sessions!"). |
| `StatPill` | Single stat display (icon, label, value) used inside `SessionStatsBar`. |
| `SessionStatsBar` | Aggregate stats bar shown on completed goals: total time, session count, avg duration, longest session, weekly streak. Uses `SessionCardSkeleton` while loading. |

### New Features

**Goal Editing (recipient/giver)**
- Recipient can edit own goals directly (`selfEditGoal`) or request changes to gifted goals (`requestGoalEdit` — sends `goal_edit_request` notification to giver).
- Giver sees `GoalEditApprovalNotification` in NotificationsScreen, approves or rejects. Approved edits apply to the goal and send `goal_edit_response` notification to recipient.
- Entry point: edit icon button on `DetailedGoalCard` (shown for both owned and gifted goals).

**Session Privacy**
- `CelebrationModal` has a Friends/Private toggle. Default: Friends. Persisted via `AsyncStorage` key `sessionPrivacyPreference`. Private sessions show a lock icon. Implemented in `GoalCardModals.tsx`.

**Journey Sharing (Strava-style)**
- Per-session share button in `SessionCard`: captures the off-screen `shareCardRef` via `react-native-view-shot` and calls `Share.share` with the image URI.
- Journey-level share button on completed goals for a full goal retrospective card.
- Format toggle: Story (9:16) or Square (1:1), persisted in AsyncStorage (`shareFormatPreference`).

**Goal Retrospective**
- Completed goals in `JourneyScreen` show an aggregate summary: total sessions, total time, longest session, motivations summary. Powered by the `SessionStatsBar` component.

**Weekly Celebration Tiers**
- `GoalCardModals.tsx` `weekTier` useMemo computes tier (1/2/3/4+) based on `completedWeeks`.
- Tier 1–2: standard confetti. Tier 3: gold colors. Tier 4+: rainbow fireworks palette using design tokens (`celebrationGold`, `warning`, `error`, `categoryPink`, `accent`).

**Deadline Warning Banners**
- `DetailedGoalCard` shows urgency banners when the remaining sessions can't fit in the remaining days of the week. Message counts needed sessions vs available days.

**Dashboard Weekly Progress**
- `StreakBanner` (all levels) shows `X/Y sessions this week` progress bar derived from sessions logged this calendar week.

**Sticky Timer Notification (Android)**
- `TimerContext` fires a sticky Android foreground notification when a session starts, updating every 60s with elapsed time. Cancelled when session stops. Uses `PushNotificationService`.

**Gift from Wishlist**
- `FriendProfileScreen` wishlist tab shows `ExperienceCard` components with a "🎁 Gift This" button. Navigates to `ExperienceCheckout` pre-populated with that experience.

**Milestone Markers**
- `JourneyScreen` timeline inserts `MilestoneCard` badges for: every completed week, every 5/10/25/50 session milestones.

### New GoalService Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `selfEditGoal` | `(goalId, targetCount, sessionsPerWeek) → Promise<void>` | Direct edit for self-owned goals. Guards: targetCount ≥ currentCount (elapsed weeks), sessionsPerWeek ≥ weeklyCount (current week). Tracks `goal_edited` event. |
| `requestGoalEdit` | `(goalId, targetCount, sessionsPerWeek, message?) → Promise<void>` | Sends edit request for gifted goals. Writes `pendingEditRequest` to goal doc and sends `goal_edit_request` notification to giver. Sanitizes message. Tracks `goal_edit_requested`. |
| `approveGoalEditRequest` | `(goalId) → Promise<void>` | Giver approves: applies `requestedTargetCount`/`requestedSessionsPerWeek`, clears `pendingEditRequest`, sends `goal_edit_response` (approved) to recipient. Tracks `goal_edit_approved`. |
| `rejectGoalEditRequest` | `(goalId) → Promise<void>` | Giver rejects: clears `pendingEditRequest`, sends `goal_edit_response` (rejected) to recipient. Tracks `goal_edit_rejected`. |

### New Notification Types

| Type | Direction | Handler |
|------|-----------|---------|
| `goal_edit_request` | → Giver | Renders `GoalEditApprovalNotification`. Tap navigates to GoalDetail. |
| `goal_edit_response` | → Recipient | Rendered as a styled approval-response card (green=approved, red=rejected). Tap navigates to GoalDetail. |
| `post_comment` | → Post author | Navigates to Feed with `highlightPostId`. Was previously unhandled (silent fail). |

**Notification data fallbacks**: All tap handlers now show `showError('Could not open — data unavailable')` when required data fields (goalId, postId, giftId) are missing. Completed-goal hint tap shows `showInfo('This goal is already completed')`.

### New Goal Firestore Fields

`pendingEditRequest` sub-object on `goals/{goalId}`:
- `requestedTargetCount: number`
- `requestedSessionsPerWeek: number`
- `message?: string`
- `requestedAt: Timestamp`

### New Design Tokens

| Token | Location | Value |
|-------|----------|-------|
| `Spacing.jumbo` | `src/config/spacing.ts` | `60` — used for share card canvas offsets |
| `Typography.emojiBase` | `src/config/typography.ts` | `{ fontSize: 28, lineHeight: 34 }` — fills gap between `emojiSmall` (24) and `emojiMedium` (36) |

### New Analytics Events

Added to `AnalyticsEventName` union in `src/types/index.ts`:
- `goal_edited` — self-edit applied
- `goal_edit_requested` — recipient sent edit request to giver
- `goal_edit_approved` — giver approved edit
- `goal_edit_rejected` — giver rejected edit
