import React, { useEffect, useRef, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Platform, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Colors, useColors } from '../../../config';
import { BorderRadius } from '../../../config/borderRadius';
import { Typography } from '../../../config/typography';
import { Spacing } from '../../../config/spacing';
import { formatDurationDisplay } from '../goalCardUtils';
import { pushNotificationService } from '../../../services/PushNotificationService';

// ─── Timer Ring ─────────────────────────────────────────────────────

const RING_SIZE = 140;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface TimerRingProps {
  elapsed: number;
  total: number;
}

const TimerRing: React.FC<TimerRingProps> = React.memo(({ elapsed, total }) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const progress = total > 0 ? Math.min(elapsed / total, 1) : 0;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ring}>
      {/* Background track */}
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke={colors.border}
        strokeWidth={RING_STROKE}
        fill="transparent"
      />
      {/* Progress arc */}
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke={progress >= 0.9 ? colors.primary : colors.accent}
        strokeWidth={RING_STROKE}
        fill="transparent"
        strokeDasharray={`${RING_CIRCUMFERENCE}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
      />
    </Svg>
  );
});

TimerRing.displayName = 'TimerRing';

// ─── Long Press Finish Button ───────────────────────────────────────

interface LongPressFinishButtonProps {
  canFinish: boolean;
  loading: boolean;
  onFinish: () => void;
}

const LongPressFinishButton: React.FC<LongPressFinishButtonProps> = React.memo(({
  canFinish,
  loading,
  onFinish,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fillAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const [pressing, setPressing] = useState(false);

  const handlePressIn = () => {
    if (!canFinish || loading) return;
    setPressing(true);
    fillAnim.setValue(0);
    animRef.current = Animated.timing(fillAnim, {
      toValue: 1,
      duration: 800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onFinish();
        setPressing(false);
      }
    });
  };

  const handlePressOut = () => {
    if (animRef.current) {
      animRef.current.stop();
    }
    fillAnim.setValue(0);
    setPressing(false);
  };

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  if (Platform.OS === 'web') {
    return (
      <View
        {...{
          onPointerDown: (e: { preventDefault: () => void }) => { e.preventDefault(); handlePressIn(); },
          onPointerUp: handlePressOut,
          onPointerLeave: handlePressOut,
          onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
        } as Record<string, unknown>}
        style={[
          styles.finishButton,
          canFinish ? styles.finishButtonActive : styles.finishButtonDisabled,
          { cursor: canFinish && !loading ? 'pointer' : 'default', userSelect: 'none' } as object,
        ]}
      >
        {/* Fill overlay */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              width: fillWidth,
              backgroundColor: colors.whiteAlpha25,
              borderRadius: BorderRadius.md,
            },
          ]}
        />
        <Text style={[styles.finishButtonText, { userSelect: 'none' } as object]}>
          {!canFinish ? 'Finish' : pressing ? 'Hold...' : 'Hold to Finish'}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      disabled={!canFinish || loading}
      style={[
        styles.finishButton,
        canFinish ? styles.finishButtonActive : styles.finishButtonDisabled,
      ]}
      accessibilityLabel="Hold to complete session"
      accessibilityRole="button"
      accessibilityHint="Press and hold to finish your session"
    >
      {/* Fill overlay */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            width: fillWidth,
            backgroundColor: colors.whiteAlpha25,
            borderRadius: BorderRadius.md,
          },
        ]}
      />
      <Text style={styles.finishButtonText}>
        {!canFinish ? 'Finish' : pressing ? 'Hold...' : 'Hold to Finish'}
      </Text>
    </Pressable>
  );
});

LongPressFinishButton.displayName = 'LongPressFinishButton';

// ─── TimerDisplay ───────────────────────────────────────────────────

interface TimerDisplayProps {
  timeElapsed: number;
  totalGoalSeconds: number;
  canFinish: boolean;
  loading: boolean;
  targetHours: number;
  targetMinutes: number;
  goalId?: string;
  goalTitle?: string;
  onFinish: () => void;
  onCancel: () => void;
}

const TimerDisplay: React.FC<TimerDisplayProps> = ({
  timeElapsed,
  totalGoalSeconds,
  canFinish,
  loading,
  targetHours,
  targetMinutes,
  goalId,
  goalTitle,
  onFinish,
  onCancel,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hasNotifiedTarget = useRef(false);
  const almostDone = totalGoalSeconds > 0 && timeElapsed >= totalGoalSeconds * 0.9;
  const isOvertime = totalGoalSeconds > 0 && timeElapsed >= totalGoalSeconds;

  // Haptic + visual feedback when target duration reached (fires once)
  useEffect(() => {
    if (isOvertime && !hasNotifiedTarget.current) {
      hasNotifiedTarget.current = true;
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [isOvertime]);

  // Reset notification flag when timer restarts
  useEffect(() => {
    if (timeElapsed === 0) {
      hasNotifiedTarget.current = false;
    }
  }, [timeElapsed]);

  // Update live timer notification every 60 seconds on native
  const lastNotifMinute = useRef(-1);
  useEffect(() => {
    if (Platform.OS === 'web' || !goalId) return;
    const currentMinute = Math.floor(timeElapsed / 60);
    if (currentMinute !== lastNotifMinute.current) {
      lastNotifMinute.current = currentMinute;
      pushNotificationService.showTimerProgressNotification(
        goalId,
        goalTitle || 'Session',
        timeElapsed,
        totalGoalSeconds
      );
    }
  }, [goalId, goalTitle, timeElapsed, totalGoalSeconds]);

  // Pulse animation when almost done
  useEffect(() => {
    if (almostDone && !isOvertime) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [almostDone, isOvertime, pulseAnim]);

  const formatTime = (s: number) => {
    if (s < 3600) {
      const minutes = Math.floor(s / 60);
      const seconds = s % 60;
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const timerColor = isOvertime
    ? colors.primary
    : almostDone
      ? colors.secondary
      : colors.textPrimary;

  return (
    <View style={styles.timerContainer}>
      {/* Timer Ring + Text */}
      {totalGoalSeconds > 0 ? (
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <View style={styles.ringContainer}>
            <TimerRing elapsed={timeElapsed} total={totalGoalSeconds} />
            <View style={styles.timerTextOverlay}>
              <Text style={[styles.timerText, { color: timerColor }]}>{formatTime(timeElapsed)}</Text>
              {almostDone && !isOvertime && (
                <Text style={styles.almostDoneText}>Almost there!</Text>
              )}
              {isOvertime && (
                <Text style={styles.overtimeText}>Time's up!</Text>
              )}
            </View>
          </View>
        </Animated.View>
      ) : (
        <Text style={styles.timerText}>{formatTime(timeElapsed)}</Text>
      )}

      {/* Buttons */}
      <View style={styles.buttonsContainer}>
        <LongPressFinishButton
          canFinish={canFinish}
          loading={loading}
          onFinish={onFinish}
        />
        <TouchableOpacity
          style={styles.cancelButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={onCancel}
          disabled={loading}
          activeOpacity={0.85}
          accessibilityLabel="Cancel session"
          accessibilityRole="button"
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sessionDurationText}>
        Session duration: {formatDurationDisplay(targetHours, targetMinutes)}
      </Text>
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  timerContainer: { alignItems: 'center' },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  ring: {
    position: 'absolute',
  },
  timerTextOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerText: { ...Typography.display, fontWeight: 'bold', color: colors.textPrimary },
  almostDoneText: {
    ...Typography.caption,
    fontWeight: '600',
    color: colors.secondary,
    marginTop: Spacing.xxs,
  },
  overtimeText: {
    ...Typography.caption,
    fontWeight: '700',
    color: colors.primary,
    marginTop: Spacing.xxs,
  },
  buttonsContainer: {
    width: '100%',
    alignItems: 'center',
  },
  finishButton: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    width: '100%',
    overflow: 'hidden',
  },
  finishButtonActive: { backgroundColor: colors.primary },
  finishButtonDisabled: { backgroundColor: colors.textMuted },
  finishButtonText: { ...Typography.subheading, color: colors.white, textAlign: 'center' },
  cancelButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.textMuted,
    width: '100%',
  },
  cancelButtonText: { ...Typography.subheading, color: colors.white, fontWeight: '400', textAlign: 'center' },
  sessionDurationText: {
    marginTop: Spacing.sm,
    color: colors.textSecondary,
    ...Typography.caption,
    textAlign: 'center',
  },
});

export default React.memo(TimerDisplay);
