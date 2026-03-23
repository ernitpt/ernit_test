import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BaseModal } from './BaseModal';
import { Notification } from '../types';
import { goalService } from '../services/GoalService';
import { notificationService } from '../services/NotificationService';
import { userService } from '../services/userService';
import { logger } from '../utils/logger';
import { sanitizeText } from '../utils/sanitization';
import { Colors, useColors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import Button from './Button';

interface GoalApprovalNotificationProps {
  notification: Notification;
  onActionTaken: () => void;
}

const GoalApprovalNotification: React.FC<GoalApprovalNotificationProps> = ({
  notification,
  onActionTaken,
}) => {
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [approveMessage, setApproveMessage] = useState('');
  const [suggestWeeks, setSuggestWeeks] = useState('');
  const [suggestSessions, setSuggestSessions] = useState('');
  const [suggestMessage, setSuggestMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initialWeeks = notification.data?.initialTargetCount || 0;
  const initialSessions = notification.data?.initialSessionsPerWeek || 0;

  const handleApprove = async () => {
    if (!notification.data?.goalId || !notification.id) return;
    setError(null);
    setLoading(true);
    try {
      const sanitizedApproveMessage = sanitizeText(approveMessage.trim(), 500);
      await goalService.approveGoal(notification.data.goalId, sanitizedApproveMessage || null);

      // Get recipient name and giver name
      // The notification is sent TO the giver, so notification.userId is the giver's ID
      const recipientName = await userService.getUserName(notification.data.recipientId || '');
      const giverName = await userService.getUserName(notification.userId); // The person approving (receiving this notification)
      const experienceTitle = notification.data.experienceTitle || 'the experience';

      // Notify receiver
      await notificationService.createNotification(
        notification.data.recipientId || '',
        'goal_approval_response',
        '✅ Your goal has been approved!',
        sanitizedApproveMessage
            ? `Message from ${giverName}: ${sanitizedApproveMessage}`
            : `${giverName} approved your goal! Time to start your challenge.`,
        {
          goalId: notification.data.goalId,
          giverId: notification.userId, // Use notification.userId as the giver ID
          experienceTitle: experienceTitle,
          senderName: giverName,
        }
      );

      // Delete original notification (force delete since it's being replaced)
      try {
        await notificationService.deleteNotification(notification.id, true);
      } catch (deleteError) {
        logger.warn('Could not delete original notification:', deleteError);
      }

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowApproveModal(false);
      setApproveMessage('');
      onActionTaken();
    } catch (error) {
      logger.error('Error approving goal:', error);
      setError('Failed to approve goal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestChange = async () => {
    if (!notification.data?.goalId || !notification.id) return;
    setSuggestError(null);

    // Use placeholder values as defaults if input is empty
    const weeks = suggestWeeks.trim() ? parseInt(suggestWeeks) : initialWeeks;
    const sessions = suggestSessions.trim() ? parseInt(suggestSessions) : initialSessions;

    if (!weeks || !sessions || weeks <= 0 || sessions <= 0) {
      setSuggestError('Please enter valid numbers for weeks and sessions.');
      return;
    }

    if (weeks < initialWeeks || sessions < initialSessions) {
      setSuggestError('Suggested goal cannot be less than the original goal.');
      return;
    }

    // Validate maximum limits: 5 weeks and 7 sessions per week
    if (weeks > 5) {
      setSuggestError('The maximum duration is 5 weeks.');
      return;
    }
    if (sessions > 7) {
      setSuggestError('The maximum is 7 sessions per week.');
      return;
    }

    setLoading(true);
    try {
      const sanitizedSuggestMessage = sanitizeText(suggestMessage.trim(), 500);
      await goalService.suggestGoalChange(
        notification.data.goalId,
        weeks,
        sessions,
        sanitizedSuggestMessage || undefined
      );

      // Get recipient name, giver name, and experience title
      const recipientName = await userService.getUserName(notification.data.recipientId || '');
      // The notification is for the giver, so notification.userId is the giver's ID
      // Also check if giverId exists in data as fallback (cast to any to access potentially missing field)
      const giverIdForSuggestion = notification.data?.giverId || notification.userId;
      const giverNameForSuggestion = await userService.getUserName(giverIdForSuggestion);
      const experienceTitle = notification.data.experienceTitle || 'the experience';

      // Notify receiver (non-clearable until they respond)
      await notificationService.createNotification(
        notification.data.recipientId || '',
        'goal_change_suggested',
        `💡 ${giverNameForSuggestion} suggested a goal change`,
        '', //suggestMessage.trim() || `${giverName} suggested: ${weeks} weeks, ${sessions} sessions per week`,
        {
          goalId: notification.data.goalId,
          giverId: giverIdForSuggestion,
          senderId: giverIdForSuggestion, // Also include as senderId for consistency
          senderName: giverNameForSuggestion, // Include sender name for display
          experienceTitle: experienceTitle,
          initialTargetCount: initialWeeks,
          initialSessionsPerWeek: initialSessions,
          suggestedTargetCount: weeks,
          suggestedSessionsPerWeek: sessions,
          giverMessage: sanitizedSuggestMessage || '',
        },
        false // Not clearable until receiver responds
      );

      // Delete original notification (force delete since it's being replaced)
      try {
        await notificationService.deleteNotification(notification.id, true);
      } catch (deleteError) {
        logger.warn('Could not delete original notification:', deleteError);
        // Try direct delete as fallback
        try {
          const { doc, deleteDoc: deleteDocFn } = await import('firebase/firestore');
          const { db } = await import('../services/firebase');
          const ref = doc(db, 'notifications', notification.id);
          await deleteDocFn(ref);
        } catch (e) {
          logger.warn('Direct delete also failed:', e);
        }
      }

      setShowSuggestModal(false);
      setSuggestWeeks('');
      setSuggestSessions('');
      setSuggestMessage('');
      onActionTaken();
    } catch (error) {
      logger.error('Error suggesting goal change:', error);
      setSuggestError('Failed to suggest goal change. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{notification.title}</Text>
        <Text style={styles.message}>{notification.message}</Text>
      </View>

      <View style={styles.buttons}>
        <Button
          variant="primary"
          title="Approve"
          onPress={() => setShowApproveModal(true)}
          loading={loading}
          style={styles.buttonFlex}
        />
        <Button
          variant="secondary"
          title="Suggest Change"
          onPress={() => setShowSuggestModal(true)}
          disabled={loading}
          style={styles.buttonFlex}
        />
      </View>

      {/* Approve Modal */}
      <BaseModal
        visible={showApproveModal}
        onClose={() => {
          setShowApproveModal(false);
          setApproveMessage('');
          setError(null);
        }}
        title="Approve Goal"
      >
        <Text style={styles.modalSubtitle}>Add an optional message (optional)</Text>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <TextInput
          style={styles.messageInput}
          placeholder="Your message..."
          value={approveMessage}
          onChangeText={(text) => {
            setApproveMessage(text);
            setError(null);
          }}
          multiline
          numberOfLines={4}
          maxLength={500}
        />
        <View style={styles.modalButtons}>
          <TouchableOpacity
            style={[styles.modalButton, styles.cancelButton]}
            onPress={() => {
              setShowApproveModal(false);
              setApproveMessage('');
              setError(null);
            }}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.confirmButton]}
            onPress={handleApprove}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.confirmButtonText}>Approve</Text>
            )}
          </TouchableOpacity>
        </View>
      </BaseModal>

      {/* Suggest Change Modal */}
      <BaseModal
        visible={showSuggestModal}
        onClose={() => {
          setShowSuggestModal(false);
          setSuggestWeeks('');
          setSuggestSessions('');
          setSuggestMessage('');
          setSuggestError(null);
        }}
        title="Suggest Goal Change"
      >
        <Text style={styles.modalSubtitle}>
          Current: {initialWeeks} weeks, {initialSessions} sessions/week
        </Text>
        {suggestError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{suggestError}</Text>
          </View>
        )}
        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Weeks</Text>
            <TextInput
              style={styles.numberInput}
              placeholder={initialWeeks.toString()}
              value={suggestWeeks}
              onChangeText={(text) => {
                setSuggestWeeks(text.replace(/[^0-9]/g, ''));
                setSuggestError(null);
              }}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Sessions/Week</Text>
            <TextInput
              style={styles.numberInput}
              placeholder={initialSessions.toString()}
              value={suggestSessions}
              onChangeText={(text) => {
                setSuggestSessions(text.replace(/[^0-9]/g, ''));
                setSuggestError(null);
              }}
              keyboardType="numeric"
            />
          </View>
        </View>

        <TextInput
          style={styles.messageInput}
          placeholder="Your message (optional)..."
          value={suggestMessage}
          onChangeText={(text) => {
            setSuggestMessage(text);
            setSuggestError(null);
          }}
          multiline
          numberOfLines={3}
          maxLength={500}
        />

        <View style={styles.modalButtons}>
          <TouchableOpacity
            style={[styles.modalButton, styles.cancelButton]}
            onPress={() => {
              setShowSuggestModal(false);
              setSuggestWeeks('');
              setSuggestSessions('');
              setSuggestMessage('');
              setSuggestError(null);
            }}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.confirmButton]}
            onPress={handleSuggestChange}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.confirmButtonText}>Suggest</Text>
            )}
          </TouchableOpacity>
        </View>
      </BaseModal>
    </View>
  );
};

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.white,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      ...Shadows.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
      overflow: 'hidden',
    },
    content: {
      marginBottom: Spacing.md,
    },
    title: {
      ...Typography.subheading,
      color: colors.textPrimary,
      marginBottom: Spacing.xs,
    },
    message: {
      ...Typography.small,
      color: colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    details: {
      ...Typography.caption,
      color: colors.textMuted,
    },
    buttons: {
      flexDirection: 'row',
      gap: Spacing.xxl,
    },
    buttonFlex: {
      flex: 1,
    },
    modalSubtitle: {
      ...Typography.small,
      color: colors.textSecondary,
      marginBottom: Spacing.lg,
    },
    inputRow: {
      flexDirection: 'row',
      gap: Spacing.md,
      marginBottom: Spacing.lg,
    },
    inputGroup: {
      flex: 1,
    },
    inputLabel: {
      ...Typography.caption,
      color: colors.gray700,
      marginBottom: Spacing.xs,
      fontWeight: '500',
    },
    numberInput: {
      borderWidth: 1,
      borderColor: colors.gray300,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      ...Typography.subheading,
    },
    messageInput: {
      borderWidth: 1,
      borderColor: colors.gray300,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      ...Typography.small,
      minHeight: 80,
      textAlignVertical: 'top',
      marginBottom: Spacing.lg,
    },
    modalButtons: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    modalButton: {
      flex: 1,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.sm,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: colors.backgroundLight,
    },
    confirmButton: {
      backgroundColor: colors.primary,
    },
    cancelButtonText: {
      color: colors.gray700,
      fontWeight: '600',
      ...Typography.body,
    },
    confirmButtonText: {
      color: colors.white,
      fontWeight: '600',
      ...Typography.body,
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

export default GoalApprovalNotification;
