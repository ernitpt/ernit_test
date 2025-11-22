import { db } from './firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
  arrayUnion,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import type { Goal } from '../types';

// ===== Helpers =====
const isoDateOnly = (d: Date) => d.toISOString().slice(0, 10);
const isValidDate = (d: any): d is Date => d instanceof Date && !isNaN(d.getTime());

function toJSDate(value: any): Date | null {
  if (!value) return null;
  // Firestore Timestamp
  // @ts-ignore
  if (value?.toDate) return value.toDate();
  const d = new Date(value);
  return isValidDate(d) ? d : null;
}

function addDaysSafe(base: Date | null | undefined, days: number): Date {
  const b = isValidDate(base as any) ? (base as Date) : new Date();
  const x = new Date(b);
  x.setDate(b.getDate() + days);
  return x;
}

/** Ensure all date-like fields are valid Dates (or null) and fix missing arrays/numbers */
function normalizeGoal(g: any): Goal {
  const startDate = toJSDate(g.startDate) ?? new Date();
  const endDate = toJSDate(g.endDate) ?? addDaysSafe(startDate, 7);
  const weekStartAt = toJSDate(g.weekStartAt);
  const approvalRequestedAt = toJSDate(g.approvalRequestedAt);
  const approvalDeadline = toJSDate(g.approvalDeadline);

  return {
    ...g,
    startDate,
    endDate,
    weekStartAt: weekStartAt ?? null,
    weeklyCount: typeof g.weeklyCount === 'number' ? g.weeklyCount : 0,
    weeklyLogDates: Array.isArray(g.weeklyLogDates) ? g.weeklyLogDates : [],
    currentCount: typeof g.currentCount === 'number' ? g.currentCount : 0,
    sessionsPerWeek: typeof g.sessionsPerWeek === 'number' ? g.sessionsPerWeek : 1,
    isCompleted: !!g.isCompleted,
    isWeekCompleted: !!g.isWeekCompleted, // new flag
    updatedAt: toJSDate(g.updatedAt) ?? new Date(),
    // Approval fields
    approvalStatus: g.approvalStatus || 'pending',
    initialTargetCount: typeof g.initialTargetCount === 'number' ? g.initialTargetCount : g.targetCount,
    initialSessionsPerWeek: typeof g.initialSessionsPerWeek === 'number' ? g.initialSessionsPerWeek : g.sessionsPerWeek,
    suggestedTargetCount: typeof g.suggestedTargetCount === 'number' ? g.suggestedTargetCount : null,
    suggestedSessionsPerWeek: typeof g.suggestedSessionsPerWeek === 'number' ? g.suggestedSessionsPerWeek : null,
    approvalRequestedAt: approvalRequestedAt ?? null,
    approvalDeadline: approvalDeadline ?? null,
    giverMessage: g.giverMessage || null,
    receiverMessage: g.receiverMessage || null,
    giverActionTaken: !!g.giverActionTaken,
  } as Goal;
}

/** Rotate weekday labels starting from the cadence anchor */
export function orderedWeekdaysFrom(start: Date) {
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sunday-first (JS getDay)
  const startIdx = start.getDay(); // 0=Sun..6=Sat
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(letters[(startIdx + i) % 7]);
  return out;
}

/** Dates inside the anchored week window */
export function getAnchoredWeekDates(weekStartAt: Date) {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) days.push(addDaysSafe(weekStartAt, i));
  return days;
}

export class GoalService {
  private goalsCollection = collection(db, 'goals');

  // ===== Debug switch =====
  private DEBUG_ALLOW_MULTIPLE_PER_DAY: boolean = false;
  setDebug(allowMultiplePerDay: boolean) {
    this.DEBUG_ALLOW_MULTIPLE_PER_DAY = allowMultiplePerDay;
  }

