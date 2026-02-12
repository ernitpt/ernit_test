import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    Alert,
    StyleSheet,
    ActivityIndicator,
    ScrollView,
    Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Heart, ChevronLeft } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "../types";
import { stripeService } from "../services/stripeService";
import { logger } from "../utils/logger";
import { db } from "../services/firebase";
import { collection, query, where, getDocs, limit, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ValentineCheckoutSkeleton } from "../components/SkeletonLoader";

const stripePromise = loadStripe(process.env.EXPO_PUBLIC_STRIPE_PK!);

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "ValentineCheckout">;

type CheckoutInnerProps = {
    clientSecret: string;
    paymentIntentId: string;
    navigationProp: NavigationProp;
    valentineData: any;
    totalAmount: number;
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

// Inner checkout component with Stripe Elements
const CheckoutInner: React.FC<CheckoutInnerProps> = ({
    clientSecret,
    paymentIntentId,
    navigationProp,
    valentineData,
    totalAmount,
}) => {
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
                const pendingPayment = await getStorageItem(`pending_valentine_${clientSecret}`);
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
                    Alert.alert(
                        "Payment Verification Failed",
                        "Could not verify payment. Please contact support if payment was deducted."
                    );
                    setIsCheckingRedirect(false);
                    return;
                }

                if (paymentIntent?.status === "succeeded") {
                    logger.log("💘 Payment succeeded after redirect!");

                    await removeStorageItem(`pending_valentine_${clientSecret}`);

                    if (Platform.OS === "web" && typeof window !== "undefined") {
                        window.history.replaceState({}, document.title, window.location.pathname);
                    }

                    // Navigate to confirmation screen
                    navigationProp.navigate("ValentineConfirmation", {
                        purchaserEmail: valentineData.purchaserEmail,
                        partnerEmail: valentineData.partnerEmail,
                        paymentIntentId,
                    });
                } else if (paymentIntent?.status === "processing") {
                    Alert.alert(
                        "Payment Processing",
                        "Your payment is being processed. You will receive confirmation shortly."
                    );
                } else if (paymentIntent?.status === "requires_action") {
                    Alert.alert(
                        "Action Required",
                        "Additional action is required to complete your payment."
                    );
                }
            } catch (err: any) {
                logger.error("Error handling redirect return:", err);
                Alert.alert("Error", "Failed to verify payment status. Please contact support.");
            } finally {
                setIsCheckingRedirect(false);
            }
        };

        const timer = setTimeout(() => checkRedirectReturn(), 500);
        return () => clearTimeout(timer);
    }, [stripe, clientSecret, navigationProp, valentineData]);

    const handlePayment = async () => {
        if (!stripe || !elements) {
            Alert.alert("Error", "Payment system not ready");
            return;
        }

        setIsProcessing(true);
        await setStorageItem(`pending_valentine_${clientSecret}`, "true");

        try {
            logger.log("💳 Confirming Valentine payment...");

            const { error, paymentIntent } = await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url: Platform.OS === "web" ? window.location.href : "https://ernit-nine.vercel.app/",
                },
                redirect: "if_required",
            });

            if (error) throw error;
            if (!paymentIntent) throw new Error("No payment intent returned.");

            if (paymentIntent.status === "succeeded") {
                logger.log("💘 Payment succeeded immediately!");

                await removeStorageItem(`pending_valentine_${clientSecret}`);

                // Navigate to confirmation screen
                navigationProp.navigate("ValentineConfirmation", {
                    purchaserEmail: valentineData.purchaserEmail,
                    partnerEmail: valentineData.partnerEmail,
                    paymentIntentId,
                });
            } else if (paymentIntent.status === "processing") {
                Alert.alert(
                    "Payment Processing",
                    "Your payment is being processed. You will receive confirmation shortly."
                );
            }
            // If redirect happens, the useEffect above will handle it
        } catch (err: any) {
            await removeStorageItem(`pending_valentine_${clientSecret}`);
            const errorMessage = err.message || "Something went wrong.";
            Alert.alert("Payment Failed", errorMessage);
            logger.error("Payment error:", err);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Loading overlay for redirect verification */}
            {isCheckingRedirect && (
                <View style={styles.processingOverlay}>
                    <ActivityIndicator color="#FF6B9D" size="large" />
                    <Text style={styles.processingText}>Verifying payment...</Text>
                </View>
            )}

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigationProp.goBack()} style={styles.backButton}>
                    <ChevronLeft color="#111" size={24} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Complete Purchase</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Valentine Summary Card */}
                <View style={styles.summaryCard}>
                    <View style={styles.heartIcon}>
                        <Heart size={32} color="#FF6B9D" fill="#FF6B9D" />
                    </View>
                    <Text style={styles.summaryTitle}>Valentine's Challenge</Text>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Email:</Text>
                        <Text style={styles.detailValue}>{valentineData.purchaserEmail}</Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Goal:</Text>
                        <Text style={styles.detailValue}>{valentineData.goalType}</Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Duration:</Text>
                        <Text style={styles.detailValue}>
                            {valentineData.weeks} weeks, {valentineData.sessionsPerWeek}x/week
                        </Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Mode:</Text>
                        <Text style={styles.detailValue}>
                            {valentineData.mode === "secret" ? "🎁 Secret" : "👁️ Revealed"}
                        </Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Total:</Text>
                        <Text style={styles.totalValue}>€{(totalAmount).toFixed(2)}</Text>
                    </View>
                </View>

                {/* Payment Element */}
                <View style={styles.paymentSection}>
                    <Text style={styles.sectionTitle}>Payment Information</Text>
                    <View style={styles.paymentElement}>
                        <PaymentElement />
                    </View>
                </View>

                {/* Info Text */}
                <Text style={styles.infoText}>
                    💌 After payment, both redemption codes will be sent to your email. Share your partner's code with them to get started!
                </Text>
            </ScrollView>

            {/* Pay Button */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.payButton, isProcessing && styles.payButtonDisabled]}
                    onPress={handlePayment}
                    disabled={isProcessing || !stripe || !elements}
                >
                    {isProcessing ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.payButtonText}>Pay €{(totalAmount).toFixed(2)}</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
};

