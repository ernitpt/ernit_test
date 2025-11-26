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
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
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

  // Animation refs
  const confettiAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

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
    // Success animations
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(confettiAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start();

    fetchExistingCoupon();
  }, []);

  const fetchExistingCoupon = async () => {
    try {
      setIsLoading(true);
      const existingCode = await goalService.getCouponCode(goal.id);
      if (existingCode) {
        setCouponCode(existingCode);
      } else {
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
      };

      const partnerCouponRef = doc(
        collection(db, `partnerUsers/${partnerId}/coupons`),
        newCouponCode
      );

      await setDoc(partnerCouponRef, {
        ...coupon,
        createdAt: serverTimestamp(),
      });

      await goalService.saveCouponCode(goal.id, newCouponCode);

      setCouponCode(newCouponCode);
      console.log('✅ Coupon auto-generated:', newCouponCode);
    } catch (error) {
      console.error('Error generating coupon:', error);
      throw error;
    }
  };

  const generateUniqueCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 8 }, () =>
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
        {/* Hero Section with Animation */}
        <View style={styles.heroSection}>
          <Animated.View
            style={[
              styles.trophyContainer,
              {
                transform: [{ scale: scaleAnim }],
                opacity: fadeAnim,
              },
            ]}
          >
            <Trophy color="#fbbf24" size={64} strokeWidth={2} />
          </Animated.View>

          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.heroTitle}>Goal Completed!</Text>
            <Text style={styles.heroSubtitle}>
              You did it! Your reward is now unlocked 🎉
            </Text>
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

      {/* Fixed Bottom Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => navigation.reset({
            index: 0,
            routes: [{ name: 'Goals' }],
          })}
          activeOpacity={0.8}
        >
          <Text style={styles.doneButtonText}>Back to Goals</Text>
        </TouchableOpacity>
      </View>
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
  generateButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  doneButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
});

export default CompletionScreen;