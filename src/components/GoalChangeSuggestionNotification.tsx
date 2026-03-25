import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Notification, Goal } from '../types';
import { goalService } from '../services/GoalService';
import { notificationService } from '../services/NotificationService';
import { userService } from '../services/userService';
import GoalChangeSuggestionModal from './GoalChangeSuggestionModal';
import { logger } from '../utils/logger';
import { Colors, useColors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import Button from './Button';

interface GoalChangeSuggestionNotificationProps {
  notification: Notification;
  onActionTaken: () => void;
}

const GoalChangeSuggestionNotification: React.FC<GoalChangeSuggestionNotificationProps> = ({
  notification,
  onActionTaken,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const suggestedWeeks = notification.data?.suggestedTargetCount || 0;
  const suggestedSessions = notification.data?.suggestedSessionsPerWeek || 0;

  const handleAcceptSuggestion = async () => {
    if (!notification.data?.goalId || !notification.id) return;
    setError(null);
    setLoading(true);

    try {
      // Fetch goal to get current values if not already loaded
      let currentGoal = goal;
      if (!currentGoal) {
        currentGoal = await goalService.getGoalById(notification.data.goalId);
        if (currentGoal) {
          setGoal(currentGoal);
        }
      }

      if (!currentGoal || !currentGoal.id) {
        setError('Could not load goal. Please try again.');
        setLoading(false);
        return;
      }

      // Verify user is the goal recipient before accepting
      if (!currentGoal.userId) {
        setError('Goal is missing user information. Please try again.');
        setLoading(false);
        return;
      }

      // Accept the suggestion as-is
      const updated = await goalService.respondToGoalSuggestion(
        notification.data.goalId,
        suggestedWeeks,
        suggestedSessions,
        undefined
      );

      // Notify giver
      // Get recipient ID: use notification.userId (the recipient, since the notification is for them) or goal.userId or notification.data.recipientId
      const recipientId = currentGoal.userId || notification.userId || notification.data.recipientId || '';
      // Get giver ID from notification data or use senderId as fallback
      const giverIdForNotification = notification.data?.giverId || notification.data?.senderId || '';
      const receiverName = await userService.getUserName(recipientId);
      await notificationService.createNotification(
        giverIdForNotification,
        'goal_approval_response',
        `✅ ${receiverName} accepted your goal suggestion`,
        `${receiverName} accepted your suggestion: ${suggestedWeeks} weeks, ${suggestedSessions} sessions per week`,
        {
          goalId: notification.data.goalId,
          recipientId: recipientId,
          giverId: giverIdForNotification,
        }
      );

      // Delete the notification (force delete after action is taken)
      try {
        await notificationService.deleteNotification(notification.id, true);
      } catch (deleteError) {
        logger.warn('Could not delete notification:', deleteError);
      }

      onActionTaken();
    } catch (error: unknown) {
      logger.error('Error accepting suggestion:', error);
      setError(error instanceof Error ? error.message : 'Failed to accept suggestion. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = async () => {
    if (!notification.data?.goalId) return;
    setError(null);

    try {
      // Fetch goal if not already loaded
      if (!goal) {
        const fetchedGoal = await goalService.getGoalById(notification.data.goalId);
        if (fetchedGoal) {
          setGoal(fetchedGoal);
          setShowModal(true);
        } else {
          setError('Could not load goal. Please try again.');
        }
      } else {
        setShowModal(true);
      }
    } catch (error: unknown) {
      logger.error('Error loading goal:', error);
      setError('Could not load goal. Please try again.');
    }
  };

  const handleGoalUpdated = async (_updatedGoal: Goal) => {
    // Delete the notification after goal is updated (force delete after action is taken)
    if (notification.id) {
      try {
        await notificationService.deleteNotification(notification.id, true);
      } catch (deleteError) {
        logger.warn('Could not delete notification:', deleteError);
        // Try direct delete as fallback
        try {
          const { doc, deleteDoc: deleteDocFn } = await import('firebase/firestore');
          const { db } = await import('../services/firebase');
          const ref = doc(db, 'notifications', notification.id);
          await deleteDocFn(ref);
        } catch (e: unknown) {
          logger.warn('Direct delete failed:', e);
        }
      }
    }

    setShowModal(false);
    onActionTaken();
  };

  // Load goal on mount if not already loaded
  useEffect(() => {
    if (!goal && notification.data?.goalId) {
      goalService.getGoalById(notification.data.goalId)
        .then((fetchedGoal) => {
          if (fetchedGoal) {
            setGoal(fetchedGoal);
          }
        })
        .catch((error) => {
          logger.error('Error loading goal:', error);
          // Don't set error here, just log it - user might not need it until they click
        });
    }
  }, [notification.data?.goalId]);

  return (
    <>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>{notification.title}</Text>
          {/* <Text style={styles.message}>{notification.message}</Text> */}
          {notification.data?.giverMessage && (
            <View style={styles.messageBox}>
              <Text style={styles.messageLabel}>Message from {notification.data?.senderName || 'giver'}:</Text>
              <Text style={styles.messageText}>{notification.data.giverMessage}</Text>
            </View>
          )}
          <Text style={styles.details}>
            Suggested: {suggestedWeeks} weeks, {suggestedSessions} sessions per week
          </Text>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>

        <View style={styles.buttons}>
          <Button
            variant="primary"
            title="Accept"
            onPress={handleAcceptSuggestion}
            loading={loading}
            style={styles.buttonFlex}
          />
          <Button
            variant="secondary"
            title="Change"
            onPress={handleOpenModal}
            disabled={loading}
            style={styles.buttonFlex}
          />
        </View>
      </View>

      {/* Goal Change Suggestion Modal */}
      {goal && (
        <GoalChangeSuggestionModal
          visible={showModal}
          goal={goal}
          onClose={() => setShowModal(false)}
          onGoalUpdated={handleGoalUpdated}
        />
      )}
    </>
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
      borderLeftColor: colors.accent,
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
    messageBox: {
      backgroundColor: colors.infoLight,
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
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
    details: {
      ...Typography.caption,
      color: colors.textMuted,
      marginTop: Spacing.sm,
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

export default React.memo(GoalChangeSuggestionNotification);
