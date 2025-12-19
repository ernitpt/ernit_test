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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Trophy, Gift, Copy, CheckCircle, Sparkles, Ticket, MessageCircle, Mail } from 'lucide-react-native';
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

  // Early return if data is missing or invalid
  if (!hasValidData) {
    return (
      <MainScreen activeRoute="Goals">
        <StatusBar style="light" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#6b7280', fontSize: 16 }}>Redirecting...</Text>
        </View>
      </MainScreen>
    );
  }

  const toDate = (value: any): Date | undefined => {
    if (!value) return undefined;
    if (value?.seconds) return new Date(value.seconds * 1000);
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  };

  const goal: Goal = {
    ...rawGoal,
    startDate: toDate(rawGoal.startDate)!,
    endDate: toDate(rawGoal.endDate)!,
    createdAt: toDate(rawGoal.createdAt)!,
    updatedAt: toDate(rawGoal.updatedAt),
    completedAt: toDate(rawGoal.completedAt),
  };

  const experienceGift: ExperienceGift = {
    ...rawGift,
    createdAt: toDate(rawGift.createdAt)!,
    deliveryDate: toDate(rawGift.deliveryDate)!,
    claimedAt: toDate(rawGift.claimedAt),
    completedAt: toDate(rawGift.completedAt),
  };


  const [experience, setExperience] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [userName, setUserName] = useState<string>('User');

  useEffect(() => {
    const fetchExperience = async () => {
      try {
        logger.log('🔍 Fetching experience with ID:', experienceGift.experienceId);
        const exp = await experienceService.getExperienceById(experienceGift.experienceId);
        logger.log('✅ Experience loaded:', exp);
        setExperience(exp);

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
  }, [experienceGift.experienceId, goal.userId]);

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

    // 🎉 BEAUTIFUL CELEBRATION SEQUENCE
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

    // 🎨 Subtle color cycle
    Animated.loop(
      Animated.sequence([
        Animated.timing(colorCycle, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: false,
        }),
        Animated.timing(colorCycle, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: false,
        }),
      ])
    ).start();

    // Only fetch/generate coupon after experience is loaded
    if (experience) {
      fetchExistingCoupon();
    }
  }, [experience]);

  // ✅ SECURITY FIX: Use Firestore transaction to prevent race conditions
  const fetchExistingCoupon = async () => {
    try {
      setIsLoading(true);
      await generateCouponWithTransaction();
    } catch (error) {
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
    const message = `Hi ${partner.name || 'there'}!\n\nI've completed my goal and earned ${experience.title}!\n\nI'd like to schedule my experience at your earliest convenience.\n\nLooking forward to it!\n${userName}`;

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

    const message = `Hi ${partner.name || 'there'}!\n\nI've completed my goal and earned ${experience.title}!\n\nI'd like to schedule my experience at your earliest convenience.\n\nGoal completed: ${goal.title}\nCoupon Code: ${couponCode}\n\nLooking forward to it!\n${userName}`;
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

  const experienceImage = experience
    ? Array.isArray(experience.imageUrl)
      ? experience.imageUrl[0]
      : experience.imageUrl
    : null;

  const totalSessions = goal.sessionsPerWeek * goal.targetCount;

  return (
    <MainScreen activeRoute="Goals">
      <StatusBar style="light" />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Hero Section - Clean Celebration */}
        <View style={styles.heroSection}>
          {/* ✨ Sparkle effects */}
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
            <Sparkles color="#fbbf24" size={24} />
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
            <Sparkles color="#f59e0b" size={20} />
          </Animated.View>

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
            <Trophy color="#fbbf24" size={80} strokeWidth={2.5} />
          </Animated.View>

          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.heroTitle}>Goal Completed!</Text>
            <Animated.Text
              style={[
                styles.celebrationMessage,
                {
                  color: colorCycle.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: ['#fbbf24', '#f59e0b', '#fbbf24'],
                  }),
                }
              ]}
            >
              {celebrationMessage}
            </Animated.Text>
            <Text style={styles.heroSubtitle}>
              You did it! Your reward is now unlocked 🎉
            </Text>

            {/* Completion Stats */}
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
        </View>

        {/* Stats Card */}
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

        {/* Coupon Section */}
        <View style={styles.couponSection}>
          <View style={styles.couponHeader}>
            <Ticket color="#8b5cf6" size={24} />
            <Text style={styles.couponHeaderText}>Redeem Your Experience</Text>
          </View>

          <Text style={styles.couponInstructions}>
            Show this code to the experience provider to claim your reward
          </Text>

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={styles.loadingText}>Loading your coupon...</Text>
            </View>
          ) : couponCode ? (
            <View>
              <View style={styles.couponCard}>
                <View style={styles.couponCodeBox}>
                  <Text style={styles.couponCode}>{couponCode}</Text>
                </View>

                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={handleCopy}
                  activeOpacity={0.7}
                >
                  <Copy color={isCopied ? "#10b981" : "#8b5cf6"} size={20} />
                  <Text style={[styles.copyText, isCopied && styles.copiedText]}>
                    {isCopied ? 'Copied!' : 'Copy Code'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.validityBox}>
                <Text style={styles.validityText}>
                  ✓ Valid for a year
                </Text>
              </View>

              {/* Partner Contact Info & Schedule Buttons */}
              {partner && (partner.phone || partner.contactEmail || partner.email) && (
                <View style={{ marginTop: 20 }}>
                  {/* Contact Info Display */}
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

                  {/* Schedule Buttons */}
                  <View style={styles.scheduleButtonsContainer}>
                    {partner.phone && (
                      <TouchableOpacity
                        style={[
                          styles.scheduleButton,
                          styles.whatsappButton,
                          (partner.contactEmail || partner.email) && styles.scheduleButtonHalf
                        ]}
                        onPress={handleWhatsAppSchedule}
                        activeOpacity={0.8}
                      >
                        <MessageCircle color="#FFFFFF" size={24} />
                        <Text style={styles.scheduleButtonText}>Book Now</Text>
                      </TouchableOpacity>
                    )}

                    {(partner.contactEmail || partner.email) && (
                      <TouchableOpacity
                        style={[
                          styles.scheduleButton,
                          partner.phone && styles.scheduleButtonHalf,
                        ]}
                        onPress={handleEmailSchedule}
                        activeOpacity={0.8}
                      >
                        <Mail color="#FFFFFF" size={24} />
                        <Text style={styles.scheduleButtonText}>Book Now</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </View>

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
    // background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', // React Native does not support CSS gradients directly
    backgroundColor: '#10b981', // Fallback
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 50,
    paddingHorizontal: 24,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  trophyContainer: {
    marginVertical: 20,
    padding: 20,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
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
    gap: 12,
    marginBottom: 12,
  },
  couponHeaderText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  couponInstructions: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 20,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  couponCard: {
    marginBottom: 16,
  },
  couponCodeBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    padding: 24,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  couponCode: {
    fontSize: 26,
    fontWeight: '800',
    color: '#8b5cf6',
    textAlign: 'center',
    letterSpacing: 4,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f5f3ff',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  copyText: {
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
    padding: 12,
    alignItems: 'center',
  },
  validityText: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '600',
  },
  scheduleButton: {
    marginTop: 16,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  whatsappButton: {
    backgroundColor: '#25D366', // Official WhatsApp green
    shadowColor: '#25D366',
  },
  scheduleButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
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
  scheduleButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  scheduleButtonHalf: {
    flex: 1,
  },
  // NEW: Celebration enhancement styles
  sparkle: {
    position: 'absolute',
  },
  confetti: {
    position: 'absolute',
    top: 0,
  },
  celebrationMessage: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
    color: '#fef3c7',
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});

export default CompletionScreen;