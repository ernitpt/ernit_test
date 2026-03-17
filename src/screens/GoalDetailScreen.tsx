// screens/GoalDetailScreen.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, Goal } from '../types';
import { ErrorBoundary } from '../components/ErrorBoundary';
import ErrorRetry from '../components/ErrorRetry';
import { GoalCardSkeleton } from '../components/SkeletonLoader';
import { useApp } from '../context/AppContext';
import MainScreen from './MainScreen';
import { goalService } from '../services/GoalService';
import Colors from '../config/colors';
import { Typography } from '../config/typography';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { Shadows } from '../config/shadows';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const GoalDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute();
  const { state } = useApp();
  const { goalId } = route.params as { goalId: string };
  const [goal, setGoal] = useState<(Goal & { sessionsPerWeek: number }) | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Redirect if goalId is missing
  useEffect(() => {
    if (!goalId) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Goals' }],
      });
    }
  }, [goalId, navigation]);

  useFocusEffect(
    useCallback(() => {
      if (!goalId) return;
      setLoadError(false);
      const fetchGoal = async () => {
        try {
          const g = await goalService.getGoalById(goalId);
          if (g) {
            setGoal(g as Goal & { sessionsPerWeek: number });
          } else {
            setLoadError(true);
          }
        } catch {
          setLoadError(true);
        }
      };
      fetchGoal();
    }, [goalId, retryKey])
  );

  const weeklyPct = useMemo(() => {
    if (!goal) return 0;
    const denom = goal.sessionsPerWeek || 1;
    return Math.min(100, Math.round((goal.weeklyCount / denom) * 100));
  }, [goal]);

  const overallPct = useMemo(() => {
    if (!goal || !goal.targetCount) return 0;
    return Math.min(100, Math.round((goal.currentCount / goal.targetCount) * 100));
  }, [goal]);

  const weekWindow = useMemo(() => {
    if (!goal?.weekStartAt) return null;
    const start = new Date(goal.weekStartAt);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }, [goal?.weekStartAt]);

  const renderCalendar = () => {
    const today = new Date();
    const todayIdx = (today.getDay() + 6) % 7; // Monday=0..Sunday=6

    return (
      <View style={{ marginTop: Spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {DAY_LETTERS.map((d, i) => {
            const isToday = i === todayIdx;
            return (
              <View key={d + i} style={{ width: 24, alignItems: 'center' }}>
                <Text style={[styles.dayLetter, isToday && styles.dayLetterToday]}>{d}</Text>
              </View>
            );
          })}
        </View>
        {weekWindow ? (
          <Text style={styles.weekWindowText}>
            {weekWindow.start.toLocaleDateString()} – {weekWindow.end.toLocaleDateString()}
          </Text>
        ) : (
          <Text style={styles.weekWindowTextDim}>Week starts when you log your first session</Text>
        )}
      </View>
    );
  };

  if (!goal) {
    return (
      <ErrorBoundary screenName="GoalDetailScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Goals">
        <View style={styles.loading}>
          {loadError ? (
            <ErrorRetry onRetry={() => {
              setLoadError(false);
              setGoal(null);
              setRetryKey(k => k + 1);
            }} />
          ) : (
            <GoalCardSkeleton />
          )}
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="GoalDetailScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Goals">
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('Goals');
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Goal Details</Text>
      </View>

      <ScrollView style={{ flex: 1, padding: Spacing.lg }}>
        <View style={styles.card}>
          <Text style={styles.title}>{goal.title}</Text>
          <Text style={styles.desc}>{goal.description}</Text>

          {/* This week */}
          <View style={{ marginBottom: Spacing.lg }}>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>This Week</Text>
              <Text style={styles.value}>
                {goal.weeklyCount}/{goal.sessionsPerWeek}
              </Text>
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${weeklyPct}%` }]} />
            </View>
            {renderCalendar()}
          </View>

          {/* Overall */}
          <View>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>Overall</Text>
              <Text style={styles.value}>
                {goal.currentCount}/{goal.targetCount}
              </Text>
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFillAlt, { width: `${overallPct}%` }]} />
            </View>
          </View>

          {/* Completed banner */}
          {goal.isCompleted && (
            <View style={styles.completedBox}>
              <Text style={styles.completedText}>🎉 Goal Completed! Enjoy your reward!</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </MainScreen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backText: { ...Typography.subheading, color: Colors.secondary, fontWeight: '500' },
  headerTitle: { ...Typography.heading1, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.xs },

  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    ...Shadows.sm,
  },
  title: { ...Typography.large, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  desc: { ...Typography.subheading, color: Colors.textSecondary, marginBottom: Spacing.lg },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  label: { ...Typography.small, color: Colors.gray600, fontWeight: '600' },
  value: { ...Typography.small, color: Colors.textPrimary, fontWeight: '600' },

  progressBg: { backgroundColor: Colors.border, borderRadius: BorderRadius.sm, height: 12 },
  progressFill: { backgroundColor: Colors.secondary, height: 12, borderRadius: BorderRadius.sm },
  progressFillAlt: { backgroundColor: Colors.secondary, height: 12, borderRadius: BorderRadius.sm },

  completedBox: {
    backgroundColor: Colors.secondary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  completedText: { color: Colors.white, fontWeight: '600' },

  dayLetter: { color: Colors.textSecondary, fontWeight: '600' },
  dayLetterToday: { color: Colors.primary, textDecorationLine: 'underline' },
  weekWindowText: { marginTop: Spacing.xs, ...Typography.caption, color: Colors.gray700 },
  weekWindowTextDim: { marginTop: Spacing.xs, ...Typography.caption, color: Colors.textMuted },
});

export default GoalDetailScreen;
