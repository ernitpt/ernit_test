import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  Image,
  Platform,
} from 'react-native';
import { Camera, ImageIcon, X } from 'lucide-react-native';
import Colors from '../../../config/colors';

interface SessionMediaPromptProps {
  visible: boolean;
  capturedMediaUri?: string | null;
  capturedMediaType?: 'photo' | 'video' | null;
  onCamera: () => void;
  onGallery: () => void;
  onSkip: () => void;
  onContinue: () => void;
}

const SessionMediaPrompt: React.FC<SessionMediaPromptProps> = ({
  visible,
  capturedMediaUri,
  capturedMediaType,
  onCamera,
  onGallery,
  onSkip,
  onContinue,
}) => {
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(0);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  if (!visible) return null;

  const hasMedia = !!capturedMediaUri;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onSkip}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.container,
            {
              opacity: slideAnim,
              transform: [{
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [60, 0],
                }),
              }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {hasMedia ? 'Looking good!' : 'Capture your session'}
            </Text>
            <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            {hasMedia
              ? 'Share this with your friends on the feed?'
              : 'Take a photo or video to remember this session'}
          </Text>

          {/* Preview or capture buttons */}
          {hasMedia ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: capturedMediaUri! }} style={styles.previewImage} />
              {capturedMediaType === 'video' && (
                <View style={styles.previewVideoOverlay}>
                  <Text style={styles.previewVideoIcon}>▶</Text>
                </View>
              )}
              <TouchableOpacity style={styles.changeButton} onPress={onCamera}>
                <Camera size={16} color="#fff" />
                <Text style={styles.changeButtonText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.captureButtons}>
              <TouchableOpacity style={styles.captureButton} onPress={onCamera} activeOpacity={0.7}>
                <View style={styles.captureIconCircle}>
                  <Camera size={24} color="#fff" />
                </View>
                <Text style={styles.captureButtonText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.captureButton} onPress={onGallery} activeOpacity={0.7}>
                <View style={[styles.captureIconCircle, { backgroundColor: Colors.secondary }]}>
                  <ImageIcon size={24} color="#fff" />
                </View>
                <Text style={styles.captureButtonText}>Gallery</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Action buttons */}
          <TouchableOpacity
            style={[styles.continueButton, !hasMedia && styles.continueButtonDisabled]}
            onPress={hasMedia ? onContinue : onSkip}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>
              {hasMedia ? 'Continue' : 'Skip'}
            </Text>
          </TouchableOpacity>

          {hasMedia && (
            <TouchableOpacity style={styles.skipLink} onPress={onSkip}>
              <Text style={styles.skipLinkText}>Skip without photo</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'web' ? 24 : 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  captureButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 24,
  },
  captureButton: {
    alignItems: 'center',
    gap: 8,
  },
  captureIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  captureButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    backgroundColor: Colors.backgroundLight,
  },
  previewVideoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewVideoIcon: {
    color: '#fff',
    fontSize: 32,
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
  },
  changeButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: Colors.textMuted,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  skipLink: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 4,
  },
  skipLinkText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
});

export default SessionMediaPrompt;
