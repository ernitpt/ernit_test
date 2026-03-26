# Goal System Architecture

## Overview
The Goal System is the core engine of Ernit, handling user progress, weekly sessions, Valentine's challenges, and **Free Goals** (self-set challenges). Managed by `GoalService.ts`.

## Core Concepts
- **Goal**: The central entity. Tracks `targetCount` (total NUMBER OF WEEKS, not sessions), `currentCount` (weeks completed), and `weeklyCount` (sessions this week).
- **Weekly Cadence**: Progress is tracked week-by-week. `tickWeeklySession` handles incrementing sessions. `currentCount` increments by 1 per completed week, capped at `targetCount` on completion.
- **Anchored Weeks**: Weeks are calculated relative to `weekStartAt`.
- **Validation**: Strict checks prevent multiple sessions per day (unless in debug mode) or exceeding weekly targets.
- **`sweepExpiredWeeks`**: Midnight normalization function that runs on `weekStartAt` to handle expired weeks.

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
- `giftAttachDeadline`: Timestamp. 30-day deadline set **atomically inside the `tickWeeklySession` transaction** on goal completion.
- `isReadyToComplete`: Boolean. Set on shared/Together goals when the completing partner's goal is done but `partnerGoalId` is not yet linked. Prevents premature `isCompleted`. Used instead of `isCompleted` for shared goals without a linked partner.
- `approvalStatus`: Defaults to `'approved'` for legacy/old goals via the `??` operator (backward compatibility).

## Goal Types

### 1. Purchased Goals (Original)
Created via Stripe webhook after experience purchase. `experienceGiftId` links to the purchased gift.

### 2. Together/Shared Challenge (`GoalShared`)
Formerly called `GoalValentine` — renamed to `GoalShared`. A backward-compatibility alias `GoalValentine = GoalShared` is kept in types.
Paired goals (`partnerGoalId`). Atomic unlock via `checkAndUnlockBothPartners` using Firestore transactions. Partners who finish early wait (`isFinished=true`, `isUnlocked=false`).
- **Completion blocking**: Shared goals without `partnerGoalId` set `isReadyToComplete: true` instead of `isCompleted: true` — completion finalizes once both partners are linked.

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
- `applyExpiredWeeksSweep` / `sweepExpiredWeeks`: Maintenance — resets counters if a week passes without completion. Runs midnight normalization on `weekStartAt`.
- `selfEditGoal(goalId, weeks, sessionsPerWeek)`: Recipient edits a self-created goal directly. Validates can't reduce below already-completed weeks or already-logged sessions this week.
- `requestGoalEdit(goalId, weeks, sessionsPerWeek, message?)`: Recipient requests a change to a gifted goal. Creates `pendingEditRequest` on the goal doc and sends `goal_edit_request` notification to giver. Only one pending request allowed at a time.
- `approveGoalEditRequest(goalId)`: Giver approves. Applies the requested changes, clears `pendingEditRequest`, notifies recipient via `goal_edit_response` (approved).
- `rejectGoalEditRequest(goalId)`: Giver rejects. Clears `pendingEditRequest`, notifies recipient via `goal_edit_response` (rejected).

## Goal Edit Flow (gifted goals)
1. Recipient opens 3-dot menu → "Request Edit" → `GoalEditModal` stepper
2. Recipient picks new weeks/sessions + optional message → `requestGoalEdit()`
3. Giver receives `goal_edit_request` notification → `GoalEditApprovalNotification` with Approve/Decline
4. On approve: `approveGoalEditRequest()` — goal updated, recipient notified (green)
5. On reject: `rejectGoalEditRequest()` — no changes, recipient notified (red)
- **pendingEditRequest** field on goal doc: `{ requestedTargetCount, requestedSessionsPerWeek, message, requestedAt, requestedBy }`

## Security & Validation
- **Input Sanitization**: `normalizeGoal` ensures all dates are valid JS Date objects.
- **Rate Limiting**: `DEBUG_ALLOW_MULTIPLE_PER_DAY` controls session frequency.
- **Gift Attachment**: Validates goal exists, is a free goal, and deadline hasn't expired.