  /** Create a new goal */
  async createGoal(goal: Goal) {
    const normalized = normalizeGoal(goal);
    const docRef = await addDoc(this.goalsCollection, {
      ...normalized,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { ...normalized, id: docRef.id };
  }

  /** Real-time listener */
  listenToUserGoals(userId: string, cb: (goals: Goal[]) => void) {
    const qy = query(this.goalsCollection, where('userId', '==', userId));
    const unsub = onSnapshot(qy, async (snap) => {
      const goals = await Promise.all(
        snap.docs.map(async (d) => {
          const data = normalizeGoal({ id: d.id, ...d.data() });
          // Apply week sweep to ensure isWeekCompleted is current
          return await this.applyExpiredWeeksSweep(data);
        })
      );
      cb(goals);
    });
    return unsub;
  }

  /** Fetch goals */
  async getUserGoals(userId: string): Promise<Goal[]> {
    const qy = query(this.goalsCollection, where('userId', '==', userId));
    const snap = await getDocs(qy);
    const goals = await Promise.all(
      snap.docs.map(async (d) => {
        const data = normalizeGoal({ id: d.id, ...d.data() });
        // Apply week sweep to ensure isWeekCompleted is current
        return await this.applyExpiredWeeksSweep(data);
      })
    );
    return goals;
  }

  async getGoalById(goalId: string): Promise<Goal | null> {
    const ref = doc(db, 'goals', goalId);
    const s = await getDoc(ref);
    if (!s.exists()) return null;
    const data = normalizeGoal({ id: s.id, ...s.data() });
    // Apply week sweep to ensure isWeekCompleted is current
    return await this.applyExpiredWeeksSweep(data);
  }

  async appendHint(goalId: string, hintObj: { session: number; hint: string; date: number }) {
    const goalRef = doc(db, 'goals', goalId);
    await updateDoc(goalRef, {
      hints: arrayUnion(hintObj),
      updatedAt: serverTimestamp(),
    });
  }

  getOverallProgress(goal: Goal): number {
    if (!goal.targetCount) return 0;
    return Math.min(100, Math.round((goal.currentCount / goal.targetCount) * 100));
  }

  getWeeklyProgress(goal: Goal): number {
    const denom = goal.sessionsPerWeek || 1;
    return Math.min(100, Math.round((goal.weeklyCount / denom) * 100));
  }

  async updateGoal(goalId: string, updates: Partial<Goal>) {
    const ref = doc(db, 'goals', goalId);
    await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() } as any);
  }

  // ✅ Get coupon code for a goal
  async getCouponCode(goalId: string): Promise<string | null> {
    try {
      const goalRef = doc(db, 'goals', goalId);
      const goalSnap = await getDoc(goalRef);
      if (goalSnap.exists()) {
        const data = goalSnap.data();
        return data?.couponCode || null;
      }
      return null;
    } catch (error) {
      console.error('Error fetching goal coupon:', error);
      return null;
    }
  }

