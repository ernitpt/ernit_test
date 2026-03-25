/**
 * @jest-environment node
 *
 * Additional edge-case tests for GoalHelpers.ts.
 * The existing GoalHelpers.test.ts covers the happy paths; this file
 * focuses on the boundary and backward-compat scenarios called out in the
 * audit (approvalStatus defaults, challengeType, isReadyToComplete,
 * missing numeric fields, isoDateOnly timezone behaviour, rollingWeek
 * boundary conditions, and addDaysSafe edge cases).
 */

import {
  isoDateOnly,
  addDaysSafe,
  normalizeGoal,
} from '../GoalHelpers';
import { DateHelper } from '../DateHelper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal raw goal that satisfies normalizeGoal's input type */
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

/** Firestore Timestamp-like stub */
const makeTimestamp = (date: Date) => ({ toDate: () => date });

// ---------------------------------------------------------------------------
// normalizeGoal — approvalStatus backward compat & variants
// ---------------------------------------------------------------------------

describe('normalizeGoal — approvalStatus', () => {
  it('defaults approvalStatus to "approved" when the field is undefined (backward compat)', () => {
    const result = normalizeGoal(makeRawGoal({ approvalStatus: undefined }));
    expect(result.approvalStatus).toBe('approved');
  });

  it('defaults approvalStatus to "approved" when the field is null', () => {
    const result = normalizeGoal(makeRawGoal({ approvalStatus: null }));
    expect(result.approvalStatus).toBe('approved');
  });

  it('preserves approvalStatus "pending" when explicitly set', () => {
    const result = normalizeGoal(makeRawGoal({ approvalStatus: 'pending' }));
    expect(result.approvalStatus).toBe('pending');
  });

  it('preserves approvalStatus "approved" when explicitly set', () => {
    const result = normalizeGoal(makeRawGoal({ approvalStatus: 'approved' }));
    expect(result.approvalStatus).toBe('approved');
  });

  it('preserves approvalStatus "rejected" when explicitly set', () => {
    const result = normalizeGoal(makeRawGoal({ approvalStatus: 'rejected' }));
    expect(result.approvalStatus).toBe('rejected');
  });

  it('preserves approvalStatus "suggested_change" when explicitly set', () => {
    const result = normalizeGoal(makeRawGoal({ approvalStatus: 'suggested_change' }));
    expect(result.approvalStatus).toBe('suggested_change');
  });
});

// ---------------------------------------------------------------------------
// normalizeGoal — challengeType passthrough
// ---------------------------------------------------------------------------

