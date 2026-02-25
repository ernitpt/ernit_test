import React, { useEffect, useRef, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Platform, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import Colors from '../../../config/colors';
import { formatDurationDisplay } from '../goalCardUtils';

// ─── Timer Ring ─────────────────────────────────────────────────────

const RING_SIZE = 180;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface TimerRingProps {
  elapsed: number;
  total: number;
}

const TimerRing: React.FC<TimerRingProps> = React.memo(({ elapsed, total }) => {
  const progress = total > 0 ? Math.min(elapsed / total, 1) : 0;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ring}>
      {/* Background track */}
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke="#E5E7EB"
        strokeWidth={RING_STROKE}
        fill="transparent"
      />
      {/* Progress arc */}
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke={progress >= 0.9 ? Colors.primary : Colors.accent}
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
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
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
    >
      {/* Fill overlay */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            width: fillWidth,
            backgroundColor: 'rgba(255,255,255,0.25)',
            borderRadius: 12,
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
  onFinish,
  onCancel,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const almostDone = totalGoalSeconds > 0 && timeElapsed >= totalGoalSeconds * 0.9;
  const isOvertime = totalGoalSeconds > 0 && timeElapsed >= totalGoalSeconds;

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
    ? Colors.primary
    : almostDone
    ? Colors.secondary
    : '#111827';

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

const styles = StyleSheet.create({
  timerContainer: { alignItems: 'center' },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  ring: {
    position: 'absolute',
  },
  timerTextOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerText: { fontSize: 36, fontWeight: 'bold', color: '#111827' },
  almostDoneText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.secondary,
    marginTop: 2,
  },
  overtimeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 2,
  },
  buttonsContainer: {
    width: '100%',
    alignItems: 'center',
  },
  finishButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    overflow: 'hidden',
  },
  finishButtonActive: { backgroundColor: Colors.primary },
  finishButtonDisabled: { backgroundColor: '#9ca3af' },
  finishButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#b3afafff',
    width: '100%',
  },
  cancelButtonText: { color: '#fff', fontSize: 16, fontWeight: '400', textAlign: 'center' },
  sessionDurationText: {
    marginTop: 8,
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
  },
});

export default TimerDisplay;
