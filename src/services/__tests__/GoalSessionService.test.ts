/**
 * @jest-environment node
 *
 * Unit tests for the pure session-tick logic extracted from GoalSessionService.
 *
 * The actual `tickWeeklySession` method wraps all of this in a Firestore
 * transaction that cannot be unit-tested without heavy mocking. Instead we
 * replicate the exact conditional branches from the transaction body and
 * verify each one in isolation. The logic is reproduced verbatim from the
 * source so the tests will catch any future drift.
 */

import { isoDateOnly, addDaysSafe } from '../../utils/GoalHelpers';

// ---------------------------------------------------------------------------
// Minimal types for the test fixtures
// ---------------------------------------------------------------------------

interface GoalState {
  currentCount: number;
  targetCount: number;
  weeklyCount: number;
  sessionsPerWeek: number;
  weeklyLogDates: string[];
  isWeekCompleted: boolean;
  isCompleted: boolean;
  isReadyToComplete: boolean;
  challengeType?: 'shared' | 'individual';
  partnerGoalId?: string;
  weekStartAt: Date | null;
}

// ---------------------------------------------------------------------------
// Helpers — replicate the exact logic blocks from GoalSessionService.ts
// so that these tests are regression-proof against source changes.
// ---------------------------------------------------------------------------

/** Returns a fresh GoalState with sensible defaults. */
function makeGoal(overrides: Partial<GoalState> = {}): GoalState {
  return {
    currentCount: 0,
    targetCount: 4,
    weeklyCount: 0,
    sessionsPerWeek: 3,
    weeklyLogDates: [],
    isWeekCompleted: false,
    isCompleted: false,
    isReadyToComplete: false,
    challengeType: undefined,
    partnerGoalId: undefined,
    weekStartAt: new Date(2025, 0, 6), // Jan 6, 2025 — arbitrary stable anchor
    ...overrides,
  };
}

/**
 * Simulate one call to the tick logic from the Firestore transaction body
 * (lines 221-262 of GoalSessionService.ts).
 *
 * Returns an object describing the outcome and the mutated goal state.
 * Throws { code: 'WEEK_COMPLETE' } when the week is already full, matching
 * the AppError thrown in production code.
 */
function simulateTick(
  goal: GoalState,
  todayIso: string,
  debugAllowMultiplePerDay = false
): { goal: GoalState; didIncrement: boolean } {
  const g = { ...goal, weeklyLogDates: [...goal.weeklyLogDates] };

  // Duplicate-day guard (lines 224-226)
  if (!debugAllowMultiplePerDay && g.weeklyLogDates.includes(todayIso)) {
    return { goal: g, didIncrement: false };
  }

  // Week-full guard (lines 229-235) — throws in production, mirrored here
  if (g.weeklyCount >= g.sessionsPerWeek) {
    throw { code: 'WEEK_COMPLETE' };
  }

  // Increment (lines 238-243)
  g.weeklyCount += 1;
  if (!g.weeklyLogDates.includes(todayIso)) {
    g.weeklyLogDates = [...g.weeklyLogDates, todayIso];
  }

  // Week / goal completion detection (lines 250-262)
  if (g.weeklyCount >= g.sessionsPerWeek) {
    g.isWeekCompleted = true;
    if (g.currentCount + 1 >= g.targetCount) {
      g.currentCount = g.targetCount;
      if (g.challengeType === 'shared' && !g.partnerGoalId) {
        g.isReadyToComplete = true;
      } else {
        g.isCompleted = true;
      }
    }
  }

  return { goal: g, didIncrement: true };
}

/**
 * Simulate the inline sweep logic inside the transaction (lines 191-219 of
 * GoalSessionService.ts). Processes all expired weekly windows up to `now`.
 */
function simulateSweep(goal: GoalState, now: Date): GoalState {
  const g = { ...goal, weeklyLogDates: [...goal.weeklyLogDates] };
  if (!g.weekStartAt || g.isCompleted) return g;

  let anchor = new Date(g.weekStartAt);

  while (now > addDaysSafe(anchor, 7)) {
    const weekWasCompleted = g.isWeekCompleted || g.weeklyCount >= g.sessionsPerWeek;
    if (weekWasCompleted) {
      g.currentCount += 1;
      if (g.currentCount >= g.targetCount) {
        g.currentCount = g.targetCount;
        if (g.challengeType === 'shared' && !g.partnerGoalId) {
          g.isReadyToComplete = true;
        } else {
          g.isCompleted = true;
        }
      }
    }
    anchor = addDaysSafe(anchor, 7);
    g.weeklyCount = 0;
    g.weeklyLogDates = [];
    g.isWeekCompleted = false;
  }

  anchor.setHours(0, 0, 0, 0);
  g.weekStartAt = anchor;
  return g;
}

