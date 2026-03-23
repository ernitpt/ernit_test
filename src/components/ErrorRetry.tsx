import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertCircle, RefreshCw } from 'lucide-react-native';
import { Colors, useColors } from '../config';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import Button from './Button';

type ErrorRetryProps = {
  message?: string;
  onRetry: () => void;
};

const ErrorRetry: React.FC<ErrorRetryProps> = ({
  message = 'Something went wrong',
  onRetry,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <AlertCircle size={32} color={colors.textMuted} />
      <Text style={styles.message}>{message}</Text>
      <Button
        title="Try Again"
        onPress={onRetry}
        variant="primary"
        size="sm"
        icon={<RefreshCw size={16} color={colors.white} />}
        style={{ marginTop: Spacing.xs }}
      />
    </View>
  );
};

export default ErrorRetry;

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.huge,
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.md,
  },
  message: {
    ...Typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
