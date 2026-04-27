import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLocalDate, formatRelativeTime } from '../../utils/i18nHelpers';
import { formatCurrency } from '../../utils/helpers';
import {
  View, Text, ScrollView, StyleSheet, Animated, Easing, TouchableOpacity,
  Platform, Linking, Dimensions, DimensionValue,
} from 'react-native';
import { MotiView } from 'moti';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useRoute } from '@react-navigation/native';
import { collection, query, where, limit, getDocs, Timestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Goal, SessionRecord, Motivation, PersonalizedHint, Experience, PartnerUser, ExperienceGift } from '../../types';

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
import { isSelfGifted } from '../../types';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import SharedHeader from '../../components/SharedHeader';
import AudioPlayer from '../../components/AudioPlayer';
import ImageViewer from '../../components/ImageViewer';
import { SessionCardSkeleton, ExperienceCardSkeleton } from '../../components/SkeletonLoader';
import { BookingCalendar } from '../../components/BookingCalendar';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { experienceService } from '../../services/ExperienceService';
import { partnerService } from '../../services/PartnerService';
import { userService } from '../../services/userService';
import { sessionService } from '../../services/SessionService';
import { motivationService } from '../../services/MotivationService';
import { goalService } from '../../services/GoalService';
import { generateCouponForGoal } from '../../services/CouponService';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Card } from '../../components/Card';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { vh } from '../../utils/responsive';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { Shadows } from '../../config/shadows';
import { logger } from '../../utils/logger';
import { toJSDate } from '../../utils/GoalHelpers';
import ErrorRetry from '../../components/ErrorRetry';
import { Trophy, Copy, CheckCircle, Sparkles, Ticket, MessageCircle, Mail, Clock, PlayCircle, Flame } from 'lucide-react-native';
import { analyticsService } from '../../services/AnalyticsService';
import Button from '../../components/Button';
import { getFlameHex } from '../../utils/streakColor';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Haptics from 'expo-haptics';

// ─────────────────────────────────────────────────────────────
// HintItem - extracted to module level to prevent unmount/remount on every render
// ─────────────────────────────────────────────────────────────
const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

interface HintItemProps {
  hint: HintEntry;
  index: number;
  onImagePress: (uri: string) => void;
}

