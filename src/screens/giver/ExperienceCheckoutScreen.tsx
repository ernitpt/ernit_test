// screens/ExperienceCheckoutScreen.tsx
// ✅ Final version: supports multiple gifts via cartItems, with personal message

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
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
import { useApp } from "../../context/AppContext";
import { useAuthGuard } from "../../hooks/useAuthGuard";
import LoginPrompt from "../../components/LoginPrompt";
import MainScreen from "../MainScreen";

const stripePromise = loadStripe(process.env.EXPO_PUBLIC_STRIPE_PK!);

type NavigationProp = NativeStackNavigationProp<GiverStackParamList, "ExperienceCheckout">;

type CheckoutInnerProps = {
  clientSecret: string;
  paymentIntentId: string;
  cartItems: CartItem[];
  cartExperiences: Experience[];
  totalAmount: number;
  totalQuantity: number;
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
    const response = await fetch(
      `https://europe-west1-ernit-3fc0b.cloudfunctions.net/getGiftsByPaymentIntent_Test?paymentIntentId=${paymentIntentId}`
    );
    if (!response.ok) return [];

    const gifts = await response.json();
    console.log('gifts', gifts)
    if (!Array.isArray(gifts)) return [];

    return gifts.map((gift: any) => ({
      ...gift,
      createdAt: new Date(gift.createdAt),
      deliveryDate: new Date(gift.deliveryDate),
      updatedAt: new Date(gift.updatedAt),
    }));
  } catch (error) {
    console.error("Error checking gifts:", error);
    return [];
  }
};

// --- Poll for multiple gifts (for cart / Buy Now with quantity > 1) ---
const pollForGifts = async (
  paymentIntentId: string,
  expectedCount: number,
  maxAttempts: number = 12,
  delayMs: number = 1000
): Promise<ExperienceGift[]> => {
  for (let i = 0; i < maxAttempts; i++) {
    const gifts = await checkGiftCreation(paymentIntentId);

    if (gifts.length === expectedCount) {
      return gifts;
    }

    await new Promise((res) => setTimeout(res, delayMs));
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
}) => {
  const navigation = useNavigation<NavigationProp>();
  const { dispatch } = useApp();

  const stripe = useStripe();
  const elements = useElements();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isCheckingRedirect, setIsCheckingRedirect] = useState(false);

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
          console.error("Error retrieving payment intent:", error);
          Alert.alert(
            "Payment Verification Failed",
            "Could not verify payment. Please contact support if payment was deducted."
          );
          setIsCheckingRedirect(false);
          return;
        }

        if (paymentIntent?.status === "succeeded") {
          console.log("💰 Payment succeeded after redirect, checking gifts...");
          const gifts = await pollForGifts(paymentIntent.id, totalQuantity);

          if (gifts.length === 1) {
            dispatch({ type: "SET_EXPERIENCE_GIFT", payload: gifts[0] });
            dispatch({ type: "CLEAR_CART" }); // ✅ Clear cart after successful purchase
            await removeStorageItem(`pending_payment_${clientSecret}`);

            if (Platform.OS === "web" && typeof window !== "undefined") {
              window.history.replaceState({}, document.title, window.location.pathname);
            }

            Alert.alert("Success", "Your payment was processed successfully!");
            navigation.navigate("Confirmation", { experienceGift: gifts[0] });
          } else if (gifts.length > 1) {
            dispatch({ type: "CLEAR_CART" }); // ✅ Clear cart after successful purchase
            await removeStorageItem(`pending_payment_${clientSecret}`);
            if (Platform.OS === "web" && typeof window !== "undefined") {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            navigation.navigate("ConfirmationMultiple", { experienceGifts: gifts });
          } else {
            console.warn("⚠️ Gifts not found after polling");
            Alert.alert(
              "Payment Processed",
              "Your payment was successful. Your gifts are being prepared and will be available shortly."
            );
          }
        } else if (paymentIntent?.status === "processing") {
          Alert.alert(
            "Payment Processing",
            "Your payment is being processed. You will receive a confirmation shortly."
          );
        } else if (paymentIntent?.status === "requires_action") {
          Alert.alert(
            "Action Required",
            "Additional action is required to complete your payment."
          );
        }
      } catch (err: any) {
        console.error("Error handling redirect return:", err);
        Alert.alert("Error", "Failed to verify payment status. Please contact support.");
      } finally {
        setIsCheckingRedirect(false);
      }
    };

    const timer = setTimeout(() => checkRedirectReturn(), 500);
    return () => clearTimeout(timer);
  }, [stripe, clientSecret, navigation, dispatch, totalQuantity]);

  const handlePurchase = async () => {
    if (!stripe || !elements) {
      Alert.alert("Stripe not ready", "Please wait a few seconds and try again.");
      return;
    }

    setIsProcessing(true);
    await setStorageItem(`pending_payment_${clientSecret}`, "true");

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url:
            Platform.OS === "web"
              ? window.location.href
              : "https://ernit-nine.vercel.app/payment-success",
        },
        redirect: "if_required",
      });

      if (error) throw error;
      if (!paymentIntent) throw new Error("No payment intent returned.");

      if (paymentIntent.status === "succeeded") {
        console.log("💰 Payment succeeded immediately, checking gifts...");
        const gifts = await pollForGifts(paymentIntent.id, totalQuantity);

        if (gifts.length === 1) {
          dispatch({ type: "SET_EXPERIENCE_GIFT", payload: gifts[0] });
          dispatch({ type: "CLEAR_CART" }); // ✅ Clear cart after successful purchase
          await removeStorageItem(`pending_payment_${clientSecret}`);
          Alert.alert("Success", "Your payment was processed successfully!");
          navigation.navigate("Confirmation", { experienceGift: gifts[0] });
        } else if (gifts.length > 1) {
          dispatch({ type: "CLEAR_CART" }); // ✅ Clear cart after successful purchase
          await removeStorageItem(`pending_payment_${clientSecret}`);
          navigation.navigate("ConfirmationMultiple", { experienceGifts: gifts });
        } else {
          console.warn("⚠️ Gifts not found after polling");
          Alert.alert(
            "Payment Processed",
            "Your payment was successful. Your gifts are being prepared and will be available shortly."
          );
        }
      } else if (paymentIntent.status === "processing") {
        Alert.alert(
          "Payment Processing",
          "Your payment is being processed. You will receive confirmation shortly."
        );
      }
      // If redirect happens, the useEffect above will handle it
    } catch (err: any) {
      await removeStorageItem(`pending_payment_${clientSecret}`);
      const errorMessage = err.message || "Something went wrong.";
      Alert.alert("Payment Failed", errorMessage);
      console.error("Payment error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <MainScreen activeRoute="Home">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <ChevronLeft color="#111827" size={24} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Checkout</Text>
            <View style={styles.lockIcon}>
              <Lock color="#10b981" size={20} />
            </View>
          </View>

          {(isCheckingRedirect || isProcessing) && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator color="#8b5cf6" size="large" />
              <Text style={styles.processingText}>
                {isCheckingRedirect ? "Verifying payment..." : "Processing payment..."}
              </Text>
            </View>
          )}

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
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
                <CreditCard color="#8b5cf6" size={20} />
                <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>Payment Details</Text>
              </View>
              <View style={styles.paymentBox}>
                <PaymentElement />
              </View>
            </View>

            {/* Security note */}
            <View style={styles.securityNotice}>
              <Lock color="#6b7280" size={16} />
              <Text style={styles.securityText}>
                Your payment information is encrypted and secure
              </Text>
            </View>

            <View style={{ height: 120 }} />
          </ScrollView>

          {/* Bottom CTA */}
          <View style={styles.bottomBar}>
            <View style={styles.totalSection}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalAmount}>€{totalAmount.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.payButton, isProcessing && styles.payButtonDisabled]}
              onPress={handlePurchase}
              disabled={isProcessing}
              activeOpacity={0.8}
            >
              {isProcessing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.payButtonText}>Complete Purchase</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </MainScreen>
  );
};

