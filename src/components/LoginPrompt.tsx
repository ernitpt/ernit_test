import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import Colors from '../config/colors';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { LogIn, UserPlus, X } from 'lucide-react-native';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { commonStyles } from '../styles/commonStyles';
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
  const slideAnim = useModalAnimation(visible);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={[commonStyles.modalOverlay, { padding: Spacing.xl }]}
        activeOpacity={1}
        onPress={handleClose}
      >
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal card */}
            <View style={styles.modal}>
              {/* Close button */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleClose}
                activeOpacity={0.7}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <View style={styles.closeButtonInner}>
                  <X color={Colors.textSecondary} size={20} />
                </View>
              </TouchableOpacity>

              {/* Icon with gradient background */}
              <View style={styles.iconContainer}>
                <Image
                  source={require('../assets/favicon.png')}
                  style={{ width: 92, height: 92, resizeMode: 'contain' }}
                />
              </View>

              <Text style={styles.title}>Login</Text>
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
            </View>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    width: '100%',
    maxWidth: 400,
  },
  modal: {
    backgroundColor: Colors.surfaceFrosted,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xxxl,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 20,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  closeButtonInner: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.circle,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.heading1,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    textAlign: 'center',
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