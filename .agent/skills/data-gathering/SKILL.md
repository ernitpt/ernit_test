---
name: data-gathering
description: Standardizes analytics event tracking across the Ernit app via the centralized AnalyticsService singleton. Use whenever adding, modifying, or reviewing analytics tracking (trackEvent, trackScreenView, trackButtonClick) or changing the events Firestore collection schema.
---

# Data Gathering Skill

## Purpose
Standardizes how user interactions are tracked across the Ernit app using the centralized `AnalyticsService`.

## Architecture

### AnalyticsService (`src/services/AnalyticsService.ts`)
- **Singleton**: `analyticsService` — import and call directly
- **Buffered writes**: Events queue in memory, flush to Firestore `events` collection every 10 events or 30 seconds
- **Typed events**: `AnalyticsEventName` union type in `src/types/index.ts` prevents typos
- **GA4 bridge**: Automatically forwards events to `src/utils/analytics.ts` (web only)
- **Fail-silent**: Analytics never crashes the app; errors are logged but swallowed

### Firestore Schema (`events` collection)
```
{
  eventName: string,       // e.g. 'screen_view', 'payment_completed'
  category: string,        // 'navigation' | 'engagement' | 'conversion' | 'social' | 'error'
  properties: object,      // event-specific data (no PII!)
  screenName: string|null, // which screen triggered the event
  userId: string|null,     // auto-attached from auth state
  sessionId: string,       // auto-generated per app session
  timestamp: Date,         // auto-attached
  userAgent: string,       // 'web' | 'ios' | 'android'
  environment: string      // 'development' | 'production'
}
```

## Event Naming Conventions

1. **Format**: `snake_case`, `verb_noun` pattern (e.g. `payment_completed`, `goal_creation_started`)
2. **Categories**:
   - `navigation` — screen views, tab switches
   - `engagement` — button clicks, CTA interactions, notification taps
   - `conversion` — checkout, payment, goal creation, coupon redemption
   - `social` — friend requests, reactions, comments, empowerment
   - `error` — tracked errors (separate from ErrorBoundary)

3. **Adding new events**: Add the event name to the `AnalyticsEventName` union type in `src/types/index.ts` first. TypeScript will enforce correctness.

## API Reference

```typescript
import { analyticsService } from '../services/AnalyticsService';

// Screen view (auto-tracked via AppNavigator — rarely needed manually)
analyticsService.trackScreenView('ScreenName');

// Generic event
analyticsService.trackEvent('payment_completed', 'conversion', {
  amount: 29.99,
  giftId: 'abc123',
}, 'ExperienceCheckoutScreen');

// Button click (convenience method)
analyticsService.trackButtonClick('add_to_cart', 'CategorySelectionScreen', {
  experienceId: 'exp_123',
});

// Set user context (auto-handled in AppNavigator auth listener)
analyticsService.setUserId(userId);

// Force flush (on app background)
analyticsService.flush();
```

## When to Track

### DO track:
- **Conversion funnel steps**: checkout started, payment initiated/completed/failed, goal created
- **Key user actions**: notification tapped, friend request sent/accepted, CTA shown/dismissed/accepted
- **Feature adoption**: first time using a feature, mystery choice selected

### DON'T track:
- **Every tap or scroll** — noise drowns out signal
- **PII** — never log names, emails, phone numbers, or addresses in `properties`
- **Redundant events** — screen views are auto-tracked; don't add manual `screen_view` calls
- **High-frequency events** — don't track every keystroke or scroll position

## Privacy Rules

1. **No PII in properties** — only use IDs (userId, goalId, experienceId) and categorical values (category, type, status)
2. **No sensitive data** — never log payment details, passwords, or personal messages
3. **User IDs only** — reference users by ID, never by name or email
4. **Minimal data** — only include properties that are useful for analysis

## Checklist: Adding Tracking to a New Feature

1. Identify the key user actions worth tracking (max 3-5 per feature)
2. Add event names to `AnalyticsEventName` in `src/types/index.ts`
3. Import `analyticsService` in the relevant screen/component
4. Add `trackEvent()` calls at the appropriate points
5. Include only categorical/ID properties (no PII)
6. Test in dev: check browser console for `AnalyticsService` logs

## Currently Tracked Events

| Event | Category | Where | Properties |
|-------|----------|-------|------------|
| `screen_view` | navigation | AppNavigator `onStateChange` | `screenName` |
| `checkout_started` | conversion | ExperienceCheckoutScreen mount | `itemCount` |
| `payment_initiated` | conversion | ExperienceCheckoutScreen handlePurchase | `totalAmount`, `totalQuantity` |
| `payment_completed` | conversion | ExperienceCheckoutScreen success | `totalAmount`, `totalQuantity` |
| `payment_failed` | conversion | ExperienceCheckoutScreen catch | `error` |
| `goal_creation_completed` | conversion | GoalSettingScreen confirmCreateGoal | `category`, `durationWeeks`, `sessionsPerWeek` |
| `goal_creation_completed` | conversion | GoalService createGoal / createFreeGoal | `goalId`, `category`, `isFreeGoal` |
| `goal_approved` | conversion | GoalService approveGoal | `goalId` |
| `gift_attached_to_goal` | conversion | GoalService attachGiftToGoal | `goalId`, `giftId` |
| `session_logged` | engagement | SessionService createSessionRecord | `goalId`, `sessionId`, `sessionNumber`, `weekNumber`, `duration`, `hasMedia` |
| `session_logged` | engagement | GoalService tickWeeklySession | `goalId`, `weekNumber`, `newCount` |
| `notification_tapped` | engagement | NotificationsScreen handlePress | `type` |
| `friend_request_accepted` | social | FriendService acceptFriendRequest | `requestId`, `senderId`, `recipientId` |
| `friend_request_declined` | social | FriendService declineFriendRequest | `requestId` |
| `friend_removed` | social | FriendService removeFriend | `userId`, `friendId` |
| `gift_created` | conversion | ExperienceGiftService createExperienceGift | `giftId`, `experienceId`, `giverId` |
| `gift_message_updated` | engagement | ExperienceGiftService updatePersonalizedMessage | `giftId` |
| `error_boundary_triggered` | error | ErrorBoundary componentDidCatch | `screenName`, `errorMessage` |

## Firestore Rules

The `events` collection is write-only from the client:
```
match /events/{eventId} {
  allow create: if request.auth != null;
  allow read, update, delete: if false;
}
```

Data analysis should be done via Firebase Console, BigQuery export, or Cloud Functions — not client-side reads.

## Deployment

After modifying `firestore.rules`, deploy manually:
```bash
firebase deploy --only firestore:rules
```
