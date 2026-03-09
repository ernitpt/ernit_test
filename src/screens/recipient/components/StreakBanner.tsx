import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { MotiView } from 'moti';
import { Flame } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

// ─── Tier Config ─────────────────────────────────────────────────────

interface TierConfig {
  flameColor: string;
  flameSize: number;
  maxScale: number;
  pulseDuration: number;
  maxShadowOpacity: number;
  sparkCount: number;
}

const getTierConfig = (streak: number): TierConfig => {
  if (streak >= 14) {
    return {
      flameColor: '#DC2626',
      flameSize: 44,
      maxScale: 1.18,
      pulseDuration: 850,
      maxShadowOpacity: 0.45,
      sparkCount: 5,
    };
  }
  if (streak >= 7) {
    return {
      flameColor: '#EA580C',
      flameSize: 40,
      maxScale: 1.12,
      pulseDuration: 1100,
      maxShadowOpacity: 0.35,
      sparkCount: 3,
    };
  }
  return {
    flameColor: '#F97316',
    flameSize: 36,
    maxScale: 1.08,
    pulseDuration: 1400,
    maxShadowOpacity: 0.25,
    sparkCount: 0,
  };
};

// ─── Spark Particle ──────────────────────────────────────────────────

const SPARK_POSITIONS = [
  { left: 12, top: 8 },
  { left: 38, top: 18 },
  { left: 24, top: 4 },
  { left: 48, top: 12 },
  { left: 6, top: 20 },
];

const SparkParticle: React.FC<{
  anim: Animated.Value;
  position: { left: number; top: number };
}> = ({ anim, position }) => {
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -50],
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
          opacity,
          transform: [{ translateY }],
        },
      ]}
    />
  );
};

// ─── StreakBanner ─────────────────────────────────────────────────────

interface StreakBannerProps {
  streak: number;
}

const StreakBanner: React.FC<StreakBannerProps> = ({ streak }) => {
  const config = useMemo(() => getTierConfig(streak), [streak]);

  // Separate animated values: pulseAnim (native) for scale, glowAnim (non-native) for shadow
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const numberScale = useRef(new Animated.Value(0)).current;
  const sparkAnims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    // Haptic on mount
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

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

    // Spark loops (tier 2+)
    const sparkLoops: Animated.CompositeAnimation[] = [];
    if (config.sparkCount > 0) {
      sparkAnims.slice(0, config.sparkCount).forEach((anim, i) => {
        const loop = Animated.loop(
          Animated.timing(anim, {
            toValue: 1,
            duration: 2200 + i * 400,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        );
        loop.start();
        sparkLoops.push(loop);
      });
    }

    return () => {
      pulse.stop();
      glow.stop();
      sparkLoops.forEach((l) => l.stop());
    };
  }, [streak, config, pulseAnim, glowAnim, numberScale, sparkAnims]);

  return (
    <MotiView
      from={{ opacity: 0, translateY: -20 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 500 }}
    >
      <View style={styles.banner}>
        <View style={styles.bannerContent}>
          {/* Floating sparks */}
          {config.sparkCount > 0 &&
            sparkAnims.slice(0, config.sparkCount).map((anim, i) => (
              <SparkParticle
                key={i}
                anim={anim}
                position={SPARK_POSITIONS[i]}
              />
            ))}

          {/* Animated flame */}
          <Animated.View
            style={[
              styles.flameContainer,
              {
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
                  { transform: [{ scale: numberScale }] },
                ]}
              >
                {streak}
              </Animated.Text>
              <Text style={styles.titleText}>Session Streak!</Text>
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

// ─── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  banner: {
    marginBottom: 12,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  flameContainer: {
    backgroundColor: 'rgba(251, 146, 60, 0.12)',
    borderRadius: 28,
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
    gap: 6,
    marginBottom: 2,
  },
  streakNumber: {
    fontSize: 26,
    fontWeight: '800',
    color: '#EA580C',
  },
  titleText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#EA580C',
  },
  subtitle: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  spark: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FDBA74',
  },
});

export default StreakBanner;
