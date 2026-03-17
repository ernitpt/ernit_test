import React, { useRef, useEffect, useState } from 'react';
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
import { BorderRadius } from '../../../config/borderRadius';
import { Typography } from '../../../config/typography';
import { Spacing } from '../../../config/spacing';

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
  const [shouldRender, setShouldRender] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      slideAnim.setValue(0);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setShouldRender(false);
      });
    }
  }, [visible, slideAnim]);

  if (!shouldRender) return null;

  const hasMedia = !!capturedMediaUri;

  return (
    <Modal
      visible={shouldRender}
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
            <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close" accessibilityRole="button">
              <X size={20} color={Colors.textMuted} />
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
                <Camera size={16} color={Colors.white} />
                <Text style={styles.changeButtonText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.captureButtons}>
              <TouchableOpacity style={styles.captureButton} onPress={onCamera} activeOpacity={0.7} accessibilityLabel="Take photo" accessibilityRole="button">
                <View style={styles.captureIconCircle}>
                  <Camera size={24} color={Colors.white} />
                </View>
                <Text style={styles.captureButtonText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.captureButton} onPress={onGallery} activeOpacity={0.7} accessibilityLabel="Choose from gallery" accessibilityRole="button">
                <View style={[styles.captureIconCircle, { backgroundColor: Colors.secondary }]}>
                  <ImageIcon size={24} color={Colors.white} />
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
            accessibilityLabel={hasMedia ? "Continue" : "Skip"}
            accessibilityRole="button"
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
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.xxl,
    paddingBottom: Platform.OS === 'web' ? Spacing.xxl : Spacing.huge,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    ...Typography.large,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
  },
  captureButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xxxl,
    marginBottom: Spacing.xxl,
  },
  captureButton: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  captureIconCircle: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  captureButtonText: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.gray700,
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.backgroundLight,
  },
  previewVideoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.blackAlpha20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewVideoIcon: {
    color: Colors.white,
    ...Typography.display,
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.overlay,
    borderRadius: BorderRadius.xl,
  },
  changeButtonText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: Colors.textMuted,
  },
  continueButtonText: {
    ...Typography.subheading,
    color: Colors.white,
  },
  skipLink: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
    minHeight: 44,
  },
  skipLinkText: {
    ...Typography.small,
    color: Colors.textMuted,
  },
});

export default SessionMediaPrompt;
