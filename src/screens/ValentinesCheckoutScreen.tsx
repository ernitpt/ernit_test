// screens/ValentinesCheckoutScreen.tsx
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Alert,
    StyleSheet,
    ActivityIndicator,
    ScrollView,
    Platform,
    KeyboardAvoidingView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { ChevronLeft, Lock, CreditCard, Heart } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { stripeService } from '../services/stripeService';
import { useApp } from '../context/AppContext';
import { useAuthGuard } from '../hooks/useAuthGuard';
import LoginPrompt from '../components/LoginPrompt';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logger } from '../utils/logger';

const stripePromise = loadStripe(process.env.EXPO_PUBLIC_STRIPE_PK!);

type RouteParams = {
    experience: any;
    challengeData: {
        goalType: string;
        weeks: number;
        sessionsPerWeek: number;
        mode: 'revealed' | 'secret';
    };
};

type NavigationProp = NativeStackNavigationProp<any, any>;

// --- Storage helpers (web + native) ---
const getStorageItem = async (key: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        return localStorage.getItem(key);
    }
    return await AsyncStorage.getItem(key);
};

const setStorageItem = async (key: string, value: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        localStorage.setItem(key, value);
    } else {
        await AsyncStorage.setItem(key, value);
    }
};

const removeStorageItem = async (key: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        localStorage.removeItem(key);
    } else {
        await AsyncStorage.removeItem(key);
    }
};

