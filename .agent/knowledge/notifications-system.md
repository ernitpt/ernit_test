# Notification System Architecture

## Overview
Manages in-app notifications and interacts with Firebase Cloud Messaging (FCM) for push notifications. Managed by `NotificationService.ts`.

## Core Concepts
- **Notification Types**:
    - `friend_request`: Interactive (accept/deny).
    - `personalized_hint_left`: From a partner/giver.
    - `post_reaction`: Social feedback.
    - `goal_progress`: System updates.
- **Real-time**: Uses `onSnapshot` to push updates to the UI immediately.

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
