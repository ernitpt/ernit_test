# Analytics System

## Overview
Centralized event tracking via `AnalyticsService` singleton with buffered Firestore writes and GA4 bridging.

## Key Files
- `src/services/AnalyticsService.ts` — singleton service, buffered writes
- `src/types/index.ts` — `AnalyticsEventName`, `AnalyticsEventCategory`, `AnalyticsEvent` types
- `src/utils/analytics.ts` — GA4 utility (web only), bridged automatically by AnalyticsService
- `.agent/skills/data-gathering/SKILL.md` — full skill documentation

## Architecture
- Events buffered in memory (flush every 10 events or 30s)
- Writes to Firestore `events` collection (write-only from client)
- Auto-attaches userId, sessionId, timestamp, userAgent, environment
- GA4 bridged for web via `react-ga4`
- Fail-silent: analytics errors never crash the app

## Screen View Tracking
Automatic via `AppNavigator.tsx` `onStateChange` — drills into nested navigators to get the active route name.

## User Context
`analyticsService.setUserId()` is called in `AppNavigator.tsx` inside the `onAuthStateChanged` listener.

## Currently Tracked Events

### Navigation
- `screen_view` — auto-tracked via AppNavigator onStateChange
- `app_open` — tracked on app foreground/launch

### Auth
- `signup_completed` — tracked in AuthScreen (email + Google paths)
- `login_completed` — tracked in AuthScreen (email + Google paths)
- `login_failed` — tracked in AuthScreen on auth error

### Conversion
- `checkout_started`, `payment_initiated`, `payment_completed`, `payment_failed` (ExperienceCheckoutScreen)
- `goal_creation_completed` (GoalSettingScreen + GoalService)
- `goal_approved` (GoalService)
- `gift_attached_to_goal` (GoalService)
- `gift_created` (ExperienceGiftService)

### Engagement
- `session_logged` (SessionService + GoalService)
- `session_start` — tracked in TimerContext on session begin
- `weekly_goal_completed` — tracked in GoalSessionService on weekly completion
- `notification_tapped` (NotificationsScreen)
- `gift_message_updated` (ExperienceGiftService)
- `feed_viewed` — tracked in FeedScreen on mount/focus
- `goal_edited` — recipient self-edited a goal (GoalService.selfEditGoal)
- `goal_edit_requested` — recipient requested an edit on a gifted goal
- `goal_edit_approved` — giver approved an edit request
- `goal_edit_rejected` — giver rejected an edit request
- `goal_deleted` — goal deleted by owner
- `share_goal_completed` — goal completion shared externally

### Social
- `friend_request_accepted`, `friend_request_declined` (FriendService)
- `friend_removed` (FriendService)
- `feed_reaction` — tracked in ReactionService on reaction add
- `feed_comment` — tracked in CommentService on comment add

### Error
- `error_boundary_triggered` (ErrorBoundary component)
- `unhandled_rejection` (globalErrorHandlers, unhandled promise rejections)

### Notes
- All event names are typed via `AnalyticsEventName` union in `src/types/index.ts`.

## Firestore Rules
- `events`: authenticated create only, no client reads
- `errors`: anyone can create (ErrorBoundary may fire pre-auth), no client reads

## Adding New Events
1. Add to `AnalyticsEventName` union in `src/types/index.ts`
2. Call `analyticsService.trackEvent(name, category, properties, screenName)` at the tracking point
3. Update the tracking table in `.agent/skills/data-gathering/SKILL.md`
