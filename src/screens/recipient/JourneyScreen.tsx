import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLocalDate, formatRelativeTime } from '../../utils/i18nHelpers';
import { formatCurrency } from '../../utils/helpers';
import {
  View, Text, ScrollView, StyleSheet, Animated, Easing, TouchableOpacity,
  Platform, Linking, RefreshControl, Share, useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useRoute } from '@react-navigation/native';
import { doc, onSnapshot, collection, getDocs, query, limit, where, Timestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { Goal, ExperienceGift, SessionRecord, Motivation, Experience, PersonalizedHint, PartnerUser } from '../../types';

type HintEntry = PersonalizedHint | {
  id?: string;
  session: number;
  hint?: string;
  date: number;
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  giverName?: string;
  createdAt?: Date;
  type?: PersonalizedHint['type'];
  duration?: number;
  forSessionNumber?: number;
};
import { useRootNavigation } from '../../types/navigation';
import { generateCouponForGoal } from '../../services/CouponService';
import { isSelfGifted } from '../../types';
import DetailedGoalCard from './DetailedGoalCard';
import { goalService, normalizeGoal } from '../../services/GoalService';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { experienceService } from '../../services/ExperienceService';
import { partnerService } from '../../services/PartnerService';
import { userService } from '../../services/userService';
import { sessionService } from '../../services/SessionService';
import { motivationService } from '../../services/MotivationService';
import SharedHeader from '../../components/SharedHeader';
import { FOOTER_HEIGHT } from '../../components/CustomTabBar';
import AudioPlayer from '../../components/AudioPlayer';
import ImageViewer from '../../components/ImageViewer';
import { SessionCardSkeleton } from '../../components/SkeletonLoader';
import { Card } from '../../components/Card';
import { BookingCalendar } from '../../components/BookingCalendar';
import { Clock, PlayCircle, Gift, ShoppingBag, Copy, CheckCircle, Ticket, MessageCircle, Mail, Sparkles, Share as ShareIcon, TrendingUp, Zap, Timer, Activity, Lock, Flame } from 'lucide-react-native';
import { getFlameHex } from '../../utils/streakColor';
import { logger } from '../../utils/logger';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import ErrorRetry from '../../components/ErrorRetry';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { useToast } from '../../context/ToastContext';
import { Video, ResizeMode } from 'expo-av';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { vh } from '../../utils/responsive';
import { toJSDate } from '../../utils/GoalHelpers';
import Button from '../../components/Button';
import { analyticsService } from '../../services/AnalyticsService';

// ─── Shared Helpers ──────────────────────────────────────────────────────────
const fmtDurationShort = (secs: number): string => {
  if (secs < 60) return `${secs}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
};

// fmtTimeAgo replaced by formatRelativeTime(dateMs, t) from i18nHelpers

// ─── Segmented Tab Control ───────────────────────────────────────────────────
const TAB_SESSIONS = 'Sessions';
const TAB_HINTS = 'Hints';
type TabKey = typeof TAB_SESSIONS | typeof TAB_HINTS;

const SegmentedControl = React.memo(({
  activeTab,
  onTabChange,
}: {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) => {
  const { t } = useTranslation();
  const colors = useColors();
  const segStyles = useMemo(() => createSegStyles(colors), [colors]);
  const slideAnim = useRef(new Animated.Value(activeTab === TAB_SESSIONS ? 0 : 1)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeTab === TAB_SESSIONS ? 0 : 1,
      useNativeDriver: false,
      damping: 18,
      stiffness: 200,
    }).start();
  }, [activeTab]);

  return (
    <View style={segStyles.container}>
      <Animated.View
        style={[
          segStyles.slider,
          {
            left: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['2%', '50%'],
            }),
          },
        ]}
      />
      {[TAB_SESSIONS, TAB_HINTS].map((tab) => {
        const tabLabel = tab === TAB_SESSIONS ? t('recipient.journey.tabs.sessions') : t('recipient.journey.tabs.hints');
        return (
          <TouchableOpacity
            key={tab}
            style={segStyles.tab}
            onPress={() => onTabChange(tab as TabKey)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('recipient.journey.tabs.a11y', { label: tabLabel })}
          >
            <Text
              style={[
                segStyles.tabLabel,
                activeTab === tab && segStyles.tabLabelActive,
              ]}
            >
              {tabLabel}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

const createSegStyles = (colors: typeof Colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.xxs,
    marginBottom: Spacing.lg,
    position: 'relative',
  },
  slider: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: '48%',
    backgroundColor: colors.white,
    borderRadius: BorderRadius.sm,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    zIndex: 1,
  },
  tabLabel: {
    ...Typography.smallBold,
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.primaryDark,
  },
});

// ─── Session Card ────────────────────────────────────────────────────────────
const SessionCard = React.memo(({
  session,
  index,
  motivations = [],
  isExpanded,
  onToggleExpand,
  onImagePress,
}: {
  session: SessionRecord;
  index: number;
  motivations?: Motivation[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onImagePress: (uri: string) => void;
}) => {
  const { t } = useTranslation();
  const colors = useColors();
  const sessStyles = useMemo(() => createSessStyles(colors), [colors]);
  const anim = useRef(new Animated.Value(0)).current;
  const [motivationsExpanded, setMotivationsExpanded] = useState(false);
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      delay: index * 80,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, []);

  const fmtDate = (d: Date) =>
    new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const fmtTime = (d: Date) =>
    new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const fmtDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  const handleCardTap = () => {
    onToggleExpand();
  };

  const toggleMotivations = () => {
    setMotivationsExpanded(!motivationsExpanded);
  };

  useEffect(() => {
    if (!isExpanded && videoRef.current) {
      videoRef.current.pauseAsync().catch(() => {});
    }
  }, [isExpanded]);

  return (
    <Animated.View
      style={[
        sessStyles.card,
        motivations.length > 0 && sessStyles.cardWithMotivations,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <TouchableOpacity onPress={handleCardTap} activeOpacity={0.9}>
        <View style={sessStyles.cardMain}>
          {/* Left: session badge */}
          <View style={sessStyles.badge}>
            <Text style={sessStyles.badgeText}>#{session.sessionNumber}</Text>
          </View>

          {/* Middle: details */}
          <View style={sessStyles.details}>
            <Text style={sessStyles.date}>
              {fmtDate(session.timestamp)} · {fmtTime(session.timestamp)}
            </Text>
            <View style={sessStyles.metaRow}>
              <Clock size={13} color={colors.textSecondary} />
              <Text style={sessStyles.metaText}>{fmtDuration(session.duration)}</Text>
              <Text style={sessStyles.weekBadge}>{t('recipient.journey.sessionCard.week', { number: session.weekNumber + 1 })}</Text>
            </View>
          </View>

          {/* Right: privacy + media thumbnail */}
          {session.visibility === 'private' && !session.mediaUrl && (
            <Lock size={14} color={colors.textMuted} accessibilityLabel={t('recipient.journey.sessionCard.privateA11y')} />
          )}
          {session.mediaUrl && (
            <View style={sessStyles.thumb}>
              <Image source={{ uri: session.mediaUrl }} style={sessStyles.thumbImg} accessibilityLabel={session.mediaType === 'video' ? 'Session video thumbnail' : 'Session photo'} cachePolicy="memory-disk" contentFit="cover" />
              {session.mediaType === 'video' && (
                <View style={sessStyles.videoOverlay}>
                  <PlayCircle size={18} color={colors.white} />
                </View>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Expanded content */}
      {isExpanded && (session.mediaUrl || session.notes) && (
        <MotiView
          from={{ opacity: 0, translateY: -10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 15 }}
        >
          {/* Media Section */}
          {session.mediaUrl && (
            <>
              <View style={sessStyles.expandedDivider} />
              <View style={sessStyles.expandedMediaContainer}>
                {session.mediaType === 'video' ? (
                  <Video
                    ref={videoRef}
                    source={{ uri: session.mediaUrl }}
                    style={sessStyles.expandedMedia}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    isLooping={false}
                    shouldPlay={false}
                  />
                ) : (
                  <TouchableOpacity
                    onPress={() => onImagePress(session.mediaUrl!)}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={t('recipient.journey.sessionCard.viewPhotoA11y')}
                  >
                    <Image
                      source={{ uri: session.mediaUrl }}
                      style={sessStyles.expandedMedia}
                      contentFit="cover" cachePolicy="memory-disk"
                    />
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Notes Section */}
          {session.notes && (
            <>
              <View style={sessStyles.expandedDivider} />
              <View style={sessStyles.notesContainer}>
                <Text style={sessStyles.notesLabel}>{t('recipient.journey.sessionCard.notesLabel')}</Text>
                <Text style={sessStyles.notesText}>{session.notes}</Text>
              </View>
            </>
          )}
          {/* Per-session share button */}
          {session.mediaUrl && session.mediaType === 'photo' && Platform.OS !== 'web' && (
            <>
              <View style={sessStyles.expandedDivider} />
              <TouchableOpacity
                style={sessStyles.sessionShareBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('recipient.journey.sessionCard.shareA11y', { number: session.sessionNumber })}
                onPress={async () => {
                  Haptics.selectionAsync();
                  try {
                    await Share.share({
                      url: session.mediaUrl!,
                      message: `Session #${session.sessionNumber} 💪 #Ernit #GoalProgress`,
                    });
                  } catch {
                    // User cancelled — no-op
                  }
                }}
              >
                <ShareIcon size={14} color={colors.textSecondary} />
                <Text style={sessStyles.sessionShareText}>{t('recipient.journey.sessionCard.shareText')}</Text>
              </TouchableOpacity>
            </>
          )}
        </MotiView>
      )}

      {/* Inline motivations */}
      {motivations.length > 0 && (
        <>
          <TouchableOpacity
            style={sessStyles.motivationToggle}
            onPress={toggleMotivations}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={motivationsExpanded ? t('recipient.journey.sessionCard.hideMotivationsA11y') : t('recipient.journey.sessionCard.showMotivationsA11y')}
          >
            <MessageCircle size={14} color={colors.primary} />
            <Text style={sessStyles.motivationToggleText}>
              {t('plurals.motivations', { count: motivations.length })}
            </Text>
          </TouchableOpacity>

          {motivationsExpanded && (
            <View style={sessStyles.motivationList}>
              {motivations.map((m) => (
                <View key={m.id} style={sessStyles.motivationItem}>
                  {m.authorProfileImage ? (
                    <Image source={{ uri: m.authorProfileImage }} style={sessStyles.motivationAvatar} accessibilityLabel={`${m.authorName || 'Friend'}'s profile photo`} cachePolicy="memory-disk" contentFit="cover" />
                  ) : (
                    <View style={sessStyles.motivationAvatarPlaceholder}>
                      <Text style={sessStyles.motivationAvatarText}>
                        {(m.authorName || 'F')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={sessStyles.motivationContent}>
                    <View style={sessStyles.motivationHeader}>
                      <Text style={sessStyles.motivationAuthor}>{m.authorName}</Text>
                      <Text style={sessStyles.motivationDate}>
                        {new Date(m.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                    <Text style={sessStyles.motivationMessage}>{m.message}</Text>
                    {m.imageUrl && (
                      <Image
                        source={{ uri: m.imageUrl }}
                        style={sessStyles.motivationImage}
                        contentFit="cover" cachePolicy="memory-disk"
                      />
                    )}
                    {m.audioUrl && (
                      <AudioPlayer uri={m.audioUrl} duration={m.audioDuration} variant="popup" />
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </Animated.View>
  );
});

const createSessStyles = (colors: typeof Colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: colors.backgroundLight,
    shadowColor: colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardWithMotivations: {
    borderColor: colors.primaryBorder,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  badgeText: {
    ...Typography.smallBold,
    color: colors.primary,
  },
  details: { flex: 1 },
  date: {
    ...Typography.smallBold,
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metaText: {
    ...Typography.caption,
    color: colors.textSecondary,
    marginRight: Spacing.sm,
  },
  weekBadge: {
    ...Typography.tiny,
    color: colors.primary,
    backgroundColor: colors.primarySurface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: BorderRadius.xs,
    overflow: 'hidden',
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    marginLeft: Spacing.sm,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.backgroundLight,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  motivationToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  motivationToggleText: {
    ...Typography.captionBold,
    color: colors.primary,
  },
  motivationList: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  motivationItem: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: colors.primarySurface,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  motivationAvatar: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.lg,
  },
  motivationAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.lg,
    backgroundColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  motivationAvatarText: {
    ...Typography.captionBold,
    color: colors.primary,
  },
  motivationContent: {
    flex: 1,
  },
  motivationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xxs,
  },
  motivationAuthor: {
    ...Typography.captionBold,
    color: colors.textPrimary,
  },
  motivationDate: {
    ...Typography.tiny,
    color: colors.textMuted,
  },
  motivationMessage: {
    ...Typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  motivationImage: {
    width: '100%',
    height: vh(150),
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
    backgroundColor: colors.backgroundLight,
  },
  sessionShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  sessionShareText: {
    ...Typography.captionBold,
    color: colors.textSecondary,
  },
  expandedDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: Spacing.md,
  },
  expandedMediaContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  expandedMedia: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: BorderRadius.md,
    backgroundColor: colors.backgroundLight,
  },
  notesContainer: {
    paddingVertical: Spacing.xs,
  },
  notesLabel: {
    ...Typography.captionBold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  notesText: {
    ...Typography.small,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});

// ─── Hint Item ───────────────────────────────────────────────────────────────
// ─── Week Divider ───────────────────────────────────────────────────────────
const WeekDivider = React.memo(({ label }: { label: string }) => {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.md, gap: Spacing.sm }}>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      <Text style={{ ...Typography.caption, color: colors.textMuted }}>{label}</Text>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
    </View>
  );
});

// ─── Session Stats Bar ──────────────────────────────────────────────────────
const formatTotalTime = (secs: number): string => {
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
};

const formatAvgDuration = (secs: number): string => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
};

interface StatPillProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const StatPill = React.memo(({ icon, label, value }: StatPillProps) => {
  const colors = useColors();
  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        backgroundColor: colors.backgroundLight,
        borderRadius: BorderRadius.lg,
        marginRight: Spacing.sm,
        minWidth: 80,
        gap: Spacing.xs,
      }}
    >
      {icon}
      <Text style={{ ...Typography.displayLg, color: colors.textPrimary }}>
        {value}
      </Text>
      <Text style={{ ...Typography.caption, color: colors.textSecondary, textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  );
});

const SessionStatsBar = React.memo(({ sessions, hideSessions = false }: { sessions: SessionRecord[]; hideSessions?: boolean }) => {
  const { t } = useTranslation();
  const colors = useColors();

  const stats = useMemo(() => {
    if (sessions.length === 0) return null;
    const totalTime = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
    const avgDuration = Math.round(totalTime / sessions.length);
    const longest = Math.max(...sessions.map(s => s.duration || 0));
    // Calculate current streak (consecutive days)
    const sortedDates = sessions
      .map(s => {
        const d = s.timestamp ? toJSDate(s.timestamp) : (s.createdAt ? toJSDate(s.createdAt) : null);
        return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() : 0;
      })
      .filter(Boolean)
      .sort((a, b) => b - a);

    let streak = 0;
    const DAY = 86400000;
    const today = new Date();
    const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const uniqueDays = [...new Set(sortedDates)];

    if (uniqueDays.length > 0) {
      // Start from today or yesterday
      const firstDay = uniqueDays[0];
      if (firstDay === todayMs || firstDay === todayMs - DAY) {
        streak = 1;
        for (let i = 1; i < uniqueDays.length; i++) {
          if (uniqueDays[i - 1] - uniqueDays[i] === DAY) {
            streak++;
          } else {
            break;
          }
        }
      }
    }

    return { totalTime, avgDuration, longest, streak };
  }, [sessions]);

  if (!stats || sessions.length === 0) return null;

  return (
    <View style={{ marginBottom: Spacing.md }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs }}
      >
        {!hideSessions && (
          <StatPill
            icon={<Activity size={16} color={colors.primary} />}
            value={String(sessions.length)}
            label={t('recipient.journey.stats.sessions')}
          />
        )}
        {stats.avgDuration > 0 && (
          <StatPill
            icon={<Timer size={16} color={colors.secondary} />}
            value={formatAvgDuration(stats.avgDuration)}
            label={t('recipient.journey.stats.avg')}
          />
        )}
        {stats.longest > 0 && (
          <StatPill
            icon={<TrendingUp size={16} color={colors.warning} />}
            value={formatAvgDuration(stats.longest)}
            label={t('recipient.journey.stats.longest')}
          />
        )}
        {stats.totalTime > 0 && (
          <StatPill
            icon={<Clock size={16} color={colors.categoryViolet} />}
            value={formatTotalTime(stats.totalTime)}
            label={t('recipient.journey.stats.total')}
          />
        )}
        {stats.streak > 1 && (
          <StatPill
            icon={<Zap size={16} color={colors.celebrationGold} />}
            value={`${stats.streak}🔥`}
            label={t('recipient.journey.stats.streak')}
          />
        )}
      </ScrollView>
    </View>
  );
});

const HintItem = React.memo(({
  hint,
  index,
  fmtDateTime: fmt,
  onImagePress,
}: {
  hint: HintEntry;
  index: number;
  fmtDateTime: (ts: number) => string;
  onImagePress: (uri: string) => void;
}) => {
  const { t } = useTranslation();
  const colors = useColors();
  const hintStyles = useMemo(() => createHintStyles(colors), [colors]);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 350,
      delay: index * 100,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, []);

  const isAudio = hint.type === 'audio' || hint.type === 'mixed';
  const hasImage = hint.imageUrl || (hint.type === 'mixed' && hint.imageUrl);
  const text = hint.text || hint.hint;

  const parsedDate = hint.createdAt ? toJSDate(hint.createdAt) : null;
  const dateMs = parsedDate?.getTime() ?? hint.date ?? 0;

  const sessionNum = ('forSessionNumber' in hint ? hint.forSessionNumber : undefined) || ('session' in hint ? hint.session : 0) || 0;

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
        ],
        paddingVertical: Spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      {sessionNum > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.xs }}>
          <View style={{ backgroundColor: colors.primaryLight, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.xs, paddingVertical: Spacing.xxs }}>
            <Text style={{ ...Typography.captionBold, color: colors.primary }}>
              💡 {t('recipient.journey.hint.sessionLabel', { number: sessionNum })}
            </Text>
          </View>
          {dateMs > 0 && (
            <Text style={{ ...Typography.caption, color: colors.textSecondary }}>
              {t('recipient.journey.hint.sent', { time: formatRelativeTime(dateMs, t) })}
            </Text>
          )}
        </View>
      ) : (
        <Text style={{ ...Typography.bodyBold, color: colors.textPrimary, marginBottom: Spacing.xs }}>
          {fmt(dateMs)}
        </Text>
      )}

      {hasImage && hint.imageUrl && (
        <TouchableOpacity
          onPress={() => onImagePress(hint.imageUrl!)}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={t('recipient.journey.hint.viewImageA11y')}
        >
          <Image source={{ uri: hint.imageUrl }} style={hintStyles.hintImage} accessibilityLabel={t('recipient.journey.hint.imageA11y')} cachePolicy="memory-disk" contentFit="cover" />
        </TouchableOpacity>
      )}

      {text && (
        <Text
          style={{
            color: colors.gray700,
            ...Typography.body,
            marginBottom: isAudio ? Spacing.sm : 0,
          }}
        >
          {text}
        </Text>
      )}

      {isAudio && hint.audioUrl && (
        <AudioPlayer uri={hint.audioUrl} duration={hint.duration} />
      )}
    </Animated.View>
  );
});

