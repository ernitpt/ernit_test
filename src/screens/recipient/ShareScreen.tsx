import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  Switch,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Goal, ExperienceGift, SessionRecord } from '../../types';
import { useApp } from '../../context/AppContext';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import Button from '../../components/Button';
import { Colors, useColors } from '../../config';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { BorderRadius } from '../../config/borderRadius';
import SharedHeader from '../../components/SharedHeader';
import { useToast } from '../../context/ToastContext';
import { analyticsService } from '../../services/AnalyticsService';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ShareScreenRouteProp = RouteProp<RootStackParamList, 'ShareGoal'>;

type CardTheme = 'light' | 'dark';
type CardFormat = 'story' | 'post';

interface CardColors {
  bg: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  accent: string;
  gold: string;
  surface: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getCardColors(theme: CardTheme): CardColors {
  if (theme === 'dark') {
    return {
      bg: '#141414',
      text: '#F9FAFB',
      textSecondary: '#9CA3AF',
      textMuted: '#6B7280',
      border: '#2E2E2E',
      primary: '#22C55E',
      accent: '#86EFAC',
      gold: '#FBBF24',
      surface: '#1C1C1C',
    };
  }
  return {
    bg: '#FAFAF5',
    text: '#111827',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    border: '#E5E7EB',
    primary: '#166534',
    accent: '#22C55E',
    gold: '#FBBF24',
    surface: '#F3F4F6',
  };
}

function formatTotalTime(sessions: SessionRecord[]): string {
  const totalSeconds = sessions.reduce((acc, s) => acc + (s.duration ?? 0), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function hasDurationData(sessions: SessionRecord[]): boolean {
  return sessions.some((s) => typeof s.duration === 'number' && s.duration > 0);
}

// ─── PillToggle ────────────────────────────────────────────────────────────────

function PillToggle({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: any) => void;
}) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.backgroundLight,
        borderRadius: BorderRadius.pill,
        padding: 4,
      }}
    >
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => onChange(opt.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === opt.value }}
          style={{
            flex: 1,
            paddingVertical: Spacing.sm,
            borderRadius: BorderRadius.pill,
            alignItems: 'center',
            backgroundColor: value === opt.value ? colors.white : 'transparent',
          }}
        >
          <Text
            style={[
              Typography.smallBold,
              { color: value === opt.value ? colors.textPrimary : colors.textSecondary },
            ]}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── ShareCardContent ──────────────────────────────────────────────────────────

interface ShareCardContentProps {
  cardColors: CardColors;
  format: CardFormat;
  goal: Goal;
  experienceGift: ExperienceGift | undefined;
  sessions: SessionRecord[];
  sessionStreak: number;
  showSessions: boolean;
  showWeeks: boolean;
  showStreak: boolean;
  showTotalTime: boolean;
  showReward: boolean;
}

