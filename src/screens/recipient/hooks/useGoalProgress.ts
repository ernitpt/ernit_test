import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Goal } from '../../../types';
import { isoDay, rollingWeek } from '../goalCardUtils';
import { DateHelper } from '../../../utils/DateHelper';
import { PartnerGoalData } from '../goalCardUtils';
import { formatLocalDate } from '../../../utils/i18nHelpers';

interface UseGoalProgressOptions {
  goal: Goal;
  selectedView: 'user' | 'partner';
  partnerGoalData: PartnerGoalData | null;
  debugTimeKey: number;
}

export function useGoalProgress({
  goal,
  selectedView,
  partnerGoalData,
  debugTimeKey,
}: UseGoalProgressOptions) {
  const { t } = useTranslation();
  // Displayed values based on selected view (user or partner)
  const displayedWeekStart = selectedView === 'user'
    ? goal.weekStartAt
    : partnerGoalData?.weekStartAt;

  const displayedLogDates = selectedView === 'user'
    ? goal.weeklyLogDates || []
    : partnerGoalData?.weeklyLogDates || [];

  const displayedWeeklyCount = selectedView === 'user'
    ? goal.weeklyCount
    : partnerGoalData?.weeklyCount || 0;

  const displayedSessionsPerWeek = selectedView === 'user'
    ? goal.sessionsPerWeek
    : partnerGoalData?.sessionsPerWeek || 1;

  const displayedCurrentCount = selectedView === 'user'
    ? goal.currentCount
    : partnerGoalData?.currentCount || 0;

  const displayedTargetCount = selectedView === 'user'
    ? goal.targetCount
    : partnerGoalData?.targetCount || 1;

  // Week dates for calendar
  const weekStart = displayedWeekStart || goal.weekStartAt;

  const weekDates = useMemo(() => {
    void debugTimeKey; // force recalculation on debug time changes
    let start: Date;
    if (!weekStart) {
      start = DateHelper.now();
    } else if (typeof weekStart === 'object' && 'toDate' in weekStart) {
      start = (weekStart as { toDate: () => Date }).toDate();
    } else if (weekStart instanceof Date) {
      start = new Date(weekStart);
    } else {
      start = new Date(weekStart as string | number);
    }
    start.setHours(0, 0, 0, 0);
    return rollingWeek(start);
  }, [weekStart, debugTimeKey]);

  const loggedSet = useMemo(() => new Set(displayedLogDates), [displayedLogDates]);
  const todayIso = useMemo(() => isoDay(DateHelper.now()), [debugTimeKey]);

  const alreadyLoggedToday = useMemo(() => {
    const logDates = selectedView === 'user'
      ? (goal.weeklyLogDates || [])
      : (partnerGoalData?.weeklyLogDates || []);
    return new Set(logDates).has(todayIso);
  }, [selectedView, goal.weeklyLogDates, partnerGoalData?.weeklyLogDates, todayIso]);

  const totalSessionsDone = useMemo(() => {
    return (goal.currentCount * goal.sessionsPerWeek) + goal.weeklyCount;
  }, [goal.currentCount, goal.sessionsPerWeek, goal.weeklyCount]);

  const totalSessions = useMemo(() => {
    return goal.targetCount * goal.sessionsPerWeek;
  }, [goal.targetCount, goal.sessionsPerWeek]);

  const totalGoalSeconds = useMemo(() => {
    return (goal.targetHours || 0) * 3600 + (goal.targetMinutes || 0) * 60;
  }, [goal.targetHours, goal.targetMinutes]);

  const completedWeeks = useMemo(() => {
    const finishedThisWeek = displayedWeeklyCount >= displayedSessionsPerWeek;
    const base = displayedCurrentCount || 0;
    const total = displayedTargetCount || 1;
    if (selectedView === 'user' && goal.isCompleted) return total;
    if (selectedView === 'partner' && partnerGoalData?.isCompleted) return total;
    return Math.min(base + (finishedThisWeek ? 1 : 0), total);
  }, [selectedView, displayedWeeklyCount, displayedSessionsPerWeek, displayedCurrentCount, displayedTargetCount, goal.isCompleted, partnerGoalData?.isCompleted]);

  const hasPersonalizedHintWaiting = useMemo(() => {
    if (!goal.personalizedNextHint) return false;
    return goal.personalizedNextHint.forSessionNumber === (totalSessionsDone + 1);
  }, [goal.personalizedNextHint, totalSessionsDone]);

  // Start date text
  const startDateText = useMemo(() => {
    if (!goal.plannedStartDate) return null;
    const planned = new Date(goal.plannedStartDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    planned.setHours(0, 0, 0, 0);

    const diffMs = planned.getTime() - today.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('recipient.goalProgress.startsToday');
    if (diffDays === 1) return t('recipient.goalProgress.startsTomorrow');
    if (diffDays === -1) return t('recipient.goalProgress.startedYesterday');
    if (diffDays < 0) return t('recipient.goalProgress.startedDaysAgo', { days: Math.abs(diffDays) });
    if (diffDays <= 7) return t('recipient.goalProgress.startsInDays', { days: diffDays });
    return t('recipient.goalProgress.startsOn', { date: formatLocalDate(planned, { month: 'short', day: 'numeric' }) });
  }, [goal.plannedStartDate, t]);

  // Projected finish date (dynamic based on current pace)
  const projectedFinishText = useMemo(() => {
    if (goal.isCompleted) return null;
    if (!goal.weekStartAt) return null; // Goal hasn't started yet
    const remaining = (displayedTargetCount || 1) - completedWeeks;
    if (remaining <= 0) return null;
    const projectedDate = new Date();
    projectedDate.setDate(projectedDate.getDate() + remaining * 7);
    const dateStr = formatLocalDate(projectedDate, { month: 'long', day: 'numeric' });
    return t('recipient.goalProgress.projectedFinish', { date: dateStr });
  }, [goal.isCompleted, goal.weekStartAt, displayedTargetCount, completedWeeks, t]);

  return {
    weekDates,
    loggedSet,
    todayIso,
    alreadyLoggedToday,
    totalSessionsDone,
    totalSessions,
    totalGoalSeconds,
    completedWeeks,
    hasPersonalizedHintWaiting,
    startDateText,
    projectedFinishText,
    // Displayed values for rendering
    weeklyFilled: displayedWeeklyCount,
    weeklyTotal: displayedSessionsPerWeek,
    overallTotal: displayedTargetCount,
    displayedCurrentCount,
  };
}
