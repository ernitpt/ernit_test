# Goal System Architecture

## Overview
The Goal System is the core engine of Ernit, handling user progress, weekly sessions, and Valentine's Day challenges. It is primarily managed by `GoalService.ts`.

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

## Valentine's Challenge Logic
- **Partner Implementation**: Goals are paired (`partnerGoalId`).
- **Atomic Progression**: `checkAndUnlockBothPartners` uses Firestore transactions to ensure both partners unlock simultaneously.
- **Locking**: Partners who finish early wait (`isFinished=true`, `isUnlocked=false`) until their partner catches up.

## Key Methods (`GoalService.ts`)
- `createGoal`: Initializes a goal with normalized dates.
- `tickWeeklySession`: The main "I did it" action. Handles day validation, week rollover, and completion checks.
- `checkAndUnlockBothPartners`: Critical for Valentine flow. Checks atomic completion.
- `applyExpiredWeeksSweep`: Maintenance function that checks if a week has passed without completion and resets counters.

## Security & Validation
- **Input Sanitization**: `normalizeGoal` ensures all dates are valid JS Date objects.
- **Rate Limiting**: `DEBUG_ALLOW_MULTIPLE_PER_DAY` controls session frequency.
