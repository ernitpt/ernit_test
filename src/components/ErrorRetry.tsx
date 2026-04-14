import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  message,
  onRetry,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const displayMessage = message ?? t('errors.retry.defaultMessage');
  return (
    <View style={styles.container} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <AlertCircle size={32} color={colors.textMuted} />
      <Text style={styles.message}>{displayMessage}</Text>
      <Button
        title={t('errors.retry.tryAgain')}
        onPress={onRetry}
        variant="primary"
        size="sm"
        icon={<RefreshCw size={16} color={colors.white} />}
        style={{ marginTop: Spacing.xs, backgroundColor: colors.actionBlue }}
      />
    </View>
  );
};

export default React.memo(ErrorRetry);

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
