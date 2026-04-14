import React, { useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Image,
  Text,
  StyleSheet,
} from 'react-native';
import { LogOut } from 'lucide-react-native';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { BaseModal } from './BaseModal';
import Button from './Button';

interface LogoutConfirmationProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const LogoutConfirmation: React.FC<LogoutConfirmationProps> = ({
  visible,
  onClose,
  onConfirm,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleClose = () => {
    onClose();
  };

  const handleConfirm = () => {
    onClose();
    // Small delay to let close animation start
    timerRef.current = setTimeout(() => {
      onConfirm();
    }, 100);
  };

  return (
    <BaseModal
      visible={visible}
      onClose={handleClose}
      title={t('modals.logoutConfirmation.title')}
      variant="center"
    >
      {/* Icon */}
      <View style={styles.iconContainer}>
        <Image
          source={require('../assets/favicon.png')}
          style={{ width: 92, height: 92, resizeMode: 'contain' }}
          accessible={false}
        />
      </View>

      <Text style={styles.message}>
        {t('modals.logoutConfirmation.message')}
      </Text>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <Button
          title={t('modals.logoutConfirmation.cancel')}
          variant="secondary"
          size="lg"
          fullWidth
          onPress={handleClose}
        />
        <Button
          title={t('modals.logoutConfirmation.confirm')}
          variant="primary"
          size="lg"
          fullWidth
          gradient
          onPress={handleConfirm}
          icon={<LogOut color={colors.white} size={20} strokeWidth={2.5} />}
        />
      </View>
    </BaseModal>
  );
};

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    iconContainer: {
      alignItems: 'center',
      marginBottom: Spacing.xl,
    },
    message: {
      ...Typography.subheading,
      color: colors.gray600,
      marginBottom: Spacing.xxxl,
      textAlign: 'center',
      lineHeight: 24,
    },
    buttonContainer: {
      gap: Spacing.md,
      marginBottom: Spacing.lg,
    },
  });

export default React.memo(LogoutConfirmation);