const HintItem = React.memo(({ hint, index, onImagePress }: HintItemProps) => {
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

  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      paddingVertical: Spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    }}>
      <Text style={{ ...Typography.bodyBold, color: colors.textPrimary, marginBottom: Spacing.xs }}>
        {fmtDateTime(dateMs)}
      </Text>
      {hasImage && hint.imageUrl && (
        <TouchableOpacity onPress={() => onImagePress(hint.imageUrl!)} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="View hint image">
          <Image source={{ uri: hint.imageUrl }} style={hintStyles.hintImage} accessibilityLabel="Hint image" cachePolicy="memory-disk" contentFit="cover" />
        </TouchableOpacity>
      )}
      {text && (
        <Text style={{ color: colors.gray700, ...Typography.body, marginBottom: isAudio ? 8 : 0 }}>
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

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  const date = new Date(value as string | number);
  return isNaN(date.getTime()) ? undefined : date;
};

// Defensive date conversion: returns null for a single bad field instead of
// nullifying the entire goal object (FIX 3).
const safeToDate = (val: unknown): Date | null => {
  try {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if ((val as { toDate?: () => Date })?.toDate) return (val as { toDate: () => Date }).toDate();
    if (typeof val === 'object' && 'seconds' in (val as object)) {
      return new Date(((val as { seconds: number }).seconds) * 1000);
    }
    if (typeof val === 'string' || typeof val === 'number') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// SessionCard - copy from JourneyScreen exactly
// ─────────────────────────────────────────────────────────────
const SessionCard = ({
  session,
  index,
  motivations = [],
}: {
  session: SessionRecord;
  index: number;
  motivations?: Motivation[];
}) => {
  const colors = useColors();
  const sessStyles = useMemo(() => createSessStyles(colors), [colors]);
  const anim = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(false);

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

  const toggleMotivations = () => {
    setExpanded(!expanded);
  };

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
      <View style={sessStyles.cardMain}>
        <View style={sessStyles.badge}>
          <Text style={sessStyles.badgeText}>#{session.sessionNumber}</Text>
        </View>
        <View style={sessStyles.details}>
          <Text style={sessStyles.date}>
            {fmtDate(session.timestamp)} · {fmtTime(session.timestamp)}
          </Text>
          <View style={sessStyles.metaRow}>
            <Clock size={13} color={colors.textSecondary} />
            <Text style={sessStyles.metaText}>{fmtDuration(session.duration)}</Text>
            <Text style={sessStyles.weekBadge}>Week {session.weekNumber + 1}</Text>
          </View>
        </View>
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
      {motivations.length > 0 && (
        <>
          <TouchableOpacity
            style={sessStyles.motivationToggle}
            onPress={toggleMotivations}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? 'Hide' : 'Show'} motivations`}
          >
            <MessageCircle size={14} color={colors.primary} />
            <Text style={sessStyles.motivationToggleText}>
              {motivations.length} motivation{motivations.length !== 1 ? 's' : ''} from friends
            </Text>
          </TouchableOpacity>
          {expanded && (
            <MotiView from={{ opacity: 0, translateY: -8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 200 }} style={sessStyles.motivationList}>
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
            </MotiView>
          )}
        </>
      )}
    </Animated.View>
  );
};

// createSessStyles - copy exactly from JourneyScreen
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
});

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
const AchievementDetailScreen = () => {
  const { t } = useTranslation();
  const navigation = useRootNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { state } = useApp();
  const { showError, showInfo } = useToast();
  const colors = useColors();
  const cStyles = useMemo(() => createCStyles(colors), [colors]);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const routeParams = route.params as { goal?: Goal; experienceGift?: ExperienceGift; mode?: 'completion' | 'review' } | undefined;
  const mode = routeParams?.mode || 'review';
  const isCompletion = mode === 'completion';
  const experienceGiftParam = routeParams?.experienceGift || null;
  const rawGoal = routeParams?.goal;
  // FIX 3: Use safeToDate per-field so a single bad date field doesn't null out
  // the entire goal and trigger a premature redirect to Profile.
  const goal: Goal | null = rawGoal ? {
    ...rawGoal,
    startDate: safeToDate(rawGoal.startDate) ?? rawGoal.startDate,
    endDate: safeToDate(rawGoal.endDate) ?? rawGoal.endDate,
    createdAt: safeToDate(rawGoal.createdAt) ?? rawGoal.createdAt,
    updatedAt: safeToDate(rawGoal.updatedAt) ?? rawGoal.updatedAt,
    completedAt: safeToDate(rawGoal.completedAt) ?? null,
  } : null;

  // Retry key to re-trigger data fetch on error
  const [retryKey, setRetryKey] = useState(0);

  // Experience & partner data
  const [experience, setExperience] = useState<Experience | null>(null);
  const [partner, setPartner] = useState<PartnerUser | null>(null);
  const [userName, setUserName] = useState<string>('User');
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // Copy states
  const [isCopied, setIsCopied] = useState(false);
  const [isPhoneCopied, setIsPhoneCopied] = useState(false);
  const [isEmailCopied, setIsEmailCopied] = useState(false);

  // Sessions & motivations
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [motivations, setMotivations] = useState<Motivation[]>([]);

  // Hints
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Completion mode — streak & active goals
  const [sessionStreak, setSessionStreak] = useState(0);
  const [otherActiveGoals, setOtherActiveGoals] = useState(0);

  // Completion mode — payment pending
  const [paymentPending, setPaymentPending] = useState(false);

  // Completion mode — celebration message (randomised once on mount)
  const [celebrationMsgKey] = useState(() => {
    const keys = ['incredible', 'crushedIt', 'legend', 'unstoppable', 'champion', 'phenomenal'];
    return keys[Math.floor(Math.random() * keys.length)];
  });

  // Confetti ref
  const confettiRef = useRef<InstanceType<typeof ConfettiCannon>>(null);

  // Booking
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [bookingMethod, setBookingMethod] = useState<'whatsapp' | 'email' | null>(null);

  // Computed values
  const hasReward = Boolean(goal?.experienceGiftId) || Boolean(goal?.giftAttachedAt);
  const selfGifted = goal ? isSelfGifted(goal) : false;
  const totalSessions = goal ? goal.sessionsPerWeek * goal.targetCount : 0;

  const hintsArray = goal && Array.isArray(goal.hints) ? goal.hints
    : goal?.hints ? [goal.hints] : [];
  const hasHints = hintsArray.length > 0 && !selfGifted;

  const motivationsBySession = useMemo(() => {
    const map: Record<number, Motivation[]> = {};
    for (const m of motivations) {
      const key = m.targetSession || 1;
      if (!map[key]) map[key] = [];
      map[key].push(m);
    }
    return map;
  }, [motivations]);

  const experienceImage = experience
    ? Array.isArray(experience.imageUrl) ? experience.imageUrl[0] : (experience.imageUrl || experience.coverImageUrl)
    : goal?.pledgedExperience?.coverImageUrl || null;

  // Format completion date — handle Firestore Timestamp, serialized {seconds,nanoseconds}, Date, or string
  const completedAtValue = goal?.completedAt;
  const parsedDate = (() => {
    const v = completedAtValue;
    if (!v) return null;
    if (v instanceof Date) return v;
    if ((v as { toDate?: () => Date })?.toDate) return (v as { toDate: () => Date }).toDate(); // Firestore Timestamp
    if ((v as { seconds?: number })?.seconds != null) return new Date((v as { seconds: number }).seconds * 1000); // serialized Timestamp
    const d = new Date(v as string | number);
    return isNaN(d.getTime()) ? null : d;
  })();
  const completedDate = parsedDate && !isNaN(parsedDate.getTime())
    ? formatLocalDate(parsedDate, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // Screen-view enrichment
  useEffect(() => {
    if (!goal?.id) return;
    analyticsService.trackEvent('screen_view', 'navigation', { goalId: goal.id, hasReward }, 'AchievementDetailScreen');
  }, [goal?.id]);

  // Cleanup copy timeouts on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (phoneTimeoutRef.current) clearTimeout(phoneTimeoutRef.current);
      if (emailTimeoutRef.current) clearTimeout(emailTimeoutRef.current);
    };
  }, []);

  // ───── Data fetching - 3 useEffects ─────

  // useEffect 1 - Experience, partner, coupon, userName
  useEffect(() => {
    if (!goal) {
      navigation.navigate('MainTabs', { screen: 'ProfileTab', params: { screen: 'Profile' } });
      return;
    }
    let mounted = true;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // User name
        if (goal.userId) {
          const name = await userService.getUserName(goal.userId);
          if (!mounted) return;
          setUserName(name || 'User');
        }

        // Determine experience ID source
        let expId: string | null = null;
        if (experienceGiftParam?.experienceId) {
          expId = experienceGiftParam.experienceId;
        } else if (goal.pledgedExperience?.experienceId) {
          expId = goal.pledgedExperience.experienceId;
        } else if (goal.experienceGiftId) {
          try {
            const gift = await experienceGiftService.getExperienceGiftById(goal.experienceGiftId);
            if (!mounted) return;
            if (gift) expId = gift.experienceId;
          } catch (error: unknown) {
            logger.warn('Failed to load experience gift:', error);
          }
        }

        if (expId) {
          const exp = await experienceService.getExperienceById(expId);
          if (!mounted) return;
          setExperience(exp);
          if (exp?.partnerId) {
            const partnerData = await partnerService.getPartnerById(exp.partnerId);
            if (!mounted) return;
            setPartner(partnerData);
          }
        }

        // Existing coupon - check goal first, then Firestore
        const hasGift = Boolean(goal.experienceGiftId) || Boolean(goal.giftAttachedAt);
        if (goal.couponCode) {
          if (mounted) setCouponCode(goal.couponCode);
        } else if (hasGift) {
          const couponsRef = collection(db, 'partnerCoupons');
          const q = query(couponsRef, where('goalId', '==', goal.id), limit(1));
          const snapshot = await getDocs(q);
          if (!mounted) return;
          if (!snapshot.empty) {
            setCouponCode(snapshot.docs[0].data().code);
          } else if (expId && goal.userId) {
            // Auto-generate coupon for completed goals with a reward attached
            try {
              const code = await generateCouponForGoal(goal.id, goal.userId, partner?.id || '');
              if (mounted) setCouponCode(code);
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? err.message : String(err);
              if (mounted) {
                if (errMsg.includes('PAYMENT_PENDING')) {
                  setPaymentPending(true);
                } else {
                  logger.warn('Coupon generation failed:', err);
                }
              }
            }
          }
        }
      } catch (error: unknown) {
        logger.error('Error fetching achievement data:', error);
        if (mounted) {
          showError('Could not load achievement details.');
          setError(true);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    fetchData();
    return () => { mounted = false; };
  }, [goal?.id, retryKey, experienceGiftParam?.id]);

  // useEffect 2 - Sessions
  useEffect(() => {
    if (!goal?.id) return;
    let mounted = true;
    const loadSessions = async () => {
      setSessionsLoading(true);
      try {
        const data = await sessionService.getSessionsForGoal(goal.id);
        if (!mounted) return;
        setSessions(data);
      } catch (error: unknown) {
        if (!mounted) return;
        logger.error('Error fetching sessions:', error);
      } finally {
        if (mounted) setSessionsLoading(false);
      }
    };
    loadSessions();
    return () => { mounted = false; };
  }, [goal?.id]);

  // useEffect — Completion mode: haptics, confetti, streak & active goals
  useEffect(() => {
    if (!isCompletion) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const confettiTimer = setTimeout(() => confettiRef.current?.start(), 300);
    return () => clearTimeout(confettiTimer);
  }, [isCompletion]);

  useEffect(() => {
    if (!isCompletion || !goal?.userId) return;
    let mounted = true;
    const fetchStreakAndGoals = async () => {
      try {
        const userDocSnap = await getDoc(doc(db, 'users', goal.userId));
        if (!mounted) return;
        if (userDocSnap.exists()) {
          setSessionStreak(userDocSnap.data().sessionStreak || 0);
        }
        const allGoals = await goalService.getUserGoals(goal.userId);
        if (!mounted) return;
        setOtherActiveGoals(allGoals.filter((g: Goal) => g.id !== goal.id && !g.isCompleted).length);
      } catch (error: unknown) {
        if (!mounted) return;
        logger.error('Error fetching streak/goals:', error);
      }
    };
    fetchStreakAndGoals();
    return () => { mounted = false; };
  }, [isCompletion, goal?.userId, goal?.id]);

  // useEffect 3 - Motivations
  useEffect(() => {
    if (!goal?.id) return;
    let mounted = true;
    const fetchMotivations = async () => {
      try {
        const data = await motivationService.getAllMotivations(goal.id);
        if (!mounted) return;
        setMotivations(data);
      } catch (error: unknown) {
        if (!mounted) return;
        logger.error('Error fetching motivations:', error);
      }
    };
    fetchMotivations();
    return () => { mounted = false; };
  }, [goal?.id]);

  // ───── Handler functions ─────
  const handleCopy = useCallback(async () => {
    if (!couponCode) return;
    analyticsService.trackEvent('coupon_redeemed', 'conversion', { goalId: goal?.id, partnerId: partner?.id }, 'AchievementDetailScreen');
    await Clipboard.setStringAsync(couponCode);
    setIsCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
  }, [couponCode, goal?.id, partner?.id]);

  const handleCopyPhone = useCallback(async () => {
    if (!partner?.phone) return;
    await Clipboard.setStringAsync(partner.phone);
    setIsPhoneCopied(true);
    if (phoneTimeoutRef.current) clearTimeout(phoneTimeoutRef.current);
    phoneTimeoutRef.current = setTimeout(() => setIsPhoneCopied(false), 2000);
  }, [partner?.phone]);

  const handleCopyEmail = useCallback(async () => {
    const contactEmail = partner?.contactEmail || partner?.email;
    if (!contactEmail) return;
    await Clipboard.setStringAsync(contactEmail);
    setIsEmailCopied(true);
    if (emailTimeoutRef.current) clearTimeout(emailTimeoutRef.current);
    emailTimeoutRef.current = setTimeout(() => setIsEmailCopied(false), 2000);
  }, [partner?.contactEmail, partner?.email]);

  const handleEmailFallback = useCallback((url: string) => {
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        showInfo(t('booking.email.error'));
      }
    }).catch(() => showInfo(t('booking.email.error')));
  }, []);

  const handleWhatsAppSchedule = useCallback((dateOverride?: Date) => {
    if (!partner?.phone || !experience) return;

    const resolvedDate = dateOverride ?? preferredDate;
    const dateString = resolvedDate
      ? formatLocalDate(resolvedDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : t('booking.whatsapp.earliestConvenience');

    const message = t('booking.whatsapp.scheduleMessage', {
      partnerName: partner.name || t('booking.whatsapp.defaultPartnerName'),
      experienceName: experience.title,
      dateString,
      userName,
    });

    const phoneNumber = partner.phone.replace(/[^0-9]/g, '');
    const whatsappUrl = Platform.select({
      ios: `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`,
      android: `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`,
      default: `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`,
    });

    Linking.canOpenURL(whatsappUrl!).then((supported) => {
      if (supported) {
        Linking.openURL(whatsappUrl!);
      } else {
        showInfo(t('booking.whatsapp.error'));
      }
    }).catch(() => showInfo(t('booking.whatsapp.error')));
  }, [partner, experience, preferredDate, userName, t]);

  const handleEmailSchedule = useCallback((dateOverride?: Date) => {
    if (!partner || !experience) return;
    const contactEmail = partner.contactEmail || partner.email;
    if (!contactEmail) {
      showInfo(t('recipient.achievement.error.partnerEmailUnavailable'));
      return;
    }

    const resolvedDate = dateOverride ?? preferredDate;
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
    const emailUrl = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    handleEmailFallback(emailUrl);
  }, [partner, experience, preferredDate, userName, handleEmailFallback, t]);

  const handleBookNowWhatsApp = useCallback(() => {
    analyticsService.trackEvent('button_click', 'engagement', { buttonName: 'book_now', channel: 'whatsapp' }, 'AchievementDetailScreen');
    setBookingMethod('whatsapp');
    setShowCalendar(true);
  }, []);

  const handleBookNowEmail = useCallback(() => {
    analyticsService.trackEvent('button_click', 'engagement', { buttonName: 'book_now', channel: 'email' }, 'AchievementDetailScreen');
    setBookingMethod('email');
    setShowCalendar(true);
  }, []);

  const handleConfirmBooking = useCallback((date: Date) => {
    setPreferredDate(date);
    setShowCalendar(false);

    if (bookingMethod === 'whatsapp') {
      handleWhatsAppSchedule(date); // pass date directly to avoid reading stale state
    } else if (bookingMethod === 'email') {
      handleEmailSchedule(date); // pass date directly to avoid reading stale state
    }
  }, [bookingMethod, handleWhatsAppSchedule, handleEmailSchedule]);

  const handleCancelBooking = useCallback(() => {
    setPreferredDate(null);
    setShowCalendar(false);
    // Do NOT send a booking message when the user cancels the calendar
  }, []);

  // ───── HintItem callback ─────
  const handleHintImagePress = useCallback((uri: string) => {
    setSelectedImageUri(uri);
  }, []);

  // ───── Null/loading guard ─────
  if (!goal) {
    return (
      <ErrorBoundary screenName="AchievementDetailScreen" userId={state.user?.id}>
          <StatusBar style="light" />
          <SharedHeader title={t('recipient.achievement.screenTitle')} showBack />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary, ...Typography.subheading }}>{t('common.loading')}</Text>
          </View>
      </ErrorBoundary>
    );
  }

  // ───── JSX STRUCTURE ─────
  if (error && !isLoading) {
    return (
      <ErrorBoundary screenName="AchievementDetailScreen" userId={state.user?.id}>
          <StatusBar style="light" />
          <SharedHeader title={t('recipient.achievement.screenTitle')} showBack />
          <ErrorRetry
            message={t('recipient.achievement.errors.loadFailed')}
            onRetry={() => {
              setError(false);
              setRetryKey(k => k + 1);
            }}
          />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="AchievementDetailScreen" userId={state.user?.id}>
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <StatusBar style="light" />
        <SharedHeader title={t('recipient.achievement.screenTitle')} showBack />

        {isCompletion && (
          <ConfettiCannon
            ref={confettiRef}
            count={Platform.OS === 'android' ? 90 : 150}
            origin={{ x: Dimensions.get('window').width / 2, y: -20 }}
            autoStart={false}
            fadeOut
            fallSpeed={3000}
            colors={[colors.celebrationGold, colors.warning, colors.secondary, colors.secondary, colors.categoryPink]}
          />
        )}

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: Spacing.xl, paddingBottom: Spacing.huge + insets.bottom, alignItems: 'center' }}>
          <View style={{ width: '100%', maxWidth: 380, paddingHorizontal: Spacing.lg }}>

            {/* ─── 1. Completion / Review Header Card ─── */}
            <Card variant="elevated" style={{ alignItems: 'center', marginBottom: Spacing.sectionGap }}>
              <CheckCircle color={colors.primary} size={48} />
              <Text style={[Typography.heading1, { color: colors.textPrimary, marginTop: Spacing.md, textAlign: 'center' }]}>
                {t('recipient.achievement.goalCompleted')}
              </Text>
              <Text style={[Typography.subheading, { color: colors.textSecondary, marginTop: Spacing.xs, textAlign: 'center' }]}>
                {goal.title}
              </Text>

              {isCompletion && (
                <Text style={[Typography.subheading, { color: colors.primary, marginTop: Spacing.xs, textAlign: 'center' }]}>
                  {t(`recipient.achievement.celebration.${celebrationMsgKey}`)}
                </Text>
              )}

              {/* Stats chips row */}
              <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, flexWrap: 'wrap', justifyContent: 'center' }}>
                <View style={cStyles.statChip}>
                  <Text style={[Typography.heading2, { color: colors.textPrimary }]}>{totalSessions}</Text>
                  <Text style={[Typography.caption, { color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }]}>{t('recipient.achievement.statSessions')}</Text>
                </View>
                <View style={cStyles.statChip}>
                  <Text style={[Typography.heading2, { color: colors.textPrimary }]}>{goal.targetCount || 0}</Text>
                  <Text style={[Typography.caption, { color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }]}>{t('recipient.achievement.statWeeks')}</Text>
                </View>
                {(() => {
                  const streakVal = isCompletion ? sessionStreak : (goal.completionStreak ?? 0);
                  if (streakVal < 1) return null;
                  const flameColor = getFlameHex(streakVal);
                  return (
                    <View style={[cStyles.statChip, { backgroundColor: colors.warningLight }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                        <Flame color={flameColor} size={18} fill={flameColor} />
                        <Text style={[Typography.heading2, { color: flameColor }]}>{streakVal}</Text>
                      </View>
                      <Text style={[Typography.caption, { color: colors.warningDark, textTransform: 'uppercase', letterSpacing: 1 }]}>{t('recipient.achievement.statStreak')}</Text>
                    </View>
                  );
                })()}
              </View>

              {completedDate && (
                <Text style={[Typography.caption, { color: colors.textMuted, marginTop: Spacing.md }]}>
                  {t('recipient.achievement.completedOn', { date: completedDate })}
                </Text>
              )}

              {/* ─── Reward (inline in hero card) ─── */}
              {(hasReward || (goal.isFreeGoal && goal.pledgedExperience)) && (
                <>
                  <View style={cStyles.rewardDivider} />
                  <Text style={[Typography.subheading, { color: colors.textPrimary, marginBottom: Spacing.sm, alignSelf: 'flex-start' }]}>
                    {t('recipient.achievement.yourReward')}
                  </Text>

                  <Card variant="outlined" noPadding style={{ alignSelf: 'stretch', overflow: 'hidden' }}>
                    {(goal.pledgedExperience?.coverImageUrl || experienceImage) && (
                      <Image
                        source={{ uri: experienceImage || goal.pledgedExperience?.coverImageUrl }}
                        style={{ width: '100%', height: vh(180), backgroundColor: colors.backgroundLight }}
                      />
                    )}
                    <View style={{ padding: Spacing.md }}>
                      {isLoading ? (
                        <ExperienceCardSkeleton />
                      ) : (
                        <>
                          <Text style={cStyles.experienceName}>
                            {goal.pledgedExperience?.title || experience?.title || 'Experience'}
                          </Text>
                          {(goal.pledgedExperience?.subtitle || experience?.subtitle) ? (
                            <Text style={cStyles.experienceSubtitle}>{goal.pledgedExperience?.subtitle || experience?.subtitle}</Text>
                          ) : null}
                          {experience?.description ? (
                            <Text style={{ ...Typography.small, color: colors.gray700, lineHeight: 20, marginTop: Spacing.sm }}>{experience.description}</Text>
                          ) : null}
                        </>
                      )}
                    </View>
                  </Card>

                  {/* Coupon & partner contact */}
                  {(goal.experienceGiftId || goal.giftAttachedAt) && (
                    <View style={{ alignSelf: 'stretch', marginTop: Spacing.md }}>
                      {/* Coupon */}
                      {couponCode ? (
                        <View style={cStyles.couponCard}>
                          <View style={cStyles.couponRow}>
                            <Ticket size={18} color={colors.primary} />
                            <Text style={cStyles.couponLabel}>{t('recipient.achievement.couponLabel')}</Text>
                          </View>
                          <View style={cStyles.couponCodeBox}>
                            <Text style={cStyles.couponCodeText}>{couponCode}</Text>
                          </View>
                          <TouchableOpacity style={cStyles.copyButton} onPress={handleCopy} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('recipient.achievement.copyCouponA11y')}>
                            {isCopied ? <CheckCircle size={16} color={colors.secondary} /> : <Copy size={16} color={colors.primary} />}
                            <Text style={[cStyles.copyText, isCopied && { color: colors.secondary }]}>
                              {isCopied ? t('common.copied') : t('recipient.achievement.copyCode')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : isLoading ? (
                        <View style={{ padding: Spacing.sm }}><ExperienceCardSkeleton /></View>
                      ) : null}

                      {/* Partner contact */}
                      {partner && (partner.phone || partner.contactEmail || partner.email) && (
                        <View style={cStyles.contactCard}>
                          <Text style={cStyles.contactTitle}>{t('recipient.achievement.partnerContact')}</Text>
                          {partner.phone && (
                            <View style={cStyles.contactRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={cStyles.contactLabel}>{t('recipient.achievement.phoneLabel')}</Text>
                                <Text style={cStyles.contactValue}>{partner.phone}</Text>
                              </View>
                              <TouchableOpacity onPress={handleCopyPhone} style={cStyles.smallCopyBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('recipient.achievement.copyPhoneA11y')}>
                                {isPhoneCopied ? <CheckCircle size={16} color={colors.secondary} /> : <Copy size={16} color={colors.textSecondary} />}
                              </TouchableOpacity>
                            </View>
                          )}
                          {(partner.contactEmail || partner.email) && (
                            <View style={cStyles.contactRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={cStyles.contactLabel}>{t('recipient.achievement.emailLabel')}</Text>
                                <Text style={[cStyles.contactValue, { ...Typography.caption }]}>{partner.contactEmail || partner.email}</Text>
                              </View>
                              <TouchableOpacity onPress={handleCopyEmail} style={cStyles.smallCopyBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('recipient.achievement.copyEmailA11y')}>
                                {isEmailCopied ? <CheckCircle size={16} color={colors.secondary} /> : <Copy size={16} color={colors.textSecondary} />}
                              </TouchableOpacity>
                            </View>
                          )}
                          <View style={cStyles.scheduleRow}>
                            {partner.phone && (
                              <TouchableOpacity style={cStyles.whatsappBtn} onPress={handleBookNowWhatsApp} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('recipient.achievement.whatsappA11y')}>
                                <MessageCircle size={16} color={colors.white} />
                                <Text style={cStyles.scheduleBtnText}>{t('recipient.achievement.whatsappButton')}</Text>
                              </TouchableOpacity>
                            )}
                            {(partner.contactEmail || partner.email) && (
                              <TouchableOpacity style={cStyles.emailBtn} onPress={handleBookNowEmail} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('recipient.achievement.emailA11y')}>
                                <Mail size={16} color={colors.white} />
                                <Text style={cStyles.scheduleBtnText}>{t('recipient.achievement.emailButton')}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}
              {/* ─── Share ─── */}
              <View style={{ marginTop: Spacing.lg, width: '80%', alignSelf: 'center' }}>
                <Button
                  variant="primary"
                  title={t('recipient.achievement.shareButton')}
                  onPress={() => { analyticsService.trackEvent('button_click', 'social', { buttonName: 'share_achievement', goalId: goal?.id }, 'AchievementDetailScreen'); navigation.navigate('ShareGoal', { goal, experienceGift: experienceGiftParam, sessions, sessionStreak }); }}
                  fullWidth
                />
              </View>
            </Card>

            {!isCompletion && (
              <>
                {/* ─── 4. Sessions History ─── */}
                <View style={cStyles.section}>
                  <Text style={cStyles.sectionTitle}>
                    {t('recipient.achievement.sessionsHeader')} <Text style={cStyles.countBadge}>{sessions.length}</Text>
                  </Text>
                  {sessionsLoading && sessions.length === 0 ? (
                    <View style={{ gap: Spacing.sm }}>
                      <SessionCardSkeleton />
                      <SessionCardSkeleton />
                      <SessionCardSkeleton />
                    </View>
                  ) : sessions.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyIcon}>🏃</Text>
                      <Text style={styles.emptyText}>{t('recipient.achievement.noSessions')}</Text>
                    </View>
                  ) : (
                    <View>
                      {sessions.map((s, i) => (
                        <SessionCard key={s.id} session={s} index={i} motivations={motivationsBySession[s.sessionNumber] || []} />
                      ))}
                    </View>
                  )}
                </View>

                {/* ─── 5. Hints History ─── */}
                {hasHints && (
                  <View style={cStyles.section}>
                    <Text style={cStyles.sectionTitle}>
                      {t('recipient.achievement.hintsHeader')} <Text style={cStyles.countBadge}>{hintsArray.length}</Text>
                    </Text>
                    <View>
                      {(hintsArray as HintEntry[])
                        .slice()
                        .sort((a: HintEntry, b: HintEntry) => {
                          const sessionA = ('forSessionNumber' in a ? a.forSessionNumber : undefined) || ('session' in a ? a.session : 0) || 0;
                          const sessionB = ('forSessionNumber' in b ? b.forSessionNumber : undefined) || ('session' in b ? b.session : 0) || 0;
                          return Number(sessionB) - Number(sessionA);
                        })
                        .map((h: HintEntry, i: number) => {
                          const session = ('forSessionNumber' in h ? h.forSessionNumber : undefined) || ('session' in h ? h.session : 0) || 0;
                          let dateMs = 0;
                          if (h.createdAt) {
                            if (h.createdAt && typeof h.createdAt === 'object' && 'toMillis' in h.createdAt && typeof h.createdAt.toMillis === 'function') {
                              dateMs = h.createdAt.toMillis();
                            } else if (h.createdAt instanceof Date) {
                              dateMs = h.createdAt.getTime();
                            } else {
                              dateMs = new Date(h.createdAt).getTime();
                            }
                          } else if (h.date) {
                            dateMs = h.date;
                          }
                          return <HintItem key={`${session}-${dateMs}`} hint={h} index={i} onImagePress={handleHintImagePress} />;
                        })}
                    </View>
                  </View>
                )}
              </>
            )}

            {/* ─── 7. Streak CTA (completion mode only) ─── */}
            {isCompletion && (
              <View style={styles.ctaSection}>
                {sessionStreak >= 3 && (
                  <View style={styles.streakBadge}>
                    <Flame color={getFlameHex(sessionStreak)} size={28} fill={getFlameHex(sessionStreak)} />
                    <Text style={[styles.streakCount, { color: getFlameHex(sessionStreak) }]}>{sessionStreak}</Text>
                    <Text style={styles.streakLabel}>{t('recipient.achievement.streakLabel')}</Text>
                  </View>
                )}

                {otherActiveGoals === 0 ? (
                  <>
                    <Text style={styles.ctaTitle}>
                      {sessionStreak >= 3 ? t('recipient.achievement.ctaKeepStreak', { count: sessionStreak }) : t('recipient.achievement.ctaNextChallenge')}
                    </Text>
                    {sessionStreak >= 3 && (
                      <Text style={styles.ctaMessage}>{t('recipient.achievement.ctaStreakMessage')}</Text>
                    )}
                    <TouchableOpacity style={styles.ctaPrimary} onPress={() => navigation.navigate('MainTabs', { screen: 'HomeTab', params: { screen: 'CategorySelection' } })} accessibilityRole="button" accessibilityLabel={t('recipient.achievement.browseA11y')}>
                      <Text style={styles.ctaPrimaryText}>{t('recipient.achievement.browseButton')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.ctaSecondary} onPress={() => navigation.navigate('Goals')} accessibilityRole="button" accessibilityLabel={t('recipient.achievement.backToGoalsA11y')}>
                      <Text style={styles.ctaSecondaryText}>{t('recipient.achievement.backToGoals')}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.ctaTitle}>
                      {sessionStreak >= 3 ? t('recipient.achievement.ctaStreakContinues', { count: sessionStreak }) : t('recipient.achievement.ctaActiveGoals')}
                    </Text>
                    {sessionStreak >= 3 && (
                      <Text style={styles.ctaMessage}>{t('recipient.achievement.ctaStreakContinuesMessage')}</Text>
                    )}
                    <TouchableOpacity style={styles.ctaPrimary} onPress={() => navigation.navigate('Goals')} accessibilityRole="button" accessibilityLabel={t('recipient.achievement.backToGoalsA11y')}>
                      <Text style={styles.ctaPrimaryText}>{t('recipient.achievement.backToGoals')}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

          </View>
        </ScrollView>

        {/* ImageViewer for hint images */}
        {selectedImageUri && (
          <ImageViewer visible={!!selectedImageUri} imageUri={selectedImageUri} onClose={() => setSelectedImageUri(null)} />
        )}

        {/* Booking Calendar */}
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

// ─────────────────────────────────────────────────────────────
// STYLES - cStyles for completed-goal layout (from JourneyScreen)
// ─────────────────────────────────────────────────────────────
const createCStyles = (colors: typeof Colors) => StyleSheet.create({
  statChip: {
    alignItems: 'center' as const,
    backgroundColor: colors.backgroundLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    minWidth: 80,
  },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { ...Typography.subheading, color: colors.textPrimary, marginBottom: Spacing.sm },
  countBadge: { ...Typography.captionBold, color: colors.primary },
  experienceName: { ...Typography.subheading, color: colors.textPrimary, marginBottom: Spacing.xs },
  experienceSubtitle: { ...Typography.small, color: colors.textSecondary },
  rewardDivider: { height: 1, backgroundColor: colors.border, marginVertical: Spacing.md },
  couponCard: {
    backgroundColor: colors.primarySurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginBottom: Spacing.md,
  },
  couponRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  couponLabel: { ...Typography.captionBold, color: colors.textPrimary },
  couponCodeBox: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: Spacing.sm,
  },
  couponCodeText: { ...Typography.large, letterSpacing: 3, color: colors.textPrimary },
  copyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm },
  copyText: { ...Typography.smallBold, color: colors.primary },
  contactCard: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: Spacing.md,
  },
  contactTitle: { ...Typography.smallBold, color: colors.textPrimary, marginBottom: Spacing.md },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  contactLabel: { ...Typography.tiny, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  contactValue: { ...Typography.smallBold, color: colors.textPrimary, marginTop: Spacing.xxs },
  smallCopyBtn: { padding: Spacing.xs },
  scheduleRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  whatsappBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, backgroundColor: colors.whatsappGreen, paddingVertical: Spacing.md, borderRadius: BorderRadius.sm,
  },
  emailBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, backgroundColor: colors.secondary, paddingVertical: Spacing.md, borderRadius: BorderRadius.sm,
  },
  scheduleBtnText: { color: colors.white, ...Typography.captionBold },
});

// ─────────────────────────────────────────────────────────────
// STYLES - remaining styles
// ─────────────────────────────────────────────────────────────
const createStyles = (colors: typeof Colors) => StyleSheet.create({
  emptyContainer: { alignItems: 'center', paddingVertical: Spacing.xxxl },
  emptyIcon: { fontSize: Typography.displayLarge.fontSize, marginBottom: Spacing.xs },
  emptyText: { color: colors.textSecondary, ...Typography.subheading },
  ctaSection: {
    backgroundColor: colors.surface,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    alignItems: 'center' as const,
    ...Shadows.sm,
  },
  streakBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: Spacing.sm,
    backgroundColor: colors.warningLight,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.lg,
  },
  streakCount: { ...Typography.displayBold, color: colors.warning },
  streakLabel: { ...Typography.bodyBold, color: colors.warningDark },
  ctaTitle: { ...Typography.large, color: colors.textPrimary, textAlign: 'center' as const, marginBottom: Spacing.sm },
  ctaMessage: { ...Typography.small, color: colors.textSecondary, textAlign: 'center' as const, lineHeight: 20, marginBottom: Spacing.lg },
  ctaPrimary: { backgroundColor: colors.secondary, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxxl, borderRadius: BorderRadius.lg, marginTop: Spacing.sm, width: '100%' as DimensionValue, alignItems: 'center' as const },
  ctaPrimaryText: { color: colors.white, ...Typography.subheading },
  ctaSecondary: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxxl, borderRadius: BorderRadius.lg, marginTop: Spacing.sm, width: '100%' as DimensionValue, alignItems: 'center' as const, borderWidth: 1, borderColor: colors.border },
  ctaSecondaryText: { color: colors.textSecondary, ...Typography.subheading },
});

export default AchievementDetailScreen;
