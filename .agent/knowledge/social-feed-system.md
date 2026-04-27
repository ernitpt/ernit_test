# Social & Feed System Architecture

## Overview
The social layer consists of a follower/friend graph, a secure Activity Feed, and a Motivations system for goal encouragement.

## 1. Friend System (`FriendService.ts`)
- **Bi-directional**: "Friends" are mutual. `friends/{docId}` contains `{ userId, friendId }`.
- **Requests**: `friendRequests` collection tracks pending invites.
- **Rate Limiting**: Limits requests to 10 per hour via `checkRateLimit`.
- **Search**: `searchUsers` performs client-side filtering on names/countries.

## 2. Activity Feed (`FeedService.ts`)
- **Collection**: `feedPosts`.
- **Privacy**: Enforced **server-side** via Firestore `where('userId', 'in', [...friends, self])` query (max 30 IDs per `in` constraint — see Performance section below). The client does not post-filter; the query itself never returns non-friend posts.
- **Post Types**:
    - `goal_started`
    - `goal_completed`
    - `goal_progress` (weekly milestones)
- **Free Goal Fields** (optional, present when `isFreeGoal: true`):
    - `isFreeGoal`: Boolean flag
    - `pledgedExperienceId`: Experience the user pledged as their dream reward
    - `pledgedExperiencePrice`: Price of pledged experience
    - `experienceTitle`, `experienceImageUrl`: Snapshot for display in feed
- **Aggregations**:
    - `reactionCounts`: `{ muscle: 0, heart: 0, like: 0 }` stored directly on the post.
    - `commentCount`: Integer stored on the post.

### Empower Mechanic (Free Goals)
When a feed post is for a free goal with a `pledgedExperience`:
- An "Empower" button appears, allowing friends to buy the pledged experience as a gift
- Milestone posts (25%, 50%, 75%, 100%) show the experience card prominently
- `CompactReactionBar` component handles reactions + Empower CTA

## 3. Motivations (`MotivationService.ts`)
Friends leave encouragement messages on goals. Subcollection: `goals/{goalId}/motivations`.
- See `goals-system.md` for full details.
- Motivations appear before sessions to boost completion rates.

## Key Methods (`FeedService.ts`)
- `createFeedPost`: Adds a feed document. Includes free goal fields when applicable.
- `listenToFeed`: Real-time listener. Returns `unsubscribe` function. Uses `where('userId', 'in', [...])` server-side filter (Firestore `in` query, max 30 friends). Privacy is enforced server-side.
- `updateReactionCount`: Atomic `increment` of reaction counters.

## Performance & Limits
- **FeedScreen memory cap**: 200 posts maximum on infinite scroll to prevent unbounded memory growth.
- **`in` query limit**: `listenToFeed` supports up to 30 friends per Firestore `in` constraint.

## Analytics Integration
- `CommentService.addComment` fires `feed_comment` analytics event.
- `ReactionService.addReaction` fires `feed_reaction` analytics event.
- FeedScreen fires `feed_viewed` on mount/focus.

## Notifications
Fired from the social layer (see `notifications-system.md` for the full notification type list):
- `post_comment` — `CommentService.addComment` → post owner.
- `post_reaction` — `ReactionService` → post owner, aggregated ("Alice and 2 others reacted").
- `experience_empowered` — Checkout success (empower context) → goal owner. Carries `giverName`, `experienceId`, `isMystery`.
- `free_goal_milestone` — milestone feed post creation → friends watching the goal owner.
- `free_goal_completed` — goal owner finished a free goal → friends (empower/congratulate prompt).
- `motivation_received` — `MotivationService.leaveMotivation` → goal owner.