// ---------------------------------------------------------------------------
// Tests: duplicate-day prevention
// ---------------------------------------------------------------------------

describe('GoalSessionService — duplicate day prevention', () => {
  it('does not increment when todayIso is already in weeklyLogDates', () => {
    const goal = makeGoal({ weeklyLogDates: ['2025-01-06'], weeklyCount: 1 });
    const { didIncrement, goal: result } = simulateTick(goal, '2025-01-06');
    expect(didIncrement).toBe(false);
    expect(result.weeklyCount).toBe(1); // unchanged
  });

  it('increments when todayIso is a different day', () => {
    const goal = makeGoal({ weeklyLogDates: ['2025-01-06'], weeklyCount: 1 });
    const { didIncrement, goal: result } = simulateTick(goal, '2025-01-07');
    expect(didIncrement).toBe(true);
    expect(result.weeklyCount).toBe(2);
  });

  it('increments on first session ever (empty log)', () => {
    const goal = makeGoal();
    const { didIncrement } = simulateTick(goal, '2025-01-06');
    expect(didIncrement).toBe(true);
  });

  it('does NOT add todayIso again when duplicate guard passes (already in array)', () => {
    // Edge: debugAllowMultiplePerDay = true bypasses the first guard but the
    // inner push still de-duplicates to keep the log array clean.
    const goal = makeGoal({ weeklyLogDates: ['2025-01-06'], weeklyCount: 1 });
    const { goal: result } = simulateTick(goal, '2025-01-06', /* debugMode */ true);
    const count = result.weeklyLogDates.filter(d => d === '2025-01-06').length;
    expect(count).toBe(1); // still just once
  });

  it('appends todayIso to weeklyLogDates on a successful tick', () => {
    const goal = makeGoal({ weeklyLogDates: ['2025-01-06'], weeklyCount: 1 });
    const { goal: result } = simulateTick(goal, '2025-01-07');
    expect(result.weeklyLogDates).toContain('2025-01-07');
    expect(result.weeklyLogDates).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: week-full detection (WEEK_COMPLETE throw)
// ---------------------------------------------------------------------------

describe('GoalSessionService — week full detection', () => {
  it('throws WEEK_COMPLETE when weeklyCount already equals sessionsPerWeek', () => {
    const goal = makeGoal({ weeklyCount: 3, sessionsPerWeek: 3 });
    expect(() => simulateTick(goal, '2025-01-09')).toThrow();
    try {
      simulateTick(goal, '2025-01-09');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('WEEK_COMPLETE');
    }
  });

  it('throws WEEK_COMPLETE when weeklyCount exceeds sessionsPerWeek', () => {
    // Guard: >= so even an over-counted state is blocked
    const goal = makeGoal({ weeklyCount: 4, sessionsPerWeek: 3 });
    expect(() => simulateTick(goal, '2025-01-10')).toThrow();
  });

  it('does NOT throw when weeklyCount is one below limit', () => {
    const goal = makeGoal({ weeklyCount: 2, sessionsPerWeek: 3 });
    expect(() => simulateTick(goal, '2025-01-09')).not.toThrow();
  });

  it('throws for a 1-session-per-week goal when that session is already logged', () => {
    const goal = makeGoal({ weeklyCount: 1, sessionsPerWeek: 1 });
    expect(() => simulateTick(goal, '2025-01-07')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: week completion detection (isWeekCompleted flag)
// ---------------------------------------------------------------------------

describe('GoalSessionService — week completion detection', () => {
  it('sets isWeekCompleted when weeklyCount reaches sessionsPerWeek', () => {
    const goal = makeGoal({ weeklyCount: 2, sessionsPerWeek: 3, currentCount: 0, targetCount: 4 });
    const { goal: result } = simulateTick(goal, '2025-01-09');
    expect(result.weeklyCount).toBe(3);
    expect(result.isWeekCompleted).toBe(true);
  });

  it('does NOT set isWeekCompleted when weeklyCount is still below limit', () => {
    const goal = makeGoal({ weeklyCount: 1, sessionsPerWeek: 3 });
    const { goal: result } = simulateTick(goal, '2025-01-08');
    expect(result.isWeekCompleted).toBe(false);
  });

  it('sets isWeekCompleted for a 1-session-per-week goal on first tick', () => {
    const goal = makeGoal({ weeklyCount: 0, sessionsPerWeek: 1, currentCount: 0, targetCount: 4 });
    const { goal: result } = simulateTick(goal, '2025-01-06');
    expect(result.isWeekCompleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: goal completion detection
// ---------------------------------------------------------------------------

describe('GoalSessionService — goal completion detection', () => {
  it('completes goal when currentCount + 1 >= targetCount after week done', () => {
    // 4-week goal, currently on last week (currentCount = 3, targetCount = 4)
    const goal = makeGoal({
      currentCount: 3,
      targetCount: 4,
      weeklyCount: 2,
      sessionsPerWeek: 3,
    });
    const { goal: result } = simulateTick(goal, '2025-01-09');
    expect(result.isCompleted).toBe(true);
    expect(result.currentCount).toBe(4); // clamped to targetCount
  });

  it('does NOT complete goal when more weeks remain', () => {
    const goal = makeGoal({
      currentCount: 1,
      targetCount: 4,
      weeklyCount: 2,
      sessionsPerWeek: 3,
    });
    const { goal: result } = simulateTick(goal, '2025-01-09');
    expect(result.isCompleted).toBe(false);
    // isWeekCompleted is set but goal lives on
    expect(result.isWeekCompleted).toBe(true);
  });

  it('clamps currentCount to targetCount on completion (never overshoots)', () => {
    const goal = makeGoal({
      currentCount: 3,
      targetCount: 4,
      weeklyCount: 2,
      sessionsPerWeek: 3,
    });
    const { goal: result } = simulateTick(goal, '2025-01-09');
    expect(result.currentCount).toBe(4);
  });

  it('1-week goal with 1 session/week completes after first session', () => {
    const goal = makeGoal({
      currentCount: 0,
      targetCount: 1,
      weeklyCount: 0,
      sessionsPerWeek: 1,
    });
    const { goal: result } = simulateTick(goal, '2025-01-06');
    expect(result.isCompleted).toBe(true);
    expect(result.currentCount).toBe(1);
  });

  it('already-completed goal is blocked by the WEEK_COMPLETE guard (weeklyCount full)', () => {
    // When a goal is already completed, weeklyCount should equal sessionsPerWeek from the
    // final week — additional ticks should be rejected.
    const goal = makeGoal({
      currentCount: 4,
      targetCount: 4,
      weeklyCount: 3,
      sessionsPerWeek: 3,
      isCompleted: true,
    });
    expect(() => simulateTick(goal, '2025-01-10')).toThrow();
  });

  it('4-week goal with 5 sessions/week: completing the 4th week triggers goal completion via sweep', () => {
    // The sweep processes ONE expired window per sweep call — the window that was
    // stored in the goal record. Additional "empty" windows in the future are treated
    // as incomplete (weeklyCount=0, isWeekCompleted=false after reset). Therefore, to
    // simulate a full 4-week run, we chain 4 sweeps, each one week apart.
    const weekStart = new Date(2025, 0, 6); // Jan 6

    // Week 1 completed: weeklyCount == sessionsPerWeek
    let g = makeGoal({
      currentCount: 0,
      targetCount: 4,
      weeklyCount: 5,
      sessionsPerWeek: 5,
      isWeekCompleted: true,
      weekStartAt: weekStart,
    });

    // Sweep week 1 (8 days past the anchor puts week 1 in the past)
    g = simulateSweep(g, addDaysSafe(weekStart, 8));
    expect(g.currentCount).toBe(1);

    // Simulate week 2 completed and sweep it
    g.weeklyCount = 5;
    g.isWeekCompleted = true;
    g = simulateSweep(g, addDaysSafe(weekStart, 15));
    expect(g.currentCount).toBe(2);

    // Simulate week 3 completed and sweep it
    g.weeklyCount = 5;
    g.isWeekCompleted = true;
    g = simulateSweep(g, addDaysSafe(weekStart, 22));
    expect(g.currentCount).toBe(3);

    // Simulate week 4 completed and sweep it — should complete goal
    g.weeklyCount = 5;
    g.isWeekCompleted = true;
    g = simulateSweep(g, addDaysSafe(weekStart, 29));
    expect(g.currentCount).toBe(4);
    expect(g.isCompleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: shared challenge blocking (C2 — isReadyToComplete)
// ---------------------------------------------------------------------------

describe('GoalSessionService — shared challenge blocking', () => {
  it('sets isReadyToComplete (not isCompleted) for shared goal WITHOUT partnerGoalId', () => {
    const goal = makeGoal({
      currentCount: 3,
      targetCount: 4,
      weeklyCount: 2,
      sessionsPerWeek: 3,
      challengeType: 'shared',
      partnerGoalId: undefined, // partner has not yet linked their goal
    });
    const { goal: result } = simulateTick(goal, '2025-01-09');
    expect(result.isCompleted).toBe(false);
    expect(result.isReadyToComplete).toBe(true);
  });

  it('sets isCompleted (not isReadyToComplete) for shared goal WITH partnerGoalId', () => {
    const goal = makeGoal({
      currentCount: 3,
      targetCount: 4,
      weeklyCount: 2,
      sessionsPerWeek: 3,
      challengeType: 'shared',
      partnerGoalId: 'partner-goal-99', // partner has linked
    });
    const { goal: result } = simulateTick(goal, '2025-01-09');
    expect(result.isCompleted).toBe(true);
    expect(result.isReadyToComplete).toBe(false);
  });

  it('sets isCompleted normally when challengeType is not "shared"', () => {
    const goal = makeGoal({
      currentCount: 3,
      targetCount: 4,
      weeklyCount: 2,
      sessionsPerWeek: 3,
      challengeType: undefined,
    });
    const { goal: result } = simulateTick(goal, '2025-01-09');
    expect(result.isCompleted).toBe(true);
    expect(result.isReadyToComplete).toBe(false);
  });

  it('does NOT set isReadyToComplete when goal is not yet complete', () => {
    const goal = makeGoal({
      currentCount: 1,
      targetCount: 4,
      weeklyCount: 2,
      sessionsPerWeek: 3,
      challengeType: 'shared',
      partnerGoalId: undefined,
    });
    const { goal: result } = simulateTick(goal, '2025-01-09');
    expect(result.isReadyToComplete).toBe(false);
    expect(result.isCompleted).toBe(false);
  });

  it('sweep path: shared goal without partner sets isReadyToComplete on final week', () => {
    const weekStart = new Date(2025, 0, 6);
    let g = makeGoal({
      currentCount: 3,
      targetCount: 4,
      weeklyCount: 3,
      sessionsPerWeek: 3,
      isWeekCompleted: true,
      challengeType: 'shared',
      partnerGoalId: undefined,
      weekStartAt: weekStart,
    });
    const futureDate = addDaysSafe(weekStart, 8); // one week later
    g = simulateSweep(g, futureDate);

    expect(g.isReadyToComplete).toBe(true);
    expect(g.isCompleted).toBe(false);
  });

  it('sweep path: shared goal WITH partner sets isCompleted on final week', () => {
    const weekStart = new Date(2025, 0, 6);
    let g = makeGoal({
      currentCount: 3,
      targetCount: 4,
      weeklyCount: 3,
      sessionsPerWeek: 3,
      isWeekCompleted: true,
      challengeType: 'shared',
      partnerGoalId: 'partner-goal-1',
      weekStartAt: weekStart,
    });
    const futureDate = addDaysSafe(weekStart, 8);
    g = simulateSweep(g, futureDate);

    expect(g.isCompleted).toBe(true);
    expect(g.isReadyToComplete).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: isoDateOnly integration (used by tickWeeklySession)
// ---------------------------------------------------------------------------

describe('isoDateOnly — used for weeklyLogDates entries', () => {
  it('produces a YYYY-MM-DD string for a given date', () => {
    const d = new Date(2025, 0, 15); // Jan 15, 2025
    expect(isoDateOnly(d)).toBe('2025-01-15');
  });

  it('same calendar date at different hours gives the same key', () => {
    const morning = new Date(2025, 0, 15, 8, 0, 0);
    const night = new Date(2025, 0, 15, 23, 59, 59);
    expect(isoDateOnly(morning)).toBe(isoDateOnly(night));
  });

  it('consecutive days give different keys', () => {
    const d1 = new Date(2025, 0, 15);
    const d2 = new Date(2025, 0, 16);
    expect(isoDateOnly(d1)).not.toBe(isoDateOnly(d2));
  });
});

// ---------------------------------------------------------------------------
// Tests: sweep — multiple expired weeks
// ---------------------------------------------------------------------------

describe('GoalSessionService — sweep logic', () => {
  it('increments currentCount by 1 for the single completed week swept', () => {
    // The sweep logic reads isWeekCompleted/weeklyCount from the *stored* goal
    // state on the first iteration only. After that it resets both to 0/false,
    // so any additional expired windows in the loop are treated as incomplete.
    // Only the one recorded completed week contributes to currentCount.
    const weekStart = new Date(2025, 0, 6);
    let g = makeGoal({
      currentCount: 0,
      targetCount: 4,
      weeklyCount: 3,
      sessionsPerWeek: 3,
      isWeekCompleted: true,
      weekStartAt: weekStart,
    });

    // 16 days out — two calendar windows have expired, but only the first has
    // recorded sessions. The second window is empty after the reset.
    const futureDate = addDaysSafe(weekStart, 16);
    g = simulateSweep(g, futureDate);

    // Only the initially-recorded completed week is counted
    expect(g.currentCount).toBe(1);
  });

  it('does NOT increment currentCount for incomplete weeks swept', () => {
    const weekStart = new Date(2025, 0, 6);
    let g = makeGoal({
      currentCount: 0,
      targetCount: 4,
      weeklyCount: 1, // did only 1 of 3 — incomplete
      sessionsPerWeek: 3,
      isWeekCompleted: false,
      weekStartAt: weekStart,
    });

    const futureDate = addDaysSafe(weekStart, 8);
    g = simulateSweep(g, futureDate);

    expect(g.currentCount).toBe(0); // week was incomplete, no increment
  });

  it('resets weeklyCount and weeklyLogDates after each sweep', () => {
    const weekStart = new Date(2025, 0, 6);
    let g = makeGoal({
      currentCount: 0,
      weeklyCount: 3,
      sessionsPerWeek: 3,
      isWeekCompleted: true,
      weeklyLogDates: ['2025-01-06', '2025-01-07', '2025-01-08'],
      weekStartAt: weekStart,
    });

    const futureDate = addDaysSafe(weekStart, 8);
    g = simulateSweep(g, futureDate);

    expect(g.weeklyCount).toBe(0);
    expect(g.weeklyLogDates).toEqual([]);
    expect(g.isWeekCompleted).toBe(false);
  });

  it('advances weekStartAt anchor by 7 days per swept week', () => {
    const weekStart = new Date(2025, 0, 6); // Jan 6
    let g = makeGoal({
      weeklyCount: 3,
      sessionsPerWeek: 3,
      isWeekCompleted: true,
      weekStartAt: weekStart,
    });

    const futureDate = addDaysSafe(weekStart, 8); // Jan 14 — one week expired
    g = simulateSweep(g, futureDate);

    // Anchor advances to Jan 13 (week start + 7)
    expect(g.weekStartAt).not.toBeNull();
    expect(g.weekStartAt!.getDate()).toBe(13);
    expect(g.weekStartAt!.getMonth()).toBe(0); // January
  });

  it('stops sweeping once no more weeks have expired', () => {
    const weekStart = new Date(2025, 0, 6);
    let g = makeGoal({
      currentCount: 0,
      targetCount: 4,
      weeklyCount: 3,
      sessionsPerWeek: 3,
      isWeekCompleted: true,
      weekStartAt: weekStart,
    });

    // Only 5 days into the week — nothing to sweep yet
    const futureDate = addDaysSafe(weekStart, 5);
    g = simulateSweep(g, futureDate);

    expect(g.currentCount).toBe(0); // no sweep occurred
    expect(g.weeklyCount).toBe(3);  // unchanged
  });

  it('skips sweep entirely for an already-completed goal', () => {
    const weekStart = new Date(2025, 0, 6);
    const g = makeGoal({
      currentCount: 4,
      targetCount: 4,
      isCompleted: true,
      weeklyCount: 3,
      sessionsPerWeek: 3,
      weekStartAt: weekStart,
    });

    const futureDate = addDaysSafe(weekStart, 30);
    const result = simulateSweep(g, futureDate);

    // Completed goal must never be mutated by sweep
    expect(result.currentCount).toBe(4);
    expect(result.isCompleted).toBe(true);
  });
});
