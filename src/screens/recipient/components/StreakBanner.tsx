import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { MotiView } from 'moti';
import { Flame } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Colors, useColors } from '../../../config';
import { Typography } from '../../../config/typography';
import { BorderRadius } from '../../../config/borderRadius';
import { Spacing } from '../../../config/spacing';

// ─── Color Interpolation (shared) ───────────────────────────────────
import { type RGB, getFlameRGB, rgbToHex } from '../../../utils/streakColor';

// ─── Streak Config (smooth progression 0→150) ──────────────────────

const getStreakConfig = (streak: number) => {
  const t = Math.min(streak, 165) / 165; // 0→1
  const rgb = getFlameRGB(streak);
  const hex = rgbToHex(rgb);

  // Lighter/brighter version for spark particles
  const sparkRGB: RGB = [
    Math.min(rgb[0] + 60, 255),
    Math.min(rgb[1] + 60, 255),
    Math.min(rgb[2] + 60, 255),
  ];

  return {
    flameColor: hex,
    sparkColor: rgbToHex(sparkRGB),
    flameBg: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.12)`,
    flameSize: Math.round(36 + t * 14),              // 36 → 50
    maxScale: 1.08 + t * 0.15,                        // 1.08 → 1.23
    pulseDuration: Math.round(1400 - t * 700),         // 1400ms → 700ms
    maxShadowOpacity: 0.25 + t * 0.35,                // 0.25 → 0.60
    // Particle system: +1 particle every 3 sessions, max 15
    sparkCount: streak === 0 ? 0 : Math.min(Math.ceil(streak / 3), MAX_SPARKS),
    // Particle lifecycle: how long each particle takes to rise & fade
    sparkCycleDuration: Math.round(2000 - t * 1200),  // 2000ms → 800ms
    // Gap between respawns (shorter = more frequent spawning)
    sparkGap: Math.round(800 - t * 600),               // 800ms → 200ms
    // How high particles float
    sparkHeight: Math.round(40 + t * 30),              // 40 → 70
  };
};

// ─── Spark Positions (15 pre-generated around the flame area) ───────

const SPARK_POSITIONS = [
  { left: 12, top: 8,  size: 5 },
  { left: 38, top: 18, size: 7 },
  { left: 24, top: 4,  size: 4 },
  { left: 48, top: 12, size: 8 },
  { left: 6,  top: 20, size: 6 },
  { left: 30, top: 2,  size: 3 },
  { left: 52, top: 8,  size: 7 },
  { left: 18, top: 22, size: 5 },
  { left: 42, top: 6,  size: 9 },
  { left: 2,  top: 14, size: 4 },
  { left: 34, top: 24, size: 6 },
  { left: 56, top: 16, size: 8 },
  { left: 10, top: 0,  size: 5 },
  { left: 46, top: 22, size: 3 },
  { left: 22, top: 16, size: 7 },
];

const MAX_SPARKS = 15;

// ─── Spark Particle ─────────────────────────────────────────────────

const SparkParticle: React.FC<{
  anim: Animated.Value;
  position: { left: number; top: number; size: number };
  height: number;
  color: string;
}> = ({ anim, position, height, color }) => {
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -height],
  });
  const opacity = anim.interpolate({
    inputRange: [0, 0.15, 0.7, 1],
    outputRange: [0, 0.8, 0.5, 0],
  });

  return (
    <Animated.View
      style={[
        { position: 'absolute' as const },
        {
          left: position.left,
          top: position.top,
          width: position.size,
          height: position.size,
          borderRadius: position.size / 2,
          backgroundColor: color,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    />
  );
};

// ─── StreakBanner ────────────────────────────────────────────────────

interface StreakBannerProps {
  streak: number;
  weeklyDone?: number;
  weeklyTarget?: number;
}

// ─── Zero Streak Banner (streak = 0) ────────────────────────────────
// Same layout as the full banner (streak 3+) but with a grey flame and no yellow card.

const ZeroStreakBanner: React.FC<{ weeklyDone?: number; weeklyTarget?: number }> = ({ weeklyDone, weeklyTarget }) => {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <MotiView
      from={{ opacity: 0, translateY: -20 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 500 }}
    >
      <View
        style={styles.banner}
        accessibilityLabel="Start your streak"
        accessibilityRole="text"
      >
        <View style={styles.bannerContent}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={[
                styles.flameContainer,
                { backgroundColor: colors.backgroundLight },
              ]}
            >
              <Flame color={colors.textMuted} size={36} fill={colors.textMuted} />
            </View>
          </View>
          <View style={styles.textContainer}>
            <Text style={[styles.titleText, { color: colors.textSecondary }]}>
              {t('recipient.streak.compact.zeroTitle')}
            </Text>
            <Text style={styles.subtitle}>
              {t('recipient.streak.compact.zeroSubtitle')}
            </Text>
            {weeklyTarget != null && weeklyTarget > 0 && (
              <Text style={styles.weeklyRow}>
                {t('recipient.streak.thisWeek', { done: weeklyDone ?? 0, target: weeklyTarget })}
              </Text>
            )}
          </View>
        </View>
      </View>
    </MotiView>
  );
};

// ─── Compact Streak Banner (streaks 1-2) ────────────────────────────

const CompactStreakBanner: React.FC<{ streak: number; weeklyDone?: number; weeklyTarget?: number }> = ({ streak, weeklyDone, weeklyTarget }) => {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const getMessage = () => {
    if (streak === 1) return { title: t('recipient.streak.compact.oneTitle'), emoji: '🔥', subtitle: t('recipient.streak.compact.oneSubtitle') };
    return { title: t('recipient.streak.compact.twoTitle'), emoji: '🔥🔥', subtitle: t('recipient.streak.compact.twoSubtitle') };
  };

  const { title, emoji, subtitle } = getMessage();

  return (
    <MotiView
      from={{ opacity: 0, translateY: -10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 400 }}
    >
      <View
        style={styles.compactBanner}
        accessibilityLabel={`${streak} day streak`}
        accessibilityRole="text"
      >
        <Text style={styles.compactEmoji}>{emoji}</Text>
        <View style={styles.compactTextContainer}>
          <Text style={[styles.compactTitle, { color: colors.warningMedium }]}>{title}</Text>
          <Text style={styles.compactSubtitle}>{subtitle}</Text>
          {weeklyTarget != null && weeklyTarget > 0 && (
            <Text style={styles.weeklyRow}>
              {t('recipient.streak.thisWeek', { done: weeklyDone ?? 0, target: weeklyTarget })}
            </Text>
          )}
        </View>
      </View>
    </MotiView>
  );
};

// ─── Full Streak Banner (streaks 3+) ────────────────────────────────

const StreakBanner: React.FC<StreakBannerProps> = ({ streak, weeklyDone, weeklyTarget }) => {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const config = useMemo(() => getStreakConfig(streak), [streak]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const numberScale = useRef(new Animated.Value(0)).current;
  const sparkAnims = useRef(
    Array.from({ length: MAX_SPARKS }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    // Skip animations for compact variant (streak < 3)
    if (streak < 3) return;

    // Stop any running animations and reset to initial values before starting new ones
    pulseAnim.stopAnimation();
    glowAnim.stopAnimation();
    numberScale.stopAnimation();
    pulseAnim.setValue(1);
    glowAnim.setValue(0);
    numberScale.setValue(0);
    sparkAnims.forEach(anim => anim.stopAnimation());
    sparkAnims.forEach(anim => anim.setValue(0));

    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Flame pulse loop (native driver — transforms only)
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: config.maxScale,
          duration: config.pulseDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: config.pulseDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    // Glow loop (overlay opacity — works cross-platform)
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: config.maxShadowOpacity,
          duration: config.pulseDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.1,
          duration: config.pulseDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    glow.start();

    // Number bounce on mount
    Animated.spring(numberScale, {
      toValue: 1,
      tension: 60,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // Particle system: each spark loops (rise→fade→gap→respawn),
    // staggered in time so they don't all fire at once
    const sparkLoops: Animated.CompositeAnimation[] = [];
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    if (config.sparkCount > 0) {
      const totalPeriod = config.sparkCycleDuration + config.sparkGap;
      const staggerMs = totalPeriod / config.sparkCount;

      sparkAnims.slice(0, config.sparkCount).forEach((anim, i) => {
        anim.setValue(0);
        const variation = (i % 4) * 60;

        const loop = Animated.loop(
          Animated.sequence([
            // Rise and fade
            Animated.timing(anim, {
              toValue: 1,
              duration: config.sparkCycleDuration + variation,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            // Wait before respawning (anim stays at 1 = opacity 0)
            Animated.delay(config.sparkGap + variation),
          ])
        );

        // Stagger each particle's start for particle-system spread
        const timeout = setTimeout(() => loop.start(), i * staggerMs);
        timeouts.push(timeout);
        sparkLoops.push(loop);
      });
    }

    return () => {
      pulse.stop();
      glow.stop();
      sparkLoops.forEach((l) => l.stop());
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, [streak, config, pulseAnim, glowAnim, numberScale, sparkAnims]);

  // Streak = 0: full banner layout with grey flame, no yellow card
  if (streak === 0) return <ZeroStreakBanner weeklyDone={weeklyDone} weeklyTarget={weeklyTarget} />;
  // Streaks 1-2: compact motivational variant
  if (streak < 3) return <CompactStreakBanner streak={streak} weeklyDone={weeklyDone} weeklyTarget={weeklyTarget} />;

  return (
    <MotiView
      from={{ opacity: 0, translateY: -20 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 500 }}
    >
      <View
        style={styles.banner}
        accessibilityLabel={`${streak} day streak`}
        accessibilityRole="text"
      >
        <View style={styles.bannerContent}>
          {/* Particle system */}
          {config.sparkCount > 0 &&
            sparkAnims.slice(0, config.sparkCount).map((anim, i) => (
              <SparkParticle
                key={i}
                anim={anim}
                position={SPARK_POSITIONS[i]}
                height={config.sparkHeight}
                color={config.sparkColor}
              />
            ))}

          {/* Animated flame with glow overlay */}
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            {/* Glow overlay behind flame — works on Android */}
            <Animated.View
              style={{
                position: 'absolute',
                width: 72,
                height: 72,
                borderRadius: BorderRadius.circle,
                backgroundColor: config.flameColor,
                opacity: glowAnim,
                transform: [{ scale: pulseAnim }],
              }}
              pointerEvents="none"
            />
            <Animated.View
              style={[
                styles.flameContainer,
                {
                  backgroundColor: config.flameBg,
                  transform: [{ scale: pulseAnim }],
                  elevation: 4,
                },
              ]}
            >
              <Flame
                color={config.flameColor}
                size={config.flameSize}
                fill={config.flameColor}
              />
            </Animated.View>
          </View>

          {/* Text content */}
          <View style={styles.textContainer}>
            <View style={styles.titleRow}>
              <Animated.Text
                style={[
                  styles.streakNumber,
                  {
                    color: config.flameColor,
                    transform: [{ scale: numberScale }],
                  },
                ]}
              >
                {streak}
              </Animated.Text>
              <Text style={[styles.titleText, { color: config.flameColor }]}>
                {t('recipient.streak.sessionStreak')}
              </Text>
            </View>
            <Text style={styles.subtitle}>
              {t('recipient.streak.resetWarning')}
            </Text>
            {weeklyTarget != null && weeklyTarget > 0 && (
              <Text style={styles.weeklyRow}>
                {t('recipient.streak.thisWeek', { done: weeklyDone ?? 0, target: weeklyTarget })}
              </Text>
            )}
          </View>
        </View>
      </View>
    </MotiView>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  banner: {
    marginBottom: Spacing.md,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  flameContainer: {
    borderRadius: BorderRadius.xl,
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
    marginBottom: Spacing.xxs,
  },
  streakNumber: {
    ...Typography.heading1Bold,
  },
  titleText: {
    ...Typography.heading3,
  },
  subtitle: {
    ...Typography.caption,
    color: colors.warningDark,
    lineHeight: 18,
  },
  spark: {
    position: 'absolute',
  },
  // ─── Compact variant (streaks 0-2) ──────────────────────────────
  compactBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: colors.warningLighter,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  compactEmoji: {
    ...Typography.heading2,
  },
  compactTextContainer: {
    flex: 1,
  },
  compactTitle: {
    ...Typography.bodyBold,
    marginBottom: Spacing.xxs,
  },
  compactSubtitle: {
    ...Typography.caption,
    color: colors.warningDark,
  },
  weeklyRow: {
    ...Typography.captionBold,
    color: colors.warningDark,
    marginTop: Spacing.xxs,
  },
});

export default React.memo(StreakBanner);
