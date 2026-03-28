import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Animated, Easing, TouchableOpacity,
  Platform, Linking, Dimensions, DimensionValue,
} from 'react-native';
import { MotiView } from 'moti';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
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
import MainScreen from '../MainScreen';
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
import { captureRef } from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import { Trophy, Gift, Copy, CheckCircle, Sparkles, Ticket, MessageCircle, Mail, Share as ShareIcon, Clock, PlayCircle, Flame } from 'lucide-react-native';
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
  const goal: Goal | null = rawGoal ? {
    ...rawGoal,
    startDate: toDate(rawGoal.startDate)!,
    endDate: toDate(rawGoal.endDate)!,
    createdAt: toDate(rawGoal.createdAt)!,
    updatedAt: toDate(rawGoal.updatedAt),
    completedAt: toDate(rawGoal.completedAt),
  } : null;

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

  // Share
  const shareCardRef = useRef<View>(null);
  const [shareFormat, setShareFormat] = useState<'story' | 'square'>('story');
  const [isSharing, setIsSharing] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Completion mode — streak & active goals
  const [sessionStreak, setSessionStreak] = useState(0);
  const [otherActiveGoals, setOtherActiveGoals] = useState(0);

  // Completion mode — payment pending
  const [paymentPending, setPaymentPending] = useState(false);

  // Completion mode — celebration message (randomised once on mount)
  const [celebrationMessage] = useState(() => {
    const messages = ['Incredible!', 'You crushed it!', 'Legend!', 'Unstoppable!', 'Champion!', 'Phenomenal!'];
    return messages[Math.floor(Math.random() * messages.length)];
  });

  // Confetti ref
  const confettiRef = useRef<InstanceType<typeof ConfettiCannon>>(null);

  // Booking
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [bookingMethod, setBookingMethod] = useState<'whatsapp' | 'email' | null>(null);

  // Goal type emoji mapping (used in share card)
  const GOAL_TYPE_EMOJI: Record<string, string> = {
    fitness: '💪', yoga: '🧘', meditation: '🧠', running: '🏃',
    cycling: '🚴', swimming: '🏊', reading: '📚', writing: '✍️',
    cooking: '👨‍🍳', music: '🎵', art: '🎨', dance: '💃',
    hiking: '🥾', study: '📖', code: '💻', default: '🏆',
  };
  const goalTypeEmoji = GOAL_TYPE_EMOJI[goal?.goalType || ''] || GOAL_TYPE_EMOJI.default;

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

  // Format completion date
  const completedAtValue = goal?.completedAt;
  const parsedDate = completedAtValue instanceof Timestamp
    ? completedAtValue.toDate()
    : completedAtValue ? new Date(completedAtValue as Date) : null;
  const completedDate = parsedDate && !isNaN(parsedDate.getTime())
    ? parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // Cleanup copy timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // ───── Data fetching - 3 useEffects ─────

  // useEffect 1 - Experience, partner, coupon, userName
  useEffect(() => {
    if (!goal) {
      navigation.navigate('Profile');
      return;
    }
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // User name
        if (goal.userId) {
          const name = await userService.getUserName(goal.userId);
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
            if (gift) expId = gift.experienceId;
          } catch (error: unknown) {
            logger.warn('Failed to load experience gift:', error);
          }
        }

        if (expId) {
          const exp = await experienceService.getExperienceById(expId);
          setExperience(exp);
          if (exp?.partnerId) {
            const partnerData = await partnerService.getPartnerById(exp.partnerId);
            setPartner(partnerData);
          }
        }

        // Existing coupon - check goal first, then Firestore
        if (goal.couponCode) {
          setCouponCode(goal.couponCode);
        } else if (goal.experienceGiftId) {
          const couponsRef = collection(db, 'partnerCoupons');
          const q = query(couponsRef, where('goalId', '==', goal.id), limit(1));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            setCouponCode(snapshot.docs[0].data().code);
          } else if (!goal.isFreeGoal && expId && goal.userId) {
            // Completion mode: attempt to generate coupon for paid goals
            try {
              const code = await generateCouponForGoal(goal.id, goal.userId, partner?.id || '');
              setCouponCode(code);
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? err.message : String(err);
              if (errMsg.includes('PAYMENT_PENDING')) {
                setPaymentPending(true);
              } else {
                logger.warn('Coupon generation failed:', err);
              }
            }
          }
        }
      } catch (error: unknown) {
        logger.error('Error fetching achievement data:', error);
        showError('Could not load achievement details.');
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [goal?.id]);

  // useEffect 2 - Sessions
  useEffect(() => {
    if (!goal?.id) return;
    const loadSessions = async () => {
      setSessionsLoading(true);
      try {
        const data = await sessionService.getSessionsForGoal(goal.id);
        setSessions(data);
      } catch (error: unknown) {
        logger.error('Error fetching sessions:', error);
      } finally {
        setSessionsLoading(false);
      }
    };
    loadSessions();
  }, [goal?.id]);

  // useEffect — Completion mode: haptics, confetti, streak & active goals
  useEffect(() => {
    if (!isCompletion) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => confettiRef.current?.start(), 300);
  }, [isCompletion]);

  useEffect(() => {
    if (!isCompletion || !goal?.userId) return;
    const fetchStreakAndGoals = async () => {
      try {
        const userDocSnap = await getDoc(doc(db, 'users', goal.userId));
        if (userDocSnap.exists()) {
          setSessionStreak(userDocSnap.data().sessionStreak || 0);
        }
        const allGoals = await goalService.getUserGoals(goal.userId);
        setOtherActiveGoals(allGoals.filter((g: Goal) => g.id !== goal.id && !g.isCompleted).length);
      } catch (error: unknown) {
        logger.error('Error fetching streak/goals:', error);
      }
    };
    fetchStreakAndGoals();
  }, [isCompletion, goal?.userId, goal?.id]);

  // useEffect 3 - Motivations
  useEffect(() => {
    if (!goal?.id) return;
    const fetchMotivations = async () => {
      try {
        const data = await motivationService.getAllMotivations(goal.id);
        setMotivations(data);
      } catch (error: unknown) {
        logger.error('Error fetching motivations:', error);
      }
    };
    fetchMotivations();
  }, [goal?.id]);

  // ───── Handler functions ─────
  const handleCopy = useCallback(async () => {
    if (!couponCode) return;
    await Clipboard.setStringAsync(couponCode);
    setIsCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
  }, [couponCode]);

  const handleCopyPhone = useCallback(async () => {
    if (!partner?.phone) return;
    await Clipboard.setStringAsync(partner.phone);
    setIsPhoneCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsPhoneCopied(false), 2000);
  }, [partner?.phone]);

  const handleCopyEmail = useCallback(async () => {
    const contactEmail = partner?.contactEmail || partner?.email;
    if (!contactEmail) return;
    await Clipboard.setStringAsync(contactEmail);
    setIsEmailCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsEmailCopied(false), 2000);
  }, [partner?.contactEmail, partner?.email]);

  const handleEmailFallback = useCallback((url: string) => {
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        showInfo('Could not open email client.');
      }
    }).catch(() => showInfo('Could not open email client.'));
  }, []);

  const handleWhatsAppSchedule = useCallback(() => {
    if (!partner?.phone || !experience) return;

    const dateString = preferredDate
      ? preferredDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
      : 'at your earliest convenience';

    const message = `Hi ${partner.name || 'there'}!\n\nI'm ${userName} and I've completed my Ernit goal and earned ${experience.title}!\n\nI'd like to schedule my experience for ${dateString}.\n\nLooking forward to it!`;

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
        showInfo('WhatsApp is not installed. Please use email to contact the partner.');
      }
    }).catch(() => showInfo('WhatsApp is not installed. Please use email to contact the partner.'));
  }, [partner, experience, preferredDate, userName]);

  const handleEmailSchedule = useCallback(() => {
    if (!partner || !experience) return;
    const contactEmail = partner.contactEmail || partner.email;
    if (!contactEmail) {
      showInfo('Partner email is not available.');
      return;
    }

    const dateString = preferredDate
      ? preferredDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
      : 'at your earliest convenience';

    const message = `Hi ${partner.name || 'there'}!\n\nI'm ${userName} and I've completed my Ernit goal and earned ${experience.title}!\n\nI'd like to schedule my experience for ${dateString}.\n\nLooking forward to it!`;

    const subject = `Experience Booking - ${experience.title}`;
    const emailUrl = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    handleEmailFallback(emailUrl);
  }, [partner, experience, preferredDate, userName, handleEmailFallback]);

  const handleBookNowWhatsApp = useCallback(() => {
    setBookingMethod('whatsapp');
    setShowCalendar(true);
  }, []);

  const handleBookNowEmail = useCallback(() => {
    setBookingMethod('email');
    setShowCalendar(true);
  }, []);

  const handleConfirmBooking = useCallback((date: Date) => {
    setPreferredDate(date);
    setShowCalendar(false);

    if (bookingMethod === 'whatsapp') {
      handleWhatsAppSchedule();
    } else if (bookingMethod === 'email') {
      handleEmailSchedule();
    }
  }, [bookingMethod, handleWhatsAppSchedule, handleEmailSchedule]);

  const handleCancelBooking = useCallback(() => {
    setPreferredDate(null);
    setShowCalendar(false);

    if (bookingMethod === 'whatsapp') {
      handleWhatsAppSchedule();
    } else if (bookingMethod === 'email') {
      handleEmailSchedule();
    }
  }, [bookingMethod, handleWhatsAppSchedule, handleEmailSchedule]);

  const handleShare = useCallback(async () => {
    if (!shareCardRef.current) return;
    setIsSharing(true);
    try {
      if (Platform.OS === 'web') {
        // Web: capture as data URI since tmpfile is native-only
        const dataUri = await captureRef(shareCardRef, {
          format: 'png',
          quality: 1,
          result: 'data-uri',
        });

        // Convert data URI to File for Web Share API
        const res = await fetch(dataUri);
        const blob = await res.blob();
        const file = new File([blob], 'ernit-achievement.png', { type: 'image/png' });

        // Use Web Share API with files (works on mobile browsers for Instagram)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'My Achievement',
            text: 'Check out my achievement on Ernit!',
          });
        } else {
          // Fallback: download the image so the user can share manually
          const link = document.createElement('a');
          link.href = dataUri;
          link.download = 'ernit-achievement.png';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          showInfo('Image saved! Share it to Instagram from your gallery.');
        }
      } else {
        // Native: use tmpfile + expo-sharing
        const uri = await captureRef(shareCardRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
        });
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: 'Share your achievement',
          });
        } else {
          showInfo('Sharing is not available on this device');
        }
      }
    } catch (error: unknown) {
      logger.error('Error sharing achievement:', error);
      showError('Could not share. Please try again.');
    } finally {
      setIsSharing(false);
    }
  }, []);

  // ───── HintItem callback ─────
  const handleHintImagePress = useCallback((uri: string) => {
    setSelectedImageUri(uri);
  }, []);

  // ───── Null/loading guard ─────
  if (!goal) {
    return (
      <ErrorBoundary screenName="AchievementDetailScreen" userId={state.user?.id}>
        <MainScreen activeRoute="Profile">
          <StatusBar style="light" />
          <SharedHeader title="Achievement" showBack />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary, ...Typography.subheading }}>Redirecting...</Text>
          </View>
        </MainScreen>
      </ErrorBoundary>
    );
  }

  // ───── JSX STRUCTURE ─────
  if (error && !isLoading) {
    return (
      <ErrorBoundary screenName="AchievementDetailScreen" userId={state.user?.id}>
        <MainScreen activeRoute="Profile">
          <StatusBar style="light" />
          <SharedHeader title="Achievement" showBack />
          <ErrorRetry
            message="Could not load achievement details"
            onRetry={() => {
              setError(false);
              setIsLoading(true);
              // Re-fetch by re-triggering the useEffect dependency
              const fetchData = async () => {
                try {
                  if (goal?.userId) {
                    const name = await userService.getUserName(goal.userId);
                    setUserName(name || 'User');
                  }
                } catch (err: unknown) {
                  logger.error('Retry failed:', err);
                  setError(true);
                } finally {
                  setIsLoading(false);
                }
              };
              fetchData();
            }}
          />
        </MainScreen>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="AchievementDetailScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Profile">
        <StatusBar style="light" />
        <SharedHeader title="Achievement" showBack />

        {/* Off-screen Share Card — hero-style tilted design */}
        <View style={{ position: 'absolute', left: -9999, overflow: 'hidden', height: 0 }}>
          <View ref={shareCardRef} style={{ width: 1080, height: shareFormat === 'story' ? 1920 : 1080, backgroundColor: colors.primaryDark }} collapsable={false}>
            <LinearGradient colors={[colors.primaryDark, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ flex: 1, padding: 100, justifyContent: 'center', alignItems: 'center' }}>

              {/* Tilted card pair */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 80, gap: -40 }}>
                {/* Left card — goal emoji */}
                <View style={{ width: 320, height: 420, backgroundColor: colors.primaryDark, borderRadius: 40, justifyContent: 'center', alignItems: 'center', transform: [{ rotate: '-6deg' }], shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 30, elevation: 16 }}>
                  <Text style={{ fontSize: 120 }}>{goalTypeEmoji}</Text>
                </View>
                {/* Right card — experience image or gift emoji */}
                <View style={{ width: 320, height: 420, backgroundColor: colors.primaryDark, borderRadius: 40, justifyContent: 'center', alignItems: 'center', transform: [{ rotate: '6deg' }], shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 30, elevation: 16, overflow: 'hidden' }}>
                  {experienceImage ? (
                    <Image source={{ uri: experienceImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" accessible={false} />
                  ) : (
                    <Text style={{ fontSize: 120 }}>🎁</Text>
                  )}
                </View>
              </View>

              {/* Title */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 24 }}>
                <CheckCircle color={colors.white} size={60} />
                <Text style={{ fontSize: 52, fontWeight: '800', color: colors.white, textTransform: 'uppercase', letterSpacing: 4 }}>GOAL COMPLETED</Text>
              </View>

              {/* Goal title */}
              <Text style={{ fontSize: 56, fontWeight: '700', color: colors.primaryTint, textAlign: 'center', marginBottom: 60 }}>
                {goal.title || goal.description || ''}
              </Text>

              {/* Stats row */}
              <View style={{ flexDirection: 'row', gap: 60, backgroundColor: colors.whiteAlpha15, borderRadius: 30, paddingVertical: 40, paddingHorizontal: 80, marginBottom: 80 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 80, fontWeight: '800', color: colors.white }}>{totalSessions}</Text>
                  <Text style={{ fontSize: 28, fontWeight: '600', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 3 }}>SESSIONS</Text>
                </View>
                <View style={{ width: 2, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 1 }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 80, fontWeight: '800', color: colors.white }}>{goal.targetCount || 0}</Text>
                  <Text style={{ fontSize: 28, fontWeight: '600', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 3 }}>WEEKS</Text>
                </View>
                {sessionStreak >= 3 && (
                  <>
                    <View style={{ width: 2, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 1 }} />
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 80, fontWeight: '800', color: colors.celebrationGold }}>{sessionStreak}</Text>
                      <Text style={{ fontSize: 28, fontWeight: '600', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 3 }}>STREAK</Text>
                    </View>
                  </>
                )}
              </View>

              {/* Footer */}
              <View style={{ position: 'absolute', bottom: 80, alignItems: 'center' }}>
                <Image source={require('../../assets/favicon.png')} style={{ width: 70, height: 70, marginBottom: 16 }} contentFit="contain" cachePolicy="memory-disk" accessible={false} />
                <Text style={{ fontSize: 32, color: 'rgba(255,255,255,0.4)' }}>Earned with Ernit</Text>
              </View>
            </LinearGradient>
          </View>
        </View>

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
                Goal Completed
              </Text>

              {isCompletion && (
                <Text style={[Typography.subheading, { color: colors.primary, marginTop: Spacing.xs, textAlign: 'center' }]}>
                  {celebrationMessage}
                </Text>
              )}

              {/* Stats chips row */}
              <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, flexWrap: 'wrap', justifyContent: 'center' }}>
                <View style={cStyles.statChip}>
                  <Text style={[Typography.heading2, { color: colors.textPrimary }]}>{totalSessions}</Text>
                  <Text style={[Typography.caption, { color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }]}>Sessions</Text>
                </View>
                <View style={cStyles.statChip}>
                  <Text style={[Typography.heading2, { color: colors.textPrimary }]}>{goal.targetCount || 0}</Text>
                  <Text style={[Typography.caption, { color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }]}>Weeks</Text>
                </View>
                {isCompletion && sessionStreak >= 3 && (
                  <View style={[cStyles.statChip, { backgroundColor: colors.warningLight }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                      <Flame color={colors.warning} size={18} fill={colors.warning} />
                      <Text style={[Typography.heading2, { color: colors.warning }]}>{sessionStreak}</Text>
                    </View>
                    <Text style={[Typography.caption, { color: colors.warningDark, textTransform: 'uppercase', letterSpacing: 1 }]}>Streak</Text>
                  </View>
                )}
              </View>

              {completedDate && (
                <Text style={[Typography.caption, { color: colors.textMuted, marginTop: Spacing.md }]}>
                  Completed {completedDate}
                </Text>
              )}
            </Card>

            {/* ─── 2. Achievement Info ─── */}
            <View style={cStyles.section}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md }}>
                <CheckCircle color={colors.secondary} size={20} />
                <Text style={cStyles.sectionTitle}>Your Achievement</Text>
              </View>
              <Text style={{ ...Typography.large, color: colors.textPrimary, marginBottom: Spacing.xs }}>{goal.title}</Text>
              {goal.description ? (
                <Text style={{ ...Typography.small, color: colors.textSecondary, lineHeight: 20, marginBottom: Spacing.md }}>{goal.description}</Text>
              ) : null}
              <View style={{ backgroundColor: colors.warningLight, borderRadius: BorderRadius.md, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm }}>
                <Sparkles color={colors.celebrationGold} size={18} />
                <Text style={{ ...Typography.heading1Bold, color: colors.warning }}>{totalSessions}</Text>
                <Text style={{ ...Typography.smallBold, color: colors.warningDark }}>Sessions Completed</Text>
              </View>
            </View>

            {/* ─── 3. Experience/Reward ─── */}
            {(hasReward || (goal.isFreeGoal && goal.pledgedExperience)) && (
              <View style={cStyles.section}>
                <Text style={cStyles.sectionTitle}>
                  <Gift size={15} color={colors.primary} />  Your Reward
                </Text>

                {/* Experience image */}
                {(goal.pledgedExperience?.coverImageUrl || experienceImage) && (
                  <Image
                    source={{ uri: experienceImage || goal.pledgedExperience?.coverImageUrl }}
                    style={{ width: '100%', height: vh(180), borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg, backgroundColor: colors.backgroundLight }}
                  />
                )}

                <View style={cStyles.experienceBody}>
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

                  {/* Coupon & partner contact */}
                  {(goal.experienceGiftId || goal.giftAttachedAt) && (
                    <>
                      <View style={cStyles.rewardDivider} />

                      {/* Coupon */}
                      {couponCode ? (
                        <View style={cStyles.couponCard}>
                          <View style={cStyles.couponRow}>
                            <Ticket size={18} color={colors.primary} />
                            <Text style={cStyles.couponLabel}>Your Redemption Code</Text>
                          </View>
                          <View style={cStyles.couponCodeBox}>
                            <Text style={cStyles.couponCodeText}>{couponCode}</Text>
                          </View>
                          <TouchableOpacity style={cStyles.copyButton} onPress={handleCopy} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Copy coupon code">
                            {isCopied ? <CheckCircle size={16} color={colors.secondary} /> : <Copy size={16} color={colors.primary} />}
                            <Text style={[cStyles.copyText, isCopied && { color: colors.secondary }]}>
                              {isCopied ? 'Copied!' : 'Copy Code'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : isLoading ? (
                        <View style={{ padding: Spacing.sm }}><ExperienceCardSkeleton /></View>
                      ) : null}

                      {/* Partner contact */}
                      {partner && (partner.phone || partner.contactEmail || partner.email) && (
                        <View style={cStyles.contactCard}>
                          <Text style={cStyles.contactTitle}>Partner Contact</Text>
                          {partner.phone && (
                            <View style={cStyles.contactRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={cStyles.contactLabel}>Phone (WhatsApp)</Text>
                                <Text style={cStyles.contactValue}>{partner.phone}</Text>
                              </View>
                              <TouchableOpacity onPress={handleCopyPhone} style={cStyles.smallCopyBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Copy phone number">
                                {isPhoneCopied ? <CheckCircle size={16} color={colors.secondary} /> : <Copy size={16} color={colors.textSecondary} />}
                              </TouchableOpacity>
                            </View>
                          )}
                          {(partner.contactEmail || partner.email) && (
                            <View style={cStyles.contactRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={cStyles.contactLabel}>Email</Text>
                                <Text style={[cStyles.contactValue, { ...Typography.caption }]}>{partner.contactEmail || partner.email}</Text>
                              </View>
                              <TouchableOpacity onPress={handleCopyEmail} style={cStyles.smallCopyBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Copy email address">
                                {isEmailCopied ? <CheckCircle size={16} color={colors.secondary} /> : <Copy size={16} color={colors.textSecondary} />}
                              </TouchableOpacity>
                            </View>
                          )}
                          <View style={cStyles.scheduleRow}>
                            {partner.phone && (
                              <TouchableOpacity style={cStyles.whatsappBtn} onPress={handleBookNowWhatsApp} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Schedule via WhatsApp">
                                <MessageCircle size={16} color={colors.white} />
                                <Text style={cStyles.scheduleBtnText}>WhatsApp</Text>
                              </TouchableOpacity>
                            )}
                            {(partner.contactEmail || partner.email) && (
                              <TouchableOpacity style={cStyles.emailBtn} onPress={handleBookNowEmail} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Schedule via Email">
                                <Mail size={16} color={colors.white} />
                                <Text style={cStyles.scheduleBtnText}>Email</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </View>
              </View>
            )}

            {!isCompletion && (
              <>
                {/* ─── 4. Sessions History ─── */}
                <View style={cStyles.section}>
                  <Text style={cStyles.sectionTitle}>
                    Sessions <Text style={cStyles.countBadge}>{sessions.length}</Text>
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
                      <Text style={styles.emptyText}>No sessions recorded</Text>
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
                      Hints <Text style={cStyles.countBadge}>{hintsArray.length}</Text>
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

            {/* ─── 6. Share Section ─── */}
            <View style={cStyles.section}>
              <Text style={cStyles.sectionTitle}>Share Your Achievement</Text>
              <View style={styles.shareFormatToggle}>
                <TouchableOpacity
                  style={[styles.shareFormatOption, shareFormat === 'story' && styles.shareFormatActive]}
                  onPress={() => setShareFormat('story')}
                >
                  <Text style={[styles.shareFormatText, shareFormat === 'story' && styles.shareFormatTextActive]}>
                    Story (9:16)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.shareFormatOption, shareFormat === 'square' && styles.shareFormatActive]}
                  onPress={() => setShareFormat('square')}
                >
                  <Text style={[styles.shareFormatText, shareFormat === 'square' && styles.shareFormatTextActive]}>
                    Square (1:1)
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.shareButton} onPress={handleShare} disabled={isSharing} activeOpacity={0.7}>
                <ShareIcon color={colors.white} size={20} />
                <Text style={styles.shareButtonText}>{isSharing ? 'Preparing...' : 'Share'}</Text>
              </TouchableOpacity>
            </View>

            {/* ─── 7. Streak CTA (completion mode only) ─── */}
            {isCompletion && (
              <View style={styles.ctaSection}>
                {sessionStreak >= 3 && (
                  <View style={styles.streakBadge}>
                    <Flame color={colors.warning} size={28} fill={colors.warning} />
                    <Text style={styles.streakCount}>{sessionStreak}</Text>
                    <Text style={styles.streakLabel}>session streak</Text>
                  </View>
                )}

                {otherActiveGoals === 0 ? (
                  <>
                    <Text style={styles.ctaTitle}>
                      {sessionStreak >= 3 ? `Keep your ${sessionStreak}-session streak alive!` : 'Ready for your next challenge?'}
                    </Text>
                    {sessionStreak >= 3 && (
                      <Text style={styles.ctaMessage}>Start a new goal to keep it going — your streak resets after 7 days of inactivity</Text>
                    )}
                    <TouchableOpacity style={styles.ctaPrimary} onPress={() => navigation.navigate('CategorySelection')} accessibilityRole="button" accessibilityLabel="Browse experiences">
                      <Text style={styles.ctaPrimaryText}>Browse Experiences</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.ctaSecondary} onPress={() => navigation.navigate('Goals')} accessibilityRole="button" accessibilityLabel="Back to goals">
                      <Text style={styles.ctaSecondaryText}>Back to Goals</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.ctaTitle}>
                      {sessionStreak >= 3 ? `Your ${sessionStreak}-session streak continues!` : 'You still have active goals — keep going!'}
                    </Text>
                    {sessionStreak >= 3 && (
                      <Text style={styles.ctaMessage}>Keep going with your other goals to build it even higher</Text>
                    )}
                    <TouchableOpacity style={styles.ctaPrimary} onPress={() => navigation.navigate('Goals')} accessibilityRole="button" accessibilityLabel="Back to goals">
                      <Text style={styles.ctaPrimaryText}>Back to Goals</Text>
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
      </MainScreen>
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
  experienceBody: {
    backgroundColor: colors.white,
    padding: Spacing.md,
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.border,
  },
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
  shareFormatToggle: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.xxs,
    marginBottom: Spacing.md,
  },
  shareFormatOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  shareFormatActive: {
    backgroundColor: colors.white,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  shareFormatText: { ...Typography.smallBold, color: colors.textMuted },
  shareFormatTextActive: { color: colors.primaryDark },
  shareButton: {
    backgroundColor: colors.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  shareButtonText: { color: colors.white, ...Typography.bodyBold },
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
