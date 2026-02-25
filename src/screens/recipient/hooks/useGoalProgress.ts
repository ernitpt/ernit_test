import { useMemo } from 'react';
import { Goal } from '../../../types';
import { isoDay, rollingWeek } from '../goalCardUtils';
import { DateHelper } from '../../../utils/DateHelper';
import { PartnerGoalData } from '../goalCardUtils';

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
    return goal.personalizedNextHint.forSessionNumber === (totalSessionsDone + 2);
  }, [goal.personalizedNextHint, totalSessionsDone]);

  // Start date text
  const startDateText = useMemo(() => {
    if (goal.valentineChallengeId) return null;
    if (!goal.plannedStartDate) return null;
    const planned = new Date(goal.plannedStartDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    planned.setHours(0, 0, 0, 0);

    const diffMs = planned.getTime() - today.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Starts today';
    if (diffDays === 1) return 'Starts tomorrow';
    if (diffDays === -1) return 'Started yesterday';
    if (diffDays < 0) return `Started ${Math.abs(diffDays)} days ago`;
    if (diffDays <= 7) return `Starts in ${diffDays} days`;
    return `Starts ${planned.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }, [goal.valentineChallengeId, goal.plannedStartDate]);

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
    // Displayed values for rendering
    weeklyFilled: displayedWeeklyCount,
    weeklyTotal: displayedSessionsPerWeek,
    overallTotal: displayedTargetCount,
    displayedCurrentCount,
  };
}
