import React, { useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Image,
  Text,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { LogIn, UserPlus } from 'lucide-react-native';
import { BaseModal } from './BaseModal';
import Button from './Button';

type LoginPromptNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface LoginPromptProps {
  visible: boolean;
  onClose: () => void;
  message?: string;
}

const LoginPrompt: React.FC<LoginPromptProps> = ({
  visible,
  onClose,
  message,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const displayMessage = message ?? t('loginPrompt.defaultMessage');

  const navigation = useNavigation<LoginPromptNavigationProp>();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleClose = () => {
    onClose();
  };

  const handleLogin = () => {
    onClose();
    timerRef.current = setTimeout(() => {
      navigation.navigate('Auth', { mode: 'signin' });
    }, 100);
  };

  const handleSignUp = () => {
    onClose();
    timerRef.current = setTimeout(() => {
      navigation.navigate('Auth', { mode: 'signup' });
    }, 100);
  };

  return (
    <BaseModal
      visible={visible}
      onClose={handleClose}
      title={t('loginPrompt.title')}
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

      <Text style={styles.message}>{displayMessage}</Text>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <Button
          title={t('loginPrompt.signUpFree')}
          variant="primary"
          size="lg"
          fullWidth
          gradient
          onPress={handleSignUp}
          icon={<UserPlus color={colors.white} size={20} strokeWidth={2.5} />}
        />
        <Button
          title={t('loginPrompt.logIn')}
          variant="secondary"
          size="lg"
          fullWidth
          onPress={handleLogin}
          icon={<LogIn color={colors.primary} size={20} strokeWidth={2.5} />}
        />
      </View>

      {/* Cancel link */}
      <Button
        title={t('loginPrompt.maybeLater')}
        variant="ghost"
        size="sm"
        onPress={handleClose}
        style={styles.cancelLink}
      />
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
    cancelLink: {
      alignSelf: 'center',
      marginTop: Spacing.sm,
    },
  });

export default React.memo(LoginPrompt);
