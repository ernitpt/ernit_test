import React, { useMemo } from 'react';
import { View, Text, ViewStyle, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { Colors, useColors } from '../config';
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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <MotiView
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 400 }}
    >
      <View style={[styles.container, style]} accessibilityRole="summary">
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
    </MotiView>
  );
});

EmptyState.displayName = 'EmptyState';

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: Spacing.xxl,
      paddingHorizontal: Spacing.xl,
    },
    icon: {
      fontSize: Typography.emoji.fontSize,
      marginBottom: Spacing.md,
    },
    title: {
      ...Typography.heading3,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    message: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Spacing.lg,
    },
    action: {
      marginTop: Spacing.sm,
    },
  });
