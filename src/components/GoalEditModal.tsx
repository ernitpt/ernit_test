import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BaseModal } from './BaseModal';
import Button from './Button';
import { Goal } from '../types';
import { goalService } from '../services/GoalService';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { logger } from '../utils/logger';
import { sanitizeText } from '../utils/sanitization';

interface GoalEditModalProps {
  visible: boolean;
  goal: Goal;
  onClose: () => void;
  onGoalUpdated: (goal: Goal) => void;
}

const GoalEditModal: React.FC<GoalEditModalProps> = ({
  visible,
  goal,
  onClose,
  onGoalUpdated,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isGiftedGoal = !!goal?.empoweredBy;

  // For self-goals: min = already-completed weeks / already-logged sessions this week
  // For gifted goals: these become the new request values sent to the giver
  const minWeeks = isGiftedGoal ? 1 : Math.max(1, goal?.currentCount || 0);
  const minSessions = isGiftedGoal ? 1 : Math.max(1, goal?.weeklyCount || 0);
  const maxWeeks = 5;
  const maxSessions = 7;

  const [selectedWeeks, setSelectedWeeks] = useState(goal?.targetCount || 1);
  const [selectedSessions, setSelectedSessions] = useState(goal?.sessionsPerWeek || 1);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (visible && goal) {
      setSelectedWeeks(goal.targetCount || 1);
      setSelectedSessions(goal.sessionsPerWeek || 1);
      setMessage('');
      setError(null);
      setSuccess(false);
    }
  }, [visible, goal]);

  const adjustWeeks = useCallback((delta: number) => {
    if (loading) return;
    const newVal = Math.max(minWeeks, Math.min(maxWeeks, selectedWeeks + delta));
    setSelectedWeeks(newVal);
    setError(null);
  }, [loading, minWeeks, maxWeeks, selectedWeeks]);

  const adjustSessions = useCallback((delta: number) => {
    if (loading) return;
    const newVal = Math.max(minSessions, Math.min(maxSessions, selectedSessions + delta));
    setSelectedSessions(newVal);
    setError(null);
  }, [loading, minSessions, maxSessions, selectedSessions]);

  const handleWeeksChange = useCallback((text: string) => {
    const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num)) {
      setSelectedWeeks(Math.max(minWeeks, Math.min(maxWeeks, num)));
    } else if (text === '') {
      setSelectedWeeks(minWeeks);
    }
  }, [minWeeks, maxWeeks]);

  const handleSessionsChange = useCallback((text: string) => {
    const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num)) {
      setSelectedSessions(Math.max(minSessions, Math.min(maxSessions, num)));
    } else if (text === '') {
      setSelectedSessions(minSessions);
    }
  }, [minSessions, maxSessions]);

  const handleSave = useCallback(async () => {
    if (!goal?.id) {
      setError('Goal information is missing.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (isGiftedGoal) {
        // Send edit request to giver
        await goalService.requestGoalEdit(
          goal.id,
          selectedWeeks,
          selectedSessions,
          sanitizeText(message.trim(), 500) || undefined
        );
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setSuccess(true);
      } else {
        // Direct self-edit
        const updated = await goalService.selfEditGoal(goal.id, selectedWeeks, selectedSessions);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        onGoalUpdated(updated);
        onClose();
      }
    } catch (err: unknown) {
      logger.error('GoalEditModal: save error', err);
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [goal, isGiftedGoal, selectedWeeks, selectedSessions, message, onGoalUpdated, onClose]);

  const title = isGiftedGoal ? 'Request Goal Edit' : 'Edit Goal';

  if (success) {
    return (
      <BaseModal visible={visible} onClose={onClose} title="Request Sent">
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>📬</Text>
          <Text style={styles.successTitle}>Request sent!</Text>
          <Text style={styles.successBody}>
            Your giver has been notified and can approve or decline your edit request.
          </Text>
        </View>
        <Button title="Done" variant="primary" size="md" onPress={onClose} style={styles.fullWidth} />
      </BaseModal>
    );
  }

  return (
    <BaseModal visible={visible} onClose={onClose} title={title}>
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {isGiftedGoal && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Since this is a gifted goal, your edit will be sent as a request to your giver for approval.
          </Text>
        </View>
      )}

      <View style={styles.currentInfo}>
        <Text style={styles.currentLabel}>Current goal:</Text>
        <Text style={styles.currentValue}>
          {goal?.targetCount} week{(goal?.targetCount || 1) !== 1 ? 's' : ''}, {goal?.sessionsPerWeek} session{(goal?.sessionsPerWeek || 1) !== 1 ? 's' : ''}/week
        </Text>
      </View>

      <View style={styles.selectorContainer}>
        <Text style={styles.selectorLabel}>
          {isGiftedGoal ? 'Requested goal:' : 'New goal:'}
        </Text>
        <Text style={styles.selectorValue}>
          {selectedWeeks} week{selectedWeeks !== 1 ? 's' : ''}, {selectedSessions} session{selectedSessions !== 1 ? 's' : ''}/week
        </Text>

        {/* Weeks stepper */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Weeks (max 5):</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={[styles.stepBtn, selectedWeeks <= minWeeks && styles.stepBtnDisabled]}
              onPress={() => adjustWeeks(-1)}
              disabled={selectedWeeks <= minWeeks || loading}
              accessibilityRole="button"
              accessibilityLabel="Decrease weeks"
            >
              <Text style={[styles.stepBtnText, selectedWeeks <= minWeeks && styles.stepBtnTextDisabled]}>−</Text>
            </TouchableOpacity>
            <View style={styles.stepInputWrap}>
              <TextInput
                style={styles.stepInput}
                value={selectedWeeks.toString()}
                onChangeText={handleWeeksChange}
                keyboardType="numeric"
                editable={!loading}
                accessibilityLabel="Weeks value"
              />
            </View>
            <TouchableOpacity
              style={[styles.stepBtn, selectedWeeks >= maxWeeks && styles.stepBtnDisabled]}
              onPress={() => adjustWeeks(1)}
              disabled={selectedWeeks >= maxWeeks || loading}
              accessibilityRole="button"
              accessibilityLabel="Increase weeks"
            >
              <Text style={[styles.stepBtnText, selectedWeeks >= maxWeeks && styles.stepBtnTextDisabled]}>+</Text>
            </TouchableOpacity>
          </View>
          {!isGiftedGoal && (goal?.currentCount || 0) > 0 && (
            <Text style={styles.constraintNote}>
              Min {minWeeks} week{minWeeks !== 1 ? 's' : ''} (already completed {goal.currentCount})
            </Text>
          )}
        </View>

        {/* Sessions stepper */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Sessions per week (max 7):</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={[styles.stepBtn, selectedSessions <= minSessions && styles.stepBtnDisabled]}
              onPress={() => adjustSessions(-1)}
              disabled={selectedSessions <= minSessions || loading}
              accessibilityRole="button"
              accessibilityLabel="Decrease sessions"
            >
              <Text style={[styles.stepBtnText, selectedSessions <= minSessions && styles.stepBtnTextDisabled]}>−</Text>
            </TouchableOpacity>
            <View style={styles.stepInputWrap}>
              <TextInput
                style={styles.stepInput}
                value={selectedSessions.toString()}
                onChangeText={handleSessionsChange}
                keyboardType="numeric"
                editable={!loading}
                accessibilityLabel="Sessions value"
              />
            </View>
            <TouchableOpacity
              style={[styles.stepBtn, selectedSessions >= maxSessions && styles.stepBtnDisabled]}
              onPress={() => adjustSessions(1)}
              disabled={selectedSessions >= maxSessions || loading}
              accessibilityRole="button"
              accessibilityLabel="Increase sessions"
            >
              <Text style={[styles.stepBtnText, selectedSessions >= maxSessions && styles.stepBtnTextDisabled]}>+</Text>
            </TouchableOpacity>
          </View>
          {!isGiftedGoal && (goal?.weeklyCount || 0) > 0 && (
            <Text style={styles.constraintNote}>
              Min {minSessions} session{minSessions !== 1 ? 's' : ''} (already logged {goal.weeklyCount} this week)
            </Text>
          )}
        </View>
      </View>

      {/* Optional message for gifted goals */}
      {isGiftedGoal && (
        <TextInput
          style={styles.messageInput}
          placeholder="Add a message to your giver (optional)..."
          placeholderTextColor={colors.textMuted}
          value={message}
          onChangeText={(t) => { setMessage(t); setError(null); }}
          multiline
          numberOfLines={3}
          maxLength={500}
          editable={!loading}
        />
      )}

      <View style={styles.buttonRow}>
        <Button
          title="Cancel"
          variant="ghost"
          size="md"
          onPress={onClose}
          disabled={loading}
          style={styles.halfBtn}
        />
        <Button
          title={isGiftedGoal ? 'Send Request' : 'Save Changes'}
          variant="primary"
          size="md"
          onPress={handleSave}
          loading={loading}
          style={styles.halfBtn}
        />
      </View>
    </BaseModal>
  );
};

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    errorBox: {
      backgroundColor: colors.errorLight,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderLeftWidth: 4,
      borderLeftColor: colors.error,
    },
    errorText: {
      color: colors.errorDark,
      ...Typography.small,
      fontWeight: '500',
    },
    infoBox: {
      backgroundColor: colors.infoLight,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderLeftWidth: 4,
      borderLeftColor: colors.info,
    },
    infoText: {
      ...Typography.small,
      color: colors.infoDark ?? colors.info,
    },
    currentInfo: {
      marginBottom: Spacing.lg,
    },
    currentLabel: {
      ...Typography.caption,
      color: colors.textSecondary,
      marginBottom: Spacing.xxs,
    },
    currentValue: {
      ...Typography.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    selectorContainer: {
      marginBottom: Spacing.lg,
    },
    selectorLabel: {
      ...Typography.body,
      fontWeight: '600',
      color: colors.gray700,
      marginBottom: Spacing.sm,
    },
    selectorValue: {
      ...Typography.heading3,
      color: colors.primary,
      textAlign: 'center',
      marginBottom: Spacing.lg,
    },
    inputGroup: {
      marginBottom: Spacing.md,
    },
    inputLabel: {
      ...Typography.small,
      fontWeight: '500',
      color: colors.gray700,
      marginBottom: Spacing.sm,
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    stepBtn: {
      width: 44,
      height: 44,
      borderRadius: BorderRadius.sm,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepBtnDisabled: {
      backgroundColor: colors.gray300,
      opacity: 0.5,
    },
    stepBtnText: {
      color: colors.white,
      fontSize: Typography.large.fontSize,
      fontWeight: '600',
    },
    stepBtnTextDisabled: {
      color: colors.textMuted,
    },
    stepInputWrap: {
      flex: 1,
    },
    stepInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.gray300,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      ...Typography.subheading,
      textAlign: 'center',
      color: colors.textPrimary,
    },
    constraintNote: {
      ...Typography.caption,
      color: colors.textMuted,
      marginTop: Spacing.xxs,
    },
    messageInput: {
      borderWidth: 1,
      borderColor: colors.gray300,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      ...Typography.small,
      color: colors.textPrimary,
      minHeight: 80,
      textAlignVertical: 'top',
      marginBottom: Spacing.lg,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    halfBtn: {
      flex: 1,
    },
    fullWidth: {
      width: '100%',
    },
    successContainer: {
      alignItems: 'center',
      paddingVertical: Spacing.xl,
    },
    successEmoji: {
      fontSize: Typography.emoji.fontSize,
      lineHeight: Typography.emoji.lineHeight,
      marginBottom: Spacing.md,
    },
    successTitle: {
      ...Typography.heading3,
      color: colors.textPrimary,
      marginBottom: Spacing.sm,
    },
    successBody: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Spacing.xl,
    },
  });

export default React.memo(GoalEditModal);
