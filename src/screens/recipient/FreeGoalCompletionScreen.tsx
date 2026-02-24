// screens/Recipient/FreeGoalCompletionScreen.tsx
// Completion screen for Free Goals - celebration + pledged experience + empowerment CTA
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Animated,
  Platform,
  Dimensions,
  Share,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Trophy, CheckCircle, Sparkles, Star, Zap, Heart, Clock, ExternalLink } from 'lucide-react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList, Goal } from '../../types';
import MainScreen from '../MainScreen';
import { logger } from '../../utils/logger';
import Colors from '../../config/colors';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'FreeGoalCompletion'>;

const FreeGoalCompletionScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute();

  const routeParams = route.params as { goal?: any } | undefined;
  const rawGoal = routeParams?.goal;

  const hasValidData = Boolean(
    rawGoal?.id &&
    rawGoal?.isFreeGoal &&
    rawGoal?.pledgedExperience
  );

  useEffect(() => {
    if (!hasValidData) {
      logger.warn('Missing/invalid goal data on FreeGoalCompletionScreen, redirecting');
      navigation.reset({
        index: 0,
        routes: [{ name: 'CategorySelection' }],
      });
    }
  }, [hasValidData, navigation]);

  const [celebrationMessage, setCelebrationMessage] = useState('Amazing!');

  // Animation refs
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const trophyPulse = useRef(new Animated.Value(1)).current;
  const sparkleAnim = useRef(new Animated.Value(0)).current;
  const floatAnim1 = useRef(new Animated.Value(0)).current;
  const floatAnim2 = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<any>(null);

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
      giftAttachDeadline: toDate(rawGoal.giftAttachDeadline),
    }
    : null;

  const pledgedExperience = goal?.pledgedExperience;

  // Calculate days remaining for gift attachment
  const getDaysRemaining = (): number | null => {
    if (!goal?.giftAttachDeadline) return null;
    const now = new Date();
    const deadline = goal.giftAttachDeadline;
    const diffMs = deadline.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  };

  useEffect(() => {
    const messages = [
      'Incredible!',
      'You crushed it!',
      'Legend!',
      'Unstoppable!',
      'Champion!',
      'Phenomenal!',
      'Absolutely Amazing!',
    ];
    setCelebrationMessage(messages[Math.floor(Math.random() * messages.length)]);

    setTimeout(() => {
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
  }, []);

  const handleShareAchievement = async () => {
    try {
      await Share.share({
        message: `I just completed my goal "${goal?.title}"! ${pledgedExperience ? `Working towards: ${pledgedExperience.title}` : ''} #Ernit #GoalAchieved`,
      });
    } catch (error) {
      logger.error('Error sharing achievement:', error);
    }
  };

  const handleGoToGoals = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Goals' }],
    });
  };

  if (!hasValidData || !goal || !pledgedExperience) {
    return (
      <MainScreen activeRoute="Goals">
        <StatusBar style="light" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#6b7280', fontSize: 16 }}>Redirecting...</Text>
        </View>
      </MainScreen>
    );
  }

  const experienceImage = pledgedExperience.coverImageUrl
    || (Array.isArray(pledgedExperience.imageUrl) && pledgedExperience.imageUrl[0])
    || null;

  const totalSessions = goal.sessionsPerWeek * goal.targetCount;
  const daysRemaining = getDaysRemaining();

  return (
    <MainScreen activeRoute="Goals">
      <StatusBar style="light" />

      <ConfettiCannon
        ref={confettiRef}
        count={150}
        origin={{ x: Dimensions.get('window').width / 2, y: -20 }}
        autoStart={false}
        fadeOut={true}
        fallSpeed={3000}
        colors={['#fbbf24', '#f59e0b', '#10b981', Colors.secondary, '#ec4899']}
      />

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <LinearGradient
          colors={['#10b981', '#0891b2', Colors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroSection}
        >
          <Animated.View
            style={[
              styles.floatingParticle,
              {
                opacity: floatAnim1.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 0.8],
                }),
                transform: [{
                  translateY: floatAnim1.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -100],
                  }),
                }],
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
                transform: [{
                  translateY: floatAnim2.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -120],
                  }),
                }],
                right: '15%',
                top: 80,
              },
            ]}
          >
            <Zap color="#f59e0b" size={24} fill="#f59e0b" />
          </Animated.View>

          <Animated.View
            style={[styles.sparkle, { opacity: sparkleAnim, top: 40, left: 30 }]}
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

          <Animated.View
            style={[
              styles.trophyContainer,
              {
                transform: [{ scale: Animated.multiply(scaleAnim, trophyPulse) }],
                opacity: fadeAnim,
              },
            ]}
          >
            <Trophy color="#fef3c7" size={100} strokeWidth={2.5} fill="#fbbf24" />
          </Animated.View>

          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.heroTitle}>Goal Completed!</Text>
            <Animated.Text style={styles.celebrationMessage}>
              {celebrationMessage}
            </Animated.Text>
            <Text style={styles.heroSubtitle}>
              You proved your dedication!
            </Text>

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

        {/* Achievement Card */}
        <View style={styles.achievementCard}>
          <View style={styles.achievementHeader}>
            <CheckCircle color="#10b981" size={24} />
            <Text style={styles.achievementTitle}>Your Achievement</Text>
          </View>
          <Text style={styles.goalTitle}>{goal.title}</Text>
          <Text style={styles.goalDesc}>{goal.description}</Text>
          <View style={styles.statsBadge}>
            <Sparkles color="#fbbf24" size={20} />
            <Text style={styles.statsNumber}>{totalSessions}</Text>
            <Text style={styles.statsLabel}>Sessions Completed</Text>
          </View>
        </View>

        {/* Pledged Experience Card */}
        <View style={styles.experienceCard}>
          <View style={styles.experienceHeader}>
            <Heart color="#ec4899" size={24} />
            <Text style={styles.experienceHeaderText}>Your Wishlist Item</Text>
          </View>

          {experienceImage && (
            <Image
              source={{ uri: experienceImage }}
              style={styles.experienceImage}
              resizeMode="cover"
            />
          )}
          <View style={styles.experienceContent}>
            <Text style={styles.experienceTitle}>{pledgedExperience.title}</Text>
            {pledgedExperience.subtitle && (
              <Text style={styles.experienceSubtitle}>{pledgedExperience.subtitle}</Text>
            )}
            <View style={styles.priceTag}>
              <Text style={styles.priceText}>{pledgedExperience.price.toFixed(2)} EUR</Text>
            </View>
          </View>
        </View>

        {/* Empowerment Info Card */}
        <View style={styles.empowerCard}>
          <LinearGradient
            colors={['#fdf2f8', '#fce7f3']}
            style={styles.empowerGradient}
          >
            <Heart color="#ec4899" size={32} fill="#ec4899" />
            <Text style={styles.empowerTitle}>Friends Can Empower You!</Text>
            <Text style={styles.empowerDescription}>
              Share your achievement with friends. They can gift you this experience to celebrate your dedication!
            </Text>

            {daysRemaining !== null && daysRemaining > 0 && (
              <View style={styles.deadlineRow}>
                <Clock color={Colors.primaryDark} size={18} />
                <Text style={styles.deadlineText}>
                  {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining for friends to empower you
                </Text>
              </View>
            )}

            {daysRemaining === 0 && (
              <View style={styles.deadlineRow}>
                <Clock color="#dc2626" size={18} />
                <Text style={[styles.deadlineText, { color: '#dc2626' }]}>
                  Empowerment window has expired
                </Text>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={handleShareAchievement}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[Colors.secondary, Colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.shareButtonGradient}
            >
              <ExternalLink color="#fff" size={22} />
              <Text style={styles.shareButtonText}>Share Achievement</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.goalsButton}
            onPress={handleGoToGoals}
            activeOpacity={0.8}
          >
            <Text style={styles.goalsButtonText}>Back to Goals</Text>
          </TouchableOpacity>
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
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 60,
    paddingHorizontal: 24,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  floatingParticle: {
    position: 'absolute',
  },
  sparkle: {
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
  // Achievement card
  achievementCard: {
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
  achievementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  achievementTitle: {
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
  // Pledged experience card
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
  priceTag: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  priceText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#16a34a',
  },
  // Empowerment card
  empowerCard: {
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
  empowerGradient: {
    padding: 24,
    alignItems: 'center',
  },
  empowerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primaryDark,
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  empowerDescription: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  deadlineText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  // Action buttons
  actionsContainer: {
    marginHorizontal: 20,
    marginTop: 24,
    gap: 12,
  },
  shareButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  shareButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  goalsButton: {
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  goalsButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default FreeGoalCompletionScreen;
