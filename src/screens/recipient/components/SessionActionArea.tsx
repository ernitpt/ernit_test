import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, useColors } from '../../../config';
import { BorderRadius } from '../../../config/borderRadius';
import { Typography } from '../../../config/typography';
import { Spacing } from '../../../config/spacing';
import { Goal, isSelfGifted } from '../../../types';
import { isGoalLocked, formatDurationDisplay, formatNextWeekDay, getApprovalBlockMessage } from '../goalCardUtils';
import { config } from '../../../config/environment';

const DEBUG_ALLOW_MULTIPLE_PER_DAY = config.debugEnabled;

// ─── AlreadyLoggedTodayCard ─────────────────────────────────────────

const getMotivationalSubtitle = (goal: Goal, totalSessionsDone: number): string => {
  const remainingThisWeek = goal.sessionsPerWeek - goal.weeklyCount;
  const totalTarget = goal.targetCount * goal.sessionsPerWeek;
  const totalRemaining = totalTarget - totalSessionsDone;

  // Goal almost done — show excitement
  if (totalRemaining <= 3 && totalRemaining > 0) {
    return `Only ${totalRemaining} session${totalRemaining === 1 ? '' : 's'} to your reward! 🎯`;
  }
  // Week complete
  if (remainingThisWeek <= 0) {
    return 'Week complete! Enjoy the rest 🎉';
  }
  // Sessions remaining this week
  return `${remainingThisWeek} more session${remainingThisWeek === 1 ? '' : 's'} this week — see you tomorrow! 💪`;
};

interface AlreadyLoggedProps {
  goal: Goal;
  totalSessionsDone: number;
}