const createHintStyles = (colors: typeof Colors) => StyleSheet.create({
  hintImage: {
    width: '100%',
    height: vh(200),
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    backgroundColor: colors.backgroundLight,
  },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
const JourneyScreen = () => {
  const { t } = useTranslation();
  const navigation = useRootNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const routeParams = route.params as { goal?: Goal } | undefined;
  const passedGoal = routeParams?.goal;
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cStyles = useMemo(() => createCStyles(colors), [colors]);

  const [currentGoal, setCurrentGoal] = useState<Goal | null>(passedGoal || null);
  const [experienceGift, setExperienceGift] = useState<ExperienceGift | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [allImageUris, setAllImageUris] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>(TAB_SESSIONS);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [motivations, setMotivations] = useState<Motivation[]>([]);
  const [recommendedExperiences, setRecommendedExperiences] = useState<Experience[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // Completed goal state
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isPhoneCopied, setIsPhoneCopied] = useState(false);
  const [isEmailCopied, setIsEmailCopied] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [partner, setPartner] = useState<PartnerUser | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [userName, setUserName] = useState<string>('User');
  const [showCalendar, setShowCalendar] = useState(false);
  const [bookingMethod, setBookingMethod] = useState<'whatsapp' | 'email' | null>(null);
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const phoneTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const emailTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const bookingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const isMountedRef = useRef(true);
  const tabScrollRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();
  const [error, setError] = useState(false);
  const { showSuccess, showError, showInfo } = useToast();

  // Redirect if no goal
  useEffect(() => {
    if (!passedGoal) {
      logger.warn('No goal passed to JourneyScreen, redirecting to Goals');
      navigation.navigate('Goals');
    }
  }, [passedGoal, navigation]);

  // Cleanup copy/booking timeouts on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (phoneTimeoutRef.current) clearTimeout(phoneTimeoutRef.current);
      if (emailTimeoutRef.current) clearTimeout(emailTimeoutRef.current);
      if (bookingTimeoutRef.current) clearTimeout(bookingTimeoutRef.current);
    };
  }, []);

  // Track mount state to guard async setState calls
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Keep goal synced with Firestore
  useEffect(() => {
    if (!currentGoal?.id) return;
    let isMounted = true;
    const ref = doc(db, 'goals', currentGoal.id);
    const unsub = onSnapshot(ref, async (snap) => {
      if (!isMounted) return;
      if (snap.exists()) {
        const updatedGoal = normalizeGoal({ id: snap.id, ...snap.data() });
        if (!isMounted) return;
        setCurrentGoal(updatedGoal);
        if (
          updatedGoal.approvalStatus === 'pending' &&
          updatedGoal.approvalDeadline
        ) {
          const now = new Date();
          // approvalDeadline may be a Firestore Timestamp (not yet converted to Date)
          // when received directly from the snapshot before normalizeGoal runs.
          // Convert explicitly to avoid `Date >= Timestamp` always being false.
          const rawDeadline = updatedGoal.approvalDeadline as unknown;
          const deadline: Date | null =
            rawDeadline instanceof Date
              ? rawDeadline
              : rawDeadline && typeof rawDeadline === 'object' && 'toDate' in rawDeadline && typeof (rawDeadline as { toDate: unknown }).toDate === 'function'
                ? (rawDeadline as { toDate: () => Date }).toDate()
                : rawDeadline && typeof rawDeadline === 'object' && 'seconds' in rawDeadline && (rawDeadline as { seconds: unknown }).seconds != null
                  ? new Date((rawDeadline as { seconds: number }).seconds * 1000)
                  : null;
          if (deadline && now >= deadline && !updatedGoal.giverActionTaken) {
            // Fire-and-forget: server-side write, no setState after await
            goalService.checkAndAutoApprove(currentGoal.id).catch(
              (err: unknown) => logger.error('[JourneyScreen] checkAndAutoApprove failed:', err)
            );
          }
        }
      }
    }, (error) => {
      logger.error('[JourneyScreen] Goal snapshot error:', error.message);
      setError(true);
    });
    return () => { isMounted = false; unsub(); };
  }, [currentGoal?.id]);

  // Fetch experience gift
  useEffect(() => {
    let mounted = true;
    const fetchExperienceGift = async () => {
      if (currentGoal?.experienceGiftId) {
        try {
          const gift = await experienceGiftService.getExperienceGiftById(
            currentGoal.experienceGiftId
          );
          if (!mounted) return;
          if (gift) setExperienceGift(gift);
        } catch (error: unknown) {
          if (!mounted) return;
          logger.error('Error fetching experience gift:', error);
          setError(true);
        }
      }
    };
    fetchExperienceGift();
    return () => { mounted = false; };
  }, [currentGoal?.experienceGiftId]);

  // Fetch sessions when tab changes to Sessions, or when screen refocuses
  const loadSessions = useCallback(async () => {
    if (!currentGoal?.id) return;
    setSessionsLoading(true);
    try {
      const data = await sessionService.getSessionsForGoal(currentGoal.id);
      if (!isMountedRef.current) return;
      setSessions(data);
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      logger.error('Error fetching sessions:', error);
      setError(true);
    } finally {
      if (isMountedRef.current) setSessionsLoading(false);
    }
  }, [currentGoal?.id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSessions();
    setRefreshing(false);
  }, [loadSessions]);

  useEffect(() => {
    if (activeTab === TAB_SESSIONS || currentGoal?.isCompleted) {
      loadSessions();
    }
  }, [activeTab, loadSessions, currentGoal?.isCompleted, currentGoal?.id]);

  // Fetch all motivations for inline display on session cards
  useEffect(() => {
    if (!currentGoal?.id) return;
    let mounted = true;
    const fetchMotivations = async () => {
      try {
        const data = await motivationService.getAllMotivations(currentGoal.id);
        if (!mounted) return;
        setMotivations(data);
      } catch (error: unknown) {
        if (!mounted) return;
        logger.error('Error fetching motivations:', error);
        setError(true);
      }
    };
    fetchMotivations();
    return () => { mounted = false; };
  }, [currentGoal?.id]);

  // Group motivations by target session number
  const motivationsBySession = React.useMemo(() => {
    const map: Record<number, Motivation[]> = {};
    for (const m of motivations) {
      const key = m.targetSession || 1; // untargeted go to session 1
      if (!map[key]) map[key] = [];
      map[key].push(m);
    }
    return map;
  }, [motivations]);

  // Fetch recommended experiences based on preferred category
  useEffect(() => {
    if (!currentGoal?.isFreeGoal || currentGoal?.pledgedExperience || !currentGoal?.preferredRewardCategory) {
      setRecommendedExperiences([]);
      return;
    }
    let mounted = true;
    const fetchRecommended = async () => {
      try {
        // Apply server-side category filter to avoid downloading all experiences client-side
        const category = currentGoal?.preferredRewardCategory || currentGoal?.category;
        const q = category
          ? query(collection(db, 'experiences'), where('category', '==', category), where('isActive', '==', true), limit(10))
          : query(collection(db, 'experiences'), where('isActive', '==', true), limit(10));
        const snapshot = await getDocs(q);
        if (!mounted) return;
        const all = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as Experience))
          .filter(exp => exp.status !== 'draft');
        const filtered = all
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        setRecommendedExperiences(filtered.slice(0, 3));
      } catch (error: unknown) {
        logger.error('Error fetching recommended experiences:', error);
      }
    };
    fetchRecommended();
    return () => { mounted = false; };
  }, [currentGoal?.preferredRewardCategory, currentGoal?.pledgedExperience]);

  // ─── Completed goal: fetch experience, partner, coupon ────────────────────
  useEffect(() => {
    if (!currentGoal?.isCompleted) return;
    let mounted = true;

    const fetchCompletedGoalData = async () => {
      try {
        // Fetch user name
        const name = await userService.getUserName(currentGoal.userId);
        if (!mounted) return;
        setUserName(name || 'User');

        // Determine experience ID source
        let expId: string | null = null;
        if (currentGoal.pledgedExperience?.experienceId) {
          expId = currentGoal.pledgedExperience.experienceId;
        } else if (currentGoal.experienceGiftId) {
          try {
            const gift = await experienceGiftService.getExperienceGiftById(currentGoal.experienceGiftId);
            if (!mounted) return;
            if (gift) expId = gift.experienceId;
          } catch (error: unknown) {
            if (!mounted) return;
            logger.warn('Failed to load experience gift:', error);
            // Continue without gift data — non-fatal
          }
        }

        let partnerData: PartnerUser | null = null;
        if (expId) {
          const exp = await experienceService.getExperienceById(expId);
          if (!mounted) return;
          setExperience(exp);

          if (exp?.partnerId) {
            partnerData = await partnerService.getPartnerById(exp.partnerId);
            if (!mounted) return;
            setPartner(partnerData);
          }
        }

        // Load existing coupon or auto-generate
        if (currentGoal.couponCode) {
          setCouponCode(currentGoal.couponCode);
        } else if ((currentGoal.giftAttachedAt || currentGoal.experienceGiftId) && expId && partnerData?.id) {
          // Auto-generate coupon for completed goals with a gift attached
          setCouponLoading(true);
          try {
            const code = await generateCouponForGoal(currentGoal.id, currentGoal.userId, partnerData.id);
            if (mounted) setCouponCode(code);
          } catch (err: unknown) {
            logger.warn('Auto coupon generation failed:', err);
          } finally {
            if (mounted) setCouponLoading(false);
          }
        }
      } catch (err: unknown) {
        if (!mounted) return;
        logger.error('Error fetching completed goal data:', err);
        setError(true);
      }
    };

    fetchCompletedGoalData();
    return () => { mounted = false; };
  }, [currentGoal?.isCompleted, currentGoal?.id]);

  const handleCopyCoupon = useCallback(async () => {
    if (!couponCode) return;
    analyticsService.trackEvent('button_click', 'engagement', { buttonName: 'copy_code' }, 'JourneyScreen');
    await Clipboard.setStringAsync(couponCode);
    setIsCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
  }, [couponCode]);

  const handleCopyPhone = useCallback(async () => {
    if (!partner?.phone) return;
    await Clipboard.setStringAsync(partner.phone);
    setIsPhoneCopied(true);
    if (phoneTimeoutRef.current) clearTimeout(phoneTimeoutRef.current);
    phoneTimeoutRef.current = setTimeout(() => setIsPhoneCopied(false), 2000);
  }, [partner]);

  const handleCopyEmail = useCallback(async () => {
    const email = partner?.contactEmail || partner?.email;
    if (!email) return;
    await Clipboard.setStringAsync(email);
    setIsEmailCopied(true);
    if (emailTimeoutRef.current) clearTimeout(emailTimeoutRef.current);
    emailTimeoutRef.current = setTimeout(() => setIsEmailCopied(false), 2000);
  }, [partner]);

  const handleWhatsAppSchedule = useCallback((date?: Date) => {
    if (!partner?.phone || !experience) return;
    const resolvedDate = date ?? preferredDate;
    const dateString = resolvedDate
      ? formatLocalDate(resolvedDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : t('booking.whatsapp.earliestConvenience');
    const message = t('booking.whatsapp.scheduleMessage', {
      partnerName: partner.name || t('booking.whatsapp.defaultPartnerName'),
      experienceName: experience.title,
      dateString,
      userName,
    });
    const phone = partner.phone.replace(/[^0-9]/g, '');
    const url = Platform.select({
      ios: `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`,
      android: `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`,
      default: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
    });
    Linking.canOpenURL(url!).then(ok => {
      if (ok) Linking.openURL(url!).catch(e => logger.error('Failed to open WhatsApp URL:', e));
      else showInfo(t('booking.whatsapp.error'));
    }).catch(e => logger.error('Failed to check WhatsApp URL:', e));
  }, [partner, experience, preferredDate, userName, t]);

  const handleEmailSchedule = useCallback((date?: Date) => {
    if (!partner || !experience) return;
    const email = partner.contactEmail || partner.email;
    if (!email) return;
    const resolvedDate = date ?? preferredDate;
    const dateString = resolvedDate
      ? formatLocalDate(resolvedDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : t('booking.email.earliestConvenience');
    const message = t('booking.email.scheduleBody', {
      partnerName: partner.name || t('booking.email.defaultPartnerName'),
      experienceName: experience.title,
      dateString,
      userName,
    });
    const subject = t('booking.email.subject', { experienceName: experience.title });
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`).catch(e => logger.error('Failed to open email URL:', e));
  }, [partner, experience, preferredDate, userName, t]);

  const handleBookWhatsApp = useCallback(() => {
    setBookingMethod('whatsapp');
    setShowCalendar(true);
  }, []);

  const handleBookEmail = useCallback(() => {
    setBookingMethod('email');
    setShowCalendar(true);
  }, []);

  const handleConfirmBooking = useCallback((date: Date) => {
    setPreferredDate(date);
    setShowCalendar(false);
    bookingTimeoutRef.current = setTimeout(() => {
      if (bookingMethod === 'whatsapp') handleWhatsAppSchedule(date);
      else if (bookingMethod === 'email') handleEmailSchedule(date);
    }, 100);
  }, [bookingMethod, handleWhatsAppSchedule, handleEmailSchedule]);

  const handleCancelBooking = useCallback(() => {
    setShowCalendar(false);
  }, []);

  // Screen-view enrichment
  useEffect(() => {
    if (!currentGoal?.id) return;
    analyticsService.trackEvent('screen_view', 'navigation', { goalId: currentGoal.id, sessionsLogged: sessions.length, isCompleted: currentGoal.isCompleted }, 'JourneyScreen');
  }, [currentGoal?.id, sessions.length]);

  // ─── Hints data ──────────────────────────────────────────────────────────
  const hintsArray =
    currentGoal && Array.isArray(currentGoal.hints)
      ? currentGoal.hints
      : currentGoal?.hints
        ? [currentGoal.hints]
        : [];

  const fmtDateTime = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });


  // ─── Sessions Tab Content ────────────────────────────────────────────────
  const renderSessionsTab = (opts?: { hideSessions?: boolean }) => {
    if (sessionsLoading && sessions.length === 0) {
      return (
        <View style={{ padding: Spacing.xl, gap: Spacing.sm }}>
          <SessionCardSkeleton />
          <SessionCardSkeleton />
          <SessionCardSkeleton />
          <SessionCardSkeleton />
        </View>
      );
    }

    if (sessions.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🏃</Text>
          <Text style={styles.emptyText}>{t('recipient.journey.empty.sessionsTitle')}</Text>
          <Text style={styles.emptySubText}>
            {t('recipient.journey.empty.sessionsSubtitle')}
          </Text>
        </View>
      );
    }

    // Build milestone markers: inject between sessions at week boundaries and session count milestones
    const SESSION_MILESTONES = new Set([10, 25, 50, 100]);
    const sortedSessions = [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber);
    const seenWeeks = new Set<number>();
    const shownSessionMilestones = new Set<number>();

    const items: React.ReactNode[] = [];
    sortedSessions.forEach((s, i) => {
      // Week completion marker: fires when weekNumber changes (after last session of prior week)
      const prevWeek = i > 0 ? sortedSessions[i - 1].weekNumber : null;
      if (prevWeek !== null && s.weekNumber !== prevWeek && !seenWeeks.has(prevWeek)) {
        seenWeeks.add(prevWeek);
        items.push(
          <WeekDivider key={`week-${prevWeek}`} label={t('recipient.journey.milestone.weekComplete', { number: prevWeek })} />
        );
      }
      // Session count milestone
      if (SESSION_MILESTONES.has(s.sessionNumber) && !shownSessionMilestones.has(s.sessionNumber)) {
        shownSessionMilestones.add(s.sessionNumber);
        items.push(
          <WeekDivider key={`sess-${s.sessionNumber}`} label={t('recipient.journey.milestone.sessions', { count: s.sessionNumber })} />
        );
      }
      items.push(
        <SessionCard
          key={s.id}
          session={s}
          index={i}
          motivations={motivationsBySession[s.sessionNumber] || []}
          isExpanded={expandedSessionId === s.id}
          onToggleExpand={() => {
            setExpandedSessionId(prev => prev === s.id ? null : s.id);
          }}
          onImagePress={(uri) => {
            const sessionImages = sessions.filter(s => s.mediaUrl && s.mediaType === 'photo').map(s => s.mediaUrl!);
            setAllImageUris(sessionImages);
            setSelectedImageUri(uri);
          }}
        />
      );
    });

    return (
      <View style={{ paddingHorizontal: Spacing.md, alignSelf: 'center', width: '100%', maxWidth: 380 }}>
        <SessionStatsBar sessions={sessions} hideSessions={opts?.hideSessions} />
        {items}
      </View>
    );
  };

  // ─── Hints Tab Content ───────────────────────────────────────────────────
  const renderHintsTab = () => {
    if (hintsArray.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💡</Text>
          <Text style={styles.emptyText}>{t('recipient.journey.empty.hintsTitle')}</Text>
          <Text style={styles.emptySubText}>
            {t('recipient.journey.empty.hintsSubtitle')}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.timeline}>
        {(hintsArray as HintEntry[])
          .slice()
          .sort((a: HintEntry, b: HintEntry) => {
            const sessionA = ('forSessionNumber' in a ? a.forSessionNumber : undefined) || ('session' in a ? a.session : 0) || 0;
            const sessionB = ('forSessionNumber' in b ? b.forSessionNumber : undefined) || ('session' in b ? b.session : 0) || 0;
            return Number(sessionB) - Number(sessionA);
          })
          .map((h: HintEntry, i) => {
            const session = ('forSessionNumber' in h ? h.forSessionNumber : undefined) || ('session' in h ? h.session : 0) || 0;
            let dateMs = 0;
            if (h.createdAt) {
              if (
                h.createdAt &&
                typeof h.createdAt === 'object' &&
                'toMillis' in h.createdAt &&
                typeof h.createdAt.toMillis === 'function'
              ) {
                dateMs = h.createdAt.toMillis();
              } else if (h.createdAt instanceof Date) {
                dateMs = h.createdAt.getTime();
              } else {
                dateMs = new Date(h.createdAt).getTime();
              }
            } else if (h.date) {
              dateMs = h.date;
            }
            return (
              <HintItem
                key={`${session}-${dateMs}`}
                hint={h}
                index={i}
                fmtDateTime={fmtDateTime}
                onImagePress={setSelectedImageUri}
              />
            );
          })}
      </View>
    );
  };

  // ─── Loading / redirect state ────────────────────────────────────────────
  if (!currentGoal) {
    return (
      <>
        <StatusBar style="light" />
        <SharedHeader title={t('recipient.journey.screenTitle')} showBack />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, ...Typography.subheading }}>{t('common.loading')}</Text>
        </View>
      </>
    );
  }

  // ─── Helper: 2-week window check ──────────────────────────────────────────
  const isWithinBuyWindow = () => {
    if (!currentGoal.completedAt) return false;
    const completedAtVal = currentGoal.completedAt;
    const completedDate = completedAtVal instanceof Timestamp
      ? completedAtVal.toDate()
      : new Date(completedAtVal as Date);
    if (isNaN(completedDate.getTime())) return false;
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    return Date.now() - completedDate.getTime() < twoWeeksMs;
  };

  // ─── Render: Completed Goal Layout ────────────────────────────────────────
  const renderCompletedLayout = () => {
    const totalSessions = currentGoal.targetCount * currentGoal.sessionsPerWeek;
    const completedAtRaw = currentGoal.completedAt;
    const parsedDate = completedAtRaw instanceof Timestamp
      ? completedAtRaw.toDate()
      : completedAtRaw ? new Date(completedAtRaw as Date) : null;
    const completedDate = parsedDate && !isNaN(parsedDate.getTime())
      ? formatLocalDate(parsedDate, { month: 'short', day: 'numeric', year: 'numeric' })
      : null;

    const hasGift = !!currentGoal.giftAttachedAt || (!!currentGoal.experienceGiftId && !currentGoal.isFreeGoal);
    const hasPledgedExperience = !!currentGoal.pledgedExperience;
    const showBuyCTA = currentGoal.isFreeGoal && hasPledgedExperience && !currentGoal.giftAttachedAt && isWithinBuyWindow();
    const showExpired = currentGoal.isFreeGoal && hasPledgedExperience && !currentGoal.giftAttachedAt && !isWithinBuyWindow();
    const selfGifted = isSelfGifted(currentGoal);
    const hasHints = hintsArray.length > 0 && !selfGifted;

    return (
      <>
        {/* ─── 1. Completion Header Card ────────────────── */}
        <Card variant="elevated" style={{ alignItems: 'center', marginBottom: Spacing.sectionGap }}>
          <CheckCircle color={colors.primary} size={48} />
          <Text style={[Typography.heading1, { color: colors.textPrimary, marginTop: Spacing.md, textAlign: 'center' }]}>
            {t('recipient.journey.completed.title')}
          </Text>
          <Text style={[Typography.subheading, { color: colors.textSecondary, marginTop: Spacing.xs, textAlign: 'center' }]}>
            {currentGoal.title}
          </Text>

          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, flexWrap: 'wrap', justifyContent: 'center' }}>
            <View style={cStyles.statChip}>
              <Text style={[Typography.heading2, { color: colors.textPrimary }]}>{totalSessions}</Text>
              <Text style={[Typography.caption, { color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }]}>{t('recipient.journey.completed.statSessions')}</Text>
            </View>
            <View style={cStyles.statChip}>
              <Text style={[Typography.heading2, { color: colors.textPrimary }]}>{currentGoal.targetCount || 0}</Text>
              <Text style={[Typography.caption, { color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }]}>{t('recipient.journey.completed.statWeeks')}</Text>
            </View>
            {(currentGoal.completionStreak ?? 0) >= 1 && (() => {
              const streakVal = currentGoal.completionStreak!;
              const flameColor = getFlameHex(streakVal);
              return (
                <View style={[cStyles.statChip, { backgroundColor: colors.warningLight }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                    <Flame color={flameColor} size={18} fill={flameColor} />
                    <Text style={[Typography.heading2, { color: flameColor }]}>{streakVal}</Text>
                  </View>
                  <Text style={[Typography.caption, { color: colors.warningDark, textTransform: 'uppercase', letterSpacing: 1 }]}>{t('recipient.journey.completed.statStreak')}</Text>
                </View>
              );
            })()}
          </View>

          {completedDate && (
            <Text style={[Typography.caption, { color: colors.textMuted, marginTop: Spacing.md }]}>
              {t('recipient.journey.completed.completedOn', { date: completedDate })}
            </Text>
          )}

          {/* ─── Reward (inline in hero card) ────────────── */}
          {(hasPledgedExperience || hasGift) && (
            <>
              <View style={cStyles.rewardDivider} />
              <Text style={[Typography.subheading, { color: colors.textPrimary, marginBottom: Spacing.sm, alignSelf: 'flex-start' }]}>
                {t('recipient.journey.completed.yourReward')}
              </Text>

              <Card variant="outlined" noPadding style={{ alignSelf: 'stretch', overflow: 'hidden' }}>
                {currentGoal.pledgedExperience?.coverImageUrl && (
                  <Image
                    source={{ uri: currentGoal.pledgedExperience.coverImageUrl }}
                    style={{ width: '100%', height: vh(180), backgroundColor: colors.backgroundLight }}
                  />
                )}
                <View style={{ padding: Spacing.md }}>
                  <Text style={cStyles.experienceName}>
                    {currentGoal.pledgedExperience?.title || experience?.title || 'Experience'}
                  </Text>
                  {(currentGoal.pledgedExperience?.subtitle || experience?.subtitle) ? (
                    <Text style={cStyles.experienceSubtitle}>{currentGoal.pledgedExperience?.subtitle || experience?.subtitle}</Text>
                  ) : null}
                </View>
              </Card>

              {/* Coupon & partner contact */}
              {hasGift && (
                <View style={{ alignSelf: 'stretch', marginTop: Spacing.md }}>
                  {/* Coupon — always shown, auto-generated */}
                  {couponCode ? (
                    <View style={cStyles.couponCard}>
                      <View style={cStyles.couponRow}>
                        <Ticket size={18} color={colors.primary} />
                        <Text style={cStyles.couponLabel}>{t('recipient.journey.completed.couponLabel')}</Text>
                      </View>
                      <View style={cStyles.couponCodeBox}>
                        <Text style={cStyles.couponCodeText}>{couponCode}</Text>
                      </View>
                      <TouchableOpacity style={cStyles.copyButton} onPress={handleCopyCoupon} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('recipient.journey.completed.copyCouponA11y')}>
                        {isCopied ? <CheckCircle size={16} color={colors.secondary} /> : <Copy size={16} color={colors.primary} />}
                        <Text style={[cStyles.copyText, isCopied && { color: colors.secondary }]}>
                          {isCopied ? t('common.copied') : t('recipient.journey.completed.copyCode')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : couponLoading ? (
                    <View style={{ padding: Spacing.sm, alignItems: 'center' }}>
                      <Text style={[Typography.small, { color: colors.textMuted }]}>{t('recipient.journey.completed.generatingCode')}</Text>
                    </View>
                  ) : null}

                  {/* Partner contact */}
                  {partner && (partner.phone || partner.contactEmail || partner.email) && (
                    <View style={cStyles.contactCard}>
                      <Text style={cStyles.contactTitle}>{t('recipient.journey.completed.partnerContact')}</Text>

                      {partner.phone && (
                        <View style={cStyles.contactRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={cStyles.contactLabel}>{t('recipient.journey.completed.phoneLabel')}</Text>
                            <Text style={cStyles.contactValue}>{partner.phone}</Text>
                          </View>
                          <TouchableOpacity onPress={handleCopyPhone} style={cStyles.smallCopyBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('recipient.journey.completed.copyPhoneA11y')}>
                            {isPhoneCopied ? <CheckCircle size={16} color={colors.secondary} /> : <Copy size={16} color={colors.textSecondary} />}
                          </TouchableOpacity>
                        </View>
                      )}

                      {(partner.contactEmail || partner.email) && (
                        <View style={cStyles.contactRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={cStyles.contactLabel}>{t('recipient.journey.completed.emailLabel')}</Text>
                            <Text style={[cStyles.contactValue, { ...Typography.caption }]}>{partner.contactEmail || partner.email}</Text>
                          </View>
                          <TouchableOpacity onPress={handleCopyEmail} style={cStyles.smallCopyBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('recipient.journey.completed.copyEmailA11y')}>
                            {isEmailCopied ? <CheckCircle size={16} color={colors.secondary} /> : <Copy size={16} color={colors.textSecondary} />}
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Schedule buttons */}
                      <View style={cStyles.scheduleRow}>
                        {partner.phone && (
                          <Button
                            variant="primary"
                            size="sm"
                            onPress={handleBookWhatsApp}
                            title={t('booking.whatsapp.buttonLabel')}
                            icon={<MessageCircle size={16} color={colors.white} />}
                            style={cStyles.whatsappBtn}
                          />
                        )}
                        {(partner.contactEmail || partner.email) && (
                          <Button
                            variant="primary"
                            size="sm"
                            onPress={handleBookEmail}
                            title={t('booking.email.buttonLabel')}
                            icon={<Mail size={16} color={colors.white} />}
                            style={cStyles.emailBtn}
                          />
                        )}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Buy CTA (within 2-week window) */}
              {showBuyCTA && (
                <View style={{ alignSelf: 'stretch' }}>
                  <View style={cStyles.rewardDivider} />
                  <Text style={cStyles.buyCTATitle}>{t('recipient.journey.completed.buyCTATitle')}</Text>
                  <Text style={cStyles.buyCTASubtext}>{t('recipient.journey.completed.buyCTASubtext')}</Text>
                  <Button
                    variant="primary"
                    onPress={() => navigation.navigate('ExperienceCheckout', {
                      cartItems: [{ experienceId: currentGoal.pledgedExperience?.experienceId ?? "", quantity: 1 }],
                      goalId: currentGoal.id,
                    })}
                    title={(currentGoal.pledgedExperience?.price ?? 0) > 0
                      ? t('recipient.journey.completed.buyNowWithPrice', { price: formatCurrency(currentGoal.pledgedExperience?.price ?? 0) })
                      : t('recipient.journey.completed.getExperience')}
                    icon={<ShoppingBag size={15} color={colors.white} />}
                    fullWidth
                    style={styles.buyButton}
                  />
                </View>
              )}

              {/* Expired */}
              {showExpired && (
                <View style={{ alignSelf: 'stretch' }}>
                  <View style={cStyles.rewardDivider} />
                  <Text style={cStyles.expiredText}>{t('recipient.journey.completed.purchaseWindowExpired')}</Text>
                </View>
              )}
            </>
          )}
          {currentGoal.isCompleted && (
            <View style={{ marginTop: Spacing.lg, width: '80%', alignSelf: 'center' }}>
              <Button
                variant="primary"
                title={t('recipient.journey.completed.shareAchievement')}
                onPress={() => { analyticsService.trackEvent('share_goal_completed', 'social', { goalId: currentGoal.id, channel: 'native_share' }, 'JourneyScreen'); navigation.navigate('ShareGoal', { goal: currentGoal, experienceGift: currentGoal.pledgedExperience ? { pledgedExperience: currentGoal.pledgedExperience } as any : undefined, sessions: sessions, sessionStreak: currentGoal.completionStreak }); }}
                fullWidth
              />
            </View>
          )}
        </Card>

        {/* ─── Sessions History ───────────────────────────── */}
        <View style={cStyles.section}>
          <Text style={cStyles.sectionTitle}>
            {t('recipient.journey.sections.sessions')} <Text style={cStyles.countBadge}>{sessions.length}</Text>
          </Text>
          <View style={styles.tabContent}>
            {renderSessionsTab({ hideSessions: true })}
          </View>
        </View>

        {/* ─── Hints History ─────────────────────────────── */}
        {hasHints && (
          <View style={cStyles.section}>
            <Text style={cStyles.sectionTitle}>
              {t('recipient.journey.sections.hints')} <Text style={cStyles.countBadge}>{hintsArray.length}</Text>
            </Text>
            <View style={styles.tabContent}>
              {renderHintsTab()}
            </View>
          </View>
        )}
      </>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────
  if (error && !sessionsLoading) {
    return (
      <ErrorBoundary screenName="JourneyScreen" userId={currentGoal?.userId}>
          <StatusBar style="light" />
          <SharedHeader title={t('recipient.journey.screenTitle')} showBack />
          <ErrorRetry
            message={t('recipient.journey.error.loadFailed')}
            onRetry={() => {
              setError(false);
              setSessionsLoading(true);
              loadSessions();
            }}
          />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="JourneyScreen" userId={currentGoal?.userId}>
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style="light" />
      <SharedHeader title={currentGoal.isCompleted ? t('recipient.journey.achievementTitle') : t('recipient.journey.screenTitle')} showBack />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: Spacing.xl,
          paddingBottom: currentGoal.isCompleted ? Spacing.sm : FOOTER_HEIGHT + Spacing.xl + insets.bottom,
          alignItems: 'center',
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {currentGoal.isCompleted ? (
          /* ─── COMPLETED GOAL ─────────────────────────────── */
          <View style={{ width: '100%', maxWidth: 380, paddingHorizontal: Spacing.lg }}>
            {renderCompletedLayout()}
          </View>
        ) : (
          /* ─── ACTIVE GOAL — single unified card ───────── */
          <View
            pointerEvents="box-none"
            style={styles.unifiedCard}
          >
            {/* Personalized Message */}
            {experienceGift?.personalizedMessage?.trim() && (
              <View style={styles.messageSection}>
                <Text style={styles.messageText}>
                  "{experienceGift.personalizedMessage.trim()}"
                </Text>
                <Text style={styles.messageFrom}>— {experienceGift.giverName}</Text>
              </View>
            )}

            {/* DetailedGoalCard */}
            <View pointerEvents="box-none">
              <DetailedGoalCard goal={currentGoal} onFinish={(g) => setCurrentGoal(g)} />
            </View>

            {/* ─── Pledged Experience Showcase (free goals) ──────────────── */}
            {currentGoal.isFreeGoal && currentGoal.pledgedExperience && (
              <>
                <View style={styles.sectionDivider} />
                <View style={styles.experienceInline}>
                  {currentGoal.isMystery ? (
                    <>
                      <View style={styles.mysteryShowcaseBanner}>
                        <Sparkles color={colors.warning} size={20} />
                        <Text style={styles.mysteryShowcaseText}>?</Text>
                      </View>
                      <View style={styles.experienceInlineBody}>
                        <View style={styles.experienceHeader}>
                          <Text style={[styles.experienceLabel, { color: colors.warningDark }]}>{t('recipient.journey.active.mysteryReward')}</Text>
                        </View>
                        <Text style={styles.experienceTitle} numberOfLines={2}>
                          {t('recipient.journey.active.mysteryRevealPrompt')}
                        </Text>
                        {(() => {
                          const total = currentGoal.targetCount * currentGoal.sessionsPerWeek;
                          const done = (currentGoal.currentCount * currentGoal.sessionsPerWeek) + currentGoal.weeklyCount;
                          const pct = total > 0 ? Math.min((done / total) * 100, 100) : 0;
                          return (
                            <View style={styles.experienceProgressArea}>
                              <View style={styles.experienceProgressTrack}>
                                <View style={[styles.experienceProgressFill, { width: `${pct}%`, backgroundColor: colors.warning }]} />
                              </View>
                              <Text style={styles.experienceProgressLabel}>
                                {t('recipient.journey.active.sessionsToReveal', { done, total })}
                              </Text>
                            </View>
                          );
                        })()}
                      </View>
                    </>
                  ) : (
                    <>
                      {currentGoal.pledgedExperience.coverImageUrl ? (
                        <Image
                          source={{ uri: currentGoal.pledgedExperience.coverImageUrl }}
                          style={styles.experienceCoverInline}
                          accessibilityLabel={`${currentGoal.pledgedExperience.title} cover image`}
                        />
                      ) : null}
                      <View style={styles.experienceInlineBody}>
                        <View style={styles.experienceHeader}>
                          <Text style={styles.experienceLabel}>{currentGoal.giftAttachedAt ? t('recipient.journey.active.yourReward') : t('recipient.journey.active.yourDreamReward')}</Text>
                          {currentGoal.pledgedExperience.price > 0 && (
                            <Text style={styles.experiencePrice}>
                              {formatCurrency(currentGoal.pledgedExperience.price)}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.experienceTitle} numberOfLines={2}>
                          {currentGoal.pledgedExperience.title}
                        </Text>
                        {(() => {
                          const total = currentGoal.targetCount * currentGoal.sessionsPerWeek;
                          const done = (currentGoal.currentCount * currentGoal.sessionsPerWeek) + currentGoal.weeklyCount;
                          const pct = total > 0 ? Math.min((done / total) * 100, 100) : 0;
                          return (
                            <View style={styles.experienceProgressArea}>
                              <View style={styles.experienceProgressTrack}>
                                <View style={[styles.experienceProgressFill, { width: `${pct}%` }]} />
                              </View>
                              <Text style={styles.experienceProgressLabel}>
                                {t('recipient.journey.active.sessionsToEarn', { done, total })}
                              </Text>
                            </View>
                          );
                        })()}

                        {!currentGoal.giftAttachedAt && (
                          <Button
                            variant="primary"
                            onPress={() => navigation.navigate('ExperienceCheckout', {
                              cartItems: [{ experienceId: currentGoal.pledgedExperience?.experienceId ?? "", quantity: 1 }],
                              goalId: currentGoal.id,
                            })}
                            title={(currentGoal.pledgedExperience?.price ?? 0) > 0
                              ? t('recipient.journey.completed.buyNowWithPrice', { price: formatCurrency(currentGoal.pledgedExperience?.price ?? 0) })
                              : t('recipient.journey.completed.getExperience')}
                            icon={<ShoppingBag size={15} color={colors.white} />}
                            fullWidth
                            style={styles.buyButton}
                          />
                        )}
                      </View>
                    </>
                  )}
                </View>
              </>
            )}

            {/* ─── Recommended Experiences (category-only free goals) ──── */}
            {currentGoal.isFreeGoal && !currentGoal.pledgedExperience && recommendedExperiences.length > 0 && (
              <>
                <View style={styles.sectionDivider} />
                <View style={styles.recommendedSection}>
                  <View style={styles.recommendedHeader}>
                    <Sparkles color={colors.primary} size={16} />
                    <Text style={styles.recommendedTitle}>{t('recipient.journey.active.recommendedTitle')}</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: Spacing.xs }}
                  >
                    {recommendedExperiences.map((exp) => (
                      <TouchableOpacity
                        key={exp.id}
                        style={styles.recommendedCard}
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate('MainTabs', { screen: 'HomeTab', params: { screen: 'ExperienceDetails', params: { experience: exp } } })}
                      >
                        {exp.coverImageUrl ? (
                          <Image
                            source={{ uri: exp.coverImageUrl }}
                            style={styles.recommendedImage}
                            contentFit="cover" cachePolicy="memory-disk"
                          />
                        ) : (
                          <View style={[styles.recommendedImage, { backgroundColor: colors.backgroundLight, justifyContent: 'center', alignItems: 'center' }]}>
                            <Gift size={20} color={colors.textMuted} />
                          </View>
                        )}
                        <Text style={styles.recommendedName} numberOfLines={2}>{exp.title}</Text>
                        {exp.price > 0 && (
                          <Text style={styles.recommendedPrice}>{formatCurrency(exp.price)}</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    style={styles.browseAllLink}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('MainTabs', { screen: 'HomeTab', params: { screen: 'CategorySelection', params: { prefilterCategory: currentGoal.preferredRewardCategory } } })}
                  >
                    <Text style={styles.browseAllText}>
                      {t('recipient.journey.active.browseAll', { category: currentGoal.preferredRewardCategory ? currentGoal.preferredRewardCategory.charAt(0).toUpperCase() + currentGoal.preferredRewardCategory.slice(1) : '' })}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ─── Segmented Tabs Section ──────────────────────────────────── */}
            <View style={styles.sectionDivider} />
            <View style={styles.tabSectionInline}>
              {currentGoal && !isSelfGifted(currentGoal) && (
                <SegmentedControl
                  activeTab={activeTab}
                  onTabChange={(tab) => setActiveTab(tab)}
                />
              )}

              <View>
                {currentGoal && isSelfGifted(currentGoal) ? (
                  renderSessionsTab()
                ) : (
                  <View>
                    <View style={{ display: activeTab === TAB_SESSIONS ? 'flex' : 'none' }}>
                      {renderSessionsTab()}
                    </View>
                    <View style={{ display: activeTab === TAB_HINTS ? 'flex' : 'none' }}>
                      {renderHintsTab()}
                    </View>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Fullscreen Image Viewer */}
      {selectedImageUri && (
        <ImageViewer
          visible={!!selectedImageUri}
          imageUri={selectedImageUri}
          imageUris={allImageUris.length > 1 ? allImageUris : undefined}
          initialIndex={allImageUris.length > 1 ? allImageUris.indexOf(selectedImageUri!) : 0}
          onClose={() => { setSelectedImageUri(null); setAllImageUris([]); }}
        />
      )}

      {/* Booking Calendar (for completed goals) */}
      <BookingCalendar
        visible={showCalendar}
        selectedDate={preferredDate || new Date()}
        onConfirm={handleConfirmBooking}
        onCancel={handleCancelBooking}
        minimumDate={new Date()}
      />
      </View>
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  messageSection: {
    paddingBottom: Spacing.lg,
    marginBottom: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  messageText: {
    ...Typography.heading3,
    color: colors.violet,
    lineHeight: 26,
  },
  messageFrom: {
    ...Typography.smallBold,
    color: colors.primaryDeep,
    marginTop: Spacing.sm,
  },
  unifiedCard: {
    width: '100%',
    maxWidth: 380,
    paddingHorizontal: Spacing.lg,
    backgroundColor: colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: Spacing.lg,
  },
  experienceInline: {
    overflow: 'hidden',
  },
  experienceInlineBody: {
    paddingTop: Spacing.md,
  },
  experienceCoverInline: {
    width: '100%',
    height: vh(180),
    borderRadius: BorderRadius.md,
    backgroundColor: colors.backgroundLight,
  },
  experienceCover: {
    width: '100%',
    height: vh(140),
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    backgroundColor: colors.backgroundLight,
  },
  tabSectionInline: {
    // no card styling needed — inside unified card
  },
  tabContent: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
  },
  emptyIcon: {
    fontSize: Typography.displayLarge.fontSize,
    marginBottom: Spacing.xs,
  },
  emptyText: {
    color: colors.textSecondary,
    ...Typography.subheading,
  },
  emptySubText: {
    color: colors.textMuted,
    ...Typography.small,
    textAlign: 'center',
    marginTop: Spacing.xs,
    maxWidth: 240,
  },
  timeline: {
    marginTop: Spacing.xs,
  },
  experienceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  experienceLabel: {
    ...Typography.tiny,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  experiencePrice: {
    ...Typography.subheading,
    color: colors.textPrimary,
  },
  experienceTitle: {
    ...Typography.subheading,
    color: colors.textPrimary,
    marginBottom: Spacing.sm,
    lineHeight: 22,
  },
  experienceProgressArea: {
    gap: Spacing.xs,
  },
  experienceProgressTrack: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: BorderRadius.xs,
    overflow: 'hidden',
  },
  experienceProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: BorderRadius.xs,
  },
  experienceProgressLabel: {
    ...Typography.captionBold,
    color: colors.textSecondary,
  },
  buyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: colors.secondary,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  buyButtonText: {
    color: colors.white,
    ...Typography.smallBold,
  },
  giftReceivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: colors.primarySurface,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  giftReceivedText: {
    ...Typography.captionBold,
    color: colors.primary,
  },
  mysteryShowcaseBanner: {
    height: vh(120),
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.warningLight,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.warningBorder,
  },
  mysteryShowcaseText: {
    ...Typography.displayLarge,
    color: colors.warning,
  },
  // Recommended experiences
  recommendedSection: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  recommendedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  recommendedTitle: {
    ...Typography.bodyBold,
    color: colors.gray800,
  },
  recommendedCard: {
    width: 140,
    marginRight: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.backgroundLight,
    overflow: 'hidden',
  },
  recommendedImage: {
    width: '100%',
    height: vh(90),
    borderTopLeftRadius: BorderRadius.md,
    borderTopRightRadius: BorderRadius.md,
  },
  recommendedName: {
    ...Typography.captionBold,
    color: colors.gray800,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  recommendedPrice: {
    ...Typography.captionBold,
    color: colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  browseAllLink: {
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  browseAllText: {
    ...Typography.captionBold,
    color: colors.primary,
  },
});

// ─── Completed Goal Styles ──────────────────────────────────────────────────
const createCStyles = (colors: typeof Colors) => StyleSheet.create({
  statChip: {
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    minWidth: 80,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.subheading,
    color: colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  countBadge: {
    ...Typography.captionBold,
    color: colors.primary,
  },
  experienceName: {
    ...Typography.subheading,
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  experiencePrice: {
    ...Typography.bodyBold,
    color: colors.primary,
  },
  experienceSubtitle: {
    ...Typography.small,
    color: colors.textSecondary,
  },
  rewardDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: Spacing.md,
  },
  redemptionArea: {
    marginTop: Spacing.md,
  },
  couponCard: {
    backgroundColor: colors.primarySurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginBottom: Spacing.md,
  },
  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  couponLabel: {
    ...Typography.captionBold,
    color: colors.textPrimary,
  },
  couponCodeBox: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: Spacing.sm,
  },
  couponCodeText: {
    ...Typography.large,
    letterSpacing: 3,
    color: colors.textPrimary,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  copyText: {
    ...Typography.smallBold,
    color: colors.primary,
  },
  contactCard: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: Spacing.md,
  },
  contactTitle: {
    ...Typography.smallBold,
    color: colors.textPrimary,
    marginBottom: Spacing.md,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  contactLabel: {
    ...Typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contactValue: {
    ...Typography.smallBold,
    color: colors.textPrimary,
    marginTop: Spacing.xxs,
  },
  smallCopyBtn: {
    padding: Spacing.xs,
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  whatsappBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: colors.whatsappGreen,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  emailBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: colors.secondary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  scheduleBtnText: {
    color: colors.white,
    ...Typography.captionBold,
  },
  buyCTACard: {
    backgroundColor: colors.primarySurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginTop: Spacing.md,
  },
  buyCTATitle: {
    ...Typography.subheading,
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  buyCTASubtext: {
    ...Typography.caption,
    color: colors.textSecondary,
    marginBottom: Spacing.md,
  },
  expiredCard: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  expiredText: {
    ...Typography.caption,
    color: colors.textMuted,
  },
});

export default JourneyScreen;
