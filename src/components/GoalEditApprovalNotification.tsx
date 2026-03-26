import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Notification } from '../types';
import { goalService } from '../services/GoalService';
import { notificationService } from '../services/NotificationService';
import { logger } from '../utils/logger';
import { Colors, useColors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import Button from './Button';

interface GoalEditApprovalNotificationProps {
  notification: Notification;
  onActionTaken: () => void;
}

const GoalEditApprovalNotification: React.FC<GoalEditApprovalNotificationProps> = ({
  notification,
  onActionTaken,
}) => {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const requestedWeeks = notification.data?.requestedTargetCount as number | undefined;
  const requestedSessions = notification.data?.requestedSessionsPerWeek as number | undefined;
  const message = notification.data?.message as string | undefined;

  const clearNotification = useCallback(async () => {
    if (!notification.id) return;
    try {
      await notificationService.deleteNotification(notification.id, true);
    } catch (err) {
      logger.warn('Could not delete goal_edit_request notification:', err);
    }
  }, [notification.id]);

  const handleApprove = useCallback(async () => {
    if (!notification.data?.goalId) return;
    setError(null);
    setLoading('approve');
    try {
      await goalService.approveGoalEditRequest(notification.data.goalId as string);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await clearNotification();
      onActionTaken();
    } catch (err: unknown) {
      logger.error('Error approving goal edit request:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : 'Failed to approve. Please try again.');
    } finally {
      setLoading(null);
    }
  }, [notification.data?.goalId, clearNotification, onActionTaken]);

  const handleReject = useCallback(async () => {
    if (!notification.data?.goalId) return;
    setError(null);
    setLoading('reject');
    try {
      await goalService.rejectGoalEditRequest(notification.data.goalId as string);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await clearNotification();
      onActionTaken();
    } catch (err: unknown) {
      logger.error('Error rejecting goal edit request:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : 'Failed to decline. Please try again.');
    } finally {
      setLoading(null);
    }
  }, [notification.data?.goalId, clearNotification, onActionTaken]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{notification.title}</Text>
        {requestedWeeks !== undefined && requestedSessions !== undefined && (
          <Text style={styles.details}>
            Requested: {requestedWeeks} week{requestedWeeks !== 1 ? 's' : ''},{' '}
            {requestedSessions} session{requestedSessions !== 1 ? 's' : ''}/week
          </Text>
        )}
        {message ? (
          <View style={styles.messageBox}>
            <Text style={styles.messageLabel}>Message:</Text>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.buttons}>
        <Button
          variant="primary"
          title="Approve"
          onPress={handleApprove}
          loading={loading === 'approve'}
          disabled={loading !== null}
          style={styles.buttonFlex}
        />
        <Button
          variant="secondary"
          title="Decline"
          onPress={handleReject}
          loading={loading === 'reject'}
          disabled={loading !== null}
          style={styles.buttonFlex}
        />
      </View>
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
    details: {
      ...Typography.caption,
      color: colors.textMuted,
      marginTop: Spacing.sm,
    },
    messageBox: {
      backgroundColor: colors.infoLight,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      marginTop: Spacing.sm,
      borderLeftWidth: 4,
      borderLeftColor: colors.accent,
    },
    messageLabel: {
      ...Typography.caption,
      fontWeight: '600',
      color: colors.accent,
      marginBottom: Spacing.xs,
    },
    messageText: {
      ...Typography.caption,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    errorBox: {
      backgroundColor: colors.errorLight,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      marginTop: Spacing.sm,
      borderLeftWidth: 4,
      borderLeftColor: colors.error,
    },
    errorText: {
      color: colors.errorDark,
      ...Typography.caption,
      fontWeight: '500',
    },
    buttons: {
      flexDirection: 'row',
      gap: Spacing.xxl,
    },
    buttonFlex: {
      flex: 1,
    },
  });

export default React.memo(GoalEditApprovalNotification);
