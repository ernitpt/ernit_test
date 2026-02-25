# Goal System Architecture

## Overview
The Goal System is the core engine of Ernit, handling user progress, weekly sessions, Valentine's challenges, and **Free Goals** (self-set challenges). Managed by `GoalService.ts`.

## Core Concepts
- **Goal**: The central entity. Tracks `targetCount` (total sessions), `currentCount` (weeks completed), and `weeklyCount` (sessions this week).
- **Weekly Cadence**: Progress is tracked week-by-week. `tickWeeklySession` handles incrementing sessions.
- **Anchored Weeks**: Weeks are calculated relative to `weekStartAt`.
- **Validation**: Strict checks prevent multiple sessions per day (unless in debug mode) or exceeding weekly targets.

## Data Model (Key Fields)
- `targetCount`: Total number of weeks to complete.
- `sessionsPerWeek`: Required sessions per week.
- `currentCount`: Number of *valid* weeks completed.
- `weeklyCount`: Number of sessions completed in the *current* week.
- `weekStartAt`: Timestamp anchoring the current week's start.
- `isCompleted`: True when `currentCount >= targetCount`.
- `isFinished`: True when all requirements met (often synonymous with `isCompleted`, but distinct in Valentine flows).
- `isUnlocked`: Used in Valentine challenges to gate the final reward.
- `isFreeGoal`: Boolean. True for self-set challenges (no purchase required).
- `pledgedExperience`: Optional snapshot `{ experienceId, title, coverImageUrl, subtitle, price }` — the "dream reward" a user picks when creating a free goal.
- `giftAttachDeadline`: Timestamp. 30-day window after completion for friends to attach gifts.

## Goal Types

### 1. Purchased Goals (Original)
Created via Stripe webhook after experience purchase. `experienceGiftId` links to the purchased gift.

### 2. Valentine's Challenge
Paired goals (`partnerGoalId`). Atomic unlock via `checkAndUnlockBothPartners` using Firestore transactions. Partners who finish early wait (`isFinished=true`, `isUnlocked=false`).

### 3. Free Goals ("The Pledge")
Self-set challenges — no purchase required. Created via `createFreeGoal()`.
- `isFreeGoal: true`, `experienceGiftId: ''`, `approvalStatus: 'approved'`
- Optional `pledgedExperience` — a dream reward friends can gift ("Empower")
- Friends can **Empower** (buy the pledged experience) at any time during the challenge
- Goal owner can only **redeem** the experience after completing the goal
- 30-day `giftAttachDeadline` after completion for late gifts
- `attachGiftToGoal()` links a purchased gift to an existing free goal

### Screens
- `PledgeGoalSettingScreen` — Goal type, duration, sessions, optional experience selection
- `FreeGoalCompletionScreen` — Shown when a free goal is completed
- `ChallengeLandingScreen` — Public marketing landing page for free challenges
- `ChallengeSetupScreen` — Challenge builder (goal type + sliders + optional experience)

## Motivations System (`MotivationService.ts`)
Friends leave encouragement messages for goal owners. Stored as subcollection: `goals/{goalId}/motivations`.
- `leaveMotivation()`: Friend writes message (max 500 chars), optional `targetSession`
- `getMotivationsForSession()`: Fetches unseen motivations for current session
- `markMotivationSeen()`: Marks individual motivation as seen
- Data: `{ authorId, authorName, message, targetSession?, seen, createdAt }`

## Key Methods (`GoalService.ts`)
- `createGoal`: Initializes a purchased goal with normalized dates.
- `createFreeGoal`: Creates a self-set challenge. Auto-creates `goal_started` feed post.
- `attachGiftToGoal`: Links a purchased experience gift to an existing free goal.
- `tickWeeklySession`: The main "I did it" action. Handles day validation, week rollover, completion checks, and milestone feed posts.
- `checkAndUnlockBothPartners`: Critical for Valentine flow. Atomic completion check.
- `applyExpiredWeeksSweep`: Maintenance — resets counters if a week passes without completion.

## Security & Validation
- **Input Sanitization**: `normalizeGoal` ensures all dates are valid JS Date objects.
- **Rate Limiting**: `DEBUG_ALLOW_MULTIPLE_PER_DAY` controls session frequency.
- **Gift Attachment**: Validates goal exists, is a free goal, and deadline hasn't expired.
