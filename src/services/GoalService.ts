import { DateHelper } from '../utils/DateHelper';
import { isoDateOnly, isValidDate, toJSDate, addDaysSafe, normalizeGoal } from '../utils/GoalHelpers';
import { db, auth } from './firebase';
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

/** Minimal shape accepted by appendHint — satisfied by both PersonalizedHint and HintObject */
type AppendHintInput = {
  id: string;
  session: number;
  giverName?: string;
  date?: number;
  createdAt?: Date;
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  type?: PersonalizedHint['type'];
  duration?: number;
  hint?: string;
};
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
import { AppError } from '../utils/AppError';
import { sanitizeText } from '../utils/sanitization';

// Re-export helpers from GoalHelpers so existing importers of these symbols from
// GoalService continue to work without breaking changes.
export { isoDateOnly, isValidDate, toJSDate, addDaysSafe, normalizeGoal } from '../utils/GoalHelpers';

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
  async createGoal(goal: Goal): Promise<Goal> {
    try {
      // Check goal limit (max 3 active goals, exempt paid gifted goals)
      const isPaidGiftedGoal = !!goal.experienceGiftId && !goal.isFreeGoal;
      if (!isPaidGiftedGoal) {
        const activeGoalsQuery = query(
          this.goalsCollection,
          where('userId', '==', goal.userId),
          where('isCompleted', '==', false),
        );
        const activeGoalsSnapshot = await getDocs(activeGoalsQuery);
        if (activeGoalsSnapshot.size >= 3) {
          throw new AppError('GOAL_LIMIT_REACHED', 'You can have up to 3 active goals.', 'business');
        }
      }

      const normalized = normalizeGoal(goal);
      const docRef = await addDoc(this.goalsCollection, {
        ...normalized,
        title: sanitizeText(normalized.title || '', 100),
        description: sanitizeText(normalized.description || '', 500),
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
      } catch (error: unknown) {
        logger.error('Error creating feed post:', error);
      }

      analyticsService.trackEvent('goal_creation_completed', 'conversion', { goalId: docRef.id, targetCount: normalized.targetCount, sessionsPerWeek: normalized.sessionsPerWeek, isFreeGoal: false });
      return { ...normalized, id: docRef.id };
    } catch (error: unknown) {
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
        throw new AppError('INVALID_GOAL_DATA', 'Invalid free goal data: missing isFreeGoal', 'validation');
      }

      // Check goal limit (max 3 active goals, exempt paid commitment goals)
      const hasPaidCommitment = !!goal.paymentCommitment && goal.paymentCommitment !== null;
      if (!hasPaidCommitment) {
        const activeGoalsQuery = query(
          this.goalsCollection,
          where('userId', '==', goal.userId),
          where('isCompleted', '==', false),
        );
        const activeGoalsSnapshot = await getDocs(activeGoalsQuery);
        if (activeGoalsSnapshot.size >= 3) {
          throw new AppError('GOAL_LIMIT_REACHED', 'You can have up to 3 active goals.', 'business');
        }
      }

      const normalized = normalizeGoal(goal);
      const docRef = await addDoc(this.goalsCollection, {
        ...normalized,
        title: sanitizeText(normalized.title || '', 100),
        description: sanitizeText(normalized.description || '', 500),
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
          goalDescription: sanitizeText(normalized.description || '', 500),
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
      } catch (error: unknown) {
        logger.error('Error creating feed post for free goal:', error);
      }

      analyticsService.trackEvent('goal_creation_completed', 'conversion', { goalId: docRef.id, targetCount: normalized.targetCount, sessionsPerWeek: normalized.sessionsPerWeek, isFreeGoal: true, ...(normalized.pledgedExperience?.experienceId ? { pledgedExperienceId: normalized.pledgedExperience.experienceId } : {}) });
      return { ...normalized, id: docRef.id };
    } catch (error: unknown) {
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
    const giftRef = doc(db, 'experienceGifts', experienceGiftId);

    // Use transaction to prevent race conditions (two givers attaching simultaneously)
    await runTransaction(db, async (transaction) => {
      const goalSnap = await transaction.get(goalRef);
      const giftSnap = await transaction.get(giftRef);

      if (!goalSnap.exists()) throw new AppError('GOAL_NOT_FOUND', 'Goal not found', 'not_found');
      const goalData = goalSnap.data();

      if (!goalData.isFreeGoal) throw new AppError('INVALID_OPERATION', 'Can only attach gifts to free goals', 'business');

      // Prevent double-attachment
      if (goalData.experienceGiftId) throw new AppError('DUPLICATE_GIFT', 'Goal already has a gift attached', 'business');

      // Check 30-day deadline for completed goals
      if (goalData.isCompleted && goalData.giftAttachDeadline) {
        const deadline = toJSDate(goalData.giftAttachDeadline);
        if (deadline && new Date() > deadline) {
          throw new AppError('GIFT_EXPIRED', 'Gift attachment window has expired (30 days post-completion)', 'business');
        }
      }

      // Validate gift exists and hasn't been used
      if (!giftSnap.exists()) throw new AppError('GIFT_NOT_FOUND', 'Experience gift not found', 'not_found');
      const giftData = giftSnap.data();
      if (giftData.isRedeemed) throw new AppError('GIFT_REDEEMED', 'Gift has already been redeemed', 'business');

      const updateFields: Record<string, unknown> = {
        experienceGiftId,
        giftAttachedAt: serverTimestamp(),
        empoweredBy: giverId,
        empowerPending: false,
        updatedAt: serverTimestamp(),
      };

      if (isMystery) {
        updateFields.isMystery = true;
      }

      transaction.update(goalRef, updateFields);
      transaction.update(giftRef, {
        isRedeemed: true,
        redeemedAt: serverTimestamp(),
        redeemedGoalId: goalId,
        updatedAt: serverTimestamp(),
      });
    });

    analyticsService.trackEvent('gift_attached_to_goal', 'conversion', { goalId, experienceGiftId, giverId, isMystery });
    logger.log(`✅ Gift attached to free goal: ${goalId}${isMystery ? ' (mystery)' : ''}`);
  }

  /** Mark a goal as having a pending empower gift (prevents duplicate gifting) */
  async markEmpowerPending(goalId: string): Promise<void> {
    const goalRef = doc(db, 'goals', goalId);
    await updateDoc(goalRef, { empowerPending: true, updatedAt: serverTimestamp() });
  }




  /** Real-time listener */
  listenToUserGoals(userId: string, cb: (goals: Goal[]) => void): () => void {
    const qy = query(this.goalsCollection, where('userId', '==', userId));
    const unsub = onSnapshot(qy, async (snap) => {
      try {
        const goals = await Promise.all(
          snap.docs.map(async (d) => {
            const data = normalizeGoal({ id: d.id, ...d.data() });
            try {
              return await this.applyExpiredWeeksSweep(data);
            } catch (sweepError: unknown) {
              logger.error(`Error in applyExpiredWeeksSweep for goal ${data.id}:`, sweepError);
              return data; // Return un-swept goal rather than crashing
            }
          })
        );
        cb(goals);
      } catch (error: unknown) {
        logger.error('Error processing goals in listenToUserGoals:', error);
        // Still try to return basic normalized goals
        const fallbackGoals = snap.docs.map((d) => normalizeGoal({ id: d.id, ...d.data() }));
        cb(fallbackGoals);
      }
    }, (error) => {
      logger.error('listenToUserGoals snapshot error:', error.message);
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

  async appendHint(goalId: string, hintObj: AppendHintInput): Promise<void> {
    // SECURITY: Validate hint structure
    if (!hintObj.id || !hintObj.session || typeof hintObj.session !== 'number') {
      throw new AppError('INVALID_HINT', 'Hint must have id and session number', 'validation');
    }

    // SECURITY: Validate and sanitize text content
    const sanitizedText = hintObj.text ? sanitizeText(hintObj.text, 100) : undefined;

    // SECURITY: Validate URLs if present
    if (hintObj.audioUrl && !this.isValidUrl(hintObj.audioUrl)) {
      throw new AppError('INVALID_URL', 'Invalid audio URL', 'validation');
    }
    if (hintObj.imageUrl && !this.isValidUrl(hintObj.imageUrl)) {
      throw new AppError('INVALID_URL', 'Invalid image URL', 'validation');
    }

    // SECURITY: Check array size limit before adding
    const currentGoal = await this.getGoalById(goalId);
    if (!currentGoal) {
      throw new AppError('GOAL_NOT_FOUND', 'Goal not found', 'not_found');
    }
    const MAX_HINTS = 1000; // Reasonable limit for a goal
    if ((currentGoal.hints?.length || 0) >= MAX_HINTS) {
      throw new AppError('HINTS_LIMIT', 'Maximum hints limit reached for this goal', 'business');
    }

    // Create clean hint object with only allowed fields
    const cleanHint: Record<string, unknown> = {
      id: hintObj.id,
      session: hintObj.session,
      giverName: hintObj.giverName || 'Anonymous',
      date: hintObj.date || Date.now(),
      createdAt: hintObj.createdAt || DateHelper.now(),
    };

    // Add optional fields if present
    if (sanitizedText) cleanHint.text = sanitizedText;
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
    const sanitizedHintData = {
      ...hintData,
      ...(hintData.text ? { text: sanitizeText(hintData.text, 100) } : {}),
    };
    const goalRef = doc(db, 'goals', goalId);
    await updateDoc(goalRef, {
      personalizedNextHint: {
        ...sanitizedHintData,
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

  async updateGoal(goalId: string, updates: Partial<Goal>): Promise<void> {
    const goalDoc = await getDoc(doc(db, 'goals', goalId));
    if (!goalDoc.exists() || goalDoc.data()?.userId !== auth.currentUser?.uid) {
      throw new AppError('UNAUTHORIZED', 'Not authorized to update this goal', 'auth');
    }

    const ref = doc(db, 'goals', goalId);

    // SECURITY: Whitelist allowed fields to prevent unintended writes
    const allowedFields = [
      'weeklyCount', 'weeklyLogDates', 'isWeekCompleted', 'isCompleted',
      'currentCount', 'weekStartAt', 'hints', 'personalizedNextHint',
      'receiverMessage', 'suggestedTargetCount', 'suggestedSessionsPerWeek',
      'approvalStatus', 'giverMessage', 'giverActionTaken', 'description',
      'targetCount', 'sessionsPerWeek', 'duration', 'endDate',
      // Discovery engine fields
      'discoveredExperience', 'discoveryPreferences', 'discoveryQuestionsCompleted',
      'experienceRevealed', 'experienceRevealedAt',
      // Fitness-first fields
      'goalType', 'paymentCommitment', 'preferredRewardCategory',
      // Venue fields
      'venueId', 'venueName', 'venueLocation',
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      logger.error('Error saving goal coupon:', error);
      throw error; // Don't swallow — caller needs to know
    }
  }

  /** Handle expired or completed weeks - delegated to GoalSessionService */
  async applyExpiredWeeksSweep(goal: Goal): Promise<Goal> {
    // Import dynamically to avoid circular dependency at module load time
    const { goalSessionService } = await import('./GoalSessionService');
    return goalSessionService.sweepExpiredWeeks(goal);
  }


  /** Increment a session for the current anchored week - delegated to GoalSessionService */
  async tickWeeklySession(goalId: string, sessionStartedAt?: Date): Promise<Goal> {
    // Import dynamically to avoid circular dependency at module load time
    const { goalSessionService } = await import('./GoalSessionService');
    return goalSessionService.tickWeeklySession(goalId, sessionStartedAt);
  }

  /** Approve a goal */
  async approveGoal(goalId: string, message?: string): Promise<Goal> {
    const ref = doc(db, 'goals', goalId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AppError('GOAL_NOT_FOUND', 'Goal not found', 'not_found');
    const goalData = snap.data();
    if (goalData?.empoweredBy !== auth.currentUser?.uid) {
      throw new AppError('UNAUTHORIZED', 'Only the goal supporter can approve', 'auth');
    }
    const currentGoal = normalizeGoal({ id: snap.id, ...snap.data() });

    // Extract category from title or description
    const titleMatch = currentGoal.title?.match(/Attend (.+) Sessions/);
    const category = titleMatch ? titleMatch[1] : 'this goal';

    // Check if there are suggested changes and apply them
    const finalTargetCount = currentGoal.suggestedTargetCount || currentGoal.targetCount;
    const finalSessionsPerWeek = currentGoal.suggestedSessionsPerWeek || currentGoal.sessionsPerWeek;

    // If suggestions exist, recalculate duration and endDate
    let updates: Record<string, unknown> = {
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

      // Validate date range
      if (endDate <= startDate) {
        throw new AppError('INVALID_DATE_RANGE', 'Calculated endDate must be after startDate', 'validation');
      }

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
    } catch (error: unknown) {
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
    const goalDoc = await getDoc(doc(db, 'goals', goalId));
    if (!goalDoc.exists()) throw new AppError('GOAL_NOT_FOUND', 'Goal not found', 'not_found');
    if (goalDoc.data()?.empoweredBy !== auth.currentUser?.uid) {
      throw new AppError('UNAUTHORIZED', 'Only the goal supporter can suggest changes', 'auth');
    }

    // Validate maximum limits: 5 weeks and 7 sessions per week
    if (suggestedTargetCount > 5) {
      throw new AppError('VALIDATION_ERROR', 'The maximum duration is 5 weeks.', 'validation');
    }
    if (suggestedSessionsPerWeek > 7) {
      throw new AppError('VALIDATION_ERROR', 'The maximum is 7 sessions per week.', 'validation');
    }

    const ref = doc(db, 'goals', goalId);
    const updates: Record<string, unknown> = {
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
    if (!goalSnap.exists()) throw new AppError('GOAL_NOT_FOUND', 'Goal not found', 'not_found');
    if (goalSnap.data()?.userId !== auth.currentUser?.uid) {
      throw new AppError('UNAUTHORIZED', 'Only the goal owner can respond to suggestions', 'auth');
    }
    const currentGoal = normalizeGoal({ id: goalSnap.id, ...goalSnap.data() });

    // Ensure new goal is not less than initial
    const minTargetCount = currentGoal.initialTargetCount || currentGoal.targetCount;
    const minSessionsPerWeek = currentGoal.initialSessionsPerWeek || currentGoal.sessionsPerWeek;

    if (newTargetCount < minTargetCount || newSessionsPerWeek < minSessionsPerWeek) {
      throw new AppError('VALIDATION_ERROR', 'New goal cannot be less than the original goal', 'validation');
    }

    // Validate maximum limits: 5 weeks and 7 sessions per week
    if (newTargetCount > 5) {
      throw new AppError('VALIDATION_ERROR', 'The maximum duration is 5 weeks.', 'validation');
    }
    if (newSessionsPerWeek > 7) {
      throw new AppError('VALIDATION_ERROR', 'The maximum is 7 sessions per week.', 'validation');
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

    const updates: Record<string, unknown> = {
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
    } catch (error: unknown) {
      logger.error('Error creating goal approval feed post:', error);
    }

    return goal;
  }

  /** Auto-approve goal if deadline passed */
  async checkAndAutoApprove(goalId: string): Promise<Goal | null> {
    const ref = doc(db, 'goals', goalId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    // SECURITY: Only the goal owner may trigger auto-approve
    if (snap.data()?.userId !== auth.currentUser?.uid) return null;

    const goal = normalizeGoal({ id: snap.id, ...snap.data() });

    if (goal.approvalStatus === 'pending' && goal.approvalDeadline) {
      const now = DateHelper.now();
      if (now >= goal.approvalDeadline && !goal.giverActionTaken) {
        // Auto-approve
        await updateDoc(ref, {
          approvalStatus: 'approved' as const,
          giverActionTaken: true,
          updatedAt: serverTimestamp(),
        });
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
  /** Remove an active goal via Cloud Function (soft-delete + cascading cleanup) */
  async deleteGoal(goalId: string): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new AppError('AUTH', 'Not authenticated', 'auth');

    const idToken = await currentUser.getIdToken();
    const url = `${config.functionsUrl}/${config.goalFunctions.deleteGoal}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ goalId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new AppError('GOAL_DELETE', errorData.error || 'Failed to delete goal', 'business');
    }

    analyticsService.trackEvent('goal_deleted', 'engagement', { goalId });
  }

  /**
   * Self-edit a goal the user created themselves (no giver).
   * Constraints: can't reduce below completed weeks or current week's logged sessions.
   */
  async selfEditGoal(
    goalId: string,
    newTargetCount: number,
    newSessionsPerWeek: number
  ): Promise<Goal> {
    const ref = doc(db, 'goals', goalId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AppError('GOAL_NOT_FOUND', 'Goal not found', 'not_found');
    const goal = normalizeGoal({ id: snap.id, ...snap.data() });

    if (goal.userId !== auth.currentUser?.uid) {
      throw new AppError('UNAUTHORIZED', 'Only the goal owner can edit this goal', 'auth');
    }
    if (goal.empoweredBy) {
      throw new AppError('VALIDATION_ERROR', 'Use requestGoalEdit for gifted goals', 'validation');
    }
    if (newTargetCount < (goal.currentCount || 0)) {
      throw new AppError('VALIDATION_ERROR', `Can't reduce below already-completed weeks (${goal.currentCount})`, 'validation');
    }
    if (newSessionsPerWeek < (goal.weeklyCount || 0)) {
      throw new AppError('VALIDATION_ERROR', `Can't reduce sessions/week below already-logged this week (${goal.weeklyCount})`, 'validation');
    }
    if (newTargetCount < 1 || newTargetCount > 5) {
      throw new AppError('VALIDATION_ERROR', 'Weeks must be between 1 and 5', 'validation');
    }
    if (newSessionsPerWeek < 1 || newSessionsPerWeek > 7) {
      throw new AppError('VALIDATION_ERROR', 'Sessions per week must be between 1 and 7', 'validation');
    }

    const startDate = toJSDate(goal.startDate) || DateHelper.now();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + newTargetCount * 7);

    await updateDoc(ref, {
      targetCount: newTargetCount,
      sessionsPerWeek: newSessionsPerWeek,
      duration: newTargetCount * 7,
      endDate,
      totalSessions: newTargetCount * newSessionsPerWeek,
      updatedAt: serverTimestamp(),
    });

    analyticsService.trackEvent('goal_approved', 'conversion', { goalId, targetCount: newTargetCount, sessionsPerWeek: newSessionsPerWeek });

    const updated = await getDoc(ref);
    return normalizeGoal({ id: updated.id, ...updated.data() });
  }

  /**
   * Request an edit on a gifted goal — sends a notification to the giver.
   * Only one pending edit request allowed at a time.
   */
  async requestGoalEdit(
    goalId: string,
    requestedTargetCount: number,
    requestedSessionsPerWeek: number,
    message?: string
  ): Promise<void> {
    const ref = doc(db, 'goals', goalId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AppError('GOAL_NOT_FOUND', 'Goal not found', 'not_found');
    const goal = normalizeGoal({ id: snap.id, ...snap.data() });

    if (goal.userId !== auth.currentUser?.uid) {
      throw new AppError('UNAUTHORIZED', 'Only the goal owner can request edits', 'auth');
    }
    if (!goal.empoweredBy) {
      throw new AppError('VALIDATION_ERROR', 'Use selfEditGoal for self-created goals', 'validation');
    }
    if ((goal as unknown as Record<string, unknown>).pendingEditRequest) {
      throw new AppError('VALIDATION_ERROR', 'A pending edit request already exists for this goal', 'validation');
    }

    await updateDoc(ref, {
      pendingEditRequest: {
        requestedTargetCount,
        requestedSessionsPerWeek,
        message: sanitizeText(message || '', 500),
        requestedAt: new Date(),
        requestedBy: auth.currentUser!.uid,
      },
      updatedAt: serverTimestamp(),
    });

    // Notify the giver
    const requesterName = await userService.getUserName(goal.userId);
    await notificationService.createNotification(
      goal.empoweredBy,
      'goal_edit_request',
      `${requesterName} requested a goal edit`,
      `${requesterName} wants to change "${goal.title}" to ${requestedTargetCount} weeks, ${requestedSessionsPerWeek} sessions/week.${message ? ` Message: "${sanitizeText(message, 200)}"` : ''}`,
      { goalId, recipientId: goal.userId, requestedTargetCount, requestedSessionsPerWeek },
      false
    );
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
