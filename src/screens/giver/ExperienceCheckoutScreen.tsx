// screens/ExperienceCheckoutScreen.tsx
// ✅ Final version: supports multiple gifts via cartItems, with personal message

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { FOOTER_HEIGHT } from '../../components/FooterNavigation';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { CheckoutSkeleton } from '../../components/SkeletonLoader';
import { useNavigation, useRoute } from "@react-navigation/native";
import { useBeforeRemove } from '../../hooks/useBeforeRemove';
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { ChevronLeft, Lock, CreditCard } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  GiverStackParamList,
  Experience,
  ExperienceGift,
  CartItem,
} from "../../types";

import { stripeService } from "../../services/stripeService";
import { experienceService } from "../../services/ExperienceService";
import { userService } from "../../services/userService";
import { useApp } from "../../context/AppContext";
import { useAuthGuard } from '../../context/AuthGuardContext';
import LoginPrompt from "../../components/LoginPrompt";
import MainScreen from "../MainScreen";
import { logger } from '../../utils/logger';
import { config } from '../../config/environment';
import { logErrorToFirestore } from '../../utils/errorLogger';
import { analyticsService } from '../../services/AnalyticsService';
import { Colors, useColors } from '../../config';
import { BorderRadius } from '../../config/borderRadius';
import { Spacing } from '../../config/spacing';
import { Typography } from '../../config/typography';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/Button';
import { vh } from '../../utils/responsive';
import * as Haptics from 'expo-haptics';

const stripePromise = Platform.OS === 'web' ? loadStripe(process.env.EXPO_PUBLIC_STRIPE_PK!) : null;

type NavigationProp = NativeStackNavigationProp<GiverStackParamList, "ExperienceCheckout">;

type CheckoutInnerProps = {
  clientSecret: string;
  paymentIntentId: string;
  cartItems: CartItem[];
  cartExperiences: Experience[];
  totalAmount: number;
  totalQuantity: number;
  goalId?: string;
};

// --- Storage helpers (web + native) ---
const getStorageItem = async (key: string) => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return localStorage.getItem(key);
  }
  return await AsyncStorage.getItem(key);
};

const setStorageItem = async (key: string, value: string) => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    localStorage.setItem(key, value);
  } else {
    await AsyncStorage.setItem(key, value);
  }
};

const removeStorageItem = async (key: string) => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    localStorage.removeItem(key);
  } else {
    await AsyncStorage.removeItem(key);
  }
};

