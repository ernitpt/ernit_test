// screens/ValentineConfirmationScreen.tsx
// Confirmation screen after successful Valentine payment — shows both coupons with share

import React, { useEffect, useRef, useState } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Platform,
    Share,
    Animated,
    ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import {
    Heart,
    Copy,
    ArrowRight,
    Home,
    CheckCircle,
    Gift,
    Users,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "../types";
import { useApp } from "../context/AppContext";
import { logger } from "../utils/logger";
import { db } from "../services/firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

type NavigationProp = NativeStackNavigationProp<
    RootStackParamList,
    "ValentineConfirmation"
>;

// Storage helpers (web + native)
const setStorageItem = async (key: string, value: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
        localStorage.setItem(key, value);
    } else {
        await AsyncStorage.setItem(key, value);
    }
};

// Skeleton loader for coupon cards
const CouponSkeleton = () => (
    <View style={styles.couponCard}>
        <View style={styles.couponHeader}>
            <View style={[styles.skeletonBox, { width: 120, height: 14 }]} />
        </View>
        <View style={styles.codeDisplay}>
            <View style={[styles.skeletonBox, { width: 200, height: 32 }]} />
        </View>
        <View style={styles.couponActions}>
            <View style={[styles.skeletonBox, { flex: 1, height: 48, borderRadius: 10 }]} />
            <View style={[styles.skeletonBox, { flex: 1, height: 48, borderRadius: 10 }]} />
        </View>
    </View>
);

