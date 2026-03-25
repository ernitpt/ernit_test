import React, { useEffect, useRef, useState, useMemo } from 'react';
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
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Copy, CheckCircle, Gift, ArrowRight } from 'lucide-react-native';
import { GiverStackParamList, ExperienceGift } from '../../types';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { GiftCardSkeleton } from '../../components/SkeletonLoader';
import Button from '../../components/Button';
import { experienceService } from '../../services/ExperienceService';
import { Experience } from '../../types';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { logger } from '../../utils/logger';
import { FOOTER_HEIGHT } from '../../components/FooterNavigation';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Spacing } from '../../config/spacing';
import { Typography } from '../../config/typography';
import { useToast } from '../../context/ToastContext';
import * as Haptics from 'expo-haptics';
import { vh } from '../../utils/responsive';

type ConfirmationMultipleNavigationProp = NativeStackNavigationProp<
  GiverStackParamList,
  'ConfirmationMultiple'
>;

interface GiftWithExperience {
  gift: ExperienceGift;
  experience: Experience | null;
}

const ConfirmationMultipleScreen = () => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<ConfirmationMultipleNavigationProp>();
  const route = useRoute();
  const { state, dispatch } = useApp();
  const { showSuccess, showError } = useToast();

  // Handle case where route params might be undefined on browser refresh
  const routeParams = route.params as { experienceGifts?: ExperienceGift[] } | undefined;
  const experienceGifts = routeParams?.experienceGifts;

  // Check if we have valid data
  const hasValidData = Boolean(
    experienceGifts &&
    Array.isArray(experienceGifts) &&
    experienceGifts.length > 0 &&
    experienceGifts[0]?.claimCode
  );

  // Success animation
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [giftsWithExperiences, setGiftsWithExperiences] = useState<GiftWithExperience[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Track personalized messages for each gift
  const [personalizedMessages, setPersonalizedMessages] = useState<Record<string, string>>({});
  const [messageSentStatus, setMessageSentStatus] = useState<Record<string, boolean>>({});
  const [sendingMessageId, setSendingMessageId] = useState<string | null>(null);

  // Redirect if data is missing (e.g., after page refresh)
  useEffect(() => {
    if (!hasValidData) {
      logger.warn('Missing/invalid experienceGifts on ConfirmationMultipleScreen, redirecting to Home');
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

  useEffect(() => {
    const fetchExperiences = async () => {
      try {
        if (!experienceGifts || !Array.isArray(experienceGifts)) return;
        const promises = experienceGifts.map(async (gift) => {
          const experience = await experienceService.getExperienceById(gift.experienceId);
          return { gift, experience };
        });
        const results = await Promise.all(promises);
        setGiftsWithExperiences(results);

        // Initialize messages from existing gifts
        const initialMessages: Record<string, string> = {};
        const initialSentStatus: Record<string, boolean> = {};
        results.forEach(({ gift }) => {
          if (gift.id) {
            initialMessages[gift.id] = gift.personalizedMessage || '';
            initialSentStatus[gift.id] = !!gift.personalizedMessage;
          }
        });
        setPersonalizedMessages(initialMessages);
        setMessageSentStatus(initialSentStatus);
      } catch (error) {
        logger.error("Error fetching experiences:", error);
        setLoadError(true);
        showError("Could not load experience details.");
      } finally {
        setLoading(false);
      }
    };
    fetchExperiences();
  }, [experienceGifts]);

  const handleMessageChange = (giftId: string, text: string) => {
    if (text.length <= 500) {
      setPersonalizedMessages((prev) => ({
        ...prev,
        [giftId]: text,
      }));
    }
  };

  const handleSendMessage = async (giftId: string) => {
    const message = personalizedMessages[giftId]?.trim() || '';
    if (!message) {
      showError('Please enter a message before sending.');
      return;
    }

    setSendingMessageId(giftId);
    try {
      await experienceGiftService.updatePersonalizedMessage(giftId, message);
      setMessageSentStatus((prev) => ({
        ...prev,
        [giftId]: true,
      }));
      showSuccess('Your personalized message has been saved!');
    } catch (error) {
      logger.error('Error updating personalized message:', error);
      showError('Failed to save message. Please try again.');
    } finally {
      setSendingMessageId(null);
    }
  };

  const handleCopyCode = async (code: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Clipboard.setStringAsync(code);
      showSuccess('Claim code copied to clipboard.');
    } catch (error) {
      logger.warn('Clipboard access denied:', error);
      showError('Could not copy to clipboard');
    }
  };

  const handleShareCode = async (code: string) => {
    try {
      const shareOptions = {
        title: 'Gift Code',
        message: `
Hey! Got you an Ernit experience, a little boost for your goals.

Sign up and redeem your gift at https://ernit.app/recipient/redeem/${code} to set up your goals. Once you complete your goals, you'll see what I got you 🎁

Earn it. Unlock it. Enjoy it 🚀
        `
      };

      await Share.share(shareOptions);
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

  if (loading) {
    return (
      <ErrorBoundary screenName="ConfirmationMultipleScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Home">
        <View style={{ padding: Spacing.xl, gap: Spacing.md }}>
          <GiftCardSkeleton />
          <GiftCardSkeleton />
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  if (loadError && giftsWithExperiences.length === 0) {
    return (
      <ErrorBoundary screenName="ConfirmationMultipleScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Home">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.lg }}>
          <Text style={{ ...Typography.heading3, color: colors.textPrimary, textAlign: 'center' }}>
            Could not load experience details
          </Text>
          <Text style={{ ...Typography.body, color: colors.textSecondary, textAlign: 'center' }}>
            Please check your connection and try again.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: colors.secondary, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxl, borderRadius: BorderRadius.md }}
            onPress={() => {
              setLoadError(false);
              setLoading(true);
              const fetchExperiences = async () => {
                try {
                  if (!experienceGifts || !Array.isArray(experienceGifts)) return;
                  const promises = experienceGifts.map(async (gift) => {
                    const experience = await experienceService.getExperienceById(gift.experienceId);
                    return { gift, experience };
                  });
                  const results = await Promise.all(promises);
                  setGiftsWithExperiences(results);
                  const initialMessages: Record<string, string> = {};
                  const initialSentStatus: Record<string, boolean> = {};
                  results.forEach(({ gift }) => {
                    if (gift.id) {
                      initialMessages[gift.id] = gift.personalizedMessage || '';
                      initialSentStatus[gift.id] = !!gift.personalizedMessage;
                    }
                  });
                  setPersonalizedMessages(initialMessages);
                  setMessageSentStatus(initialSentStatus);
                } catch (error) {
                  logger.error("Error fetching experiences:", error);
                  setLoadError(true);
                  showError("Could not load experience details.");
                } finally {
                  setLoading(false);
                }
              };
              fetchExperiences();
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Retry loading experiences"
          >
            <Text style={{ ...Typography.subheading, color: colors.white }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="ConfirmationMultipleScreen" userId={state.user?.id}>
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
            <CheckCircle color={colors.secondary} size={64} strokeWidth={2.5} />
          </Animated.View>

          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.heroTitle}>Payment Successful!</Text>
            <Text style={styles.heroSubtitle}>
              {experienceGifts.length} thoughtful gift(s) ready to share 🎉
            </Text>
          </Animated.View>
        </View>

        {/* Gifts List */}
        <View style={styles.giftsContainer}>
          {giftsWithExperiences.map((item, index) => {
            if (!item.experience) return null;

            const experienceImage = Array.isArray(item.experience.imageUrl)
              ? item.experience.imageUrl[0]
              : item.experience.imageUrl;

            return (
              <View key={item.gift.id || index} style={styles.giftCard}>
                <Image
                  source={{ uri: experienceImage }}
                  style={styles.giftImage}
                  resizeMode="cover"
                  accessibilityLabel={`${item.experience.title} experience image`}
                />
                <View style={styles.giftOverlay}>
                  <Gift color={colors.white} size={20} />
                </View>

                <View style={styles.giftContent}>
                  <Text style={styles.giftTitle}>{item.experience.title}</Text>
                  {item.experience.subtitle && (
                    <Text style={styles.giftSubtitle}>{item.experience.subtitle}</Text>
                  )}

                  <View style={styles.priceTag}>
                    <Text style={styles.priceAmount}>
                      €{item.experience.price.toFixed(2)}
                    </Text>
                  </View>

                  {/* Personal Message Input/Display */}
                  <View style={styles.messageSection}>
                    <View style={styles.messageSectionHeader}>
                      <Text style={styles.messageLabel}>Personal Message</Text>
                      <Text style={styles.charCounter}>
                        {(personalizedMessages[item.gift.id || ''] || '').length}/500
                      </Text>
                    </View>
                    <Text style={styles.messageSubtitle}>
                      Add a heartfelt message to make this gift extra special.
                      It will show up when they redeem the gift.
                    </Text>
                    <TextInput
                      style={styles.messageInput}
                      placeholder="Your message here..."
                      placeholderTextColor={colors.textMuted}
                      multiline
                      value={personalizedMessages[item.gift.id || ''] || ''}
                      onChangeText={(text) => handleMessageChange(item.gift.id || '', text)}
                      textAlignVertical="top"
                      maxLength={500}
                      editable={!messageSentStatus[item.gift.id || '']}
                      accessibilityLabel={`Personal message for ${item.experience.title}`}
                    />
                    {!messageSentStatus[item.gift.id || ''] && (
                      <Button
                        variant="primary"
                        size="sm"
                        title="Attach Message"
                        onPress={() => handleSendMessage(item.gift.id || '')}
                        disabled={sendingMessageId === item.gift.id || !personalizedMessages[item.gift.id || '']?.trim()}
                        loading={sendingMessageId === item.gift.id}
                        style={styles.sendMessageButton}
                        textStyle={styles.sendMessageButtonText}
                        fullWidth
                      />
                    )}
                    {messageSentStatus[item.gift.id || ''] && (
                      <View style={styles.messageSentBadge}>
                        <CheckCircle color={colors.secondary} size={16} />
                        <Text style={styles.messageSentText}>Message sent!</Text>
                      </View>
                    )}
                  </View>

                  {/* Claim Code */}
                  <View style={styles.codeSection}>
                    <Text style={styles.codeLabel}>Gift Code</Text>
                    <View style={styles.codeDisplay}>
                      <Text style={styles.codeText}>{item.gift.claimCode}</Text>
                    </View>

                    <View style={styles.codeActions}>
                      <TouchableOpacity
                        style={styles.copyCodeButton}
                        onPress={() => handleCopyCode(item.gift.claimCode)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Copy gift code for ${item.experience?.title}`}
                      >
                        <Copy color={colors.secondary} size={18} />
                        <Text style={styles.copyCodeText}>Copy</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.shareCodeButton}
                        onPress={() => handleShareCode(item.gift.claimCode)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Share gift code for ${item.experience?.title}`}
                      >
                        <Text style={styles.shareCodeText}>Share</Text>
                        <ArrowRight color={colors.white} size={18} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* How It Works */}
        <View style={styles.howItWorksSection}>
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
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: vh(100) }} />
      </ScrollView>

      {/* Fixed Bottom Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={handleBackToHome}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <Text style={styles.homeButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </MainScreen>
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  loadingText: {
    ...Typography.subheading,
    color: colors.textSecondary,
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
  giftsContainer: {
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    gap: Spacing.xl,
  },
  giftCard: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  giftImage: {
    width: '100%',
    height: vh(180),
    backgroundColor: colors.border,
  },
  giftOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xl,
    backgroundColor: colors.primaryOverlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  giftContent: {
    padding: Spacing.xl,
  },
  giftTitle: {
    ...Typography.large,
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  giftSubtitle: {
    ...Typography.small,
    color: colors.textSecondary,
    marginBottom: Spacing.md,
  },
  priceTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  priceAmount: {
    ...Typography.large,
    color: colors.secondary,
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
    ...Typography.tiny,
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  charCounter: {
    ...Typography.tiny,
    color: colors.textMuted,
    fontWeight: '500',
  },
  messageSubtitle: {
    ...Typography.caption,
    color: colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  messageInput: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    ...Typography.small,
    color: colors.textPrimary,
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: Spacing.sm,
  },
  sendMessageButton: {
    backgroundColor: colors.secondary,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendMessageButtonDisabled: {
    opacity: 0.6,
  },
  sendMessageButtonText: {
    color: colors.white,
    ...Typography.small,
    fontWeight: '600',
  },
  messageSentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  messageSentText: {
    ...Typography.caption,
    color: colors.secondary,
    fontWeight: '600',
  },
  codeSection: {
    marginTop: Spacing.sm,
  },
  codeLabel: {
    ...Typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  codeDisplay: {
    backgroundColor: colors.backgroundLight,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  codeText: {
    ...Typography.display,
    fontWeight: '800',
    color: colors.secondary,
    textAlign: 'center',
    letterSpacing: 4,
  },
  codeActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  copyCodeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: colors.primarySurface,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primaryTint,
  },
  copyCodeText: {
    ...Typography.small,
    fontWeight: '600',
    color: colors.secondary,
  },
  shareCodeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: colors.secondary,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  shareCodeText: {
    ...Typography.small,
    fontWeight: '600',
    color: colors.white,
  },
  howItWorksSection: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxxl,
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  howItWorksTitle: {
    ...Typography.large,
    color: colors.textPrimary,
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
    backgroundColor: colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumber: {
    ...Typography.subheading,
    fontWeight: '700',
    color: colors.secondary,
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.primaryTint,
    marginVertical: Spacing.xs,
  },
  stepContent: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  stepTitle: {
    ...Typography.subheading,
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  stepDesc: {
    ...Typography.small,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: FOOTER_HEIGHT,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? Spacing.xxxl : Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  homeButton: {
    backgroundColor: colors.secondary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  homeButtonText: {
    ...Typography.heading3,
    fontWeight: '700',
    color: colors.white,
  },
});

export default ConfirmationMultipleScreen;
