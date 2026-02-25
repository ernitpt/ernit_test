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
- **Privacy**: Pulls all recent posts but filters **client-side** to only show friends + self.
    - *Architectural Note*: Simple but relies on client to respect privacy.
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
- `listenToFeed`: Real-time listener. Returns `unsubscribe` function.
- `updateReactionCount`: Atomic `increment` of reaction counters.