const ValentineConfirmationScreen = () => {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute();
    const { state } = useApp();

    const params = route.params as {
        purchaserEmail: string;
        partnerEmail: string;
        paymentIntentId: string;
    };
    const { purchaserEmail, partnerEmail, paymentIntentId } = params || {
        purchaserEmail: "",
        partnerEmail: "",
        paymentIntentId: "",
    };

    // State
    const [challenge, setChallenge] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    // Animations
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const cardAnim = useRef(new Animated.Value(0)).current;

    // Poll Firestore for the challenge document (webhook creates it async)
    useEffect(() => {
        let attempts = 0;
        const maxAttempts = 20;
        const pollInterval = 2000;
        let timeoutId: NodeJS.Timeout | null = null;
        let cancelled = false;

        const pollForChallenge = async () => {
            if (cancelled) return true;

            try {
                const q = query(
                    collection(db, "valentineChallenges"),
                    where("paymentIntentId", "==", paymentIntentId),
                    limit(1)
                );
                const snapshot = await getDocs(q);

                if (!snapshot.empty) {
                    const doc = snapshot.docs[0];
                    if (!cancelled) {
                        setChallenge({ id: doc.id, ...doc.data() });
                        setIsLoading(false);
                    }
                    return true;
                }
            } catch (error) {
                logger.error("Error polling for valentine challenge:", error);
            }

            attempts++;
            if (attempts >= maxAttempts) {
                if (!cancelled) {
                    setIsLoading(false);
                }
                return true;
            }
            return false;
        };

        const poll = async () => {
            const found = await pollForChallenge();
            if (!found && !cancelled) {
                timeoutId = setTimeout(poll, pollInterval);
            }
        };

        if (paymentIntentId) {
            poll();
        } else {
            setIsLoading(false);
        }

        // Cleanup on unmount
        return () => {
            cancelled = true;
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, [paymentIntentId]);

    // Success animation
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

    // Card entrance animation when data loads
    useEffect(() => {
        if (!isLoading) {
            // Always animate when loading finishes, regardless of challenge status
            // This prevents white screen when polling times out
            Animated.spring(cardAnim, {
                toValue: 1,
                tension: 40,
                friction: 8,
                useNativeDriver: true,
            }).start();
        }
    }, [isLoading]);

    const handleCopyCode = async (code: string) => {
        await Clipboard.setStringAsync(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const handleShareCode = async (code: string, isForPartner: boolean) => {
        try {
            await Share.share({
                title: "Valentine's Challenge Code",
                message: `Hey! Here's ${isForPartner ? "your" : "my"} Valentine's Challenge redemption code for Ernit:\n\n${code}\n\nRedeem it at https://ernit.app to set up your goals and start the challenge together!\n\nEarn it. Unlock it. Enjoy it`,
            });
        } catch (error: any) {
            logger.error("Share error:", error);
        }
    };

    const handleRedeemCode = async () => {
        if (state.user?.id) {
            logger.log("User authenticated - navigating to redemption");
            navigation.navigate("RecipientFlow", {
                screen: "CouponEntry",
                params: {},
            } as any);
        } else {
            logger.log("User not authenticated - storing redemption intent");
            try {
                const redemptionIntent = JSON.stringify({
                    purchaserEmail,
                    partnerEmail,
                    timestamp: new Date().toISOString(),
                });
                await setStorageItem(
                    "pending_valentine_redemption",
                    redemptionIntent
                );
                navigation.navigate("Auth");
            } catch (error) {
                logger.error("Error storing redemption intent:", error);
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

    const renderCouponCard = (
        label: string,
        email: string,
        code: string | null,
        isForPartner: boolean
    ) => {
        if (!code) return <CouponSkeleton />;

        const isCopied = copiedCode === code;

        return (
            <View style={styles.couponCard}>
                <View style={styles.couponHeader}>
                    <View style={[styles.couponIconCircle, isForPartner && styles.couponIconCirclePartner]}>
                        {isForPartner ? (
                            <Heart color="#FF6B9D" size={16} fill="#FF6B9D" />
                        ) : (
                            <Gift color="#8B5CF6" size={16} />
                        )}
                    </View>
                    <View style={styles.couponHeaderText}>
                        <Text style={styles.couponLabel}>{label}</Text>
                        {email ? <Text style={styles.couponEmail} numberOfLines={1}>{email}</Text> : null}
                    </View>
                </View>

                <View style={styles.codeDisplay}>
                    <Text style={styles.codeText}>{code}</Text>
                </View>

                <View style={styles.couponActions}>
                    <TouchableOpacity
                        style={styles.copyButton}
                        onPress={() => handleCopyCode(code)}
                        activeOpacity={0.7}
                    >
                        <Copy
                            color={isCopied ? "#10b981" : "#8B5CF6"}
                            size={18}
                        />
                        <Text
                            style={[
                                styles.copyButtonText,
                                isCopied && styles.copiedText,
                            ]}
                        >
                            {isCopied ? "Copied!" : "Copy"}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.shareButton}
                        onPress={() => handleShareCode(code, isForPartner)}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.shareButtonText}>Share</Text>
                        <ArrowRight color="#fff" size={18} />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Success Header */}
                <View style={styles.heroSection}>
                    <Animated.View
                        style={[
                            styles.iconCircle,
                            {
                                transform: [{ scale: scaleAnim }],
                                opacity: fadeAnim,
                            },
                        ]}
                    >
                        <CheckCircle color="#10b981" size={64} strokeWidth={2.5} />
                    </Animated.View>

                    <Animated.View style={{ opacity: fadeAnim }}>
                        <Text style={styles.title}>Payment Successful!</Text>
                        <Text style={styles.subtitle}>
                            Your Valentine's Challenge is ready to share
                        </Text>
                    </Animated.View>
                </View>

                {/* Coupon Cards */}
                <Animated.View
                    style={{
                        opacity: isLoading ? 1 : cardAnim,
                        transform: [
                            {
                                translateY: isLoading
                                    ? 0
                                    : cardAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [20, 0],
                                    }),
                            },
                        ],
                    }}
                >
                    <View style={styles.couponsSection}>
                        <View style={styles.couponsSectionHeader}>
                            <Users color="#FF6B9D" size={20} />
                            <Text style={styles.couponsSectionTitle}>
                                Your Challenge Codes
                            </Text>
                        </View>
                        <Text style={styles.couponsSectionDesc}>
                            Share these codes to get started. Each person redeems their own code.
                        </Text>

                        {isLoading ? (
                            <>
                                <CouponSkeleton />
                                <CouponSkeleton />
                                <View style={styles.loadingHint}>
                                    <ActivityIndicator
                                        size="small"
                                        color="#FF6B9D"
                                    />
                                    <Text style={styles.loadingHintText}>
                                        Generating your codes...
                                    </Text>
                                </View>
                            </>
                        ) : challenge ? (
                            <>
                                {renderCouponCard(
                                    "Your Code",
                                    purchaserEmail,
                                    challenge.purchaserCode,
                                    false
                                )}
                                {renderCouponCard(
                                    "Partner's Code",
                                    "",
                                    challenge.partnerCode,
                                    true
                                )}
                            </>
                        ) : (
                            <View style={styles.errorCard}>
                                <Text style={styles.errorTitle}>
                                    Codes are on the way!
                                </Text>
                                <Text style={styles.errorText}>
                                    Your codes are being generated. Check your
                                    email at {purchaserEmail} shortly for both
                                    redemption codes.
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Email Notification */}
                    <View style={styles.emailNotice}>
                        <Text style={styles.emailNoticeIcon}>📧</Text>
                        <Text style={styles.emailNoticeText}>
                            Both codes have also been sent to{" "}
                            <Text style={styles.emailNoticeHighlight}>
                                {purchaserEmail}
                            </Text>
                        </Text>
                    </View>

                    {/* How It Works */}
                    <View style={styles.stepsCard}>
                        <Text style={styles.stepsTitle}>How It Works</Text>

                        {[
                            {
                                step: "1",
                                title: "Share the Codes",
                                desc: "Send your partner their code above",
                            },
                            {
                                step: "2",
                                title: "Both Redeem",
                                desc: "Each of you signs up and enters your code",
                            },
                            {
                                step: "3",
                                title: "Set Goals Together",
                                desc: "Choose your weekly fitness goals",
                            },
                            {
                                step: "4",
                                title: "Earn the Reward",
                                desc: "Complete goals together to unlock your experience",
                            },
                        ].map((item, index) => (
                            <View key={index} style={styles.stepItem}>
                                <View style={styles.stepIndicator}>
                                    <View style={styles.stepCircle}>
                                        <Text style={styles.stepNumber}>
                                            {item.step}
                                        </Text>
                                    </View>
                                    {index < 3 && (
                                        <View style={styles.stepLine} />
                                    )}
                                </View>
                                <View style={styles.stepContent}>
                                    <Text style={styles.stepTitle}>
                                        {item.title}
                                    </Text>
                                    <Text style={styles.stepDesc}>
                                        {item.desc}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </Animated.View>

                <View style={{ height: 120 }} />
            </ScrollView>

            {/* Fixed Footer */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleRedeemCode}
                    activeOpacity={0.8}
                >
                    <Text style={styles.primaryButtonText}>
                        Redeem Your Code
                    </Text>
                    <ArrowRight size={20} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={handleGoHome}
                    activeOpacity={0.7}
                >
                    <Home size={18} color="#6B7280" />
                    <Text style={styles.secondaryButtonText}>
                        Back to Home
                    </Text>
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
        paddingBottom: 160,
    },
    heroSection: {
        backgroundColor: "#fff",
        paddingTop: Platform.OS === "ios" ? 60 : 50,
        paddingBottom: 32,
        paddingHorizontal: 24,
        alignItems: "center",
    },
    iconCircle: {
        marginBottom: 24,
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
        lineHeight: 24,
    },
    couponsSection: {
        marginHorizontal: 20,
        marginTop: 24,
    },
    couponsSectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 6,
    },
    couponsSectionTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: "#111827",
    },
    couponsSectionDesc: {
        fontSize: 14,
        color: "#6B7280",
        marginBottom: 16,
        lineHeight: 20,
    },
    couponCard: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 20,
        marginBottom: 14,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    couponHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },
    couponIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#F5F3FF",
        justifyContent: "center",
        alignItems: "center",
    },
    couponIconCirclePartner: {
        backgroundColor: "#FFF0F6",
    },
    couponHeaderText: {
        marginLeft: 12,
        flex: 1,
    },
    couponLabel: {
        fontSize: 12,
        fontWeight: "700",
        color: "#8B5CF6",
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    couponEmail: {
        fontSize: 13,
        color: "#6B7280",
        marginTop: 2,
    },
    codeDisplay: {
        backgroundColor: "#F9FAFB",
        paddingVertical: 18,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: "#E5E7EB",
        borderStyle: "dashed",
    },
    codeText: {
        fontSize: 24,
        fontWeight: "800",
        color: "#FF6B9D",
        textAlign: "center",
        letterSpacing: 4,
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    couponActions: {
        flexDirection: "row",
        gap: 12,
    },
    copyButton: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: "#F5F3FF",
        paddingVertical: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#E9D5FF",
    },
    copyButtonText: {
        fontSize: 15,
        fontWeight: "600",
        color: "#8B5CF6",
    },
    copiedText: {
        color: "#10b981",
    },
    shareButton: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: "#FF6B9D",
        paddingVertical: 14,
        borderRadius: 10,
    },
    shareButtonText: {
        fontSize: 15,
        fontWeight: "600",
        color: "#fff",
    },
    emailNotice: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: "#FFF0F6",
        marginHorizontal: 20,
        marginTop: 10,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#FECDD3",
    },
    emailNoticeIcon: {
        fontSize: 18,
    },
    emailNoticeText: {
        fontSize: 13,
        color: "#9F1239",
        lineHeight: 18,
        flex: 1,
        fontWeight: "500",
    },
    emailNoticeHighlight: {
        fontWeight: "700",
    },
    stepsCard: {
        marginHorizontal: 20,
        marginTop: 24,
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    stepsTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: "#111827",
        marginBottom: 20,
    },
    stepItem: {
        flexDirection: "row",
        gap: 16,
    },
    stepIndicator: {
        alignItems: "center",
    },
    stepCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#FFF0F6",
        justifyContent: "center",
        alignItems: "center",
    },
    stepNumber: {
        fontSize: 15,
        fontWeight: "700",
        color: "#FF6B9D",
    },
    stepLine: {
        width: 2,
        flex: 1,
        backgroundColor: "#FECDD3",
        marginVertical: 4,
    },
    stepContent: {
        flex: 1,
        paddingVertical: 6,
        paddingBottom: 20,
    },
    stepTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#111827",
        marginBottom: 4,
    },
    stepDesc: {
        fontSize: 14,
        color: "#6B7280",
        lineHeight: 20,
    },
    loadingHint: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        paddingVertical: 12,
    },
    loadingHintText: {
        fontSize: 14,
        color: "#FF6B9D",
        fontWeight: "600",
    },
    errorCard: {
        backgroundColor: "#FFF7ED",
        borderRadius: 12,
        padding: 20,
        borderWidth: 1,
        borderColor: "#FDBA74",
    },
    errorTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#9A3412",
        marginBottom: 8,
    },
    errorText: {
        fontSize: 14,
        color: "#9A3412",
        lineHeight: 20,
    },
    footer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "#fff",
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: Platform.OS === "ios" ? 32 : 16,
        borderTopWidth: 1,
        borderTopColor: "#E5E7EB",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 8,
    },
    primaryButton: {
        backgroundColor: "#FF6B9D",
        borderRadius: 12,
        paddingVertical: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginBottom: 10,
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
    },
    secondaryButton: {
        backgroundColor: "#F3F4F6",
        borderRadius: 12,
        paddingVertical: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    secondaryButtonText: {
        color: "#6B7280",
        fontSize: 16,
        fontWeight: "600",
    },
    // Skeleton styles
    skeletonBox: {
        backgroundColor: "#E5E7EB",
        borderRadius: 8,
    },
});

export default ValentineConfirmationScreen;
