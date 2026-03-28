// screens/giver/DeferredSetupScreen.tsx
// Collects card details for a deferred (pay-on-success) gift using a Stripe SetupIntent.
// The server creates the SetupIntent in createDeferredGift; this screen presents the
// PaymentElement in setup mode so the giver's card is saved for off-session charging later.

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { FOOTER_HEIGHT } from '../../components/FooterNavigation';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { ChevronLeft, Lock, CreditCard } from 'lucide-react-native';

import { RootStackParamList, ExperienceGift } from '../../types';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { logger } from '../../utils/logger';
import { logErrorToFirestore } from '../../utils/errorLogger';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Spacing } from '../../config/spacing';
import { Typography } from '../../config/typography';
import { Shadows } from '../../config/shadows';
import MainScreen from '../MainScreen';
import Button from '../../components/Button';
import { vh } from '../../utils/responsive';
import { getUserMessage } from '../../utils/AppError';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const stripePromise = Platform.OS === 'web' ? loadStripe(process.env.EXPO_PUBLIC_STRIPE_PK!) : null;

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'DeferredSetup'>;

// ──────────────────────────────────────────────────────────────────────────────
// Inner component — must be rendered inside <Elements>
// ──────────────────────────────────────────────────────────────────────────────
type SetupInnerProps = {
  experienceGift: ExperienceGift;
};

