import React from 'react';
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import Colors from '../config/colors';
import { LogIn, UserPlus, X } from 'lucide-react-native';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { commonStyles } from '../styles/commonStyles';

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

  const handleClose = () => {
    onClose();
  };

  const handleLogin = () => {
    onClose();
    setTimeout(() => {
      navigation.navigate('Auth', { mode: 'signin' });
    }, 100);
  };

  const handleSignUp = () => {
    onClose();
    setTimeout(() => {
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

              <Text style={styles.title}>Login</Text>
              <Text style={styles.message}>{message}</Text>

              {/* Buttons */}
              <View style={styles.buttonContainer}>
                {/* Sign Up Button with gradient */}
                <TouchableOpacity
                  style={styles.primaryButtonWrapper}
                  onPress={handleSignUp}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={Colors.gradientTriple}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryButton}
                  >
                    <UserPlus color="white" size={20} strokeWidth={2.5} />
                    <Text style={styles.primaryButtonText}>Sign Up</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Login Button */}
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleLogin}
                  activeOpacity={0.8}
                >
                  <LogIn color={Colors.primary} size={20} strokeWidth={2.5} />
                  <Text style={styles.secondaryButtonText}>Log In</Text>
                </TouchableOpacity>
              </View>

              {/* Cancel link */}
              <TouchableOpacity
                style={styles.cancelLink}
                onPress={handleClose}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelLinkText}>Maybe later</Text>
              </TouchableOpacity>
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
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 32,
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
    shadowColor: Colors.primary,
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
    backgroundColor: Colors.primarySurface,
    borderWidth: 2,
    borderColor: Colors.primaryTint,
    gap: 8,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.3,
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelLinkText: {
    color: '#9CA3AF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default LoginPrompt;