/**
 * @jest-environment node
 *
 * GoalHelpers contains pure TypeScript with no React Native dependencies,
 * so we run it in the node environment to avoid loading native modules.
 */
import {
  isoDateOnly,
  isValidDate,
  toJSDate,
  addDaysSafe,
  normalizeGoal,
} from '../GoalHelpers';
import { DateHelper } from '../DateHelper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal raw goal record that satisfies normalizeGoal's input type */
const makeRawGoal = (overrides: Record<string, unknown> = {}): Record<string, unknown> & { id: string } => ({
  id: 'goal-1',
  userId: 'user-1',
  experienceGiftId: 'exp-1',
  title: 'Run a 5K',
  description: 'Train for 5K',
  frequency: 'daily',
  duration: 30,
  isActive: true,
  isCompleted: false,
  isRevealed: false,
  targetHours: 0,
  targetMinutes: 30,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  startDate: new Date('2025-01-01T00:00:00.000Z'),
  endDate: new Date('2025-01-08T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  ...overrides,
});

/** A Firestore Timestamp-like object */
const makeTimestamp = (date: Date) => ({
  toDate: () => date,
});

// ---------------------------------------------------------------------------
// isoDateOnly
// ---------------------------------------------------------------------------

describe('isoDateOnly', () => {
  it('returns YYYY-MM-DD for a standard date', () => {
    expect(isoDateOnly(new Date('2025-06-15T00:00:00.000Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('zero-pads month and day', () => {
    // Use local time explicitly to avoid UTC shift surprises
    const d = new Date(2025, 0, 5); // Jan 5, 2025 local time
    const result = isoDateOnly(d);
    expect(result).toBe('2025-01-05');
  });

  it('handles end of year boundary', () => {
    const d = new Date(2024, 11, 31); // Dec 31, 2024 local
    expect(isoDateOnly(d)).toBe('2024-12-31');
  });

  it('handles beginning of year boundary', () => {
    const d = new Date(2025, 0, 1); // Jan 1, 2025 local
    expect(isoDateOnly(d)).toBe('2025-01-01');
  });

  it('returns a string of length 10', () => {
    expect(isoDateOnly(new Date(2025, 5, 3))).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// isValidDate
// ---------------------------------------------------------------------------

describe('isValidDate', () => {
  it('returns true for a valid Date object', () => {
    expect(isValidDate(new Date())).toBe(true);
  });

  it('returns true for a historical date', () => {
    expect(isValidDate(new Date('2000-01-01'))).toBe(true);
  });

  it('returns false for an invalid Date (NaN)', () => {
    expect(isValidDate(new Date('not-a-date'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidDate(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidDate(undefined)).toBe(false);
  });

  it('returns false for a plain number', () => {
    expect(isValidDate(1234567890)).toBe(false);
  });

  it('returns false for a date-like string', () => {
    expect(isValidDate('2025-01-01')).toBe(false);
  });

  it('returns false for a plain object', () => {
    expect(isValidDate({ year: 2025 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toJSDate
// ---------------------------------------------------------------------------

describe('toJSDate', () => {
  it('returns null for null', () => {
    expect(toJSDate(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(toJSDate(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(toJSDate('')).toBeNull();
  });

  it('converts a Firestore Timestamp-like object via .toDate()', () => {
    const date = new Date('2025-03-10T12:00:00.000Z');
    const ts = makeTimestamp(date);
    const result = toJSDate(ts);
    expect(result).toEqual(date);
  });

  it('calls .toDate() on Timestamp-like object only once', () => {
    const date = new Date('2025-03-10T12:00:00.000Z');
    const toDateSpy = jest.fn().mockReturnValue(date);
    toJSDate({ toDate: toDateSpy });
    expect(toDateSpy).toHaveBeenCalledTimes(1);
  });

  it('converts a valid ISO string to a Date', () => {
    const result = toJSDate('2025-06-15T00:00:00.000Z');
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe('2025-06-15T00:00:00.000Z');
  });

  it('converts a valid Date object to itself (passes through as Date)', () => {
    const d = new Date('2025-01-01T00:00:00.000Z');
    const result = toJSDate(d);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBe(d.getTime());
  });

  it('converts a numeric timestamp to a Date', () => {
    const ts = new Date('2025-01-01T00:00:00.000Z').getTime();
    const result = toJSDate(ts);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBe(ts);
  });

  it('returns null for an invalid date string', () => {
    expect(toJSDate('not-a-date')).toBeNull();
  });

  it('returns null for a non-date object without .toDate()', () => {
    expect(toJSDate({ foo: 'bar' })).toBeNull();
  });

  it('handles an object with toDate that is not a function (ignores it)', () => {
    // toDate exists but is not a function — falls through to new Date(value)
    // which will be NaN for a plain object, so returns null
    expect(toJSDate({ toDate: 'not-a-function' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addDaysSafe
// ---------------------------------------------------------------------------

describe('addDaysSafe', () => {
  beforeEach(() => {
    DateHelper.reset();
  });

  it('adds positive days to a base date', () => {
    const base = new Date(2025, 0, 1); // Jan 1, 2025
    const result = addDaysSafe(base, 7);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(8);
  });

  it('adds zero days and returns the same calendar date', () => {
    const base = new Date(2025, 5, 15); // Jun 15, 2025
    const result = addDaysSafe(base, 0);
    expect(result.getDate()).toBe(15);
    expect(result.getMonth()).toBe(5);
  });

  it('normalizes result to midnight (00:00:00.000)', () => {
    const base = new Date(2025, 3, 10, 15, 30, 45, 999); // Apr 10 at 15:30:45.999
    const result = addDaysSafe(base, 1);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('handles adding negative days (goes back in time)', () => {
    const base = new Date(2025, 0, 10); // Jan 10
    const result = addDaysSafe(base, -5);
    expect(result.getDate()).toBe(5);
  });

  it('crosses month boundaries correctly', () => {
    const base = new Date(2025, 0, 28); // Jan 28
    const result = addDaysSafe(base, 7);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(4);
  });

  it('uses DateHelper.now() when base is null', () => {
    const before = DateHelper.now();
    const result = addDaysSafe(null, 0);
    const after = DateHelper.now();
    // Result should be midnight on today's date
    expect(result.getHours()).toBe(0);
    expect(result.getFullYear()).toBeGreaterThanOrEqual(before.getFullYear());
    expect(result.getTime()).toBeLessThanOrEqual(after.getTime() + 1);
  });

  it('uses DateHelper.now() when base is undefined', () => {
    const result = addDaysSafe(undefined, 0);
    expect(result.getHours()).toBe(0);
    expect(result).toBeInstanceOf(Date);
  });

  it('uses DateHelper.now() when base is an invalid Date', () => {
    const result = addDaysSafe(new Date('invalid'), 0);
    expect(result).toBeInstanceOf(Date);
    expect(result.getHours()).toBe(0);
  });

  it('does not mutate the base date', () => {
    const base = new Date(2025, 0, 1);
    const originalTime = base.getTime();
    addDaysSafe(base, 10);
    expect(base.getTime()).toBe(originalTime);
  });
});

// ---------------------------------------------------------------------------
// normalizeGoal
// ---------------------------------------------------------------------------

describe('normalizeGoal', () => {
  beforeEach(() => {
    DateHelper.reset();
  });

  it('preserves valid Date objects for startDate and endDate', () => {
    const start = new Date('2025-03-01T00:00:00.000Z');
    const end = new Date('2025-03-08T00:00:00.000Z');
    const result = normalizeGoal(makeRawGoal({ startDate: start, endDate: end }));
    expect(result.startDate).toEqual(start);
    expect(result.endDate).toEqual(end);
  });

  it('converts Firestore Timestamp-like startDate and endDate', () => {
    const start = new Date('2025-04-01T00:00:00.000Z');
    const end = new Date('2025-04-08T00:00:00.000Z');
    const result = normalizeGoal(
      makeRawGoal({
        startDate: makeTimestamp(start),
        endDate: makeTimestamp(end),
      })
    );
    expect(result.startDate).toEqual(start);
    expect(result.endDate).toEqual(end);
  });

  it('converts ISO string dates for startDate and endDate', () => {
    const result = normalizeGoal(
      makeRawGoal({
        startDate: '2025-05-01T00:00:00.000Z',
        endDate: '2025-05-08T00:00:00.000Z',
      })
    );
    expect(result.startDate).toBeInstanceOf(Date);
    expect(result.endDate).toBeInstanceOf(Date);
  });

  it('falls back to DateHelper.now() when startDate is missing', () => {
    const raw = makeRawGoal({ startDate: null, endDate: null });
    const before = DateHelper.now();
    const result = normalizeGoal(raw);
    const after = DateHelper.now();
    expect((result.startDate as Date).getTime()).toBeGreaterThanOrEqual(before.getTime() - 5);
    expect((result.startDate as Date).getTime()).toBeLessThanOrEqual(after.getTime() + 5);
  });

  it('falls back endDate to startDate + 7 days when endDate is missing', () => {
    // Use a local-midnight date to avoid UTC/DST offset mismatches in the diff check
    const start = new Date(2025, 5, 1, 0, 0, 0, 0); // Jun 1, 2025 local midnight
    const result = normalizeGoal(makeRawGoal({ startDate: start, endDate: null }));
    expect(result.endDate).toBeInstanceOf(Date);
    // addDaysSafe normalises to local midnight, so the calendar date must be +7 days
    expect(result.endDate.getFullYear()).toBe(2025);
    expect(result.endDate.getMonth()).toBe(5);  // June (0-indexed)
    expect(result.endDate.getDate()).toBe(8);   // Jun 8
    expect(result.endDate.getHours()).toBe(0);
    expect(result.endDate.getMinutes()).toBe(0);
  });

  it('defaults targetCount to 1 when missing', () => {
    const result = normalizeGoal(makeRawGoal({ targetCount: undefined }));
    expect(result.targetCount).toBe(1);
  });

  it('preserves a provided targetCount', () => {
    const result = normalizeGoal(makeRawGoal({ targetCount: 5 }));
    expect(result.targetCount).toBe(5);
  });

  it('defaults weeklyCount to 0 when missing', () => {
    const result = normalizeGoal(makeRawGoal({ weeklyCount: undefined }));
    expect(result.weeklyCount).toBe(0);
  });

  it('defaults currentCount to 0 when missing', () => {
    const result = normalizeGoal(makeRawGoal({ currentCount: undefined }));
    expect(result.currentCount).toBe(0);
  });

  it('defaults sessionsPerWeek to 1 when missing', () => {
    const result = normalizeGoal(makeRawGoal({ sessionsPerWeek: undefined }));
    expect(result.sessionsPerWeek).toBe(1);
  });

  it('defaults weeklyLogDates to [] when missing', () => {
    const result = normalizeGoal(makeRawGoal({ weeklyLogDates: undefined }));
    expect(result.weeklyLogDates).toEqual([]);
  });

  it('preserves a non-empty weeklyLogDates array', () => {
    const dates = ['2025-01-01', '2025-01-02'];
    const result = normalizeGoal(makeRawGoal({ weeklyLogDates: dates }));
    expect(result.weeklyLogDates).toEqual(dates);
  });

  it('coerces isCompleted to boolean', () => {
    expect(normalizeGoal(makeRawGoal({ isCompleted: 1 })).isCompleted).toBe(true);
    expect(normalizeGoal(makeRawGoal({ isCompleted: 0 })).isCompleted).toBe(false);
    expect(normalizeGoal(makeRawGoal({ isCompleted: undefined })).isCompleted).toBe(false);
  });

  it('coerces isWeekCompleted to boolean', () => {
    expect(normalizeGoal(makeRawGoal({ isWeekCompleted: true })).isWeekCompleted).toBe(true);
    expect(normalizeGoal(makeRawGoal({ isWeekCompleted: null })).isWeekCompleted).toBe(false);
  });

  it('sets approvalStatus to "approved" for free goals when not specified', () => {
    const result = normalizeGoal(makeRawGoal({ isFreeGoal: true, approvalStatus: undefined }));
    expect(result.approvalStatus).toBe('approved');
  });

  it('defaults approvalStatus to "approved" for old goals without the field (backward compat)', () => {
    const result = normalizeGoal(makeRawGoal({ isFreeGoal: false, approvalStatus: undefined }));
    expect(result.approvalStatus).toBe('approved');
  });

  it('preserves an explicit approvalStatus over the default', () => {
    const result = normalizeGoal(makeRawGoal({ approvalStatus: 'rejected' }));
    expect(result.approvalStatus).toBe('rejected');
  });

  it('defaults suggestedTargetCount to null when missing', () => {
    const result = normalizeGoal(makeRawGoal({ suggestedTargetCount: undefined }));
    expect(result.suggestedTargetCount).toBeNull();
  });

  it('preserves numeric suggestedTargetCount', () => {
    const result = normalizeGoal(makeRawGoal({ suggestedTargetCount: 3 }));
    expect(result.suggestedTargetCount).toBe(3);
  });

  it('converts approvalRequestedAt Timestamp-like value', () => {
    const date = new Date('2025-02-14T00:00:00.000Z');
    const result = normalizeGoal(makeRawGoal({ approvalRequestedAt: makeTimestamp(date) }));
    expect(result.approvalRequestedAt).toEqual(date);
  });

  it('sets approvalRequestedAt to null when missing', () => {
    const result = normalizeGoal(makeRawGoal({ approvalRequestedAt: undefined }));
    expect(result.approvalRequestedAt).toBeNull();
  });

  it('coerces giverActionTaken to boolean', () => {
    expect(normalizeGoal(makeRawGoal({ giverActionTaken: true })).giverActionTaken).toBe(true);
    expect(normalizeGoal(makeRawGoal({ giverActionTaken: undefined })).giverActionTaken).toBe(false);
  });

  it('coerces isFreeGoal to boolean', () => {
    expect(normalizeGoal(makeRawGoal({ isFreeGoal: true })).isFreeGoal).toBe(true);
    expect(normalizeGoal(makeRawGoal({ isFreeGoal: undefined })).isFreeGoal).toBe(false);
  });

  it('sets pledgedExperience to null when missing', () => {
    const result = normalizeGoal(makeRawGoal({ pledgedExperience: undefined }));
    expect(result.pledgedExperience).toBeNull();
  });

  it('converts pledgedAt Timestamp-like value', () => {
    const date = new Date('2025-01-15T00:00:00.000Z');
    const result = normalizeGoal(makeRawGoal({ pledgedAt: makeTimestamp(date) }));
    expect(result.pledgedAt).toEqual(date);
  });

  it('sets pledgedAt to null when missing', () => {
    const result = normalizeGoal(makeRawGoal({ pledgedAt: undefined }));
    expect(result.pledgedAt).toBeNull();
  });

  it('converts giftAttachedAt and giftAttachDeadline Timestamp-like values', () => {
    const attached = new Date('2025-02-01T00:00:00.000Z');
    const deadline = new Date('2025-02-07T00:00:00.000Z');
    const result = normalizeGoal(
      makeRawGoal({
        giftAttachedAt: makeTimestamp(attached),
        giftAttachDeadline: makeTimestamp(deadline),
      })
    );
    expect(result.giftAttachedAt).toEqual(attached);
    expect(result.giftAttachDeadline).toEqual(deadline);
  });

  it('preserves the goal id', () => {
    const result = normalizeGoal(makeRawGoal({ id: 'my-goal-id' }));
    expect(result.id).toBe('my-goal-id');
  });

  it('falls back initialTargetCount to targetCount when not specified', () => {
    const result = normalizeGoal(makeRawGoal({ targetCount: 4, initialTargetCount: undefined }));
    // When initialTargetCount is missing, it falls back to g.targetCount
    expect(result.initialTargetCount).toBe(4);
  });

  it('preserves an explicit initialTargetCount', () => {
    const result = normalizeGoal(makeRawGoal({ targetCount: 4, initialTargetCount: 2 }));
    expect(result.initialTargetCount).toBe(2);
  });

  it('converts weekStartAt Timestamp-like value', () => {
    const date = new Date('2025-01-06T00:00:00.000Z');
    const result = normalizeGoal(makeRawGoal({ weekStartAt: makeTimestamp(date) }));
    expect(result.weekStartAt).toEqual(date);
  });

  it('sets weekStartAt to null when missing', () => {
    const result = normalizeGoal(makeRawGoal({ weekStartAt: undefined }));
    expect(result.weekStartAt).toBeNull();
  });
});
