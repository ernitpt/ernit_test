import { DateHelper } from '../utils/DateHelper';
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
  deleteDoc,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import type { Goal, PersonalizedHint } from '../types';
import { feedService } from './FeedService';
import { experienceGiftService } from './ExperienceGiftService';
import { experienceService } from './ExperienceService';
import { userService } from './userService';
import { notificationService } from './NotificationService';
import { friendService } from './FriendService';
import { logger } from '../utils/logger';
import { config } from '../config/environment';
import { logErrorToFirestore } from '../utils/errorLogger';
import { analyticsService } from './AnalyticsService';

// ===== Helpers =====
const isoDateOnly = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
const isValidDate = (d: any): d is Date => d instanceof Date && !isNaN(d.getTime());

function toJSDate(value: any): Date | null {
  if (!value) return null;

  // Firestore Timestamp - proper type guard instead of @ts-ignore
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }

  const d = new Date(value);
  return isValidDate(d) ? d : null;
}

function addDaysSafe(base: Date | null | undefined, days: number): Date {
  const b = isValidDate(base as any) ? (base as Date) : DateHelper.now();
  const x = new Date(b);
  x.setDate(b.getDate() + days);
  return x;
}

/** Ensure all date-like fields are valid Dates (or null) and fix missing arrays/numbers */
function normalizeGoal(g: any): Goal {
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
    initialTargetCount: typeof g.initialTargetCount === 'number' ? g.initialTargetCount : g.targetCount,
    initialSessionsPerWeek: typeof g.initialSessionsPerWeek === 'number' ? g.initialSessionsPerWeek : g.sessionsPerWeek,
    suggestedTargetCount: typeof g.suggestedTargetCount === 'number' ? g.suggestedTargetCount : null,
    suggestedSessionsPerWeek: typeof g.suggestedSessionsPerWeek === 'number' ? g.suggestedSessionsPerWeek : null,
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

  // ✅ SECURITY FIX: Only allow debug mode in development
  private DEBUG_ALLOW_MULTIPLE_PER_DAY: boolean = config.debugEnabled;
  setDebug(allowMultiplePerDay: boolean) {
    // Only allow in development
    if (config.debugEnabled) {
      this.DEBUG_ALLOW_MULTIPLE_PER_DAY = allowMultiplePerDay;
    } else {
      logger.warn('⚠️ Debug mode not available in production');
    }
  }

  /** Create a new goal */
  async createGoal(goal: Goal) {
    try {
      const normalized = normalizeGoal(goal);
      const docRef = await addDoc(this.goalsCollection, {
        ...normalized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Create feed post for goal started
      try {
        // Fetch user data to get name and profile image
        const userDoc = await getDoc(doc(db, 'users', normalized.userId));
        const userData = userDoc.exists() ? userDoc.data() : null;

        await feedService.createFeedPost({
          userId: normalized.userId,
          userName: userData?.displayName || userData?.profile?.name || 'User',
          userProfileImageUrl: userData?.profile?.profileImageUrl,
          goalId: docRef.id,
          goalDescription: normalized.description,
          type: 'goal_started',
          totalSessions: normalized.targetCount * normalized.sessionsPerWeek,
          createdAt: new Date(),
        });
      } catch (error) {
        logger.error('Error creating feed post:', error);
      }

      analyticsService.trackEvent('goal_creation_completed', 'conversion', { goalId: docRef.id, targetCount: normalized.targetCount, sessionsPerWeek: normalized.sessionsPerWeek, isFreeGoal: false });
      return { ...normalized, id: docRef.id };
    } catch (error) {
      // Log error to Firestore
      await logErrorToFirestore(error, {
        feature: 'GoalCreation',
        userId: goal.userId,
        additionalData: {
          goalDescription: goal.description,
          targetCount: goal.targetCount,
        },
      });
      throw error;
    }
  }

  /** Create a Free Goal ("The Pledge") - no purchase required */
  async createFreeGoal(goal: Goal): Promise<Goal> {
    try {
      if (!goal.isFreeGoal) {
        throw new Error('Invalid free goal data: missing isFreeGoal');
      }

      const normalized = normalizeGoal(goal);
      const docRef = await addDoc(this.goalsCollection, {
        ...normalized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Create feed post for goal started
      try {
        const userDoc = await getDoc(doc(db, 'users', normalized.userId));
        const userData = userDoc.exists() ? userDoc.data() : null;

        await feedService.createFeedPost({
          userId: normalized.userId,
          userName: userData?.displayName || userData?.profile?.name || 'User',
          userProfileImageUrl: userData?.profile?.profileImageUrl,
          goalId: docRef.id,
          goalDescription: normalized.description,
          type: 'goal_started',
          totalSessions: normalized.targetCount * normalized.sessionsPerWeek,
          experienceTitle: normalized.pledgedExperience?.title,
          experienceImageUrl: normalized.pledgedExperience?.coverImageUrl,
          isFreeGoal: true,
          pledgedExperienceId: normalized.pledgedExperience?.experienceId,
          pledgedExperiencePrice: normalized.pledgedExperience?.price,
          preferredRewardCategory: normalized.preferredRewardCategory,
          createdAt: new Date(),
        });
      } catch (error) {
        logger.error('Error creating feed post for free goal:', error);
      }

      analyticsService.trackEvent('goal_creation_completed', 'conversion', { goalId: docRef.id, targetCount: normalized.targetCount, sessionsPerWeek: normalized.sessionsPerWeek, isFreeGoal: true, pledgedExperienceId: normalized.pledgedExperience?.experienceId });
      return { ...normalized, id: docRef.id };
    } catch (error) {
      await logErrorToFirestore(error, {
        feature: 'FreeGoalCreation',
        userId: goal.userId,
        additionalData: {
          goalDescription: goal.description,
          pledgedExperienceId: goal.pledgedExperience?.experienceId,
        },
      });
      throw error;
    }
  }

  /** Attach a purchased gift to a free goal */
  async attachGiftToGoal(goalId: string, experienceGiftId: string, giverId: string, isMystery: boolean = false): Promise<void> {
    const goalRef = doc(db, 'goals', goalId);
    const goalSnap = await getDoc(goalRef);

    if (!goalSnap.exists()) throw new Error('Goal not found');
    const goalData = goalSnap.data();

    if (!goalData.isFreeGoal) throw new Error('Can only attach gifts to free goals');

    // Check 30-day deadline for completed goals
    if (goalData.isCompleted && goalData.giftAttachDeadline) {
      const deadline = toJSDate(goalData.giftAttachDeadline);
      if (deadline && new Date() > deadline) {
        throw new Error('Gift attachment window has expired (30 days post-completion)');
      }
    }

    // Validate gift exists
    const giftSnap = await getDoc(doc(db, 'experienceGifts', experienceGiftId));
    if (!giftSnap.exists()) throw new Error('Experience gift not found');

    const updateFields: any = {
      experienceGiftId,
      giftAttachedAt: serverTimestamp(),
      empoweredBy: giverId,
      updatedAt: serverTimestamp(),
    };

    if (isMystery) {
      updateFields.isMystery = true;
      // Note: experienceId is resolved server-side via Cloud Function for hint generation
      // Never store it on the goal document to prevent the recipient from spoiling the mystery
    }

    await updateDoc(goalRef, updateFields);

    analyticsService.trackEvent('gift_attached_to_goal', 'conversion', { goalId, experienceGiftId, giverId, isMystery });
    logger.log(`✅ Gift attached to free goal: ${goalId}${isMystery ? ' (mystery)' : ''}`);
  }




  /** Real-time listener */
  listenToUserGoals(userId: string, cb: (goals: Goal[]) => void) {
    const qy = query(this.goalsCollection, where('userId', '==', userId));
    const unsub = onSnapshot(qy, async (snap) => {
      try {
        const goals = await Promise.all(
          snap.docs.map(async (d) => {
            const data = normalizeGoal({ id: d.id, ...d.data() });
            try {
              return await this.applyExpiredWeeksSweep(data);
            } catch (sweepError) {
              logger.error(`Error in applyExpiredWeeksSweep for goal ${data.id}:`, sweepError);
              return data; // Return un-swept goal rather than crashing
            }
          })
        );
        cb(goals);
      } catch (error) {
        logger.error('Error processing goals in listenToUserGoals:', error);
        // Still try to return basic normalized goals
        const fallbackGoals = snap.docs.map((d) => normalizeGoal({ id: d.id, ...d.data() }));
        cb(fallbackGoals);
      }
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

  async appendHint(goalId: string, hintObj: any) {
    // SECURITY: Validate hint structure
    if (!hintObj || typeof hintObj !== 'object') {
      throw new Error('Invalid hint object');
    }

    if (!hintObj.id || !hintObj.session || typeof hintObj.session !== 'number') {
      throw new Error('Hint must have id and session number');
    }

    // SECURITY: Validate and sanitize text content
    if (hintObj.text) {
      if (typeof hintObj.text !== 'string') {
        throw new Error('Hint text must be a string');
      }
      // Limit text length to prevent storage DoS
      const MAX_TEXT_LENGTH = 500;
      if (hintObj.text.length > MAX_TEXT_LENGTH) {
        hintObj.text = hintObj.text.substring(0, MAX_TEXT_LENGTH);
        logger.warn(`⚠️ Hint text truncated to ${MAX_TEXT_LENGTH} characters`);
      }
      // Basic sanitization: trim whitespace
      hintObj.text = hintObj.text.trim();
    }

    // SECURITY: Validate URLs if present
    if (hintObj.audioUrl && !this.isValidUrl(hintObj.audioUrl)) {
      throw new Error('Invalid audio URL');
    }
    if (hintObj.imageUrl && !this.isValidUrl(hintObj.imageUrl)) {
      throw new Error('Invalid image URL');
    }

    // SECURITY: Check array size limit before adding
    const currentGoal = await this.getGoalById(goalId);
    if (!currentGoal) {
      throw new Error('Goal not found');
    }
    const MAX_HINTS = 1000; // Reasonable limit for a goal
    if ((currentGoal.hints?.length || 0) >= MAX_HINTS) {
      throw new Error(`Maximum hints limit (${MAX_HINTS}) reached for this goal`);
    }

    // Create clean hint object with only allowed fields
    const cleanHint: any = {
      id: hintObj.id,
      session: hintObj.session,
      giverName: hintObj.giverName || 'Anonymous',
      date: hintObj.date || Date.now(),
      createdAt: hintObj.createdAt || DateHelper.now(),
    };

    // Add optional fields if present
    if (hintObj.text) cleanHint.text = hintObj.text;
    if (hintObj.audioUrl) cleanHint.audioUrl = hintObj.audioUrl;
    if (hintObj.imageUrl) cleanHint.imageUrl = hintObj.imageUrl;
    if (hintObj.type) cleanHint.type = hintObj.type;
    if (typeof hintObj.duration === 'number') cleanHint.duration = hintObj.duration;

    const goalRef = doc(db, 'goals', goalId);
    await updateDoc(goalRef, {
      hints: arrayUnion(cleanHint),
      updatedAt: serverTimestamp(),
    });
  }

  // SECURITY: URL validation helper
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      // Only allow https URLs from Firebase Storage
      return parsed.protocol === 'https:' &&
        parsed.hostname.includes('firebasestorage.googleapis.com');
    } catch {
      return false;
    }
  }

  /** Set a personalized hint from giver for recipient's next session */
  async setPersonalizedNextHint(
    goalId: string,
    hintData: Omit<PersonalizedHint, 'createdAt'>
  ): Promise<void> {
    const goalRef = doc(db, 'goals', goalId);
    await updateDoc(goalRef, {
      personalizedNextHint: {
        ...hintData,
        createdAt: DateHelper.now(),
      },
      updatedAt: serverTimestamp(),
    });
  }

  /** Clear personalized hint after it has been shown to recipient */
  async clearPersonalizedNextHint(goalId: string): Promise<void> {
    const goalRef = doc(db, 'goals', goalId);
    await updateDoc(goalRef, {
      personalizedNextHint: null,
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

    // SECURITY: Whitelist allowed fields to prevent unintended writes
    const allowedFields = [
      'weeklyCount', 'weeklyLogDates', 'isWeekCompleted', 'isCompleted',
      'currentCount', 'weekStartAt', 'hints', 'personalizedNextHint',
      'receiverMessage', 'suggestedTargetCount', 'suggestedSessionsPerWeek',
      'approvalStatus', 'giverMessage', 'giverActionTaken', 'description',
      'targetCount', 'sessionsPerWeek', 'duration', 'endDate'
    ];

    const sanitizedUpdates = Object.keys(updates)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => ({ ...obj, [key]: updates[key as keyof Goal] }), {});

    await updateDoc(ref, { ...sanitizedUpdates, updatedAt: serverTimestamp() });
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
      logger.error('Error fetching goal coupon:', error);
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
          couponGeneratedAt: DateHelper.now(),
        },
        { merge: true }
      );
    } catch (error) {
      logger.error('Error saving goal coupon:', error);
    }
  }

  /** Handle expired or completed weeks */
  async applyExpiredWeeksSweep(goal: Goal): Promise<Goal> {
    let g = normalizeGoal(goal);
    if (!g.weekStartAt || !g.id) return g;

    // ✅ Skip completed goals - no need to sweep them
    if (g.isCompleted) return g;

    let anchor = new Date(g.weekStartAt);
    const now = DateHelper.now();
    let didSweep = false;
    let hadIncompleteSweep = false;

    // Use a while loop to process ALL expired weeks, not just one
    while (now > addDaysSafe(anchor, 7)) {
      didSweep = true;
      const weekWasCompleted = g.isWeekCompleted || g.weeklyCount >= g.sessionsPerWeek;

      // Only count completed weeks toward progress
      if (weekWasCompleted) {
        g.currentCount += 1;
        // T1-1: Detect goal completion during sweep
        if (g.currentCount >= g.targetCount) {
          g.isCompleted = true;
          g.completedAt = DateHelper.now();
        }
      } else {
        hadIncompleteSweep = true;
      }

      // Advance to next week window
      anchor = addDaysSafe(anchor, 7);

      // Reset sessions for new week
      g.weeklyCount = 0;
      g.weeklyLogDates = [];
      g.isWeekCompleted = false;
    }

    // Only write to Firestore if weeks were actually swept
    // This prevents infinite loops in real-time listeners (write → snapshot → sweep → write)
    if (didSweep) {
      g.weekStartAt = anchor;
      const ref = doc(db, 'goals', g.id);
      const sweepUpdate: any = {
        currentCount: g.currentCount,
        weekStartAt: anchor,
        weeklyCount: g.weeklyCount,
        weeklyLogDates: [],
        isWeekCompleted: false,
        isCompleted: !!g.isCompleted,
        updatedAt: serverTimestamp(),
      };
      if (g.isCompleted) {
        sweepUpdate.completedAt = serverTimestamp();
      }
      await updateDoc(ref, sweepUpdate);

      // Single-goal users: reset streak if weekly target was missed
      if (hadIncompleteSweep && g.userId) {
        try {
          const startedGoalsSnap = await getDocs(
            query(this.goalsCollection, where('userId', '==', g.userId), where('isCompleted', '==', false))
          );
          const startedGoalCount = startedGoalsSnap.docs.filter(d => d.data().weekStartAt != null).length;
          if (startedGoalCount <= 1) {
            const userRef = doc(db, 'users', g.userId);
            await updateDoc(userRef, { sessionStreak: 0 });
            logger.log(`🔥 Streak reset for single-goal user ${g.userId} (missed weekly target)`);
          }
        } catch (streakResetError) {
          logger.error('Error resetting streak during sweep:', streakResetError);
        }
      }
    }

    return g;
  }


  /** Increment a session for the current anchored week */
  async tickWeeklySession(goalId: string): Promise<Goal> {
    const ref = doc(db, 'goals', goalId);

    // ✅ SECURITY: Atomic read-modify-write via Firestore transaction
    // Prevents race condition when user taps "Log Session" rapidly
    const txResult = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error('Goal not found');

      let g = normalizeGoal({ id: snap.id, ...snap.data() });

      // If it's the user's first session
      if (!g.weekStartAt) {
        g.weekStartAt = DateHelper.now();
        g.weeklyCount = 0;
        g.weeklyLogDates = [];
      }

      // Inline expired weeks sweep (pure computation inside transaction, no standalone writes)
      let hadIncompleteSweep = false;
      if (g.weekStartAt && g.id && !g.isCompleted) {
        let anchor = new Date(g.weekStartAt);
        const now = DateHelper.now();
        while (now > addDaysSafe(anchor, 7)) {
          const weekWasCompleted = g.isWeekCompleted || g.weeklyCount >= g.sessionsPerWeek;
          if (weekWasCompleted) {
            g.currentCount += 1;
            // T1-1: Detect goal completion during inline sweep
            if (g.currentCount >= g.targetCount) {
              g.isCompleted = true;
              g.completedAt = DateHelper.now();
            }
          } else {
            hadIncompleteSweep = true;
          }
          anchor = addDaysSafe(anchor, 7);
          g.weeklyCount = 0;
          g.weeklyLogDates = [];
          g.isWeekCompleted = false;
        }
        g.weekStartAt = anchor;
      }

      const todayIso = isoDateOnly(DateHelper.now());

      // Prevent multiple sessions same day (unless debug)
      if (!this.DEBUG_ALLOW_MULTIPLE_PER_DAY && g.weeklyLogDates.includes(todayIso)) {
        return { goal: g, didIncrement: false, hadIncompleteSweep, previousWeeklyCount: 0, totalCompletedSessions: 0, totalSessions: 0, progressPercentage: 0 };
      }

      // Prevent extra sessions if week already completed
      if (g.weeklyCount >= g.sessionsPerWeek) {
        // Calculate next week start for friendlier message
        const nextWeekStart = new Date(g.weekStartAt!);
        nextWeekStart.setDate(nextWeekStart.getDate() + 7);
        const nextWeekStr = nextWeekStart.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        throw new Error(`All sessions done this week! Your next week starts on ${nextWeekStr}.`);
      }

      // Add new session
      const previousWeeklyCount = g.weeklyCount;
      g.weeklyCount += 1;
      if (!g.weeklyLogDates.includes(todayIso)) {
        g.weeklyLogDates = [...g.weeklyLogDates, todayIso];
      }

      // Calculate total completed sessions
      const totalCompletedSessions = g.currentCount * g.sessionsPerWeek + g.weeklyCount;
      const totalSessions = g.targetCount * g.sessionsPerWeek;
      const progressPercentage = Math.round((totalCompletedSessions / totalSessions) * 100);

      // If weekly goal reached → mark as completed
      if (g.weeklyCount >= g.sessionsPerWeek) {
        g.isWeekCompleted = true;
        if (g.currentCount + 1 >= g.targetCount) {
          g.isCompleted = true;
          g.completedAt = DateHelper.now();
        }
      }

      // Persist atomically via transaction
      const updateData: any = {
        weeklyCount: g.weeklyCount,
        weeklyLogDates: g.weeklyLogDates,
        isWeekCompleted: g.isWeekCompleted || false,
        isCompleted: !!g.isCompleted,
        weekStartAt: g.weekStartAt,
        currentCount: g.currentCount,
        updatedAt: serverTimestamp(),
      };
      if (g.isCompleted) {
        updateData.completedAt = serverTimestamp();
      }
      transaction.update(ref, updateData);

      return { goal: g, didIncrement: true, hadIncompleteSweep, previousWeeklyCount, totalCompletedSessions, totalSessions, progressPercentage };
    });

    const { goal: g, didIncrement, hadIncompleteSweep, previousWeeklyCount, totalCompletedSessions, totalSessions, progressPercentage } = txResult;

    // If no increment happened (already logged today), return early
    if (!didIncrement) return { ...g };

    // === Streak tracking (user-level, outside transaction) ===
    try {
      const userRef = doc(db, 'users', g.userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const todayIsoStreak = new Date().toISOString().split('T')[0];
        const currentStreak = userData.sessionStreak || 0;
        const longestStreak = userData.longestSessionStreak || 0;
        const lastSessionDate = userData.lastSessionDate;

        // Count started (non-completed) goals to determine streak mode
        const startedGoalsSnap = await getDocs(
          query(this.goalsCollection, where('userId', '==', g.userId), where('isCompleted', '==', false))
        );
        const startedGoalCount = startedGoalsSnap.docs.filter(d => d.data().weekStartAt != null).length;

        let newStreak: number;
        if (startedGoalCount <= 1 && hadIncompleteSweep) {
          // Single started goal + missed weekly target → reset streak
          newStreak = 1;
        } else if (lastSessionDate) {
          const lastDate = new Date(lastSessionDate);
          const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
          // Multi-goal: reset streak if >7 days since last session
          newStreak = daysSince > 7 ? 1 : currentStreak + 1;
        } else {
          newStreak = 1; // First session ever
        }

        const newLongest = Math.max(longestStreak, newStreak);
        await updateDoc(userRef, {
          sessionStreak: newStreak,
          longestSessionStreak: newLongest,
          lastSessionDate: todayIsoStreak,
        });
        logger.log(`🔥 Streak updated for user ${g.userId}: ${newStreak} (longest: ${newLongest})`);
      }
    } catch (streakError) {
      logger.error('Error updating session streak:', streakError);
    }

    // Analytics (non-critical, outside transaction)
    analyticsService.trackEvent('session_logged', 'engagement', { goalId, weeklyCount: g.weeklyCount, sessionsPerWeek: g.sessionsPerWeek, currentCount: g.currentCount, targetCount: g.targetCount });

    // === Side effects: Feed posts & notifications (outside transaction) ===

    if (g.isCompleted) {
      // Goal completed — create feed post & notifications
      try {
          const userDoc = await getDoc(doc(db, 'users', g.userId));
          const userData = userDoc.exists() ? userDoc.data() : null;

          // Fetch experience details for the completion post
          let experienceTitle: string | undefined;
          let experienceImageUrl: string | undefined;
          let partnerName: string | undefined;

          if (g.isFreeGoal && g.pledgedExperience) {
            // FREE GOAL: use pledged experience snapshot
            experienceTitle = g.pledgedExperience.title;
            experienceImageUrl = g.pledgedExperience.coverImageUrl;
            partnerName = g.pledgedExperience.subtitle;

            // Set 30-day gift attach deadline
            const deadline = new Date();
            deadline.setDate(deadline.getDate() + 30);
            const goalRef = doc(db, 'goals', g.id);
            await updateDoc(goalRef, { giftAttachDeadline: deadline });
            g.giftAttachDeadline = deadline;
          } else if (g.experienceGiftId) {
            // STANDARD GOAL: fetch from gift
            try {
              const experienceGift = await experienceGiftService.getExperienceGiftById(g.experienceGiftId);
              const experience = await experienceService.getExperienceById(experienceGift.experienceId);

              experienceTitle = experience?.title;
              experienceImageUrl = experience?.coverImageUrl || (experience?.imageUrl?.[0]);
              partnerName = experience?.subtitle;
            } catch (expError) {
              logger.warn('Could not fetch experience details for feed post:', expError);
            }
          }

          await feedService.createFeedPost({
            userId: g.userId,
            userName: userData?.displayName || userData?.profile?.name || 'User',
            userProfileImageUrl: userData?.profile?.profileImageUrl,
            goalId: g.id,
            goalDescription: g.description,
            type: 'goal_completed',
            sessionNumber: totalSessions,
            totalSessions: totalSessions,
            progressPercentage: 100,
            experienceTitle,
            experienceImageUrl,
            partnerName,
            experienceGiftId: g.experienceGiftId || undefined,
            isFreeGoal: g.isFreeGoal,
            pledgedExperienceId: g.pledgedExperience?.experienceId,
            pledgedExperiencePrice: g.pledgedExperience?.price,
            isMystery: g.isMystery || false,
            preferredRewardCategory: g.preferredRewardCategory,
            createdAt: new Date(),
          });

          // 🎯 FREE GOAL COMPLETION: Notify friends to empower
          if (g.isFreeGoal && g.pledgedExperience) {
            try {
              const friends = await friendService.getFriends(g.userId);
              const uName = userData?.displayName || userData?.profile?.name || 'Your friend';
              const expTitle = g.pledgedExperience.title;

              for (const friend of friends) {
                await notificationService.createNotification(
                  friend.friendId,
                  'free_goal_completed',
                  `🏆 ${uName} completed their challenge!`,
                  `${uName} finished their ${g.targetCount}-week challenge! Gift them "${expTitle}" to celebrate 🎁`,
                  {
                    goalId: g.id,
                    goalUserId: g.userId,
                    goalUserName: uName,
                    goalUserProfileImageUrl: userData?.profile?.profileImageUrl,
                    experienceId: g.pledgedExperience.experienceId,
                    experienceTitle: expTitle,
                    experiencePrice: g.pledgedExperience.price,
                    experienceCoverImageUrl: g.pledgedExperience.coverImageUrl,
                    milestone: 100,
                  },
                  true
                );
              }
              logger.log(`🎯 Sent completion notifications to ${friends.length} friends for free goal ${g.id}`);
            } catch (completionNotifError) {
              logger.error('Error sending free goal completion notifications:', completionNotifError);
            }
          }

          // Completion notifications for category-only free goals
          if (g.isFreeGoal && !g.pledgedExperience && g.preferredRewardCategory) {
            try {
              const friends = await friendService.getFriends(g.userId);
              const uName = userData?.displayName || userData?.profile?.name || 'Your friend';
              const categoryLabel = g.preferredRewardCategory.charAt(0).toUpperCase() + g.preferredRewardCategory.slice(1);

              for (const friend of friends) {
                await notificationService.createNotification(
                  friend.friendId,
                  'free_goal_completed',
                  `🏆 ${uName} completed their challenge!`,
                  `${uName} finished their ${g.targetCount}-week challenge! They love ${categoryLabel} experiences — gift one to celebrate! 🎁`,
                  {
                    goalId: g.id,
                    goalUserId: g.userId,
                    goalUserName: uName,
                    goalUserProfileImageUrl: userData?.profile?.profileImageUrl,
                    preferredRewardCategory: g.preferredRewardCategory,
                    milestone: 100,
                  },
                  true
                );
              }
              logger.log(`🎯 Sent completion notifications (category: ${g.preferredRewardCategory}) to ${friends.length} friends for free goal ${g.id}`);
            } catch (completionError) {
              logger.error('Error sending category completion notifications:', completionError);
            }
          }
        } catch (error) {
          logger.error('Error creating goal completion feed post:', error);
        }
    } else if (previousWeeklyCount < g.weeklyCount) {
      // Create feed post for every session progress (not just milestones)
      try {
        const userDoc = await getDoc(doc(db, 'users', g.userId));
        const userData = userDoc.exists() ? userDoc.data() : null;

        await feedService.createFeedPost({
          userId: g.userId,
          userName: userData?.displayName || userData?.profile?.name || 'User',
          userProfileImageUrl: userData?.profile?.profileImageUrl,
          goalId: g.id,
          goalDescription: g.description,
          type: 'session_progress',
          sessionNumber: totalCompletedSessions,
          totalSessions: totalSessions,
          progressPercentage: progressPercentage,
          weeklyCount: g.weeklyCount,
          sessionsPerWeek: g.sessionsPerWeek,
          isMystery: g.isMystery || false,
          isFreeGoal: g.isFreeGoal || false,
          pledgedExperienceId: g.pledgedExperience?.experienceId,
          pledgedExperiencePrice: g.pledgedExperience?.price,
          experienceTitle: g.pledgedExperience?.title,
          experienceImageUrl: g.pledgedExperience?.coverImageUrl,
          preferredRewardCategory: g.preferredRewardCategory,
          createdAt: new Date(),
        });
      } catch (error) {
        logger.error('Error creating progress feed post:', error);
      }

      // 🎯 FREE GOAL MILESTONE NOTIFICATIONS: Notify friends at 25%, 50%, 75%
      if (g.isFreeGoal && g.pledgedExperience) {
        const MILESTONES = [25, 50, 75];
        const prevPercentage = Math.round(((totalCompletedSessions - 1) / totalSessions) * 100);
        const crossedMilestone = MILESTONES.find(
          m => prevPercentage < m && progressPercentage >= m
        );

        if (crossedMilestone) {
          try {
            const friends = await friendService.getFriends(g.userId);
            const userName = await userService.getUserName(g.userId) || 'Your friend';
            const userProfile = await userService.getUserProfile(g.userId);
            const expTitle = g.pledgedExperience.title;
            const milestoneEmoji = crossedMilestone === 75 ? '🔥' : crossedMilestone === 50 ? '⚡' : '🌟';

            for (const friend of friends) {
              await notificationService.createNotification(
                friend.friendId,
                'free_goal_milestone',
                `${milestoneEmoji} ${userName} is ${crossedMilestone}% there!`,
                `${userName} is ${crossedMilestone}% through their ${g.description.replace('Work on ', '').replace(/.* for.*$/, '')} challenge. Empower them with "${expTitle}" 🎁`,
                {
                  goalId: g.id,
                  goalUserId: g.userId,
                  goalUserName: userName,
                  goalUserProfileImageUrl: userProfile?.profileImageUrl,
                  experienceId: g.pledgedExperience.experienceId,
                  experienceTitle: expTitle,
                  experiencePrice: g.pledgedExperience.price,
                  experienceCoverImageUrl: g.pledgedExperience.coverImageUrl,
                  milestone: crossedMilestone,
                },
                true // clearable
              );
            }

            logger.log(`🎯 Sent ${crossedMilestone}% milestone notifications to ${friends.length} friends for free goal ${g.id}`);
          } catch (milestoneError) {
            logger.error('Error sending milestone notifications:', milestoneError);
          }
        }
      }

      // Milestone notifications for category-only free goals
      if (g.isFreeGoal && !g.pledgedExperience && g.preferredRewardCategory) {
        const MILESTONES = [25, 50, 75];
        const prevPercentage = Math.round(((totalCompletedSessions - 1) / totalSessions) * 100);
        const crossedMilestone = MILESTONES.find(
          m => prevPercentage < m && progressPercentage >= m
        );

        if (crossedMilestone) {
          try {
            const friends = await friendService.getFriends(g.userId);
            const userName = await userService.getUserName(g.userId) || 'Your friend';
            const userProfile = await userService.getUserProfile(g.userId);
            const categoryLabel = g.preferredRewardCategory.charAt(0).toUpperCase() + g.preferredRewardCategory.slice(1);
            const milestoneEmoji = crossedMilestone === 75 ? '🔥' : crossedMilestone === 50 ? '⚡' : '🌟';

            for (const friend of friends) {
              await notificationService.createNotification(
                friend.friendId,
                'free_goal_milestone',
                `${milestoneEmoji} ${userName} is ${crossedMilestone}% there!`,
                `${userName} is ${crossedMilestone}% through their challenge. They love ${categoryLabel} experiences — empower them! 🎁`,
                {
                  goalId: g.id,
                  goalUserId: g.userId,
                  goalUserName: userName,
                  goalUserProfileImageUrl: userProfile?.profileImageUrl,
                  preferredRewardCategory: g.preferredRewardCategory,
                  milestone: crossedMilestone,
                },
                true
              );
            }

            logger.log(`🎯 Sent ${crossedMilestone}% milestone notifications (category: ${g.preferredRewardCategory}) to ${friends.length} friends for free goal ${g.id}`);
          } catch (milestoneError) {
            logger.error('Error sending category milestone notifications:', milestoneError);
          }
        }
      }
    } // end else if (previousWeeklyCount < g.weeklyCount)

    return { ...(g as any) } as Goal;
  }

  /** Approve a goal */
  async approveGoal(goalId: string, message?: string): Promise<Goal> {
    const ref = doc(db, 'goals', goalId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Goal not found');
    const currentGoal = normalizeGoal({ id: snap.id, ...snap.data() });

    // Extract category from title or description
    const titleMatch = currentGoal.title?.match(/Attend (.+) Sessions/);
    const category = titleMatch ? titleMatch[1] : 'this goal';

    // Check if there are suggested changes and apply them
    const finalTargetCount = currentGoal.suggestedTargetCount || currentGoal.targetCount;
    const finalSessionsPerWeek = currentGoal.suggestedSessionsPerWeek || currentGoal.sessionsPerWeek;

    // If suggestions exist, recalculate duration and endDate
    let updates: any = {
      approvalStatus: 'approved',
      giverMessage: message || '',
      giverActionTaken: true,
      updatedAt: serverTimestamp(),
    };

    if (currentGoal.suggestedTargetCount || currentGoal.suggestedSessionsPerWeek) {
      // Apply the suggested changes
      const durationInDays = finalTargetCount * 7;
      const startDate = toJSDate(currentGoal.startDate) || DateHelper.now();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + durationInDays);

      updates = {
        ...updates,
        targetCount: finalTargetCount,
        sessionsPerWeek: finalSessionsPerWeek,
        duration: durationInDays,
        endDate,
      };
    }

    // Update description to reflect final values
    const updatedDescription = `Work on ${category} for ${finalTargetCount} weeks, ${finalSessionsPerWeek} times per week.`;
    updates.description = updatedDescription;

    await updateDoc(ref, updates);
    const updatedSnap = await getDoc(ref);
    const goal = normalizeGoal({ id: updatedSnap.id, ...updatedSnap.data() });

    analyticsService.trackEvent('goal_approved', 'conversion', { goalId, targetCount: finalTargetCount, sessionsPerWeek: finalSessionsPerWeek });

    // Create feed post for goal approval
    try {
      const userDoc = await getDoc(doc(db, 'users', goal.userId));
      const userData = userDoc.exists() ? userDoc.data() : null;

      await feedService.createFeedPost({
        userId: goal.userId,
        userName: userData?.displayName || userData?.profile?.name || 'User',
        userProfileImageUrl: userData?.profile?.profileImageUrl,
        goalId: goal.id,
        goalDescription: goal.description,
        type: 'goal_approved',
        totalSessions: goal.targetCount * goal.sessionsPerWeek,
        createdAt: new Date(),
      });
    } catch (error) {
      logger.error('Error creating goal approval feed post:', error);
    }

    return goal;
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
    const now = DateHelper.now();
    const durationInDays = newTargetCount * 7;
    // Ensure startDate is a Date object
    const startDate = toJSDate(currentGoal.startDate) || DateHelper.now();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationInDays);

    // Extract category from title or description
    const titleMatch = currentGoal.title?.match(/Attend (.+) Sessions/);
    const category = titleMatch ? titleMatch[1] : 'this goal';

    // Update description to reflect new values
    const updatedDescription = `Work on ${category} for ${newTargetCount} weeks, ${newSessionsPerWeek} times per week.`;

    const updates: any = {
      approvalStatus: 'approved',
      targetCount: newTargetCount,
      sessionsPerWeek: newSessionsPerWeek,
      duration: durationInDays,
      endDate,
      description: updatedDescription,
      receiverMessage: message || '',
      updatedAt: serverTimestamp(),
    };
    await updateDoc(ref, updates);
    const snap = await getDoc(ref);
    const goal = normalizeGoal({ id: snap.id, ...snap.data() });

    // Create feed post for goal approval (with changes)
    try {
      const userDoc = await getDoc(doc(db, 'users', goal.userId));
      const userData = userDoc.exists() ? userDoc.data() : null;

      // Use updatedDescription directly to ensure we have the correct value
      await feedService.createFeedPost({
        userId: goal.userId,
        userName: userData?.displayName || userData?.profile?.name || 'User',
        userProfileImageUrl: userData?.profile?.profileImageUrl,
        goalId: goal.id,
        goalDescription: updatedDescription, // Use updatedDescription instead of goal.description
        type: 'goal_approved',
        totalSessions: newTargetCount * newSessionsPerWeek,
        createdAt: new Date(),
      });
    } catch (error) {
      logger.error('Error creating goal approval feed post:', error);
    }

    return goal;
  }

  /** Auto-approve goal if deadline passed */
  async checkAndAutoApprove(goalId: string): Promise<Goal | null> {
    const ref = doc(db, 'goals', goalId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const goal = normalizeGoal({ id: snap.id, ...snap.data() });

    if (goal.approvalStatus === 'pending' && goal.approvalDeadline) {
      const now = DateHelper.now();
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

  // ✅ SECURITY: Debug Tools (Development Only)
  // These methods are ONLY available in development builds
  // In production builds, they are no-ops that Metro will tree-shake
  async debugAdvanceWeek(goalId: string): Promise<void> {
    if (!config.debugEnabled) {
      logger.warn('⚠️ Debug tools not available in production');
      return;
    }
    DateHelper.addOffset(7 * 24 * 60 * 60 * 1000);
    logger.log('🕒 Advanced time by 1 week');
  }

  async debugAdvanceDay(goalId: string): Promise<void> {
    console.log('🔧 debugAdvanceDay called, config.debugEnabled:', config.debugEnabled);
    if (!config.debugEnabled) {
      console.warn('⚠️ Debug tools not available in production');
      return;
    }
    DateHelper.addOffset(24 * 60 * 60 * 1000);
    console.log('🕒 Advanced time by 1 day, new DateHelper.now():', DateHelper.now().toISOString());
  }

  async debugRewindWeek(goalId: string): Promise<void> {
    if (!config.debugEnabled) {
      logger.warn('⚠️ Debug tools not available in production');
      return;
    }
    DateHelper.addOffset(-7 * 24 * 60 * 60 * 1000);
    logger.log('🕒 Rewound time by 1 week');
  }

  async debugRewindDay(goalId: string): Promise<void> {
    if (!config.debugEnabled) {
      logger.warn('⚠️ Debug tools not available in production');
      return;
    }
    DateHelper.addOffset(-24 * 60 * 60 * 1000);
    logger.log('🕒 Rewound time by 1 day');
  }
}

// ✅ SECURITY: Build-time code elimination
// The following pattern allows Metro/webpack to completely remove debug code in production:
// 1. In development: goalService has all methods
// 2. In production: debug methods are still defined but are no-ops (minimal overhead)
//
// For COMPLETE elimination, you can use babel-plugin-transform-remove-console
// or add to babel.config.js:
//   plugins: [
//     ['transform-remove-console', { exclude: ['error', 'warn'] }],
//     // For complete debug method removal:
//     process.env.NODE_ENV === 'production' && ['babel-plugin-transform-dead-code-elimination']
//   ].filter(Boolean)

export const goalService = new GoalService();
(goalService as any).appendHint = goalService.appendHint.bind(goalService);
