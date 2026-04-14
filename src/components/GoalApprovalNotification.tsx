import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
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
  // M8c: Separate loading states so approve and suggest spinners don't bleed into each other
  const [approveLoading, setApproveLoading] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const { t } = useTranslation();
  const colors = useColors();

  // M8a: isMounted guard — prevents setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  // BUG-25: mutual exclusion — prevents handleApprove and handleSuggestChange running concurrently
  const operationInProgressRef = useRef(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initialWeeks = notification.data?.initialTargetCount || 0;
  const initialSessions = notification.data?.initialSessionsPerWeek || 0;

  const handleApprove = async () => {
    if (!notification.data?.goalId || !notification.id) return;
    // BUG-25: mutual exclusion guard
    if (operationInProgressRef.current) return;
    operationInProgressRef.current = true;
    setError(null);
    // BUG-26: guard against empty recipientId before any mutation
    if (!notification.data?.recipientId) {
      setError(t('notifications.notificationComponents.goalApproval.errors.recipientMissing'));
      operationInProgressRef.current = false;
      return;
    }
    setApproveLoading(true); // M8c: use dedicated approve loading state
    try {
      const sanitizedApproveMessage = sanitizeText(approveMessage.trim(), 500);

      // BUG-27: fetch giverName BEFORE any mutation so data is in hand if it throws
      // M8b: recipientName was fetched here but never used — removed to avoid unnecessary read
      // The notification is sent TO the giver, so notification.userId is the giver's ID
      const giverName = await userService.getUserName(notification.userId); // The person approving (receiving this notification)
      const experienceTitle = notification.data.experienceTitle || 'the experience';

      await goalService.approveGoal(notification.data.goalId, sanitizedApproveMessage || null);

      // Notify receiver
      const notifId = await notificationService.createNotification(
        notification.data.recipientId,
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

      // BUG-28: don't delete original notification if recipient notification silently failed
      if (!notifId) {
        setError(t('notifications.notificationComponents.goalApproval.errors.notifyFailed'));
        return;
      }

      // Delete original notification (force delete since it's being replaced)
      try {
        await notificationService.deleteNotification(notification.id, true);
      } catch (deleteError: unknown) {
        logger.warn('Could not delete original notification:', deleteError);
      }

      if (!mountedRef.current) return; // M8a: isMounted guard
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowApproveModal(false);
      setApproveMessage('');
      onActionTaken();
    } catch (error: unknown) {
      logger.error('Error approving goal:', error);
      if (!mountedRef.current) return; // M8a: isMounted guard
      setError(t('notifications.notificationComponents.goalApproval.errors.approveFailed'));
    } finally {
      if (mountedRef.current) setApproveLoading(false); // M8a: isMounted guard
      operationInProgressRef.current = false; // BUG-25: release lock
    }
  };

  const handleSuggestChange = async () => {
    if (!notification.data?.goalId || !notification.id) return;
    // BUG-25: mutual exclusion guard
    if (operationInProgressRef.current) return;
    operationInProgressRef.current = true;
    setSuggestError(null);

    // BUG-26: guard against empty recipientId before any mutation
    if (!notification.data?.recipientId) {
      setSuggestError(t('notifications.notificationComponents.goalApproval.errors.recipientMissing'));
      operationInProgressRef.current = false;
      return;
    }

    // Use placeholder values as defaults if input is empty
    // BUG-30: always pass radix 10 to parseInt
    const weeks = suggestWeeks.trim() ? parseInt(suggestWeeks, 10) : initialWeeks;
    const sessions = suggestSessions.trim() ? parseInt(suggestSessions, 10) : initialSessions;

    if (!weeks || !sessions || weeks <= 0 || sessions <= 0) {
      setSuggestError(t('notifications.notificationComponents.goalApproval.errors.invalidNumbers'));
      operationInProgressRef.current = false; // BUG-25: release lock on early return
      return;
    }

    if (weeks < initialWeeks || sessions < initialSessions) {
      setSuggestError(t('notifications.notificationComponents.goalApproval.errors.cannotReduce'));
      operationInProgressRef.current = false; // BUG-25: release lock on early return
      return;
    }

    // Validate maximum limits: 5 weeks and 7 sessions per week
    if (weeks === initialWeeks && sessions === initialSessions) {
      setSuggestError(t('notifications.notificationComponents.goalApproval.errors.noChanges'));
      operationInProgressRef.current = false; // BUG-25: release lock on early return
      return;
    }

    if (weeks > 5) {
      setSuggestError(t('notifications.notificationComponents.goalApproval.errors.maxWeeks'));
      operationInProgressRef.current = false; // BUG-25: release lock on early return
      return;
    }
    if (sessions > 7) {
      setSuggestError(t('notifications.notificationComponents.goalApproval.errors.maxSessions'));
      operationInProgressRef.current = false; // BUG-25: release lock on early return
      return;
    }

    setSuggestLoading(true); // M8c: use dedicated suggest loading state
    try {
      const sanitizedSuggestMessage = sanitizeText(suggestMessage.trim(), 500);
      await goalService.suggestGoalChange(
        notification.data.goalId,
        weeks,
        sessions,
        sanitizedSuggestMessage || undefined
      );

      // M8b: recipientName was fetched here but never used — removed to avoid unnecessary read
      // The notification is for the giver, so notification.userId is the giver's ID
      // Also check if giverId exists in data as fallback (cast to any to access potentially missing field)
      const giverIdForSuggestion = notification.data?.giverId || notification.userId;
      const giverNameForSuggestion = await userService.getUserName(giverIdForSuggestion);
      const experienceTitle = notification.data.experienceTitle || 'the experience';

      // Notify receiver (non-clearable until they respond)
      const notifId = await notificationService.createNotification(
        notification.data.recipientId,
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

      // BUG-28: don't delete original notification if recipient notification silently failed
      if (!notifId) {
        setSuggestError(t('notifications.notificationComponents.goalApproval.errors.notifyFailed'));
        return;
      }

      // Delete original notification (force delete since it's being replaced)
      try {
        await notificationService.deleteNotification(notification.id, true);
      } catch (deleteError: unknown) {
        logger.warn('Could not delete original notification:', deleteError);
        // Try direct delete as fallback
        try {
          const { doc, deleteDoc: deleteDocFn } = await import('firebase/firestore');
          const { db } = await import('../services/firebase');
          const ref = doc(db, 'notifications', notification.id);
          await deleteDocFn(ref);
        } catch (e: unknown) {
          logger.warn('Direct delete also failed:', e);
        }
      }

      if (!mountedRef.current) return; // M8a: isMounted guard
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowSuggestModal(false);
      setSuggestWeeks('');
      setSuggestSessions('');
      setSuggestMessage('');
      onActionTaken();
    } catch (error: unknown) {
      logger.error('Error suggesting goal change:', error);
      if (!mountedRef.current) return; // M8a: isMounted guard
      setSuggestError(t('notifications.notificationComponents.goalApproval.errors.suggestFailed'));
    } finally {
      if (mountedRef.current) setSuggestLoading(false); // M8a: isMounted guard
      operationInProgressRef.current = false; // BUG-25: release lock
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
          title={t('notifications.notificationComponents.goalApproval.approve')}
          onPress={() => setShowApproveModal(true)}
          loading={approveLoading}
          style={styles.buttonFlex}
        />
        <Button
          variant="secondary"
          title={t('notifications.notificationComponents.goalApproval.suggestChange')}
          onPress={() => setShowSuggestModal(true)}
          disabled={approveLoading || suggestLoading}
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
        title={t('notifications.notificationComponents.goalApproval.approveModal.title')}
      >
        <Text style={styles.modalSubtitle}>{t('notifications.notificationComponents.goalApproval.approveModal.subtitle')}</Text>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <TextInput
          style={styles.messageInput}
          placeholder={t('notifications.notificationComponents.goalApproval.approveModal.placeholder')}
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
            disabled={approveLoading}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.notificationComponents.goalApproval.approveModal.cancelA11y')}
          >
            <Text style={styles.cancelButtonText}>{t('notifications.notificationComponents.goalApproval.approveModal.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.confirmButton]}
            onPress={handleApprove}
            disabled={approveLoading}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.notificationComponents.goalApproval.approveModal.confirmA11y')}
          >
            {approveLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.confirmButtonText}>{t('notifications.notificationComponents.goalApproval.approveModal.confirm')}</Text>
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
        title={t('notifications.notificationComponents.goalApproval.suggestModal.title')}
      >
        <Text style={styles.modalSubtitle}>
          {t('notifications.notificationComponents.goalApproval.suggestModal.currentLabel', { weeks: initialWeeks, sessions: initialSessions })}
        </Text>
        {suggestError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{suggestError}</Text>
          </View>
        )}
        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('notifications.notificationComponents.goalApproval.suggestModal.weeksLabel')}</Text>
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
            <Text style={styles.inputLabel}>{t('notifications.notificationComponents.goalApproval.suggestModal.sessionsLabel')}</Text>
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
          placeholder={t('notifications.notificationComponents.goalApproval.suggestModal.messagePlaceholder')}
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
            disabled={suggestLoading}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.notificationComponents.goalApproval.suggestModal.cancelA11y')}
          >
            <Text style={styles.cancelButtonText}>{t('notifications.notificationComponents.goalApproval.suggestModal.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.confirmButton]}
            onPress={handleSuggestChange}
            disabled={suggestLoading}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.notificationComponents.goalApproval.suggestModal.suggestA11y')}
          >
            {suggestLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.confirmButtonText}>{t('notifications.notificationComponents.goalApproval.suggestModal.suggest')}</Text>
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

export default React.memo(GoalApprovalNotification);
