// screens/recipient/ValentinesGoalSetting Screen.tsx
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Alert,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RecipientStackParamList, ExperienceGift } from '../../types';
import { useApp } from '../../context/AppContext';
import { db } from '../../services/firebase';
import { doc, updateDoc, increment, arrayUnion, addDoc, collection, Timestamp, query, where, getDocs, limit, getDoc } from 'firebase/firestore';
import { Heart, Target, Calendar, Zap, CheckCircle2 } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logger } from '../../utils/logger';

type NavProp = NativeStackNavigationProp<RecipientStackParamList, 'ValentinesGoalSetting'>;

type RouteParams = {
    experienceGift: ExperienceGift;
    challengeData: {
        goalType: string;
        weeks: number;
        sessionsPerWeek: number;
        mode: 'revealed' | 'secret';
    };
    isFirstRedemption: boolean;
};

const ValentinesGoalSettingScreen = () => {
    const navigation = useNavigation<NavProp>();
    const route = useRoute();
    const { state, dispatch } = useApp();

    const params = route.params as RouteParams;
    const { experienceGift, challengeData, isFirstRedemption } = params;

    const [isCreating, setIsCreating] = useState(false);
    const [partnerId, setPartnerId] = useState<string | null>(null);
    const [partnerGoalId, setPartnerGoalId] = useState<string | null>(null);

    // Check if this is the second redemption - fetch the first redeemer's info
    useEffect(() => {
        if (!isFirstRedemption && experienceGift.redeemedBy && experienceGift.redeemedBy.length > 0) {
            const firstRedeemerId = experienceGift.redeemedBy[0];
            setPartnerId(firstRedeemerId);

            // TODO: Fetch the partner's goal ID from Firestore if needed
            // For now, we'll link them during goal creation
        }
    }, [isFirstRedemption, experienceGift]);

    const handleAcceptChallenge = async () => {
        if (!state.user || !challengeData) {
            Alert.alert('Error', 'Missing user or challenge data');
            return;
        }

        setIsCreating(true);

        try {
            const currentUserId = state.user.id;

            // Re-fetch gift to check fresh redemption status (handles concurrency)
            const giftRef = doc(db, 'experienceGifts', experienceGift.id);
            const freshGiftSnap = await getDoc(giftRef);
            let freshGift = experienceGift;
            if (freshGiftSnap.exists()) {
                freshGift = { id: freshGiftSnap.id, ...freshGiftSnap.data() } as ExperienceGift;
            }

            // Determine if I am actually the first redeemer based on fresh data
            const freshRedeemedBy = freshGift.redeemedBy || [];
            const isActuallyFirst = freshRedeemedBy.length === 0;

            // If I'm not first, find the partner ID from the gift
            // (If I already redeemed, it's fine, logic handles it but UI prevents getting here usually)
            let currentPartnerId = partnerId;
            if (!isActuallyFirst && !currentPartnerId && freshRedeemedBy.length > 0) {
                // The first user in the array is the partner (if I am second)
                currentPartnerId = freshRedeemedBy[0];
            }

            let linkedPartnerGoalId: string | null = null;

            // If checking as second redemption, find the partner's goal first
            if (!isActuallyFirst && currentPartnerId) {
                try {
                    const q = query(
                        collection(db, 'goals'),
                        where('experienceGiftId', '==', experienceGift.id),
                        where('userId', '==', currentPartnerId),
                        limit(1)
                    );
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        linkedPartnerGoalId = snapshot.docs[0].id;
                        logger.log('Found partner goal:', linkedPartnerGoalId);
                    }
                } catch (e) {
                    logger.error('Error finding partner goal:', e);
                }
            }

            // Calculate goal parameters
            const now = new Date();
            const durationDays = challengeData.weeks * 7;
            const endDate = new Date(now);
            endDate.setDate(endDate.getDate() + durationDays);

            // Create the goal
            const goalData = {
                userId: currentUserId,
                experienceGiftId: experienceGift.id,
                title: `Valentine's ${challengeData.goalType} Challenge`,
                description: `Complete ${challengeData.sessionsPerWeek} ${challengeData.goalType} sessions per week for ${challengeData.weeks} weeks with your partner`,

                // Weekly tracking
                targetCount: challengeData.weeks,
                currentCount: 0,
                sessionsPerWeek: challengeData.sessionsPerWeek,
                weeklyCount: 0,
                weeklyLogDates: [],
                frequency: 'weekly' as const,
                weekStartAt: null,
                plannedStartDate: now,

                // Timeline
                duration: durationDays,
                startDate: Timestamp.fromDate(now),
                endDate: Timestamp.fromDate(endDate),

                // Status
                isActive: true,
                isCompleted: false,
                isRevealed: challengeData.mode === 'revealed',

                // Couples goal fields
                isCouplesGoal: true,
                partnerId: isActuallyFirst ? null : currentPartnerId,
                partnerGoalId: isActuallyFirst ? null : linkedPartnerGoalId,
                weekCompletionStatus: {
                    currentWeek: 1,
                    userCompleted: false,
                    partnerCompleted: false,
                    weekUnlockedAt: Timestamp.fromDate(now),
                },

                // Metadata
                couponCode: experienceGift.claimCode,
                createdAt: Timestamp.fromDate(now),
                targetHours: 0,
                targetMinutes: 0,
            };

            // Create goal in Firestore
            const goalsCollection = collection(db, 'goals');
            const newGoalRef = await addDoc(goalsCollection, goalData);

            logger.log('✅ Created Valentine\'s couples goal:', newGoalRef.id);

            // If we found a partner goal, update it to link back to us
            if (linkedPartnerGoalId) {
                const partnerGoalRef = doc(db, 'goals', linkedPartnerGoalId);
                await updateDoc(partnerGoalRef, {
                    partnerId: currentUserId,
                    partnerGoalId: newGoalRef.id
                });
                logger.log('🔗 Linked partner goal');
            }

            // Update the gift redemption tracking
            const giftUpdateRef = doc(db, 'experienceGifts', experienceGift.id);
            await updateDoc(giftUpdateRef, {
                redemptionCount: increment(1),
                redeemedBy: arrayUnion(currentUserId),
                status: 'claimed',
                claimedAt: Timestamp.fromDate(now),
                updatedAt: Timestamp.fromDate(now),
            });

            // Update context
            dispatch({
                type: 'SET_EXPERIENCE_GIFT',
                payload: {
                    ...experienceGift,
                    status: 'claimed',
                    claimedAt: now,
                    recipientId: currentUserId,
                },
            });

            // Show success message
            Alert.alert(
                '❤️ Challenge Accepted!',
                isFirstRedemption
                    ? 'Your Valentine\'s challenge is ready! Share the claim code with your partner so they can join you.'
                    : 'You\'ve joined your partner\'s challenge! Time to start working together.',
                [
                    {
                        text: 'Start Now!',
                        onPress: () => {
                            navigation.reset({
                                index: 0,
                                routes: [{ name: 'Roadmap' as any }],
                            });
                        },
                    },
                ]
            );
        } catch (error: any) {
            logger.error('Error creating Valentine\'s goal:', error);
            Alert.alert('Error', 'Failed to create goal. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    if (!challengeData) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>Missing challenge data</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {/* Header */}
                <View style={styles.header}>
                    <Heart color="#ec4899" size={40} fill="#ec4899" />
                    <Text style={styles.title}>Valentine's Challenge</Text>
                    <Text style={styles.subtitle}>
                        {isFirstRedemption
                            ? 'Your partner has chosen a challenge for you both!'
                            : 'Join your partner in this challenge!'}
                    </Text>
                </View>

                {/* Challenge Details Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Challenge Details</Text>

                    <View style={styles.detailRow}>
                        <Target color="#ec4899" size={20} />
                        <View style={styles.detailContent}>
                            <Text style={styles.detailLabel}>Goal</Text>
                            <Text style={styles.detailValue}>{challengeData.goalType}</Text>
                        </View>
                    </View>

                    <View style={styles.detailRow}>
                        <Calendar color="#ec4899" size={20} />
                        <View style={styles.detailContent}>
                            <Text style={styles.detailLabel}>Duration</Text>
                            <Text style={styles.detailValue}>{challengeData.weeks} weeks</Text>
                        </View>
                    </View>

                    <View style={styles.detailRow}>
                        <Zap color="#ec4899" size={20} />
                        <View style={styles.detailContent}>
                            <Text style={styles.detailLabel}>Weekly Target</Text>
                            <Text style={styles.detailValue}>{challengeData.sessionsPerWeek} sessions per week</Text>
                        </View>
                    </View>

                    <View style={styles.detailRow}>
                        <CheckCircle2 color="#ec4899" size={20} />
                        <View style={styles.detailContent}>
                            <Text style={styles.detailLabel}>Mode</Text>
                            <Text style={[styles.detailValue, styles.modeText]}>
                                {challengeData.mode === 'secret' ? '🔒 Secret' : '👀 Revealed'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Couples Info Card */}
                <View style={styles.infoCard}>
                    <Text style={styles.infoTitle}>💑 How It Works</Text>
                    <Text style={styles.infoText}>
                        • Both partners must complete their weekly sessions{'\n'}
                        • Only when BOTH finish can you move to the next week{'\n'}
                        • {challengeData.mode === 'secret'
                            ? 'Your progress is hidden from each other'
                            : 'You can see each other\'s progress'}
                        {'\n'}
                        • Complete all weeks together to unlock your reward!
                    </Text>
                </View>
            </ScrollView>

            {/* Bottom CTA */}
            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={[styles.acceptButton, isCreating && styles.acceptButtonDisabled]}
                    onPress={handleAcceptChallenge}
                    disabled={isCreating}
                >
                    {isCreating ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.acceptButtonText}>Accept Challenge ❤️</Text>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

export default ValentinesGoalSettingScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 100,
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#111827',
        marginTop: 16,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: '#6b7280',
        marginTop: 8,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 20,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    detailContent: {
        marginLeft: 12,
        flex: 1,
    },
    detailLabel: {
        fontSize: 13,
        color: '#6b7280',
        fontWeight: '500',
        marginBottom: 2,
    },
    detailValue: {
        fontSize: 16,
        color: '#111827',
        fontWeight: '600',
    },
    modeText: {
        color: '#ec4899',
    },
    infoCard: {
        backgroundColor: '#fef3f8',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: '#fce7f3',
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#be185d',
        marginBottom: 12,
    },
    infoText: {
        fontSize: 14,
        color: '#831843',
        lineHeight: 22,
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 32,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 8,
    },
    acceptButton: {
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
    acceptButtonDisabled: {
        opacity: 0.6,
    },
    acceptButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorText: {
        fontSize: 16,
        color: '#ef4444',
    },
});
