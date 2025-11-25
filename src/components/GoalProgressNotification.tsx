import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Notification } from '../types';
import { goalService } from '../services/GoalService';
import { userService } from '../services/userService';
import { notificationService } from '../services/NotificationService';
import { PersonalizedHintModal } from './PersonalizedHintModal';
import { useApp } from '../context/AppContext';

interface GoalProgressNotificationProps {
    notification: Notification;
}

export const GoalProgressNotification: React.FC<GoalProgressNotificationProps> = ({
    notification,
}) => {
    const { state } = useApp();
    const [showHintModal, setShowHintModal] = useState(false);
    const [goal, setGoal] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const handleLeaveHint = async () => {
        // Fetch goal to get latest data
        try {
            setLoading(true);
            const goalData = await goalService.getGoalById(notification.data?.goalId || '');
            setGoal(goalData);
            setShowHintModal(true);
        } catch (error) {
            console.error('Error fetching goal:', error);
            alert('Could not load goal details');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitHint = async (hint: string) => {
        if (!goal || !notification.data?.goalId) return;

        const totalSessionsDone =
            (goal.currentCount * goal.sessionsPerWeek) + goal.weeklyCount;
        const nextSessionNumber = totalSessionsDone + 1;

        try {
            // Get giver name
            const giverName = await userService.getUserName(state.user!.id);

            // Set the personalized hint
            await goalService.setPersonalizedNextHint(
                notification.data.goalId,
                hint,
                giverName || 'Your Giver',
                nextSessionNumber
            );

            // Send notification to recipient
            await notificationService.createPersonalizedHintNotification(
                notification.data.recipientId!,
                state.user!.id,
                giverName || 'Your Giver',
                notification.data.goalId,
                goal.title,
                goal.sessionsPerWeek,
                goal.targetCount,
                nextSessionNumber
            );

            console.log('✅ Personalized hint set successfully');
        } catch (error) {
            console.error('Error setting personalized hint:', error);
            throw error;
        }
    };

    const hasPersonalizedHint = goal?.personalizedNextHint !== null && goal?.personalizedNextHint !== undefined;

    return (
        <>
            <View style={styles.card}>
                <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>{notification.title}</Text>
                        {!notification.read && <View style={styles.unreadDot} />}
                    </View>

                    <Text style={styles.cardMessage}>{notification.message}</Text>

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleLeaveHint}
                        disabled={loading || hasPersonalizedHint}
                    >
                        <LinearGradient
                            colors={hasPersonalizedHint ? ['#9CA3AF', '#6B7280'] : ['#7C3AED', '#EC4899']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.buttonGradient}
                        >
                            <Text style={styles.buttonText}>
                                {hasPersonalizedHint
                                    ? '✓ Hint Already Set'
                                    : loading
                                        ? 'Loading...'
                                        : '💌 Leave Next Hint'}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>

            {goal && (
                <PersonalizedHintModal
                    visible={showHintModal}
                    recipientName={goal.title.split(' ')[0] || 'Recipient'}
                    sessionNumber={
                        (goal.currentCount * goal.sessionsPerWeek) +
                        goal.weeklyCount +
                        1
                    }
                    onClose={() => setShowHintModal(false)}
                    onSubmit={handleSubmitHint}
                />
            )}
        </>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    cardContent: {
        padding: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        flex: 1,
    },
    unreadDot: {
        width: 10,
        height: 10,
        backgroundColor: '#8b5cf6',
        borderRadius: 5,
    },
    cardMessage: {
        color: '#4b5563',
        fontSize: 14,
        marginBottom: 12,
        lineHeight: 20,
    },
    button: {
        borderRadius: 8,
        overflow: 'hidden',
        marginTop: 8,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonGradient: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
});