const ShareCardContent = React.memo(function ShareCardContent({
  cardColors,
  format,
  goal,
  experienceGift,
  sessions,
  sessionStreak,
  showSessions,
  showWeeks,
  showStreak,
  showTotalTime,
  showReward,
}: ShareCardContentProps) {
  const { t } = useTranslation();
  const cardWidth = 1080;
  const cardHeight = format === 'story' ? 1920 : 1080;

  // Compute enabled stats
  const totalSessions = goal.sessionsPerWeek * goal.targetCount;
  const weeks = goal.targetCount;
  const totalTimeStr = hasDurationData(sessions) ? formatTotalTime(sessions) : null;

  const statsEnabled: { value: string; label: string; isGold?: boolean }[] = [];
  if (showSessions) statsEnabled.push({ value: String(totalSessions), label: t('recipient.share.cardStatSessions') });
  if (showWeeks) statsEnabled.push({ value: String(weeks), label: t('recipient.share.cardStatWeeks') });
  if (showStreak && sessionStreak >= 3) statsEnabled.push({ value: String(sessionStreak), label: t('recipient.share.cardStatStreak'), isGold: true });
  if (showTotalTime && totalTimeStr) statsEnabled.push({ value: totalTimeStr, label: t('recipient.share.cardStatTotalTime') });

  // Resolve reward image
  const rewardImageUrl =
    experienceGift?.pledgedExperience?.coverImageUrl ||
    experienceGift?.pledgedExperience?.imageUrl?.[0] ||
    null;
  const rewardTitle =
    experienceGift?.pledgedExperience?.title || null;
  const rewardSubtitle =
    experienceGift?.pledgedExperience?.subtitle || null;

  const shouldShowReward = showReward && !!experienceGift && !!rewardTitle;

  return (
    <View
      style={{
        width: cardWidth,
        height: cardHeight,
        backgroundColor: cardColors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 100,
        paddingVertical: 100,
      }}
    >
      {/* Brand — logo + text */}
      <Image
        source={require('../../assets/icon.png')}
        style={{ width: 120, height: 120, marginBottom: 24 }}
        contentFit="contain"
      />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Text
          style={{
            fontSize: 64,
            fontWeight: '900',
            fontStyle: 'italic',
            color: cardColors.text,
            letterSpacing: -2,
          }}
        >
          {'ernit'}
        </Text>
        <Text
          style={{
            fontSize: 64,
            fontWeight: '900',
            fontStyle: 'italic',
            color: cardColors.primary,
            letterSpacing: -2,
          }}
        >
          {'.'}
        </Text>
      </View>

      {/* Spacer */}
      <View style={{ height: 60 }} />

      {/* GOAL COMPLETED label */}
      <Text
        style={{
          fontSize: 28,
          fontWeight: '700',
          color: cardColors.textMuted,
          letterSpacing: 6,
          textTransform: 'uppercase',
        }}
      >
        {t('recipient.share.cardGoalCompleted')}
      </Text>

      {/* Spacer */}
      <View style={{ height: 30 }} />

      {/* Goal title */}
      <Text
        style={{
          fontSize: 56,
          fontWeight: '700',
          color: cardColors.text,
          textAlign: 'center',
          maxWidth: 880,
        }}
        numberOfLines={3}
      >
        {goal.title}
      </Text>

      {/* Spacer */}
      <View style={{ height: 60 }} />

      {/* Stats row */}
      {statsEnabled.length > 0 && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: cardColors.surface,
            borderRadius: 30,
            paddingVertical: 40,
            paddingHorizontal: 80,
            gap: 0,
          }}
        >
          {statsEnabled.map((stat, index) => (
            <React.Fragment key={stat.label}>
              {index > 0 && (
                <View
                  style={{
                    width: 2,
                    height: 80,
                    backgroundColor: cardColors.border,
                    marginHorizontal: 30,
                  }}
                />
              )}
              <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: index > 0 ? 0 : 0 }}>
                <Text
                  style={{
                    fontSize: 80,
                    fontWeight: '800',
                    color: stat.isGold ? cardColors.gold : cardColors.text,
                    lineHeight: 96,
                  }}
                >
                  {stat.value}
                </Text>
                <Text
                  style={{
                    fontSize: 28,
                    fontWeight: '600',
                    color: cardColors.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: 3,
                  }}
                >
                  {stat.label}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Spacer */}
      {statsEnabled.length > 0 && <View style={{ height: 60 }} />}

      {/* Reward section */}
      {shouldShowReward && (
        <View
          style={{
            width: 700,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: cardColors.border,
            backgroundColor: cardColors.surface,
            overflow: 'hidden',
            alignSelf: 'center',
          }}
        >
          {rewardImageUrl ? (
            <Image
              source={{ uri: rewardImageUrl }}
              style={{ width: 700, height: 350 }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 700,
                height: 350,
                backgroundColor: cardColors.border,
              }}
            />
          )}
          <View style={{ padding: 30 }}>
            <Text
              style={{
                fontSize: 36,
                fontWeight: '700',
                color: cardColors.text,
              }}
              numberOfLines={2}
            >
              {rewardTitle}
            </Text>
            {rewardSubtitle ? (
              <Text
                style={{
                  fontSize: 28,
                  color: cardColors.textSecondary,
                  marginTop: 8,
                }}
                numberOfLines={2}
              >
                {rewardSubtitle}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {/* Footer (absolute) */}
      <View
        style={{
          position: 'absolute',
          bottom: 80,
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'flex-end',
        }}
      >
        <Text
          style={{
            fontSize: 36,
            fontWeight: '800',
            fontStyle: 'italic',
            color: cardColors.textMuted,
          }}
        >
          {'ernit'}
        </Text>
        <Text
          style={{
            fontSize: 36,
            fontWeight: '800',
            fontStyle: 'italic',
            color: cardColors.primary,
          }}
        >
          {'.'}
        </Text>
      </View>
    </View>
  );
});

// ─── Main Screen ───────────────────────────────────────────────────────────────

function ShareScreen() {
  const { t } = useTranslation();
  const route = useRoute<ShareScreenRouteProp>();
  const navigation = useNavigation();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state } = useApp();
  const { showError, showSuccess } = useToast();
  const { width: screenW } = useWindowDimensions();

  const { goal, experienceGift, sessions = [], sessionStreak = 0 } = route.params;

  // ─── Card state ────────────────────────────────────────────────────
  const [format, setFormat] = useState<CardFormat>('story');
  const [cardTheme, setCardTheme] = useState<CardTheme>('dark');

  // ─── Stats toggles ─────────────────────────────────────────────────
  const [showSessions, setShowSessions] = useState(true);
  const [showWeeks, setShowWeeks] = useState(true);
  const [showStreak, setShowStreak] = useState(true);
  const [showTotalTime, setShowTotalTime] = useState(true);
  const [showReward, setShowReward] = useState(true);

  // ─── Share state ───────────────────────────────────────────────────
  const [isSharing, setIsSharing] = useState(false);
  const shareCardRef = useRef<View>(null);

  // ─── Derived values ────────────────────────────────────────────────
  const cardColors = useMemo(() => getCardColors(cardTheme), [cardTheme]);
  const cardH = format === 'story' ? 1920 : 1080;
  // Scale preview to fit ~40% of screen width (not full width) so controls are visible
  const previewW = Math.min(screenW * 0.55, 300);
  const previewScale = previewW / 1080;
  const hasStreak = sessionStreak >= 3;
  const hasTotalTime = useMemo(() => hasDurationData(sessions), [sessions]);
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ─── Shared card props ─────────────────────────────────────────────
  const cardProps: ShareCardContentProps = {
    cardColors,
    format,
    goal,
    experienceGift,
    sessions,
    sessionStreak,
    showSessions,
    showWeeks,
    showStreak: showStreak && hasStreak,
    showTotalTime: showTotalTime && hasTotalTime,
    showReward,
  };

  // ─── Share handler ─────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    if (!shareCardRef.current || isSharing) return;
    setIsSharing(true);
    try {
      if (Platform.OS === 'web') {
        const uri = await captureRef(shareCardRef, {
          format: 'png',
          quality: 1,
          result: 'data-uri',
        });
        const res = await fetch(uri);
        const blob = await res.blob();
        const file = new File([blob], 'ernit-achievement.png', { type: 'image/png' });
        const nav = navigator as any;
        if (nav.canShare?.({ files: [file] })) {
          await nav.share({
            files: [file],
            title: 'My Achievement',
            text: 'Check out my achievement on Ernit!',
          });
        } else {
          const a = document.createElement('a');
          a.href = uri;
          a.download = 'ernit-achievement.png';
          a.click();
          showSuccess(t('recipient.share.imageSaved'));
        }
      } else {
        const uri = await captureRef(shareCardRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
        });
        const available = await Sharing.isAvailableAsync();
        if (available) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: t('recipient.share.shareDialogTitle'),
          });
        } else {
          showError(t('recipient.share.sharingUnavailable'));
        }
      }
      analyticsService.trackEvent('share_goal_completed', 'social', { format });
    } catch (e: any) {
      if (e?.message !== 'Share was dismissed') {
        showError(t('recipient.share.shareError'));
      }
    } finally {
      setIsSharing(false);
    }
  }, [isSharing, format, showError, showSuccess]);

  return (
    <ErrorBoundary screenName="ShareScreen" userId={state.user?.id}>
        <StatusBar style="auto" />
        <View style={styles.container}>
          <SharedHeader title={t('recipient.share.screenTitle')} showBack />

          {/* ─── Preview ─────────────────────────────────────────── */}
          <View style={styles.previewWrapper}>
            <View
              style={{
                width: previewW,
                height: cardH * previewScale,
                overflow: 'hidden',
                borderRadius: BorderRadius.md,
                alignSelf: 'center',
              }}
            >
              <View
                style={{
                  width: 1080,
                  height: cardH,
                  transform: [{ scale: previewScale }],
                  // @ts-ignore — transformOrigin is valid on web and newer RN
                  transformOrigin: 'top left',
                }}
              >
                <ShareCardContent {...cardProps} />
              </View>
            </View>
          </View>

          {/* ─── Controls ─────────────────────────────────────────── */}
          <ScrollView
            style={styles.controlsScroll}
            contentContainerStyle={[
              styles.controlsContent,
              { paddingBottom: insets.bottom + Spacing.xxl },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Format toggle */}
            <View style={styles.controlRow}>
              <Text style={[Typography.smallBold, { color: colors.textSecondary }]}>{t('recipient.share.formatLabel')}</Text>
              <View style={styles.toggleContainer}>
                <PillToggle
                  options={[
                    { label: t('recipient.share.formatStory'), value: 'story' },
                    { label: t('recipient.share.formatPost'), value: 'post' },
                  ]}
                  value={format}
                  onChange={setFormat}
                />
              </View>
            </View>

            {/* Theme toggle */}
            <View style={styles.controlRow}>
              <Text style={[Typography.smallBold, { color: colors.textSecondary }]}>{t('recipient.share.themeLabel')}</Text>
              <View style={styles.toggleContainer}>
                <PillToggle
                  options={[
                    { label: t('recipient.share.themeLight'), value: 'light' },
                    { label: t('recipient.share.themeDark'), value: 'dark' },
                  ]}
                  value={cardTheme}
                  onChange={setCardTheme}
                />
              </View>
            </View>

            <View style={styles.divider} />

            {/* Stats toggles */}
            <Text style={[Typography.captionBold, styles.sectionLabel]}>{t('recipient.share.statsSectionLabel')}</Text>

            <View style={styles.switchRow}>
              <Text style={[Typography.body, { color: colors.textPrimary }]}>{t('recipient.share.statSessions')}</Text>
              <Switch
                value={showSessions}
                onValueChange={setShowSessions}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.white}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={[Typography.body, { color: colors.textPrimary }]}>{t('recipient.share.statWeeks')}</Text>
              <Switch
                value={showWeeks}
                onValueChange={setShowWeeks}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.white}
              />
            </View>

            {hasStreak && (
              <View style={styles.switchRow}>
                <Text style={[Typography.body, { color: colors.textPrimary }]}>{t('recipient.share.statStreak')}</Text>
                <Switch
                  value={showStreak}
                  onValueChange={setShowStreak}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor={colors.white}
                />
              </View>
            )}

            {hasTotalTime && (
              <View style={styles.switchRow}>
                <Text style={[Typography.body, { color: colors.textPrimary }]}>{t('recipient.share.statTotalTime')}</Text>
                <Switch
                  value={showTotalTime}
                  onValueChange={setShowTotalTime}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor={colors.white}
                />
              </View>
            )}

            {/* Reward toggle */}
            {!!experienceGift && (
              <>
                <View style={styles.divider} />
                <Text style={[Typography.captionBold, styles.sectionLabel]}>{t('recipient.share.rewardSectionLabel')}</Text>
                <View style={styles.switchRow}>
                  <Text style={[Typography.body, { color: colors.textPrimary }]}>{t('recipient.share.showReward')}</Text>
                  <Switch
                    value={showReward}
                    onValueChange={setShowReward}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor={colors.white}
                  />
                </View>
              </>
            )}

            <View style={styles.divider} />

            {/* Share button */}
            <View style={{ paddingTop: Spacing.md, paddingBottom: Spacing.xl }}>
              <Button
                variant="primary"
                title={isSharing ? t('recipient.share.sharingButton') : t('recipient.share.shareButton')}
                onPress={handleShare}
                disabled={isSharing}
                loading={isSharing}
                fullWidth
              />
            </View>
          </ScrollView>
        </View>

        {/* ─── Off-screen capture target ───────────────────────── */}
        <View
          ref={shareCardRef}
          style={styles.offScreen}
          collapsable={false}
        >
          <ShareCardContent {...cardProps} />
        </View>
    </ErrorBoundary>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.white,
    },
    previewWrapper: {
      paddingVertical: Spacing.lg,
      paddingHorizontal: Spacing.xxl,
      backgroundColor: colors.backgroundLight,
      alignItems: 'center',
    },
    controlsScroll: {
      flex: 1,
    },
    controlsContent: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.lg,
      gap: Spacing.md,
    },
    controlRow: {
      gap: Spacing.sm,
    },
    toggleContainer: {
      // fills available width
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: Spacing.xs,
    },
    sectionLabel: {
      color: colors.textMuted,
      letterSpacing: 1,
      marginBottom: Spacing.xs,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Spacing.sm,
    },
    offScreen: {
      position: 'absolute',
      left: -9999,
      top: 0,
    },
  });

export default ShareScreen;
