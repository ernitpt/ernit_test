import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import StreakBanner from './recipient/components/StreakBanner';
import Colors from '../config/colors';
import { Typography } from '../config/typography';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { ErrorBoundary } from '../components/ErrorBoundary';

const AnimationPreviewScreen = () => {
  const [sessions, setSessions] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [speed, setSpeed] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-play
  useEffect(() => {
    if (autoPlay) {
      intervalRef.current = setInterval(() => {
        setSessions((prev) => prev + 1);
      }, 500 / speed);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoPlay, speed]);

  const reset = useCallback(() => {
    setAutoPlay(false);
    setSessions(0);
  }, []);

  const adjust = (delta: number) => setSessions((prev) => Math.max(0, prev + delta));

  return (
    <ErrorBoundary screenName="AnimationPreviewScreen">
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Animation Preview</Text>
        <Text style={styles.subtitle}>Advance sessions to preview streak animations</Text>

        {/* Session Controls */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Sessions: {sessions}</Text>

          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.navBtn} onPress={reset}>
              <Text style={styles.navBtnText}>{'⟲'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navBtn} onPress={() => adjust(-10)}>
              <Text style={styles.navBtnText}>-10</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBtn} onPress={() => adjust(-5)}>
              <Text style={styles.navBtnText}>-5</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBtn} onPress={() => adjust(-1)}>
              <Text style={styles.navBtnText}>-1</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navBtn} onPress={() => adjust(1)}>
              <Text style={styles.navBtnText}>+1</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBtn} onPress={() => adjust(5)}>
              <Text style={styles.navBtnText}>+5</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBtn} onPress={() => adjust(10)}>
              <Text style={styles.navBtnText}>+10</Text>
            </TouchableOpacity>
          </View>

          {/* Playback controls */}
          <View style={styles.playbackRow}>
            <TouchableOpacity
              style={[styles.playBtn, autoPlay && styles.playBtnActive]}
              onPress={() => setAutoPlay(!autoPlay)}
            >
              <Text style={[styles.playBtnText, autoPlay && styles.playBtnTextActive]}>
                {autoPlay ? 'Pause' : 'Play'}
              </Text>
            </TouchableOpacity>
            {[0.5, 1, 2].map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.speedBtn, speed === s && styles.speedBtnActive]}
                onPress={() => setSpeed(s)}
              >
                <Text style={[styles.speedBtnText, speed === s && styles.speedBtnTextActive]}>
                  {s}x
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Streak Banner */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>
            Streak Banner (tier: {sessions >= 14 ? '3' : sessions >= 7 ? '2' : '1'})
          </Text>
          {sessions > 0 ? (
            <StreakBanner key={sessions} streak={sessions} />
          ) : (
            <Text style={styles.emptyText}>No streak yet (0 sessions)</Text>
          )}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scroll: {
    padding: Spacing.lg,
  },
  title: {
    ...Typography.heading1,
    fontWeight: '800',
    color: Colors.white,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.small,
    color: '#8888aa',
    marginBottom: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    ...Typography.subheading,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  navBtn: {
    minWidth: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.backgroundLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  navBtnText: {
    ...Typography.small,
    fontWeight: '700',
    color: Colors.gray800,
  },
  playbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  playBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.backgroundLight,
  },
  playBtnActive: {
    backgroundColor: Colors.primary,
  },
  playBtnText: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.gray800,
  },
  playBtnTextActive: {
    color: Colors.white,
  },
  speedBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.backgroundLight,
  },
  speedBtnActive: {
    backgroundColor: Colors.primarySurface,
  },
  speedBtnText: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  speedBtnTextActive: {
    color: Colors.primary,
  },
  emptyText: {
    ...Typography.small,
    color: Colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
});

export default AnimationPreviewScreen;
