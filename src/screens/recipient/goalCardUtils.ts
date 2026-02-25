import { Goal, PersonalizedHint } from '../../types';
import { db } from '../../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

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
  return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
}

export function dayMonth(d: Date): string {
  const day = d.getDate();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  return `${day} ${month}`;
}

export function formatNextWeekDay(weekStartAt?: Date | null): string {
  if (!weekStartAt) return '';
  const next = new Date(weekStartAt);
  next.setDate(next.getDate() + 7);
  return next.toLocaleDateString('en-US', { dateStyle: 'short' });
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
): { title: string; message: string } | null {
  if (!isGoalLocked(goal)) return null;

  const giverName = empoweredName || 'your giver';

  // Suggested change messages
  if (goal.approvalStatus === 'suggested_change') {
    if (context === 'banner' && goal.weeklyCount === 0) {
      return {
        title: 'Goal Change Suggested',
        message: `${giverName} has suggested a goal change. Please review and accept or modify the suggestion in your notifications.`,
      };
    }
    if (context === 'banner' && goal.weeklyCount === 1) {
      return {
        title: 'Goal Change Suggested',
        message: `Congrats on your first session! ${giverName} has suggested a goal change. Please review and accept or modify the suggestion in your notifications to continue.`,
      };
    }
    return {
      title: 'Goal Not Approved',
      message: `${giverName} has suggested a goal change. Please review and accept or modify the suggestion before continuing.`,
    };
  }

  // Pending approval: 1-day/1-session goals are fully blocked
  if (goal.targetCount === 1 && goal.sessionsPerWeek === 1) {
    return {
      title: 'Goal Not Approved',
      message: "Goals with only 1 day and 1 session per week cannot be completed until giver's approval.",
    };
  }

  // Pending approval: other goals allow first session only
  const totalSessionsDone = (goal.currentCount * goal.sessionsPerWeek) + goal.weeklyCount;
  if (totalSessionsDone >= 1 || (context === 'start' && goal.weeklyCount >= 1)) {
    if (context === 'banner') {
      return {
        title: 'First Session Done',
        message: `Congrats on your first session! The remaining sessions will unlock after ${giverName} approves this goal (or automatically in 24 hours).`,
      };
    }
    return {
      title: 'Goal Not Approved',
      message: `Waiting for ${giverName}'s approval! You can start with the first session, but the remaining sessions will unlock after ${giverName} approves your goal (or automatically in 24 hours).`,
    };
  }

  if (context === 'banner') {
    return {
      title: 'Waiting for Approval',
      message: `Waiting for ${giverName}'s approval! You can start with the first session, but the remaining sessions will unlock after ${giverName} approves your goal (or automatically in 24 hours).`,
    };
  }

  return null;
}

// ─── Valentine utilities ────────────────────────────────────────────

/** Build a valentine gift object from challenge data */
export async function buildValentineGift(goalData: Goal): Promise<{
  id: string;
  experienceId: string;
  giverId: string;
  giverName: string;
  status: 'completed';
  createdAt: Date;
  deliveryDate: Date;
  payment: string;
  claimCode: string;
  isValentineChallenge: boolean;
  mode: string;
} | null> {
  if (!goalData.valentineChallengeId) return null;
  const challengeDoc = await getDoc(doc(db, 'valentineChallenges', goalData.valentineChallengeId));
  if (!challengeDoc.exists()) return null;
  const challengeData = challengeDoc.data();

  return {
    id: goalData.valentineChallengeId,
    experienceId: challengeData.experienceId,
    giverId: challengeData.purchaserUserId,
    giverName: challengeData.purchaserName || '',
    status: 'completed' as const,
    createdAt: challengeData.createdAt?.toDate() || new Date(),
    deliveryDate: new Date(),
    payment: challengeData.purchaseId || '',
    claimCode: '',
    isValentineChallenge: true,
    mode: challengeData.mode,
  };
}

// ─── Types for extracted components ─────────────────────────────────

export interface PartnerGoalData {
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

export const TIMER_STORAGE_KEY = 'goal_timer_state_';

export const CARD_COLORS = {
  grayLight: '#E5E7EB',
  text: '#111827',
  sub: '#6B7280',
};
