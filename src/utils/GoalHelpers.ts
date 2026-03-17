import { DateHelper } from './DateHelper';
import type { Goal } from '../types';

// ===== Shared Goal Helper Functions =====
// Single source of truth — imported by GoalService and GoalSessionService
// to avoid duplication and ensure consistent behaviour across the codebase.

export const isoDateOnly = (d: Date): string => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

export const isValidDate = (d: unknown): d is Date =>
  d instanceof Date && !isNaN(d.getTime());

export function toJSDate(value: unknown): Date | null {
  if (!value) return null;

  // Firestore Timestamp — proper type guard instead of @ts-ignore
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  const d = new Date(value as string | number);
  return isValidDate(d) ? d : null;
}

/**
 * Add `days` to a base date, normalising the result to midnight (00:00:00.000)
 * so that week boundaries align with calendar dates.
 *
 * This merges the GoalService version (no midnight normalisation) with the
 * GoalSessionService version (with midnight normalisation). The midnight
 * normalisation is the more correct behaviour and is now canonical.
 */
export function addDaysSafe(base: Date | null | undefined, days: number): Date {
  const b = isValidDate(base) ? base : DateHelper.now();
  const x = new Date(b);
  x.setDate(b.getDate() + days);
  x.setHours(0, 0, 0, 0); // Normalise to midnight so week boundaries align with calendar dates
  return x;
}

/** Ensure all date-like fields are valid Dates (or null) and fix missing arrays/numbers */
export function normalizeGoal(g: Record<string, unknown> & { id: string }): Goal {
  const startDate = toJSDate(g.startDate) ?? DateHelper.now();
  const endDate = toJSDate(g.endDate) ?? addDaysSafe(startDate, 7);
  const weekStartAt = toJSDate(g.weekStartAt);
  const plannedStartDate = toJSDate(g.plannedStartDate);
  const approvalRequestedAt = toJSDate(g.approvalRequestedAt);
  const approvalDeadline = toJSDate(g.approvalDeadline);

  return {
    ...g,
    startDate,
    endDate,
    weekStartAt: weekStartAt ?? null,
    plannedStartDate: plannedStartDate ?? null,
    targetCount: typeof g.targetCount === 'number' ? g.targetCount : 1,
    weeklyCount: typeof g.weeklyCount === 'number' ? g.weeklyCount : 0,
    weeklyLogDates: Array.isArray(g.weeklyLogDates) ? g.weeklyLogDates : [],
    currentCount: typeof g.currentCount === 'number' ? g.currentCount : 0,
    sessionsPerWeek: typeof g.sessionsPerWeek === 'number' ? g.sessionsPerWeek : 1,
    isCompleted: !!g.isCompleted,
    isWeekCompleted: !!g.isWeekCompleted,
    updatedAt: toJSDate(g.updatedAt) ?? DateHelper.now(),
    // Approval fields
    approvalStatus: g.approvalStatus || (g.isFreeGoal ? 'approved' : 'pending'),
    initialTargetCount:
      typeof g.initialTargetCount === 'number' ? g.initialTargetCount : g.targetCount,
    initialSessionsPerWeek:
      typeof g.initialSessionsPerWeek === 'number'
        ? g.initialSessionsPerWeek
        : g.sessionsPerWeek,
    suggestedTargetCount:
      typeof g.suggestedTargetCount === 'number' ? g.suggestedTargetCount : null,
    suggestedSessionsPerWeek:
      typeof g.suggestedSessionsPerWeek === 'number' ? g.suggestedSessionsPerWeek : null,
    approvalRequestedAt: approvalRequestedAt ?? null,
    approvalDeadline: approvalDeadline ?? null,
    giverMessage: g.giverMessage || null,
    receiverMessage: g.receiverMessage || null,
    giverActionTaken: !!g.giverActionTaken,
    // Free Goal fields
    isFreeGoal: !!g.isFreeGoal,
    pledgedExperience: g.pledgedExperience || null,
    pledgedAt: toJSDate(g.pledgedAt) ?? null,
    giftAttachedAt: toJSDate(g.giftAttachedAt) ?? null,
    giftAttachDeadline: toJSDate(g.giftAttachDeadline) ?? null,
  } as Goal;
}