// --- API helper to check if gifts were created ---
const checkGiftCreation = async (paymentIntentId: string): Promise<ExperienceGift[]> => {
  try {
    // ✅ SECURITY FIX: Get Firebase auth token
    const { auth } = await import('../../services/firebase');
    const user = auth.currentUser;

    if (!user) {
      logger.warn('⚠️ User not authenticated');
      return [];
    }

    const idToken = await user.getIdToken();

    // Use environment-based function URL
    const response = await fetch(
      `${config.functionsUrl}/${config.stripeFunctions.getGiftsByPaymentIntent}?paymentIntentId=${paymentIntentId}`,
      {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    if (!response.ok) {
      logger.warn(`Gift polling response: ${response.status} ${response.statusText}`);
      return [];
    }

    const gifts = await response.json();
    if (!Array.isArray(gifts)) return [];

    return gifts.map((gift: ExperienceGift) => ({
      ...gift,
      createdAt: new Date(gift.createdAt),
      deliveryDate: new Date(gift.deliveryDate),
      updatedAt: new Date(gift.updatedAt),
    }));
  } catch (error) {
    logger.error("Error checking gifts:", error);
    return [];
  }
};

// --- Poll for multiple gifts (for cart / Buy Now with quantity > 1) ---
const pollForGifts = async (
  paymentIntentId: string,
  expectedCount: number,
  maxAttempts: number = 12,
  delayMs: number = 1000,
  cancelledRef?: React.MutableRefObject<boolean>
): Promise<ExperienceGift[]> => {
  for (let i = 0; i < maxAttempts; i++) {
    if (cancelledRef?.current) return [];

    const gifts = await checkGiftCreation(paymentIntentId);

    if (gifts.length >= expectedCount) {
      return gifts;
    }
    // Log progress for debugging
    if (gifts.length > 0) {
      logger.log(`Polling attempt ${i + 1}: found ${gifts.length}/${expectedCount} gifts`);
    }

    await new Promise((res) => setTimeout(res, delayMs));
  }
  // Final attempt via Cloud Function
  const finalGifts = await checkGiftCreation(paymentIntentId);
  if (finalGifts.length > 0) {
    logger.log(`Polling complete: returning ${finalGifts.length} gifts (expected ${expectedCount})`);
    return finalGifts;
  }

  // Last resort: query Firestore directly (bypasses Cloud Function)
  try {
    const { db } = await import('../../services/firebase');
    const { collection, query, where, getDocs, limit } = await import('firebase/firestore');
    const snap = await getDocs(
      query(collection(db, 'experienceGifts'), where('paymentIntentId', '==', paymentIntentId), limit(10))
    );
    if (!snap.empty) {
      const directGifts = snap.docs.map(d => ({ id: d.id, ...d.data() } as ExperienceGift));
      logger.log(`Direct Firestore query found ${directGifts.length} gifts`);
      return directGifts;
    }
  } catch (directErr) {
    logger.error('Direct Firestore gift query failed:', directErr);
  }

  return [];
};

// ========== INNER CHECKOUT (inside <Elements>) ==========
const CheckoutInner: React.FC<CheckoutInnerProps> = ({
  clientSecret,
  paymentIntentId,
  cartItems,
  cartExperiences,
  totalAmount,
  totalQuantity,
  goalId,
}) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavigationProp>();
  const { state, dispatch } = useApp();
  const { showSuccess, showError, showInfo } = useToast();

  const stripe = useStripe();
  const elements = useElements();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isCheckingRedirect, setIsCheckingRedirect] = useState(false);
  const processingRef = useRef(false);
  const pollCancelledRef = useRef(false);

  /** Clear cart both client-side and in Firestore */
  const clearCartEverywhere = async () => {
    dispatch({ type: "CLEAR_CART" });
    if (state.user?.id) {
      try { await userService.clearCart(state.user.id); } catch {}
    }
  };

  // --- Block hardware back / gesture swipe during active payment ---
  useBeforeRemove(navigation, (e) => {
    if (!isProcessing && !isCheckingRedirect) return; // Allow normal back
    e.preventDefault(); // Block navigation during payment
  }, [isProcessing, isCheckingRedirect]);

  // --- Handle redirect-based flows (e.g. MB Way) ---
  useEffect(() => {
    const checkRedirectReturn = async () => {
      if (!stripe) return;

      let redirectClientSecret: string | null = null;
      let shouldCheck = false;

      if (Platform.OS === "web" && typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        redirectClientSecret = params.get("payment_intent_client_secret");
        if (redirectClientSecret) shouldCheck = true;
      } else {
        const pendingPayment = await getStorageItem(`pending_payment_${clientSecret}`);
        if (pendingPayment === "true") {
          redirectClientSecret = clientSecret;
          shouldCheck = true;
        }
      }

      if (!shouldCheck || !redirectClientSecret || redirectClientSecret !== clientSecret) return;

      setIsCheckingRedirect(true);
      try {
        const { paymentIntent, error } = await stripe.retrievePaymentIntent(redirectClientSecret);
        if (error) {
          logger.error("Error retrieving payment intent:", error);
          showError("Could not verify payment. Please contact support if payment was deducted.");
          setIsCheckingRedirect(false);
          return;
        }

        if (paymentIntent?.status === "succeeded") {
          logger.log("💰 Payment succeeded after redirect, checking gifts...");
          const gifts = await pollForGifts(paymentIntent.id, totalQuantity, 20, 2000, pollCancelledRef);

          if (gifts.length === 1) {
            dispatch({ type: "SET_EXPERIENCE_GIFT", payload: gifts[0] });
            await clearCartEverywhere();
            await removeStorageItem(`pending_payment_${clientSecret}`);

            if (Platform.OS === "web" && typeof window !== "undefined") {
              window.history.replaceState({}, document.title, window.location.pathname);
            }

            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showSuccess("Your payment was processed successfully!");
            navigation.navigate("Confirmation", { experienceGift: gifts[0], goalId });
          } else if (gifts.length > 1) {
            await clearCartEverywhere();
            await removeStorageItem(`pending_payment_${clientSecret}`);
            if (Platform.OS === "web" && typeof window !== "undefined") {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            navigation.navigate("ConfirmationMultiple", { experienceGifts: gifts });
          } else {
            logger.warn("⚠️ Gifts not found after polling");
            dispatch({ type: "CLEAR_CART" });  // Still clear cart — payment succeeded
            showInfo("Your payment was successful! Check 'Purchased Gifts' to view your gifts.");
            setTimeout(() => navigation.navigate('PurchasedGifts'), 2000);
          }
        } else if (paymentIntent?.status === "processing") {
          // Payment will succeed via webhook — clear cart everywhere to avoid duplicate purchases
          await clearCartEverywhere();
          showInfo("Your payment is being processed. You will receive a confirmation shortly.");
        } else if (paymentIntent?.status === "requires_action") {
          // Do NOT clear cart — user needs to complete the action and retry
          showInfo("Additional action is required to complete your payment.");
        }
      } catch (err: unknown) {
        logger.error("Error handling redirect return:", err);
        await logErrorToFirestore(err, {
          screenName: 'ExperienceCheckoutScreen',
          feature: 'RedirectReturn',
          userId: state.user?.id,
          additionalData: {
            clientSecret,
            paymentIntentId: redirectClientSecret
          }
        });
        showError("Failed to verify payment status. Please contact support.");
      } finally {
        setIsCheckingRedirect(false);
      }
    };

    const timer = setTimeout(() => checkRedirectReturn(), 500);
    return () => {
      clearTimeout(timer);
      // NOTE: Do NOT set pollCancelledRef here — it cancels the handlePurchase polling
      // when this effect re-runs due to dependency changes during payment processing.
    };
  }, [stripe, clientSecret, navigation, dispatch, totalQuantity]);

  const handlePurchase = useCallback(async () => {
    // Prevent double-submit: synchronous ref check + async state check
    if (processingRef.current || isProcessing) return;
    processingRef.current = true;
    if (!stripe || !elements) {
      processingRef.current = false;  // Reset so user can retry
      showInfo("Please wait a few seconds and try again.");
      return;
    }

    setIsProcessing(true);
    analyticsService.trackEvent('payment_initiated', 'conversion', { totalAmount, totalQuantity }, 'ExperienceCheckoutScreen');
    await setStorageItem(`pending_payment_${clientSecret}`, "true");

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url:
            Platform.OS === "web"
              ? window.location.href
              : `${process.env.EXPO_PUBLIC_APP_URL || 'https://ernit-nine.vercel.app'}/payment-success`,
        },
        redirect: "if_required",
      });

      if (error) throw error;
      if (!paymentIntent) throw new Error("No payment intent returned.");

      if (paymentIntent.status === "succeeded") {
        logger.log(`💰 Payment succeeded. PI: ${paymentIntent.id}, expecting ${totalQuantity} gifts`);
        analyticsService.trackEvent('payment_completed', 'conversion', { totalAmount, totalQuantity }, 'ExperienceCheckoutScreen');
        const gifts = await pollForGifts(paymentIntent.id, totalQuantity, 20, 2000, pollCancelledRef);
        logger.log(`Poll result: ${gifts.length} gifts found`);

        if (gifts.length === 1) {
          dispatch({ type: "SET_EXPERIENCE_GIFT", payload: gifts[0] });
          dispatch({ type: "CLEAR_CART" }); // ✅ Clear cart after successful purchase
          await removeStorageItem(`pending_payment_${clientSecret}`);
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showSuccess("Your payment was processed successfully!");
          navigation.navigate("Confirmation", { experienceGift: gifts[0], goalId });
        } else if (gifts.length > 1) {
          dispatch({ type: "CLEAR_CART" }); // ✅ Clear cart after successful purchase
          await removeStorageItem(`pending_payment_${clientSecret}`);
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          navigation.navigate("ConfirmationMultiple", { experienceGifts: gifts });
        } else {
          logger.warn("⚠️ Gifts not found after polling");
          dispatch({ type: "CLEAR_CART" });  // Still clear cart — payment succeeded
          showInfo("Your payment was successful! Check 'Purchased Gifts' to view your gifts.");
          setTimeout(() => navigation.navigate('PurchasedGifts'), 2000);
        }
      } else if (paymentIntent.status === "processing") {
        showInfo("Your payment is being processed. You will receive confirmation shortly.");
      }
      // If redirect happens, the useEffect above will handle it
    } catch (err: unknown) {
      await removeStorageItem(`pending_payment_${clientSecret}`);
      const errorMessage = (err instanceof Error ? err.message : String(err)) || "Something went wrong.";

      await logErrorToFirestore(err, {
        screenName: 'ExperienceCheckoutScreen',
        feature: 'HandlePurchase',
        userId: state.user?.id,
        additionalData: {
          totalAmount,
          totalQuantity,
          experienceIds: cartItems.map(i => i.experienceId)
        }
      });

      analyticsService.trackEvent('payment_failed', 'conversion', { error: errorMessage }, 'ExperienceCheckoutScreen');
      showError(errorMessage);
      logger.error("Payment error:", err);
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [stripe, elements, isProcessing, clientSecret, totalAmount, totalQuantity, goalId, navigation, dispatch, state.user?.id, cartItems]);

  return (
    <MainScreen activeRoute="Home">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => {
                if (navigation.canGoBack()) navigation.goBack();
                else navigation.navigate('CategorySelection');
              }}
              style={[styles.backButton, (isProcessing || isCheckingRedirect) && styles.backButtonDisabled]}
              disabled={isProcessing || isCheckingRedirect}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft color={colors.textPrimary} size={24} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Checkout</Text>
            <View style={styles.lockIcon}>
              <Lock color={colors.secondary} size={20} />
            </View>
          </View>

          {(isCheckingRedirect || isProcessing) && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator color={colors.secondary} size="large" />
              <Text style={styles.processingText}>
                {isCheckingRedirect ? "Verifying payment..." : "Processing payment..."}
              </Text>
            </View>
          )}

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
            {/* Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Your Gifts</Text>

              {cartItems.map((item) => {
                const exp = cartExperiences.find((e) => e.id === item.experienceId);
                if (!exp) return null;

                return (
                  <View key={item.experienceId} style={styles.summaryRow}>
                    <View style={styles.summaryInfo}>
                      <Text style={styles.summaryTitle}>{exp.title}</Text>
                      {exp.subtitle && (
                        <Text style={styles.subtitle}>{exp.subtitle}</Text>
                      )}
                      <Text style={styles.quantityText}>Qty: {item.quantity}</Text>
                    </View>
                    <Text style={styles.priceAmount}>
                      €{(exp.price * item.quantity).toFixed(2)}
                    </Text>
                  </View>
                );
              })}

              <View style={styles.priceLine}>
                <Text style={styles.priceLabel}>Total Amount</Text>
                <Text style={styles.priceAmount}>€{totalAmount.toFixed(2)}</Text>
              </View>
            </View>

            {/* Payment */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <CreditCard color={colors.secondary} size={20} />
                <Text style={[styles.sectionTitle, { marginLeft: Spacing.sm }]}>Payment Details</Text>
              </View>
              <View style={styles.paymentBox}>
                <PaymentElement />
              </View>
            </View>

            {/* Security note */}
            <View style={styles.securityNotice}>
              <Lock color={colors.textSecondary} size={16} />
              <Text style={styles.securityText}>
                Your payment information is encrypted and secure
              </Text>
            </View>

            <View style={{ height: vh(120) }} />
          </ScrollView>

          {/* Bottom CTA */}
          <View style={styles.bottomBar}>
            <View style={styles.totalSection}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalAmount}>€{totalAmount.toFixed(2)}</Text>
            </View>
            <Button
              variant="primary"
              title="Complete Purchase"
              onPress={handlePurchase}
              disabled={isProcessing}
              loading={isProcessing}
              fullWidth
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </MainScreen>
  );
};

