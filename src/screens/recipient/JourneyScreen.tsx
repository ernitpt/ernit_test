import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Animated, Easing, Image, TouchableOpacity,
  Platform, Linking, LayoutAnimation,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { doc, onSnapshot, getDoc, collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { RecipientStackParamList, Goal, ExperienceGift, SessionRecord, Motivation, Experience } from '../../types';
import { generateCouponForGoal } from '../../services/CouponService';
import { isSelfGifted } from '../../types';
import MainScreen from '../MainScreen';
import DetailedGoalCard from './DetailedGoalCard';
import { goalService } from '../../services/GoalService';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { experienceService } from '../../services/ExperienceService';
import { partnerService } from '../../services/PartnerService';
import { userService } from '../../services/userService';
import { sessionService } from '../../services/SessionService';
import { motivationService } from '../../services/MotivationService';
import SharedHeader from '../../components/SharedHeader';
import AudioPlayer from '../../components/AudioPlayer';
import ImageViewer from '../../components/ImageViewer';
import { SessionCardSkeleton } from '../../components/SkeletonLoader';
import { BookingCalendar } from '../../components/BookingCalendar';
import { Clock, PlayCircle, Gift, ShoppingBag, Check, Trophy, Copy, CheckCircle, Ticket, MessageCircle, Mail, Sparkles } from 'lucide-react-native';
import { logger } from '../../utils/logger';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import Colors from '../../config/colors';
import { useToast } from '../../context/ToastContext';

type Nav = NativeStackNavigationProp<RecipientStackParamList, 'Journey'>;

// ─── Segmented Tab Control ───────────────────────────────────────────────────
const TAB_SESSIONS = 'Sessions';
const TAB_HINTS = 'Hints';
type TabKey = typeof TAB_SESSIONS | typeof TAB_HINTS;

const SegmentedControl = ({
  activeTab,
  onTabChange,
}: {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) => {
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
};

const segStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundLight,
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
    position: 'relative',
  },
  slider: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    zIndex: 1,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabLabelActive: {
    color: Colors.primaryDark,
  },
});

