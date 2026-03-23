import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { MotiView } from 'moti';
import { Flame } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors, useColors } from '../../../config';
import { Typography } from '../../../config/typography';
import { BorderRadius } from '../../../config/borderRadius';
import { Spacing } from '../../../config/spacing';

// ─── Color Interpolation ────────────────────────────────────────────

type RGB = [number, number, number];

// Color changes every 15 sessions for noticeable progression
const COLOR_STOPS: { at: number; rgb: RGB }[] = [
  { at: 0,   rgb: [249, 115, 22] },   // #F97316 — warm orange (candle)
  { at: 15,  rgb: [245, 158, 11] },   // #F59E0B — amber (torch)
  { at: 30,  rgb: [234, 88, 12] },    // #EA580C — dark orange (campfire)
  { at: 45,  rgb: [220, 38, 38] },    // #DC2626 — red (hot coals)
  { at: 60,  rgb: [185, 28, 28] },    // #B91C1C — deep crimson (furnace)
  { at: 75,  rgb: [159, 18, 57] },    // #9F1239 — wine/berry (inferno)
  { at: 90,  rgb: [124, 58, 237] },   // #7C3AED — purple (plasma)
  { at: 105, rgb: [109, 40, 217] },   // #6D28D9 — violet (deep plasma)
  { at: 120, rgb: [67, 56, 202] },    // #4338CA — indigo (storm)
  { at: 135, rgb: [30, 27, 75] },     // #1E1B4B — dark indigo (void core)
  { at: 150, rgb: [202, 138, 4] },    // #CA8A04 — dark gold (legendary transition)
  { at: 165, rgb: [250, 204, 21] },   // #FACC15 — gold (legendary flame)
];

const lerpRGB = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const rgbToHex = ([r, g, b]: RGB): string =>
  `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

const getFlameRGB = (streak: number): RGB => {
  const s = Math.min(Math.max(streak, 0), 165);
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    if (s <= COLOR_STOPS[i + 1].at) {
      const t = (s - COLOR_STOPS[i].at) / (COLOR_STOPS[i + 1].at - COLOR_STOPS[i].at);
      return lerpRGB(COLOR_STOPS[i].rgb, COLOR_STOPS[i + 1].rgb, t);
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1].rgb;
};

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
        styles.spark,
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
}

const StreakBanner: React.FC<StreakBannerProps> = ({ streak }) => {
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

    // Glow loop (non-native driver — shadowOpacity)
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: config.maxShadowOpacity,
          duration: config.pulseDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.1,
          duration: config.pulseDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
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

          {/* Animated flame */}
          <Animated.View
            style={[
              styles.flameContainer,
              {
                backgroundColor: config.flameBg,
                transform: [{ scale: pulseAnim }],
                shadowColor: config.flameColor,
                shadowOpacity: glowAnim as unknown as number,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 0 },
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
                Session Streak!
              </Text>
            </View>
            <Text style={styles.subtitle}>
              Keep it up! Your streak resets after 7 days of inactivity
            </Text>
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
    ...Typography.heading1,
    fontWeight: '800',
  },
  titleText: {
    ...Typography.heading3,
    fontWeight: '700',
  },
  subtitle: {
    ...Typography.caption,
    color: colors.warningDark,
    lineHeight: 18,
  },
  spark: {
    position: 'absolute',
  },
});

export default StreakBanner;
