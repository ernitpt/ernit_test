import React, { useRef } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import Colors from '../config/colors';
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
  message = 'Please log in to continue.',
}) => {
  const navigation = useNavigation<LoginPromptNavigationProp>();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

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
      title="Login"
      variant="center"
    >
      {/* Icon */}
      <View style={styles.iconContainer}>
        <Image
          source={require('../assets/favicon.png')}
          style={{ width: 92, height: 92, resizeMode: 'contain' }}
        />
      </View>

      <Text style={styles.message}>{message}</Text>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <Button
          title="Sign Up Free"
          variant="primary"
          size="lg"
          fullWidth
          gradient
          onPress={handleSignUp}
          icon={<UserPlus color={Colors.white} size={20} strokeWidth={2.5} />}
        />
        <Button
          title="Log In"
          variant="secondary"
          size="lg"
          fullWidth
          onPress={handleLogin}
          icon={<LogIn color={Colors.primary} size={20} strokeWidth={2.5} />}
        />
      </View>

      {/* Cancel link */}
      <Button
        title="Maybe Later"
        variant="ghost"
        size="sm"
        onPress={handleClose}
        style={styles.cancelLink}
      />
    </BaseModal>
  );
};

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  message: {
    ...Typography.subheading,
    color: Colors.gray600,
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

export default LoginPrompt;