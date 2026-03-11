import React from 'react';
import { View, Text, ViewStyle, StyleSheet } from 'react-native';
import { Colors } from '../config/colors';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import Button from './Button';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export const EmptyState = React.memo<EmptyStateProps>(({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      {icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
      {actionLabel && onAction && (
        <Button
          variant="secondary"
          size="sm"
          title={actionLabel}
          onPress={onAction}
          style={styles.action}
        />
      )}
    </View>
  );
});

EmptyState.displayName = 'EmptyState';

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
  },
  icon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.heading3,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  message: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  action: {
    marginTop: Spacing.sm,
  },
});
