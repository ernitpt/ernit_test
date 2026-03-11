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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scroll: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#8888aa',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  navBtn: {
    minWidth: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f0f0f5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  navBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  playbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f5',
  },
  playBtnActive: {
    backgroundColor: Colors.primary,
  },
  playBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  playBtnTextActive: {
    color: '#fff',
  },
  speedBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f5',
  },
  speedBtnActive: {
    backgroundColor: Colors.primarySurface,
  },
  speedBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  speedBtnTextActive: {
    color: Colors.primary,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
});

export default AnimationPreviewScreen;
