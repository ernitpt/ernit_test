import type { TFunction } from 'i18next';
import { Goal, PersonalizedHint } from '../../types';
import { Colors } from '../../config';
import { getMonthNames, formatLocalDate } from '../../utils/i18nHelpers';

// ─── Date utilities ─────────────────────────────────────────────────

export function isoDay(d: Date): string {
  const local = new Date(d);
  local.setHours(0, 0, 0, 0);
  const y = local.getFullYear();
  const m = `${local.getMonth() + 1}`.padStart(2, '0');
  const dd = `${local.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(d.getDate() + days);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function rollingWeek(start: Date): Date[] {
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export function day2(d: Date): string {
  return formatLocalDate(d, { weekday: 'short' }).slice(0, 2);
}

export function dayMonth(d: Date): string {
  const day = d.getDate();
  const monthNames = getMonthNames(undefined, 'short');
  const month = monthNames[d.getMonth()];
  return `${day} ${month}`;
}

export function formatNextWeekDay(weekStartAt?: Date | null): string {
  if (!weekStartAt) return '';
  const next = new Date(weekStartAt);
  next.setDate(next.getDate() + 7);
  return formatLocalDate(next, { dateStyle: 'short' });
}

// ─── Goal logic utilities ───────────────────────────────────────────

/** Check if a goal is locked (pending approval or has a suggested change) */
export function isGoalLocked(goal: Goal): boolean {
  return goal.approvalStatus === 'pending' || goal.approvalStatus === 'suggested_change';
}

/** Format target duration (e.g. "1 hr 30 min" or "45 min") */
export function formatDurationDisplay(h: number = 0, m: number = 0): string {
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hr`);
  if (m > 0) parts.push(`${m} min`);
  return parts.length > 0 ? parts.join(' ') : '0 min';
}

/** Get approval block message for locked goals */
export function getApprovalBlockMessage(
  goal: Goal,
  empoweredName: string | null,
  context: 'start' | 'finish' | 'banner',
  t?: TFunction,
): { title: string; message: string } | null {
  if (!isGoalLocked(goal)) return null;

  const giverName = empoweredName || (t ? t('recipient.goalStatus.yourGiver') : 'your giver');
  const deadlinePassed =
    !!goal.approvalDeadline && goal.approvalDeadline instanceof Date && goal.approvalDeadline.getTime() <= Date.now();

  // Suggested change — shorter banner copy, blocking copy preserved for start/finish
  if (goal.approvalStatus === 'suggested_change') {
    if (context === 'banner' && goal.weeklyCount === 0) {
      return {
        title: t ? t('recipient.goalStatus.goalChangeSuggested') : 'Goal Change Suggested',
        message: t ? t('recipient.goalStatus.goalChangeSuggestedMessage', { giverName }) : `${giverName} suggested a change — review in notifications.`,
      };
    }
    if (context === 'banner' && goal.weeklyCount === 1) {
      return {
        title: t ? t('recipient.goalStatus.goalChangeSuggested') : 'Goal Change Suggested',
        message: t ? t('recipient.goalStatus.goalChangeSuggestedAfterFirst', { giverName }) : `First session in. ${giverName} suggested a change — review in notifications.`,
      };
    }
    return {
      title: t ? t('recipient.goalStatus.goalNotApproved') : 'Goal Not Approved',
      message: t ? t('recipient.goalStatus.goalChangeSuggestedContinue', { giverName }) : `${giverName} has suggested a goal change. Please review and accept or modify the suggestion before continuing.`,
    };
  }

  // Pending approval: 1-day/1-session goals are a hard block (can't start at all) — keep a banner so the user sees why
  if (goal.targetCount === 1 && goal.sessionsPerWeek === 1) {
    if (context === 'banner') {
      return {
        title: t ? t('recipient.goalStatus.waitingForApproval') : 'Waiting for Approval',
        message: t ? t('recipient.goalStatus.oneDayOneSessionBlockedBanner', { giverName }) : `${giverName} needs to approve before you can start.`,
      };
    }
    return {
      title: t ? t('recipient.goalStatus.goalNotApproved') : 'Goal Not Approved',
      message: t ? t('recipient.goalStatus.oneDayOneSessionBlocked') : "Goals with only 1 day and 1 session per week cannot be completed until giver's approval.",
    };
  }

  // Pending approval: post-first-session — this is the main "actually waiting" state
  const totalSessionsDone = (goal.currentCount * goal.sessionsPerWeek) + goal.weeklyCount;
  if (totalSessionsDone >= 1 || (context === 'start' && goal.weeklyCount >= 1)) {
    if (context === 'banner') {
      return {
        title: t ? t('recipient.goalStatus.firstSessionDone') : 'First Session Done',
        message: t ? t('recipient.goalStatus.firstSessionDoneMessage', { giverName }) : `Nice — first session in. Waiting for ${giverName} to approve the rest.`,
      };
    }
    return {
      title: t ? t('recipient.goalStatus.goalNotApproved') : 'Goal Not Approved',
      message: t ? t('recipient.goalStatus.waitingApprovalFirstDone', { giverName }) : `Waiting for ${giverName}'s approval! You can start with the first session, but the remaining sessions will unlock after ${giverName} approves your goal (or automatically in 24 hours).`,
    };
  }

  // Deadline passed, still pending (brief window before auto-approval runs)
  if (context === 'banner' && deadlinePassed) {
    return {
      title: t ? t('recipient.goalStatus.waitingForApproval') : 'Waiting for Approval',
      message: t ? t('recipient.goalStatus.approvalDeadlinePassedBanner') : 'Approval window passed — unlocking your goal.',
    };
  }

  // Pre-first-session pending, deadline not passed: silent (user's core ask)
  return null;
}

// ─── Types for extracted components ─────────────────────────────────

export interface PartnerGoalData {
  userId?: string;
  weeklyCount: number;
  sessionsPerWeek: number;
  weeklyLogDates: string[];
  isWeekCompleted: boolean;
  isCompleted?: boolean;
  weekStartAt?: Date | { toDate: () => Date } | null;
  targetCount?: number;
  currentCount?: number;
  title?: string;
}

export interface HintObject {
  id: string;
  session: number;
  giverName?: string;
  date: number;
  createdAt?: Date;
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  type?: PersonalizedHint['type'];
  duration?: number;
  hint?: string;
}

// ─── Constants ──────────────────────────────────────────────────────

/** @deprecated Use 'global_timer_state' AsyncStorage key directly (JSON object keyed by goalId) */
export const TIMER_STORAGE_KEY = 'global_timer_state';

export const createCardColors = (colors: typeof Colors) => ({
  grayLight: colors.border,
  text: colors.textPrimary,
  sub: colors.textSecondary,
});
