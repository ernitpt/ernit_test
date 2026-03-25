import AsyncStorage from '@react-native-async-storage/async-storage';
import { DateHelper } from '../utils/DateHelper';
import { isoDateOnly, addDaysSafe, normalizeGoal } from '../utils/GoalHelpers';
import { db } from './firebase';
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import type { Goal } from '../types';
import { feedService } from './FeedService';
import { experienceGiftService } from './ExperienceGiftService';
import { experienceService } from './ExperienceService';
import { userService } from './userService';
import { notificationService } from './NotificationService';
import { friendService } from './FriendService';
import { logger } from '../utils/logger';
import { config } from '../config/environment';
import { analyticsService } from './AnalyticsService';
import { AppError } from '../utils/AppError';

const TIMER_STORAGE_KEY = 'global_timer_state';

/** Check if a goal has an active timer that started within the current week and < 24h ago */
async function hasActiveSessionInCurrentWeek(goalId: string, weekStartAt: Date): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(TIMER_STORAGE_KEY);
    if (!stored) return false;
    const timers = JSON.parse(stored);
    const timer = timers[goalId];
    if (!timer?.isRunning || !timer.startTime) return false;

    const sessionStart = new Date(timer.startTime);
    const hoursSinceStart = (Date.now() - timer.startTime) / (1000 * 60 * 60);
    const weekEnd = addDaysSafe(weekStartAt, 7);

    // Session started in current week AND less than 24h ago
    return hoursSinceStart <= 24 && sessionStart >= weekStartAt && sessionStart < weekEnd;
  } catch {
    return false; // If we can't read timer state, don't block sweep
  }
}

export class GoalSessionService {
  private goalsCollection = collection(db, 'goals');

  // ✅ SECURITY FIX: Only allow debug mode in development
  DEBUG_ALLOW_MULTIPLE_PER_DAY: boolean = config.debugEnabled;

  /** Handle expired or completed weeks */
  async sweepExpiredWeeks(goal: Goal): Promise<Goal> {
    let g = normalizeGoal(goal);
    if (!g.weekStartAt || !g.id) return g;

    // ✅ Skip completed goals - no need to sweep them
    if (g.isCompleted) return g;

    let anchor = new Date(g.weekStartAt);
    const now = DateHelper.now();

    // Defer sweep if there's an active session from the current week (≤24h grace)
    if (await hasActiveSessionInCurrentWeek(g.id, anchor)) {
      return g;
    }

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
          g.currentCount = g.targetCount; // Ensure stored count reflects completion
          if (g.challengeType === 'shared' && !g.partnerGoalId) {
            g.isReadyToComplete = true;
          } else {
            g.isCompleted = true;
            g.completedAt = DateHelper.now();
          }
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
      g.lastNudgeLevel = 0;
    }

