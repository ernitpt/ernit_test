import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LogOut, X } from 'lucide-react-native';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { commonStyles } from '../styles/commonStyles';

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

  const handleClose = () => {
    onClose();
  };

  const handleConfirm = () => {
    onClose();
    // Small delay to let close animation start
    setTimeout(() => {
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
        style={[commonStyles.modalOverlay, { padding: 20 }]}
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
              >
                <View style={styles.closeButtonInner}>
                  <X color="#6B7280" size={20} />
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
                {/* Confirm Logout Button with gradient */}
                <TouchableOpacity
                  style={styles.primaryButtonWrapper}
                  onPress={handleConfirm}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={['#7C3AED', '#9333EA', '#7C3AED']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryButton}
                  >
                    <LogOut color="white" size={20} strokeWidth={2.5} />
                    <Text style={styles.primaryButtonText}>Logout</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Cancel Button */}
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
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
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#7C3AED',
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonContainer: {
    gap: 12,
    marginBottom: 16,
  },
  primaryButtonWrapper: {
    borderRadius: 12,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.3,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#F5F3FF',
    borderWidth: 2,
    borderColor: '#E9D5FF',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#7C3AED',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.3,
  },
});

export default LogoutConfirmation;