// ========== OUTER WRAPPER (creates PaymentIntent & <Elements>) ==========
const ExperienceCheckoutScreen: React.FC = () => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const route = useRoute();
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();
  const { requireAuth, showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const { showError } = useToast();

  // Handle case where route params might be undefined on browser refresh
  const routeParams = route.params as { cartItems?: CartItem[]; goalId?: string; isMystery?: boolean } | undefined;
  const cartItems = routeParams?.cartItems || [];
  const goalId = routeParams?.goalId || state.empowerContext?.goalId;
  const isMystery = routeParams?.isMystery ?? state.empowerContext?.isMystery ?? false;

  // ✅ All useState hooks MUST be called unconditionally at the top (React Rules of Hooks)
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cartExperiences, setCartExperiences] = useState<Experience[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);

  // Calculate total quantity safely (empty array returns 0)
  const totalQuantity = Array.isArray(cartItems)
    ? cartItems.reduce((sum, item) => sum + item.quantity, 0)
    : 0;

  // Require authentication for checkout
  useEffect(() => {
    if (!state.user) {
      requireAuth("Please log in to proceed to checkout.");
    }
  }, [state.user, requireAuth]);

  // Redirect if data is missing (e.g., after page refresh)
  useEffect(() => {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      logger.warn('Missing/invalid cartItems on ExperienceCheckoutScreen, redirecting back');
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.reset({
          index: 0,
          routes: [{ name: 'CategorySelection' }],
        });
      }
    }
  }, [cartItems, navigation]);

  // Ref to ensure initialization only happens once
  const initRef = React.useRef(false);

  useEffect(() => {
    // Prevent re-initialization - Stripe Elements doesn't allow clientSecret to change
    if (initRef.current) return;

    const init = async () => {
      try {
        // Validation handled by early return/redirect above, but keeping safety check
        if (!cartItems || cartItems.length === 0) return;

        // Mark as initialized before async work to prevent race conditions
        initRef.current = true;
        analyticsService.trackEvent('checkout_started', 'conversion', { itemCount: cartItems.length }, 'ExperienceCheckoutScreen');

        // Load all experiences in cart
        const list: Experience[] = [];
        let total = 0;

        for (const item of cartItems) {
          const exp = await experienceService.getExperienceById(item.experienceId);
          if (exp) {
            list.push(exp);
            total += exp.price * item.quantity;
          }
        }

        if (list.length === 0) {
          showError("Could not load experiences for checkout.");
          initRef.current = false; // Allow retry
          if (navigation.canGoBack()) navigation.goBack();
          else navigation.navigate('CategorySelection');
          return;
        }

        setCartExperiences(list);
        setTotalAmount(total);

        const firstExp = list[0];

        // Build cart metadata for backend
        const cartMetadata = cartItems.map((item) => {
          const exp = list.find((e) => e.id === item.experienceId);
          return {
            experienceId: item.experienceId,
            partnerId: exp?.partnerId || firstExp.partnerId,
            quantity: item.quantity,
          };
        });

        // Create PaymentIntent with full metadata & aggregated total
        const response = await stripeService.createPaymentIntent(
          total,
          state.user?.id || "",
          state.user?.displayName || "",
          firstExp.partnerId,
          cartMetadata,
          "", // personalized message will be added on confirmation screen
          isMystery
        );

        setClientSecret(response.clientSecret);
        setPaymentIntentId(response.paymentIntentId);
      } catch (err: unknown) {
        logger.error("Error creating payment intent:", err);
        await logErrorToFirestore(err, {
          screenName: 'ExperienceCheckoutScreen',
          feature: 'InitCheckout',
          userId: state.user?.id,
          additionalData: {
            itemCount: cartItems.length
          }
        });
        const errMessage = err instanceof Error ? err.message : String(err);
        showError(errMessage || "Failed to initialize payment.");
        initRef.current = false; // Allow retry
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate('CategorySelection');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []); // Empty deps - only run once on mount

  // Early return AFTER all hooks are called
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return (
      <ErrorBoundary screenName="ExperienceCheckoutScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Home">
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Redirecting...</Text>
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  if (!state.user) {
    return (
      <ErrorBoundary screenName="ExperienceCheckoutScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Home">
        <LoginPrompt
          visible={showLoginPrompt}
          onClose={() => {
            // Simply close the modal - no navigation
            // User stays on the same page they were on
            closeLoginPrompt();
          }}
          message={loginMessage}
        />
      </MainScreen>
      </ErrorBoundary>
    );
  }

  if (loading) {
    return (
      <ErrorBoundary screenName="ExperienceCheckoutScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Home">
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <ChevronLeft color={colors.textPrimary} size={24} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Checkout</Text>
            <View style={styles.lockIcon}>
              <Lock color={colors.secondary} size={20} />
            </View>
          </View>
          <View style={{ flex: 1, paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl }}>
            <CheckoutSkeleton />
          </View>
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  if (!clientSecret || !paymentIntentId) {
    return (
      <ErrorBoundary screenName="ExperienceCheckoutScreen" userId={state.user?.id}>
      <MainScreen activeRoute="Home">
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Could not initialize payment.</Text>
          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <TouchableOpacity
              onPress={() => {
                // Retry: reset init flag and re-attempt initialization
                initRef.current = false;
                setLoading(true);
                setClientSecret(null);
                setPaymentIntentId(null);
                const retry = async () => {
                  try {
                    if (!cartItems || cartItems.length === 0) return;
                    initRef.current = true;
                    const list: Experience[] = [];
                    let total = 0;
                    for (const item of cartItems) {
                      const exp = await experienceService.getExperienceById(item.experienceId);
                      if (exp) { list.push(exp); total += exp.price * item.quantity; }
                    }
                    if (list.length === 0) {
                      showError('Could not load experiences for checkout.');
                      initRef.current = false;
                      return;
                    }
                    setCartExperiences(list);
                    setTotalAmount(total);
                    const firstExp = list[0];
                    const cartMetadata = cartItems.map((item) => {
                      const exp = list.find((e) => e.id === item.experienceId);
                      return { experienceId: item.experienceId, partnerId: exp?.partnerId || firstExp.partnerId, quantity: item.quantity };
                    });
                    const response = await stripeService.createPaymentIntent(
                      total, state.user?.id || '', state.user?.displayName || '',
                      firstExp.partnerId, cartMetadata, ''
                    );
                    setClientSecret(response.clientSecret);
                    setPaymentIntentId(response.paymentIntentId);
                  } catch (err: unknown) {
                    logger.error('Retry init failed:', err);
                    showError(err instanceof Error ? err.message : 'Failed to initialize payment.');
                    initRef.current = false;
                  } finally {
                    setLoading(false);
                  }
                };
                retry();
              }}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else navigation.navigate('CategorySelection');
            }} style={[styles.retryButton, { backgroundColor: colors.backgroundLight }]}>
              <Text style={[styles.retryButtonText, { color: colors.textSecondary }]}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </MainScreen>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="ExperienceCheckoutScreen" userId={state.user?.id}>
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: colors.secondary,
            colorBackground: colors.white,
            colorText: colors.textPrimary,
            colorDanger: colors.error,
            fontFamily: "system-ui, -apple-system, sans-serif",
            spacingUnit: "4px",
            borderRadius: "8px",
          },
        },
      }}
    >
      <CheckoutInner
        clientSecret={clientSecret}
        paymentIntentId={paymentIntentId}
        cartItems={cartItems}
        cartExperiences={cartExperiences}
        totalAmount={totalAmount}
        totalQuantity={totalQuantity}
        goalId={goalId}
      />
    </Elements>
    </ErrorBoundary>
  );
};

