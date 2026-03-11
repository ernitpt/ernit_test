import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Animated, Easing, Image, TouchableOpacity,
  Platform, Linking, LayoutAnimation,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useRoute } from '@react-navigation/native';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Goal, SessionRecord, Motivation } from '../../types';
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
import { ErrorBoundary } from '../../components/ErrorBoundary';
import Colors from '../../config/colors';
import { logger } from '../../utils/logger';
import { captureRef } from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import { Trophy, Gift, Copy, CheckCircle, Sparkles, Ticket, MessageCircle, Mail, Share as ShareIcon, Clock, PlayCircle } from 'lucide-react-native';

const toDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  if (value?.seconds) return new Date(value.seconds * 1000);
  const date = new Date(value);
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
        <View style={sessStyles.badge}>
          <Text style={sessStyles.badgeText}>#{session.sessionNumber}</Text>
        </View>
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

// sessStyles - copy exactly from JourneyScreen
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

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
const AchievementDetailScreen = () => {
  const navigation = useRootNavigation();
  const route = useRoute();
  const { state } = useApp();
  const { showError, showInfo } = useToast();

  const routeParams = route.params as { goal?: any } | undefined;
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
  const [experience, setExperience] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [userName, setUserName] = useState<string>('User');
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  // Format completion date
  const rawDate = goal?.completedAt as any;
  const parsedDate = rawDate?.toDate ? rawDate.toDate() : rawDate ? new Date(rawDate) : null;
  const completedDate = parsedDate && !isNaN(parsedDate.getTime())
    ? parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

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
        if (goal.pledgedExperience?.experienceId) {
          expId = goal.pledgedExperience.experienceId;
        } else if (goal.experienceGiftId) {
          try {
            const gift = await experienceGiftService.getExperienceGiftById(goal.experienceGiftId);
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

        // Existing coupon - check goal first, then Firestore
        if (goal.couponCode) {
          setCouponCode(goal.couponCode);
        } else if (goal.experienceGiftId) {
          const couponsRef = collection(db, 'partnerCoupons');
          const q = query(couponsRef, where('goalId', '==', goal.id), limit(1));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            setCouponCode(snapshot.docs[0].data().code);
          }
        }
      } catch (error) {
        logger.error('Error fetching achievement data:', error);
        showError('Could not load achievement details.');
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
      } catch (error) {
        logger.error('Error fetching sessions:', error);
      } finally {
        setSessionsLoading(false);
      }
    };
    loadSessions();
  }, [goal?.id]);

  // useEffect 3 - Motivations
  useEffect(() => {
    if (!goal?.id) return;
    const fetchMotivations = async () => {
      try {
        const data = await motivationService.getAllMotivations(goal.id);
        setMotivations(data);
      } catch (error) {
        logger.error('Error fetching motivations:', error);
      }
    };
    fetchMotivations();
  }, [goal?.id]);

  // ───── Handler functions ─────
  const handleCopy = async () => {
    if (!couponCode) return;
    await Clipboard.setStringAsync(couponCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCopyPhone = async () => {
    if (!partner?.phone) return;
    await Clipboard.setStringAsync(partner.phone);
    setIsPhoneCopied(true);
    setTimeout(() => setIsPhoneCopied(false), 2000);
  };

  const handleCopyEmail = async () => {
    const contactEmail = partner?.contactEmail || partner?.email;
    if (!contactEmail) return;
    await Clipboard.setStringAsync(contactEmail);
    setIsEmailCopied(true);
    setTimeout(() => setIsEmailCopied(false), 2000);
  };

  const handleEmailFallback = (url: string) => {
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        showInfo('Could not open email client.');
      }
    });
  };

  const handleWhatsAppSchedule = () => {
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
    });
  };

  const handleEmailSchedule = () => {
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
  };

  const handleBookNowWhatsApp = () => {
    setBookingMethod('whatsapp');
    setShowCalendar(true);
  };

  const handleBookNowEmail = () => {
    setBookingMethod('email');
    setShowCalendar(true);
  };

  const handleConfirmBooking = (date: Date) => {
    setPreferredDate(date);
    setShowCalendar(false);

    if (bookingMethod === 'whatsapp') {
      handleWhatsAppSchedule();
    } else if (bookingMethod === 'email') {
      handleEmailSchedule();
    }
  };

  const handleCancelBooking = () => {
    setPreferredDate(null);
    setShowCalendar(false);

    if (bookingMethod === 'whatsapp') {
      handleWhatsAppSchedule();
    } else if (bookingMethod === 'email') {
      handleEmailSchedule();
    }
  };

  const handleShare = async () => {
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
    } catch (error) {
      logger.error('Error sharing achievement:', error);
      showError('Could not share. Please try again.');
    } finally {
      setIsSharing(false);
    }
  };

  // ───── HintItem (inline component) ─────
  const fmtDateTime = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

  const HintItem = ({ hint, index }: { hint: any; index: number }) => {
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
      <Animated.View style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: Colors.border,
      }}>
        <Text style={{ fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 }}>
          {fmtDateTime(dateMs)}
        </Text>
        {hasImage && hint.imageUrl && (
          <TouchableOpacity onPress={() => setSelectedImageUri(hint.imageUrl)} activeOpacity={0.9}>
            <Image source={{ uri: hint.imageUrl }} style={styles.hintImage} />
          </TouchableOpacity>
        )}
        {text && (
          <Text style={{ color: '#374151', fontSize: 15, lineHeight: 22, marginBottom: isAudio ? 8 : 0 }}>
            {text}
          </Text>
        )}
        {isAudio && hint.audioUrl && (
          <AudioPlayer uri={hint.audioUrl} duration={hint.duration} />
        )}
      </Animated.View>
    );
  };

  // ───── Null/loading guard ─────
  if (!goal) {
    return (
      <ErrorBoundary screenName="AchievementDetailScreen" userId={state.user?.id}>
        <MainScreen activeRoute="Profile">
          <StatusBar style="light" />
          <SharedHeader title="Achievement" showBack />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 16 }}>Redirecting...</Text>
          </View>
        </MainScreen>
      </ErrorBoundary>
    );
  }

  // ───── JSX STRUCTURE ─────
  return (
    <ErrorBoundary screenName="AchievementDetailScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Profile">
        <StatusBar style="light" />
        <SharedHeader title="Achievement" showBack />

        {/* Off-screen Share Card */}
        <View style={{ position: 'absolute', left: -9999 }}>
          <View ref={shareCardRef} style={{ width: 1080, height: shareFormat === 'story' ? 1920 : 1080, backgroundColor: '#0891b2' }} collapsable={false}>
            <LinearGradient colors={['#10b981', '#0891b2', Colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 80, justifyContent: 'center', alignItems: 'center' }}>
              {experienceImage ? (
                <Image source={{ uri: experienceImage }} style={{ width: 600, height: shareFormat === 'story' ? 400 : 300, borderRadius: 40, marginBottom: 60 }} resizeMode="cover" />
              ) : null}
              <Trophy color="#fef3c7" size={120} strokeWidth={2.5} fill="#fbbf24" />
              <Text style={{ fontSize: 72, fontWeight: '900', color: '#fff', textAlign: 'center', marginTop: 40, marginBottom: 16 }}>Goal Completed!</Text>
              <Text style={{ fontSize: 42, fontWeight: '700', color: '#d1fae5', textAlign: 'center', marginBottom: 60 }}>{goal.title || goal.description || ''}</Text>
              <View style={{ flexDirection: 'row', gap: 60, marginBottom: 60 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 72, fontWeight: '900', color: '#fff' }}>{totalSessions}</Text>
                  <Text style={{ fontSize: 28, color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>SESSIONS</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 72, fontWeight: '900', color: '#fff' }}>{goal.targetCount || 0}</Text>
                  <Text style={{ fontSize: 28, color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>WEEKS</Text>
                </View>
              </View>
              <View style={{ position: 'absolute', bottom: 80, alignItems: 'center' }}>
                <Image source={require('../../assets/favicon.png')} style={{ width: 60, height: 60, marginBottom: 12 }} resizeMode="contain" />
                <Text style={{ fontSize: 28, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>Earned with Ernit</Text>
              </View>
            </LinearGradient>
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 20, paddingBottom: 40, alignItems: 'center' }}>
          <View style={{ width: '100%', maxWidth: 380, paddingHorizontal: 16 }}>

            {/* ─── 1. Completion Header ─── */}
            <View style={cStyles.headerCard}>
              <View style={cStyles.trophyCircle}>
                <Trophy size={32} color={Colors.primary} />
              </View>
              <Text style={cStyles.headerTitle}>Challenge Complete!</Text>
              <View style={cStyles.statsRow}>
                <Text style={cStyles.statText}>{totalSessions} sessions</Text>
                <View style={cStyles.statDot} />
                <Text style={cStyles.statText}>{goal.targetCount} weeks</Text>
              </View>
              {completedDate && (
                <Text style={cStyles.completedDate}>Completed {completedDate}</Text>
              )}
            </View>

            {/* ─── 2. Achievement Info ─── */}
            <View style={cStyles.section}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <CheckCircle color="#10b981" size={20} />
                <Text style={cStyles.sectionTitle}>Your Achievement</Text>
              </View>
              <Text style={{ fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 }}>{goal.title}</Text>
              {goal.description ? (
                <Text style={{ fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 14 }}>{goal.description}</Text>
              ) : null}
              <View style={{ backgroundColor: '#fef3c7', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <Sparkles color="#fbbf24" size={18} />
                <Text style={{ fontSize: 24, fontWeight: '800', color: '#f59e0b' }}>{totalSessions}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#92400e' }}>Sessions Completed</Text>
              </View>
            </View>

            {/* ─── 3. Experience/Reward ─── */}
            {(hasReward || (goal.isFreeGoal && goal.pledgedExperience)) && (
              <View style={cStyles.section}>
                <Text style={cStyles.sectionTitle}>
                  <Gift size={15} color={Colors.primary} />  Your Reward
                </Text>

                {/* Experience image */}
                {(goal.pledgedExperience?.coverImageUrl || experienceImage) && (
                  <Image
                    source={{ uri: experienceImage || goal.pledgedExperience?.coverImageUrl }}
                    style={{ width: '100%', height: 180, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: Colors.backgroundLight }}
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
                        <Text style={{ fontSize: 14, color: '#374151', lineHeight: 20, marginTop: 8 }}>{experience.description}</Text>
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
                            <Ticket size={18} color={Colors.primary} />
                            <Text style={cStyles.couponLabel}>Your Redemption Code</Text>
                          </View>
                          <View style={cStyles.couponCodeBox}>
                            <Text style={cStyles.couponCodeText}>{couponCode}</Text>
                          </View>
                          <TouchableOpacity style={cStyles.copyButton} onPress={handleCopy} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Copy coupon code">
                            {isCopied ? <CheckCircle size={16} color="#10b981" /> : <Copy size={16} color={Colors.primary} />}
                            <Text style={[cStyles.copyText, isCopied && { color: '#10b981' }]}>
                              {isCopied ? 'Copied!' : 'Copy Code'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : isLoading ? (
                        <View style={{ padding: 10 }}><ExperienceCardSkeleton /></View>
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
                          <View style={cStyles.scheduleRow}>
                            {partner.phone && (
                              <TouchableOpacity style={cStyles.whatsappBtn} onPress={handleBookNowWhatsApp} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Schedule via WhatsApp">
                                <MessageCircle size={16} color="#fff" />
                                <Text style={cStyles.scheduleBtnText}>WhatsApp</Text>
                              </TouchableOpacity>
                            )}
                            {(partner.contactEmail || partner.email) && (
                              <TouchableOpacity style={cStyles.emailBtn} onPress={handleBookNowEmail} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Schedule via Email">
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
              </View>
            )}

            {/* ─── 4. Sessions History ─── */}
            <View style={cStyles.section}>
              <Text style={cStyles.sectionTitle}>
                Sessions <Text style={cStyles.countBadge}>{sessions.length}</Text>
              </Text>
              {sessionsLoading && sessions.length === 0 ? (
                <View style={{ gap: 10 }}>
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
                  {hintsArray
                    .slice()
                    .sort((a: any, b: any) => {
                      const sessionA = a.forSessionNumber || a.session || 0;
                      const sessionB = b.forSessionNumber || b.session || 0;
                      return Number(sessionB) - Number(sessionA);
                    })
                    .map((h: any, i: number) => {
                      const session = h.forSessionNumber || h.session || 0;
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
                      return <HintItem key={`${session}-${dateMs}`} hint={h} index={i} />;
                    })}
                </View>
              </View>
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
              <TouchableOpacity style={styles.shareButton} onPress={handleShare} disabled={isSharing}>
                <ShareIcon color="#fff" size={20} />
                <Text style={styles.shareButtonText}>{isSharing ? 'Preparing...' : 'Share'}</Text>
              </TouchableOpacity>
            </View>

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
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  statText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  statDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.textMuted },
  completedDate: { fontSize: 13, color: Colors.textMuted, fontWeight: '500', marginTop: 2 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
  countBadge: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  experienceBody: {
    backgroundColor: '#fff',
    padding: 14,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Colors.border,
  },
  experienceName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  experienceSubtitle: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  rewardDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 14 },
  couponCard: {
    backgroundColor: Colors.primarySurface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    marginBottom: 12,
  },
  couponRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  couponLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  couponCodeBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  couponCodeText: { fontSize: 20, fontWeight: '900', letterSpacing: 3, color: Colors.textPrimary },
  copyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  copyText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  contactCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  contactTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  contactLabel: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  contactValue: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginTop: 2 },
  smallCopyBtn: { padding: 6 },
  scheduleRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  whatsappBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#25D366', paddingVertical: 12, borderRadius: 10,
  },
  emailBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: Colors.secondary, paddingVertical: 12, borderRadius: 10,
  },
  scheduleBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────
// STYLES - remaining styles
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  hintImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: Colors.backgroundLight,
  },
  emptyContainer: { alignItems: 'center', paddingVertical: 30 },
  emptyIcon: { fontSize: 40, marginBottom: 6 },
  emptyText: { color: Colors.textSecondary, fontSize: 16, fontWeight: '600' },
  shareFormatToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundLight,
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  shareFormatOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  shareFormatActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  shareFormatText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  shareFormatTextActive: { color: Colors.primaryDark },
  shareButton: {
    backgroundColor: Colors.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  shareButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default AchievementDetailScreen;
