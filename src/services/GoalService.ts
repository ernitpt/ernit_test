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
} from 'firebase/firestore';
import type { Goal, PersonalizedHint } from '../types';
import { feedService } from './FeedService';
import { experienceGiftService } from './ExperienceGiftService';
import { experienceService } from './ExperienceService';
import { logger } from '../utils/logger';
import { config } from '../config/environment';

// ===== Helpers =====
const isoDateOnly = (d: Date) => d.toISOString().slice(0, 10);
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
    updatedAt: toJSDate(g.updatedAt) ?? DateHelper.now(),
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
        totalSessions: normalized.targetCount,
        createdAt: DateHelper.now(),
      });
    } catch (error) {
      logger.error('Error creating feed post:', error);
    }

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

    let anchor = new Date(g.weekStartAt);
    const now = DateHelper.now();

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
      g.weekStartAt = DateHelper.now();
      g.weeklyCount = 0;
      g.weeklyLogDates = [];
    }

    // Sweep expired weeks
    g = await this.applyExpiredWeeksSweep(g);

    const todayIso = isoDateOnly(DateHelper.now());

    // Prevent multiple sessions same day (unless debug)
    if (!this.DEBUG_ALLOW_MULTIPLE_PER_DAY && g.weeklyLogDates.includes(todayIso)) {
      return { ...g };
    }

    // Prevent extra sessions if week already completed
    if (g.weeklyCount >= g.sessionsPerWeek) {
      throw new Error("Week already completed. Wait until next week to continue!");
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

    // If weekly goal reached → mark as completed but don't roll yet
    if (g.weeklyCount >= g.sessionsPerWeek) {
      g.isWeekCompleted = true;

      // If it's the final week
      if (g.currentCount + 1 >= g.targetCount) {
        g.isCompleted = true;

        // Create feed post for goal completion
        try {
          const userDoc = await getDoc(doc(db, 'users', g.userId));
          const userData = userDoc.exists() ? userDoc.data() : null;

          // Fetch experience details for the completion post
          let experienceTitle: string | undefined;
          let experienceImageUrl: string | undefined;
          let partnerName: string | undefined;

          try {
            const experienceGift = await experienceGiftService.getExperienceGiftById(g.experienceGiftId);
            const experience = await experienceService.getExperienceById(experienceGift.experienceId);

            experienceTitle = experience?.title;
            experienceImageUrl = experience?.coverImageUrl || (experience?.imageUrl?.[0]);
            partnerName = experience?.subtitle;
          } catch (expError) {
            logger.warn('Could not fetch experience details for feed post:', expError);
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
            experienceGiftId: g.experienceGiftId,
            createdAt: DateHelper.now(),
          });
        } catch (error) {
          logger.error('Error creating goal completion feed post:', error);
        }
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
          createdAt: DateHelper.now(),
        });
      } catch (error) {
        logger.error('Error creating progress feed post:', error);
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
        createdAt: DateHelper.now(),
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
        createdAt: DateHelper.now(),
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