    // Only write to Firestore if weeks were actually swept
    // This prevents infinite loops in real-time listeners (write → snapshot → sweep → write)
    if (didSweep) {
      // Normalize anchor to midnight so future sweeps align with calendar dates
      anchor.setHours(0, 0, 0, 0);
      g.weekStartAt = anchor;
      const ref = doc(db, 'goals', g.id);

      // Re-read to avoid concurrent sweep conflict (e.g. multiple tabs)
      const freshSnap = await getDoc(ref);
      if (freshSnap.exists()) {
        const freshData = freshSnap.data();
        const freshWeekStartAt = freshData.weekStartAt?.toDate?.() ?? (freshData.weekStartAt ? new Date(freshData.weekStartAt) : null);
        const originalWeekStartAt = goal.weekStartAt ? new Date(goal.weekStartAt) : null;
        if (freshWeekStartAt && originalWeekStartAt && freshWeekStartAt.getTime() !== originalWeekStartAt.getTime()) {
          // Another tab/instance already swept — use fresh data
          return normalizeGoal({ id: freshSnap.id, ...freshData });
        }
      }

      const sweepUpdate: Record<string, unknown> = {
        currentCount: g.currentCount,
        weekStartAt: anchor,
        weeklyCount: g.weeklyCount,
        weeklyLogDates: [],
        isWeekCompleted: false,
        isCompleted: !!g.isCompleted,
        isReadyToComplete: !!g.isReadyToComplete,
        lastNudgeLevel: 0,
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
  async tickWeeklySession(goalId: string, sessionStartedAt?: Date): Promise<Goal> {
    const ref = doc(db, 'goals', goalId);

    // ✅ SECURITY: Atomic read-modify-write via Firestore transaction
    // Prevents race condition when user taps "Log Session" rapidly
    const txResult = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new AppError('GOAL_NOT_FOUND', 'Goal not found', 'not_found');

      let g = normalizeGoal({ id: snap.id, ...snap.data() });

      // If it's the user's first session
      if (!g.weekStartAt) {
        g.weekStartAt = DateHelper.now();
        g.weeklyCount = 0;
        g.weeklyLogDates = [];
      }

      // Inline expired weeks sweep (pure computation inside transaction, no standalone writes)
      // Skip sweep if the session started within the current week (cross-midnight/cross-day protection)
      let hadIncompleteSweep = false;
      const shouldSkipSweep = sessionStartedAt && g.weekStartAt
        && sessionStartedAt >= new Date(g.weekStartAt)
        && sessionStartedAt < addDaysSafe(new Date(g.weekStartAt), 7);

      if (g.weekStartAt && g.id && !g.isCompleted && !shouldSkipSweep) {
        let anchor = new Date(g.weekStartAt);
        const now = DateHelper.now();
        while (now > addDaysSafe(anchor, 7)) {
          const weekWasCompleted = g.isWeekCompleted || g.weeklyCount >= g.sessionsPerWeek;
          if (weekWasCompleted) {
            g.currentCount += 1;
            // T1-1: Detect goal completion during inline sweep
            if (g.currentCount >= g.targetCount) {
              g.currentCount = g.targetCount; // Ensure stored count reflects completion
              // C2: Block giver completion until recipient redeems for shared challenges
              if (g.challengeType === 'shared' && !g.partnerGoalId) {
                g.isReadyToComplete = true;
              } else {
                g.isCompleted = true;
                g.completedAt = DateHelper.now();
              }
            }
          } else {
            hadIncompleteSweep = true;
          }
          anchor = addDaysSafe(anchor, 7);
          g.weeklyCount = 0;
          g.weeklyLogDates = [];
          g.isWeekCompleted = false;
        }
        anchor.setHours(0, 0, 0, 0);
        g.weekStartAt = anchor;
      }

      const todayIso = isoDateOnly(sessionStartedAt ?? DateHelper.now());

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
        throw new AppError('WEEK_COMPLETE', `All sessions done this week! Your next week starts on ${nextWeekStr}.`, 'business');
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
          g.currentCount = g.targetCount; // Ensure stored count reflects completion
          // C2: Block giver completion until recipient redeems for shared challenges
          if (g.challengeType === 'shared' && !g.partnerGoalId) {
            g.isReadyToComplete = true;
          } else {
            g.isCompleted = true;
            g.completedAt = DateHelper.now();
          }
        }
      }

      // Persist atomically via transaction
      const updateData: Record<string, unknown> = {
        weeklyCount: g.weeklyCount,
        weeklyLogDates: g.weeklyLogDates,
        isWeekCompleted: g.isWeekCompleted || false,
        isCompleted: !!g.isCompleted,
        // C2: persist waiting-for-partner flag for shared challenges without a linked partner goal
        isReadyToComplete: !!g.isReadyToComplete,
        weekStartAt: g.weekStartAt,
        currentCount: g.currentCount,
        updatedAt: serverTimestamp(),
      };
      if (g.isCompleted) {
        updateData.completedAt = serverTimestamp();
        // Set 30-day gift attach deadline for free goals without an attached gift
        if (g.isFreeGoal && !g.experienceGiftId && !g.pledgedExperience?.experienceId) {
          const deadline = new Date();
          deadline.setDate(deadline.getDate() + 30);
          updateData.giftAttachDeadline = deadline;
          g.giftAttachDeadline = deadline;
        }
      }
      transaction.update(ref, updateData);

      return { goal: g, didIncrement: true, hadIncompleteSweep, previousWeeklyCount, totalCompletedSessions, totalSessions, progressPercentage };
    });

    const { goal: g, didIncrement, hadIncompleteSweep, previousWeeklyCount, totalCompletedSessions, totalSessions, progressPercentage } = txResult;

    // If no increment happened (already logged today), return early
    if (!didIncrement) return { ...g };

    // === Streak tracking (user-level, atomic via its own transaction) ===
    try {
      // Pre-fetch started goals count (informational, ok outside transaction)
      const startedGoalsSnap = await getDocs(
        query(this.goalsCollection, where('userId', '==', g.userId), where('isCompleted', '==', false))
      );
      const startedGoalCount = startedGoalsSnap.docs.filter(d => d.data().weekStartAt != null).length;

      // Atomic read-modify-write on user doc to prevent concurrent streak corruption
      const userRef = doc(db, 'users', g.userId);
      await runTransaction(db, async (streakTx) => {
        const userSnap = await streakTx.get(userRef);
        if (!userSnap.exists()) return;

        const userData = userSnap.data();
        const todayIsoStreak = new Date().toISOString().split('T')[0];
        const currentStreak = userData.sessionStreak || 0;
        const longestStreak = userData.longestSessionStreak || 0;
        const lastSessionDate = userData.lastSessionDate;

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
        streakTx.update(userRef, {
          sessionStreak: newStreak,
          longestSessionStreak: newLongest,
          lastSessionDate: todayIsoStreak,
        });
        logger.log(`🔥 Streak updated for user ${g.userId}: ${newStreak} (longest: ${newLongest})`);
      });
    } catch (streakError) {
      logger.error('Error updating session streak:', streakError);
    }

    // Analytics (non-critical, outside transaction)
    analyticsService.trackEvent('session_logged', 'engagement', { goalId, weeklyCount: g.weeklyCount, sessionsPerWeek: g.sessionsPerWeek, currentCount: g.currentCount, targetCount: g.targetCount });
    if (g.isWeekCompleted) {
      analyticsService.trackEvent('weekly_goal_completed', 'engagement', { goalId, weekNumber: g.currentCount + 1 });
    }

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
          }

          if (!g.isFreeGoal && g.experienceGiftId) {
            // STANDARD GOAL: fetch from gift
            try {
              const experienceGift = await experienceGiftService.getExperienceGiftById(g.experienceGiftId);
              if (!experienceGift) {
                logger.warn(`Experience gift ${g.experienceGiftId} not found for goal ${g.id}`);
                return;
              }
              const experience = experienceGift.experienceId
                ? await experienceService.getExperienceById(experienceGift.experienceId)
                : null;

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

    return { ...g };
  }
}

export const goalSessionService = new GoalSessionService();
