// screens/GoalDetailScreen.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getWeekdayAbbreviations, formatLocalDate } from '../utils/i18nHelpers';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, Goal } from '../types';
import { ErrorBoundary } from '../components/ErrorBoundary';
import ErrorRetry from '../components/ErrorRetry';
import { GoalCardSkeleton } from '../components/SkeletonLoader';
import { useApp } from '../context/AppContext';
import { goalService } from '../services/GoalService';
import { normalizeGoal, toDateSafe } from '../utils/GoalHelpers';
import { Colors, useColors } from '../config';
import { Typography } from '../config/typography';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { Shadows } from '../config/shadows';
import Button from '../components/Button';
import { logger } from '../utils/logger';
import { analyticsService } from '../services/AnalyticsService';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const GoalDetailScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const route = useRoute();
  const { state } = useApp();
  const { goalId } = (route.params as { goalId?: string }) ?? {};
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const weekdayAbbr = useMemo(() => getWeekdayAbbreviations(), [t]);
  // Weekday abbreviations: Sun=0..Sat=6 from getWeekdayAbbreviations
  // Reorder to Mon..Sun for display (Mon=0..Sun=6)
  const dayLetters = useMemo(() => [...weekdayAbbr.slice(1), weekdayAbbr[0]], [weekdayAbbr]);
  const dayNames = useMemo(() => [
    t('goalDetail.calendar.monday'),
    t('goalDetail.calendar.tuesday'),
    t('goalDetail.calendar.wednesday'),
    t('goalDetail.calendar.thursday'),
    t('goalDetail.calendar.friday'),
    t('goalDetail.calendar.saturday'),
    t('goalDetail.calendar.sunday'),
  ], [t]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Goals');
  }, [navigation]);

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
      let mounted = true;
      setLoadError(false);
      const fetchGoal = async () => {
        try {
          const g = await goalService.getGoalById(goalId);
          if (!mounted) return;
          if (g) {
            setGoal(normalizeGoal(g));
          } else {
            setLoadError(true);
          }
        } catch (e) {
          if (!mounted) return;
          logger.error('GoalDetailScreen error:', e);
          setLoadError(true);
        }
      };
      fetchGoal();
      return () => { mounted = false; };
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

  // Screen-view enrichment — fires once goal is loaded
  useEffect(() => {
    if (!goal) return;
    analyticsService.trackEvent('screen_view', 'navigation', { goalId: goal.id, weeklyPct, overallPct }, 'GoalDetailScreen');
  }, [goal?.id]);

  const weekWindow = useMemo(() => {
    if (!goal?.weekStartAt) return null;
    const start = toDateSafe(goal.weekStartAt);
    if (isNaN(start.getTime())) return null;
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end };
  }, [goal?.weekStartAt]);

  const renderCalendar = () => {
    const today = new Date();
    const todayIdx = (today.getDay() + 6) % 7; // Monday=0..Sunday=6

    return (
      <View style={{ marginTop: Spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {dayLetters.map((d, i) => {
            const isToday = i === todayIdx;
            return (
              <View
                key={d + i}
                style={{ width: 24, alignItems: 'center' }}
                accessibilityRole="text"
                accessibilityLabel={isToday ? t('goalDetail.calendar.todayLabel', { day: dayNames[i] }) : dayNames[i]}
              >
                <Text style={[styles.dayLetter, isToday && styles.dayLetterToday]}>{d}</Text>
              </View>
            );
          })}
        </View>
        {weekWindow ? (
          <Text style={styles.weekWindowText}>
            {formatLocalDate(weekWindow.start, {})} – {formatLocalDate(weekWindow.end, {})}
          </Text>
        ) : (
          <Text style={styles.weekWindowTextDim}>{t('goalDetail.calendar.weekStartsHint')}</Text>
        )}
      </View>
    );
  };

  if (!goal) {
    return (
      <ErrorBoundary screenName="GoalDetailScreen" userId={state.user?.id}>
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
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="GoalDetailScreen" userId={state.user?.id}>
    <MotiView
      from={{ translateY: 8 }}
      animate={{ translateY: 0 }}
      transition={{ type: 'timing', duration: 250 }}
      style={{ flex: 1, backgroundColor: colors.surface }}
    >
      <StatusBar style="auto" />
      <View style={styles.header}>
        <Button
          variant="ghost"
          title={t('goalDetail.back')}
          onPress={handleBack}
        />
        <Text style={styles.headerTitle} accessibilityRole="header">{t('goalDetail.screenTitle')}</Text>
      </View>

      <ScrollView style={{ flex: 1, padding: Spacing.lg }}>
        <View style={styles.card}>
          <Text style={styles.title}>{goal.title}</Text>
          <Text style={styles.desc}>{goal.description}</Text>

          {/* This week */}
          <View style={{ marginBottom: Spacing.lg }}>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>{t('goalDetail.thisWeek')}</Text>
              <Text style={styles.value}>
                {goal.weeklyCount}/{goal.sessionsPerWeek}
              </Text>
            </View>
            <View
              style={styles.progressBg}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(weeklyPct) }}
              accessibilityLabel={t('goalDetail.progressAccessibility', { pct: Math.round(weeklyPct) })}
            >
              <View style={[styles.progressFill, { width: `${weeklyPct}%` }]} />
            </View>
            {renderCalendar()}
          </View>

          {/* Overall */}
          <View>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>{t('goalDetail.overall')}</Text>
              <Text style={styles.value}>
                {goal.currentCount}/{goal.targetCount}
              </Text>
            </View>
            <View
              style={styles.progressBg}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(overallPct) }}
              accessibilityLabel={t('goalDetail.progressAccessibility', { pct: Math.round(overallPct) })}
            >
              <View style={[styles.progressFillAlt, { width: `${overallPct}%` }]} />
            </View>
          </View>

          {/* Completed banner */}
          {goal.isCompleted && (
            <View style={styles.completedBox}>
              <Text style={styles.completedText}>{t('goalDetail.completedBanner')}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </MotiView>
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  header: {
    backgroundColor: colors.white,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...Typography.heading1, color: colors.textPrimary, marginTop: Spacing.xs },

  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    ...Shadows.sm,
  },
  title: { ...Typography.large, color: colors.textPrimary, marginBottom: Spacing.sm },
  desc: { ...Typography.subheading, color: colors.textSecondary, marginBottom: Spacing.lg },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  label: { ...Typography.smallBold, color: colors.gray600 },
  value: { ...Typography.smallBold, color: colors.textPrimary },

  progressBg: { backgroundColor: colors.border, borderRadius: BorderRadius.sm, height: 12 },
  progressFill: { backgroundColor: colors.secondary, height: 12, borderRadius: BorderRadius.sm },
  progressFillAlt: { backgroundColor: colors.secondary, height: 12, borderRadius: BorderRadius.sm },

  completedBox: {
    backgroundColor: colors.secondary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  completedText: { color: colors.white, fontWeight: '600' },

  dayLetter: { color: colors.textSecondary, fontWeight: '600' },
  dayLetterToday: { color: colors.primary, textDecorationLine: 'underline' },
  weekWindowText: { marginTop: Spacing.xs, ...Typography.caption, color: colors.gray700 },
  weekWindowTextDim: { marginTop: Spacing.xs, ...Typography.caption, color: colors.textMuted },
});

export default GoalDetailScreen;
