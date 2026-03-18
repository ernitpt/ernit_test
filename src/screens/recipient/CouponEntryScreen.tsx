import React, { useState, useRef, useEffect } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RecipientStackParamList, ExperienceGift } from '../../types';
import { useApp } from '../../context/AppContext';
import MainScreen from '../MainScreen';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs, doc, runTransaction, updateDoc } from 'firebase/firestore';
import { logger } from '../../utils/logger';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { logErrorToFirestore } from '../../utils/errorLogger';
import Button from '../../components/Button';
import { analyticsService } from '../../services/AnalyticsService';
import { friendService } from '../../services/FriendService';
import Colors from '../../config/colors';
import { BorderRadius } from '../../config/borderRadius';
import { Spacing } from '../../config/spacing';
import { Typography } from '../../config/typography';

type CouponEntryNavigationProp =
  NativeStackNavigationProp<RecipientStackParamList, 'CouponEntry'>;

const CouponEntryScreen = () => {
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
  const continueTimeoutRef = useRef<NodeJS.Timeout>();

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (continueTimeoutRef.current) clearTimeout(continueTimeoutRef.current);
    };
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

  const handleClaimCode = async (codeOverride?: string) => {
    if (isLoading) return;

    const trimmedCode = (codeOverride || claimCode).trim().toUpperCase();
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

    setIsLoading(true);
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      // Check regular experience gifts
      const giftsRef = collection(db, 'experienceGifts');
      const q = query(
        giftsRef,
        where('claimCode', '==', trimmedCode),
        where('status', '==', 'pending')
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
        const expiresAt = experienceGift.expiresAt instanceof Date
          ? experienceGift.expiresAt
          : (experienceGift.expiresAt as any).toDate?.()
            ?? new Date(experienceGift.expiresAt as any);
        if (expiresAt < new Date()) {
          setErrorMessage('This claim code has expired');
          triggerShake();
          return;
        }
      }

      // T1-4: Atomically claim the gift to prevent race conditions
      const giftRef = doc(db, 'experienceGifts', giftDoc.id);
      try {
        await runTransaction(db, async (transaction) => {
          const freshGift = await transaction.get(giftRef);
          if (!freshGift.exists() || freshGift.data()?.status !== 'pending') {
            throw new Error('ALREADY_CLAIMED');
          }
          transaction.update(giftRef, {
            status: 'claimed',
            claimedBy: state.user?.id || '',
            claimedAt: new Date(),
          });
        });
      } catch (txError: unknown) {
        if (txError instanceof Error && txError.message === 'ALREADY_CLAIMED') {
          setErrorMessage('This code has already been claimed');
          triggerShake();
          return;
        }
        throw txError;
      }

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
        } catch (friendError) {
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
    } catch (error) {
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
  };

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
      <LinearGradient colors={Colors.gradientPrimary} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <StatusBar style="light" />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={{
                paddingTop: 45,
                flexGrow: 1,
                justifyContent: 'center',
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
            >
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: Spacing.xxxl,
                }}
              >
                {/* Favicon Logo */}
                <View style={{ marginBottom: Spacing.xxl, alignItems: 'center' }}>
                  <Image
                    source={require('../../assets/favicon.png')}
                    style={{ width: 80, height: 80 }}
                    resizeMode="contain"
                    accessibilityLabel="Ernit logo"
                  />
                </View>

                {/* Header */}
                <View style={{ marginBottom: Spacing.huge, alignItems: 'center' }}>
                  <Text
                    style={{
                      fontSize: Typography.displayLarge.fontSize,
                      fontWeight: '700',
                      color: 'white',
                      textAlign: 'center',
                      marginBottom: Spacing.xl,
                    }}
                  >
                    Claim your
                  </Text>
                  <Text
                    style={{
                      fontSize: Typography.displayLarge.fontSize,
                      fontWeight: '700',
                      color: 'white',
                      textAlign: 'center',
                      marginTop: -28,
                      marginBottom: Spacing.md,
                    }}
                  >
                    Ernit
                  </Text>
                  <Text
                    style={{
                      ...Typography.heading3,
                      color: Colors.primaryTint,
                      textAlign: 'center',
                      maxWidth: 300,
                    }}
                  >
                    Enter the code you got below and start earning your reward
                  </Text>
                </View>

                {/* Code Input & Button */}
                <View style={{ width: '100%', maxWidth: 400, alignItems: 'center' }}>
                  <Animated.View
                    style={{
                      width: '100%',
                      transform: [{ translateX: shakeAnim }],
                    }}
                  >
                    <TextInput
                      style={{
                        backgroundColor: 'white',
                        borderRadius: BorderRadius.lg,
                        paddingHorizontal: Spacing.xl,
                        paddingVertical: Spacing.lg,
                        ...Typography.heading3,
                        textAlign: 'center',
                        letterSpacing: 4,
                        shadowColor: Colors.black,
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 8,
                        elevation: 3,
                        borderWidth: errorMessage ? 2 : 0,
                        borderColor: errorMessage ? Colors.error : 'transparent',
                        width: '100%',
                      }}
                      placeholder="ABC123DEF456"
                      placeholderTextColor={Colors.textMuted}
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

                  {/* Error message (fixed height to avoid layout jump and overlap) */}
                  <View style={{ height: 40, marginTop: Spacing.md, marginBottom: Spacing.sm, justifyContent: 'center' }}>
                    {errorMessage ? (
                      <Text
                        style={{
                          color: 'white',
                          ...Typography.small,
                          textAlign: 'center',
                          fontWeight: '500',
                        }}
                      >
                        {errorMessage}
                      </Text>
                    ) : null}
                  </View>

                  <Button
                    variant="ghost"
                    size="lg"
                    title="Claim Reward"
                    onPress={() => handleClaimCode()}
                    disabled={isLoading || claimCode.length < 6}
                    loading={isLoading}
                    fullWidth
                    style={{
                      backgroundColor:
                        isLoading || claimCode.length < 6 ? Colors.disabled : Colors.white,
                      borderRadius: BorderRadius.lg,
                      shadowColor: Colors.black,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.2,
                      shadowRadius: 6,
                      elevation: 5,
                    }}
                    textStyle={{
                      color: Colors.primary,
                      ...Typography.heading3,
                      fontWeight: '700',
                    }}
                  />
                </View>

                {/* Info Box */}
                <View
                  style={{
                    backgroundColor: Colors.whiteAlpha25,
                    borderRadius: BorderRadius.xl,
                    padding: Spacing.xxl,
                    width: '100%',
                    maxWidth: 400,
                    marginTop: Spacing.huge,
                  }}
                >
                  <Text
                    style={{
                      color: 'white',
                      ...Typography.heading3,
                      fontWeight: '700',
                      marginBottom: Spacing.lg,
                      textAlign: 'center',
                    }}
                  >
                    How it works:
                  </Text>
                  <View style={{ gap: Spacing.sm }}>
                    <Text
                      style={{ color: Colors.primaryTint, ...Typography.subheading, textAlign: 'center' }}
                    >
                      1. Enter your claim code
                    </Text>
                    <Text
                      style={{ color: Colors.primaryTint, ...Typography.subheading, textAlign: 'center' }}
                    >
                      2. Set personal goals to earn the reward
                    </Text>
                    <Text
                      style={{ color: Colors.primaryTint, ...Typography.subheading, textAlign: 'center' }}
                    >
                      3. Receive hints as you progress
                    </Text>
                    <Text
                      style={{ color: Colors.primaryTint, ...Typography.subheading, textAlign: 'center' }}
                    >
                      4. Achieve your goals and claim your reward!
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>

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

const styles = StyleSheet.create({
  messageBox: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  messageText: {
    ...Typography.subheading,
    lineHeight: 24,
    color: Colors.gray700,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  signatureText: {
    ...Typography.small,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'right',
    marginBottom: Spacing.xl,
    marginTop: -8,
  },
  continueButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  continueButtonText: {
    color: Colors.white,
    fontWeight: '700',
    ...Typography.heading3,
    letterSpacing: 0.3,
  },
});

export default CouponEntryScreen;