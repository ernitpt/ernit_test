import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/helpers';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Platform,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { TextInput } from '../../components/TextInput';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { useRoute } from '@react-navigation/native';
import { Copy, CheckCircle, Gift, ArrowRight } from 'lucide-react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ExperienceGift, Experience } from '../../types';
import { useGiverNavigation, useRootNavigation } from '../../types/navigation';
import { useApp } from '../../context/AppContext';
import { experienceService } from '../../services/ExperienceService';
import { experienceGiftService } from '../../services/ExperienceGiftService';
import { goalService } from '../../services/GoalService';
import { notificationService } from '../../services/NotificationService';
import { logger } from '../../utils/logger';
import { sanitizeText } from '../../utils/sanitization';
import { logErrorToFirestore } from '../../utils/errorLogger';
import { FOOTER_HEIGHT } from '../../components/CustomTabBar';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { EmptyState } from '../../components/EmptyState';
import ErrorRetry from '../../components/ErrorRetry';
import { ExperienceCardSkeleton, SkeletonBox } from '../../components/SkeletonLoader';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Typography } from '../../config/typography';
import { Spacing } from '../../config/spacing';
import { useToast } from '../../context/ToastContext';
import * as Haptics from 'expo-haptics';
import Button from '../../components/Button';
import { vh } from '../../utils/responsive';
import { getUserMessage } from '../../utils/AppError';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ConfirmationScreen = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useGiverNavigation();
  const rootNavigation = useRootNavigation();
  const route = useRoute();
  const { state, dispatch } = useApp();
  const { showSuccess, showError } = useToast();

  // Handle case where route params might be undefined on browser refresh
  const routeParams = route.params as {
    experienceGift?: ExperienceGift;
    goalId?: string;
    challengeType?: string;
    isCategory?: boolean;
    preferredRewardCategory?: string;
  } | undefined;
  const [experienceGiftState, setExperienceGiftState] = useState<ExperienceGift | undefined>(routeParams?.experienceGift);
  const experienceGift = experienceGiftState;
  const goalId = routeParams?.goalId || state.empowerContext?.goalId;
  const empowerContext = state.empowerContext;
  const isEmpower = Boolean(empowerContext && empowerContext.userId !== state.user?.id);
  // Extract primitives to avoid object-identity re-renders in useEffect deps
  const empowerGoalId = empowerContext?.goalId;
  const empowerUserId = empowerContext?.userId;
  const empowerUserName = empowerContext?.userName;
  const empowerIsMystery = empowerContext?.isMystery;
  const isTogether = routeParams?.challengeType === 'shared';
  const isCategory = routeParams?.isCategory === true;

  // Check if we have valid data
  const hasValidData = Boolean(
    experienceGift?.id &&
    experienceGift?.claimCode &&
    (experienceGift?.experienceId || isCategory)
  );

  // Success animation
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<InstanceType<typeof ConfettiCannon>>(null);

  // Redirect if data is missing (e.g., after page refresh or SCA redirect)
  useEffect(() => {
    if (!hasValidData) {
      let mounted = true;
      // Try to recover from SCA redirect — gift ID may be saved in AsyncStorage
      const tryRecoverSCA = async () => {
        try {
          const pendingGiftId = await AsyncStorage.getItem('pending_sca_gift');
          if (!mounted) return;
          if (pendingGiftId) {
            const giftDoc = await getDoc(doc(db, 'experienceGifts', pendingGiftId));
            if (!mounted) return;
            if (giftDoc.exists()) {
              // Gift exists — clear key and recover
              await AsyncStorage.removeItem('pending_sca_gift');
              if (!mounted) return;
              const recoveredGift = { id: giftDoc.id, ...giftDoc.data() } as ExperienceGift;
              setExperienceGiftState(recoveredGift);
              return; // Don't redirect — we recovered the gift
            }
            // Gift doesn't exist — clear key and fall through to redirect
            await AsyncStorage.removeItem('pending_sca_gift');
          }
        } catch (error: unknown) {
          if (!mounted) return;
          logger.warn('SCA recovery failed:', error);
        }
        if (!mounted) return;
        // No recovery possible — redirect
        logger.warn('Missing/invalid experienceGift on ConfirmationScreen, redirecting to Home');
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'HomeTab', params: { screen: 'CategorySelection' } } }] });
      };
      tryRecoverSCA();
      return () => { mounted = false; };
    }
  }, [hasValidData, navigation]);

  useEffect(() => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const confettiTimer = setTimeout(() => confettiRef.current?.start(), 300);
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
    return () => clearTimeout(confettiTimer);
  }, []);

  const [experience, setExperience] = useState<Experience | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [personalizedMessage, setPersonalizedMessage] = useState(experienceGift?.personalizedMessage || '');
  const [charCount, setCharCount] = useState((experienceGift?.personalizedMessage || '').length);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(!!experienceGift?.personalizedMessage);
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    if (!experienceGift?.experienceId) return;
    if (isCategory) {
      // No experience to fetch for category-only Together
      return;
    }
    let mounted = true;
    const fetchExperience = async () => {
      try {
        const exp = await experienceService.getExperienceById(experienceGift.experienceId);
        if (!mounted) return;
        setExperience(exp);
      } catch (error: unknown) {
        if (!mounted) return;
        logger.error("Error fetching experience:", error);
        await logErrorToFirestore(error, {
          screenName: 'ConfirmationScreen',
          feature: 'FetchExperience',
          userId: state.user?.id || 'unknown',
          additionalData: { experienceId: experienceGift.experienceId },
        });
        if (!mounted) return;
        setLoadError(true);
        showError(t('giver.confirmation.toast.loadFailed'));
      }
    };
    fetchExperience();
    return () => { mounted = false; };
  }, [experienceGift?.experienceId]);

  // Auto-attach gift to goal (self-purchase) OR notify goal owner (empower)
  // Use primitive values extracted from empowerContext to avoid object-identity churn in deps
  useEffect(() => {
    if (!goalId || !experienceGift?.id || !state.user?.id) return;

    if (isEmpower && empowerUserId) {
      // Empower flow: friend bought a gift for someone else's goal
      // Can't attach directly (Firestore rules), so notify the goal owner
      const notifyOwner = async () => {
        try {
          const giverName = state.user?.displayName || state.user?.profile?.name || 'A friend';
          const isMystery = empowerIsMystery === true;

          await notificationService.createNotification(
            empowerUserId,
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
              giverId: state.user?.id ?? "",
              isMystery,
            },
          );
          // Mark goal as having a pending gift to prevent duplicate purchases
          await goalService.markEmpowerPending(goalId);
          logger.log('Empower notification sent to goal owner', empowerUserId);
        } catch (error: unknown) {
          logger.error('Failed to send empower notification:', error);
          await logErrorToFirestore(error, {
            screenName: 'ConfirmationScreen',
            feature: 'SendEmpowerNotification',
            userId: state.user?.id || 'unknown',
            additionalData: { goalId, recipientId: empowerUserId },
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
          await goalService.attachGiftToGoal(goalId, experienceGift.id, state.user?.id ?? "", false, state.user?.id);
          logger.log('Gift auto-attached to goal', goalId);
        } catch (error: unknown) {
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
  // Use primitive values (not empowerContext object) to prevent re-firing on every render
  }, [goalId, experienceGift?.id, state.user?.id, isEmpower, empowerUserId, empowerIsMystery, dispatch]);

  // Cleanup copy timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Early return if data is invalid
  if (!hasValidData || !experienceGift) {
    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, ...Typography.subheading }}>{t('giver.confirmation.redirecting')}</Text>
        </View>
    );
  }

  const handleMessageChange = useCallback((text: string) => {
    if (text.length <= 500) {
      setPersonalizedMessage(text);
      setCharCount(text.length);
    }
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!personalizedMessage.trim()) {
      showError(t('giver.confirmation.personalMessage.error'));
      return;
    }

    setIsSendingMessage(true);
    try {
      const sanitizedMessage = sanitizeText(personalizedMessage.trim(), 500);
      await experienceGiftService.updatePersonalizedMessage(experienceGift.id, sanitizedMessage);
      setMessageSent(true);
      showSuccess(t('giver.confirmation.personalMessage.saved'));
    } catch (error: unknown) {
      logger.error('Error updating personalized message:', error);
      await logErrorToFirestore(error, {
        screenName: 'ConfirmationScreen',
        feature: 'UpdatePersonalizedMessage',
        userId: state.user?.id || 'unknown',
        additionalData: { giftId: experienceGift.id },
      });
      showError(t('giver.confirmation.personalMessage.saveFailed'));
    } finally {
      setIsSendingMessage(false);
    }
  }, [personalizedMessage, experienceGift.id, state.user?.id]);

  const handleCopyCode = useCallback(async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Clipboard.setStringAsync(experienceGift.claimCode);
      setIsCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
    } catch (error: unknown) {
      logger.warn('Clipboard access denied:', error);
      showError(t('giver.confirmation.toast.copyFailed'));
    }
  }, [experienceGift.claimCode]);

  const handleShareCode = useCallback(async () => {
    try {
      const shareMessage = isTogether
        ? t('giver.confirmation.share.together', { code: experienceGift.claimCode })
        : t('giver.confirmation.share.solo', { code: experienceGift.claimCode });

      const shareOptions = {
        title: isTogether ? t('giver.confirmation.share.togetherTitle') : t('giver.confirmation.share.title'),
        message: shareMessage,
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
      showError(getUserMessage(error, t('giver.confirmation.toast.shareFailed')));
    }
  }, [isTogether, experienceGift.claimCode]);

  const handleBackToHome = useCallback(() => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs', params: { screen: 'HomeTab', params: { screen: 'CategorySelection' } } }],
    });
  }, [navigation]);

  // Show error state if fetch failed
  if (loadError && !experience) {
    return (
      <ErrorBoundary screenName="ConfirmationScreen" userId={state.user?.id}>
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
      </ErrorBoundary>
    );
  }

  // Show loading state (skeleton) - skip for category-only
  if (!experience && !isCategory) {
    return (
      <ErrorBoundary screenName="ConfirmationScreen" userId={state.user?.id}>
          <View style={{ padding: Spacing.xl, gap: Spacing.md }}>
            <ExperienceCardSkeleton />
            <SkeletonBox width="100%" height={48} borderRadius={12} />
            <SkeletonBox width="80%" height={32} borderRadius={8} />
          </View>
      </ErrorBoundary>
    );
  }

  const experienceImage = experience
    ? (Array.isArray(experience.imageUrl) ? experience.imageUrl[0] : experience.imageUrl)
    : undefined;

  return (
    <ErrorBoundary screenName="ConfirmationScreen" userId={state.user?.id}>
      <StatusBar style="auto" />
      <ConfettiCannon
        ref={confettiRef}
        count={Platform.OS === 'android' ? 120 : 200}
        origin={{ x: Dimensions.get('window').width / 2, y: -20 }}
        autoStart={false}
        fadeOut
        fallSpeed={2500}
        explosionSpeed={400}
        colors={[colors.secondary, colors.primary, colors.celebrationGold, colors.warning, colors.categoryPink]}
      />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
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
            <Text style={styles.heroTitle}>
              {isTogether ? t('giver.confirmation.hero.togetherTitle') : t('giver.confirmation.hero.paymentTitle')}
            </Text>
            <Text style={styles.heroSubtitle}>
              {isTogether
                ? t('giver.confirmation.hero.togetherSubtitle')
                : isEmpower
                ? t('giver.confirmation.hero.empowerSubtitle', { name: empowerContext?.userName || 'them' })
                : goalId
                ? t('giver.confirmation.hero.selfGoalSubtitle')
                : t('giver.confirmation.hero.giftSubtitle')
              }
            </Text>

            {/* Category info — inline in hero for together mode */}
            {isCategory && (
              <View style={styles.heroCategoryBadge}>
                <Text style={styles.heroCategoryText}>
                  {routeParams?.preferredRewardCategory
                    ? `${routeParams.preferredRewardCategory.charAt(0).toUpperCase() + routeParams.preferredRewardCategory.slice(1)} Experience`
                    : t('giver.confirmation.hero.surpriseExperience')}
                </Text>
                <Text style={styles.heroCategorySubtext}>
                  {t('giver.confirmation.hero.weWillFind')}
                </Text>
              </View>
            )}
          </Animated.View>
        </View>

        {/* Experience Card (non-category only) */}
        {!isCategory && experience ? (
          <View style={styles.experienceCard}>
            <Image
              source={{ uri: experienceImage }}
              style={styles.experienceImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              accessibilityLabel={t('giver.confirmation.accessibility.image', { title: experience.title })}
            />
            <View style={styles.experienceOverlay}>
              <Gift color={colors.white} size={24} />
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
                  {formatCurrency(experience.price)}
                </Text>
              </View>

              {/* Personal Message Input/Display (gift to others only, not empower, not together) */}
              {!goalId && !isEmpower && !isTogether && <View style={styles.messageSection}>
                <View style={styles.messageSectionHeader}>
                  <Text style={styles.messageLabel}>{t('giver.confirmation.personalMessage.label')}</Text>
                  <Text style={styles.charCounter}>{charCount}/500</Text>
                </View>
                <Text style={styles.messageSubtitle}>
                  {t('giver.confirmation.personalMessage.subtitle')}
                </Text>
                <TextInput
                  placeholder={t('giver.confirmation.personalMessage.placeholder')}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  value={personalizedMessage}
                  onChangeText={handleMessageChange}
                  textAlignVertical="top"
                  maxLength={500}
                  editable={!messageSent}
                  accessibilityLabel={t('giver.confirmation.accessibility.personalMessage')}
                  inputStyle={styles.messageInput}
                />
                {!messageSent && (
                  <Button
                    variant="ghost"
                    title={t('giver.confirmation.personalMessage.attach')}
                    onPress={handleSendMessage}
                    disabled={isSendingMessage || !personalizedMessage.trim()}
                    loading={isSendingMessage}
                  />
                )}
                {messageSent && (
                  <View style={styles.messageSentBadge}>
                    <CheckCircle color={colors.secondary} size={16} />
                    <Text style={styles.messageSentText}>{t('giver.confirmation.personalMessage.sent')}</Text>
                  </View>
                )}
              </View>}
            </View>
          </View>
        ) : null}

        {/* Claim Code Section (gift to others only, not empower — or Together) */}
        {((!goalId && !isEmpower) || isTogether) && <View style={styles.codeSection}>
          <View style={styles.codeSectionHeader}>
            <Text style={styles.codeSectionTitle}>{t('giver.confirmation.giftCode.title')}</Text>
            <Text style={styles.codeSectionSubtitle}>
              {t('giver.confirmation.giftCode.subtitle')}
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
                accessibilityLabel={t('giver.confirmation.accessibility.copyCode')}
              >
                <Copy color={isCopied ? colors.secondary : colors.textSecondary} size={20} />
                <Text style={[styles.copyCodeText, isCopied && styles.copiedText]}>
                  {isCopied ? t('giver.confirmation.giftCode.copied') : t('giver.confirmation.giftCode.copy')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.shareCodeButton}
                onPress={handleShareCode}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('giver.confirmation.accessibility.shareCode')}
              >
                <Text style={styles.shareCodeText}>{t('giver.confirmation.giftCode.share')}</Text>
                <ArrowRight color={colors.white} size={20} />
              </TouchableOpacity>
            </View>
          </View>
        </View>}

        {/* How It Works (gift to others only, not empower — or Together) */}
        {((!goalId && !isEmpower) || isTogether) && <View style={styles.howItWorksSection}>
          <Text style={styles.howItWorksTitle}>{t('giver.confirmation.howItWorks.title')}</Text>

          <View style={styles.stepsContainer}>
            {(isTogether ? [
              {
                step: '1',
                title: t('giver.confirmation.howItWorks.together.step1Title'),
                desc: t('giver.confirmation.howItWorks.together.step1Desc'),
              },
              {
                step: '2',
                title: t('giver.confirmation.howItWorks.together.step2Title'),
                desc: t('giver.confirmation.howItWorks.together.step2Desc'),
              },
              {
                step: '3',
                title: t('giver.confirmation.howItWorks.together.step3Title'),
                desc: t('giver.confirmation.howItWorks.together.step3Desc'),
              },
              {
                step: '4',
                title: t('giver.confirmation.howItWorks.together.step4Title'),
                desc: t('giver.confirmation.howItWorks.together.step4Desc'),
              },
            ] : [
              {
                step: '1',
                title: t('giver.confirmation.howItWorks.solo.step1Title'),
                desc: t('giver.confirmation.howItWorks.solo.step1Desc'),
              },
              {
                step: '2',
                title: t('giver.confirmation.howItWorks.solo.step2Title'),
                desc: t('giver.confirmation.howItWorks.solo.step2Desc'),
              },
              {
                step: '3',
                title: t('giver.confirmation.howItWorks.solo.step3Title'),
                desc: t('giver.confirmation.howItWorks.solo.step3Desc'),
              },
              {
                step: '4',
                title: t('giver.confirmation.howItWorks.solo.step4Title'),
                desc: t('giver.confirmation.howItWorks.solo.step4Desc'),
              },
            ]).map((item, index) => (
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
        <View style={{ height: vh(100) + FOOTER_HEIGHT }} />
      </ScrollView>

      {/* Fixed Bottom Button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Button
          variant="primary"
          title={isTogether ? t('giver.confirmation.buttons.startChallenge') : isEmpower ? t('giver.confirmation.buttons.backToFeed') : goalId ? t('giver.confirmation.buttons.goToGoals') : t('giver.confirmation.buttons.backToHome')}
          onPress={() => {
            if (isTogether) {
              rootNavigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'GoalsTab', params: { screen: 'Goals' } } }] });
            } else if (isEmpower) {
              rootNavigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'FeedTab', params: { screen: 'Feed' } } }] });
            } else if (goalId) {
              rootNavigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'GoalsTab', params: { screen: 'Goals' } } }] });
            } else {
              handleBackToHome();
            }
          }}
          fullWidth
        />
      </View>
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
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
  heroCategoryBadge: {
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxxl,
    marginTop: Spacing.xl,
    gap: Spacing.xxs,
  },
  heroCategoryText: {
    ...Typography.smallBold,
    color: colors.primary,
    textAlign: 'center',
  },
  heroCategorySubtext: {
    ...Typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
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
  experienceImage: {
    width: '100%',
    height: vh(200),
    backgroundColor: colors.border,
  },
  experienceOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: BorderRadius.xxl,
    backgroundColor: colors.primaryOverlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  experienceContent: {
    padding: Spacing.xl,
  },
  experienceTitle: {
    ...Typography.heading2,
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  experienceSubtitle: {
    ...Typography.body,
    color: colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  priceTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySurface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  priceAmount: {
    ...Typography.heading1,
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
    ...Typography.caption,
    fontWeight: '600',
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  charCounter: {
    ...Typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
  },
  messageSubtitle: {
    ...Typography.caption,
    color: colors.textSecondary,
    marginBottom: Spacing.md,
  },
  messageInput: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    ...Typography.body,
    color: colors.textPrimary,
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.secondary,
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
    color: colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  codeSectionSubtitle: {
    ...Typography.small,
    color: colors.textSecondary,
  },
  codeCard: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  codeDisplay: {
    backgroundColor: colors.backgroundLight,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  codeText: {
    ...Typography.heading2,
    fontWeight: '800',
    color: colors.secondary,
    textAlign: 'center',
    letterSpacing: 3,
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
    backgroundColor: colors.primarySurface,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primaryTint,
  },
  copyCodeText: {
    ...Typography.subheading,
    color: colors.secondary,
  },
  copiedText: {
    color: colors.secondary,
  },
  shareCodeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.secondary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  shareCodeText: {
    ...Typography.subheading,
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
});

export default ConfirmationScreen;