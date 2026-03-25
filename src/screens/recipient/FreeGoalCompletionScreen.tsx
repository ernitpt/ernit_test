// screens/Recipient/FreeGoalCompletionScreen.tsx
// Completion screen for Free Goals - celebration + pledged experience + empowerment CTA
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { logger } from '../../utils/logger';
import * as Haptics from 'expo-haptics';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { vh } from '../../utils/responsive';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'FreeGoalCompletion'>;

const FreeGoalCompletionScreen = () => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavProp>();
  const route = useRoute();
  const { state } = useApp();

  const routeParams = route.params as { goal?: Goal } | undefined;
  const rawGoal = routeParams?.goal;

  const hasValidData = Boolean(
    rawGoal?.id &&
    rawGoal?.userId
  );

  useEffect(() => {
    if (!hasValidData) {
      logger.warn('Missing/invalid goal data on FreeGoalCompletionScreen, redirecting');
      navigation.reset({
        index: 0,
        routes: [{ name: 'Goals' }],
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
  const animTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const toDate = (value: unknown): Date | undefined => {
    if (!value) return undefined;
    if (typeof value === 'object' && value !== null && 'seconds' in value) {
      return new Date((value as { seconds: number }).seconds * 1000);
    }
    const date = new Date(value as string | number | Date);
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

    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

    const trophyLoop = Animated.loop(
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
    );
    trophyLoop.start();

    const sparkleLoop = Animated.loop(
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
    );
    sparkleLoop.start();

    const floatLoop1 = Animated.loop(
      Animated.timing(floatAnim1, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    );
    floatLoop1.start();

    const floatLoop2 = Animated.loop(
      Animated.timing(floatAnim2, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      })
    );
    floatLoop2.start();

    return () => {
      clearTimeout(animTimeoutRef.current);
      trophyLoop.stop();
      sparkleLoop.stop();
      floatLoop1.stop();
      floatLoop2.stop();
    };
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

  if (!hasValidData || !goal) {
    return (
      <ErrorBoundary screenName="FreeGoalCompletionScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Goals">
        <StatusBar style="light" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, ...Typography.subheading }}>Redirecting...</Text>
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  // Category-only goals (no pledgedExperience) get a simplified completion screen
  if (!pledgedExperience) {
    const totalSessionsSimple = goal.sessionsPerWeek * goal.targetCount;
    const categoryLabel = goal.preferredRewardCategory
      ? goal.preferredRewardCategory.charAt(0).toUpperCase() + goal.preferredRewardCategory.slice(1)
      : null;

    return (
      <ErrorBoundary screenName="FreeGoalCompletionScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Goals">
        <StatusBar style="light" />
        <ConfettiCannon
          ref={confettiRef}
          count={150}
          origin={{ x: Dimensions.get('window').width / 2, y: -20 }}
          autoStart={false}
          fadeOut={true}
          fallSpeed={3000}
          colors={[colors.celebrationGold, colors.warning, colors.secondary, colors.secondary, colors.categoryPink]}
        />
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={[colors.secondary, colors.cyan, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroSection}
          >
            <Animated.View
              style={[styles.trophyContainer, { transform: [{ scale: Animated.multiply(scaleAnim, trophyPulse) }], opacity: fadeAnim }]}
            >
              <Trophy color={colors.celebrationGoldLight} size={100} strokeWidth={2.5} fill={colors.celebrationGold} />
            </Animated.View>
            <Animated.View style={{ opacity: fadeAnim }}>
              <Text style={styles.heroTitle}>Goal Completed!</Text>
              <Animated.Text style={styles.celebrationMessage}>{celebrationMessage}</Animated.Text>
              <Text style={styles.heroSubtitle}>You proved your dedication!</Text>
              <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{totalSessionsSimple}</Text>
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

          <View style={styles.achievementCard}>
            <View style={styles.achievementHeader}>
              <CheckCircle color={colors.secondary} size={24} />
              <Text style={styles.achievementTitle}>Your Achievement</Text>
            </View>
            <Text style={styles.goalTitle}>{goal.title}</Text>
            <Text style={styles.goalDesc}>{goal.description}</Text>
            <View style={styles.statsBadge}>
              <Sparkles color={colors.celebrationGold} size={20} />
              <Text style={styles.statsNumber}>{totalSessionsSimple}</Text>
              <Text style={styles.statsLabel}>Sessions Completed</Text>
            </View>
          </View>

          {categoryLabel && (
            <View style={styles.empowerCard}>
              <LinearGradient colors={[colors.pinkLight, colors.pinkLighter]} style={styles.empowerGradient}>
                <Heart color={colors.pink} size={32} fill={colors.pink} />
                <Text style={styles.empowerTitle}>Friends Can Celebrate With You!</Text>
                <Text style={styles.empowerDescription}>
                  You love {categoryLabel} experiences. Share your achievement — friends can gift you one to celebrate your hard work!
                </Text>
              </LinearGradient>
            </View>
          )}

          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShareAchievement}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Share achievement"
            >
              <LinearGradient
                colors={[colors.secondary, colors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.shareButtonGradient}
              >
                <ExternalLink color={colors.white} size={22} />
                <Text style={styles.shareButtonText}>Share Achievement</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.goalsButton}
              onPress={handleGoToGoals}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Back to Goals"
            >
              <Text style={styles.goalsButtonText}>Back to Goals</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: vh(100) }} />
        </ScrollView>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  const experienceImage = pledgedExperience.coverImageUrl
    || (Array.isArray(pledgedExperience.imageUrl) && pledgedExperience.imageUrl[0])
    || null;

  const totalSessions = goal.sessionsPerWeek * goal.targetCount;
  const daysRemaining = getDaysRemaining();

  return (
    <ErrorBoundary screenName="FreeGoalCompletionScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Goals">
      <StatusBar style="light" />

      <ConfettiCannon
        ref={confettiRef}
        count={150}
        origin={{ x: Dimensions.get('window').width / 2, y: -20 }}
        autoStart={false}
        fadeOut={true}
        fallSpeed={3000}
        colors={[colors.celebrationGold, colors.warning, colors.secondary, colors.secondary, colors.categoryPink]}
      />

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <LinearGradient
          colors={[colors.secondary, colors.cyan, colors.secondary]}
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
            <Star color={colors.celebrationGold} size={20} fill={colors.celebrationGold} />
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
            <Zap color={colors.warning} size={24} fill={colors.warning} />
          </Animated.View>

          <Animated.View
            style={[styles.sparkle, { opacity: sparkleAnim, top: 40, left: 30 }]}
          >
            <Sparkles color={colors.celebrationGoldLight} size={32} />
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
            <Sparkles color={colors.celebrationGoldBorder} size={28} />
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
            <Trophy color={colors.celebrationGoldLight} size={100} strokeWidth={2.5} fill={colors.celebrationGold} />
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
            <CheckCircle color={colors.secondary} size={24} />
            <Text style={styles.achievementTitle}>Your Achievement</Text>
          </View>
          <Text style={styles.goalTitle}>{goal.title}</Text>
          <Text style={styles.goalDesc}>{goal.description}</Text>
          <View style={styles.statsBadge}>
            <Sparkles color={colors.celebrationGold} size={20} />
            <Text style={styles.statsNumber}>{totalSessions}</Text>
            <Text style={styles.statsLabel}>Sessions Completed</Text>
          </View>
        </View>

        {/* Pledged Experience Card */}
        <View style={styles.experienceCard}>
          <View style={styles.experienceHeader}>
            <Heart color={colors.pink} size={24} />
            <Text style={styles.experienceHeaderText}>Your Wishlist Item</Text>
          </View>

          {experienceImage && (
            <Image
              source={{ uri: experienceImage }}
              style={styles.experienceImage}
              resizeMode="cover"
              accessibilityLabel={`${pledgedExperience.title} image`}
            />
          )}
          <View style={styles.experienceContent}>
            <Text style={styles.experienceTitle}>{pledgedExperience.title}</Text>
            {pledgedExperience.subtitle && (
              <Text style={styles.experienceSubtitle}>{pledgedExperience.subtitle}</Text>
            )}
            <View style={styles.priceTag}>
              <Text style={styles.priceText}>€{pledgedExperience.price.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Empowerment Info Card */}
        <View style={styles.empowerCard}>
          <LinearGradient
            colors={[colors.pinkLight, colors.pinkLighter]}
            style={styles.empowerGradient}
          >
            <Heart color={colors.pink} size={32} fill={colors.pink} />
            <Text style={styles.empowerTitle}>Friends Can Empower You!</Text>
            <Text style={styles.empowerDescription}>
              Share your achievement with friends. They can gift you this experience to celebrate your dedication!
            </Text>

            {daysRemaining !== null && daysRemaining > 0 && (
              <View style={styles.deadlineRow}>
                <Clock color={colors.primaryDark} size={18} />
                <Text style={styles.deadlineText}>
                  {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining for friends to empower you
                </Text>
              </View>
            )}

            {daysRemaining === 0 && (
              <View style={styles.deadlineRow}>
                <Clock color={colors.error} size={18} />
                <Text style={[styles.deadlineText, { color: colors.error }]}>
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
            accessibilityRole="button"
            accessibilityLabel="Share achievement"
          >
            <LinearGradient
              colors={[colors.secondary, colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.shareButtonGradient}
            >
              <ExternalLink color={colors.white} size={22} />
              <Text style={styles.shareButtonText}>Share Achievement</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.goalsButton}
            onPress={handleGoToGoals}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Back to Goals"
          >
            <Text style={styles.goalsButtonText}>Back to Goals</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: vh(100) }} />
      </ScrollView>
    </MainScreen>
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  heroSection: {
    paddingTop: Platform.OS === 'ios' ? vh(56) : vh(40),
    paddingBottom: vh(56),
    paddingHorizontal: Spacing.xxl,
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
    marginVertical: Spacing.xxl,
    padding: Spacing.xxl,
    borderRadius: BorderRadius.circle,
    backgroundColor: colors.blackAlpha20,
    shadowColor: colors.warning,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 15,
  },
  heroTitle: {
    fontSize: Typography.heroSub.fontSize,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
    marginBottom: Spacing.md,
    textShadowColor: colors.overlayLight,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  celebrationMessage: {
    ...Typography.display,
    fontWeight: '800',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    textAlign: 'center',
    color: colors.warningLight,
    letterSpacing: 1.5,
    textShadowColor: colors.overlayLight,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroSubtitle: {
    ...Typography.subheading,
    color: colors.primaryTint,
    textAlign: 'center',
    lineHeight: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xxl,
    backgroundColor: colors.whiteAlpha15,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: colors.blackAlpha20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    ...Typography.display,
    fontWeight: '900',
    color: colors.white,
    textShadowColor: colors.blackAlpha20,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  statLabel: {
    ...Typography.caption,
    color: colors.whiteAlpha90,
    marginTop: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
  },
  statDivider: {
    width: 2,
    height: 50,
    backgroundColor: colors.whiteAlpha25,
    borderRadius: BorderRadius.xs,
  },
  // Achievement card
  achievementCard: {
    backgroundColor: colors.white,
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
  achievementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  achievementTitle: {
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
    backgroundColor: colors.warningLight,
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
  // Pledged experience card
  experienceCard: {
    backgroundColor: colors.white,
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
  priceTag: {
    backgroundColor: colors.successLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
  priceText: {
    ...Typography.heading3,
    fontWeight: '700',
    color: colors.successMedium,
  },
  // Empowerment card
  empowerCard: {
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
  empowerGradient: {
    padding: Spacing.xxl,
    alignItems: 'center',
  },
  empowerTitle: {
    ...Typography.large,
    fontWeight: '800',
    color: colors.primaryDark,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  empowerDescription: {
    ...Typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.whiteAlpha80,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  deadlineText: {
    ...Typography.small,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  // Action buttons
  actionsContainer: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    gap: Spacing.md,
  },
  shareButton: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  shareButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xxl,
  },
  shareButtonText: {
    color: colors.white,
    ...Typography.heading3,
    fontWeight: '700',
  },
  goalsButton: {
    backgroundColor: colors.backgroundLight,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  goalsButtonText: {
    color: colors.gray700,
    ...Typography.subheading,
    fontWeight: '600',
  },
});

export default FreeGoalCompletionScreen;