// ========== OUTER WRAPPER (creates PaymentIntent & <Elements>) ==========
const ExperienceCheckoutScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();
  const { requireAuth, showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();

  const { cartItems } = route.params as { cartItems: CartItem[] };

  // Require authentication for checkout
  useEffect(() => {
    if (!state.user) {
      requireAuth("Please log in to proceed to checkout.");
    }
  }, [state.user, requireAuth]);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [cartExperiences, setCartExperiences] = useState<Experience[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);

  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const init = async () => {
      try {
        if (!cartItems || cartItems.length === 0) {
          Alert.alert("Error", "Your cart is empty.");
          navigation.goBack();
          return;
        }

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
          Alert.alert("Error", "Could not load experiences for checkout.");
          navigation.goBack();
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
          "" // personalized message will be added on confirmation screen
        );

        setClientSecret(response.clientSecret);
        setPaymentIntentId(response.paymentIntentId);
      } catch (err: any) {
        console.error("Error creating payment intent:", err);
        Alert.alert("Error", err.message || "Failed to initialize payment.");
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [cartItems, navigation, state.user]);

  if (!state.user) {
    return (
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
    );
  }

  if (loading) {
    return (
      <MainScreen activeRoute="Home">
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#8b5cf6" size="large" />
          <Text style={styles.loadingText}>Setting up checkout...</Text>
        </View>
      </MainScreen>
    );
  }

  if (!clientSecret || !paymentIntentId) {
    return (
      <MainScreen activeRoute="Home">
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Could not initialize payment.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </MainScreen>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#8b5cf6",
            colorBackground: "#ffffff",
            colorText: "#111827",
            colorDanger: "#ef4444",
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
      />
    </Elements>
  );
};

export default ExperienceCheckoutScreen;

// --- Styles (based on your original) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 50 : 40,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
    textAlign: "center",
  },
  lockIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0fdf4",
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: { flex: 1, paddingHorizontal: 20 },

  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  summaryInfo: {
    flex: 1,
    marginRight: 12,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  subtitle: { fontSize: 14, color: "#6b7280", marginTop: 2 },
  quantityText: {
    marginTop: 4,
    fontSize: 13,
    color: "#4b5563",
  },
  priceLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
  },
  priceLabel: { fontSize: 16, color: "#6b7280", fontWeight: "600" },
  priceAmount: { fontSize: 18, fontWeight: "700", color: "#8b5cf6" },

  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  sectionSubtitle: { fontSize: 14, color: "#6b7280", marginBottom: 12 },

  paymentBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  securityNotice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    marginBottom: 20,
  },
  securityText: { fontSize: 13, color: "#6b7280", fontWeight: "500" },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  totalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  totalLabel: { fontSize: 16, color: "#6b7280", fontWeight: "600" },
  totalAmount: { fontSize: 28, fontWeight: "700", color: "#111827" },
  payButton: {
    backgroundColor: "#8b5cf6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#8b5cf6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  payButtonDisabled: { opacity: 0.6 },
  payButtonText: { color: "#fff", fontSize: 18, fontWeight: "700" },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  loadingText: { marginTop: 12, fontSize: 16, color: "#6b7280" },
  errorText: { fontSize: 18, color: "#ef4444", marginBottom: 16 },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#8b5cf6",
    borderRadius: 8,
  },
  retryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  processingText: { marginTop: 12, fontSize: 16, color: "#6b7280", fontWeight: "500" },
});
