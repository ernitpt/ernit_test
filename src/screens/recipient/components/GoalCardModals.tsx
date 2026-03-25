import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { BaseModal } from '../../../components/BaseModal';
import { Share2 } from 'lucide-react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { Colors, useColors } from '../../../config';
import { BorderRadius } from '../../../config/borderRadius';
import { Typography } from '../../../config/typography';
import { Spacing } from '../../../config/spacing';

// ─── CancelSessionModal ─────────────────────────────────────────────

interface CancelSessionModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  message: string;
}

export const CancelSessionModal: React.FC<CancelSessionModalProps> = React.memo(({
  visible,
  onClose,
  onConfirm,
  message,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="Cancel Session?"
      variant="center"
    >
      <Text style={styles.modalSubtitle}>{message}</Text>
      <View style={styles.modalButtons}>
        <TouchableOpacity
          onPress={onClose}
          style={[styles.modalButton, styles.cancelButtonPopup]}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="No"
        >
          <Text style={styles.cancelText}>No</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onConfirm}
          style={[styles.modalButton, styles.confirmButton]}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Yes, cancel"
        >
          <Text style={styles.confirmText}>Yes, cancel</Text>
        </TouchableOpacity>
      </View>
    </BaseModal>
  );
});

// ─── CelebrationModal ───────────────────────────────────────────────

interface CelebrationModalProps {
  visible: boolean;
  onClose: () => void;
  onPostToFeed?: () => void;
  // Feed post preview data
  goalTitle?: string;
  sessionNumber?: number;
  totalSessions?: number;
  progressPct?: number;
  mediaUri?: string | null;
  userName?: string;
  userProfileImageUrl?: string;
  weeklyCount?: number;
  sessionsPerWeek?: number;
  weeksCompleted?: number;
  totalWeeks?: number;
}