const SetupInner: React.FC<SetupInnerProps> = ({ experienceGift }) => {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();
  const { showError, showInfo } = useToast();

  const stripe = useStripe();
  const elements = useElements();

  const [isProcessing, setIsProcessing] = useState(false);

  const handleSaveCard = async () => {
    if (!stripe || !elements || isProcessing) return;
    setIsProcessing(true);

    try {
      // Save gift ID for SCA recovery — if 3D Secure redirects, we can recover context
      if (experienceGift?.id) {
        await AsyncStorage.setItem('pending_sca_gift', experienceGift.id);
      }

      // Confirm the SetupIntent — this saves the payment method for future off-session use
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          // Required for redirect-based methods; unused for card but must be present
          return_url: Platform.OS === 'web'
            ? `${window.location.origin}/confirmation`
            : 'ernit://confirmation',
        },
        redirect: 'if_required',
      });

      if (error) {
        // Validation or integration errors — stay on screen so user can retry
        if (error.type === 'validation_error' || error.type === 'invalid_request_error') {
          showError(getUserMessage(error, 'Card validation failed. Please check your card details and try again.'));
          await AsyncStorage.removeItem('pending_sca_gift').catch(() => {});
          return;
        }
        // Card declined or other transient error — log and let user retry
        logger.warn('SetupIntent confirmation failed:', error.message);
        await logErrorToFirestore(error, {
          screenName: 'DeferredSetupScreen',
          feature: 'ConfirmSetupIntent',
          userId: state.user?.id,
        });
        showError(getUserMessage(error, 'Could not save your card. Please verify your details and try again.'));
        return;
      }

      if (setupIntent?.status === 'succeeded') {
        // Card saved — clear SCA recovery key and proceed
        await AsyncStorage.removeItem('pending_sca_gift').catch(() => {});
        navigation.replace('Confirmation', { experienceGift });
      } else {
        // SetupIntent not confirmed (requires_action, requires_payment_method, etc.)
        logger.warn('Unexpected SetupIntent status:', setupIntent?.status);
        await logErrorToFirestore(new Error(`SetupIntent status: ${setupIntent?.status}`), {
          screenName: 'DeferredSetupScreen',
          feature: 'ConfirmSetupIntent',
          userId: state.user?.id,
        });
        showError('Card verification incomplete. Please try again.');
      }
    } catch (err: unknown) {
      logger.error('Error confirming SetupIntent:', err);
      await logErrorToFirestore(err, {
        screenName: 'DeferredSetupScreen',
        feature: 'ConfirmSetupIntent',
        userId: state.user?.id,
      });
      showError('Something went wrong. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkip = useCallback(() => {
    showInfo('You can add payment details later from Purchased Gifts.');
    navigation.replace('Confirmation', { experienceGift });
  }, [navigation, experienceGift]);

  return (
    <MainScreen activeRoute="Home">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              disabled={isProcessing}
            >
              <ChevronLeft color={colors.textPrimary} size={24} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Secure Your Gift</Text>
            <View style={styles.lockIcon}>
              <Lock color={colors.secondary} size={20} />
            </View>
          </View>

          {isProcessing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator color={colors.secondary} size="large" />
              <Text style={styles.processingText}>Saving your card...</Text>
            </View>
          )}

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            {/* Info card */}
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Zero charge until they succeed</Text>
              <Text style={styles.infoSubtitle}>
                Save your card now. We'll only charge you once your recipient completes their goal.
                You can remove it any time from Purchased Gifts.
              </Text>
            </View>

            {/* Stripe PaymentElement (card form) */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <CreditCard color={colors.secondary} size={20} />
                <Text style={[styles.sectionTitle, { marginLeft: Spacing.sm }]}>Card Details</Text>
              </View>
              <View style={styles.paymentBox}>
                <PaymentElement
                  options={{
                    layout: 'tabs',
                  }}
                />
              </View>
            </View>

            {/* Security note */}
            <View style={styles.securityNotice}>
              <Lock color={colors.textSecondary} size={16} />
              <Text style={styles.securityText}>
                Your payment information is encrypted and secure
              </Text>
            </View>

            <View style={{ height: vh(200) }} />
          </ScrollView>

          {/* Bottom CTA */}
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}>
            <Button
              variant="primary"
              title="Save Card & Continue"
              onPress={handleSaveCard}
              disabled={isProcessing}
              loading={isProcessing}
              fullWidth
            />
            <TouchableOpacity
              onPress={handleSkip}
              disabled={isProcessing}
              style={styles.skipButton}
              accessibilityRole="button"
              accessibilityLabel="Skip card setup for now"
            >
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </MainScreen>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Native setup — uses @stripe/stripe-react-native PaymentSheet for card setup
// ──────────────────────────────────────────────────────────────────────────────
const NativeDeferredSetup: React.FC = () => {
  const { usePaymentSheet } = require('../../hooks/useNativePaymentSheet');
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const route = useRoute();
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();
  const { showError, showInfo } = useToast();
  const insets = useSafeAreaInsets();

  const routeParams = route.params as {
    setupIntentClientSecret: string;
    experienceGift: ExperienceGift;
  } | undefined;

  const setupIntentClientSecret = routeParams?.setupIntentClientSecret;
  const experienceGift = routeParams?.experienceGift;

  const [isProcessing, setIsProcessing] = useState(false);
  const [sheetReady, setSheetReady] = useState(false);
  const initRef = React.useRef(false);

  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  React.useEffect(() => {
    if (!setupIntentClientSecret || !experienceGift) {
      logger.warn('NativeDeferredSetup: missing params, redirecting');
      if (experienceGift) {
        navigation.replace('Confirmation', { experienceGift });
      } else {
        navigation.replace('ChallengeLanding');
      }
      return;
    }

    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      try {
        const { error } = await initPaymentSheet({
          setupIntentClientSecret,
          merchantDisplayName: 'Ernit',
          style: 'automatic',
        });
        if (error) {
          logger.error('PaymentSheet setup init error:', error);
          showError('Could not set up card form. Please try again.');
          initRef.current = false;
        } else {
          setSheetReady(true);
        }
      } catch (err: unknown) {
        logger.error('Error initializing native deferred setup:', err);
        showError('Something went wrong. Please try again.');
        initRef.current = false;
      }
    };

    init();
  }, [setupIntentClientSecret, experienceGift]);

  const handleSaveCard = React.useCallback(async () => {
    if (isProcessing || !sheetReady) return;
    setIsProcessing(true);

    try {
      const { error } = await presentPaymentSheet();

      if (error) {
        if (error.code === 'Canceled') return;
        throw error;
      }

      // Card saved successfully
      if (experienceGift) {
        navigation.replace('Confirmation', { experienceGift });
      }
    } catch (err: unknown) {
      logger.error('Error confirming native SetupIntent:', err);
      await logErrorToFirestore(err, {
        screenName: 'DeferredSetupScreen',
        feature: 'NativeConfirmSetupIntent',
        userId: state.user?.id,
      });
      showError('Could not save your card. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, sheetReady, experienceGift, navigation]);

  const handleSkip = React.useCallback(() => {
    showInfo('You can add payment details later from Purchased Gifts.');
    if (experienceGift) {
      navigation.replace('Confirmation', { experienceGift });
    } else {
      navigation.replace('ChallengeLanding');
    }
  }, [navigation, experienceGift]);

  if (!setupIntentClientSecret || !experienceGift) return null;

  return (
    <ErrorBoundary screenName="DeferredSetupScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Home">
        <View style={styles.container}>
          {isProcessing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator color={colors.secondary} size="large" />
              <Text style={styles.processingText}>Saving your card...</Text>
            </View>
          )}

          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              disabled={isProcessing}
            >
              <ChevronLeft color={colors.textPrimary} size={24} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Secure Your Gift</Text>
            <View style={styles.lockIcon}>
              <Lock color={colors.secondary} size={20} />
            </View>
          </View>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Zero charge until they succeed</Text>
              <Text style={styles.infoSubtitle}>
                Save your card now. We'll only charge you once your recipient completes their goal.
                You can remove it any time from Purchased Gifts.
              </Text>
            </View>

            <View style={styles.securityNotice}>
              <Lock color={colors.textSecondary} size={16} />
              <Text style={styles.securityText}>
                Your payment information is encrypted and secure
              </Text>
            </View>

            <View style={{ height: vh(200) }} />
          </ScrollView>

          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}>
            <Button
              variant="primary"
              title={sheetReady ? 'Save Card & Continue' : 'Setting up...'}
              onPress={handleSaveCard}
              disabled={isProcessing || !sheetReady}
              loading={isProcessing}
              fullWidth
            />
            <TouchableOpacity
              onPress={handleSkip}
              disabled={isProcessing}
              style={styles.skipButton}
              accessibilityRole="button"
              accessibilityLabel="Skip card setup for now"
            >
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </MainScreen>
    </ErrorBoundary>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Web wrapper — initialises Stripe <Elements> with the SetupIntent secret
// ──────────────────────────────────────────────────────────────────────────────
const WebDeferredSetup: React.FC = () => {
  const colors = useColors();
  const route = useRoute();
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();

  const routeParams = route.params as {
    setupIntentClientSecret: string;
    experienceGift: ExperienceGift;
  } | undefined;

  const setupIntentClientSecret = routeParams?.setupIntentClientSecret;
  const experienceGift = routeParams?.experienceGift;

  useEffect(() => {
    if (!setupIntentClientSecret || !experienceGift) {
      // Guard: if params are missing (e.g. deep-link without context), skip to Confirmation
      logger.warn('DeferredSetupScreen: missing params, redirecting');
      if (experienceGift) {
        navigation.replace('Confirmation', { experienceGift });
      } else {
        navigation.replace('ChallengeLanding');
      }
    }
  }, [navigation, setupIntentClientSecret, experienceGift]);

  if (!setupIntentClientSecret || !experienceGift) {
    return null; // useEffect handles navigation
  }

  return (
    <ErrorBoundary screenName="DeferredSetupScreen" userId={state.user?.id}>
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret: setupIntentClientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: colors.secondary,
              colorBackground: colors.surface,
              colorText: colors.textPrimary,
              colorDanger: colors.error,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              spacingUnit: '4px',
              borderRadius: '8px',
            },
          },
        }}
      >
        <SetupInner experienceGift={experienceGift} />
      </Elements>
    </ErrorBoundary>
  );
};

// ========== PLATFORM SWITCH ==========
const DeferredSetupScreen = Platform.OS === 'web' ? WebDeferredSetup : NativeDeferredSetup;
export default DeferredSetupScreen;

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Platform.OS === 'ios' ? vh(50) : vh(40),
    paddingBottom: Spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xl,
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.large,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  lockIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xl,
    backgroundColor: colors.successLighter,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginTop: Spacing.xl,
    marginBottom: Spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    ...Shadows.sm,
  },
  infoTitle: {
    ...Typography.heading3,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  infoSubtitle: {
    ...Typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  section: {
    marginBottom: vh(24),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.heading3,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  paymentBox: {
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xl,
  },
  securityText: {
    ...Typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  skipText: {
    ...Typography.body,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  bottomBar: {
    position: 'absolute',
    bottom: FOOTER_HEIGHT,
    left: 0,
    right: 0,
    backgroundColor: colors.surfaceFrosted,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? Spacing.xl : Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    elevation: 8,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceFrosted,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  processingText: {
    marginTop: Spacing.md,
    ...Typography.subheading,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
