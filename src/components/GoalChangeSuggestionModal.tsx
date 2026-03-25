import React, { useMemo, useState, useEffect } from 'react';
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
import { notificationService } from '../services/NotificationService';
import { userService } from '../services/userService';
import { logger } from '../utils/logger';
import { sanitizeText } from '../utils/sanitization';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';

interface GoalChangeSuggestionModalProps {
  visible: boolean;
  goal: Goal;
  onClose: () => void;
  onGoalUpdated: (goal: Goal) => void;
}

const GoalChangeSuggestionModal: React.FC<GoalChangeSuggestionModalProps> = ({
  visible,
  goal,
  onClose,
  onGoalUpdated,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initialWeeks = goal?.initialTargetCount || goal?.targetCount || 0;
  const initialSessions = goal?.initialSessionsPerWeek || goal?.sessionsPerWeek || 0;
  const suggestedWeeks = goal?.suggestedTargetCount || goal?.targetCount || 0;
  const suggestedSessions = goal?.suggestedSessionsPerWeek || goal?.sessionsPerWeek || 0;

  // Calculate min values (30% above initial, same as before)
  const minWeeks = Math.ceil(initialWeeks + (suggestedWeeks - initialWeeks) * 0.3);
  const minSessions = Math.ceil(initialSessions + (suggestedSessions - initialSessions) * 0.3);

  // Max values: 5 weeks and 7 sessions per week (logical limits)
  const maxWeeks = 5;
  const maxSessions = 7;

  const [selectedWeeks, setSelectedWeeks] = useState(suggestedWeeks || initialWeeks || 0);
  const [selectedSessions, setSelectedSessions] = useState(suggestedSessions || initialSessions || 0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [giverName, setGiverName] = useState<string>('');

  useEffect(() => {
    if (visible && goal) {
      // Reset to max (giver's suggestion) when modal opens
      const weeks = goal?.suggestedTargetCount || goal?.targetCount || 0;
      const sessions = goal?.suggestedSessionsPerWeek || goal?.sessionsPerWeek || 0;
      setSelectedWeeks(weeks);
      setSelectedSessions(sessions);
      setMessage('');
      setError(null);

      // Fetch giver name
      const fetchGiverName = async () => {
        if (goal.empoweredBy) {
          try {
            const name = await userService.getUserName(goal.empoweredBy);
            setGiverName(name || 'Giver');
          } catch (error: unknown) {
            logger.error('Error fetching giver name:', error);
            setGiverName('Giver');
          }
        }
      };
      fetchGiverName();
    }
  }, [visible, goal]);

  const adjustWeeks = (delta: number) => {
    if (loading) return;
    const newValue = Math.max(minWeeks, Math.min(maxWeeks, selectedWeeks + delta));
    setSelectedWeeks(newValue);
    setError(null);
  };

  const adjustSessions = (delta: number) => {
    if (loading) return;
    const newValue = Math.max(minSessions, Math.min(maxSessions, selectedSessions + delta));
    setSelectedSessions(newValue);
    setError(null);
  };

  const handleWeeksChange = (text: string) => {
    const num = parseInt(text.replace(/[^0-9]/g, ''));
    if (!isNaN(num)) {
      const clamped = Math.max(minWeeks, Math.min(maxWeeks, num));
      setSelectedWeeks(clamped);
    } else if (text === '') {
      setSelectedWeeks(minWeeks);
    }
  };

  const handleSessionsChange = (text: string) => {
    const num = parseInt(text.replace(/[^0-9]/g, ''));
    if (!isNaN(num)) {
      const clamped = Math.max(minSessions, Math.min(maxSessions, num));
      setSelectedSessions(clamped);
    } else if (text === '') {
      setSelectedSessions(minSessions);
    }
  };

  const handleAccept = async () => {
    if (!goal || !goal.id) {
      setError('Goal information is missing. Please try again.');
      return;
    }

    // Validate limits
    if (selectedWeeks > 5) {
      setError('The maximum duration is 5 weeks.');
      return;
    }
    if (selectedSessions > 7) {
      setError('The maximum is 7 sessions per week.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const sanitizedMessage = sanitizeText(message.trim(), 500);
      const updated = await goalService.respondToGoalSuggestion(
        goal.id,
        selectedWeeks,
        selectedSessions,
        sanitizedMessage || undefined
      );

      // Notify giver
      const receiverName = await userService.getUserName(goal.userId || '');
      const giverId = goal.empoweredBy || '';
      if (giverId) {
        await notificationService.createNotification(
          giverId,
          'goal_approval_response',
          `${receiverName} accepted your goal suggestion`,
          `Accepted goal: ${selectedWeeks} weeks, ${selectedSessions} sessions per week`,
          {
            goalId: goal.id,
            recipientId: goal.userId,
          }
        );
      }

      onGoalUpdated(updated);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      onClose();
    } catch (error: unknown) {
      logger.error('Error responding to suggestion:', error);
      setError(error instanceof Error ? error.message : 'Failed to update goal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BaseModal visible={visible} onClose={onClose} title="Goal Change Suggestion">
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {goal?.giverMessage && (
        <View style={styles.messageBox}>
          <Text style={styles.messageLabel}>Message from {giverName || 'Giver'}:</Text>
          <Text style={styles.messageText}>{goal.giverMessage}</Text>
        </View>
      )}

      <View style={styles.goalInfo}>
        <Text style={styles.infoLabel}>Your original goal:</Text>
        <Text style={styles.infoText}>
          {initialWeeks} weeks, {initialSessions} sessions per week
        </Text>
      </View>

      <View style={styles.goalInfo}>
        <Text style={styles.infoLabel}>{giverName || 'Giver'}'s suggestion:</Text>
        <Text style={styles.infoText}>
          {suggestedWeeks} weeks, {suggestedSessions} sessions per week
        </Text>
      </View>

      <View style={styles.selectorContainer}>
        <Text style={styles.selectorLabel}>Choose your goal:</Text>
        <Text style={styles.selectorValue}>
          {selectedWeeks} weeks, {selectedSessions} sessions per week
        </Text>

        <View style={styles.rangeInfo}>
          <Text style={styles.rangeText}>
            Range: {minWeeks}-{maxWeeks} weeks, {minSessions}-{maxSessions} sessions/week
          </Text>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Weeks:</Text>
          <View style={styles.numberInputContainer}>
            <TouchableOpacity
              style={[
                styles.adjustButton,
                (selectedWeeks <= minWeeks || loading) && styles.adjustButtonDisabled
              ]}
              onPress={() => adjustWeeks(-1)}
              disabled={selectedWeeks <= minWeeks || loading}
              activeOpacity={selectedWeeks <= minWeeks ? 1 : 0.7}
            >
              <Text style={[
                styles.adjustButtonText,
                (selectedWeeks <= minWeeks || loading) && styles.adjustButtonTextDisabled
              ]}>-</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.numberInput}
                value={selectedWeeks.toString()}
                onChangeText={handleWeeksChange}
                keyboardType="numeric"
                editable={!loading}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.adjustButton,
                (selectedWeeks >= maxWeeks || loading) && styles.adjustButtonDisabled
              ]}
              onPress={() => adjustWeeks(1)}
              disabled={selectedWeeks >= maxWeeks || loading}
              activeOpacity={selectedWeeks >= maxWeeks ? 1 : 0.7}
            >
              <Text style={[
                styles.adjustButtonText,
                (selectedWeeks >= maxWeeks || loading) && styles.adjustButtonTextDisabled
              ]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Sessions per week:</Text>
          <View style={styles.numberInputContainer}>
            <TouchableOpacity
              style={[
                styles.adjustButton,
                (selectedSessions <= minSessions || loading) && styles.adjustButtonDisabled
              ]}
              onPress={() => adjustSessions(-1)}
              disabled={selectedSessions <= minSessions || loading}
              activeOpacity={selectedSessions <= minSessions ? 1 : 0.7}
            >
              <Text style={[
                styles.adjustButtonText,
                (selectedSessions <= minSessions || loading) && styles.adjustButtonTextDisabled
              ]}>-</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.numberInput}
                value={selectedSessions.toString()}
                onChangeText={handleSessionsChange}
                keyboardType="numeric"
                editable={!loading}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.adjustButton,
                (selectedSessions >= maxSessions || loading) && styles.adjustButtonDisabled
              ]}
              onPress={() => adjustSessions(1)}
              disabled={selectedSessions >= maxSessions || loading}
              activeOpacity={selectedSessions >= maxSessions ? 1 : 0.7}
            >
              <Text style={[
                styles.adjustButtonText,
                (selectedSessions >= maxSessions || loading) && styles.adjustButtonTextDisabled
              ]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <TextInput
        style={styles.messageInput}
        placeholder={`Your message to ${giverName || 'giver'} (optional)...`}
        value={message}
        onChangeText={(text) => {
          setMessage(text);
          setError(null);
        }}
        multiline
        numberOfLines={3}
        maxLength={500}
      />

      <View style={styles.modalButtons}>
        <Button
          title="Cancel"
          variant="ghost"
          size="md"
          onPress={onClose}
          disabled={loading}
          style={{ flex: 1 }}
        />
        <Button
          title="Accept Changes"
          variant="primary"
          size="md"
          onPress={handleAccept}
          loading={loading}
          style={{ flex: 1 }}
        />
      </View>
    </BaseModal>
  );
};

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    messageBox: {
      backgroundColor: colors.infoLight,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      marginBottom: Spacing.lg,
      borderLeftWidth: 4,
      borderLeftColor: colors.info,
    },
    messageLabel: {
      ...Typography.caption,
      fontWeight: '600',
      color: colors.info,
      marginBottom: Spacing.xs,
    },
    messageText: {
      ...Typography.small,
      color: colors.gray700,
      fontStyle: 'italic',
    },
    goalInfo: {
      marginBottom: Spacing.md,
    },
    infoLabel: {
      ...Typography.caption,
      color: colors.textSecondary,
      marginBottom: Spacing.xs,
    },
    infoText: {
      ...Typography.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    selectorContainer: {
      marginVertical: Spacing.xl,
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
      marginBottom: Spacing.md,
    },
    rangeInfo: {
      marginBottom: Spacing.lg,
    },
    rangeText: {
      ...Typography.caption,
      color: colors.textMuted,
      textAlign: 'center',
    },
    inputGroup: {
      marginBottom: Spacing.lg,
    },
    inputLabel: {
      ...Typography.small,
      fontWeight: '500',
      color: colors.gray700,
      marginBottom: Spacing.sm,
    },
    numberInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    adjustButton: {
      width: 44,
      height: 44,
      borderRadius: BorderRadius.sm,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    adjustButtonDisabled: {
      backgroundColor: colors.gray300,
      opacity: 0.5,
    },
    adjustButtonText: {
      color: colors.white,
      fontSize: Typography.large.fontSize,
      fontWeight: '600',
    },
    adjustButtonTextDisabled: {
      color: colors.textMuted,
    },
    numberInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.gray300,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      ...Typography.subheading,
      textAlign: 'center',
    },
    messageInput: {
      borderWidth: 1,
      borderColor: colors.gray300,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      ...Typography.small,
      minHeight: 80,
      textAlignVertical: 'top',
      marginBottom: Spacing.xl,
    },
    modalButtons: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    errorBox: {
      backgroundColor: colors.errorLight,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      marginBottom: Spacing.lg,
      borderLeftWidth: 4,
      borderLeftColor: colors.error,
    },
    errorText: {
      color: colors.errorDark,
      ...Typography.small,
      fontWeight: '500',
    },
  });

export default React.memo(GoalChangeSuggestionModal);
