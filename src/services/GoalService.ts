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
export const isoDateOnly = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
export const isValidDate = (d: any): d is Date => d instanceof Date && !isNaN(d.getTime());

export function toJSDate(value: any): Date | null {
  if (!value) return null;

  // Firestore Timestamp - proper type guard instead of @ts-ignore
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }

  const d = new Date(value);
  return isValidDate(d) ? d : null;
}

export function addDaysSafe(base: Date | null | undefined, days: number): Date {
  const b = isValidDate(base as any) ? (base as Date) : DateHelper.now();
  const x = new Date(b);
  x.setDate(b.getDate() + days);
  return x;
}

/** Ensure all date-like fields are valid Dates (or null) and fix missing arrays/numbers */
export function normalizeGoal(g: any): Goal {
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

  /** Handle expired or completed weeks - delegated to GoalSessionService */
  async applyExpiredWeeksSweep(goal: Goal): Promise<Goal> {
    // Import dynamically to avoid circular dependency at module load time
    const { goalSessionService } = await import('./GoalSessionService');
    return goalSessionService.sweepExpiredWeeks(goal);
  }


  /** Increment a session for the current anchored week - delegated to GoalSessionService */
  async tickWeeklySession(goalId: string): Promise<Goal> {
    // Import dynamically to avoid circular dependency at module load time
    const { goalSessionService } = await import('./GoalSessionService');
    return goalSessionService.tickWeeklySession(goalId);
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
    if (!config.debugEnabled) {
      logger.warn('⚠️ Debug tools not available in production');
      return;
    }
    DateHelper.addOffset(24 * 60 * 60 * 1000);
    logger.log('🕒 Advanced time by 1 day');
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