const AlreadyLoggedTodayCard: React.FC<AlreadyLoggedProps> = React.memo(({ goal, totalSessionsDone }) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const checkScale = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(checkScale, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [checkScale, fadeAnim]);

  const subtitle = getMotivationalSubtitle(goal, totalSessionsDone);

  return (
    <Animated.View style={[styles.loggedTodayContainer, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={[colors.primarySurface, colors.white]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.loggedTodayGradient}
      >
        <Animated.View style={[styles.loggedTodayCheck, { transform: [{ scale: checkScale }] }]}>
          <LinearGradient
            colors={colors.gradientPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.loggedTodayCheckCircle}
          >
            <Text style={styles.loggedTodayCheckText}>✓</Text>
          </LinearGradient>
        </Animated.View>
        <Text style={styles.loggedTodayTitle}>Great job today!</Text>
        <Text style={styles.loggedTodaySub}>{subtitle}</Text>
      </LinearGradient>
    </Animated.View>
  );
});

AlreadyLoggedTodayCard.displayName = 'AlreadyLoggedTodayCard';

// ─── SessionActionArea ──────────────────────────────────────────────

interface SessionActionAreaProps {
  goal: Goal;
  empoweredName: string | null;
  alreadyLoggedToday: boolean;
  totalSessionsDone: number;
  hasPersonalizedHintWaiting: boolean;
  loading: boolean;
  onStart: () => void;
}

const SessionActionArea: React.FC<SessionActionAreaProps> = ({
  goal,
  empoweredName,
  alreadyLoggedToday,
  totalSessionsDone,
  hasPersonalizedHintWaiting,
  loading,
  onStart,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isSelfGift = isSelfGifted(goal);
  const locked = isGoalLocked(goal);

  // Week completed state
  if (goal.isWeekCompleted && !goal.isCompleted) {
    return (
      <View style={styles.weekCompleteBox}>
        <Text style={styles.weekCompleteText}>You've completed this week!</Text>
        <Text style={styles.weekCompleteSub}>
          Next week starts on {formatNextWeekDay(goal.weekStartAt)}
        </Text>
      </View>
    );
  }

  // Approval status banners
  const bannerMessage = !isSelfGift ? getApprovalBlockMessage(goal, empoweredName, 'banner') : null;
  const showBanner0 = bannerMessage && locked && totalSessionsDone === 0;
  const showBanner1 = !isSelfGift && locked && totalSessionsDone === 1;
  const banner1Message = getApprovalBlockMessage(goal, empoweredName, 'banner');

  // Locked: 1-day/1-session OR has done 1 session already
  if ((locked && goal.targetCount === 1 && goal.sessionsPerWeek === 1)
    || (locked && goal.targetCount >= 1 && goal.weeklyCount >= 1)) {
    return (
      <>
        {showBanner0 && bannerMessage && (
          <View style={styles.approvalMessageBox}>
            <Text style={styles.approvalMessageText}>{bannerMessage.message}</Text>
          </View>
        )}
        <View style={styles.disabledStartContainer}>
          <Text style={styles.disabledStartText}>Waiting for approval</Text>
        </View>
      </>
    );
  }

  // Already logged today
  if (alreadyLoggedToday && !DEBUG_ALLOW_MULTIPLE_PER_DAY) {
    return <AlreadyLoggedTodayCard goal={goal} totalSessionsDone={totalSessionsDone} />;
  }

  // Normal start button
  return (
    <View>
      {/* Approval banners */}
      {showBanner0 && bannerMessage && (
        <View style={styles.approvalMessageBox}>
          <Text style={styles.approvalMessageText}>{bannerMessage.message}</Text>
        </View>
      )}
      {showBanner1 && banner1Message && (
        <View style={[styles.approvalMessageBox, { backgroundColor: colors.successLighter, borderLeftColor: colors.successMedium }]}>
          <Text style={[styles.approvalMessageText, { color: colors.primaryDeep }]}>
            {banner1Message.message}
          </Text>
        </View>
      )}

      {/* Personalized hint indicator */}
      {hasPersonalizedHintWaiting && goal.personalizedNextHint && (
        <Text style={styles.hintIndicator}>
          {goal.personalizedNextHint.giverName} left you a hint for next session. Complete session now to view it!
        </Text>
      )}

      <TouchableOpacity
        style={styles.startButton}
        onPress={onStart}
        disabled={loading}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Start session"
      >
        <Text style={styles.startButtonText}>{loading ? 'Loading...' : 'Start Session'}</Text>
      </TouchableOpacity>

      <Text style={styles.sessionDurationText}>
        Session duration: {formatDurationDisplay(goal.targetHours, goal.targetMinutes)}
      </Text>
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  weekCompleteBox: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: colors.successLighter,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: colors.successBorder,
    alignItems: 'center',
  },
  weekCompleteText: {
    ...Typography.bodyBold,
    color: colors.primaryDeep,
    marginBottom: Spacing.xs,
  },
  weekCompleteSub: {
    ...Typography.caption,
    color: colors.primaryDark,
  },
  approvalMessageBox: {
    padding: Spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  approvalMessageText: {
    ...Typography.caption,
    color: colors.warningDeep,
    lineHeight: 18,
  },
  disabledStartContainer: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: colors.border,
    alignItems: 'center',
  },
  disabledStartText: {
    ...Typography.smallBold,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  startButton: { backgroundColor: colors.primary, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },
  startButtonText: { ...Typography.subheading, color: colors.white, textAlign: 'center' },
  sessionDurationText: {
    marginTop: Spacing.sm,
    color: colors.textSecondary,
    ...Typography.caption,
    textAlign: 'center',
  },
  hintIndicator: {
    ...Typography.caption,
    color: colors.secondary,
    textAlign: 'center',
    marginBottom: Spacing.md,
    opacity: 0.85,
  },
  // Already logged today (improved)
  loggedTodayContainer: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  loggedTodayGradient: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  loggedTodayCheck: {
    marginBottom: Spacing.sm,
  },
  loggedTodayCheckCircle: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loggedTodayCheckText: {
    ...Typography.large,
    color: colors.white,
  },
  loggedTodayTitle: {
    ...Typography.subheading,
    color: colors.primaryDark,
    marginBottom: Spacing.xs,
  },
  loggedTodaySub: {
    ...Typography.caption,
    color: colors.textSecondary,
  },
});

export default React.memo(SessionActionArea);
