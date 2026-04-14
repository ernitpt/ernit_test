import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { BaseModal } from '../../../components/BaseModal';
import { Camera, ImageIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Colors, useColors } from '../../../config';
import { vh } from '../../../utils/responsive';
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
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hasMedia = !!capturedMediaUri;

  return (
    <BaseModal
      visible={visible}
      onClose={onSkip}
      title={hasMedia ? t('recipient.sessionMedia.lookingGood') : t('recipient.sessionMedia.captureSession')}
      variant="bottom"
      noPadding={false}
    >
      <Text style={styles.subtitle}>
        {hasMedia
          ? t('recipient.sessionMedia.shareWithFriends')
          : t('recipient.sessionMedia.takePhotoOrVideo')}
      </Text>

      {/* Preview or capture buttons */}
      {hasMedia ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedMediaUri! }} style={styles.previewImage} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={capturedMediaType === 'video' ? 'Captured video preview' : 'Captured photo preview'} />
          {capturedMediaType === 'video' && (
            <View style={styles.previewVideoOverlay}>
              <Text style={styles.previewVideoIcon}>▶</Text>
            </View>
          )}
          <TouchableOpacity style={styles.changeButton} onPress={onCamera} activeOpacity={0.7}>
            <Camera size={16} color={colors.white} />
            <Text style={styles.changeButtonText}>{t('recipient.sessionMedia.change')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.captureButtons}>
          <TouchableOpacity style={styles.captureButton} onPress={onCamera} activeOpacity={0.7} accessibilityLabel={t('recipient.sessionMedia.takePhoto')} accessibilityRole="button">
            <View style={styles.captureIconCircle}>
              <Camera size={24} color={colors.white} />
            </View>
            <Text style={styles.captureButtonText}>{t('recipient.sessionMedia.camera')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureButton} onPress={onGallery} activeOpacity={0.7} accessibilityLabel={t('recipient.sessionMedia.chooseFromGallery')} accessibilityRole="button">
            <View style={[styles.captureIconCircle, { backgroundColor: colors.secondary }]}>
              <ImageIcon size={24} color={colors.white} />
            </View>
            <Text style={styles.captureButtonText}>{t('recipient.sessionMedia.gallery')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Action buttons */}
      <TouchableOpacity
        style={[styles.continueButton, !hasMedia && styles.continueButtonDisabled]}
        onPress={hasMedia ? onContinue : onSkip}
        activeOpacity={0.8}
        accessibilityLabel={hasMedia ? t('recipient.sessionMedia.continue') : t('recipient.sessionMedia.skip')}
        accessibilityRole="button"
      >
        <Text style={styles.continueButtonText}>
          {hasMedia ? t('recipient.sessionMedia.continue') : t('recipient.sessionMedia.skip')}
        </Text>
      </TouchableOpacity>

      {hasMedia && (
        <TouchableOpacity style={styles.skipLink} onPress={onSkip} activeOpacity={0.7}>
          <Text style={styles.skipLinkText}>{t('recipient.sessionMedia.skipWithoutPhoto')}</Text>
        </TouchableOpacity>
      )}
    </BaseModal>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  subtitle: {
    ...Typography.small,
    color: colors.textSecondary,
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
    width: vh(60),
    height: vh(60),
    borderRadius: BorderRadius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  captureButtonText: {
    ...Typography.caption,
    fontWeight: '600',
    color: colors.gray700,
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  previewImage: {
    width: '100%',
    height: vh(200),
    borderRadius: BorderRadius.lg,
    backgroundColor: colors.backgroundLight,
  },
  previewVideoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: vh(200),
    borderRadius: BorderRadius.lg,
    backgroundColor: colors.blackAlpha20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewVideoIcon: {
    color: colors.white,
    ...Typography.display,
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: colors.overlay,
    borderRadius: BorderRadius.xl,
  },
  changeButtonText: {
    ...Typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: colors.textMuted,
  },
  continueButtonText: {
    ...Typography.subheading,
    color: colors.white,
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
    color: colors.textMuted,
  },
});

export default React.memo(SessionMediaPrompt);
