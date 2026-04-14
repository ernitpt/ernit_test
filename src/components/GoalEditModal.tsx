import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
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
import { useApp } from '../context/AppContext';

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
  const { t } = useTranslation();
  const { state } = useApp();

  const isGiftedGoal = !goal?.isFreeGoal && !!goal?.empoweredBy && goal.empoweredBy !== state.user?.id;

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
      setError(t('modals.goalEdit.error.missingGoal'));
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
      setError(err instanceof Error ? err.message : t('modals.goalEdit.error.saveFailed'));
    } finally {
      setLoading(false);
    }
  }, [goal, isGiftedGoal, selectedWeeks, selectedSessions, message, onGoalUpdated, onClose]);

  const title = isGiftedGoal ? t('modals.goalEdit.titleRequest') : t('modals.goalEdit.title');

  if (success) {
    return (
      <BaseModal visible={visible} onClose={onClose} title={t('modals.goalEdit.requestSentTitle')}>
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>{t('modals.goalEdit.requestSentEmoji')}</Text>
          <Text style={styles.successTitle}>{t('modals.goalEdit.requestSentHeading')}</Text>
          <Text style={styles.successBody}>
            {t('modals.goalEdit.requestSentBody')}
          </Text>
        </View>
        <Button title={t('modals.goalEdit.done')} variant="primary" size="md" onPress={onClose} style={styles.fullWidth} />
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
            {t('modals.goalEdit.giftedGoalInfo')}
          </Text>
        </View>
      )}

      <View style={styles.currentInfo}>
        <Text style={styles.currentLabel}>{t('modals.goalEdit.currentGoalLabel')}</Text>
        <Text style={styles.currentValue}>
          {goal?.targetCount} week{(goal?.targetCount || 1) !== 1 ? 's' : ''}, {goal?.sessionsPerWeek} session{(goal?.sessionsPerWeek || 1) !== 1 ? 's' : ''}/week
        </Text>
      </View>

      <View style={styles.selectorContainer}>
        <Text style={styles.selectorLabel}>
          {isGiftedGoal ? t('modals.goalEdit.requestedGoalLabel') : t('modals.goalEdit.newGoalLabel')}
        </Text>
        <Text style={styles.selectorValue}>
          {selectedWeeks} week{selectedWeeks !== 1 ? 's' : ''}, {selectedSessions} session{selectedSessions !== 1 ? 's' : ''}/week
        </Text>

        {/* Weeks stepper */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('modals.goalEdit.weeksLabel')}</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={[styles.stepBtn, selectedWeeks <= minWeeks && styles.stepBtnDisabled]}
              onPress={() => adjustWeeks(-1)}
              disabled={selectedWeeks <= minWeeks || loading}
              accessibilityRole="button"
              accessibilityLabel={t('modals.goalEdit.decreaseWeeks')}
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
                accessibilityLabel={t('modals.goalEdit.weeksValue')}
              />
            </View>
            <TouchableOpacity
              style={[styles.stepBtn, selectedWeeks >= maxWeeks && styles.stepBtnDisabled]}
              onPress={() => adjustWeeks(1)}
              disabled={selectedWeeks >= maxWeeks || loading}
              accessibilityRole="button"
              accessibilityLabel={t('modals.goalEdit.increaseWeeks')}
            >
              <Text style={[styles.stepBtnText, selectedWeeks >= maxWeeks && styles.stepBtnTextDisabled]}>+</Text>
            </TouchableOpacity>
          </View>
          {!isGiftedGoal && (goal?.currentCount || 0) > 0 && (
            <Text style={styles.constraintNote}>
              {t('modals.goalEdit.minWeeksNote', { count: minWeeks, completed: goal.currentCount })}
            </Text>
          )}
        </View>

        {/* Sessions stepper */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('modals.goalEdit.sessionsLabel')}</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={[styles.stepBtn, selectedSessions <= minSessions && styles.stepBtnDisabled]}
              onPress={() => adjustSessions(-1)}
              disabled={selectedSessions <= minSessions || loading}
              accessibilityRole="button"
              accessibilityLabel={t('modals.goalEdit.decreaseSessions')}
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
                accessibilityLabel={t('modals.goalEdit.sessionsValue')}
              />
            </View>
            <TouchableOpacity
              style={[styles.stepBtn, selectedSessions >= maxSessions && styles.stepBtnDisabled]}
              onPress={() => adjustSessions(1)}
              disabled={selectedSessions >= maxSessions || loading}
              accessibilityRole="button"
              accessibilityLabel={t('modals.goalEdit.increaseSessions')}
            >
              <Text style={[styles.stepBtnText, selectedSessions >= maxSessions && styles.stepBtnTextDisabled]}>+</Text>
            </TouchableOpacity>
          </View>
          {!isGiftedGoal && (goal?.weeklyCount || 0) > 0 && (
            <Text style={styles.constraintNote}>
              {t('modals.goalEdit.minSessionsNote', { count: minSessions, logged: goal.weeklyCount })}
            </Text>
          )}
        </View>
      </View>

      {/* Optional message for gifted goals */}
      {isGiftedGoal && (
        <TextInput
          style={styles.messageInput}
          placeholder={t('modals.goalEdit.messagePlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={message}
          onChangeText={(text) => { setMessage(text); setError(null); }}
          multiline
          numberOfLines={3}
          maxLength={500}
          editable={!loading}
        />
      )}

      <View style={styles.buttonRow}>
        <Button
          title={t('modals.goalEdit.cancel')}
          variant="ghost"
          size="md"
          onPress={onClose}
          disabled={loading}
          style={styles.halfBtn}
        />
        <Button
          title={isGiftedGoal ? t('modals.goalEdit.sendRequest') : t('modals.goalEdit.saveChanges')}
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
