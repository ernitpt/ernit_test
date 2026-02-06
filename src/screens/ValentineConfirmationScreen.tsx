// screens/ValentineConfirmationScreen.tsx
// Confirmation screen after successful Valentine payment

import React from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Heart, Mail, ArrowRight, Home } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "../types";
import { useApp } from "../context/AppContext";
import { logger } from "../utils/logger";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "ValentineConfirmation">;

// Storage helpers (web + native)
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

const ValentineConfirmationScreen = () => {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute();
    const { state } = useApp();

    const params = route.params as { purchaserEmail: string; partnerEmail: string };
    const { purchaserEmail, partnerEmail } = params || { purchaserEmail: "", partnerEmail: "" };

    const handleRedeemCode = async () => {
        // Check if user is authenticated
        if (state.user?.id) {
            // User is authenticated - navigate directly to redemption
            logger.log("💘 User authenticated - navigating to redemption");
            navigation.navigate("RecipientFlow", {
                screen: "CouponEntry",
                params: {},
            } as any);
        } else {
            // User not authenticated - store redemption intent and navigate to auth
            logger.log("💘 User not authenticated - storing redemption intent");
            try {
                const redemptionIntent = JSON.stringify({
                    purchaserEmail,
                    partnerEmail,
                    timestamp: new Date().toISOString(),
                });
                await setStorageItem("pending_valentine_redemption", redemptionIntent);

                // Navigate to auth screen
                navigation.navigate("Auth");
            } catch (error) {
                logger.error("Error storing redemption intent:", error);
                // Fallback - still navigate to auth
                navigation.navigate("Auth");
            }
        }
    };

    const handleGoHome = () => {
        if (Platform.OS === "web" && typeof window !== "undefined") {
            window.location.href = "/";
        } else {
            navigation.navigate("Landing");
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Success Icon */}
                <View style={styles.iconContainer}>
                    <View style={styles.iconCircle}>
                        <Heart size={64} color="#FF6B9D" fill="#FF6B9D" />
                    </View>
                </View>

                {/* Success Message */}
                <Text style={styles.title}>Payment Successful! 🎉</Text>
                <Text style={styles.subtitle}>
                    Your Valentine's Challenge is ready!
                </Text>

                {/* Email Info Card */}
                <View style={styles.infoCard}>
                    <View style={styles.emailIconContainer}>
                        <Mail size={24} color="#8B5CF6" />
                    </View>

                    <Text style={styles.infoTitle}>Redemption Codes Sent</Text>
                    <Text style={styles.infoText}>
                        Unique redemption codes have been sent to:
                    </Text>

                    <View style={styles.emailsContainer}>
                        <View style={styles.emailRow}>
                            <View style={styles.emailDot} />
                            <Text style={styles.emailText}>{purchaserEmail}</Text>
                        </View>
                        <View style={styles.emailRow}>
                            <View style={styles.emailDot} />
                            <Text style={styles.emailText}>{partnerEmail}</Text>
                        </View>
                    </View>

                    <View style={styles.warningBox}>
                        <Text style={styles.warningText}>
                            📧 Check your email inboxes (including spam folders) for your unique redemption codes!
                        </Text>
                    </View>
                </View>

                {/* Next Steps Card */}
                <View style={styles.stepsCard}>
                    <Text style={styles.stepsTitle}>What's Next?</Text>

                    <View style={styles.step}>
                        <View style={styles.stepNumber}>
                            <Text style={styles.stepNumberText}>1</Text>
                        </View>
                        <Text style={styles.stepText}>Check your email for your redemption code</Text>
                    </View>

                    <View style={styles.step}>
                        <View style={styles.stepNumber}>
                            <Text style={styles.stepNumberText}>2</Text>
                        </View>
                        <Text style={styles.stepText}>Click "Redeem Code" below when you have your code</Text>
                    </View>

                    <View style={styles.step}>
                        <View style={styles.stepNumber}>
                            <Text style={styles.stepNumberText}>3</Text>
                        </View>
                        <Text style={styles.stepText}>Set your fitness goals together</Text>
                    </View>

                    <View style={styles.step}>
                        <View style={styles.stepNumber}>
                            <Text style={styles.stepNumberText}>4</Text>
                        </View>
                        <Text style={styles.stepText}>Start your Valentine's journey! 💪💕</Text>
                    </View>
                </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleRedeemCode}
                >
                    <Text style={styles.primaryButtonText}>Redeem Code</Text>
                    <ArrowRight size={20} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={handleGoHome}
                >
                    <Home size={20} color="#6B7280" />
                    <Text style={styles.secondaryButtonText}>Back to Home</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F9FAFB",
    },
    scrollContent: {
        paddingTop: 40,
        paddingHorizontal: 20,
        paddingBottom: 160,
    },
    iconContainer: {
        alignItems: "center",
        marginBottom: 24,
    },
    iconCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: "#FFF0F6",
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#FF6B9D",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 5,
    },
    title: {
        fontSize: 28,
        fontWeight: "800",
        color: "#111827",
        textAlign: "center",
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: "#6B7280",
        textAlign: "center",
        marginBottom: 32,
    },
    infoCard: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 24,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    emailIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: "#F3E8FF",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 16,
        alignSelf: "center",
    },
    infoTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: "#111827",
        textAlign: "center",
        marginBottom: 8,
    },
    infoText: {
        fontSize: 14,
        color: "#6B7280",
        textAlign: "center",
        marginBottom: 16,
    },
    emailsContainer: {
        backgroundColor: "#F9FAFB",
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    emailRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
    },
    emailDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: "#FF6B9D",
        marginRight: 12,
    },
    emailText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#111827",
        flex: 1,
    },
    warningBox: {
        backgroundColor: "#FFF7ED",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: "#FDBA74",
    },
    warningText: {
        fontSize: 14,
        color: "#9A3412",
        textAlign: "center",
        lineHeight: 20,
    },
    stepsCard: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    stepsTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#111827",
        marginBottom: 20,
    },
    step: {
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: 16,
    },
    stepNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: "#FF6B9D",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    stepNumberText: {
        fontSize: 14,
        fontWeight: "700",
        color: "#fff",
    },
    stepText: {
        flex: 1,
        fontSize: 14,
        color: "#374151",
        lineHeight: 20,
        marginTop: 4,
    },
    footer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "#fff",
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: "#E5E7EB",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 5,
    },
    primaryButton: {
        backgroundColor: "#FF6B9D",
        borderRadius: 12,
        paddingVertical: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
        shadowColor: "#FF6B9D",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    primaryButtonText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "700",
        marginRight: 8,
    },
    secondaryButton: {
        backgroundColor: "#F3F4F6",
        borderRadius: 12,
        paddingVertical: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    secondaryButtonText: {
        color: "#6B7280",
        fontSize: 16,
        fontWeight: "600",
        marginLeft: 8,
    },
});

export default ValentineConfirmationScreen;
