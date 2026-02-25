import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '../../../config/colors';
import { Goal, isSelfGifted } from '../../../types';
import { isGoalLocked, formatDurationDisplay, formatNextWeekDay, getApprovalBlockMessage } from '../goalCardUtils';
import { config } from '../../../config/environment';

const DEBUG_ALLOW_MULTIPLE_PER_DAY = config.debugEnabled;

// ─── AlreadyLoggedTodayCard ─────────────────────────────────────────

const AlreadyLoggedTodayCard: React.FC = React.memo(() => {
  const checkScale = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(checkScale, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [checkScale, fadeAnim]);

  return (
    <Animated.View style={[styles.loggedTodayContainer, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={[Colors.primarySurface, '#FFFFFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.loggedTodayGradient}
      >
        <Animated.View style={[styles.loggedTodayCheck, { transform: [{ scale: checkScale }] }]}>
          <LinearGradient
            colors={Colors.gradientPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.loggedTodayCheckCircle}
          >
            <Text style={styles.loggedTodayCheckText}>✓</Text>
          </LinearGradient>
        </Animated.View>
        <Text style={styles.loggedTodayTitle}>Great job today!</Text>
        <Text style={styles.loggedTodaySub}>Come back tomorrow for more</Text>
      </LinearGradient>
    </Animated.View>
  );
});

AlreadyLoggedTodayCard.displayName = 'AlreadyLoggedTodayCard';

// ─── SessionActionArea ──────────────────────────────────────────────

interface SessionActionAreaProps {
  goal: Goal;
  empoweredName: string | null;
  alreadyLoggedToday: boolean;
  totalSessionsDone: number;
  hasPersonalizedHintWaiting: boolean;
  valentinePartnerName: string | null;
  loading: boolean;
  onStart: () => void;
}

const SessionActionArea: React.FC<SessionActionAreaProps> = ({
  goal,
  empoweredName,
  alreadyLoggedToday,
  totalSessionsDone,
  hasPersonalizedHintWaiting,
  valentinePartnerName,
  loading,
  onStart,
}) => {
  const isSelfGift = isSelfGifted(goal);
  const locked = isGoalLocked(goal);

  // Week completed state
  if (goal.isWeekCompleted && !goal.isCompleted) {
    return (
      <View style={styles.weekCompleteBox}>
        <Text style={styles.weekCompleteText}>You've completed this week!</Text>
        <Text style={styles.weekCompleteSub}>
          Next week starts on {formatNextWeekDay(goal.weekStartAt)}
        </Text>
      </View>
    );
  }

  // Approval status banners
  const bannerMessage = !isSelfGift ? getApprovalBlockMessage(goal, empoweredName, 'banner') : null;
  const showBanner0 = bannerMessage && locked && totalSessionsDone === 0;
  const showBanner1 = !isSelfGift && locked && totalSessionsDone === 1;
  const banner1Message = getApprovalBlockMessage(goal, empoweredName, 'banner');

  // Valentine: finished but waiting for partner
  if (goal.valentineChallengeId && goal.isFinished && !goal.isUnlocked) {
    return (
      <LinearGradient
        colors={['#FFF4ED', '#FFE5EF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.waitingBanner}
      >
        <View style={styles.waitingTextContainer}>
          <Text style={styles.waitingTitle}>
            You've Completed Your Goal!
          </Text>
          <Text style={styles.waitingSubtext}>
            Waiting for {valentinePartnerName || 'partner'} to finish...
          </Text>
        </View>
      </LinearGradient>
    );
  }

  // Locked: 1-day/1-session OR has done 1 session already
  if ((locked && goal.targetCount === 1 && goal.sessionsPerWeek === 1)
    || (locked && goal.targetCount >= 1 && goal.weeklyCount >= 1)) {
    return (
      <>
        {showBanner0 && bannerMessage && (
          <View style={styles.approvalMessageBox}>
            <Text style={styles.approvalMessageText}>{bannerMessage.message}</Text>
          </View>
        )}
        <View style={styles.disabledStartContainer}>
          <Text style={styles.disabledStartText}>Waiting for approval</Text>
        </View>
      </>
    );
  }

  // Valentine: waiting for partner to redeem
  if (goal.valentineChallengeId && !goal.partnerGoalId) {
    return (
      <View style={styles.disabledStartContainer}>
        <Text style={styles.disabledStartText}>Waiting for Partner</Text>
        <Text style={[styles.disabledStartText, { fontSize: 13, marginTop: 4 }]}>
          Your partner needs to redeem their code first
        </Text>
      </View>
    );
  }

  // Already logged today
  if (alreadyLoggedToday && !DEBUG_ALLOW_MULTIPLE_PER_DAY) {
    return <AlreadyLoggedTodayCard />;
  }

  // Normal start button
  return (
    <View>
      {/* Approval banners */}
      {showBanner0 && bannerMessage && (
        <View style={styles.approvalMessageBox}>
          <Text style={styles.approvalMessageText}>{bannerMessage.message}</Text>
        </View>
      )}
      {showBanner1 && banner1Message && (
        <View style={[styles.approvalMessageBox, { backgroundColor: '#ECFDF5', borderLeftColor: '#348048' }]}>
          <Text style={[styles.approvalMessageText, { color: '#065F46' }]}>
            {banner1Message.message}
          </Text>
        </View>
      )}

      {/* Personalized hint indicator */}
      {hasPersonalizedHintWaiting && goal.personalizedNextHint && (
        <Text style={styles.hintIndicator}>
          {goal.personalizedNextHint.giverName} left you a hint for next session. Complete session now to view it!
        </Text>
      )}

      <TouchableOpacity
        style={styles.startButton}
        onPress={onStart}
        disabled={loading}
        activeOpacity={0.8}
      >
        <Text style={styles.startButtonText}>{loading ? 'Loading...' : 'Start Session'}</Text>
      </TouchableOpacity>

      <Text style={styles.sessionDurationText}>
        Session duration: {formatDurationDisplay(goal.targetHours, goal.targetMinutes)}
      </Text>
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  weekCompleteBox: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
  },
  weekCompleteText: {
    color: '#065F46',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  weekCompleteSub: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '500',
  },
  approvalMessageBox: {
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  approvalMessageText: {
    fontSize: 13,
    color: '#78350f',
    lineHeight: 18,
  },
  disabledStartContainer: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
  },
  disabledStartText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  waitingBanner: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD6E8',
  },
  waitingTextContainer: {
    alignItems: 'center',
    gap: 4,
  },
  waitingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#BE185D',
    textAlign: 'center',
  },
  waitingSubtext: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9F1239',
    opacity: 0.8,
    textAlign: 'center',
  },
  startButton: { backgroundColor: Colors.secondary, paddingVertical: 14, borderRadius: 12 },
  startButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  sessionDurationText: {
    marginTop: 8,
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
  },
  hintIndicator: {
    fontSize: 13,
    color: Colors.secondary,
    textAlign: 'center',
    marginBottom: 12,
    opacity: 0.85,
  },
  // Already logged today (improved)
  loggedTodayContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  loggedTodayGradient: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  loggedTodayCheck: {
    marginBottom: 8,
  },
  loggedTodayCheckCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loggedTodayCheckText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  loggedTodayTitle: {
    color: Colors.primaryDark,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  loggedTodaySub: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
});

export default SessionActionArea;
