# Notification System Architecture

## Overview
Manages in-app notifications and interacts with Firebase Cloud Messaging (FCM) for push notifications. Managed by `NotificationService.ts`.

## Core Concepts
- **Notification Types**:
    - `friend_request`: Interactive (accept/deny). Has top-level `senderId` field.
    - `personalized_hint_left`: From a partner/giver.
    - `post_reaction`: Social feedback.
    - `goal_progress`: System updates.
    - `shared_session`: Partner logged a session in a Together/Shared challenge.
    - `shared_start`: Partner accepted the Together challenge.
    - `shared_unlock`: Both partners completed — reward unlocked.
    - `shared_completion`: One partner completed their half.
    - `payment_charged`: Deferred payment successfully charged.
    - `payment_failed`: Payment failed (optional recovery URL in `data`).
    - `goal_completed`: Goal fully completed.
    - `gift_received`: User received a new gift.
    - `valentine_partner_progress`: Partner progress update in Valentine/Together challenge.
    - `goal_edit_request`: Recipient requests a change to a gifted goal's duration/frequency. Rendered with `GoalEditApprovalNotification` (approve/decline). Sent to **giver**. Data: `goalId`, `requestedTargetCount`, `requestedSessionsPerWeek`, `message`.
    - `goal_edit_response`: Giver's response to a `goal_edit_request`. Sent to **recipient**. Data: `goalId`, `approved: boolean`. Rendered with `goal_approval_response` styling (green/red accent). Taps navigate to `GoalDetail`.
    - `goal_edit_requested` / `goal_edit_approved` / `goal_edit_rejected`: Analytics events tracked via `AnalyticsService`.
- **Real-time**: Uses `onSnapshot` to push updates to the UI immediately.
- **Rendering**: All types above are rendered in `NotificationsScreen` with dedicated icons and `handlePress` navigation logic.
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
- **Cloud Functions**: Most notifications are triggered by Firestore triggers (e.g., `valentineCompletionNotifier` watches for `isUnlocked` changes).
