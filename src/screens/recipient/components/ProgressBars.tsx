import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform, Pressable, Modal } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CARD_COLORS } from '../goalCardUtils';

// ─── Capsule ────────────────────────────────────────────────────────

const Capsule: React.FC<{
  isFilled: boolean;
  fillColor: string;
  emptyColor: string;
}> = React.memo(({ isFilled, fillColor, emptyColor }) => {
  const widthAnim = useRef(new Animated.Value(isFilled ? 1 : 0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const didAnimateIn = useRef(isFilled);

  useEffect(() => {
    if (isFilled && !didAnimateIn.current) {
      didAnimateIn.current = true;
      Animated.sequence([
        Animated.timing(widthAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.parallel([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: 1.06,
              duration: 160,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 220,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
        ]),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start(() => {
        // Haptic feedback on capsule fill completion
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      });
    } else {
      Animated.timing(widthAnim, {
        toValue: isFilled ? 1 : 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [isFilled, widthAnim, glowAnim, scaleAnim]);

  const shadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.45],
  });

  return (
    <Animated.View
      style={[
        styles.capsule,
        { backgroundColor: emptyColor, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            width: widthAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
            backgroundColor: fillColor,
            borderRadius: 50,
            shadowColor: fillColor,
            shadowOpacity,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 0 },
            elevation: shadowOpacity as unknown as number,
          },
        ]}
      />
    </Animated.View>
  );
});

Capsule.displayName = 'Capsule';

// ─── AnimatedCount ──────────────────────────────────────────────────

const AnimatedCount: React.FC<{ value: number; total: number }> = React.memo(({ value, total }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current && value > prevValue.current) {
      prevValue.current = value;
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.25,
          duration: 150,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      prevValue.current = value;
    }
  }, [value, scaleAnim]);

  return (
    <Animated.Text style={[styles.progressText, { transform: [{ scale: scaleAnim }] }]}>
      {value}/{total}
    </Animated.Text>
  );
});

AnimatedCount.displayName = 'AnimatedCount';

// ─── StreakBadge (flame counter — sessions without skipping a week) ──

const StreakBadge: React.FC<{ streak: number }> = React.memo(({ streak }) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const flameAnim = useRef(new Animated.Value(1)).current;
  const tooltipAnim = useRef(new Animated.Value(0)).current;
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (streak > 0) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }).start();

      // Subtle breathing on the flame
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(flameAnim, {
            toValue: 1.15,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(flameAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [streak, scaleAnim, flameAnim]);

  const showTooltip = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);

    if (tooltipVisible) {
      // Tap again to dismiss immediately
      Animated.timing(tooltipAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setTooltipVisible(false));
      return;
    }

    setTooltipVisible(true);
    tooltipAnim.setValue(0);
    Animated.spring(tooltipAnim, {
      toValue: 1,
      tension: 70,
      friction: 8,
      useNativeDriver: true,
    }).start();

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    dismissTimer.current = setTimeout(() => {
      Animated.timing(tooltipAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setTooltipVisible(false));
    }, 3000);
  }, [tooltipVisible, tooltipAnim]);

  const dismissTooltip = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    Animated.timing(tooltipAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setTooltipVisible(false));
  }, [tooltipAnim]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  if (streak <= 0) return null;

  const tooltipOpacity = tooltipAnim;
  const tooltipScale = tooltipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });
  const tooltipTranslateY = tooltipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
  });

  const sessionWord = streak === 1 ? 'session' : 'sessions';

  return (
    <Animated.View style={[styles.streakBadge, { transform: [{ scale: scaleAnim }] }]}>
      {/* Transparent backdrop — tapping outside closes the tooltip */}
      <Modal
        visible={tooltipVisible}
        transparent
        animationType="none"
        onRequestClose={dismissTooltip}
        statusBarTranslucent
      >
        <Pressable style={styles.tooltipBackdrop} onPress={dismissTooltip} />
      </Modal>

      {/* Tooltip */}
      {tooltipVisible && (
        <Animated.View
          style={[
            styles.tooltip,
            {
              opacity: tooltipOpacity,
              transform: [{ scale: tooltipScale }, { translateY: tooltipTranslateY }],
            },
          ]}
        >
          <Text style={styles.tooltipText}>
            🔥 {streak} {sessionWord} done without skipping a week!
          </Text>
          {/* Caret */}
          <View style={styles.tooltipCaret} />
        </Animated.View>
      )}

      {/* Pill button */}
      <Pressable
        onPress={showTooltip}
        hitSlop={8}
        style={({ pressed }) => [styles.streakPill, pressed && styles.streakPillPressed]}
      >
        <Animated.Text style={[styles.streakFlame, { transform: [{ scale: flameAnim }] }]}>
          🔥
        </Animated.Text>
        <Text style={styles.streakCount}>{streak}</Text>
      </Pressable>
    </Animated.View>
  );
});

StreakBadge.displayName = 'StreakBadge';


// ─── ProgressBars ───────────────────────────────────────────────────

interface ProgressBarsProps {
  weeklyFilled: number;
  weeklyTotal: number;
  completedWeeks: number;
  overallTotal: number;
  totalSessionsDone: number;
}

const ProgressBars: React.FC<ProgressBarsProps> = React.memo(({
  weeklyFilled,
  weeklyTotal,
  completedWeeks,
  overallTotal,
  totalSessionsDone,
}) => {
  return (
    <View>
      {/* Sessions this week */}
      <View style={styles.progressBlock}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Sessions this week</Text>
          <AnimatedCount value={weeklyFilled} total={weeklyTotal} />
        </View>
        <View style={styles.capsuleRow}>
          {Array.from({ length: weeklyTotal }, (_, i) => (
            <Capsule
              key={i}
              isFilled={i < weeklyFilled}
              fillColor="#84b3e9ff"
              emptyColor={CARD_COLORS.grayLight}
            />
          ))}
        </View>
        <StreakBadge streak={totalSessionsDone} />
      </View>

      {/* Weeks completed */}
      <View style={styles.progressBlock}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Weeks completed</Text>
          <AnimatedCount value={completedWeeks} total={overallTotal} />
        </View>
        <View style={styles.capsuleRow}>
          {Array.from({ length: overallTotal }, (_, i) => (
            <Capsule
              key={i}
              isFilled={i < completedWeeks}
              fillColor="#84b3e9ff"
              emptyColor={CARD_COLORS.grayLight}
            />
          ))}
        </View>
      </View>
    </View>
  );
});

ProgressBars.displayName = 'ProgressBars';

// ─── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  progressBlock: { marginBottom: 24 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressLabel: { color: '#4b5563' },
  progressText: { color: '#111827', fontWeight: '600' },
  capsuleRow: { flexDirection: 'row', gap: 3 },
  capsule: {
    flex: 1,
    height: 12,
    borderRadius: 50,
    backgroundColor: CARD_COLORS.grayLight,
    overflow: 'hidden',
  },
  streakBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    position: 'relative',
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  streakFlame: {
    fontSize: 14,
  },
  streakCount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#EA580C',
  },
  streakPillPressed: {
    opacity: 0.75,
  },
  tooltipBackdrop: {
    flex: 1,
  },
  tooltip: {
    position: 'absolute',
    bottom: 34,
    left: 0,
    backgroundColor: '#1F2937',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 220,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
    zIndex: 999,
  },
  tooltipText: {
    color: '#F9FAFB',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  tooltipCaret: {
    position: 'absolute',
    top: '100%',
    left: 14,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#1F2937',
  },
});

export default ProgressBars;