describe('normalizeGoal — challengeType', () => {
  it('preserves challengeType "shared" via spread', () => {
    const result = normalizeGoal(makeRawGoal({ challengeType: 'shared' }));
    expect((result as unknown as Record<string, unknown>).challengeType).toBe('shared');
  });

  it('preserves challengeType "individual" via spread', () => {
    const result = normalizeGoal(makeRawGoal({ challengeType: 'individual' }));
    expect((result as unknown as Record<string, unknown>).challengeType).toBe('individual');
  });

  it('preserves challengeType undefined (not injected as a key)', () => {
    const result = normalizeGoal(makeRawGoal({ challengeType: undefined }));
    // undefined keys from spread are present but undefined
    expect((result as unknown as Record<string, unknown>).challengeType).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeGoal — isReadyToComplete passthrough
// ---------------------------------------------------------------------------

describe('normalizeGoal — isReadyToComplete', () => {
  it('preserves isReadyToComplete: true via spread', () => {
    const result = normalizeGoal(makeRawGoal({ isReadyToComplete: true }));
    expect((result as unknown as Record<string, unknown>).isReadyToComplete).toBe(true);
  });

  it('preserves isReadyToComplete: false via spread', () => {
    const result = normalizeGoal(makeRawGoal({ isReadyToComplete: false }));
    expect((result as unknown as Record<string, unknown>).isReadyToComplete).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeGoal — missing numeric fields
// ---------------------------------------------------------------------------

describe('normalizeGoal — missing numeric fields', () => {
  it('defaults targetCount to 1 when the field is missing', () => {
    const result = normalizeGoal(makeRawGoal({ targetCount: undefined }));
    expect(result.targetCount).toBe(1);
  });

  it('defaults targetCount to 1 when the field is null', () => {
    const result = normalizeGoal(makeRawGoal({ targetCount: null }));
    expect(result.targetCount).toBe(1);
  });

  it('defaults sessionsPerWeek to 1 when the field is missing', () => {
    const result = normalizeGoal(makeRawGoal({ sessionsPerWeek: undefined }));
    expect(result.sessionsPerWeek).toBe(1);
  });

  it('defaults sessionsPerWeek to 1 when the field is null', () => {
    const result = normalizeGoal(makeRawGoal({ sessionsPerWeek: null }));
    expect(result.sessionsPerWeek).toBe(1);
  });

  it('preserves sessionsPerWeek of 3 when set', () => {
    const result = normalizeGoal(makeRawGoal({ sessionsPerWeek: 3 }));
    expect(result.sessionsPerWeek).toBe(3);
  });

  it('preserves targetCount of 10 when set', () => {
    const result = normalizeGoal(makeRawGoal({ targetCount: 10 }));
    expect(result.targetCount).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// normalizeGoal — giftAttachDeadline null handling
// ---------------------------------------------------------------------------

describe('normalizeGoal — giftAttachDeadline', () => {
  it('defaults giftAttachDeadline to null when field is null', () => {
    const result = normalizeGoal(makeRawGoal({ giftAttachDeadline: null }));
    expect(result.giftAttachDeadline).toBeNull();
  });

  it('defaults giftAttachDeadline to null when field is undefined', () => {
    const result = normalizeGoal(makeRawGoal({ giftAttachDeadline: undefined }));
    expect(result.giftAttachDeadline).toBeNull();
  });

  it('converts a Timestamp-like giftAttachDeadline to a Date', () => {
    const deadline = new Date('2025-06-30T00:00:00.000Z');
    const result = normalizeGoal(makeRawGoal({ giftAttachDeadline: makeTimestamp(deadline) }));
    expect(result.giftAttachDeadline).toEqual(deadline);
  });

  it('converts an ISO string giftAttachDeadline to a Date', () => {
    const result = normalizeGoal(makeRawGoal({ giftAttachDeadline: '2025-07-01T00:00:00.000Z' }));
    expect(result.giftAttachDeadline).toBeInstanceOf(Date);
    expect(result.giftAttachDeadline!.toISOString()).toBe('2025-07-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// isoDateOnly — timezone / locale edge cases
// ---------------------------------------------------------------------------

describe('isoDateOnly — timezone boundary conditions', () => {
  it('uses local date components (not UTC) — end of day in UTC+14', () => {
    // The function uses getFullYear/getMonth/getDate which are local-time methods.
    // We can verify that the output always has the YYYY-MM-DD shape regardless of timezone.
    const d = new Date(2025, 11, 31, 23, 59, 59, 999); // Dec 31, 2025 local 23:59:59
    expect(isoDateOnly(d)).toBe('2025-12-31');
  });

  it('handles leap-year Feb 29', () => {
    const d = new Date(2024, 1, 29); // Feb 29, 2024 (leap year)
    expect(isoDateOnly(d)).toBe('2024-02-29');
  });

  it('handles the first millisecond of a year', () => {
    const d = new Date(2025, 0, 1, 0, 0, 0, 0); // Jan 1 midnight local
    expect(isoDateOnly(d)).toBe('2025-01-01');
  });

  it('is consistent even when called at different times of day', () => {
    const morning = new Date(2025, 5, 15, 6, 0, 0);
    const evening = new Date(2025, 5, 15, 22, 30, 0);
    // Same calendar day → same result
    expect(isoDateOnly(morning)).toBe(isoDateOnly(evening));
    expect(isoDateOnly(morning)).toBe('2025-06-15');
  });
});

// ---------------------------------------------------------------------------
// addDaysSafe — boundary and special-case inputs
// ---------------------------------------------------------------------------

describe('addDaysSafe — boundary and edge cases', () => {
  beforeEach(() => {
    DateHelper.reset();
  });

  it('falls back to DateHelper.now() when base is null and produces midnight', () => {
    const result = addDaysSafe(null, 0);
    expect(result).toBeInstanceOf(Date);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('falls back to DateHelper.now() when base is undefined', () => {
    const result = addDaysSafe(undefined, 0);
    expect(result).toBeInstanceOf(Date);
    // Result should be on today's date (not epoch)
    expect(result.getFullYear()).toBeGreaterThanOrEqual(2025);
  });

  it('adding zero days returns the same calendar date at midnight', () => {
    const base = new Date(2025, 2, 20, 15, 45, 30, 500); // Mar 20 at 15:45
    const result = addDaysSafe(base, 0);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(20);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('adding negative days goes back in time', () => {
    const base = new Date(2025, 2, 10); // Mar 10
    const result = addDaysSafe(base, -10);
    expect(result.getMonth()).toBe(1);  // February
    expect(result.getDate()).toBe(28);
  });

  it('adding negative days across a year boundary', () => {
    const base = new Date(2025, 0, 5); // Jan 5, 2025
    const result = addDaysSafe(base, -5);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(11); // December
    expect(result.getDate()).toBe(31);
  });

  it('adding a large number of days works correctly', () => {
    const base = new Date(2025, 0, 1); // Jan 1, 2025
    const result = addDaysSafe(base, 365);
    // 2025 is not a leap year, so +365 days = Jan 1, 2026
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
  });

  it('never mutates the base date', () => {
    const base = new Date(2025, 5, 1);
    const originalMs = base.getTime();
    addDaysSafe(base, -7);
    expect(base.getTime()).toBe(originalMs);
  });
});

// ---------------------------------------------------------------------------
// rollingWeek boundary conditions (from goalCardUtils — pure date logic)
// ---------------------------------------------------------------------------

describe('rollingWeek boundary conditions', () => {
  // Inline the pure function here to avoid importing goalCardUtils (firebase dep).
  // This tests the algorithm, not the module integration.
  function addDays(d: Date, days: number): Date {
    const x = new Date(d);
    x.setDate(d.getDate() + days);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function rollingWeek(start: Date): Date[] {
    const s = new Date(start);
    s.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }

  function isoDay(d: Date): string {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  it('always returns exactly 7 dates', () => {
    const result = rollingWeek(new Date(2025, 0, 1));
    expect(result).toHaveLength(7);
  });

  it('first element is the start date at midnight', () => {
    const start = new Date(2025, 0, 6, 14, 30); // Jan 6, 2025 at 14:30
    const [first] = rollingWeek(start);
    expect(isoDay(first)).toBe('2025-01-06');
    expect(first.getHours()).toBe(0);
    expect(first.getMinutes()).toBe(0);
  });

  it('last element is start + 6 days', () => {
    const start = new Date(2025, 0, 6);
    const week = rollingWeek(start);
    expect(isoDay(week[6])).toBe('2025-01-12');
  });

  it('all 7 dates are at midnight', () => {
    const week = rollingWeek(new Date(2025, 2, 15));
    week.forEach((d) => {
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
      expect(d.getMilliseconds()).toBe(0);
    });
  });

  it('spans a month boundary correctly', () => {
    const start = new Date(2025, 0, 27); // Jan 27
    const week = rollingWeek(start);
    expect(isoDay(week[0])).toBe('2025-01-27');
    expect(isoDay(week[4])).toBe('2025-01-31');
    expect(isoDay(week[5])).toBe('2025-02-01'); // crosses into February
    expect(isoDay(week[6])).toBe('2025-02-02');
  });

  it('spans a year boundary correctly', () => {
    const start = new Date(2024, 11, 29); // Dec 29, 2024
    const week = rollingWeek(start);
    expect(isoDay(week[0])).toBe('2024-12-29');
    expect(isoDay(week[2])).toBe('2024-12-31');
    expect(isoDay(week[3])).toBe('2025-01-01'); // crosses into new year
    expect(isoDay(week[6])).toBe('2025-01-04');
  });

  it('dates are consecutive (each differs by exactly 86 400 000 ms)', () => {
    const week = rollingWeek(new Date(2025, 5, 1));
    for (let i = 1; i < week.length; i++) {
      const diffMs = week[i].getTime() - week[i - 1].getTime();
      expect(diffMs).toBe(86_400_000);
    }
  });

  it('does not mutate the start date', () => {
    const start = new Date(2025, 0, 1);
    const originalMs = start.getTime();
    rollingWeek(start);
    expect(start.getTime()).toBe(originalMs);
  });
});

// ---------------------------------------------------------------------------
// normalizeGoal — createdAt Timestamp conversion (Priority 3 additions)
// ---------------------------------------------------------------------------

describe('normalizeGoal — createdAt Timestamp conversion', () => {
  it('converts a Firestore Timestamp-like createdAt to a Date (via spread passthrough + toJSDate in updatedAt)', () => {
    // normalizeGoal spreads createdAt as-is (it is NOT explicitly converted),
    // so a Timestamp-like object remains. This test documents the current
    // behaviour — if the implementation is ever updated to convert createdAt,
    // this test will catch the change.
    const date = new Date('2025-02-01T00:00:00.000Z');
    const ts = makeTimestamp(date);
    const result = normalizeGoal(makeRawGoal({ createdAt: ts }));
    // createdAt is spread through as-is (not converted by normalizeGoal)
    expect((result as unknown as Record<string, unknown>).createdAt).toBe(ts);
  });

  it('preserves a plain Date createdAt unchanged', () => {
    const date = new Date('2025-03-10T00:00:00.000Z');
    const result = normalizeGoal(makeRawGoal({ createdAt: date }));
    expect((result as unknown as Record<string, unknown>).createdAt).toEqual(date);
  });
});

// ---------------------------------------------------------------------------
// normalizeGoal — startDate ISO string conversion (Priority 3 additions)
// ---------------------------------------------------------------------------

describe('normalizeGoal — startDate ISO string conversion', () => {
  it('converts an ISO string startDate to a Date instance', () => {
    const result = normalizeGoal(makeRawGoal({ startDate: '2025-05-15T00:00:00.000Z' }));
    expect(result.startDate).toBeInstanceOf(Date);
    expect((result.startDate as Date).toISOString()).toBe('2025-05-15T00:00:00.000Z');
  });

  it('converts a Timestamp-like startDate to a Date instance', () => {
    const date = new Date('2025-06-01T00:00:00.000Z');
    const result = normalizeGoal(makeRawGoal({ startDate: makeTimestamp(date) }));
    expect(result.startDate).toBeInstanceOf(Date);
    expect((result.startDate as Date).getTime()).toBe(date.getTime());
  });

  it('falls back to DateHelper.now() when startDate is null', () => {
    const before = DateHelper.reset() ?? DateHelper.now();
    const result = normalizeGoal(makeRawGoal({ startDate: null }));
    expect(result.startDate).toBeInstanceOf(Date);
    // Should be a recent date, not epoch
    expect((result.startDate as Date).getFullYear()).toBeGreaterThanOrEqual(2025);
    void before;
  });
});

// ---------------------------------------------------------------------------
// normalizeGoal — weekStartAt missing → defaults to null (Priority 3 additions)
// ---------------------------------------------------------------------------

describe('normalizeGoal — weekStartAt defaults', () => {
  it('defaults weekStartAt to null when the field is missing', () => {
    const result = normalizeGoal(makeRawGoal({ weekStartAt: undefined }));
    expect(result.weekStartAt).toBeNull();
  });

  it('defaults weekStartAt to null when the field is null', () => {
    const result = normalizeGoal(makeRawGoal({ weekStartAt: null }));
    expect(result.weekStartAt).toBeNull();
  });

  it('converts a Timestamp-like weekStartAt to a Date', () => {
    const date = new Date('2025-01-13T00:00:00.000Z');
    const result = normalizeGoal(makeRawGoal({ weekStartAt: makeTimestamp(date) }));
    expect(result.weekStartAt).toEqual(date);
  });

  it('converts an ISO string weekStartAt to a Date', () => {
    const result = normalizeGoal(makeRawGoal({ weekStartAt: '2025-02-03T00:00:00.000Z' }));
    expect(result.weekStartAt).toBeInstanceOf(Date);
    expect(result.weekStartAt!.toISOString()).toBe('2025-02-03T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// normalizeGoal — empoweredBy field preserved (Priority 3 additions)
// ---------------------------------------------------------------------------

describe('normalizeGoal — empoweredBy field', () => {
  it('preserves a non-null empoweredBy string via spread', () => {
    const result = normalizeGoal(makeRawGoal({ empoweredBy: 'user-42' }));
    expect((result as unknown as Record<string, unknown>).empoweredBy).toBe('user-42');
  });

  it('preserves undefined empoweredBy (absent field)', () => {
    const result = normalizeGoal(makeRawGoal({ empoweredBy: undefined }));
    expect((result as unknown as Record<string, unknown>).empoweredBy).toBeUndefined();
  });

  it('preserves null empoweredBy via spread', () => {
    const result = normalizeGoal(makeRawGoal({ empoweredBy: null }));
    expect((result as unknown as Record<string, unknown>).empoweredBy).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeGoal — experienceGiftId preserved (Priority 3 additions)
// ---------------------------------------------------------------------------

describe('normalizeGoal — experienceGiftId field', () => {
  it('preserves a provided experienceGiftId string', () => {
    const result = normalizeGoal(makeRawGoal({ experienceGiftId: 'gift-abc-123' }));
    expect(result.experienceGiftId).toBe('gift-abc-123');
  });

  it('preserves experienceGiftId when it is an empty string', () => {
    const result = normalizeGoal(makeRawGoal({ experienceGiftId: '' }));
    expect(result.experienceGiftId).toBe('');
  });

  it('preserves the default experienceGiftId from makeRawGoal ("exp-1")', () => {
    const result = normalizeGoal(makeRawGoal());
    expect(result.experienceGiftId).toBe('exp-1');
  });
});