// Main component
const ValentineCheckoutScreen = () => {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute();

    const params = route.params as { valentineData: any; totalAmount: number };
    const { valentineData, totalAmount } = params || {};

    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const createPaymentIntent = async () => {
            if (!valentineData || !totalAmount) {
                Alert.alert("Error", "Missing payment information");
                navigation.goBack();
                return;
            }

            try {
                logger.log("💘 Creating Valentine payment intent...");

                const result = await stripeService.createValentinePaymentIntent(totalAmount, "eur", {
                    type: "valentine_challenge",
                    purchaserEmail: valentineData.purchaserEmail,
                    partnerEmail: valentineData.partnerEmail,
                    experienceId: valentineData.experienceId,
                    experiencePrice: valentineData.experiencePrice.toString(),
                    mode: valentineData.mode,
                    goalType: valentineData.goalType,
                    weeks: valentineData.weeks.toString(),
                    sessionsPerWeek: valentineData.sessionsPerWeek.toString(),
                });

                setClientSecret(result.clientSecret);
                setPaymentIntentId(result.paymentIntentId);

                // 📧 Save lead data to Firestore (even if payment not completed)
                try {
                    await setDoc(doc(db, "valentineLeads", result.paymentIntentId), {
                        paymentIntentId: result.paymentIntentId,
                        purchaserEmail: valentineData.purchaserEmail,
                        partnerEmail: valentineData.partnerEmail || "",
                        experienceId: valentineData.experienceId,
                        experiencePrice: valentineData.experiencePrice,
                        totalAmount: totalAmount,
                        goalType: valentineData.goalType,
                        weeks: valentineData.weeks,
                        sessionsPerWeek: valentineData.sessionsPerWeek,
                        mode: valentineData.mode,
                        paymentCompleted: false,
                        createdAt: serverTimestamp(),
                        completedAt: null,
                    });
                    logger.log("✅ Valentine lead saved to Firestore");
                } catch (leadError) {
                    logger.error("Failed to save Valentine lead:", leadError);
                    // Don't block the flow if lead saving fails
                }
            } catch (error: any) {
                logger.error("Error creating payment intent:", error);
                Alert.alert("Error", error.message || "Failed to initialize payment");
                navigation.goBack();
            } finally {
                setIsLoading(false);
            }
        };

        createPaymentIntent();
    }, []);

    if (isLoading || !clientSecret) {
        return <ValentineCheckoutSkeleton />;
    }

    return (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CheckoutInner
                clientSecret={clientSecret}
                paymentIntentId={paymentIntentId!}
                navigationProp={navigation}
                valentineData={valentineData}
                totalAmount={totalAmount}
            />
        </Elements>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F9FAFB",
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#F9FAFB",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "ios" ? 60 : 20,
        paddingBottom: 16,
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#E5E7EB",
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#111",
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 24,
    },
    summaryCard: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    heartIcon: {
        alignSelf: "center",
        marginBottom: 12,
    },
    summaryTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: "#111",
        textAlign: "center",
        marginBottom: 20,
    },
    detailRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    detailLabel: {
        fontSize: 14,
        color: "#6B7280",
    },
    detailValue: {
        fontSize: 14,
        fontWeight: "600",
        color: "#111",
        flex: 1,
        textAlign: "right",
    },
    divider: {
        height: 1,
        backgroundColor: "#E5E7EB",
        marginVertical: 16,
    },
    totalRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    totalLabel: {
        fontSize: 18,
        fontWeight: "700",
        color: "#111",
    },
    totalValue: {
        fontSize: 24,
        fontWeight: "800",
        color: "#FF6B9D",
    },
    paymentSection: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#111",
        marginBottom: 12,
    },
    paymentElement: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 16,
    },
    infoText: {
        fontSize: 14,
        color: "#6B7280",
        textAlign: "center",
        lineHeight: 20,
        paddingHorizontal: 16,
    },
    footer: {
        padding: 16,
        backgroundColor: "#fff",
        borderTopWidth: 1,
        borderTopColor: "#E5E7EB",
    },
    payButton: {
        backgroundColor: "#FF6B9D",
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: "center",
        shadowColor: "#FF6B9D",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    payButtonDisabled: {
        backgroundColor: "#D1D5DB",
        shadowOpacity: 0,
    },
    payButtonText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "700",
    },
    processingOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 999,
    },
    processingText: {
        marginTop: 16,
        fontSize: 16,
        fontWeight: "600",
        color: "#fff",
    },
});

export default ValentineCheckoutScreen;
