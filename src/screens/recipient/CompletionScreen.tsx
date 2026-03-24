import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Platform,
  Linking,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRoute } from '@react-navigation/native';
import { Trophy, Gift, Copy, CheckCircle, Sparkles, Ticket, MessageCircle, Mail, Flame, Share as ShareIcon } from 'lucide-react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Goal,
  ExperienceGift,
  Experience,
  PartnerUser,
} from '../../types';
import { useRecipientNavigation } from '../../types/navigation';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { collection, doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { goalService } from '../../services/GoalService';
import { experienceService } from '../../services/ExperienceService';
import { partnerService } from '../../services/PartnerService';
import { userService } from '../../services/userService';
import { generateCouponForGoal } from '../../services/CouponService';
import { logger } from '../../utils/logger';
import ErrorRetry from '../../components/ErrorRetry';
import { BookingCalendar } from '../../components/BookingCalendar';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { ExperienceCardSkeleton, SkeletonBox } from '../../components/SkeletonLoader';
import { vh } from '../../utils/responsive';
import { useToast } from '../../context/ToastContext';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

const CompletionScreen = () => {
  const navigation = useRecipientNavigation();
  const route = useRoute();
  const { state, dispatch } = useApp();
  const { showError, showInfo } = useToast();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isPhoneCopied, setIsPhoneCopied] = useState(false);
  const [isEmailCopied, setIsEmailCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);

  // Enhanced animation refs
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<any>(null);
  const couponRequestedRef = useRef(false);
  const animTimeoutRef = useRef<NodeJS.Timeout>();
  const copyTimeoutRef = useRef<NodeJS.Timeout>();
  const phoneTimeoutRef = useRef<NodeJS.Timeout>();
  const emailTimeoutRef = useRef<NodeJS.Timeout>();

  // Handle case where route params might be undefined on browser refresh
  const routeParams = route.params as { goal?: Goal; experienceGift?: ExperienceGift } | undefined;
  const rawGoal = routeParams?.goal;
  const rawGift = routeParams?.experienceGift;

  // Check if we have valid data (goal is required, reward is optional)
  const hasValidData = Boolean(
    rawGoal?.id &&
    rawGoal?.sessionsPerWeek !== undefined &&
    rawGoal?.targetCount !== undefined
  );
  const hasReward = Boolean(rawGift?.experienceId);

  // Redirect if data is missing or invalid (e.g., after page refresh)
  useEffect(() => {
    if (!hasValidData) {
      logger.warn('Missing/invalid goal or experienceGift data on CompletionScreen, redirecting to Profile');
      navigation.navigate('Profile');
    }
  }, [hasValidData, navigation]);


  const [experience, setExperience] = useState<Experience | null>(null);
  const [partner, setPartner] = useState<PartnerUser | null>(null);
  const [userName, setUserName] = useState<string>('User');

  // Streak & goals state
  const [otherActiveGoals, setOtherActiveGoals] = useState<number>(0);
  const [sessionStreak, setSessionStreak] = useState<number>(0);

  // Share state
  const shareCardRef = useRef<View>(null);
  const [shareFormat, setShareFormat] = useState<'story' | 'square'>('story');
  const [isSharing, setIsSharing] = useState(false);

  // Date selection for booking
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [bookingMethod, setBookingMethod] = useState<'whatsapp' | 'email' | null>(null);


  const toDate = (value: unknown): Date | undefined => {
    if (!value) return undefined;
    if (typeof value === 'object' && value !== null && 'seconds' in value) {
      return new Date((value as { seconds: number }).seconds * 1000);
    }
    const date = new Date(value as string | number);
    return isNaN(date.getTime()) ? undefined : date;
  };

  const goal: Goal | null = hasValidData
    ? {
      ...rawGoal,
      startDate: toDate(rawGoal!.startDate)!,
      endDate: toDate(rawGoal!.endDate)!,
      createdAt: toDate(rawGoal!.createdAt)!,
      completedAt: toDate(rawGoal!.completedAt),
    } as Goal
    : null;

  const experienceGift: ExperienceGift | null = hasReward
    ? {
      ...rawGift,
      createdAt: toDate(rawGift.createdAt)!,
      deliveryDate: toDate(rawGift.deliveryDate)!,
      claimedAt: toDate(rawGift.claimedAt),
      completedAt: toDate(rawGift.completedAt),
    }
    : null;

  // Fetch streak and active goals count
  useEffect(() => {
    if (!goal?.userId) return;
    const fetchStreakAndGoals = async () => {
      try {
        const userDocSnap = await getDoc(doc(db, 'users', goal.userId));
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          setSessionStreak(userData.sessionStreak || 0);
        }
        const allGoals = await goalService.getUserGoals(goal.userId);
        const activeOthers = allGoals.filter(
          (g: Goal) => g.id !== goal.id && !g.isCompleted
        );
        setOtherActiveGoals(activeOthers.length);
      } catch (error) {
        logger.error('Error fetching streak/goals:', error);
      }
    };
    fetchStreakAndGoals();
  }, [goal?.userId, goal?.id]);

  useEffect(() => {
    if (!goal || !experienceGift) return;

    const fetchExperience = async () => {
      try {
        logger.log('?? Fetching experience with ID:', experienceGift.experienceId);
        const exp = await experienceService.getExperienceById(experienceGift.experienceId);
        logger.log('? Experience loaded:', exp);
        setExperience(exp);

        // Fetch partner contact info
        if (exp?.partnerId) {
          logger.log('?? Fetching partner with ID:', exp.partnerId);
          const partnerData = await partnerService.getPartnerById(exp.partnerId);
          logger.log('? Partner loaded:', partnerData);
          setPartner(partnerData);
        } else {
          logger.warn('?? No partnerId found in experience');
        }

        // Fetch user name
        if (goal.userId) {
          const name = await userService.getUserName(goal.userId);
          setUserName(name || 'User');
        }
      } catch (error) {
        logger.error("? Error fetching data:", error);
        showError("Could not load experience details.");
        setError(true);
      }
    };
    fetchExperience();
  }, [experienceGift?.experienceId, goal?.userId]);

  useEffect(() => {
    // Pick random celebration message
    // Haptic feedback for goal completion
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Fire confetti after brief delay
    animTimeoutRef.current = setTimeout(() => {
      confettiRef.current?.start();
    }, 300);

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 40,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      clearTimeout(animTimeoutRef.current);
    };
  }, []);

  // Bug 3 fix: coupon generation was dead code inside the animation useEffect's
  // cleanup return — it was unreachable because return exits the effect callback.
  // Moved into a dedicated effect that fires once the experience is loaded.
  useEffect(() => {
    if (experience && !couponRequestedRef.current && !couponCode) {
      couponRequestedRef.current = true;
      fetchExistingCoupon();
    }
  }, [experience, couponCode]);

  // Cleanup copy timeouts on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (phoneTimeoutRef.current) clearTimeout(phoneTimeoutRef.current);
      if (emailTimeoutRef.current) clearTimeout(emailTimeoutRef.current);
    };
  }, []);

  // ? SECURITY FIX: Use Firestore transaction to prevent race conditions
  const fetchExistingCoupon = async () => {
    if (!goal || !experienceGift) return;

    try {
      setIsLoading(true);

      // Check payment status before generating coupon — prevents revenue leak
      // for deferred gifts where the charge hasn't confirmed yet
      if (experienceGift.id) {
        const giftSnap = await getDoc(doc(db, 'experienceGifts', experienceGift.id));
        const giftPayment = giftSnap.data()?.payment;
        if (giftPayment === 'deferred' || giftPayment === 'processing') {
          setPaymentPending(true);
          setIsLoading(false);
          return;
        }
      }

      await generateCouponWithTransaction();
    } catch (error: any) {
      if (error?.code === 'PAYMENT_PENDING') {
        setPaymentPending(true);
        return;
      }
      couponRequestedRef.current = false;
      logger.error('Error fetching/generating coupon:', error);
      showError('Could not load or generate your coupon. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateCouponWithTransaction = async () => {
    if (!goal || !experienceGift) return;

    const partnerId = experience?.partnerId || experienceGift?.partnerId;
    if (!partnerId) {
      logger.error('Missing partner ID for coupon generation');
      throw new Error('Missing partner ID');
    }

    const code = await generateCouponForGoal(goal.id, goal.userId, partnerId);
    setCouponCode(code);
  };

  const handleCopy = async () => {
    if (!couponCode) return;
    await Clipboard.setStringAsync(couponCode);
    setIsCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
  };

  const handleScheduleExperience = () => {
    if (!partner || !experience) return;

    const preferredMethod = partner.preferredContact || 'email';

    if (preferredMethod === 'whatsapp' && partner.phone) {
      handleWhatsAppSchedule();
    } else if (partner.contactEmail) {
      handleEmailSchedule();
    } else {
      showInfo('Partner contact information is not available.');
    }
  };

  const handleWhatsAppSchedule = (dateOverride?: Date) => {
    if (!partner?.phone || !experience) return;

    const effectiveDate = dateOverride || preferredDate;
    const dateString = effectiveDate
      ? effectiveDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
      : 'at your earliest convenience';

    const message = `Hi ${partner.name || 'there'}!\n\nI've completed my goal and earned ${experience.title}!\n\nI'd like to schedule my experience for ${dateString}.\n\nLooking forward to it!\n${userName}`;

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

  const handleEmailSchedule = (dateOverride?: Date) => {
    if (!partner || !experience) return;
    const contactEmail = partner.contactEmail || partner.email;
    if (!contactEmail) {
      showInfo('Partner email is not available.');
      return;
    }

    const effectiveDate = dateOverride || preferredDate;
    const dateString = effectiveDate
      ? effectiveDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
      : 'at your earliest convenience';

    const message = `Hi ${partner.name || 'there'}!\n\nI've completed my Ernit goal and earned ${experience.title}!\n\nI'd like to schedule my experience for ${dateString}.\n\nLooking forward to it!\n${userName}`;
    handleEmailFallback(message, contactEmail);
  };

  const handleEmailFallback = (message: string, email?: string) => {
    const contactEmail = email || partner?.contactEmail || partner?.email;
    if (!contactEmail) return;

    const subject = `Experience Booking - ${experience?.title || 'Your Experience'}`;
    const emailUrl = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    Linking.openURL(emailUrl);
  };

  const handleCopyPhone = async () => {
    if (!partner?.phone) return;
    await Clipboard.setStringAsync(partner.phone);
    setIsPhoneCopied(true);
    if (phoneTimeoutRef.current) clearTimeout(phoneTimeoutRef.current);
    phoneTimeoutRef.current = setTimeout(() => setIsPhoneCopied(false), 2000);
  };

  const handleCopyEmail = async () => {
    const contactEmail = partner?.contactEmail || partner?.email;
    if (!contactEmail) return;
    await Clipboard.setStringAsync(contactEmail);
    setIsEmailCopied(true);
    if (emailTimeoutRef.current) clearTimeout(emailTimeoutRef.current);
    emailTimeoutRef.current = setTimeout(() => setIsEmailCopied(false), 2000);
  };

  // New handlers for booking with date selection
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

    // Proceed with the selected booking method
    if (bookingMethod === 'whatsapp') {
      handleWhatsAppSchedule(date);
    } else if (bookingMethod === 'email') {
      handleEmailSchedule(date);
    }
  };

  const handleCancelBooking = () => {
    setPreferredDate(null);
    setShowCalendar(false);

    // Proceed without date
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

  if (!hasValidData || !goal) {
    return (
      <ErrorBoundary screenName="CompletionScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Goals">
        <StatusBar style="dark" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, ...Typography.subheading }}>Redirecting...</Text>
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  const experienceImage = experience
    ? Array.isArray(experience.imageUrl)
      ? experience.imageUrl[0]
      : experience.imageUrl
    : null;

  const totalSessions = goal.sessionsPerWeek * goal.targetCount;

  if (error && !isLoading) {
    return (
      <ErrorBoundary screenName="CompletionScreen" userId={state.user?.id}>
        <MainScreen activeRoute="Goals">
          <ErrorRetry
            message="Could not load experience details"
            onRetry={async () => {
              setError(false);
              setIsLoading(true);
              try {
                if (experienceGift?.experienceId) {
                  const exp = await experienceService.getExperienceById(experienceGift.experienceId);
                  setExperience(exp);
                  if (exp?.partnerId) {
                    const partnerData = await partnerService.getPartnerById(exp.partnerId);
                    setPartner(partnerData);
                  }
                }
              } catch (err) {
                logger.error('Retry failed:', err);
                setError(true);
              } finally {
                setIsLoading(false);
              }
            }}
          />
        </MainScreen>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="CompletionScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Goals">
      <StatusBar style="light" />

      {/* ?? CONFETTI CANNON */}
      <ConfettiCannon
        ref={confettiRef}
        count={150}
        origin={{ x: Dimensions.get('window').width / 2, y: -20 }}
        autoStart={false}
        fadeOut={true}
        fallSpeed={3000}
        colors={[colors.celebrationGold, colors.warning, colors.secondary, colors.secondary, colors.categoryPink]}
      />

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
            {hasReward && experienceImage ? (
              <Image
                source={{ uri: experienceImage }}
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

            <Text style={{ fontSize: Typography.hero.fontSize, fontWeight: '900', color: colors.white, textAlign: 'center', marginTop: Spacing.huge, marginBottom: Spacing.lg }}>
              Goal Completed!
            </Text>

            <Text style={{ fontSize: Typography.heroSub.fontSize, fontWeight: '700', color: colors.primaryTint, textAlign: 'center', marginBottom: 60 }}>
              {goal?.title || goal?.description || ''}
            </Text>

            <View style={{ flexDirection: 'row', gap: 60, marginBottom: 60 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: Typography.hero.fontSize, fontWeight: '900', color: colors.white }}>{totalSessions}</Text>
                <Text style={{ ...Typography.display, color: colors.whiteAlpha90, fontWeight: '600' }}>SESSIONS</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: Typography.hero.fontSize, fontWeight: '900', color: colors.white }}>{goal?.targetCount || 0}</Text>
                <Text style={{ ...Typography.display, color: colors.whiteAlpha90, fontWeight: '600' }}>WEEKS</Text>
              </View>
            </View>

            {sessionStreak >= 3 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.blackAlpha20, paddingVertical: Spacing.lg, paddingHorizontal: Spacing.huge, borderRadius: BorderRadius.pill, gap: Spacing.md, marginBottom: Spacing.huge }}>
                <Text style={{ ...Typography.display }}>🔥</Text>
                <Text style={{ ...Typography.display, fontWeight: '800', color: colors.warningLight }}>{sessionStreak}-session streak</Text>
              </View>
            )}

            <View style={{ position: 'absolute', bottom: 80, alignItems: 'center' }}>
              <Image
                source={require('../../assets/favicon.png')}
                style={{ width: 60, height: 60, marginBottom: Spacing.md }}
                contentFit="contain" cachePolicy="memory-disk"
              />
              <Text style={{ ...Typography.display, fontWeight: '600', color: colors.overlayLight }}>
                Earned with Ernit
              </Text>
            </View>
          </LinearGradient>
        </View>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Animated.View
            style={[
              styles.successIcon,
              {
                transform: [{ scale: scaleAnim }],
                opacity: fadeAnim,
              },
            ]}
          >
            <CheckCircle color={colors.secondary} size={64} strokeWidth={2.5} />
          </Animated.View>

          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.heroTitle}>Goal Completed!</Text>
            <Text style={styles.heroSubtitle}>
              {hasReward ? 'You did it! Your reward is now unlocked 🎉' : 'You did it! 🎉'}
            </Text>
          </Animated.View>
        </View>

        {/* Stats Card - Enhanced */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <CheckCircle color={colors.secondary} size={24} />
            <Text style={styles.statsTitle}>Your Achievement</Text>
          </View>

          <Text style={styles.goalTitle}>{goal.title}</Text>
          <Text style={styles.goalDesc}>{goal.description}</Text>

          <View style={styles.statsBadge}>
            <Sparkles color={colors.celebrationGold} size={20} />
            <Text style={styles.statsNumber}>{totalSessions}</Text>
            <Text style={styles.statsLabel}>Sessions Completed</Text>
          </View>
        </View>

        {/* No-reward CTA */}
        {!hasReward && (
          <View style={styles.noRewardCta}>
            <Text style={styles.noRewardCtaTitle}>What's next?</Text>
            <Text style={styles.noRewardCtaMessage}>
              Browse experiences to earn as your next reward
            </Text>
            <TouchableOpacity
              style={styles.noRewardCtaButton}
              onPress={() => navigation.navigate('CategorySelection')}
              accessibilityRole="button"
              accessibilityLabel="Browse experiences"
            >
              <Gift color={colors.white} size={20} />
              <Text style={styles.noRewardCtaButtonText}>Browse Experiences</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Experience Reveal */}
        {hasReward && experienceGift && (
          <View style={styles.experienceCard}>
            <View style={styles.experienceHeader}>
              <Gift color={colors.secondary} size={24} />
              <Text style={styles.experienceHeaderText}>Your Reward</Text>
            </View>

            {experienceImage && (
              <Image
                source={{ uri: experienceImage }}
                style={styles.experienceImage}
                contentFit="cover" cachePolicy="memory-disk"
                accessibilityLabel={`${experience?.title || 'Experience'} image`}
              />
            )}
            <View style={styles.experienceContent}>
              {experience ? (
                <>
                  <Text style={styles.experienceTitle}>{experience.title}</Text>
                  {experience.subtitle && (
                    <Text style={styles.experienceSubtitle}>{experience.subtitle}</Text>
                  )}
                  <Text style={styles.experienceDescription}>{experience.description}</Text>
                </>
              ) : (
                <View style={{ padding: Spacing.xl, gap: Spacing.md }}>
                  <ExperienceCardSkeleton />
                  <SkeletonBox width="100%" height={48} borderRadius={12} />
                </View>
              )}
            </View>
          </View>
        )}

        {/* Coupon Section - PREMIUM TICKET DESIGN */}
        {hasReward && experienceGift && <View style={styles.couponSection}>
          <View style={styles.couponHeader}>
            <Ticket color={colors.secondary} size={28} />
            <Text style={styles.couponHeaderText}>Your Exclusive Code</Text>
          </View>

          <Text style={styles.couponInstructions}>
            Present this code to redeem your experience
          </Text>

          {isLoading ? (
            <View style={{ padding: Spacing.xl, gap: Spacing.md }}>
              <SkeletonBox width="100%" height={80} borderRadius={12} />
              <SkeletonBox width="100%" height={48} borderRadius={12} />
            </View>
          ) : paymentPending ? (
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <Text style={[styles.couponInstructions, { fontWeight: '600', color: colors.warning }]}>
                Payment is being processed
              </Text>
              <Text style={[styles.couponInstructions, { marginTop: Spacing.sm }]}>
                Your coupon will appear here once the gift payment is confirmed. Check back shortly.
              </Text>
            </View>
          ) : couponCode ? (
            <View>
              <View style={styles.couponCard}>
                <View style={styles.couponDisplay}>
                  <Text style={styles.couponCode}>{couponCode}</Text>
                </View>

                <View style={styles.couponActions}>
                  <TouchableOpacity
                    style={styles.copyCodeButton}
                    onPress={handleCopy}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Copy coupon code"
                  >
                    <Copy color={isCopied ? colors.secondary : colors.secondary} size={20} />
                    <Text style={[styles.copyCodeText, isCopied && styles.copiedText]}>
                      {isCopied ? 'Copied!' : 'Copy Code'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.validityBox}>
                <CheckCircle color={colors.secondary} size={18} />
                <Text style={styles.validityText}>
                  Valid for 1 year from today
                </Text>
              </View>

              {/* Contact Info & Schedule Buttons */}
              {partner && (partner.phone || partner.contactEmail || partner.email) && (
                <View style={{ marginTop: Spacing.xl }}>
                  <View style={styles.contactInfoSection}>
                    <Text style={styles.contactInfoTitle}>Partner Contact</Text>

                    {partner.phone && (
                      <View style={styles.contactInfoRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.contactInfoLabel}>Phone (WhatsApp)</Text>
                          <Text style={styles.contactInfoValue}>{partner.phone}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={handleCopyPhone}
                          style={styles.smallCopyButton}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel="Copy phone number"
                        >
                          {isPhoneCopied ? (
                            <CheckCircle size={18} color={colors.secondary} />
                          ) : (
                            <Copy size={18} color={colors.gray600} />
                          )}
                        </TouchableOpacity>
                      </View>
                    )}

                    {(partner.contactEmail || partner.email) && (
                      <View style={styles.contactInfoRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.contactInfoLabel}>Email</Text>
                          <Text style={[styles.contactInfoValue, { ...Typography.caption }]}>
                            {partner.contactEmail || partner.email}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={handleCopyEmail}
                          style={styles.smallCopyButton}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel="Copy email address"
                        >
                          {isEmailCopied ? (
                            <CheckCircle size={18} color={colors.secondary} />
                          ) : (
                            <Copy size={18} color={colors.gray600} />
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <Text style={styles.scheduleViaLabel}>Schedule via:</Text>
                  <View style={styles.scheduleButtonsContainer}>
                    {partner.phone && (
                      <TouchableOpacity
                        style={[styles.scheduleButton, styles.scheduleButtonWhatsApp, (partner.contactEmail || partner.email) && styles.scheduleButtonHalf]}
                        onPress={handleBookNowWhatsApp}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Schedule via WhatsApp"
                      >
                        <MessageCircle color={colors.white} size={20} />
                        <Text style={styles.scheduleButtonText}>WhatsApp</Text>
                      </TouchableOpacity>
                    )}

                    {(partner.contactEmail || partner.email) && (
                      <TouchableOpacity
                        style={[styles.scheduleButton, styles.scheduleButtonEmail, partner.phone && styles.scheduleButtonHalf]}
                        onPress={handleBookNowEmail}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Schedule via Email"
                      >
                        <Mail color={colors.white} size={20} />
                        <Text style={styles.scheduleButtonText}>Email</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </View>}

        {/* Date Selection Calendar for Booking */}
        {hasReward && (
          <BookingCalendar
            visible={showCalendar}
            selectedDate={preferredDate || new Date()}
            onConfirm={handleConfirmBooking}
            onCancel={handleCancelBooking}
            minimumDate={new Date()}
          />
        )}

        {/* Share Achievement */}
        <View style={styles.shareSection}>
          <Text style={styles.shareSectionTitle}>Share Your Achievement</Text>

          <View style={styles.shareFormatToggle}>
            <TouchableOpacity
              style={[styles.shareFormatOption, shareFormat === 'story' && styles.shareFormatActive]}
              onPress={() => setShareFormat('story')}
              accessibilityRole="button"
              accessibilityLabel="Share as story format"
            >
              <Text style={[styles.shareFormatText, shareFormat === 'story' && styles.shareFormatTextActive]}>
                Story (9:16)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.shareFormatOption, shareFormat === 'square' && styles.shareFormatActive]}
              onPress={() => setShareFormat('square')}
              accessibilityRole="button"
              accessibilityLabel="Share as square format"
            >
              <Text style={[styles.shareFormatText, shareFormat === 'square' && styles.shareFormatTextActive]}>
                Square (1:1)
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.shareButton}
            onPress={handleShare}
            disabled={isSharing}
            accessibilityRole="button"
            accessibilityLabel="Share your achievement"
          >
            <ShareIcon color={colors.white} size={20} />
            <Text style={styles.shareButtonText}>
              {isSharing ? 'Preparing...' : 'Share'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Streak & Next Steps CTA */}
        <View style={styles.streakCtaSection}>
          {sessionStreak >= 3 && (
            <View style={styles.streakBadge}>
              <Flame color={colors.warning} size={28} fill={colors.warning} />
              <Text style={styles.streakCount}>{sessionStreak}</Text>
              <Text style={styles.streakLabel}>session streak</Text>
            </View>
          )}

          {otherActiveGoals === 0 ? (
            <>
              <Text style={styles.streakCtaTitle}>
                {sessionStreak >= 3
                  ? `Keep your ${sessionStreak}-session streak alive!`
                  : 'Ready for your next challenge?'}
              </Text>
              {sessionStreak >= 3 && (
                <Text style={styles.streakCtaMessage}>
                  Start a new goal to keep it going — your streak resets after 7 days of inactivity
                </Text>
              )}
              <TouchableOpacity
                style={styles.streakCtaPrimary}
                onPress={() => navigation.navigate('CategorySelection')}
                accessibilityRole="button"
                accessibilityLabel="Browse experiences"
              >
                <Text style={styles.streakCtaPrimaryText}>Browse Experiences</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.streakCtaSecondary}
                onPress={() => navigation.navigate('Goals')}
                accessibilityRole="button"
                accessibilityLabel="Back to goals"
              >
                <Text style={styles.streakCtaSecondaryText}>Back to Goals</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.streakCtaTitle}>
                {sessionStreak >= 3
                  ? `Your ${sessionStreak}-session streak continues!`
                  : 'You still have active goals — keep going!'}
              </Text>
              {sessionStreak >= 3 && (
                <Text style={styles.streakCtaMessage}>
                  Keep going with your other goals to build it even higher
                </Text>
              )}
              <TouchableOpacity
                style={styles.streakCtaPrimary}
                onPress={() => navigation.navigate('Goals')}
                accessibilityRole="button"
                accessibilityLabel="Back to goals"
              >
                <Text style={styles.streakCtaPrimaryText}>Back to Goals</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={{ height: vh(100) }} />
      </ScrollView>
    </MainScreen >
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
  },
  heroSection: {
    backgroundColor: colors.surface,
    paddingTop: Platform.OS === 'ios' ? vh(56) : vh(40),
    paddingBottom: Spacing.xxxl,
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: Spacing.xxl,
  },
  heroTitle: {
    ...Typography.display,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  heroSubtitle: {
    ...Typography.subheading,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  statsCard: {
    backgroundColor: colors.surface,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statsTitle: {
    ...Typography.heading3,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  goalTitle: {
    ...Typography.heading1,
    color: colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  goalDesc: {
    ...Typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  statsBadge: {
    backgroundColor: colors.warning + '15',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  statsNumber: {
    ...Typography.display,
    fontWeight: '800',
    color: colors.warning,
  },
  statsLabel: {
    ...Typography.subheading,
    fontWeight: '600',
    color: colors.warningDark,
  },
  experienceCard: {
    backgroundColor: colors.surface,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  experienceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  experienceHeaderText: {
    ...Typography.heading3,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  experienceImage: {
    width: '100%',
    height: vh(220),
    backgroundColor: colors.border,
  },
  experienceContent: {
    padding: Spacing.xl,
  },
  experienceTitle: {
    ...Typography.heading1,
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  experienceSubtitle: {
    ...Typography.subheading,
    color: colors.textSecondary,
    marginBottom: Spacing.md,
  },
  experienceDescription: {
    ...Typography.body,
    color: colors.gray700,
    lineHeight: 22,
  },
  couponSection: {
    backgroundColor: colors.surface,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  couponHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  couponHeaderText: {
    ...Typography.heading1,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  couponInstructions: {
    ...Typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.xxl,
    textAlign: 'center',
  },
  loadingBox: {
    paddingVertical: vh(44),
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.lg,
    ...Typography.body,
    color: colors.textSecondary,
  },
  couponCard: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: Spacing.lg,
  },
  couponDisplay: {
    backgroundColor: colors.backgroundLight,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  couponCode: {
    ...Typography.body,
    fontWeight: '700',
    color: colors.secondary,
    textAlign: 'center',
    letterSpacing: 3,
  },
  couponActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  copyCodeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.primarySurface,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primaryTint,
  },
  copyCodeText: {
    ...Typography.subheading,
    fontWeight: '600',
    color: colors.secondary,
  },
  copiedText: {
    color: colors.secondary,
  },
  validityBox: {
    backgroundColor: colors.successLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  validityText: {
    ...Typography.small,
    color: colors.primaryDeep,
    fontWeight: '600',
  },
  // Schedule Buttons
  scheduleViaLabel: {
    ...Typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  scheduleButtonsContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  scheduleButtonWhatsApp: {
    backgroundColor: colors.whatsappGreen,
  },
  scheduleButtonEmail: {
    backgroundColor: colors.secondary,
  },
  scheduleButtonText: {
    color: colors.white,
    ...Typography.body,
    fontWeight: '600',
  },
  scheduleButtonHalf: {
    flex: 1,
  },
  contactInfoSection: {
    backgroundColor: colors.backgroundLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactInfoTitle: {
    ...Typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: Spacing.md,
  },
  contactInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  contactInfoLabel: {
    ...Typography.caption,
    fontWeight: '600',
    color: colors.gray600,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contactInfoValue: {
    ...Typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  smallCopyButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // No-reward CTA
  noRewardCta: {
    backgroundColor: colors.surface,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    alignItems: 'center' as const,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  noRewardCtaTitle: {
    ...Typography.large,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  noRewardCtaMessage: {
    ...Typography.body,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  noRewardCtaButton: {
    backgroundColor: colors.secondary,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: BorderRadius.lg,
  },
  noRewardCtaButtonText: {
    color: colors.white,
    ...Typography.subheading,
    fontWeight: '700' as const,
  },
  // Share section
  shareSection: {
    backgroundColor: colors.surface,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    alignItems: 'center' as const,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  shareSectionTitle: {
    ...Typography.heading3,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    marginBottom: Spacing.lg,
  },
  shareFormatToggle: {
    flexDirection: 'row' as const,
    backgroundColor: colors.backgroundLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.xs,
    marginBottom: Spacing.lg,
    width: '100%' as any,
  },
  shareFormatOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center' as const,
    borderRadius: BorderRadius.sm,
  },
  shareFormatActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  shareFormatText: {
    ...Typography.small,
    fontWeight: '600' as const,
    color: colors.textSecondary,
  },
  shareFormatTextActive: {
    color: colors.textPrimary,
  },
  shareButton: {
    backgroundColor: colors.secondary,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: BorderRadius.lg,
    width: '100%' as any,
  },
  shareButtonText: {
    color: colors.white,
    ...Typography.subheading,
    fontWeight: '700' as const,
  },
  // Streak CTA section
  streakCtaSection: {
    backgroundColor: colors.surface,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    alignItems: 'center' as const,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
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
  streakCount: {
    ...Typography.display,
    fontWeight: '800' as const,
    color: colors.warning,
  },
  streakLabel: {
    ...Typography.body,
    fontWeight: '600' as const,
    color: colors.warningDark,
  },
  streakCtaTitle: {
    ...Typography.large,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    textAlign: 'center' as const,
    marginBottom: Spacing.sm,
  },
  streakCtaMessage: {
    ...Typography.small,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  streakCtaPrimary: {
    backgroundColor: colors.secondary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
    width: '100%' as any,
    alignItems: 'center' as const,
  },
  streakCtaPrimaryText: {
    color: colors.white,
    ...Typography.subheading,
    fontWeight: '700' as const,
  },
  streakCtaSecondary: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
    width: '100%' as any,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakCtaSecondaryText: {
    color: colors.textSecondary,
    ...Typography.subheading,
    fontWeight: '600' as const,
  },
});

export default CompletionScreen;
