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

            // Update local goal state to reflect the hint was set
            setGoal({
                ...goal,
                personalizedNextHint: {
                    hint,
                    fromName: giverName || 'Your Giver',
                    forSessionNumber: nextSessionNumber,
                },
            });

            console.log('✅ Personalized hint set successfully');
        } catch (error) {
            console.error('Error setting personalized hint:', error);
            throw error;
        }
    };

    const hasPersonalizedHint = goal?.personalizedNextHint !== null && goal?.personalizedNextHint !== undefined;

    const handleClear = async () => {
        try {
            await notificationService.deleteNotification(notification.id!);
        } catch (error) {
            console.error('Error clearing notification:', error);
        }
    };

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
                        style={[
                            styles.button,
                            (loading || hasPersonalizedHint) && styles.buttonDisabled
                        ]}
                        onPress={handleLeaveHint}
                        disabled={loading || hasPersonalizedHint}
                    >
                        <Text style={styles.buttonText}>
                            {hasPersonalizedHint
                                ? '✓ Hint Already Set'
                                : loading
                                    ? 'Loading...'
                                    : 'Leave Hint For Next Session'}
                        </Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={styles.clearNotificationButton}
                    onPress={handleClear}
                >
                    <Text style={styles.clearNotificationText}>×</Text>
                </TouchableOpacity>
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
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    cardContent: {
        flex: 1,
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
        backgroundColor: '#8b5cf6',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    buttonDisabled: {
        backgroundColor: '#9CA3AF',
    },
    buttonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    clearNotificationButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        margin: 8,
    },
    clearNotificationText: {
        color: '#9ca3af',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
