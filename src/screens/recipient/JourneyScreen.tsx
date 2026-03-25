import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Animated, Easing, TouchableOpacity,
  Platform, Linking, LayoutAnimation, RefreshControl, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { doc, onSnapshot, getDoc, collection, getDocs, query, limit, Timestamp } from 'firebase/firestore';
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
import { useRecipientNavigation } from '../../types/navigation';
import { generateCouponForGoal } from '../../services/CouponService';
import { isSelfGifted } from '../../types';
import MainScreen from '../MainScreen';
import DetailedGoalCard from './DetailedGoalCard';
import { goalService, normalizeGoal } from '../../services/GoalService';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { experienceService } from '../../services/ExperienceService';
import { partnerService } from '../../services/PartnerService';
import { userService } from '../../services/userService';
import { sessionService } from '../../services/SessionService';
import { motivationService } from '../../services/MotivationService';
import SharedHeader from '../../components/SharedHeader';
import { FOOTER_HEIGHT } from '../../components/FooterNavigation';
import AudioPlayer from '../../components/AudioPlayer';
import ImageViewer from '../../components/ImageViewer';
import { SessionCardSkeleton } from '../../components/SkeletonLoader';
import { BookingCalendar } from '../../components/BookingCalendar';
import { Clock, PlayCircle, Gift, ShoppingBag, Check, Trophy, Copy, CheckCircle, Ticket, MessageCircle, Mail, Sparkles, Share as ShareIcon } from 'lucide-react-native';
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
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { vh } from '../../utils/responsive';
import { toJSDate } from '../../utils/GoalHelpers';
import Button from '../../components/Button';

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
      {[TAB_SESSIONS, TAB_HINTS].map((tab) => (
        <TouchableOpacity
          key={tab}
          style={segStyles.tab}
          onPress={() => onTabChange(tab as TabKey)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${tab} tab`}
        >
          <Text
            style={[
              segStyles.tabLabel,
              activeTab === tab && segStyles.tabLabelActive,
            ]}
          >
            {tab}
          </Text>
        </TouchableOpacity>
      ))}
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
    ...Typography.small,
    fontWeight: '600',
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
    if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggleExpand();
  };

  const toggleMotivations = () => {
    if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMotivationsExpanded(!motivationsExpanded);
  };

  useEffect(() => {
    if (!isExpanded && videoRef.current) {
      videoRef.current.pauseAsync();
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
              <Text style={sessStyles.weekBadge}>Week {session.weekNumber + 1}</Text>
            </View>
          </View>

          {/* Right: media thumbnail (if any) */}
          {session.mediaUrl && (
            <View style={sessStyles.thumb}>
              <Image source={{ uri: session.mediaUrl }} style={sessStyles.thumbImg} />
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
                <Text style={sessStyles.notesLabel}>Notes</Text>
                <Text style={sessStyles.notesText}>{session.notes}</Text>
              </View>
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
            accessibilityLabel={`${motivationsExpanded ? 'Hide' : 'Show'} motivations`}
          >
            <MessageCircle size={14} color={colors.primary} />
            <Text style={sessStyles.motivationToggleText}>
              {motivations.length} motivation{motivations.length !== 1 ? 's' : ''} from friends
            </Text>
          </TouchableOpacity>

          {motivationsExpanded && (
            <View style={sessStyles.motivationList}>
              {motivations.map((m) => (
                <View key={m.id} style={sessStyles.motivationItem}>
                  {m.authorProfileImage ? (
                    <Image source={{ uri: m.authorProfileImage }} style={sessStyles.motivationAvatar} />
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
    ...Typography.small,
    fontWeight: '800',
    color: colors.primary,
  },
  details: { flex: 1 },
  date: {
    ...Typography.small,
    fontWeight: '600',
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
    ...Typography.caption,
    fontWeight: '600',
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
    ...Typography.caption,
    fontWeight: '700',
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
    ...Typography.caption,
    fontWeight: '700',
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
    ...Typography.caption,
    fontWeight: '700',
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
      <Text style={{ fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.xs }}>
        {fmt(dateMs)}
      </Text>

      {hasImage && hint.imageUrl && (
        <TouchableOpacity
          onPress={() => onImagePress(hint.imageUrl!)}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="View hint image"
        >
          <Image source={{ uri: hint.imageUrl }} style={hintStyles.hintImage} accessibilityLabel="Hint image" />
        </TouchableOpacity>
      )}

      {text && (
        <Text
          style={{
            color: colors.gray700,
            ...Typography.body,
            marginBottom: isAudio ? 8 : 0,
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
  const navigation = useRecipientNavigation();
  const route = useRoute();
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
  const couponRequestedRef = useRef(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const phoneTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const emailTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const bookingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const shareCardRef = useRef<View>(null);
  const tabScrollRef = useRef<ScrollView>(null);
  const { width: screenWidth } = Dimensions.get('window');
  const [shareFormat, setShareFormat] = useState<'story' | 'square'>('story');
  const [isSharing, setIsSharing] = useState(false);
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
          if (now >= updatedGoal.approvalDeadline && !updatedGoal.giverActionTaken) {
            await goalService.checkAndAutoApprove(currentGoal.id);
          }
        }
      }
    }, (error) => {
      logger.error('[JourneyScreen] Goal snapshot error:', error.message);
    });
    return () => { isMounted = false; unsub(); };
  }, [currentGoal?.id]);

  // Fetch experience gift
  useEffect(() => {
    const fetchExperienceGift = async () => {
      if (currentGoal?.experienceGiftId) {
        try {
          const gift = await experienceGiftService.getExperienceGiftById(
            currentGoal.experienceGiftId
          );
          if (gift) setExperienceGift(gift);
        } catch (error: unknown) {
          logger.error('Error fetching experience gift:', error);
          setError(true);
        }
      }
    };
    fetchExperienceGift();
  }, [currentGoal?.experienceGiftId]);

  // Fetch sessions when tab changes to Sessions, or when screen refocuses
  const loadSessions = useCallback(async () => {
    if (!currentGoal?.id) return;
    setSessionsLoading(true);
    try {
      const data = await sessionService.getSessionsForGoal(currentGoal.id);
      setSessions(data);
    } catch (error: unknown) {
      logger.error('Error fetching sessions:', error);
      setError(true);
    } finally {
      setSessionsLoading(false);
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
    const fetchMotivations = async () => {
      try {
        const data = await motivationService.getAllMotivations(currentGoal.id);
        setMotivations(data);
      } catch (error: unknown) {
        logger.error('Error fetching motivations:', error);
        setError(true);
      }
    };
    fetchMotivations();
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
    const fetchRecommended = async () => {
      try {
        const snapshot = await getDocs(query(collection(db, 'experiences'), limit(20)));
        const all = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as Experience))
          .filter(exp => exp.status !== 'draft');
        const filtered = all
          .filter(exp => exp.category?.toLowerCase() === currentGoal.preferredRewardCategory?.toLowerCase())
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        setRecommendedExperiences(filtered.slice(0, 3));
      } catch (error: unknown) {
        logger.error('Error fetching recommended experiences:', error);
      }
    };
    fetchRecommended();
  }, [currentGoal?.preferredRewardCategory, currentGoal?.pledgedExperience]);

  // ─── Completed goal: fetch experience, partner, coupon ────────────────────
  useEffect(() => {
    if (!currentGoal?.isCompleted) return;

    const fetchCompletedGoalData = async () => {
      try {
        // Fetch user name
        const name = await userService.getUserName(currentGoal.userId);
        setUserName(name || 'User');

        // Determine experience ID source
        let expId: string | null = null;
        if (currentGoal.pledgedExperience?.experienceId) {
          expId = currentGoal.pledgedExperience.experienceId;
        } else if (currentGoal.experienceGiftId) {
          try {
            const gift = await experienceGiftService.getExperienceGiftById(currentGoal.experienceGiftId);
            if (gift) expId = gift.experienceId;
          } catch (error: unknown) {
            logger.warn('Failed to load experience gift:', error);
            // Continue without gift data — non-fatal
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

        // Load existing coupon from goal
        if (currentGoal.couponCode) {
          setCouponCode(currentGoal.couponCode);
        }
      } catch (err: unknown) {
        logger.error('Error fetching completed goal data:', err);
        setError(true);
      }
    };

    fetchCompletedGoalData();
  }, [currentGoal?.isCompleted, currentGoal?.id]);

  // ─── Coupon generation (reused from CompletionScreen) ─────────────────────
  const generateCouponWithTransaction = useCallback(async () => {
    if (!currentGoal || !experience) return;
    const partnerId = experience?.partnerId;
    if (!partnerId) return;

    const code = await generateCouponForGoal(currentGoal.id, currentGoal.userId, partnerId);
    setCouponCode(code);
  }, [currentGoal, experience]);

  const handleGenerateCoupon = useCallback(async () => {
    if (couponRequestedRef.current) return; // Prevent duplicate requests
    couponRequestedRef.current = true;
    setCouponLoading(true);
    try {
      await generateCouponWithTransaction();
    } catch (err: unknown) {
      logger.error('Coupon generation failed:', err);
      showError('Could not generate your coupon. Please try again.');
      couponRequestedRef.current = false; // Allow retry on error
    } finally {
      setCouponLoading(false);
    }
  }, [generateCouponWithTransaction, showError]);

  const handleCopyCoupon = useCallback(async () => {
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

  const handleWhatsAppSchedule = useCallback(() => {
    if (!partner?.phone || !experience) return;
    const dateString = preferredDate
      ? preferredDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : 'at your earliest convenience';
    const message = `Hi ${partner.name || 'there'}!\n\nI've completed my goal and earned ${experience.title}!\n\nI'd like to schedule my experience for ${dateString}.\n\nLooking forward to it!\n${userName}`;
    const phone = partner.phone.replace(/[^0-9]/g, '');
    const url = Platform.select({
      ios: `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`,
      android: `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`,
      default: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
    });
    Linking.canOpenURL(url!).then(ok => {
      if (ok) Linking.openURL(url!);
      else showInfo('WhatsApp is not installed.');
    });
  }, [partner, experience, preferredDate, userName]);

  const handleEmailSchedule = useCallback(() => {
    if (!partner || !experience) return;
    const email = partner.contactEmail || partner.email;
    if (!email) return;
    const dateString = preferredDate
      ? preferredDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : 'at your earliest convenience';
    const message = `Hi ${partner.name || 'there'}!\n\nI've completed my Ernit goal and earned ${experience.title}!\n\nI'd like to schedule my experience for ${dateString}.\n\nLooking forward to it!\n${userName}`;
    const subject = `Experience Booking - ${experience.title}`;
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`);
  }, [partner, experience, preferredDate, userName]);

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
      if (bookingMethod === 'whatsapp') handleWhatsAppSchedule();
      else if (bookingMethod === 'email') handleEmailSchedule();
    }, 100);
  }, [bookingMethod, handleWhatsAppSchedule, handleEmailSchedule]);

  const handleCancelBooking = useCallback(() => {
    setShowCalendar(false);
  }, []);

  const handleShare = useCallback(async () => {
    if (!shareCardRef.current) return;
    setIsSharing(true);
    try {
      if (Platform.OS === 'web') {
        const dataUri = await captureRef(shareCardRef, {
          format: 'png',
          quality: 1,
          result: 'data-uri',
        });
        const res = await fetch(dataUri);
        const blob = await res.blob();
        const file = new File([blob], 'ernit-achievement.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'My Achievement',
            text: 'Check out my achievement on Ernit!',
          });
        } else {
          const link = document.createElement('a');
          link.href = dataUri;
          link.download = 'ernit-achievement.png';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          showInfo('Image saved! Share it to Instagram from your gallery.');
        }
      } else {
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
  const renderSessionsTab = () => {
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
          <Text style={styles.emptyText}>No sessions yet</Text>
          <Text style={styles.emptySubText}>
            Complete your first session and it will show up here.
          </Text>
        </View>
      );
    }

    return (
      <View style={{ paddingHorizontal: Spacing.md, alignSelf: 'center', width: '100%', maxWidth: 380 }}>
        {sessions.map((s, i) => (
          <SessionCard
            key={s.id}
            session={s}
            index={i}
            motivations={motivationsBySession[s.sessionNumber] || []}
            isExpanded={expandedSessionId === s.id}
            onToggleExpand={() => {
              if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setExpandedSessionId(prev => prev === s.id ? null : s.id);
            }}
            onImagePress={(uri) => {
              const sessionImages = sessions.filter(s => s.mediaUrl && s.mediaType === 'photo').map(s => s.mediaUrl!);
              setAllImageUris(sessionImages);
              setSelectedImageUri(uri);
            }}
          />
        ))}
      </View>
    );
  };

  // ─── Hints Tab Content ───────────────────────────────────────────────────
  const renderHintsTab = () => {
    if (hintsArray.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💡</Text>
          <Text style={styles.emptyText}>No hints revealed yet</Text>
          <Text style={styles.emptySubText}>
            Hints will appear here as you progress through your sessions.
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
      <MainScreen activeRoute="Goals">
        <StatusBar style="light" />
        <SharedHeader title="Journey" showBack />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, ...Typography.subheading }}>Redirecting...</Text>
        </View>
      </MainScreen>
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
      ? parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : null;

    const hasGift = !!currentGoal.giftAttachedAt || (!!currentGoal.experienceGiftId && !currentGoal.isFreeGoal);
    const hasPledgedExperience = !!currentGoal.pledgedExperience;
    const showBuyCTA = currentGoal.isFreeGoal && hasPledgedExperience && !currentGoal.giftAttachedAt && isWithinBuyWindow();
    const showExpired = currentGoal.isFreeGoal && hasPledgedExperience && !currentGoal.giftAttachedAt && !isWithinBuyWindow();
    const selfGifted = isSelfGifted(currentGoal);
    const hasHints = hintsArray.length > 0 && !selfGifted;

    return (
      <>
        {/* Off-screen Share Card for capture */}
        <View style={{ position: 'absolute', left: -9999 }}>
          <View
            ref={shareCardRef}
            style={{
              width: 1080,
              height: shareFormat === 'story' ? 1920 : 1080,
              backgroundColor: colors.cyan,
            }}
            collapsable={false}
          >
            <LinearGradient
              colors={[colors.secondary, colors.cyan, colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1, padding: 80, justifyContent: 'center', alignItems: 'center' }}
            >
              {currentGoal.pledgedExperience?.coverImageUrl ? (
                <Image
                  source={{ uri: currentGoal.pledgedExperience.coverImageUrl }}
                  style={{
                    width: 600,
                    height: shareFormat === 'story' ? 400 : 300,
                    borderRadius: BorderRadius.pill,
                    marginBottom: 60,
                  }}
                  contentFit="cover" cachePolicy="memory-disk"
                />
              ) : null}
              <Trophy color={colors.celebrationGoldLight} size={120} strokeWidth={2.5} fill={colors.celebrationGold} />
              <Text style={{ fontSize: Typography.hero.fontSize, fontWeight: '900', color: colors.white, textAlign: 'center', marginTop: 40, marginBottom: 16 }}>
                Goal Completed!
              </Text>
              <Text style={{ fontSize: Typography.heroSub.fontSize, fontWeight: '700', color: colors.primaryTint, textAlign: 'center', marginBottom: 60 }}>
                {currentGoal.title || currentGoal.description || ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 60, marginBottom: 60 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: Typography.hero.fontSize, fontWeight: '900', color: colors.white }}>{totalSessions}</Text>
                  <Text style={{ ...Typography.display, color: colors.whiteAlpha90, fontWeight: '600' }}>SESSIONS</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: Typography.hero.fontSize, fontWeight: '900', color: colors.white }}>{currentGoal.targetCount || 0}</Text>
                  <Text style={{ ...Typography.display, color: colors.whiteAlpha90, fontWeight: '600' }}>WEEKS</Text>
                </View>
              </View>
              <View style={{ position: 'absolute', bottom: 80, alignItems: 'center' }}>
                <Image
                  source={require('../../assets/favicon.png')}
                  style={{ width: 60, height: 60, marginBottom: Spacing.md }}
                  contentFit="contain" cachePolicy="memory-disk"
                  accessible={false}
                />
                <Text style={{ ...Typography.display, fontWeight: '600', color: colors.overlayLight }}>
                  Earned with Ernit
                </Text>
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* ─── Completion Hero ──────────────────────────── */}
        <View style={cStyles.heroContainer}>
          <View style={cStyles.heroInner}>
            <View style={cStyles.heroTopRow}>
              <View style={cStyles.heroTrophyCircle}>
                <Trophy size={28} color={colors.warning} strokeWidth={2.5} fill={colors.celebrationGold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={cStyles.heroTitle}>Challenge Complete!</Text>
                <Text style={cStyles.heroGoalTitle} numberOfLines={1}>
                  {currentGoal.title || currentGoal.description || ''}
                </Text>
              </View>
            </View>
            <View style={cStyles.heroStatsRow}>
              <View style={cStyles.heroStatPill}>
                <Text style={cStyles.heroStatNumber}>{totalSessions}</Text>
                <Text style={cStyles.heroStatLabel}>sessions</Text>
              </View>
              <View style={cStyles.heroStatPill}>
                <Text style={cStyles.heroStatNumber}>{currentGoal.targetCount}</Text>
                <Text style={cStyles.heroStatLabel}>weeks</Text>
              </View>
              {completedDate && (
                <Text style={cStyles.heroDateText}>Completed {completedDate}</Text>
              )}
            </View>
          </View>
        </View>

        {/* ─── Experience Card ────────────────────────────── */}
        {(hasPledgedExperience || hasGift) && (
          <View style={cStyles.section}>
            <Text style={cStyles.sectionTitle}>
              <Gift size={15} color={colors.primary} />  Your Reward
            </Text>

            {/* Experience image + details */}
            {currentGoal.pledgedExperience?.coverImageUrl && (
              <Image
                source={{ uri: currentGoal.pledgedExperience.coverImageUrl }}
                style={[styles.experienceCover, { height: vh(180) }]}
              />
            )}

            <View style={cStyles.experienceBody}>
              <Text style={cStyles.experienceName}>
                {currentGoal.pledgedExperience?.title || experience?.title || 'Experience'}
              </Text>
              {(currentGoal.pledgedExperience?.subtitle || experience?.subtitle) ? (
                <Text style={cStyles.experienceSubtitle}>{currentGoal.pledgedExperience?.subtitle || experience?.subtitle}</Text>
              ) : null}

              {/* Coupon & partner contact */}
              {hasGift && (
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
                    <TouchableOpacity style={cStyles.copyButton} onPress={handleCopyCoupon} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Copy coupon code">
                      {isCopied ? <CheckCircle size={16} color={colors.secondary} /> : <Copy size={16} color={colors.primary} />}
                      <Text style={[cStyles.copyText, isCopied && { color: colors.secondary }]}>
                        {isCopied ? 'Copied!' : 'Copy Code'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Button
                    variant="primary"
                    onPress={handleGenerateCoupon}
                    loading={couponLoading}
                    disabled={couponLoading}
                    title="Generate Redemption Code"
                    icon={<Ticket size={16} color={colors.white} />}
                    fullWidth
                    style={cStyles.generateCouponBtn}
                  />
                )}

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
                        <TouchableOpacity onPress={handleCopyPhone} style={cStyles.smallCopyBtn} accessibilityRole="button" accessibilityLabel="Copy phone number">
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
                        <TouchableOpacity onPress={handleCopyEmail} style={cStyles.smallCopyBtn} accessibilityRole="button" accessibilityLabel="Copy email address">
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
                          title="WhatsApp"
                          icon={<MessageCircle size={16} color={colors.white} />}
                          style={cStyles.whatsappBtn}
                        />
                      )}
                      {(partner.contactEmail || partner.email) && (
                        <Button
                          variant="primary"
                          size="sm"
                          onPress={handleBookEmail}
                          title="Email"
                          icon={<Mail size={16} color={colors.white} />}
                          style={cStyles.emailBtn}
                        />
                      )}
                    </View>
                  </View>
                )}
              </>
              )}

              {/* Buy CTA (within 2-week window) */}
              {showBuyCTA && (
                <>
                  <View style={cStyles.rewardDivider} />
                  <Text style={cStyles.buyCTATitle}>You've earned this!</Text>
                  <Text style={cStyles.buyCTASubtext}>Buy your reward now and redeem it instantly.</Text>
                  <Button
                    variant="primary"
                    onPress={() => navigation.navigate('ExperienceCheckout', {
                      cartItems: [{ experienceId: currentGoal.pledgedExperience?.experienceId ?? "", quantity: 1 }],
                      goalId: currentGoal.id,
                    })}
                    title={(currentGoal.pledgedExperience?.price ?? 0) > 0
                      ? `Buy Now · \u20AC${currentGoal.pledgedExperience?.price}`
                      : 'Get This Experience'}
                    icon={<ShoppingBag size={15} color={colors.white} />}
                    fullWidth
                    style={styles.buyButton}
                  />
                </>
              )}

              {/* Expired */}
              {showExpired && (
                <>
                  <View style={cStyles.rewardDivider} />
                  <Text style={cStyles.expiredText}>Purchase window has expired</Text>
                </>
              )}
            </View>
          </View>
        )}

        {/* ─── Sessions History ───────────────────────────── */}
        <View style={cStyles.section}>
          <Text style={cStyles.sectionTitle}>
            Sessions <Text style={cStyles.countBadge}>{sessions.length}</Text>
          </Text>
          <View style={styles.tabContent}>
            {renderSessionsTab()}
          </View>
        </View>

        {/* ─── Hints History ─────────────────────────────── */}
        {hasHints && (
          <View style={cStyles.section}>
            <Text style={cStyles.sectionTitle}>
              Hints <Text style={cStyles.countBadge}>{hintsArray.length}</Text>
            </Text>
            <View style={styles.tabContent}>
              {renderHintsTab()}
            </View>
          </View>
        )}

        {/* ─── Share Section ────────────────────────────── */}
        <View style={[cStyles.section, { marginBottom: 0 }]}>
          <Text style={cStyles.sectionTitle}>Share Your Achievement</Text>
          <View style={cStyles.shareFormatToggle}>
            <TouchableOpacity
              style={[cStyles.shareFormatOption, shareFormat === 'story' && cStyles.shareFormatActive]}
              onPress={() => setShareFormat('story')}
            >
              <Text style={[cStyles.shareFormatText, shareFormat === 'story' && cStyles.shareFormatTextActive]}>
                Story (9:16)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cStyles.shareFormatOption, shareFormat === 'square' && cStyles.shareFormatActive]}
              onPress={() => setShareFormat('square')}
            >
              <Text style={[cStyles.shareFormatText, shareFormat === 'square' && cStyles.shareFormatTextActive]}>
                Square (1:1)
              </Text>
            </TouchableOpacity>
          </View>
          <Button
            variant="primary"
            onPress={handleShare}
            loading={isSharing}
            disabled={isSharing}
            title="Share"
            icon={<ShareIcon color={colors.white} size={20} />}
            fullWidth
            style={cStyles.shareButton}
          />
        </View>
      </>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────
  if (error && !sessionsLoading) {
    return (
      <ErrorBoundary screenName="JourneyScreen" userId={currentGoal?.userId}>
        <MainScreen activeRoute="Goals">
          <StatusBar style="light" />
          <SharedHeader title="Journey" showBack />
          <ErrorRetry
            message="Could not load journey data"
            onRetry={() => {
              setError(false);
              setSessionsLoading(true);
              loadSessions();
            }}
          />
        </MainScreen>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="JourneyScreen" userId={currentGoal?.userId}>
    <MainScreen activeRoute="Goals">
      <StatusBar style="light" />
      <SharedHeader title={currentGoal.isCompleted ? 'Your Achievement' : 'Journey'} showBack />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: Spacing.xl,
          paddingBottom: currentGoal.isCompleted ? Spacing.sm : FOOTER_HEIGHT + Spacing.xl,
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
                          <Text style={[styles.experienceLabel, { color: colors.warningDark }]}>Mystery Reward</Text>
                        </View>
                        <Text style={styles.experienceTitle} numberOfLines={2}>
                          Complete your challenge to reveal it!
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
                                {done}/{total} sessions to reveal
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
                          <Text style={styles.experienceLabel}>{currentGoal.giftAttachedAt ? 'Your Reward' : 'Your Dream Reward'}</Text>
                          {currentGoal.pledgedExperience.price > 0 && (
                            <Text style={styles.experiencePrice}>
                              ${currentGoal.pledgedExperience.price}
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
                                {done}/{total} sessions to earn this
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
                              ? `Buy Now · \u20AC${currentGoal.pledgedExperience?.price}`
                              : 'Get This Experience'}
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
                    <Text style={styles.recommendedTitle}>Recommended for you</Text>
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
                        onPress={() => navigation.navigate('ExperienceDetails', { experience: exp })}
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
                          <Text style={styles.recommendedPrice}>{'\u20AC'}{exp.price}</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    style={styles.browseAllLink}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('CategorySelection', {
                      prefilterCategory: currentGoal.preferredRewardCategory,
                    })}
                  >
                    <Text style={styles.browseAllText}>
                      Browse all {currentGoal.preferredRewardCategory ? currentGoal.preferredRewardCategory.charAt(0).toUpperCase() + currentGoal.preferredRewardCategory.slice(1) : ''} experiences
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
    </MainScreen>
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
    fontWeight: '500',
    color: colors.violet,
    lineHeight: 26,
  },
  messageFrom: {
    ...Typography.small,
    color: colors.primaryDeep,
    marginTop: Spacing.sm,
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '800',
    color: colors.textPrimary,
  },
  experienceTitle: {
    ...Typography.subheading,
    fontWeight: '700',
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
    ...Typography.caption,
    fontWeight: '600',
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
    ...Typography.small,
    fontWeight: '700',
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
    ...Typography.caption,
    fontWeight: '600',
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
    fontSize: Typography.displayLarge.fontSize,
    fontWeight: '800',
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
    ...Typography.body,
    fontWeight: '700',
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
    ...Typography.caption,
    fontWeight: '600',
    color: colors.gray800,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  recommendedPrice: {
    ...Typography.caption,
    fontWeight: '700',
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
    ...Typography.caption,
    fontWeight: '600',
    color: colors.primary,
  },
});

