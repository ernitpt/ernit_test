# Social & Feed System Architecture

## Overview
The social layer consists of a follower/friend graph and a secure Activity Feed.

## 1. Friend System (`FriendService.ts`)
- **Bi-directional**: "Friends" are mutual. `friends/{docId}` contains `{ userId, friendId }`.
- **Requests**: `friendRequests` collection tracks pending invites.
- **Rate Limiting**: Limits requests to 10 per hour via `checkRateLimit`.
- **Search**: `searchUsers` performs client-side filtering on names/countries (Note: This might not scale indefinitely).

## 2. Activity Feed (`FeedService.ts`)
- **Collection**: `feedPosts`.
- **Privacy**: The feed logic pulls *all* recent posts but filters them **client-side** to only show friends + self.
    - *Architectural Note*: This is simple but relies on the client to respect privacy.
- **Post Types**:
    - `goal_started`
    - `goal_completed`
    - `goal_progress` (weekly)
- **Aggregations**:
    - `reactionCounts`: { muscle: 0, heart: 0, like: 0 } stored directly on the post.
    - `commentCount`: Integers stored on the post.

## Key Methods
- `createFeedPost`: Adds a document.
- `listenToFeed`: Real-time listener. returns an `unsubscribe` function to prevent memory leaks.
- `updateReactionCount`: Atomic `increment` of reaction counters.
