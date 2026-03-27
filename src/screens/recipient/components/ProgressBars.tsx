import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createCardColors } from '../goalCardUtils';
import { Colors, useColors } from '../../../config';
import { BorderRadius } from '../../../config/borderRadius';
import { Typography } from '../../../config/typography';
import { Spacing } from '../../../config/spacing';

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
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        { flex: 1, height: 12, borderRadius: BorderRadius.pill, overflow: 'hidden' },
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
            borderRadius: BorderRadius.pill,
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
  const colors = useColors();
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
    <Animated.Text style={[Typography.smallBold, { color: colors.textPrimary }, { transform: [{ scale: scaleAnim }] }]}>
      {value}/{total}
    </Animated.Text>
  );
});

AnimatedCount.displayName = 'AnimatedCount';

// ─── ProgressBars ───────────────────────────────────────────────────

interface ProgressBarsProps {
  weeklyFilled: number;
  weeklyTotal: number;
  completedWeeks: number;
  overallTotal: number;
}

const ProgressBars: React.FC<ProgressBarsProps> = React.memo(({
  weeklyFilled,
  weeklyTotal,
  completedWeeks,
  overallTotal,
}) => {
  const colors = useColors();
  const cardColors = useMemo(() => createCardColors(colors), [colors]);
  const styles = useMemo(() => createStyles(colors, cardColors), [colors, cardColors]);

  return (
    <View
      accessibilityLabel={`Goal progress: ${completedWeeks} of ${overallTotal} weeks completed`}
      accessibilityRole="summary"
    >
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
              fillColor={colors.info}
              emptyColor={cardColors.grayLight}
            />
          ))}
        </View>
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
              fillColor={colors.info}
              emptyColor={cardColors.grayLight}
            />
          ))}
        </View>
      </View>
    </View>
  );
});

ProgressBars.displayName = 'ProgressBars';

// ─── Styles ─────────────────────────────────────────────────────────

const createStyles = (colors: typeof Colors, cardColors: ReturnType<typeof createCardColors>) => StyleSheet.create({
  progressBlock: { marginBottom: Spacing.xxl },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  progressLabel: { color: colors.gray600 },
  progressText: { color: colors.textPrimary, fontWeight: '600' },
  capsuleRow: { flexDirection: 'row', gap: Spacing.xxs },
  capsule: {
    flex: 1,
    height: 12,
    borderRadius: BorderRadius.pill,
    backgroundColor: cardColors.grayLight,
    overflow: 'hidden',
  },
});

export default ProgressBars;