// ─── Completed Goal Styles ──────────────────────────────────────────────────
const createCStyles = (colors: typeof Colors) => StyleSheet.create({
  heroContainer: {
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  heroInner: {
    padding: Spacing.lg,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  heroTrophyCircle: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.xxl,
    backgroundColor: colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    ...Typography.heading3,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  heroGoalTitle: {
    ...Typography.small,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: Spacing.xxs,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  heroStatPill: {
    backgroundColor: colors.primarySurface,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  heroStatNumber: {
    ...Typography.body,
    fontWeight: '800',
    color: colors.primary,
  },
  heroStatLabel: {
    ...Typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  heroDateText: {
    ...Typography.caption,
    fontWeight: '500',
    color: colors.textMuted,
    marginLeft: 'auto',
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.subheading,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  countBadge: {
    ...Typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  experienceBody: {
    backgroundColor: colors.white,
    padding: Spacing.md,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.border,
  },
  experienceName: {
    ...Typography.subheading,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  experiencePrice: {
    ...Typography.body,
    fontWeight: '800',
    color: colors.primary,
  },
  experienceSubtitle: {
    ...Typography.small,
    color: colors.textSecondary,
    fontWeight: '500',
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
    ...Typography.caption,
    fontWeight: '700',
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
    fontWeight: '900',
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
    ...Typography.small,
    fontWeight: '600',
    color: colors.primary,
  },
  generateCouponBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  generateCouponText: {
    color: colors.white,
    ...Typography.small,
    fontWeight: '700',
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
    ...Typography.small,
    fontWeight: '700',
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
    ...Typography.small,
    fontWeight: '600',
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
    ...Typography.caption,
    fontWeight: '700',
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
    fontWeight: '700',
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
    fontWeight: '500',
  },
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
  shareFormatText: { ...Typography.small, fontWeight: '600', color: colors.textMuted },
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
  shareButtonText: { color: colors.white, ...Typography.body, fontWeight: '700' },
});

export default JourneyScreen;
