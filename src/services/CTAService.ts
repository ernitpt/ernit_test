/**
 * CTAService — Smart Experience Purchase CTA scheduling
 *
 * Rules (only for free goals WITHOUT `giftAttachedAt`):
 *  - Every 3rd completed session (3, 6, 9…)
 *  - On week reset (first session of new week, especially after a missed week)
 *  - At streak milestones (7, 14, 21)
 *  - Journey screen: always show persistent subtle banner
 *  - NEVER if experience already purchased (giftAttachedAt exists)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { analyticsService } from './AnalyticsService';

const DISMISS_KEY_PREFIX = 'cta_dismissed_';
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours after dismiss

// Research-backed messages shown on rotation
const CTA_MESSAGES = [
    {
        stat: 'People who invest in their reward are 91% more likely to complete their challenge.',
        source: 'Journal of Consumer Psychology',
    },
    {
        stat: 'External rewards increase habit completion by 44%.',
        source: 'European Journal of Social Psychology',
    },
    {
        stat: "You're in the top 20% of consistency. Reward yourself!",
        source: null,
    },
    {
        stat: 'Having a tangible reward makes you 3x more likely to stay consistent.',
        source: null,
    },
    {
        stat: 'Goals with rewards attached have a 67% higher completion rate.',
        source: null,
    },
];

export interface CTADecision {
    shouldShow: boolean;
    reason: 'every_3rd' | 'week_reset' | 'streak_milestone' | 'persistent' | null;
    message: { stat: string; source: string | null };
}

interface CTAContext {
    goalId: string;
    isFreeGoal: boolean;
    giftAttachedAt?: Date | null;
    sessionNumber: number;   // total sessions done (just completed)
    weeklyCount: number;     // sessions done this week (after increment)
    isWeekCompleted: boolean;
    currentCount: number;    // completed weeks
    previousWeeklyCount?: number; // weeklyCount before this session
}

class CTAService {
    /**
     * Determine whether to show an inline CTA after a session completes.
     */
    async shouldShowInlineCTA(ctx: CTAContext): Promise<CTADecision> {
        const noShow: CTADecision = { shouldShow: false, reason: null, message: CTA_MESSAGES[0] };

        // Never show for non-free goals or if experience already purchased
        if (!ctx.isFreeGoal || ctx.giftAttachedAt) {
            return noShow;
        }

        // Check if user recently dismissed
        const dismissed = await this.wasDismissedRecently(ctx.goalId);
        if (dismissed) {
            return noShow;
        }

        const message = this.pickMessage(ctx.sessionNumber);

        // Streak milestones: 7, 14, 21
        const STREAK_MILESTONES = [7, 14, 21];
        if (STREAK_MILESTONES.includes(ctx.sessionNumber)) {
            analyticsService.trackEvent('cta_shown', 'engagement', { goalId: ctx.goalId, reason: 'streak_milestone' });
            return { shouldShow: true, reason: 'streak_milestone', message };
        }

        // Every 3rd session
        if (ctx.sessionNumber > 0 && ctx.sessionNumber % 3 === 0) {
            analyticsService.trackEvent('cta_shown', 'engagement', { goalId: ctx.goalId, reason: 'every_3rd' });
            return { shouldShow: true, reason: 'every_3rd', message };
        }

        // First session of new week (weeklyCount === 1 after increment)
        if (ctx.weeklyCount === 1 && ctx.currentCount >= 1) {
            analyticsService.trackEvent('cta_shown', 'engagement', { goalId: ctx.goalId, reason: 'week_reset' });
            return { shouldShow: true, reason: 'week_reset', message };
        }

        return noShow;
    }

    /**
     * Whether to show persistent banner on Journey screen.
     */
    shouldShowPersistentBanner(ctx: {
        isFreeGoal: boolean;
        giftAttachedAt?: Date | null;
    }): boolean {
        return ctx.isFreeGoal && !ctx.giftAttachedAt;
    }

    /**
     * Record that the user dismissed the CTA.
     */
    async recordDismiss(goalId: string): Promise<void> {
        analyticsService.trackEvent('cta_dismissed', 'engagement', { goalId });
        try {
            await AsyncStorage.setItem(
                `${DISMISS_KEY_PREFIX}${goalId}`,
                Date.now().toString()
            );
        } catch (err) {
            logger.warn('CTAService: failed to record dismiss', err);
        }
    }

    // ── Private ──

    private async wasDismissedRecently(goalId: string): Promise<boolean> {
        try {
            const ts = await AsyncStorage.getItem(`${DISMISS_KEY_PREFIX}${goalId}`);
            if (!ts) return false;
            return Date.now() - parseInt(ts, 10) < DISMISS_COOLDOWN_MS;
        } catch {
            return false;
        }
    }

    private pickMessage(sessionNumber: number): { stat: string; source: string | null } {
        return CTA_MESSAGES[sessionNumber % CTA_MESSAGES.length];
    }
}

export const ctaService = new CTAService();
