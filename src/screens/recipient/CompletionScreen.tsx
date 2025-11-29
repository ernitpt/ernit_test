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
import { Trophy, Gift, Copy, CheckCircle, Sparkles, Ticket, MessageCircle, Mail } from 'lucide-react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
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

  // Animation refs for trophy celebration
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const trophyPulse = useRef(new Animated.Value(1)).current;
  const colorCycle = useRef(new Animated.Value(0)).current;

  // Confetti cannon ref
  const confettiRef = useRef<any>(null);

  const { goal: rawGoal, experienceGift: rawGift } = route.params as {
    goal: any;
    experienceGift: any;
  };

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
        console.log('🔍 Fetching experience with ID:', experienceGift.experienceId);
        const exp = await experienceService.getExperienceById(experienceGift.experienceId);
        console.log('✅ Experience loaded:', exp);
        setExperience(exp);

        // Fetch partner contact info
        if (exp?.partnerId) {
          console.log('🔍 Fetching partner with ID:', exp.partnerId);
          const partnerData = await partnerService.getPartnerById(exp.partnerId);
          console.log('✅ Partner loaded:', partnerData);
          setPartner(partnerData);
        } else {
          console.warn('⚠️ No partnerId found in experience');
        }

        // Fetch user name
        if (goal.userId) {
          const name = await userService.getUserName(goal.userId);
          setUserName(name || 'User');
        }
      } catch (error) {
        console.error("❌ Error fetching data:", error);
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

    // Trophy scale up
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 40,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Trophy pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(trophyPulse, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(trophyPulse, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Color cycle for celebration text
    Animated.loop(
      Animated.timing(colorCycle, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: false,
      })
    ).start();

    // Trigger confetti after short delay
    const timer = setTimeout(() => {
      confettiRef.current?.start();
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
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
      console.error('Error fetching/generating coupon:', error);
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
    console.log('🎫 Starting coupon generation...');
    console.log('experienceGift.partnerId:', experienceGift?.partnerId);
    console.log('experience.partnerId:', experience?.partnerId);

    const partnerId = experience?.partnerId || experienceGift?.partnerId;

    if (!partnerId) {
      console.error('❌ Missing partner ID for coupon generation');
      console.error('experienceGift:', experienceGift);
      console.error('experience:', experience);
      throw new Error('Missing partner ID');
    }

    console.log('✅ Using partnerId:', partnerId);
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
          console.log('✅ Found existing coupon:', goalData.couponCode);
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
          console.error('⚠️ Coupon code collision detected');
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
        console.log('✅ Coupon atomically generated:', newCouponCode);
      });
    } catch (error: any) {
      // Retry on code collision
      if (error.message === 'CODE_COLLISION') {
        console.log('🔄 Retrying coupon generation due to collision...');
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

  const handleWhatsAppSchedule = () => {
    if (!partner || !experience) return;

    const message = `Hi ${partner.name || 'there'}!\n\nI've completed my goal and earned ${experience.title}!\n\nI'd like to schedule my experience at your earliest convenience.\n\nGoal completed: ${goal.title}\nCoupon Code: ${couponCode}\n\nLooking forward to it!\n${userName}`;

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
    const contactEmail = partner.contactEmail;
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
        {/* Hero Section - Celebration */}
        <View style={styles.heroSection}>
          {/* Confetti Cannon */}
          <ConfettiCannon
            ref={confettiRef}
            count={100}
            origin={{ x: Dimensions.get('window').width / 2, y: Dimensions.get('window').height }}
            autoStart={false}
            fadeOut={true}
            explosionSpeed={500}
            fallSpeed={2500}
            colors={['#fbbf24', '#ffffff', '#8b5cf6', '#10b981']}
          />

          {/* Trophy Container */}
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
                  ✓ Valid for a year from generation
                </Text>
              </View>

              {/* Partner Contact Information */}
              {partner && (partner.phone || partner.contactEmail) && (
                <View style={styles.contactInfoSection}>
                  <Text style={styles.sectionSubtitle}>Partner Contact</Text>

                  {partner.phone && (
                    <View style={styles.contactInfoRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.contactLabel}>Phone</Text>
                        <Text style={styles.contactValue}>{partner.phone}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={handleCopyPhone}
                        style={styles.smallCopyButton}
                      >
                        {isPhoneCopied ? (
                          <CheckCircle color="#10b981" size={18} />
                        ) : (
                          <Copy color="#6b7280" size={18} />
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {(partner.contactEmail || partner.email) && (
                    <View style={styles.contactInfoRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.contactLabel}>Email</Text>
                        <Text style={styles.contactValue}>{partner.contactEmail}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={handleCopyEmail}
                        style={styles.smallCopyButton}
                      >
                        {isEmailCopied ? (
                          <CheckCircle color="#10b981" size={18} />
                        ) : (
                          <Copy color="#6b7280" size={18} />
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Schedule Buttons */}
                  <View style={styles.scheduleButtonsContainer}>
                    {partner.phone && (
                      <TouchableOpacity
                        style={[styles.scheduleButton, partner.contactEmail ? styles.halfWidthButton : null]}
                        onPress={handleWhatsAppSchedule}
                        activeOpacity={0.8}
                      >
                        <MessageCircle color="#FFFFFF" size={20} />
                        <Text style={styles.scheduleButtonText}>Schedule your experience</Text>
                      </TouchableOpacity>
                    )}

                    {(partner.contactEmail) && (
                      <TouchableOpacity
                        style={[styles.scheduleButton, partner.phone ? styles.halfWidthButton : null]}
                        onPress={handleEmailSchedule}
                        activeOpacity={0.8}
                      >
                        <Mail color="#FFFFFF" size={20} />
                        <Text style={styles.scheduleButtonText}>Schedule your experience</Text>
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
    backgroundColor: '#10b981',
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  trophyContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
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
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
  },
  sectionDescription: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
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
  contactInfoSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  contactInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  contactLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contactValue: {
    fontSize: 15,
    color: '#1f2937',
    fontWeight: '500',
    marginTop: 2,
  },
  smallCopyButton: {
    padding: 8,
  },
  scheduleButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  scheduleButton: {
    flex: 1,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  halfWidthButton: {
    flex: 0.48,
  },
  scheduleButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
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
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
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