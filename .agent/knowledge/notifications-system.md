# Notification System Architecture

## Overview
Manages in-app notifications and interacts with Firebase Cloud Messaging (FCM) for push notifications. Managed by `NotificationService.ts`.

## Core Concepts

### Notification Types
Source of truth: the `Notification.type` union in [src/types/index.ts](../../src/types/index.ts) (around line 491). Keep this doc in sync with the union — if the union changes, update both.

**Social / Friend**
- `friend_request` — interactive (accept/deny). Has top-level `senderId` field. `clearable: false` until acted upon.
- `post_reaction` — aggregated "Alice and 2 others reacted" notification (see `createOrUpdatePostReactionNotification`).
- `post_comment` — fires when someone comments on the post owner's feed post (sent via `CommentService`).
- `experience_empowered` — a friend bought the user's pledged experience as a free-goal reward. `data` includes `giverName`, `experienceId`, `isMystery`.
- `motivation_received` — a friend left a motivation message on the user's goal.

**Goals**
- `goal_set` — goal initialized.
- `goal_completed` — goal fully completed.
- `goal_progress` — weekly / milestone update.
- `goal_approval_request` / `goal_approval_response` — giver approves/adjusts a gifted goal's params.
- `goal_change_suggested` — giver suggests a change to an in-flight goal.
- `goal_edit_request` — recipient requests a change to a gifted goal's weeks/sessions. Sent to **giver**. Rendered via `GoalEditApprovalNotification` (approve/decline). `data`: `goalId`, `requestedTargetCount`, `requestedSessionsPerWeek`, `message`.
- `goal_edit_response` — giver's response. Sent to **recipient**. `data`: `goalId`, `approved: boolean`. Taps navigate to `GoalDetail`.
- `free_goal_milestone` — free goal hit a 25/50/75% milestone. `data` includes `milestone`, `goalUserId`, `experienceId`.
- `free_goal_completed` — a followed user completed their free goal (empower prompt).
- `pending_gift_available` — fired by [onGoalCreated trigger](../../functions/src/triggers/onGoalCreated.ts) when a new goal is created and the user has unattached gifts waiting. Prompts the user to link them via `attachGiftToGoal`.

**Gifts**
- `gift_received` — user received a new gift.

**Payments**
- `payment_charged` — deferred payment successfully charged.
- `payment_failed` — deferred payment failed (optional recovery URL in `data`).
- `payment_cancelled` — deferred gift cancelled before charge.

**Shared / Together Challenges**
- `shared_start` — partner accepted the shared challenge.
- `shared_session` — partner logged a session in a shared challenge.
- `shared_unlock` — both partners completed, reward unlocked.
- `shared_completion` — one partner completed their half.
- `shared_partner_removed` — partner left the shared challenge.

**Legacy Valentine (kept for back-compat)**
- `valentine_start`, `valentine_unlock`, `valentine_completion`, `valentine_partner_progress` — replaced by the `shared_*` set. Kept only to render existing historical notifications.

**Engagement / Reminders**
- `personalized_hint_left` — giver/partner left a personalized hint.
- `session_reminder` — scheduled reminder for a session.
- `weekly_recap` — weekly summary notification.
- `experience_booking_reminder` — reminder to book a redeemed experience.

### Behavior
- **Real-time**: Uses `onSnapshot` to push updates to the UI immediately.
- **Rendering**: All types above are rendered in `NotificationsScreen` with dedicated icons and `handlePress` navigation logic. If you add a new type, register it there.
- **`senderId`**: Top-level field on notification document (used by `friend_request` type).
- **`createNotification`**: Non-critical — wrapped in try/catch so failures do not throw or break calling code.

## Data Model
- `userId`: Recipient.
- `type`: String identifier for logic handling.
- `read`: Boolean status.
- `clearable`: Boolean. Critical for "sticky" notifications (e.g., Friend Requests are NOT clearable until acted upon).
- `data`: Flexible JSON payload for type-specific info (e.g., `friendRequestId`, `senderProfileImageUrl`).

## Key Methods (`NotificationService.ts`)
- `createNotification`: Base method. Timestamps and defaults `read=false`.
- `createOrUpdatePostReactionNotification`: Smart aggregation. Merges multiple likes on the same post into one notification (e.g., "Alice and 2 others reacted").
- `invalidateOldGoalProgressNotifications`: Cleanup logic to mark old session alerts as `isStale`.
- `clearAllNotifications`: Bulk delete, but strictly respects `clearable=false` (won't delete pending friend requests).

## Triggers
- **Cloud Functions**: Most server-side notifications fire from Firestore triggers. Current set:
  - `functions/src/triggers/onGoalCreated.ts` → `pending_gift_available`
  - `functions/src/triggers/chargeDeferredGift.ts` → `payment_charged` / `payment_failed` / `payment_cancelled` / `shared_unlock`
  - `CommentService.addComment` (client-side) → `post_comment`
  - `ReactionService` (client-side, aggregated) → `post_reaction`
