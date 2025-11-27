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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Trophy, Gift, Copy, CheckCircle, Sparkles, Ticket } from 'lucide-react-native';
import {
  RecipientStackParamList,
  Goal,
  ExperienceGift,
  PartnerCoupon,
} from '../../types';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { collection, doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { goalService } from '../../services/GoalService';
import { experienceService } from '../../services/ExperienceService';

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
  const [isLoading, setIsLoading] = useState(true);
  const [celebrationMessage, setCelebrationMessage] = useState('Amazing!');

  // Enhanced animation refs
  const confettiAnim = useRef(new Animated.Value(0)).current;
  const confetti2Anim = useRef(new Animated.Value(0)).current;
  const confetti3Anim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const trophyPulse = useRef(new Animated.Value(1)).current;
  const sparkleAnim = useRef(new Animated.Value(0)).current;
  const colorCycle = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    const fetchExperience = async () => {
      try {
        const exp = await experienceService.getExperienceById(experienceGift.experienceId);
        setExperience(exp);
      } catch (error) {
        console.error("Error fetching experience:", error);
        Alert.alert("Error", "Could not load experience details.");
      }
    };
    fetchExperience();
  }, [experienceGift.experienceId]);

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

    // EPIC Success animations with multiple bursts
    Animated.parallel([
      // Main scale in
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      // First confetti burst
      Animated.sequence([
        Animated.timing(confettiAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
      // Second burst (delayed)
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(confetti2Anim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
      // Third burst (more delayed)
      Animated.sequence([
        Animated.delay(800),
        Animated.timing(confetti3Anim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
      // Sparkle effect
      Animated.sequence([
        Animated.delay(300),
        Animated.loop(
          Animated.sequence([
            Animated.timing(sparkleAnim, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(sparkleAnim, {
              toValue: 0,
              duration: 600,
              useNativeDriver: true,
            }),
          ])
        ),
      ]),
      // Color cycling
      Animated.loop(
        Animated.sequence([
          Animated.timing(colorCycle, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: false,
          }),
          Animated.timing(colorCycle, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: false,
          }),
        ])
      ),
    ]).start();

    // Trophy pulsing animation (separate loop)
    Animated.loop(
      Animated.sequence([
        Animated.timing(trophyPulse, {
          toValue: 1.15,
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

    // Only fetch/generate coupon after experience is loaded
    if (experience) {
      fetchExistingCoupon();
    }
  }, [experience]);

  const fetchExistingCoupon = async () => {
    try {
      setIsLoading(true);
      const existingCode = await goalService.getCouponCode(goal.id);
      if (existingCode) {
        console.log('✅ Found existing coupon:', existingCode);
        setCouponCode(existingCode);
      } else {
        console.log('📝 No existing coupon found, generating new one...');
        // Auto-generate coupon if it doesn't exist
        await generateCoupon();
      }
    } catch (error) {
      console.error('Error fetching/generating coupon:', error);
      Alert.alert('Error', 'Could not load or generate your coupon. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateCoupon = async () => {
    try {
      // SECURITY: Check if coupon already exists to prevent duplicates
      const existingCode = await goalService.getCouponCode(goal.id);
      if (existingCode) {
        console.log('⚠️ Coupon already exists for this goal, using existing:', existingCode);
        setCouponCode(existingCode);
        return;
      }

      const partnerId = experienceGift?.partnerId || experience?.partnerId;

      if (!partnerId) {
        console.error('Missing partner ID for coupon generation');
        return;
      }

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
        goalId: goal.id, // SECURITY: Add goalId reference for authorization
      };

      const partnerCouponRef = doc(
        collection(db, `partnerUsers/${partnerId}/coupons`),
        newCouponCode
      );

      // SECURITY: Check if code already exists (collision detection)
      const existingDoc = await getDoc(partnerCouponRef);
      if (existingDoc.exists()) {
        console.error('⚠️ Coupon code collision detected, retrying...');
        // Retry with new code
        return await generateCoupon();
      }

      await setDoc(partnerCouponRef, {
        ...coupon,
        createdAt: serverTimestamp(),
      });

      // Save the coupon code reference to the goal
      await goalService.saveCouponCode(goal.id, newCouponCode);

      setCouponCode(newCouponCode);
      console.log('✅ Coupon auto-generated:', newCouponCode);
    } catch (error) {
      console.error('Error generating coupon:', error);
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
        {/* Hero Section with ENHANCED Animation */}
        <View style={styles.heroSection}>
          {/* Confetti particles */}
          <Animated.View
            style={[
              styles.confetti,
              {
                opacity: confettiAnim,
                transform: [{
                  translateY: confettiAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-50, 300],
                  }),
                }],
                left: '10%',
              },
            ]}
          >
            <Text style={{ fontSize: 24 }}>🎊</Text>
          </Animated.View>
          <Animated.View
            style={[
              styles.confetti,
              {
                opacity: confettiAnim,
                transform: [{
                  translateY: confettiAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-30, 350],
                  }),
                }],
                left: '25%',
              },
            ]}
          >
            <Text style={{ fontSize: 20 }}>🎉</Text>
          </Animated.View>
          <Animated.View
            style={[
              styles.confetti,
              {
                opacity: confetti2Anim,
                transform: [{
                  translateY: confetti2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-40, 320],
                  }),
                }],
                right: '30%',
              },
            ]}
          >
            <Text style={{ fontSize: 22 }}>✨</Text>
          </Animated.View>
          <Animated.View
            style={[
              styles.confetti,
              {
                opacity: confetti2Anim,
                transform: [{
                  translateY: confetti2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 380],
                  }),
                }],
                right: '15%',
              },
            ]}
          >
            <Text style={{ fontSize: 26 }}>🎈</Text>
          </Animated.View>
          <Animated.View
            style={[
              styles.confetti,
              {
                opacity: confetti3Anim,
                transform: [{
                  translateY: confetti3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-60, 340],
                  }),
                }],
                left: '50%',
              },
            ]}
          >
            <Text style={{ fontSize: 24 }}>🌟</Text>
          </Animated.View>
          <Animated.View
            style={[
              styles.confetti,
              {
                opacity: confetti3Anim,
                transform: [{
                  translateY: confetti3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-35, 360],
                  }),
                }],
                right: '40%',
              },
            ]}
          >
            <Text style={{ fontSize: 20 }}>💫</Text>
          </Animated.View>
          {/* Sparkle effects */}
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
                  ✓ Valid for a year from generation
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </MainScreen>
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
    fontSize: 32,
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
  generateButton: {
    backgroundColor: '#8b5cf6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 12,
  },
  generateButtonDisabled: {
    opacity: 0.6,
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