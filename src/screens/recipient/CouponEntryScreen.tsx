import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Image,
  StyleSheet,
} from 'react-native';
import { BaseModal } from '../../components/BaseModal';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RecipientStackParamList, ExperienceGift } from '../../types';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { logger } from '../../utils/logger';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { sanitizeText } from '../../utils/sanitization';
import { logErrorToFirestore } from '../../utils/errorLogger';
import Button from '../../components/Button';
import { analyticsService } from '../../services/AnalyticsService';
import { friendService } from '../../services/FriendService';
import { Colors, useColors } from '../../config';
import { vh } from '../../utils/responsive';
import { BorderRadius } from '../../config/borderRadius';
import { Spacing } from '../../config/spacing';
import { Typography } from '../../config/typography';
import { Shadows } from '../../config/shadows';

type CouponEntryNavigationProp =
  NativeStackNavigationProp<RecipientStackParamList, 'CouponEntry'>;

const CouponEntryScreen = () => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<CouponEntryNavigationProp>();
  const route = useRoute();
  const { state, dispatch } = useApp();

  const params = route.params as { code?: string } | undefined;
  const initialCode = (params?.code || '').toUpperCase();

  const [claimCode, setClaimCode] = useState(initialCode);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPersonalizedMessage, setShowPersonalizedMessage] = useState(false);
  const [personalizedMessage, setPersonalizedMessage] = useState('');
  const [pendingExperienceGift, setPendingExperienceGift] = useState<ExperienceGift | null>(null);

  // Shake animation for error feedback
  const shakeAnim = useRef(new Animated.Value(0)).current;
  // Animated height for error message area
  const errorHeightAnim = useRef(new Animated.Value(0)).current;
  const continueTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (continueTimeoutRef.current) clearTimeout(continueTimeoutRef.current);
    };
  }, []);

  // Animate error message area open/closed
  useEffect(() => {
    Animated.timing(errorHeightAnim, {
      toValue: errorMessage ? 36 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [errorMessage]);

  // Persist claim code from deep link so it survives an auth redirect
  useEffect(() => {
    if (initialCode) {
      AsyncStorage.setItem('pending_claim_code', initialCode);
    }
  }, []);

  // On mount, recover any pending claim code saved before an auth redirect
  useEffect(() => {
    const checkPendingCode = async () => {
      const pending = await AsyncStorage.getItem('pending_claim_code');
      if (pending && !initialCode) {
        setClaimCode(pending);
        await AsyncStorage.removeItem('pending_claim_code');
      }
    };
    checkPendingCode();
  }, []);

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const validateClaimCode = (code: string) => /^[A-Z0-9]{12}$/.test(code);

  const handleClaimCode = useCallback(async (codeOverride?: string) => {
    if (isLoading) return;

    const trimmedCode = sanitizeText((codeOverride || claimCode), 12).trim().toUpperCase();
    setErrorMessage('');

    if (!trimmedCode) {
      setErrorMessage('Please enter a claim code');
      triggerShake();
      return;
    }

    if (!validateClaimCode(trimmedCode)) {
      setErrorMessage('Please enter a valid 12-character code');
      triggerShake();
      return;
    }

    // Guard: user must be authenticated before claiming
    if (!state.user?.id) {
      setErrorMessage('Please log in to claim this gift');
      triggerShake();
      return;
    }

    setIsLoading(true);
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      // Check regular experience gifts
      const giftsRef = collection(db, 'experienceGifts');
      const q = query(
        giftsRef,
        where('claimCode', '==', trimmedCode),
        where('status', 'in', ['pending', 'active']),
        limit(1)
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setErrorMessage('This claim code is invalid or already claimed');
        triggerShake();
        return;
      }

      const giftDoc = querySnapshot.docs[0];
      const experienceGift = {
        id: giftDoc.id,
        ...(giftDoc.data() as ExperienceGift),
      };

      // Check if claim code has expired
      if (experienceGift.expiresAt) {
        const rawExpiry = experienceGift.expiresAt;
        const expiresAt = rawExpiry instanceof Date
          ? rawExpiry
          : typeof (rawExpiry as { toDate?: () => Date }).toDate === 'function'
            ? (rawExpiry as { toDate: () => Date }).toDate()
            : new Date(rawExpiry as string | number);
        if (expiresAt < new Date()) {
          setErrorMessage('This claim code has expired');
          triggerShake();
          return;
        }
      }

      // Validation only — actual claim is performed atomically in GoalSettingScreen
      // (CouponEntryScreen must NOT modify the gift document to avoid double-claim)

      analyticsService.trackEvent('coupon_redeemed', 'conversion', { giftId: giftDoc.id }, 'CouponEntryScreen');
      dispatch({ type: 'SET_EXPERIENCE_GIFT', payload: experienceGift });

      // Auto-add giver as friend on redeem
      if (experienceGift.giverId && state.user?.id && experienceGift.giverId !== state.user.id) {
        try {
          await friendService.sendFriendRequest(
            state.user.id,
            state.user.displayName || '',
            experienceGift.giverId,
            experienceGift.giverName || '',
          );
          logger.log('🤝 Auto-friend request sent to giver:', experienceGift.giverId);
        } catch (friendError: unknown) {
          // Don't block redemption if friend request fails (may already be friends)
          logger.warn('Auto-friend request failed (may already exist):', friendError);
        }
      }

      // If there's a personalized message, show it in a popup first
      if (experienceGift.personalizedMessage && experienceGift.personalizedMessage.trim()) {
        setPersonalizedMessage(experienceGift.personalizedMessage.trim());
        setPendingExperienceGift(experienceGift);
        setShowPersonalizedMessage(true);
      } else {
        // No message, proceed directly to GoalSetting
        navigation.reset({
          index: 0,
          routes: [{ name: 'GoalSetting', params: { experienceGift } }],
        });
      }
    } catch (error: unknown) {
      logger.error('Error claiming experience gift:', error);
      await logErrorToFirestore(error, {
        screenName: 'CouponEntryScreen',
        feature: 'ClaimCode',
        userId: state.user?.id,
        additionalData: { claimCode: trimmedCode }
      });
      setErrorMessage('An error occurred. Please try again.');
      triggerShake();
    } finally {
      setIsLoading(false);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [isLoading, claimCode, state.user, navigation, dispatch, triggerShake]);

  const handleContinueFromMessage = () => {
    setShowPersonalizedMessage(false);
    // Small delay to let animation complete
    continueTimeoutRef.current = setTimeout(() => {
      if (pendingExperienceGift) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'GoalSetting', params: { experienceGift: pendingExperienceGift } }],
        });
      }
    }, 200);
  };

  return (
    <ErrorBoundary screenName="CouponEntryScreen" userId={state.user?.id}>
    <MainScreen activeRoute="Goals">
      <View style={styles.screenBackground}>
        <SafeAreaView style={{ flex: 1 }}>
          <StatusBar style="auto" />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
            >
              <View style={styles.innerContainer}>

                {/* Favicon Logo */}
                <View style={styles.logoWrapper}>
                  <Image
                    source={require('../../assets/favicon.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                    accessibilityLabel="Ernit logo"
                  />
                </View>

                {/* Header */}
                <View style={styles.headerWrapper}>
                  <Text style={styles.headingLine1}>Claim your</Text>
                  <Text style={styles.headingLine2}>Ernit</Text>
                  <Text style={styles.subtitle}>
                    Enter the code you got below and start earning your reward
                  </Text>
                </View>

                {/* Frosted card: Code Input, Error & Button */}
                <View style={styles.frostedCard}>
                  <Animated.View
                    style={[
                      styles.animatedInputWrapper,
                      { transform: [{ translateX: shakeAnim }] },
                    ]}
                  >
                    <TextInput
                      style={[
                        styles.codeInput,
                        errorMessage
                          ? styles.codeInputError
                          : styles.codeInputNormal,
                      ]}
                      placeholder="ABC123DEF456"
                      placeholderTextColor={colors.textMuted}
                      value={claimCode}
                      onChangeText={(text) => {
                        const clean = text.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                        setClaimCode(clean);
                        if (errorMessage) setErrorMessage('');

                        // Auto-submit when 12 valid chars - pass the fresh code value
                        if (clean.length === 12 && validateClaimCode(clean) && !isLoading) {
                          setTimeout(() => handleClaimCode(clean), 50);
                        }
                      }}
                      maxLength={12}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      autoFocus
                      editable={!isLoading}
                      returnKeyType="done"
                      onSubmitEditing={() => handleClaimCode()}
                      accessibilityLabel="Coupon code input"
                    />
                  </Animated.View>

                  {/* Error message (animated height — collapses to 0 when empty) */}
                  <Animated.View style={[styles.errorContainer, { height: errorHeightAnim }]}>
                    {errorMessage ? (
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    ) : null}
                  </Animated.View>

                  <Button
                    variant="primary"
                    gradient
                    size="lg"
                    title="Claim Reward"
                    onPress={() => handleClaimCode()}
                    disabled={isLoading || claimCode.length < 12}
                    loading={isLoading}
                    fullWidth
                  />
                </View>

                {/* Info Box */}
                <View style={styles.infoBox}>
                  <Text style={styles.infoTitle}>How it works:</Text>
                  <View style={styles.infoStepList}>
                    <Text style={styles.infoStep}>1. Enter your claim code</Text>
                    <Text style={styles.infoStep}>2. Set personal goals to earn the reward</Text>
                    <Text style={styles.infoStep}>3. Receive hints as you progress</Text>
                    <Text style={styles.infoStep}>4. Achieve your goals and claim your reward!</Text>
                  </View>
                </View>

              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>

      {/* Personalized Message Modal */}
      <BaseModal
        visible={showPersonalizedMessage}
        onClose={handleContinueFromMessage}
        title="A Message For You"
        variant="center"
      >
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>"{personalizedMessage}"</Text>
        </View>
        {pendingExperienceGift?.giverName && (
          <Text style={styles.signatureText}>
            - from {pendingExperienceGift.giverName}
          </Text>
        )}
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinueFromMessage}
          activeOpacity={0.8}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </BaseModal>
    </MainScreen>
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  // ── Screen background ─────────────────────────────────────
  screenBackground: {
    flex: 1,
    backgroundColor: colors.white,
  },

  // ── ScrollView ──────────────────────────────────────────────
  scrollContent: {
    paddingTop: vh(45),
    paddingBottom: 100,
    flexGrow: 1,
    justifyContent: 'center',
  },
  innerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
  },

  // ── Logo ────────────────────────────────────────────────────
  logoWrapper: {
    marginBottom: Spacing.xxl,
    alignItems: 'center',
  },
  logoImage: {
    width: vh(80),
    height: vh(80),
  },

  // ── Header ──────────────────────────────────────────────────
  headerWrapper: {
    marginBottom: Spacing.huge,
    alignItems: 'center',
  },
  headingLine1: {
    ...Typography.displayLarge,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  headingLine2: {
    ...Typography.displayLarge,
    color: colors.primary,
    textAlign: 'center',
    marginTop: -28,
    marginBottom: Spacing.md,
  },
  subtitle: {
    ...Typography.heading3,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },

  // ── Input card ────────────────────────────────────────────
  frostedCard: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
    gap: Spacing.md,
    ...Shadows.sm,
  },

  // ── Code input ──────────────────────────────────────────────
  animatedInputWrapper: {
    width: '100%',
  },
  codeInput: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    ...Typography.heading3,
    textAlign: 'center',
    letterSpacing: 4,
    color: colors.textPrimary,
    width: '100%',
  },
  codeInputNormal: {
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  codeInputError: {
    borderWidth: 2,
    borderColor: colors.error,
  },

  // ── Error message ───────────────────────────────────────────
  errorContainer: {
    overflow: 'hidden',
    justifyContent: 'flex-end',
    marginTop: -Spacing.xs,
    marginBottom: -Spacing.xs,
  },
  errorText: {
    color: colors.error,
    ...Typography.smallBold,
    textAlign: 'center',
  },

  // ── Info box ────────────────────────────────────────────────
  infoBox: {
    backgroundColor: colors.primaryLight,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    width: '100%',
    maxWidth: 400,
    marginTop: Spacing.huge,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  infoTitle: {
    color: colors.textPrimary,
    ...Typography.heading3,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  infoStepList: {
    gap: Spacing.sm,
  },
  infoStep: {
    color: colors.textSecondary,
    ...Typography.subheading,
    textAlign: 'center',
  },

  // ── Personalized message modal ───────────────────────────────
  messageBox: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: {
    ...Typography.subheading,
    lineHeight: 24,
    color: colors.gray700,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  signatureText: {
    ...Typography.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'right',
    marginBottom: Spacing.xl,
    marginTop: -8,
  },
  continueButton: {
    backgroundColor: colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  continueButtonText: {
    color: colors.white,
    ...Typography.heading3,
    letterSpacing: 0.3,
  },
});

export default CouponEntryScreen;
