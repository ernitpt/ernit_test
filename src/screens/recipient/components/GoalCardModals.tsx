import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native';
import { BaseModal } from '../../../components/BaseModal';
import { Share2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ConfettiCannon from 'react-native-confetti-cannon';
import Colors from '../../../config/colors';
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

export const CancelSessionModal: React.FC<CancelSessionModalProps> = ({
  visible,
  onClose,
  onConfirm,
  message,
}) => {
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
};

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

export const CelebrationModal: React.FC<CelebrationModalProps> = ({
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
  const confettiRef = useRef<ConfettiCannon | null>(null);
  const confettiTimeoutRef = useRef<NodeJS.Timeout>();
  const [fullscreenMedia, setFullscreenMedia] = useState(false);

  // Cleanup confetti timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (visible) {
      // Fire confetti after a brief delay
      confettiTimeoutRef.current = setTimeout(() => {
        confettiRef.current?.start();
      }, 200);
    }
    return () => {
      if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current);
    };
  }, [visible]);


  return (
    <>
      <BaseModal
        visible={visible}
        onClose={onClose}
        title="Session Complete"
        variant="center"
        noPadding={false}
      >
        {/* Confetti Cannon */}
        <ConfettiCannon
          ref={confettiRef}
          autoStart={false}
          count={80}
          origin={{ x: -10, y: 0 }}
          explosionSpeed={350}
          fallSpeed={2500}
          fadeOut
          colors={[Colors.primary, Colors.secondary, Colors.warning, Colors.error, Colors.categoryViolet, Colors.categoryPink]}
        />

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
                resizeMode="cover"
              />
            </TouchableOpacity>
          )}

          {/* Author row */}
          <View style={styles.feedAuthorRow}>
            {userProfileImageUrl ? (
              <Image source={{ uri: userProfileImageUrl }} style={styles.feedAvatar} />
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
                        ? { backgroundColor: Colors.primary }
                        : { backgroundColor: Colors.border },
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
                        ? { backgroundColor: Colors.secondary }
                        : { backgroundColor: Colors.border },
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
              <Share2 size={16} color={Colors.white} />
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
            resizeMode="contain"
          />
        </BaseModal>
      )}
    </>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Cancel modal
  modalSubtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
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
    backgroundColor: Colors.backgroundLight,
  },
  confirmButton: {
    backgroundColor: Colors.error,
  },
  cancelText: {
    ...Typography.subheading,
    color: Colors.gray700,
  },
  confirmText: {
    ...Typography.subheading,
    color: Colors.white,
  },
  // Feed post preview
  feedPreviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  feedMediaWrapper: {
    backgroundColor: Colors.border,
  },
  feedMediaAdaptive: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: Colors.border,
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
    backgroundColor: Colors.border,
  },
  feedAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
  },
  feedAvatarText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: '700',
  },
  feedAuthorName: {
    ...Typography.caption,
    color: Colors.textPrimary,
  },
  feedTimestamp: {
    ...Typography.tiny,
    color: Colors.textMuted,
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
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  feedProgressBlockCount: {
    ...Typography.caption,
    color: Colors.textPrimary,
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
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
  },
  shareButtonText: {
    ...Typography.body,
    color: Colors.white,
    fontWeight: '700',
  },
  celebrationCloseBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  celebrationCloseBtnText: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.textMuted,
  },
});

