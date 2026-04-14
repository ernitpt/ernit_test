import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { MotiView } from 'moti';
import { Image } from 'expo-image';
import { BaseModal } from '../../../components/BaseModal';
import Button from '../../../components/Button';
import { Avatar } from '../../../components/Avatar';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={t('recipient.goalCardModals.cancelSession.title')}
      variant="center"
    >
      <Text style={styles.modalSubtitle}>{message}</Text>
      <View style={styles.modalButtons}>
        <TouchableOpacity
          onPress={onClose}
          style={[styles.modalButton, styles.cancelButtonPopup]}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('recipient.goalCardModals.cancelSession.no')}
        >
          <Text style={styles.cancelText}>{t('recipient.goalCardModals.cancelSession.no')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onConfirm}
          style={[styles.modalButton, styles.confirmButton]}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('recipient.goalCardModals.cancelSession.yesCancel')}
        >
          <Text style={styles.confirmText}>{t('recipient.goalCardModals.cancelSession.yesCancel')}</Text>
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
  // Weekly celebration tiers
  weekJustCompleted?: boolean;
  completedWeekNumber?: number;
  // Privacy callback: called with 'friends' (share) or 'private' (skip)
  onSessionPrivacy?: (visibility: 'friends' | 'private') => void;
}

export const CelebrationModal: React.FC<CelebrationModalProps> = React.memo(({
  visible,
  onClose,
  onPostToFeed,
  mediaUri,
  userName,
  userProfileImageUrl,
  weeklyCount,
  sessionsPerWeek,
  weeksCompleted,
  totalWeeks,
  weekJustCompleted,
  completedWeekNumber,
  onSessionPrivacy,
}) => {
  const { t } = useTranslation();
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


  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Weekly celebration tier config — use design tokens, no hardcoded hex
  const weekTier = useMemo(() => {
    if (!weekJustCompleted || !completedWeekNumber) return null;
    const n = completedWeekNumber;
    if (n === 1) return { emoji: '🎉', title: t('recipient.goalCardModals.celebration.week1Title'), subtitle: t('recipient.goalCardModals.celebration.week1Subtitle'), confettiCount: 120, confettiColors: null as string[] | null };
    if (n === 2) return { emoji: '🔥', title: t('recipient.goalCardModals.celebration.week2Title'), subtitle: t('recipient.goalCardModals.celebration.week2Subtitle'), confettiCount: 180, confettiColors: null };
    if (n === 3) return { emoji: '⭐', title: t('recipient.goalCardModals.celebration.week3Title'), subtitle: t('recipient.goalCardModals.celebration.week3Subtitle'), confettiCount: 220, confettiColors: [colors.celebrationGold, colors.warning, colors.error, colors.celebrationGold, colors.white] };
    return { emoji: '🏆', title: t('recipient.goalCardModals.celebration.weekNTitle', { n }), subtitle: t('recipient.goalCardModals.celebration.weekNSubtitle'), confettiCount: 280, confettiColors: [colors.celebrationGold, colors.warning, colors.error, colors.celebrationGold, colors.categoryPink, colors.accent] };
  }, [weekJustCompleted, completedWeekNumber, colors]);

  const modalTitle = weekTier ? `${weekTier.emoji} ${t('recipient.goalCardModals.celebration.weekComplete')}` : t('recipient.goalCardModals.celebration.sessionComplete');
  const confettiCount = weekTier ? weekTier.confettiCount : 120;
  const confettiColors = weekTier?.confettiColors ?? [colors.primary, colors.secondary, colors.warning, colors.error, colors.categoryViolet, colors.categoryPink];

  return (
    <>
      <BaseModal
        visible={visible}
        onClose={onClose}
        title={modalTitle}
        variant="center"
        noPadding={false}
        overlayAbove={
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: screenHeight * 2 }}>
              <ConfettiCannon
                ref={confettiRef}
                autoStart={false}
                count={Platform.OS === 'android' ? Math.floor(confettiCount * 0.6) : confettiCount}
                origin={{ x: screenWidth / 2, y: -20 }}
                explosionSpeed={weekTier ? 400 : 350}
                fallSpeed={3000}
                colors={confettiColors}
              />
            </View>
          </View>
        }
      >
        {/* Weekly milestone banner */}
        {weekTier && (
          <MotiView
            from={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 18, stiffness: 200, delay: 300 }}
          >
            <View style={styles.weekMilestoneBanner}>
              <Text style={styles.weekMilestoneEmoji}>{weekTier.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.weekMilestoneTitle}>{weekTier.title}</Text>
                <Text style={styles.weekMilestoneSubtitle}>{weekTier.subtitle}</Text>
              </View>
            </View>
          </MotiView>
        )}

        {/* Feed post preview card */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 300, delay: weekTier ? 400 : 200 }}
        >
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
              <Avatar uri={userProfileImageUrl} name={userName || t('recipient.goalCardModals.celebration.you')} size="sm" />
              <View style={{ flex: 1 }}>
                <Text style={styles.feedAuthorName} numberOfLines={1}>
                  <Text style={{ fontWeight: '500' }}>{userName || t('recipient.goalCardModals.celebration.you')}</Text> {t('recipient.goalCardModals.celebration.completedSession')}
                </Text>
                <Text style={styles.feedTimestamp}>{t('recipient.goalCardModals.celebration.justNow')}</Text>
              </View>
            </View>

            {/* Capsule progress: sessions this week */}
            {sessionsPerWeek && sessionsPerWeek > 0 && (
              <View style={styles.feedProgressBlock}>
                <View style={styles.feedProgressHeader}>
                  <Text style={styles.feedProgressBlockLabel}>{t('recipient.goalCardModals.celebration.sessionsThisWeek')}</Text>
                  <Text style={styles.feedProgressBlockCount}>{weeklyCount || 0}/{sessionsPerWeek}</Text>
                </View>
                <View style={styles.feedCapsuleRow}>
                  {Array.from({ length: sessionsPerWeek }, (_, i) => (
                    <MotiView
                      key={i}
                      from={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ type: 'spring', damping: 15, stiffness: 200, delay: (weekTier ? 500 : 300) + i * 50 }}
                      style={{ flex: 1 }}
                    >
                      <View
                        style={[
                          styles.feedCapsule,
                          i < (weeklyCount || 0)
                            ? { backgroundColor: colors.primary }
                            : { backgroundColor: colors.border },
                        ]}
                      />
                    </MotiView>
                  ))}
                </View>
              </View>
            )}

            {/* Capsule progress: weeks completed */}
            {totalWeeks && totalWeeks > 0 && (
              <View style={styles.feedProgressBlock}>
                <View style={styles.feedProgressHeader}>
                  <Text style={styles.feedProgressBlockLabel}>{t('recipient.goalCardModals.celebration.weeksCompleted')}</Text>
                  <Text style={styles.feedProgressBlockCount}>{weeksCompleted || 0}/{totalWeeks}</Text>
                </View>
                <View style={styles.feedCapsuleRow}>
                  {Array.from({ length: Math.min(totalWeeks, 20) }, (_, i) => (
                    <MotiView
                      key={i}
                      from={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ type: 'spring', damping: 15, stiffness: 200, delay: (weekTier ? 600 : 400) + i * 50 }}
                      style={{ flex: 1 }}
                    >
                      <View
                        style={[
                          styles.feedCapsule,
                          i < (weeksCompleted || 0)
                            ? { backgroundColor: colors.secondary }
                            : { backgroundColor: colors.border },
                        ]}
                      />
                    </MotiView>
                  ))}
                </View>
              </View>
            )}
          </View>
        </MotiView>

        {/* Action buttons */}
        <View style={styles.celebrationButtons}>
          {onPostToFeed && (
            <Button
              variant="primary"
              size="md"
              onPress={() => {
                onSessionPrivacy?.('friends');
                onPostToFeed();
                onClose();
              }}
              title={t('recipient.goalCardModals.celebration.shareToFeed')}
              fullWidth
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              onSessionPrivacy?.('private');
              onClose();
            }}
            title={onPostToFeed ? t('recipient.goalCardModals.celebration.skip') : t('recipient.goalCardModals.celebration.close')}
            fullWidth
          />
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
  weekMilestoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.backgroundLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  weekMilestoneEmoji: {
    fontSize: Typography.emojiBase.fontSize,
    lineHeight: Typography.emojiBase.lineHeight,
  },
  weekMilestoneTitle: {
    ...Typography.subheading,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  weekMilestoneSubtitle: {
    ...Typography.body,
    color: colors.textSecondary,
    marginTop: Spacing.xxs,
  },
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
  privacySelector: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.xxs,
    marginBottom: Spacing.sm,
    gap: Spacing.xxs,
  },
  privacyOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  privacyOptionActive: {
    backgroundColor: colors.primary,
  },
  privacyOptionText: {
    ...Typography.small,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  privacyOptionTextActive: {
    color: colors.white,
  },
});

