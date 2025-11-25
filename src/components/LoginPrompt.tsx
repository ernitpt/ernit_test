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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { LogIn, UserPlus, X } from 'lucide-react-native';

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

  // Animation values - start at 0 for initial state
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Track previous visible state to prevent restarting animations
  const prevVisibleRef = useRef(false);
  const currentAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Only animate on actual state changes, not on every render
    if (visible === prevVisibleRef.current) return;

    // Stop any running animation before starting a new one
    if (currentAnimationRef.current) {
      currentAnimationRef.current.stop();
      currentAnimationRef.current = null;
    }

    prevVisibleRef.current = visible;

    if (visible) {
      // Reset animation values to starting position for animation in
      scaleAnim.setValue(0);
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
      backdropOpacity.setValue(0);

      // Animate in smoothly - ALL using native driver for 60fps
      const animIn = Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]);

      currentAnimationRef.current = animIn;
      animIn.start(() => {
        currentAnimationRef.current = null;
      });
    } else {
      // Animate out smoothly - ALL using native driver for 60fps
      const animOut = Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 30,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]);

      currentAnimationRef.current = animOut;
      animOut.start(() => {
        currentAnimationRef.current = null;
        // Reset values after animation completes
        scaleAnim.setValue(0);
        fadeAnim.setValue(0);
        slideAnim.setValue(30);
        backdropOpacity.setValue(0);
      });
    }

    // Cleanup function to stop animations on unmount
    return () => {
      if (currentAnimationRef.current) {
        currentAnimationRef.current.stop();
        currentAnimationRef.current = null;
      }
    };
  }, [visible, scaleAnim, fadeAnim, slideAnim, backdropOpacity]);

  const handleClose = () => {
    onClose(); // Just close the popup, don't navigate - animation handled by useEffect
  };

  const handleLogin = () => {
    handleClose();
    setTimeout(() => {
      navigation.navigate('Auth', { mode: 'signin' });
    }, 200);
  };

  const handleSignUp = () => {
    handleClose();
    setTimeout(() => {
      navigation.navigate('Auth', { mode: 'signup' });
    }, 200);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      {/* Animated backdrop with smooth blur transition */}
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity: backdropOpacity,
          }
        ]}
      >
        {/* Web-specific blur effect - simplified for better performance */}
        {Platform.OS === 'web' && visible && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                // @ts-ignore - web-specific style
                backdropFilter: 'blur(8px)',
                // @ts-ignore - web-specific style
                WebkitBackdropFilter: 'blur(8px)',
              },
            ]}
          />
        )}

        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
        />

        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [
                { scale: scaleAnim },
                { translateY: slideAnim },
              ],
              opacity: fadeAnim,
            },
          ]}
          pointerEvents={visible ? "box-none" : "none"}
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
                  colors={['#7C3AED', '#9333EA', '#7C3AED']}
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
                <LogIn color="#7C3AED" size={20} strokeWidth={2.5} />
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
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
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
  iconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
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