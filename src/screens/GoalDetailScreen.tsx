// screens/GoalDetailScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StatusBar, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, Goal } from '../types';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { GoalCardSkeleton } from '../components/SkeletonLoader';
import { useApp } from '../context/AppContext';
import MainScreen from './MainScreen';
import { goalService } from '../services/GoalService';
import Colors from '../config/colors';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const GoalDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute();
  const { state } = useApp();
  const { goalId } = route.params as { goalId: string };
  const [goal, setGoal] = useState<(Goal & { sessionsPerWeek: number }) | null>(null);

  // Redirect if goalId is missing
  useEffect(() => {
    if (!goalId) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Goals' }],
      });
    }
  }, [goalId, navigation]);

  useEffect(() => {
    if (!goalId) return;
    (async () => {
      const g = await goalService.getGoalById(goalId);
      if (g) setGoal(g as Goal & { sessionsPerWeek: number });
    })();
  }, [goalId]);

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
      <View style={{ marginTop: 8 }}>
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
          <GoalCardSkeleton />
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="GoalDetailScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Goals">
      <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
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

      <ScrollView style={{ flex: 1, padding: 16 }}>
        <View style={styles.card}>
          <Text style={styles.title}>{goal.title}</Text>
          <Text style={styles.desc}>{goal.description}</Text>

          {/* This week */}
          <View style={{ marginBottom: 16 }}>
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
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    // paddingTop: 34,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backText: { fontSize: 16, color: Colors.secondary, fontWeight: '500' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary, marginTop: 6 },

  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 8 },
  desc: { fontSize: 16, color: Colors.textSecondary, marginBottom: 16 },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 14, color: '#4b5563', fontWeight: '600' },
  value: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },

  progressBg: { backgroundColor: Colors.border, borderRadius: 8, height: 12 },
  progressFill: { backgroundColor: Colors.secondary, height: 12, borderRadius: 8 },
  progressFillAlt: { backgroundColor: '#10b981', height: 12, borderRadius: 8 },

  completedBox: {
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
    alignItems: 'center',
  },
  completedText: { color: '#fff', fontWeight: '600' },

  dayLetter: { color: Colors.textSecondary, fontWeight: '600' },
  dayLetterToday: { color: Colors.primary, textDecorationLine: 'underline' },
  weekWindowText: { marginTop: 6, fontSize: 12, color: '#374151' },
  weekWindowTextDim: { marginTop: 6, fontSize: 12, color: Colors.textMuted },
});

export default GoalDetailScreen;
