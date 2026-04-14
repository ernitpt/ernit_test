import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Avatar } from './Avatar';
import { Notification } from '../types';
import { friendService } from '../services/FriendService';
import { notificationService } from '../services/NotificationService';
import { Timestamp } from 'firebase/firestore';
import { logger } from '../utils/logger';
import { Colors, useColors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import { useToast } from '../context/ToastContext';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

interface FriendRequestNotificationProps {
  notification: Notification;
  onRequestHandled: () => void;
}

const FriendRequestNotification: React.FC<FriendRequestNotificationProps> = ({
  notification,
  onRequestHandled,
}) => {
  const { t } = useTranslation();
  const { showSuccess, showError, showInfo } = useToast();
  const [isHandling, setIsHandling] = useState(false);
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleAccept = useCallback(async () => {
    if (!notification.data?.friendRequestId) return;

    try {
      setIsHandling(true);
      await friendService.acceptFriendRequest(notification.data.friendRequestId);

      // Delete the notification after successful handling (force=true to bypass clearable check)
      if (notification.id) {
        await notificationService.deleteNotification(notification.id, true);
      }

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showSuccess(t('notifications.notificationComponents.friendRequest.nowFriends', { name: notification.data.senderName }));
      onRequestHandled();
    } catch (error: unknown) {
      logger.error('Error accepting friend request:', error);
      showError(t('notifications.notificationComponents.friendRequest.acceptFailed'));
    } finally {
      setIsHandling(false);
    }
  }, [notification, onRequestHandled, showSuccess, showError]);

  const handleDecline = useCallback(async () => {
    if (!notification.data?.friendRequestId) return;

    try {
      setIsHandling(true);
      await friendService.declineFriendRequest(notification.data.friendRequestId);

      // Delete the notification after successful handling (force=true to bypass clearable check)
      if (notification.id) {
        await notificationService.deleteNotification(notification.id, true);
      }

      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showInfo(t('notifications.notificationComponents.friendRequest.declined', { name: notification.data.senderName }));
      onRequestHandled();
    } catch (error: unknown) {
      logger.error('Error declining friend request:', error);
      showError(t('notifications.notificationComponents.friendRequest.declineFailed'));
    } finally {
      setIsHandling(false);
    }
  }, [notification, onRequestHandled, showInfo, showError]);

  const senderName = notification.data?.senderName || 'Unknown User';
  const senderCountry = notification.data?.senderCountry || '';
  const senderProfileImageUrl = notification.data?.senderProfileImageUrl;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Avatar uri={senderProfileImageUrl} name={senderName} size="md" />
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{senderName}</Text>
            {senderCountry && (
              <Text style={styles.userCountry}>{senderCountry}</Text>
            )}
          </View>
        </View>
        <Text style={styles.timestamp}>
          {new Date(notification.createdAt instanceof Timestamp ? notification.createdAt.toDate() : notification.createdAt).toLocaleDateString()}
        </Text>
      </View>

      <View style={styles.messageContainer}>
        <Text style={styles.message}>{notification.message}</Text>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.button, styles.declineButton]}
          onPress={handleDecline}
          disabled={isHandling}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.notificationComponents.friendRequest.declineA11y')}
        >
          {isHandling ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.declineButtonText}>{t('notifications.notificationComponents.friendRequest.decline')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.acceptButton]}
          onPress={handleAccept}
          disabled={isHandling}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.notificationComponents.friendRequest.acceptA11y')}
        >
          {isHandling ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.acceptButtonText}>{t('notifications.notificationComponents.friendRequest.accept')}</Text>
          )}
        </TouchableOpacity>
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
      borderLeftColor: colors.info,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: Spacing.md,
    },
    userInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    userDetails: {
      flex: 1,
    },
    userName: {
      ...Typography.subheading,
      color: colors.textPrimary,
      marginBottom: Spacing.xxs,
    },
    userCountry: {
      ...Typography.small,
      color: colors.textSecondary,
    },
    timestamp: {
      ...Typography.caption,
      color: colors.textMuted,
    },
    messageContainer: {
      marginBottom: Spacing.lg,
    },
    message: {
      ...Typography.small,
      color: colors.gray700,
      lineHeight: 20,
    },
    actionButtons: {
      flexDirection: 'row',
      gap: Spacing.xxxl,
    },
    button: {
      flex: 1,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    acceptButton: {
      backgroundColor: colors.successLight,
      marginRight: Spacing.xxl,
    },
    acceptButtonText: {
      color: colors.approveDark,
      ...Typography.small,
      fontWeight: '600',
    },
    declineButton: {
      backgroundColor: colors.errorLight,
      marginLeft: Spacing.xxl,
    },
    declineButtonText: {
      color: colors.declineDark,
      ...Typography.small,
      fontWeight: '600',
    },
  });

export default React.memo(FriendRequestNotification);