// ========== INNER CHECKOUT (inside <Elements>) ==========
const CheckoutInner: React.FC<{
    clientSecret: string;
    paymentIntentId: string;
    experience: any;
    challengeData: RouteParams['challengeData'];
}> = ({ clientSecret, paymentIntentId, experience, challengeData }) => {
    const navigation = useNavigation<NavigationProp>();
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCheckingRedirect, setIsCheckingRedirect] = useState(false);

    // Handle redirect return from Stripe
    useEffect(() => {
        if (!stripe) return;

        const checkRedirectReturn = async () => {
            const clientSecret = new URLSearchParams(
                Platform.OS === 'web' ? window.location.search : ''
            ).get('payment_intent_client_secret');

            if (!clientSecret) return;

            setIsCheckingRedirect(true);

            try {
                const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);

                if (paymentIntent?.status === 'succeeded') {
                    await removeStorageItem(`pending_payment_${clientSecret}`);
                    // Give webhook time to create gift
                    await new Promise(res => setTimeout(res, 2000));

                    // Redirect to ernit.app with claim code
                    // The Valentine's coupon will be created by webhook
                    if (Platform.OS === 'web') {
                        window.location.href = 'https://ernit.app';
                    }
                }
            } catch (err: any) {
                logger.error('Error handling redirect return:', err);
                Alert.alert('Error', 'Failed to verify payment status. Please contact support.');
            } finally {
                setIsCheckingRedirect(false);
            }
        };

        const timer = setTimeout(() => checkRedirectReturn(), 500);
        return () => clearTimeout(timer);
    }, [stripe]);

    const handlePurchase = async () => {
        if (!stripe || !elements) {
            Alert.alert('Stripe not ready', 'Please wait a few seconds and try again.');
            return;
        }

        setIsProcessing(true);
        await setStorageItem(`pending_payment_${clientSecret}`, 'true');

        try {
            const { error, paymentIntent } = await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url:
                        Platform.OS === 'web'
                            ? window.location.href
                            : 'https://ernit.app',
                },
                redirect: 'if_required',
            });

            if (error) throw error;
            if (!paymentIntent) throw new Error('No payment intent returned.');

            if (paymentIntent.status === 'succeeded') {
                logger.log(' Payment succeeded, Valentine coupon will be created by webhook');
                await removeStorageItem(`pending_payment_${clientSecret}`);

                // Give webhook time to process
                await new Promise(res => setTimeout(res, 2000));

                Alert.alert(
                    'Purchase Successful! ',
                    'Your Valentine\'s gift has been purchased. You\'ll be redirected to share the coupon code.',
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                if (Platform.OS === 'web') {
                                    window.location.href = 'https://ernit.app';
                                }
                            },
                        },
                    ]
                );
            } else if (paymentIntent.status === 'processing') {
                Alert.alert(
                    'Payment Processing',
                    'Your payment is being processed. You will receive confirmation shortly.'
                );
            }
        } catch (err: any) {
            await removeStorageItem(`pending_payment_${clientSecret}`);
            const errorMessage = err.message || 'Something went wrong.';
            Alert.alert('Payment Failed', errorMessage);
            logger.error('Payment error:', err);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                            <ChevronLeft color="#111827" size={24} />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Valentine's Checkout</Text>
                        <View style={styles.lockIcon}>
                            <Lock color="#ec4899" size={20} />
                        </View>
                    </View>

                    {(isCheckingRedirect || isProcessing) && (
                        <View style={styles.processingOverlay}>
                            <ActivityIndicator color="#ec4899" size="large" />
                            <Text style={styles.processingText}>
                                {isCheckingRedirect ? 'Verifying payment...' : 'Processing payment...'}
                            </Text>
                        </View>
                    )}

                    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                        {/* Summary */}
                        <View style={styles.summaryCard}>
                            <View style={styles.heartBadge}>
                                <Heart color="#ec4899" size={20} fill="#ec4899" />
                                <Text style={styles.heartText}>Valentine's Gift</Text>
                            </View>

                            <Text style={styles.summaryLabel}>Experience (Couples Pack)</Text>
                            <View style={styles.summaryRow}>
                                <View style={styles.summaryInfo}>
                                    <Text style={styles.summaryTitle}>{experience.title}</Text>
                                    {experience.subtitle && (
                                        <Text style={styles.subtitle}>{experience.subtitle}</Text>
                                    )}
                                    <Text style={styles.quantityText}>Qty: 2 (one for each partner)</Text>
                                    <Text style={styles.perPersonText}>€{experience.price.toFixed(2)} per person</Text>
                                </View>
                                <Text style={styles.priceAmount}>€{(experience.price * 2).toFixed(2)}</Text>
                            </View>

                            <View style={styles.divider} />

                            <Text style={styles.summaryLabel}>Challenge Details</Text>
                            <View style={styles.challengeRow}>
                                <Text style={styles.challengeLabel}>Goal</Text>
                                <Text style={styles.challengeValue}>{challengeData.goalType}</Text>
                            </View>
                            <View style={styles.challengeRow}>
                                <Text style={styles.challengeLabel}>Duration</Text>
                                <Text style={styles.challengeValue}>{challengeData.weeks} weeks</Text>
                            </View>
                            <View style={styles.challengeRow}>
                                <Text style={styles.challengeLabel}>Sessions/Week</Text>
                                <Text style={styles.challengeValue}>{challengeData.sessionsPerWeek}x per week</Text>
                            </View>
                            <View style={styles.challengeRow}>
                                <Text style={styles.challengeLabel}>Mode</Text>
                                <Text style={[styles.challengeValue, styles.modeValue]}>
                                    {challengeData.mode === 'secret' ? ' Secret' : ' Revealed'}
                                </Text>
                            </View>

                            <View style={styles.priceLine}>
                                <Text style={styles.priceLabel}>Total Amount (2 people)</Text>
                                <Text style={styles.priceAmount}>€{(experience.price * 2).toFixed(2)}</Text>
                            </View>
                        </View>

                        {/* Payment */}
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <CreditCard color="#ec4899" size={20} />
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
                            <Text style={styles.totalLabel}>Total (2 people)</Text>
                            <Text style={styles.totalAmount}>€{(experience.price * 2).toFixed(2)}</Text>
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
            </KeyboardAvoidingView >
        </SafeAreaView >
    );
};

