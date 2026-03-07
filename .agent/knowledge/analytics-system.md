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

### Conversion
- `checkout_started`, `payment_initiated`, `payment_completed`, `payment_failed` (ExperienceCheckoutScreen)
- `goal_creation_completed` (GoalSettingScreen + GoalService)
- `goal_approved` (GoalService)
- `gift_attached_to_goal` (GoalService)
- `gift_created` (ExperienceGiftService)

### Engagement
- `session_logged` (SessionService + GoalService)
- `notification_tapped` (NotificationsScreen)
- `gift_message_updated` (ExperienceGiftService)

### Social
- `friend_request_accepted`, `friend_request_declined` (FriendService)
- `friend_removed` (FriendService)

### Error
- `error_boundary_triggered` (ErrorBoundary component)

## Firestore Rules
- `events`: authenticated create only, no client reads
- `errors`: anyone can create (ErrorBoundary may fire pre-auth), no client reads

## Adding New Events
1. Add to `AnalyticsEventName` union in `src/types/index.ts`
2. Call `analyticsService.trackEvent(name, category, properties, screenName)` at the tracking point
3. Update the tracking table in `.agent/skills/data-gathering/SKILL.md`
