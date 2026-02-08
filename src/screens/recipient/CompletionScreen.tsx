import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Platform,
  Linking,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Trophy, Gift, Copy, CheckCircle, Sparkles, Ticket, MessageCircle, Mail, Star, Zap } from 'lucide-react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { LinearGradient } from 'expo-linear-gradient';
import {
  RecipientStackParamList,
  Goal,
  ExperienceGift,
  PartnerCoupon,
} from '../../types';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { collection, doc, setDoc, serverTimestamp, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { goalService } from '../../services/GoalService';
import { experienceService } from '../../services/ExperienceService';
import { partnerService } from '../../services/PartnerService';
import { userService } from '../../services/userService';
import { logger } from '../../utils/logger';
import { BookingCalendar } from '../../components/BookingCalendar';

type CompletionNavigationProp = NativeStackNavigationProp<
  RecipientStackParamList,
  'Completion'
>;

const CompletionScreen = () => {
  const navigation = useNavigation<CompletionNavigationProp>();
  const route = useRoute();
  const { dispatch } = useApp();

  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isPhoneCopied, setIsPhoneCopied] = useState(false);
  const [isEmailCopied, setIsEmailCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [celebrationMessage, setCelebrationMessage] = useState('Amazing!');

  // Enhanced animation refs
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const trophyPulse = useRef(new Animated.Value(1)).current;
  const sparkleAnim = useRef(new Animated.Value(0)).current;
  const colorCycle = useRef(new Animated.Value(0)).current;
  const gradientAnim = useRef(new Animated.Value(0)).current;
  const floatAnim1 = useRef(new Animated.Value(0)).current;
  const floatAnim2 = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<any>(null);
  const couponRequestedRef = useRef(false);

  // Handle case where route params might be undefined on browser refresh
  const routeParams = route.params as { goal?: any; experienceGift?: any } | undefined;
  const rawGoal = routeParams?.goal;
  const rawGift = routeParams?.experienceGift;

  // Check if we have valid data (not just object existence, but required properties)
  const hasValidData = Boolean(
    rawGoal?.id &&
    rawGoal?.sessionsPerWeek !== undefined &&
    rawGoal?.targetCount !== undefined &&
    rawGift?.experienceId
  );

  // Redirect if data is missing or invalid (e.g., after page refresh)
  useEffect(() => {
    if (!hasValidData) {
      logger.warn('Missing/invalid goal or experienceGift data on CompletionScreen, redirecting to Profile');
      navigation.navigate('Profile' as any);
    }
  }, [hasValidData, navigation]);

  // 💝 SECURITY: Block access to locked Valentine goals
  // If isUnlocked is already true in nav params, trust it (set by unlock flow).
  // If not, fetch fresh from Firestore to verify actual state.
  const [isValidating, setIsValidating] = useState(true);
  const [unlockVerified, setUnlockVerified] = useState(false);

  const [experience, setExperience] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [userName, setUserName] = useState<string>('User');

  // Date selection for booking
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [bookingMethod, setBookingMethod] = useState<'whatsapp' | 'email' | null>(null);

  useEffect(() => {
    if (!hasValidData) {
      setIsValidating(false);
      return;
    }

    if (rawGoal?.valentineChallengeId) {
      if (rawGoal?.isUnlocked) {
        // Already unlocked in nav params — trust the navigation source
        setUnlockVerified(true);
        setIsValidating(false);
      } else {
        // Not unlocked in params — fetch fresh from Firestore to verify
        const checkUnlock = async () => {
          try {
            const freshGoalDoc = await getDoc(doc(db, 'goals', rawGoal.id));
            if (freshGoalDoc.exists() && freshGoalDoc.data().isUnlocked) {
              // Goal IS unlocked in Firestore, nav params were just stale
              setUnlockVerified(true);
              setIsValidating(false);
            } else {
              logger.error('💝 SECURITY: Attempted unauthorized access to locked Valentine goal');
              Alert.alert(
                'Not Yet! 💕',
                'Both partners must complete their goals before accessing the experience. Keep going!',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            }
          } catch (error) {
            logger.error('Error validating Valentine goal unlock:', error);
            navigation.goBack();
          }
        };
        checkUnlock();
      }
    } else {
      setIsValidating(false);
    }
  }, [hasValidData, rawGoal?.id, rawGoal?.isUnlocked, rawGoal?.valentineChallengeId, navigation]);

  // Early return if data is missing, invalid, locked Valentine goal, or still validating
  const isUnlocked = !!(rawGoal?.isUnlocked || unlockVerified);
  const isLockedValentineGoal = rawGoal?.valentineChallengeId && !isUnlocked;

  const toDate = (value: any): Date | undefined => {
    if (!value) return undefined;
    if (value?.seconds) return new Date(value.seconds * 1000);
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  };

  const goal: Goal | null = hasValidData
    ? {
      ...rawGoal,
      startDate: toDate(rawGoal.startDate)!,
      endDate: toDate(rawGoal.endDate)!,
      createdAt: toDate(rawGoal.createdAt)!,
      updatedAt: toDate(rawGoal.updatedAt),
      completedAt: toDate(rawGoal.completedAt),
    }
    : null;

  const experienceGift: ExperienceGift | null = hasValidData
    ? {
      ...rawGift,
      createdAt: toDate(rawGift.createdAt)!,
      deliveryDate: toDate(rawGift.deliveryDate)!,
      claimedAt: toDate(rawGift.claimedAt),
      completedAt: toDate(rawGift.completedAt),
    }
    : null;

  // 💝 FINAL DEFENSIVE CHECK: This should NEVER be reached if navigation checks are correct
  if (goal?.valentineChallengeId && !isUnlocked) {
    logger.error('💝 CRITICAL SECURITY BYPASS: Unauthorized access to locked Valentine goal detected!');
    throw new Error('Unauthorized access to locked Valentine goal');
  }

  useEffect(() => {
    if (!goal || !experienceGift) return;

    const fetchExperience = async () => {
      try {
        logger.log('🔍 Fetching experience with ID:', experienceGift.experienceId);
        const exp = await experienceService.getExperienceById(experienceGift.experienceId);
        logger.log('✅ Experience loaded:', exp);
        setExperience(exp);

        // 💝 VALENTINE: Check if both partners finished before allowing access
        if (goal.valentineChallengeId && !isUnlocked) {
          Alert.alert(
            'Not Yet! 💕',
            'Both partners must complete their goals before accessing the experience.',
            [
              {
                text: 'OK',
                onPress: () => navigation.goBack()
              }
            ]
          );
          return;
        }

        // Fetch partner contact info
        if (exp?.partnerId) {
          logger.log('🔍 Fetching partner with ID:', exp.partnerId);
          const partnerData = await partnerService.getPartnerById(exp.partnerId);
          logger.log('✅ Partner loaded:', partnerData);
          setPartner(partnerData);
        } else {
          logger.warn('⚠️ No partnerId found in experience');
        }

        // Fetch user name
        if (goal.userId) {
          const name = await userService.getUserName(goal.userId);
          setUserName(name || 'User');
        }
      } catch (error) {
        logger.error("❌ Error fetching data:", error);
        Alert.alert("Error", "Could not load experience details.");
      }
    };
    fetchExperience();
  }, [experienceGift?.experienceId, goal?.userId, isUnlocked, goal?.valentineChallengeId]);

  useEffect(() => {
    // Pick random celebration message
    const messages = [
      'Incredible!',
      'You crushed it!',
      'Legend!',
      'Unstoppable!',
      'Champion!',
      'Phenomenal!',
      'Absolutely Amazing!'
    ];
    setCelebrationMessage(messages[Math.floor(Math.random() * messages.length)]);

    // 🎉🎊 EPIC CELEBRATION SEQUENCE
    // Fire confetti after brief delay
    setTimeout(() => {
      confettiRef.current?.start();
    }, 300);

    Animated.parallel([
      // Trophy entrance with bounce
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

    // 🌟 Trophy pulsing with glow
    Animated.loop(
      Animated.sequence([
        Animated.timing(trophyPulse, {
          toValue: 1.12,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(trophyPulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // ✨ Sparkles twinkle
    Animated.loop(
      Animated.sequence([
        Animated.timing(sparkleAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(sparkleAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // 🎨 Gradient sweep animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(gradientAnim, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: false,
        }),
        Animated.timing(gradientAnim, {
          toValue: 0,
          duration: 4000,
          useNativeDriver: false,
        }),
      ])
    ).start();

    // 🎈 Floating particles
    Animated.loop(
      Animated.timing(floatAnim1, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.timing(floatAnim2, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      })
    ).start();

    // Only fetch/generate coupon after experience is loaded
    if (experience && !couponRequestedRef.current && !couponCode) {
      couponRequestedRef.current = true;
      fetchExistingCoupon();
    }
  }, [experience, couponCode]);

  // ✅ SECURITY FIX: Use Firestore transaction to prevent race conditions
  const fetchExistingCoupon = async () => {
    if (!goal || !experienceGift) return;

    try {
      setIsLoading(true);
      await generateCouponWithTransaction();
    } catch (error) {
      couponRequestedRef.current = false;
      logger.error('Error fetching/generating coupon:', error);
      Alert.alert('Error', 'Could not load or generate your coupon. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * ✅ SECURITY: Atomic coupon generation using Firestore transaction
   * Prevents race conditions and duplicate coupons
   */
  const generateCouponWithTransaction = async () => {
    if (!goal || !experienceGift) return;

    logger.log('🎫 Starting coupon generation...');
    logger.log('experienceGift.partnerId:', experienceGift?.partnerId);
    logger.log('experience.partnerId:', experience?.partnerId);

    const partnerId = experience?.partnerId || experienceGift?.partnerId;

    if (!partnerId) {
      logger.error('❌ Missing partner ID for coupon generation');
      logger.error('experienceGift:', experienceGift);
      logger.error('experience:', experience);
      throw new Error('Missing partner ID');
    }

    logger.log('✅ Using partnerId:', partnerId);
    const goalRef = doc(db, 'goals', goal.id);

    try {
      await runTransaction(db, async (transaction) => {
        // Read goal document within transaction
        const goalDoc = await transaction.get(goalRef);

        if (!goalDoc.exists()) {
          throw new Error('Goal not found');
        }

        const goalData = goalDoc.data();

        // ✅ Check if coupon already exists (atomic check)
        if (goalData.couponCode) {
          logger.log('✅ Found existing coupon:', goalData.couponCode);
          setCouponCode(goalData.couponCode);
          return; // Exit transaction early
        }

        // Generate new coupon code
        const newCouponCode = generateUniqueCode();
        const userId = goal.userId;
        const validUntil = new Date();
        validUntil.setFullYear(validUntil.getFullYear() + 1);

        const coupon: PartnerCoupon = {
          code: newCouponCode,
          status: 'active',
          userId,
          validUntil,
          partnerId,
          goalId: goal.id,
        };

        const partnerCouponRef = doc(
          collection(db, `partnerUsers/${partnerId}/coupons`),
          newCouponCode
        );

        // Check for code collision (extremely rare with 12 chars)
        const existingCouponDoc = await transaction.get(partnerCouponRef);
        if (existingCouponDoc.exists()) {
          logger.error('⚠️ Coupon code collision detected');
          throw new Error('CODE_COLLISION'); // Will trigger retry
        }

        // ✅ Atomically create both documents
        transaction.set(partnerCouponRef, {
          ...coupon,
          createdAt: serverTimestamp(),
        });

        transaction.update(goalRef, {
          couponCode: newCouponCode,
          couponGeneratedAt: serverTimestamp(),
        });

        // Update local state
        setCouponCode(newCouponCode);
        logger.log('✅ Coupon atomically generated:', newCouponCode);
      });
    } catch (error: any) {
      // Retry on code collision
      if (error.message === 'CODE_COLLISION') {
        logger.log('🔄 Retrying coupon generation due to collision...');
        return await generateCouponWithTransaction();
      }

      throw error;
    }
  };

  const generateUniqueCode = () => {
    // SECURITY: Increased from 8 to 12 characters for better security
    // 36^12 = 4.7 x 10^18 combinations (vs 36^8 = 2.8 x 10^12)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 12 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  };

  const handleCopy = async () => {
    if (!couponCode) return;
    await Clipboard.setStringAsync(couponCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleScheduleExperience = () => {
    if (!partner || !experience) return;

    const preferredMethod = partner.preferredContact || 'email';

    if (preferredMethod === 'whatsapp' && partner.phone) {
      handleWhatsAppSchedule();
    } else if (partner.contactEmail) {
      handleEmailSchedule();
    } else {
      Alert.alert('No Contact Info', 'Partner contact information is not available.');
    }
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
        Alert.alert('WhatsApp Not Available', 'WhatsApp is not installed. Please use email to contact the partner.');
      }
    });
  };

  const handleEmailSchedule = () => {
    if (!partner || !experience) return;
    const contactEmail = partner.contactEmail || partner.email;
    if (!contactEmail) {
      Alert.alert('No Email', 'Partner email is not available.');
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
    setTimeout(() => setIsPhoneCopied(false), 2000);
  };

  const handleCopyEmail = async () => {
    const contactEmail = partner?.contactEmail || partner?.email;
    if (!contactEmail) return;
    await Clipboard.setStringAsync(contactEmail);
    setIsEmailCopied(true);
    setTimeout(() => setIsEmailCopied(false), 2000);
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
      handleWhatsAppSchedule();
    } else if (bookingMethod === 'email') {
      handleEmailSchedule();
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

  if (!hasValidData || !goal || !experienceGift || (isLockedValentineGoal && !isValidating) || isValidating) {
    return (
      <MainScreen activeRoute="Goals">
        <StatusBar style="light" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#6b7280', fontSize: 16 }}>
            {!hasValidData ? 'Redirecting...' : isValidating ? 'Validating access...' : 'Checking access...'}
          </Text>
        </View>
      </MainScreen>
    );
  }

  const experienceImage = experience
    ? Array.isArray(experience.imageUrl)
      ? experience.imageUrl[0]
      : experience.imageUrl
    : null;

  const totalSessions = goal.sessionsPerWeek * goal.targetCount;

  return (
    <MainScreen activeRoute="Goals">
      <StatusBar style="light" />

      {/* 🎊 CONFETTI CANNON */}
      <ConfettiCannon
        ref={confettiRef}
        count={150}
        origin={{ x: Dimensions.get('window').width / 2, y: -20 }}
        autoStart={false}
        fadeOut={true}
        fallSpeed={3000}
        colors={['#fbbf24', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']}
      />

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Hero Section - EPIC CELEBRATION */}
        <LinearGradient
          colors={['#10b981', '#0891b2', '#8b5cf6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroSection}
        >
          {/* Floating particles */}
          <Animated.View
            style={[
              styles.floatingParticle,
              {
                opacity: floatAnim1.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 0.8],
                }),
                transform: [
                  {
                    translateY: floatAnim1.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -100],
                    }),
                  },
                ],
                left: '20%',
                top: 100,
              },
            ]}
          >
            <Star color="#fbbf24" size={20} fill="#fbbf24" />
          </Animated.View>

          <Animated.View
            style={[
              styles.floatingParticle,
              {
                opacity: floatAnim2.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.4, 0.9],
                }),
                transform: [
                  {
                    translateY: floatAnim2.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -120],
                    }),
                  },
                ],
                right: '15%',
                top: 80,
              },
            ]}
          >
            <Zap color="#f59e0b" size={24} fill="#f59e0b" />
          </Animated.View>

          {/* ✨ Enhanced sparkle effects */}
          <Animated.View
            style={[
              styles.sparkle,
              {
                opacity: sparkleAnim,
                top: 40,
                left: 30,
              },
            ]}
          >
            <Sparkles color="#fef3c7" size={32} />
          </Animated.View>
          <Animated.View
            style={[
              styles.sparkle,
              {
                opacity: sparkleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0],
                }),
                top: 60,
                right: 40,
              },
            ]}
          >
            <Sparkles color="#fde68a" size={28} />
          </Animated.View>

          {/* Larger trophy with glow */}
          <Animated.View
            style={[
              styles.trophyContainer,
              {
                transform: [
                  { scale: Animated.multiply(scaleAnim, trophyPulse) }
                ],
                opacity: fadeAnim,
              },
            ]}
          >
            <Trophy color="#fef3c7" size={100} strokeWidth={2.5} fill="#fbbf24" />
          </Animated.View>

          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.heroTitle}>Goal Completed!</Text>
            <Animated.Text
              style={styles.celebrationMessage}
            >
              {celebrationMessage}
            </Animated.Text>
            <Text style={styles.heroSubtitle}>
              You did it! Your reward is now unlocked 🎉
            </Text>

            {/* Enhanced completion stats */}
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{totalSessions}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{goal.targetCount}</Text>
                <Text style={styles.statLabel}>Weeks</Text>
              </View>
            </View>
          </Animated.View>
        </LinearGradient>

        {/* Stats Card - Enhanced */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <CheckCircle color="#10b981" size={24} />
            <Text style={styles.statsTitle}>Your Achievement</Text>
          </View>

          <Text style={styles.goalTitle}>{goal.title}</Text>
          <Text style={styles.goalDesc}>{goal.description}</Text>

          <View style={styles.statsBadge}>
            <Sparkles color="#fbbf24" size={20} />
            <Text style={styles.statsNumber}>{totalSessions}</Text>
            <Text style={styles.statsLabel}>Sessions Completed</Text>
          </View>
        </View>

        {/* Experience Reveal */}
        <View style={styles.experienceCard}>
          <View style={styles.experienceHeader}>
            <Gift color="#8b5cf6" size={24} />
            <Text style={styles.experienceHeaderText}>Your Reward</Text>
          </View>

          <Image
            source={{ uri: experienceImage }}
            style={styles.experienceImage}
            resizeMode="cover"
          />
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
              <ActivityIndicator size="small" color="#8b5cf6" />
            )}
          </View>
        </View>

        {/* Coupon Section - PREMIUM TICKET DESIGN */}
        <View style={styles.couponSection}>
          <View style={styles.couponHeader}>
            <Ticket color="#8b5cf6" size={28} />
            <Text style={styles.couponHeaderText}>Your Exclusive Code</Text>
          </View>

          <Text style={styles.couponInstructions}>
            Present this code to redeem your experience
          </Text>

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={styles.loadingText}>Generating your code...</Text>
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
                  >
                    <Copy color={isCopied ? "#10b981" : "#8b5cf6"} size={20} />
                    <Text style={[styles.copyCodeText, isCopied && styles.copiedText]}>
                      {isCopied ? 'Copied!' : 'Copy Code'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.validityBox}>
                <CheckCircle color="#10b981" size={18} />
                <Text style={styles.validityText}>
                  Valid for 1 year from today
                </Text>
              </View>

              {/* Contact Info & Schedule Buttons */}
              {partner && (partner.phone || partner.contactEmail || partner.email) && (
                <View style={{ marginTop: 20 }}>
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
                        >
                          {isPhoneCopied ? (
                            <CheckCircle size={18} color="#10b981" />
                          ) : (
                            <Copy size={18} color="#6B7280" />
                          )}
                        </TouchableOpacity>
                      </View>
                    )}

                    {(partner.contactEmail || partner.email) && (
                      <View style={styles.contactInfoRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.contactInfoLabel}>Email</Text>
                          <Text style={[styles.contactInfoValue, { fontSize: 13 }]}>
                            {partner.contactEmail || partner.email}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={handleCopyEmail}
                          style={styles.smallCopyButton}
                          activeOpacity={0.7}
                        >
                          {isEmailCopied ? (
                            <CheckCircle size={18} color="#10b981" />
                          ) : (
                            <Copy size={18} color="#6B7280" />
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <View style={styles.scheduleButtonsContainer}>
                    {partner.phone && (
                      <TouchableOpacity
                        style={[
                          styles.scheduleButtonWrapper,
                          (partner.contactEmail || partner.email) && styles.scheduleButtonHalf
                        ]}
                        onPress={handleBookNowWhatsApp}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={['#25D366', '#1ebe57']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.scheduleButton}
                        >
                          <MessageCircle color="#FFFFFF" size={24} />
                          <Text style={styles.scheduleButtonText}>Schedule via WhatsApp</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}

                    {(partner.contactEmail || partner.email) && (
                      <TouchableOpacity
                        style={[
                          styles.scheduleButtonWrapper,
                          partner.phone && styles.scheduleButtonHalf,
                        ]}
                        onPress={handleBookNowEmail}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={['#8b5cf6', '#7c3aed']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.scheduleButton}
                        >
                          <Mail color="#FFFFFF" size={24} />
                          <Text style={styles.scheduleButtonText}>Schedule via Email</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </View>

        {/* Date Selection Calendar for Booking */}
        <BookingCalendar
          visible={showCalendar}
          selectedDate={preferredDate || new Date()}
          onConfirm={handleConfirmBooking}
          onCancel={handleCancelBooking}
          minimumDate={new Date()}
        />

        <View style={{ height: 100 }} />
      </ScrollView>
    </MainScreen >
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  heroSection: {
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 60,
    paddingHorizontal: 24,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  floatingParticle: {
    position: 'absolute',
  },
  trophyContainer: {
    marginVertical: 24,
    padding: 24,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 15,
  },
  heroTitle: {
    fontSize: 42,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    letterSpacing: 0.5,
  },
  celebrationMessage: {
    fontSize: 32,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 12,
    textAlign: 'center',
    color: '#fef3c7',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#d1fae5',
    textAlign: 'center',
    lineHeight: 24,
  },
  statsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  goalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  goalDesc: {
    fontSize: 15,
    color: '#6b7280',
    lineHeight: 22,
    marginBottom: 20,
  },
  statsBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  statsNumber: {
    fontSize: 36,
    fontWeight: '800',
    color: '#f59e0b',
  },
  statsLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400e',
  },
  experienceCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  experienceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    paddingBottom: 16,
  },
  experienceHeaderText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  experienceImage: {
    width: '100%',
    height: 220,
    backgroundColor: '#e5e7eb',
  },
  experienceContent: {
    padding: 20,
  },
  experienceTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  experienceSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 12,
  },
  experienceDescription: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  couponSection: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  couponHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  couponHeaderText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  couponInstructions: {
    fontSize: 15,
    color: '#6b7280',
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  loadingBox: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: '#6b7280',
  },
  couponCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 16,
  },
  couponDisplay: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  couponCode: {
    fontSize: 28,
    fontWeight: '800',
    color: '#8b5cf6',
    textAlign: 'center',
    letterSpacing: 6,
  },
  couponActions: {
    flexDirection: 'row',
    gap: 12,
  },
  copyCodeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f5f3ff',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  copyCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  copiedText: {
    color: '#10b981',
  },
  validityBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  validityText: {
    fontSize: 14,
    color: '#166534',
    fontWeight: '600',
  },
  // Enhanced Schedule Buttons
  scheduleButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  scheduleButtonWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  scheduleButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  scheduleButtonHalf: {
    flex: 1,
  },
  contactInfoSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  contactInfoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  contactInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  contactInfoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contactInfoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  smallCopyButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  // Enhanced sparkle and decoration styles
  sparkle: {
    position: 'absolute',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  statLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
  },
  statDivider: {
    width: 2,
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 1,
  },
});

export default CompletionScreen;
