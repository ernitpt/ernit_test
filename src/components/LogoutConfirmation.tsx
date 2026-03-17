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
import { LogOut, X } from 'lucide-react-native';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { commonStyles } from '../styles/commonStyles';
import Colors from '../config/colors';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
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
  const slideAnim = useModalAnimation(visible);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

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

              <Text style={styles.title}>Logout Confirmation</Text>
              <Text style={styles.message}>
                Are you sure you want to log out? You'll need to sign in again to access your account.
              </Text>

              {/* Buttons */}
              <View style={styles.buttonContainer}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  size="lg"
                  fullWidth
                  onPress={handleClose}
                />
                <Button
                  title="Logout"
                  variant="primary"
                  size="lg"
                  fullWidth
                  gradient
                  onPress={handleConfirm}
                  icon={<LogOut color={Colors.white} size={20} strokeWidth={2.5} />}
                />
              </View>
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
    // Ensure centered on all screen sizes
    alignSelf: 'center',
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
});

export default LogoutConfirmation;

