import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BaseModal } from './BaseModal';
import Button from './Button';
import { Colors } from '../config/colors';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';

interface ConfirmationDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'default' | 'danger';
  loading?: boolean;
}

export const ConfirmationDialog = React.memo<ConfirmationDialogProps>(({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
  loading = false,
}) => {
  return (
    <BaseModal visible={visible} onClose={onCancel} title={title}>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.actions}>
        <Button
          variant="ghost"
          title={cancelLabel}
          onPress={onCancel}
          style={styles.button}
          disabled={loading}
        />
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          title={confirmLabel}
          onPress={onConfirm}
          style={styles.button}
          loading={loading}
        />
      </View>
    </BaseModal>
  );
});

ConfirmationDialog.displayName = 'ConfirmationDialog';

const styles = StyleSheet.create({
  message: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
  },
  button: {
    flex: 1,
  },
});