// ========== OUTER WRAPPER (creates PaymentIntent & <Elements>) ==========
const ValentinesCheckoutScreen: React.FC = () => {
    const route = useRoute();
    const navigation = useNavigation<NavigationProp>();
    const { state } = useApp();
    const { requireAuth, showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();

    const routeParams = route.params as RouteParams | undefined;
    const experience = routeParams?.experience;
    const challengeData = routeParams?.challengeData;

    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Require authentication
    useEffect(() => {
        if (!state.user) {
            requireAuth('Please log in to complete your Valentine\'s purchase.');
        }
    }, [state.user, requireAuth]);

    // Redirect if data is missing
    useEffect(() => {
        if (!experience || !challengeData) {
            logger.warn('Missing experience or challengeData, redirecting back');
            navigation.goBack();
        }
    }, [experience, challengeData, navigation]);

    // Early return if missing data
    if (!experience || !challengeData) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Redirecting...</Text>
                </View>
            </SafeAreaView>
        );
    }

    const initRef = React.useRef(false);

    useEffect(() => {
        if (initRef.current) return;

        const init = async () => {
            try {
                if (!experience || !challengeData) return;

                initRef.current = true;

                // Create PaymentIntent with Valentine's metadata (2 experiences for couples)
                const cartMetadata = [{
                    experienceId: experience.id,
                    partnerId: experience.partnerId,
                    quantity: 1, // ✅ Quantity 1 = ONE shared coupon for the couple (maxRedemptions=2)
                }];

                const response = await stripeService.createPaymentIntent(
                    experience.price * 2, // ✅ Double price for couples pack
                    state.user?.id || '',
                    state.user?.displayName || '',
                    experience.partnerId,
                    cartMetadata,
                    '', // personalized message - could add later
                    JSON.stringify(challengeData) // ✅ Valentine's challenge data
                );

                setClientSecret(response.clientSecret);
                setPaymentIntentId(response.paymentIntentId);
            } catch (err: any) {
                logger.error('Error creating payment intent:', err);
                Alert.alert('Error', err.message || 'Failed to initialize payment.');
                initRef.current = false;
                navigation.goBack();
            } finally {
                setLoading(false);
            }
        };

        init();
    }, []);

    if (!state.user) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
                <LoginPrompt
                    visible={showLoginPrompt}
                    onClose={closeLoginPrompt}
                    message={loginMessage}
                />
            </SafeAreaView>
        );
    }

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#ec4899" size="large" />
                    <Text style={styles.loadingText}>Setting up checkout...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (!clientSecret || !paymentIntentId) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.errorText}>Could not initialize payment.</Text>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.retryButton}>
                        <Text style={styles.retryButtonText}>Go Back</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <Elements
            stripe={stripePromise}
            options={{
                clientSecret,
                appearance: {
                    theme: 'stripe',
                    variables: {
                        colorPrimary: '#ec4899',
                        colorBackground: '#ffffff',
                        colorText: '#111827',
                        colorDanger: '#ef4444',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        spacingUnit: '4px',
                        borderRadius: '8px',
                    },
                },
            }}
        >
            <CheckoutInner
                clientSecret={clientSecret}
                paymentIntentId={paymentIntentId}
                experience={experience}
                challengeData={challengeData}
            />
        </Elements>
    );
};

export default ValentinesCheckoutScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 50 : 40,
        paddingBottom: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f3f4f6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
        flex: 1,
        textAlign: 'center',
    },
    lockIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#fce7f3',
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollView: { flex: 1, paddingHorizontal: 20 },
    summaryCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginTop: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    heartBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fce7f3',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        alignSelf: 'center',
        marginBottom: 16,
        gap: 8,
    },
    heartText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#ec4899',
    },
    summaryLabel: {
        fontSize: 12,
        color: '#6b7280',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
    },
    summaryInfo: {
        flex: 1,
        marginRight: 12,
    },
    summaryTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
    },
    subtitle: { fontSize: 14, color: '#6b7280', marginTop: 2 },
    quantityText: {
        marginTop: 6,
        fontSize: 13,
        color: '#4b5563',
        fontWeight: '500',
    },
    perPersonText: {
        marginTop: 2,
        fontSize: 12,
        color: '#9ca3af',
        fontStyle: 'italic',
    },
    divider: {
        height: 1,
        backgroundColor: '#e5e7eb',
        marginVertical: 16,
    },
    challengeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
    },
    challengeLabel: {
        fontSize: 14,
        color: '#6b7280',
        fontWeight: '500',
    },
    challengeValue: {
        fontSize: 14,
        color: '#111827',
        fontWeight: '600',
    },
    modeValue: {
        color: '#ec4899',
    },
    priceLine: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 16,
        marginTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    priceLabel: { fontSize: 16, color: '#6b7280', fontWeight: '600' },
    priceAmount: { fontSize: 18, fontWeight: '700', color: '#ec4899' },
    section: { marginBottom: 28 },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
    paymentBox: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    securityNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: '#f9fafb',
        borderRadius: 8,
        marginBottom: 20,
    },
    securityText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: Platform.OS === 'ios' ? 32 : 16,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 8,
    },
    totalSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    totalLabel: { fontSize: 16, color: '#6b7280', fontWeight: '600' },
    totalAmount: { fontSize: 28, fontWeight: '700', color: '#111827' },
    payButton: {
        backgroundColor: '#ec4899',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#ec4899',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    payButtonDisabled: { opacity: 0.6 },
    payButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
    },
    loadingText: { marginTop: 12, fontSize: 16, color: '#6b7280' },
    errorText: { fontSize: 18, color: '#ef4444', marginBottom: 16 },
    retryButton: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#ec4899',
        borderRadius: 8,
    },
    retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    processingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    processingText: { marginTop: 12, fontSize: 16, color: '#6b7280', fontWeight: '500' },
});
