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
  TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useRoute } from '@react-navigation/native';
import { Copy, CheckCircle, Gift, ArrowRight } from 'lucide-react-native';
import { ExperienceGift } from '../../types';
import { useGiverNavigation, useRootNavigation } from '../../types/navigation';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { experienceService } from '../../services/ExperienceService';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { goalService } from '../../services/GoalService';
import { notificationService } from '../../services/NotificationService';
import { logger } from '../../utils/logger';
import { logErrorToFirestore } from '../../utils/errorLogger';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { ExperienceCardSkeleton, SkeletonBox } from '../../components/SkeletonLoader';
import Colors from '../../config/colors';
import { useToast } from '../../context/ToastContext';

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

  const [experience, setExperience] = useState<any>(null);
  const [personalizedMessage, setPersonalizedMessage] = useState(experienceGift?.personalizedMessage || '');
  const [charCount, setCharCount] = useState((experienceGift?.personalizedMessage || '').length);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(!!experienceGift?.personalizedMessage);
  const [isCopied, setIsCopied] = useState(false);

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

  // Early return if data is invalid
  if (!hasValidData || !experienceGift) {
    return (
      <MainScreen activeRoute="Home">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: Colors.textSecondary, fontSize: 16 }}>Redirecting...</Text>
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
      await experienceGiftService.updatePersonalizedMessage(experienceGift.id, personalizedMessage.trim());
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
    await Clipboard.setStringAsync(experienceGift.claimCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
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
    } catch (error: any) {
      showError(error.message || 'Failed to share the code');
    }
  };

  const handleBackToHome = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'CategorySelection' }],
    });
  };

  // Show loading state
  if (!experience) {
    return (
      <View style={{ padding: 20, gap: 12 }}>
        <ExperienceCardSkeleton />
        <SkeletonBox width="100%" height={48} borderRadius={12} />
      </View>
    );
  }

  const experienceImage = Array.isArray(experience.imageUrl)
    ? experience.imageUrl[0]
    : experience.imageUrl;

  return (
    <ErrorBoundary screenName="ConfirmationScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Home">
      <StatusBar style="dark" />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
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
            <CheckCircle color="#10b981" size={64} strokeWidth={2.5} />
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
            <Gift color="#fff" size={24} />
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
                style={styles.messageInput}
                placeholder="Your message here..."
                placeholderTextColor={Colors.textMuted}
                multiline
                value={personalizedMessage}
                onChangeText={handleMessageChange}
                textAlignVertical="top"
                maxLength={500}
                editable={!messageSent}
                accessibilityLabel="Personal message"
              />
              {!messageSent && (
                <TouchableOpacity
                  style={[styles.sendMessageButton, isSendingMessage && styles.sendMessageButtonDisabled]}
                  onPress={handleSendMessage}
                  disabled={isSendingMessage || !personalizedMessage.trim()}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Attach message"
                >
                  <Text style={styles.sendMessageButtonText}>
                    {isSendingMessage ? 'Sending...' : 'Attach Message'}
                  </Text>
                </TouchableOpacity>
              )}
              {messageSent && (
                <View style={styles.messageSentBadge}>
                  <CheckCircle color="#10b981" size={16} />
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
                <Copy color={isCopied ? "#10b981" : Colors.secondary} size={20} />
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
                <ArrowRight color="#fff" size={20} />
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
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed Bottom Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => {
            if (isEmpower) {
              rootNavigation.reset({ index: 0, routes: [{ name: 'Feed' }] });
            } else if (goalId) {
              rootNavigation.reset({ index: 0, routes: [{ name: 'Goals' }] });
            } else {
              handleBackToHome();
            }
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={isEmpower ? 'Back to feed' : goalId ? 'Go to my goals' : 'Back to home'}
        >
          <Text style={styles.homeButtonText}>
            {isEmpower ? 'Back to Feed' : goalId ? 'Go to My Goals' : 'Back to Home'}
          </Text>
        </TouchableOpacity>
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
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
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
  experienceImage: {
    width: '100%',
    height: 200,
    backgroundColor: Colors.border,
  },
  experienceOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  experienceContent: {
    padding: 20,
  },
  experienceTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  experienceSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  priceTag: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 20,
  },
  priceAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.secondary,
  },
  messageSection: {
    marginTop: 16,
  },
  messageSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  messageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  charCounter: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  messageSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  messageInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: Colors.textPrimary,
    minHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  sendMessageButton: {
    backgroundColor: Colors.secondary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendMessageButtonDisabled: {
    opacity: 0.6,
  },
  sendMessageButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  messageSentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  messageSentText: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
  },
  codeSection: {
    marginHorizontal: 20,
    marginTop: 24,
  },
  codeSectionHeader: {
    marginBottom: 16,
  },
  codeSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  codeSectionSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  codeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  codeDisplay: {
    backgroundColor: Colors.backgroundLight,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  codeText: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.secondary,
    textAlign: 'center',
    letterSpacing: 6,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 12,
  },
  copyCodeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primarySurface,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primaryTint,
  },
  copyCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.secondary,
  },
  copiedText: {
    color: '#10b981',
  },
  shareCodeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.secondary,
    paddingVertical: 14,
    borderRadius: 10,
  },
  shareCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  howItWorksSection: {
    marginHorizontal: 20,
    marginTop: 32,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  howItWorksTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 20,
  },
  stepsContainer: {
    gap: 4,
  },
  stepItem: {
    flexDirection: 'row',
    gap: 16,
  },
  stepIndicator: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.secondary,
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.primaryTint,
    marginVertical: 4,
  },
  stepContent: {
    flex: 1,
    paddingVertical: 8,
    paddingBottom: 20,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
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
    borderTopColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  homeButton: {
    backgroundColor: Colors.secondary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  homeButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
});

export default ConfirmationScreen;