  // ✅ Save coupon code to goal
  async saveCouponCode(goalId: string, couponCode: string): Promise<void> {
    try {
      const goalRef = doc(db, 'goals', goalId);
      await setDoc(
        goalRef,
        {
          couponCode,
          couponGeneratedAt: new Date(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error('Error saving goal coupon:', error);
    }
  }

  /** Handle expired or completed weeks */
  async applyExpiredWeeksSweep(goal: Goal): Promise<Goal> {
    let g = normalizeGoal(goal);
    if (!g.weekStartAt || !g.id) return g;

    let anchor = new Date(g.weekStartAt);
    const now = new Date();

    // If 7+ days have passed since the week started
    if (now >= addDaysSafe(anchor, 7)) {
      // Only count completed weeks toward progress
      if (g.isWeekCompleted || g.weeklyCount >= g.sessionsPerWeek) {
        g.currentCount += 1;
      }

      // Advance to next week window
      anchor = addDaysSafe(anchor, 7);
      g.weekStartAt = anchor;
      g.weeklyCount = 0;
      g.weeklyLogDates = [];
      g.isWeekCompleted = false;

      // Persist the week rollover to database
      const ref = doc(db, 'goals', g.id);
      await updateDoc(ref, {
        currentCount: g.currentCount,
        weekStartAt: anchor,
        weeklyCount: 0,
        weeklyLogDates: [],
        isWeekCompleted: false,
        updatedAt: serverTimestamp(),
      } as any);
    }

    return g;
  }

  /** Increment a session for the current anchored week */
  async tickWeeklySession(goalId: string): Promise<Goal> {
    const ref = doc(db, 'goals', goalId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Goal not found');

    let g = normalizeGoal({ id: snap.id, ...snap.data() });

    // If it's the user's first session
    if (!g.weekStartAt) {
      g.weekStartAt = new Date();
      g.weeklyCount = 0;
      g.weeklyLogDates = [];
    }

    // Sweep expired weeks
    g = await this.applyExpiredWeeksSweep(g);

    const todayIso = isoDateOnly(new Date());

    // Prevent multiple sessions same day (unless debug)
    if (!this.DEBUG_ALLOW_MULTIPLE_PER_DAY && g.weeklyLogDates.includes(todayIso)) {
      return { ...g };
    }

    // Prevent extra sessions if week already completed
    if (g.weeklyCount >= g.sessionsPerWeek) {
      throw new Error("Week already completed. Wait until next week to continue!");
    }

    // Add new session
    g.weeklyCount += 1;
    if (!g.weeklyLogDates.includes(todayIso)) {
      g.weeklyLogDates = [...g.weeklyLogDates, todayIso];
    }

    // If weekly goal reached → mark as completed but don't roll yet
    if (g.weeklyCount >= g.sessionsPerWeek) {
      g.isWeekCompleted = true;

      // If it's the final week
      if (g.currentCount + 1 >= g.targetCount) {
        g.isCompleted = true;
      }
    }

    // Persist updates
    await updateDoc(ref, {
      weeklyCount: g.weeklyCount,
      weeklyLogDates: g.weeklyLogDates,
      isWeekCompleted: g.isWeekCompleted || false,
      isCompleted: !!g.isCompleted,
      weekStartAt: g.weekStartAt,
      updatedAt: serverTimestamp(),
    } as any);

    return { ...(g as any) } as Goal;
  }

  /** Approve a goal */
  async approveGoal(goalId: string, message?: string): Promise<Goal> {
    const ref = doc(db, 'goals', goalId);
    const updates: any = {
      approvalStatus: 'approved',
      giverMessage: message || '',
      giverActionTaken: true,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(ref, updates);
    const snap = await getDoc(ref);
    return normalizeGoal({ id: snap.id, ...snap.data() });
  }

  /** Suggest a goal change */
  async suggestGoalChange(
    goalId: string,
    suggestedTargetCount: number,
    suggestedSessionsPerWeek: number,
    message?: string
  ): Promise<Goal> {
    // Validate maximum limits: 5 weeks and 7 sessions per week
    if (suggestedTargetCount > 5) {
      throw new Error('The maximum duration is 5 weeks.');
    }
    if (suggestedSessionsPerWeek > 7) {
      throw new Error('The maximum is 7 sessions per week.');
    }

    const ref = doc(db, 'goals', goalId);
    const updates: any = {
      approvalStatus: 'suggested_change',
      suggestedTargetCount,
      suggestedSessionsPerWeek,
      giverMessage: message || '',
      giverActionTaken: true,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(ref, updates);
    const snap = await getDoc(ref);
    return normalizeGoal({ id: snap.id, ...snap.data() });
  }

  /** Receiver responds to suggestion - accepts or changes goal */
  async respondToGoalSuggestion(
    goalId: string,
    newTargetCount: number,
    newSessionsPerWeek: number,
    message?: string
  ): Promise<Goal> {
    const ref = doc(db, 'goals', goalId);
    const goalSnap = await getDoc(ref);
    if (!goalSnap.exists()) throw new Error('Goal not found');
    const currentGoal = normalizeGoal({ id: goalSnap.id, ...goalSnap.data() });

    // Ensure new goal is not less than initial
    const minTargetCount = currentGoal.initialTargetCount || currentGoal.targetCount;
    const minSessionsPerWeek = currentGoal.initialSessionsPerWeek || currentGoal.sessionsPerWeek;

    if (newTargetCount < minTargetCount || newSessionsPerWeek < minSessionsPerWeek) {
      throw new Error('New goal cannot be less than the original goal');
    }

    // Validate maximum limits: 5 weeks and 7 sessions per week
    if (newTargetCount > 5) {
      throw new Error('The maximum duration is 5 weeks.');
    }
    if (newSessionsPerWeek > 7) {
      throw new Error('The maximum is 7 sessions per week.');
    }

    // Update goal with new values
    const now = new Date();
    const durationInDays = newTargetCount * 7;
    // Ensure startDate is a Date object
    const startDate = toJSDate(currentGoal.startDate) || new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationInDays);

    const updates: any = {
      approvalStatus: 'approved',
      targetCount: newTargetCount,
      sessionsPerWeek: newSessionsPerWeek,
      duration: durationInDays,
      endDate,
      receiverMessage: message || '',
      updatedAt: serverTimestamp(),
    };
    await updateDoc(ref, updates);
    const snap = await getDoc(ref);
    return normalizeGoal({ id: snap.id, ...snap.data() });
  }

  /** Auto-approve goal if deadline passed */
  async checkAndAutoApprove(goalId: string): Promise<Goal | null> {
    const ref = doc(db, 'goals', goalId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const goal = normalizeGoal({ id: snap.id, ...snap.data() });

    if (goal.approvalStatus === 'pending' && goal.approvalDeadline) {
      const now = new Date();
      if (now >= goal.approvalDeadline && !goal.giverActionTaken) {
        // Auto-approve
        await updateDoc(ref, {
          approvalStatus: 'approved',
          giverActionTaken: true,
          updatedAt: serverTimestamp(),
        } as any);
        const updatedSnap = await getDoc(ref);
        return normalizeGoal({ id: updatedSnap.id, ...updatedSnap.data() });
      }
    }
    return null;
  }
}

export const goalService = new GoalService();
(goalService as any).appendHint = goalService.appendHint.bind(goalService);
