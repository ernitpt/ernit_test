# B2B System Architecture

## Overview
The B2B system powers Ernit's corporate wellness product (ErnitB2B), a separate application where companies create accounts, invite employees, and assign KPI-based fitness goals. All B2B data is isolated in the `ernitxfi` named Firestore database — completely separate from the default B2C database.

## Cloud Functions

All B2B functions are deployed from `functions/src/index.ts` (lines 111–116) and run in `europe-west1`.

| Function | File | Type | Purpose |
|----------|------|------|---------|
| `b2bCreateCompany` | `functions/src/b2bCreateCompany.ts` | `onCall` | Admin signup flow — creates company doc + admin membership + updates user's `companyIds`. Generates a unique slug. |
| `b2bInviteEmployee` | `functions/src/b2bInviteEmployee.ts` | `onCall` | Admin invites a user by email. Creates a `companyInvites` doc with a 64-char hex token, 7-day expiry. |
| `b2bAcceptInvite` | `functions/src/b2bAcceptInvite.ts` | `onCall` | Employee accepts invite by token. Validates expiry + email match, then atomically creates `companyMembers` doc and updates user's `companyIds`. Uses a Firestore transaction to prevent race conditions. |
| `b2bCreateGoal` | `functions/src/b2bCreateGoal.ts` | `onCall` | Admin assigns a KPI to an employee. Validates admin role + active membership, prevents duplicate active goals per KPI, creates goal doc, increments KPI `assignedCount`. |
| `b2bLogSession` | `functions/src/b2bLogSession.ts` | `onCall` | Employee logs a daily session on a goal. Handles week rollover, streak tracking, weekly completion, and goal completion. One session per day enforced via `weeklyLogDates`. |
| `b2bGoalMilestone` | `functions/src/b2bGoalMilestone.ts` | Firestore trigger | Listens to `goals/{goalId}` updates in `ernitxfi`. Auto-posts to `feedPosts` on: goal completion, streak milestones (every 5 sessions), week progress. Uses deterministic doc IDs for idempotency. |

Config helper: `functions/src/b2bConfig.ts` exports a module-level `b2bDb = getFirestore("ernitxfi")`. Most individual functions **do not** use the shared export — they declare their own `const getB2bDb = () => getFirestore("ernitxfi")` and call it lazily inside the handler. Follow that pattern in new functions so the DB handle isn't resolved at module-load time (avoids init-order issues in cold starts).

## Data Model

All collections live in the `ernitxfi` named Firestore database.

| Collection | Doc ID Pattern | Key Fields |
|------------|----------------|------------|
| `companies` | auto-id | `name`, `slug`, `industry`, `adminUserId`, `billingEmail`, `settings` (`allowTeamFeed`, `allowPeerReactions`, `maxKPIsPerEmployee`, `defaultKPIDurationWeeks`), `status` (`trial` / active) |
| `companyMembers` | `{companyId}_{userId}` | `companyId`, `userId`, `role` (`admin` / `employee`), `displayName`, `email`, `department`, `status` (`active`), `invitedBy`, `joinedAt` |
| `companyInvites` | auto-id | `companyId`, `email`, `role`, `department`, `token` (64-char hex), `status` (`pending` / `accepted` / `expired`), `invitedBy`, `expiresAt` (7 days) |
| `companyKPIs` | auto-id | `companyId`, `title`, `targetCount` (weeks), `sessionsPerWeek`, `experienceId?`, `experienceSnapshot?`, `assignedCount`, `completedCount` |
| `goals` | auto-id | `companyId`, `kpiId`, `userId`, `title`, `targetCount`, `currentCount`, `sessionsPerWeek`, `weeklyCount`, `weeklyLogDates`, `weekStartAt`, `isActive`, `isCompleted`, `sessionStreak`, `longestStreak` |
| `feedPosts` | `milestone_{goalId}_{milestoneType}` | `companyId`, `userId`, `userName`, `type` (`goal_completed` / `streak_milestone` / `goal_progress`), `content`, `goalId`, `reactions`, `commentCount` |
| `users` | `{uid}` | `email`, `displayName`, `companyIds[]` |

### Vestigial: `b2bCompanies` collection
`b2bCreateCompany.ts` line 58 queries a `b2bCompanies` collection for slug uniqueness (`.where("slug", "==", slug).limit(1).get()`), but the company doc itself is written to `companies` at line 67. No function writes to `b2bCompanies`, so the uniqueness check is effectively a no-op — the query always returns empty and the random suffix branch never fires. Treat this as a known code defect rather than a second real collection; slugs are not actually enforced as unique. If you care about slug uniqueness, fix the query to hit `companies` instead.

## Flows

### 1. Company Creation
Admin signs up → calls `b2bCreateCompany` with `companyName`, `industry?`, `billingEmail?` → function generates slug (appends random suffix if duplicate), batch-writes: `companies` doc + `companyMembers` admin doc + updates `users/{uid}.companyIds`.

### 2. Employee Invite
Admin calls `b2bInviteEmployee` with target email, `role`, `companyId`, optional `department` → function verifies caller is admin, checks no existing pending invite or active membership, generates crypto token, creates `companyInvites` doc with 7-day expiry. Invite link: `teams.ernit.app/invite/{token}` (email sending is a TODO).

### 3. Goal Creation + Milestone Tracking
Admin calls `b2bCreateGoal` with `companyId`, `kpiId`, `employeeUserId` → transaction verifies admin role, active employee membership, KPI belongs to company, no duplicate active goal → creates `goals` doc from KPI template, increments `kpiId.assignedCount`. `b2bGoalMilestone` trigger fires on updates and posts milestone events to `feedPosts`.

### 4. Session Logging
Employee calls `b2bLogSession` with `goalId` → transaction verifies ownership, active status, no duplicate today log, handles week rollover (resets `weeklyCount`, checks if previous week met target for streak), increments counts, marks `isCompleted` when `currentCount >= targetCount`. On completion, increments `companyKPIs.completedCount` outside the transaction.

## Security & Isolation

- **Separate database**: `ernitxfi` named Firestore database — no shared collections with B2C (`(default)` database).
- **Auth**: Shared Firebase Auth (same UIDs across B2C and B2B), but data is fully isolated.
- **Role enforcement**: All write operations verify caller's `companyMembers` doc inside the same Firestore transaction as the write — no TOCTOU vulnerabilities.
- **Membership scoping**: Composite doc ID `{companyId}_{userId}` means a member of Company A cannot act on Company B data.
- **Input validation**: All functions validate required fields, sanitize strings (slice to safe lengths), and use strict email regex before writing.
- **Firestore Rules**: B2B collections are in a separate named database; the main `firestore.rules` file covers only the default B2C database.

## Integration with B2C

| Shared | Not Shared |
|--------|-----------|
| Firebase Auth (same UIDs) | Firestore database (B2B uses `ernitxfi`) |
| Cloud Functions project (same deployment) | B2C collections (`goals`, `users`, `experienceGifts`, etc.) |
| Experiences catalog (referenced via `experienceId` / `experienceSnapshot` on KPIs) | Stripe payments (B2B has no payment functions yet) |
| Region (`europe-west1`) | Analytics events, notifications system |

## Rate Limits

All B2B `onCall` functions share the same limits:
- `maxInstances: 10`
- `memory: 256MiB`
- `timeoutSeconds: 30`

Session logging enforces **one session per day per goal** via the `weeklyLogDates` array (checked inside a transaction).