export const CelebrationModal: React.FC<CelebrationModalProps> = React.memo(({
  visible,
  onClose,
  onPostToFeed,
  goalTitle,
  sessionNumber,
  totalSessions,
  progressPct,
  mediaUri,
  userName,
  userProfileImageUrl,
  weeklyCount,
  sessionsPerWeek,
  weeksCompleted,
  totalWeeks,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const confettiRef = useRef<ConfettiCannon | null>(null);
  const confettiTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [fullscreenMedia, setFullscreenMedia] = useState(false);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (visible) {
      confettiTimeoutRef.current = setTimeout(() => {
        confettiRef.current?.start();
      }, 200);
    }
    return () => {
      if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current);
    };
  }, [visible]);


  const { width: screenWidth } = Dimensions.get('window');

  return (
    <>
      <BaseModal
        visible={visible}
        onClose={onClose}
        title="Session Complete"
        variant="center"
        noPadding={false}
        overlay={
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <ConfettiCannon
              ref={confettiRef}
              autoStart={false}
              count={120}
              origin={{ x: screenWidth / 2, y: -20 }}
              explosionSpeed={350}
              fallSpeed={3000}
              fadeOut
              colors={[colors.primary, colors.secondary, colors.warning, colors.error, colors.categoryViolet, colors.categoryPink]}
            />
          </View>
        }
      >
        {/* Feed post preview card */}
        <View style={styles.feedPreviewCard}>
          {/* Media at top if present */}
          {mediaUri && (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setFullscreenMedia(true)}
              style={styles.feedMediaWrapper}
            >
              <Image
                source={{ uri: mediaUri }}
                style={styles.feedMediaAdaptive}
                contentFit="cover"
                cachePolicy="memory-disk"
                accessibilityLabel="Session media"
              />
            </TouchableOpacity>
          )}

          {/* Author row */}
          <View style={styles.feedAuthorRow}>
            {userProfileImageUrl ? (
              <Image source={{ uri: userProfileImageUrl }} style={styles.feedAvatar} accessibilityLabel={`${userName || 'User'}'s profile photo`} />
            ) : (
              <View style={[styles.feedAvatar, styles.feedAvatarPlaceholder]}>
                <Text style={styles.feedAvatarText}>
                  {(userName?.[0] || 'U').toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.feedAuthorName} numberOfLines={1}>
                <Text style={{ fontWeight: '500' }}>{userName || 'You'}</Text> completed session
              </Text>
              <Text style={styles.feedTimestamp}>Just now</Text>
            </View>
          </View>

          {/* Capsule progress: sessions this week */}
          {sessionsPerWeek && sessionsPerWeek > 0 && (
            <View style={styles.feedProgressBlock}>
              <View style={styles.feedProgressHeader}>
                <Text style={styles.feedProgressBlockLabel}>Sessions this week</Text>
                <Text style={styles.feedProgressBlockCount}>{weeklyCount || 0}/{sessionsPerWeek}</Text>
              </View>
              <View style={styles.feedCapsuleRow}>
                {Array.from({ length: sessionsPerWeek }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.feedCapsule,
                      i < (weeklyCount || 0)
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.border },
                    ]}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Capsule progress: weeks completed */}
          {totalWeeks && totalWeeks > 0 && (
            <View style={styles.feedProgressBlock}>
              <View style={styles.feedProgressHeader}>
                <Text style={styles.feedProgressBlockLabel}>Weeks completed</Text>
                <Text style={styles.feedProgressBlockCount}>{weeksCompleted || 0}/{totalWeeks}</Text>
              </View>
              <View style={styles.feedCapsuleRow}>
                {Array.from({ length: Math.min(totalWeeks, 20) }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.feedCapsule,
                      i < (weeksCompleted || 0)
                        ? { backgroundColor: colors.secondary }
                        : { backgroundColor: colors.border },
                    ]}
                  />
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Buttons */}
        <View style={styles.celebrationButtons}>
          {onPostToFeed && (
            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => { onPostToFeed(); onClose(); }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Share to Feed"
            >
              <Share2 size={16} color={colors.white} />
              <Text style={styles.shareButtonText}>Share to Feed</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.celebrationCloseBtn}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={onPostToFeed ? 'Skip' : 'Close'}
          >
            <Text style={styles.celebrationCloseBtnText}>
              {onPostToFeed ? 'Skip' : 'Close'}
            </Text>
          </TouchableOpacity>
        </View>
      </BaseModal>


      {/* Fullscreen media viewer */}
      {mediaUri && (
        <BaseModal
          visible={fullscreenMedia}
          onClose={() => setFullscreenMedia(false)}
          variant="center"
          noPadding
        >
          <Image
            source={{ uri: mediaUri }}
            style={styles.fullscreenImage}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        </BaseModal>
      )}
    </>
  );
});

// ─── Styles ─────────────────────────────────────────────────────────

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  // Cancel modal
  modalSubtitle: {
    ...Typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  cancelButtonPopup: {
    backgroundColor: colors.backgroundLight,
  },
  confirmButton: {
    backgroundColor: colors.error,
  },
  cancelText: {
    ...Typography.subheading,
    color: colors.gray700,
  },
  confirmText: {
    ...Typography.subheading,
    color: colors.white,
  },
  // Feed post preview
  feedPreviewCard: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: Spacing.lg,
  },
  feedMediaWrapper: {
    backgroundColor: colors.border,
  },
  feedMediaAdaptive: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.border,
  },
  feedAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  feedAvatar: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.lg,
    backgroundColor: colors.border,
  },
  feedAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  feedAvatarText: {
    ...Typography.caption,
    color: colors.white,
    fontWeight: '700',
  },
  feedAuthorName: {
    ...Typography.caption,
    color: colors.textPrimary,
  },
  feedTimestamp: {
    ...Typography.tiny,
    color: colors.textMuted,
  },
  feedProgressBlock: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  feedProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  feedProgressBlockLabel: {
    ...Typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  feedProgressBlockCount: {
    ...Typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  feedCapsuleRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  feedCapsule: {
    flex: 1,
    height: 7,
    borderRadius: BorderRadius.pill,
  },
  fullscreenImage: {
    width: '100%',
    height: '80%',
  },
  celebrationButtons: {
    gap: Spacing.sm,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
  },
  shareButtonText: {
    ...Typography.body,
    color: colors.white,
    fontWeight: '700',
  },
  celebrationCloseBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  celebrationCloseBtnText: {
    ...Typography.small,
    fontWeight: '600',
    color: colors.textMuted,
  },
});