export default ExperienceCheckoutScreen;

// --- Styles (based on your original) ---
const createStyles = (colors: typeof Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingTop: Platform.OS === "ios" ? vh(50) : vh(40),
    paddingBottom: Spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xl,
    backgroundColor: colors.backgroundLight,
    justifyContent: "center",
    alignItems: "center",
  },
  backButtonDisabled: {
    opacity: 0.4,
  },
  headerTitle: {
    ...Typography.large,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "center",
  },
  lockIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xl,
    backgroundColor: colors.successLighter,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: { flex: 1, paddingHorizontal: Spacing.xl },

  summaryCard: {
    backgroundColor: colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginTop: Spacing.xl,
    marginBottom: Spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryLabel: {
    ...Typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  summaryTitle: {
    ...Typography.subheading,
    color: colors.textPrimary,
  },
  subtitle: { ...Typography.small, color: colors.textSecondary, marginTop: Spacing.xxs },
  quantityText: {
    marginTop: Spacing.xs,
    ...Typography.caption,
    color: colors.gray600,
  },
  priceLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.lg,
  },
  priceLabel: { ...Typography.subheading, color: colors.textSecondary, fontWeight: "600" },
  priceAmount: { ...Typography.heading3, fontWeight: "700", color: colors.secondary },

  section: { marginBottom: vh(24) },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionTitle: { ...Typography.heading3, fontWeight: "700", color: colors.textPrimary },
  sectionSubtitle: { ...Typography.small, color: colors.textSecondary, marginBottom: Spacing.md },

  paymentBox: {
    backgroundColor: colors.white,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xl,
  },
  securityText: { ...Typography.caption, color: colors.textSecondary, fontWeight: "500" },

  bottomBar: {
    position: "absolute",
    bottom: FOOTER_HEIGHT,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Platform.OS === "ios" ? Spacing.xxxl : Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  totalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  totalLabel: { ...Typography.subheading, color: colors.textSecondary, fontWeight: "600" },
  totalAmount: { ...Typography.display, fontWeight: "700", color: colors.textPrimary },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  loadingText: { marginTop: Spacing.md, ...Typography.subheading, color: colors.textSecondary },
  errorText: { ...Typography.heading3, color: colors.error, marginBottom: Spacing.lg },
  retryButton: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    backgroundColor: colors.secondary,
    borderRadius: BorderRadius.sm,
  },
  retryButtonText: { color: colors.white, ...Typography.subheading, fontWeight: "600" },
  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceFrosted,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  processingText: { marginTop: Spacing.md, ...Typography.subheading, color: colors.textSecondary, fontWeight: "500" },
});
