import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Animated,
  Platform,
  Share,
} from 'react-native';
import { TextInput } from '../../components/TextInput';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useRoute } from '@react-navigation/native';
import { Copy, CheckCircle, Gift, ArrowRight } from 'lucide-react-native';
import { ExperienceGift, Experience } from '../../types';
import { useGiverNavigation, useRootNavigation } from '../../types/navigation';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { experienceService } from '../../services/ExperienceService';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { goalService } from '../../services/GoalService';
import { notificationService } from '../../services/NotificationService';
import { logger } from '../../utils/logger';
import { sanitizeText } from '../../utils/sanitization';
import { logErrorToFirestore } from '../../utils/errorLogger';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { EmptyState } from '../../components/EmptyState';
import ErrorRetry from '../../components/ErrorRetry';
import { ExperienceCardSkeleton, SkeletonBox } from '../../components/SkeletonLoader';
import Colors from '../../config/colors';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { useToast } from '../../context/ToastContext';
import * as Haptics from 'expo-haptics';
import Button from '../../components/Button';
import { vh } from '../../utils/responsive';

const ConfirmationScreen = () => {
  const navigation = useGiverNavigation();
  const rootNavigation = useRootNavigation();
  const route = useRoute();
  const { state, dispatch } = useApp();
  const { showSuccess, showError } = useToast();

  // Handle case where route params might be undefined on browser refresh
  const routeParams = route.params as { experienceGift?: ExperienceGift; goalId?: string } | undefined;
  const experienceGift = routeParams?.experienceGift;
  const goalId = routeParams?.goalId || state.empowerContext?.goalId;
  const empowerContext = state.empowerContext;
  const isEmpower = Boolean(empowerContext && empowerContext.userId !== state.user?.id);

  // Check if we have valid data
  const hasValidData = Boolean(
    experienceGift?.id &&
    experienceGift?.claimCode &&
    experienceGift?.experienceId
  );

  // Success animation
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Redirect if data is missing (e.g., after page refresh)
  useEffect(() => {
    if (!hasValidData) {
      logger.warn('Missing/invalid experienceGift on ConfirmationScreen, redirecting to Home');
      navigation.reset({
        index: 0,
        routes: [{ name: 'CategorySelection' }],
      });
    }
  }, [hasValidData, navigation]);

  useEffect(() => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const [experience, setExperience] = useState<Experience | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [personalizedMessage, setPersonalizedMessage] = useState(experienceGift?.personalizedMessage || '');
  const [charCount, setCharCount] = useState((experienceGift?.personalizedMessage || '').length);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(!!experienceGift?.personalizedMessage);
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!experienceGift?.experienceId) return;
    const fetchExperience = async () => {
      try {
        const exp = await experienceService.getExperienceById(experienceGift.experienceId);
        setExperience(exp);
      } catch (error) {
        logger.error("Error fetching experience:", error);
        await logErrorToFirestore(error, {
          screenName: 'ConfirmationScreen',
          feature: 'FetchExperience',
          userId: state.user?.id || 'unknown',
          additionalData: { experienceId: experienceGift.experienceId },
        });
        setLoadError(true);
        showError("Could not load experience details.");
      }
    };
    fetchExperience();
  }, [experienceGift?.experienceId]);

  // Auto-attach gift to goal (self-purchase) OR notify goal owner (empower)
  useEffect(() => {
    if (!goalId || !experienceGift?.id || !state.user?.id) return;

    if (isEmpower && empowerContext) {
      // Empower flow: friend bought a gift for someone else's goal
      // Can't attach directly (Firestore rules), so notify the goal owner
      const notifyOwner = async () => {
        try {
          const giverName = state.user?.displayName || state.user?.profile?.name || 'A friend';
          const isMystery = empowerContext.isMystery === true;

          await notificationService.createNotification(
            empowerContext.userId,
            'experience_empowered',
            isMystery
              ? `🎁 ${giverName} gifted you a mystery experience!`
              : `🎁 ${giverName} gifted you an experience!`,
            isMystery
              ? `Complete your challenge to reveal it! Tap to accept the gift.`
              : `Tap to add it to your goal`,
            {
              goalId,
              giftId: experienceGift.id,
              giverName,
              giverId: state.user!.id,
              isMystery,
            },
          );
          // Mark goal as having a pending gift to prevent duplicate purchases
          await goalService.markEmpowerPending(goalId);
          logger.log('Empower notification sent to goal owner', empowerContext.userId);
        } catch (error) {
          logger.error('Failed to send empower notification:', error);
          await logErrorToFirestore(error, {
            screenName: 'ConfirmationScreen',
            feature: 'SendEmpowerNotification',
            userId: state.user?.id || 'unknown',
            additionalData: { goalId, recipientId: empowerContext?.userId },
          });
        }
      };
      notifyOwner();
      // Clear empower context
      dispatch({ type: 'SET_EMPOWER_CONTEXT', payload: null });
    } else {
      // Self-purchase: auto-attach directly (buyer IS the goal owner)
      const attach = async () => {
        try {
          await goalService.attachGiftToGoal(goalId, experienceGift.id, state.user!.id);
          logger.log('Gift auto-attached to goal', goalId);
        } catch (error) {
          logger.error('Failed to auto-attach gift to goal:', error);
          await logErrorToFirestore(error, {
            screenName: 'ConfirmationScreen',
            feature: 'AutoAttachGift',
            userId: state.user?.id || 'unknown',
            additionalData: { goalId, giftId: experienceGift.id },
          });
        }
      };
      attach();
    }
  }, [goalId, experienceGift?.id]);

  // Cleanup copy timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Early return if data is invalid
  if (!hasValidData || !experienceGift) {
    return (
      <MainScreen activeRoute="Home">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: Colors.textSecondary, ...Typography.subheading }}>Redirecting...</Text>
        </View>
      </MainScreen>
    );
  }

  const handleMessageChange = (text: string) => {
    if (text.length <= 500) {
      setPersonalizedMessage(text);
      setCharCount(text.length);
    }
  };

  const handleSendMessage = async () => {
    if (!personalizedMessage.trim()) {
      showError('Please enter a message before sending.');
      return;
    }

    setIsSendingMessage(true);
    try {
      const sanitizedMessage = sanitizeText(personalizedMessage.trim(), 500);
      await experienceGiftService.updatePersonalizedMessage(experienceGift.id, sanitizedMessage);
      setMessageSent(true);
      showSuccess('Your personalized message has been saved!');
    } catch (error) {
      logger.error('Error updating personalized message:', error);
      await logErrorToFirestore(error, {
        screenName: 'ConfirmationScreen',
        feature: 'UpdatePersonalizedMessage',
        userId: state.user?.id || 'unknown',
        additionalData: { giftId: experienceGift.id },
      });
      showError('Failed to save message. Please try again.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleCopyCode = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Clipboard.setStringAsync(experienceGift.claimCode);
      setIsCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.warn('Clipboard access denied:', error);
      showError('Could not copy to clipboard');
    }
  };

  const handleShareCode = async () => {
    try {
      const shareOptions = {
        title: 'Gift Code',
        message: `
Hey! Got you an Ernit experience, a little boost for your goals.

Sign up and redeem your gift at https://ernit.app/recipient/redeem/${experienceGift.claimCode} to set up your goals. Once you complete your goals, you'll see what I got you 🎁

Earn it. Unlock it. Enjoy it 🚀
        `
      };

      const result = await Share.share(shareOptions);

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          logger.log('Shared via', result.activityType);
        }
      } else if (result.action === Share.dismissedAction) {
        logger.log('Share dismissed');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      showError(message || 'Failed to share the code');
    }
  };

  const handleBackToHome = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'CategorySelection' }],
    });
  };

  // Show error state if fetch failed
  if (loadError && !experience) {
    return (
      <ErrorBoundary screenName="ConfirmationScreen" userId={state.user?.id}>
        <MainScreen activeRoute="Home">
          <ErrorRetry
            message="Could not load gift details"
            onRetry={() => {
              setLoadError(false);
              if (experienceGift?.experienceId) {
                experienceService.getExperienceById(experienceGift.experienceId)
                  .then(setExperience)
                  .catch(async () => {
                    setLoadError(true);
                    showError('Could not load experience details.');
                  });
              }
            }}
          />
        </MainScreen>
      </ErrorBoundary>
    );
  }

  // Show loading state (skeleton)
  if (!experience) {
    return (
      <ErrorBoundary screenName="ConfirmationScreen" userId={state.user?.id}>
        <MainScreen activeRoute="Home">
          <View style={{ padding: Spacing.xl, gap: Spacing.md }}>
            <ExperienceCardSkeleton />
            <SkeletonBox width="100%" height={48} borderRadius={12} />
            <SkeletonBox width="80%" height={32} borderRadius={8} />
          </View>
        </MainScreen>
      </ErrorBoundary>
    );
  }

  const experienceImage = Array.isArray(experience.imageUrl)
    ? experience.imageUrl[0]
    : experience.imageUrl;

  return (
    <ErrorBoundary screenName="ConfirmationScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Home">
      <StatusBar style="dark" />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardDismissMode="on-drag">
        {/* Success Header with Animation */}
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
            <CheckCircle color={Colors.secondary} size={64} strokeWidth={2.5} />
          </Animated.View>

          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.heroTitle}>Payment Successful</Text>
            <Text style={styles.heroSubtitle}>
              {isEmpower
                ? `Your gift has been sent to ${empowerContext?.userName || 'them'}!`
                : goalId
                ? 'You just set yourself for success. Now complete your challenge to unlock it!'
                : 'Your thoughtful gift is ready to share 🎉'
              }
            </Text>
          </Animated.View>
        </View>

        {/* Experience Card */}
        <View style={styles.experienceCard}>
          <Image
            source={{ uri: experienceImage }}
            style={styles.experienceImage}
            resizeMode="cover"
            accessibilityLabel={`${experience.title} experience image`}
          />
          <View style={styles.experienceOverlay}>
            <Gift color={Colors.white} size={24} />
          </View>

          <View style={styles.experienceContent}>
            <Text style={styles.experienceTitle}>
              {experience.title}
            </Text>
            {experience.subtitle && (
              <Text style={styles.experienceSubtitle}>
                {experience.subtitle}
              </Text>
            )}

            <View style={styles.priceTag}>
              <Text style={styles.priceAmount}>
                €{experience.price.toFixed(2)}
              </Text>
            </View>

            {/* Personal Message Input/Display (gift to others only, not empower) */}
            {!goalId && !isEmpower && <View style={styles.messageSection}>
              <View style={styles.messageSectionHeader}>
                <Text style={styles.messageLabel}>Personal Message</Text>
                <Text style={styles.charCounter}>{charCount}/500</Text>
              </View>
              <Text style={styles.messageSubtitle}>
                Add a heartfelt message to make this gift extra special.
                It will show up when they redeem the gift.              </Text>
              <TextInput
                placeholder="Your message here..."
                placeholderTextColor={Colors.textMuted}
                multiline
                value={personalizedMessage}
                onChangeText={handleMessageChange}
                textAlignVertical="top"
                maxLength={500}
                editable={!messageSent}
                accessibilityLabel="Personal message"
                inputStyle={styles.messageInput}
              />
              {!messageSent && (
                <Button
                  variant="ghost"
                  title="Attach Message"
                  onPress={handleSendMessage}
                  disabled={isSendingMessage || !personalizedMessage.trim()}
                  loading={isSendingMessage}
                />
              )}
              {messageSent && (
                <View style={styles.messageSentBadge}>
                  <CheckCircle color={Colors.secondary} size={16} />
                  <Text style={styles.messageSentText}>Message sent!</Text>
                </View>
              )}
            </View>}
          </View>
        </View>

        {/* Claim Code Section (gift to others only, not empower) */}
        {!goalId && !isEmpower && <View style={styles.codeSection}>
          <View style={styles.codeSectionHeader}>
            <Text style={styles.codeSectionTitle}>Gift Code</Text>
            <Text style={styles.codeSectionSubtitle}>
              Share this code to unlock the experience
            </Text>
          </View>

          <View style={styles.codeCard}>
            <View style={styles.codeDisplay}>
              <Text style={styles.codeText}>{experienceGift.claimCode}</Text>
            </View>

            <View style={styles.codeActions}>
              <TouchableOpacity
                style={styles.copyCodeButton}
                onPress={handleCopyCode}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Copy gift code"
              >
                <Copy color={isCopied ? Colors.secondary : Colors.textSecondary} size={20} />
                <Text style={[styles.copyCodeText, isCopied && styles.copiedText]}>
                  {isCopied ? 'Copied!' : 'Copy Code'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.shareCodeButton}
                onPress={handleShareCode}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Share gift code"
              >
                <Text style={styles.shareCodeText}>Share</Text>
                <ArrowRight color={Colors.white} size={20} />
              </TouchableOpacity>
            </View>
          </View>
        </View>}

        {/* How It Works (gift to others only, not empower) */}
        {!goalId && !isEmpower && <View style={styles.howItWorksSection}>
          <Text style={styles.howItWorksTitle}>How It Works</Text>

          <View style={styles.stepsContainer}>
            {[
              {
                step: '1',
                title: 'Share the Code',
                desc: 'Send the gift code to your recipient',
              },
              {
                step: '2',
                title: 'Set Goals',
                desc: 'They create personal goals to earn the experience',
              },
              {
                step: '3',
                title: 'Track Progress',
                desc: 'AI hints guide them as they work toward their goals',
              },
              {
                step: '4',
                title: 'Unlock Reward',
                desc: 'Experience is revealed when goals are complete',
              },
            ].map((item, index) => (
              <View key={index} style={styles.stepItem}>
                <View style={styles.stepIndicator}>
                  <View style={styles.stepCircle}>
                    <Text style={styles.stepNumber}>{item.step}</Text>
                  </View>
                  {index < 3 && <View style={styles.stepLine} />}
                </View>

                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{item.title}</Text>
                  <Text style={styles.stepDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>}

        {/* Bottom Spacing */}
        <View style={{ height: vh(100) }} />
      </ScrollView>

      {/* Fixed Bottom Button */}
      <View style={styles.bottomBar}>
        <Button
          variant="primary"
          title={isEmpower ? 'Back to Feed' : goalId ? 'Go to My Goals' : 'Back to Home'}
          onPress={() => {
            if (isEmpower) {
              rootNavigation.reset({ index: 0, routes: [{ name: 'Feed' }] });
            } else if (goalId) {
              rootNavigation.reset({ index: 0, routes: [{ name: 'Goals' }] });
            } else {
              handleBackToHome();
            }
          }}
          fullWidth
        />
      </View>
    </MainScreen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  heroSection: {
    backgroundColor: Colors.white,
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
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  heroSubtitle: {
    ...Typography.subheading,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  experienceCard: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  experienceImage: {
    width: '100%',
    height: vh(200),
    backgroundColor: Colors.border,
  },
  experienceOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: BorderRadius.xxl,
    backgroundColor: Colors.primaryOverlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  experienceContent: {
    padding: Spacing.xl,
  },
  experienceTitle: {
    ...Typography.heading2,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  experienceSubtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  priceTag: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  priceAmount: {
    ...Typography.heading1,
    color: Colors.secondary,
  },
  messageSection: {
    marginTop: Spacing.lg,
  },
  messageSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  messageLabel: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  charCounter: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  messageSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  messageInput: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    ...Typography.body,
    color: Colors.textPrimary,
    minHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  messageSentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  messageSentText: {
    ...Typography.small,
    color: Colors.secondary,
    fontWeight: '600',
  },
  codeSection: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
  },
  codeSectionHeader: {
    marginBottom: Spacing.lg,
  },
  codeSectionTitle: {
    ...Typography.large,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  codeSectionSubtitle: {
    ...Typography.small,
    color: Colors.textSecondary,
  },
  codeCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  codeDisplay: {
    backgroundColor: Colors.backgroundLight,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  codeText: {
    ...Typography.display,
    fontWeight: '800',
    color: Colors.secondary,
    textAlign: 'center',
    letterSpacing: 6,
  },
  codeActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  copyCodeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primarySurface,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primaryTint,
  },
  copyCodeText: {
    ...Typography.subheading,
    color: Colors.secondary,
  },
  copiedText: {
    color: Colors.secondary,
  },
  shareCodeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.secondary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  shareCodeText: {
    ...Typography.subheading,
    color: Colors.white,
  },
  howItWorksSection: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxxl,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  howItWorksTitle: {
    ...Typography.large,
    color: Colors.textPrimary,
    marginBottom: Spacing.xl,
  },
  stepsContainer: {
    gap: Spacing.xs,
  },
  stepItem: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  stepIndicator: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumber: {
    ...Typography.subheading,
    fontWeight: '700',
    color: Colors.secondary,
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.primaryTint,
    marginVertical: Spacing.xs,
  },
  stepContent: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  stepTitle: {
    ...Typography.subheading,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  stepDesc: {
    ...Typography.small,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? Spacing.xxxl : Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default ConfirmationScreen;