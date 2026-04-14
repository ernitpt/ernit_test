import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import { BaseModal } from './BaseModal';
import Button from './Button';
import { Colors, useColors } from '../config';
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
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = 'default',
  loading = false,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const resolvedConfirmLabel = confirmLabel ?? t('common.confirm');
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel');

  return (
    <BaseModal visible={visible} onClose={onCancel} title={title}>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.actions}>
        <Button
          variant="ghost"
          title={resolvedCancelLabel}
          onPress={onCancel}
          style={styles.button}
          disabled={loading}
        />
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          title={resolvedConfirmLabel}
          onPress={onConfirm}
          style={styles.button}
          loading={loading}
        />
      </View>
    </BaseModal>
  );
});

ConfirmationDialog.displayName = 'ConfirmationDialog';

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    message: {
      ...Typography.body,
      color: colors.textSecondary,
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