// ─── Session Card ────────────────────────────────────────────────────────────
const SessionCard = ({
  session,
  index,
  motivations = [],
}: {
  session: SessionRecord;
  index: number;
  motivations?: Motivation[];
}) => {
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
            <Clock size={13} color={Colors.textSecondary} />
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
                <PlayCircle size={18} color="#fff" />
              </View>
            )}
          </View>
        )}
      </View>

      {/* Inline motivations */}
      {motivations.length > 0 && (
        <>
          <TouchableOpacity
            style={sessStyles.motivationToggle}
            onPress={toggleMotivations}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? 'Hide' : 'Show'} motivations`}
          >
            <MessageCircle size={14} color={Colors.primary} />
            <Text style={sessStyles.motivationToggleText}>
              {motivations.length} motivation{motivations.length !== 1 ? 's' : ''} from friends
            </Text>
          </TouchableOpacity>

          {expanded && (
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
                        resizeMode="cover"
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
};

const sessStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.backgroundLight,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardWithMotivations: {
    borderColor: Colors.primaryBorder,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  details: { flex: 1 },
  date: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginRight: 8,
  },
  weekBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    marginLeft: 8,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.backgroundLight,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  motivationToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  motivationToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  motivationList: {
    marginTop: 8,
    gap: 8,
  },
  motivationItem: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.primarySurface,
    padding: 10,
    borderRadius: 10,
  },
  motivationAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  motivationAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  motivationAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  motivationContent: {
    flex: 1,
  },
  motivationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  motivationAuthor: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  motivationDate: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  motivationMessage: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  motivationImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginTop: 8,
    backgroundColor: Colors.backgroundLight,
  },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
const JourneyScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const routeParams = route.params as { goal?: Goal } | undefined;
  const passedGoal = routeParams?.goal;

  const [currentGoal, setCurrentGoal] = useState<Goal | null>(passedGoal || null);
  const [experienceGift, setExperienceGift] = useState<ExperienceGift | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(TAB_SESSIONS);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [motivations, setMotivations] = useState<Motivation[]>([]);
  const [recommendedExperiences, setRecommendedExperiences] = useState<Experience[]>([]);

  // Completed goal state
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isPhoneCopied, setIsPhoneCopied] = useState(false);
  const [isEmailCopied, setIsEmailCopied] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [partner, setPartner] = useState<any>(null);
  const [experience, setExperience] = useState<any>(null);
  const [userName, setUserName] = useState<string>('User');
  const [showCalendar, setShowCalendar] = useState(false);
  const [bookingMethod, setBookingMethod] = useState<'whatsapp' | 'email' | null>(null);
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);
  const couponRequestedRef = useRef(false);
  const { showSuccess, showError, showInfo } = useToast();

  // Redirect if no goal
  useEffect(() => {
    if (!passedGoal) {
      logger.warn('No goal passed to JourneyScreen, redirecting to Goals');
      navigation.navigate('Goals' as any);
    }
  }, [passedGoal, navigation]);

  // Keep goal synced with Firestore
  useEffect(() => {
    if (!currentGoal?.id) return;
    const ref = doc(db, 'goals', currentGoal.id);
    const unsub = onSnapshot(ref, async (snap) => {
      if (snap.exists()) {
        const updatedGoal = { id: snap.id, ...snap.data() } as Goal;
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
    });
    return () => unsub();
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
        } catch (error) {
          logger.error('Error fetching experience gift:', error);
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
    } catch (error) {
      logger.error('Error fetching sessions:', error);
    } finally {
      setSessionsLoading(false);
    }
  }, [currentGoal?.id]);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === TAB_SESSIONS || currentGoal?.isCompleted) {
        loadSessions();
      }
    }, [activeTab, loadSessions, currentGoal?.isCompleted])
  );

  useEffect(() => {
    if (activeTab === TAB_SESSIONS || currentGoal?.isCompleted) {
      loadSessions();
    }
  }, [activeTab, currentGoal?.isCompleted]);

  // Fetch all motivations for inline display on session cards
  useEffect(() => {
    if (!currentGoal?.id) return;
    const fetchMotivations = async () => {
      try {
        const data = await motivationService.getAllMotivations(currentGoal.id);
        setMotivations(data);
      } catch (error) {
        logger.error('Error fetching motivations:', error);
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
        const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Experience));
        const filtered = all.filter(exp =>
          exp.category?.toLowerCase() === currentGoal.preferredRewardCategory?.toLowerCase()
        );
        setRecommendedExperiences(filtered.slice(0, 3));
      } catch (error) {
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
          } catch { /* no gift */ }
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
      } catch (err) {
        logger.error('Error fetching completed goal data:', err);
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
    setCouponLoading(true);
    try {
      await generateCouponWithTransaction();
    } catch (err) {
      logger.error('Coupon generation failed:', err);
      showError('Could not generate your coupon. Please try again.');
    } finally {
      setCouponLoading(false);
    }
  }, [generateCouponWithTransaction, showError]);

  const handleCopyCoupon = useCallback(async () => {
    if (!couponCode) return;
    await Clipboard.setStringAsync(couponCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [couponCode]);

  const handleCopyPhone = useCallback(async () => {
    if (!partner?.phone) return;
    await Clipboard.setStringAsync(partner.phone);
    setIsPhoneCopied(true);
    setTimeout(() => setIsPhoneCopied(false), 2000);
  }, [partner]);

  const handleCopyEmail = useCallback(async () => {
    const email = partner?.contactEmail || partner?.email;
    if (!email) return;
    await Clipboard.setStringAsync(email);
    setIsEmailCopied(true);
    setTimeout(() => setIsEmailCopied(false), 2000);
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
    setTimeout(() => {
      if (bookingMethod === 'whatsapp') handleWhatsAppSchedule();
      else if (bookingMethod === 'email') handleEmailSchedule();
    }, 100);
  }, [bookingMethod, handleWhatsAppSchedule, handleEmailSchedule]);

  const handleCancelBooking = useCallback(() => {
    setPreferredDate(null);
    setShowCalendar(false);
    if (bookingMethod === 'whatsapp') handleWhatsAppSchedule();
    else if (bookingMethod === 'email') handleEmailSchedule();
  }, [bookingMethod, handleWhatsAppSchedule, handleEmailSchedule]);

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

  // ─── Hint Item subcomponent ──────────────────────────────────────────────
  const HintItem = ({ hint, index, fmtDateTime: fmt }: any) => {
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

    let dateMs = 0;
    if (hint.createdAt) {
      if (typeof hint.createdAt.toMillis === 'function') {
        dateMs = hint.createdAt.toMillis();
      } else if (hint.createdAt instanceof Date) {
        dateMs = hint.createdAt.getTime();
      } else {
        dateMs = new Date(hint.createdAt).getTime();
      }
    } else if (hint.date) {
      dateMs = hint.date;
    }

    return (
      <Animated.View
        style={{
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          ],
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: Colors.border,
        }}
      >
        <Text style={{ fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 }}>
          {fmt(dateMs)}
        </Text>

        {hasImage && hint.imageUrl && (
          <TouchableOpacity
            onPress={() => setSelectedImageUri(hint.imageUrl)}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="View hint image"
          >
            <Image source={{ uri: hint.imageUrl }} style={styles.hintImage} accessibilityLabel="Hint image" />
          </TouchableOpacity>
        )}

        {text && (
          <Text
            style={{
              color: '#374151',
              fontSize: 15,
              lineHeight: 22,
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
  };

  // ─── Sessions Tab Content ────────────────────────────────────────────────
  const renderSessionsTab = () => {
    if (sessionsLoading && sessions.length === 0) {
      return (
        <View style={{ padding: 20, gap: 10 }}>
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
      <View>
        {sessions.map((s, i) => (
          <SessionCard key={s.id} session={s} index={i} motivations={motivationsBySession[s.sessionNumber] || []} />
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
        {hintsArray
          .slice()
          .sort((a: any, b: any) => {
            const sessionA = a.forSessionNumber || a.session || 0;
            const sessionB = b.forSessionNumber || b.session || 0;
            return Number(sessionB) - Number(sessionA);
          })
          .map((h: any, i) => {
            const session = h.forSessionNumber || h.session || 0;
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
          <Text style={{ color: Colors.textSecondary, fontSize: 16 }}>Redirecting...</Text>
        </View>
      </MainScreen>
    );
  }

  // ─── Helper: 2-week window check ──────────────────────────────────────────
  const isWithinBuyWindow = () => {
    if (!currentGoal.completedAt) return false;
    const raw = currentGoal.completedAt as any;
    const completedDate = raw?.toDate ? raw.toDate() : new Date(raw);
    if (isNaN(completedDate.getTime())) return false;
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    return Date.now() - completedDate.getTime() < twoWeeksMs;
  };

  // ─── Render: Completed Goal Layout ────────────────────────────────────────
  const renderCompletedLayout = () => {
    const totalSessions = currentGoal.targetCount * currentGoal.sessionsPerWeek;
    const rawDate = currentGoal.completedAt as any;
    const parsedDate = rawDate?.toDate ? rawDate.toDate() : rawDate ? new Date(rawDate) : null;
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
        {/* ─── Completion Header ─────────────────────────── */}
        <View style={cStyles.headerCard}>
          <View style={cStyles.trophyCircle}>
            <Trophy size={32} color={Colors.primary} />
          </View>
          <Text style={cStyles.headerTitle}>Challenge Complete!</Text>
          <View style={cStyles.statsRow}>
            <Text style={cStyles.statText}>{totalSessions} sessions</Text>
            <View style={cStyles.statDot} />
            <Text style={cStyles.statText}>{currentGoal.targetCount} weeks</Text>
          </View>
          {completedDate && (
            <Text style={cStyles.completedDate}>Completed {completedDate}</Text>
          )}
        </View>

        {/* ─── Experience Card ────────────────────────────── */}
        {(hasPledgedExperience || hasGift) && (
          <View style={cStyles.section}>
            <Text style={cStyles.sectionTitle}>
              <Gift size={15} color={Colors.primary} />  Your Reward
            </Text>

            {/* Experience image + details */}
            {currentGoal.pledgedExperience?.coverImageUrl && (
              <Image
                source={{ uri: currentGoal.pledgedExperience.coverImageUrl }}
                style={[styles.experienceCover, { height: 180 }]}
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
                      <Ticket size={18} color={Colors.primary} />
                      <Text style={cStyles.couponLabel}>Your Redemption Code</Text>
                    </View>
                    <View style={cStyles.couponCodeBox}>
                      <Text style={cStyles.couponCodeText}>{couponCode}</Text>
                    </View>
                    <TouchableOpacity style={cStyles.copyButton} onPress={handleCopyCoupon} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Copy coupon code">
                      {isCopied ? <CheckCircle size={16} color="#10b981" /> : <Copy size={16} color={Colors.primary} />}
                      <Text style={[cStyles.copyText, isCopied && { color: '#10b981' }]}>
                        {isCopied ? 'Copied!' : 'Copy Code'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={cStyles.generateCouponBtn}
                    onPress={handleGenerateCoupon}
                    activeOpacity={0.8}
                    disabled={couponLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Generate redemption code"
                  >
                    <Ticket size={16} color="#fff" />
                    <Text style={cStyles.generateCouponText}>
                      {couponLoading ? 'Generating...' : 'Generate Redemption Code'}
                    </Text>
                  </TouchableOpacity>
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
                          {isPhoneCopied ? <CheckCircle size={16} color="#10b981" /> : <Copy size={16} color={Colors.textSecondary} />}
                        </TouchableOpacity>
                      </View>
                    )}

                    {(partner.contactEmail || partner.email) && (
                      <View style={cStyles.contactRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={cStyles.contactLabel}>Email</Text>
                          <Text style={[cStyles.contactValue, { fontSize: 13 }]}>{partner.contactEmail || partner.email}</Text>
                        </View>
                        <TouchableOpacity onPress={handleCopyEmail} style={cStyles.smallCopyBtn} accessibilityRole="button" accessibilityLabel="Copy email address">
                          {isEmailCopied ? <CheckCircle size={16} color="#10b981" /> : <Copy size={16} color={Colors.textSecondary} />}
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Schedule buttons */}
                    <View style={cStyles.scheduleRow}>
                      {partner.phone && (
                        <TouchableOpacity style={cStyles.whatsappBtn} onPress={handleBookWhatsApp} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Schedule via WhatsApp">
                          <MessageCircle size={16} color="#fff" />
                          <Text style={cStyles.scheduleBtnText}>WhatsApp</Text>
                        </TouchableOpacity>
                      )}
                      {(partner.contactEmail || partner.email) && (
                        <TouchableOpacity style={cStyles.emailBtn} onPress={handleBookEmail} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Schedule via Email">
                          <Mail size={16} color="#fff" />
                          <Text style={cStyles.scheduleBtnText}>Email</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              </>
              )}
            </View>

            {/* State: Buy CTA (within 2-week window) */}
            {showBuyCTA && (
              <View style={cStyles.buyCTACard}>
                <Text style={cStyles.buyCTATitle}>🎉 You've earned this!</Text>
                <Text style={cStyles.buyCTASubtext}>Buy your reward now and redeem it instantly.</Text>
                <TouchableOpacity
                  style={styles.buyButton}
                  activeOpacity={0.8}
                  onPress={() => (navigation as any).navigate('ExperienceCheckout', {
                    cartItems: [{ experienceId: currentGoal.pledgedExperience!.experienceId, quantity: 1 }],
                    goalId: currentGoal.id,
                  })}
                >
                  <ShoppingBag size={15} color="#fff" />
                  <Text style={styles.buyButtonText}>
                    {currentGoal.pledgedExperience!.price > 0
                      ? `Buy Now · €${currentGoal.pledgedExperience!.price}`
                      : 'Get This Experience'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* State: Expired */}
            {showExpired && (
              <View style={cStyles.expiredCard}>
                <Text style={cStyles.expiredText}>Purchase window has expired</Text>
              </View>
            )}
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
      </>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <ErrorBoundary screenName="JourneyScreen" userId={currentGoal?.userId}>
    <MainScreen activeRoute="Goals">
      <StatusBar style="light" />
      <SharedHeader title="Journey" showBack />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 20,
          paddingBottom: 20,
          alignItems: 'center',
        }}
      >
        {currentGoal.isCompleted ? (
          /* ─── COMPLETED GOAL ─────────────────────────────── */
          <View style={{ width: '100%', maxWidth: 380, paddingHorizontal: 16 }}>
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
                        <Sparkles color="#f59e0b" size={20} />
                        <Text style={styles.mysteryShowcaseText}>?</Text>
                      </View>
                      <View style={styles.experienceInlineBody}>
                        <View style={styles.experienceHeader}>
                          <Text style={[styles.experienceLabel, { color: '#92400e' }]}>Mystery Reward</Text>
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
                                <View style={[styles.experienceProgressFill, { width: `${pct}%`, backgroundColor: '#f59e0b' }]} />
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
                          <TouchableOpacity
                            style={styles.buyButton}
                            activeOpacity={0.8}
                            onPress={() => (navigation as any).navigate('ExperienceCheckout', {
                              cartItems: [{ experienceId: currentGoal.pledgedExperience!.experienceId, quantity: 1 }],
                              goalId: currentGoal.id,
                            })}
                          >
                            <ShoppingBag size={15} color="#fff" />
                            <Text style={styles.buyButtonText}>
                              {currentGoal.pledgedExperience!.price > 0
                                ? `Buy Now · €${currentGoal.pledgedExperience!.price}`
                                : 'Get This Experience'}
                            </Text>
                          </TouchableOpacity>
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
                    <Sparkles color={Colors.primary} size={16} />
                    <Text style={styles.recommendedTitle}>Recommended for you</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 4 }}
                  >
                    {recommendedExperiences.map((exp) => (
                      <TouchableOpacity
                        key={exp.id}
                        style={styles.recommendedCard}
                        activeOpacity={0.85}
                        onPress={() => (navigation as any).navigate('ExperienceDetails', { experience: exp })}
                      >
                        {exp.coverImageUrl ? (
                          <Image
                            source={{ uri: exp.coverImageUrl }}
                            style={styles.recommendedImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[styles.recommendedImage, { backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' }]}>
                            <Gift size={20} color={Colors.textMuted} />
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
                    onPress={() => (navigation as any).navigate('CategorySelection', {
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
                <SegmentedControl activeTab={activeTab} onTabChange={setActiveTab} />
              )}

              <View>
                {currentGoal && isSelfGifted(currentGoal)
                  ? renderSessionsTab()
                  : activeTab === TAB_SESSIONS ? renderSessionsTab() : renderHintsTab()}
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
          onClose={() => setSelectedImageUri(null)}
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

const styles = StyleSheet.create({
  messageSection: {
    paddingBottom: 16,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  messageText: {
    fontSize: 17,
    color: '#4c1d95',
    lineHeight: 26,
    fontWeight: '500',
  },
  messageFrom: {
    fontSize: 14,
    color: Colors.primaryDeep,
    marginTop: 10,
    fontWeight: '600',
  },
  unifiedCard: {
    width: '100%',
    maxWidth: 380,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
  experienceInline: {
    overflow: 'hidden',
  },
  experienceInlineBody: {
    paddingTop: 12,
  },
  experienceCoverInline: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: Colors.backgroundLight,
  },
  experienceCover: {
    width: '100%',
    height: 140,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: Colors.backgroundLight,
  },
  tabSectionInline: {
    // no card styling needed — inside unified card
  },
  tabContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 6,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
  },
  timeline: {
    marginTop: 4,
  },
  hintImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: Colors.backgroundLight,
  },
  experienceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  experienceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  experiencePrice: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  experienceTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
    lineHeight: 22,
  },
  experienceProgressArea: {
    gap: 4,
  },
  experienceProgressTrack: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  experienceProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  experienceProgressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  buyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.secondary,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 10,
  },
  buyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  giftReceivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primarySurface,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  giftReceivedText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  mysteryShowcaseBanner: {
    height: 120,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#fde68a',
  },
  mysteryShowcaseText: {
    fontSize: 40,
    fontWeight: '800',
    color: '#f59e0b',
  },
  // Recommended experiences
  recommendedSection: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  recommendedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  recommendedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  recommendedCard: {
    width: 140,
    marginRight: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    overflow: 'hidden',
  },
  recommendedImage: {
    width: '100%',
    height: 90,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  recommendedName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  recommendedPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  browseAllLink: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  browseAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
});

// ─── Completed Goal Styles ──────────────────────────────────────────────────
const cStyles = StyleSheet.create({
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  trophyCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  statText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  statDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  completedDate: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  countBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  experienceBody: {
    backgroundColor: '#fff',
    padding: 14,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Colors.border,
  },
  experienceName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  experiencePrice: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
  },
  experienceSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  rewardDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 14,
  },
  redemptionArea: {
    marginTop: 12,
  },
  couponCard: {
    backgroundColor: Colors.primarySurface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    marginBottom: 12,
  },
  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  couponLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  couponCodeBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  couponCodeText: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 3,
    color: Colors.textPrimary,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  copyText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  generateCouponBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  generateCouponText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  contactCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  contactTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  contactLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contactValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  smallCopyBtn: {
    padding: 6,
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  whatsappBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#25D366',
    paddingVertical: 12,
    borderRadius: 10,
  },
  emailBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.secondary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  scheduleBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  buyCTACard: {
    backgroundColor: Colors.primarySurface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    marginTop: 12,
  },
  buyCTATitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  buyCTASubtext: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  expiredCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  expiredText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
  },
});

export default JourneyScreen;
