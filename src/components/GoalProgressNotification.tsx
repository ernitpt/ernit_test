import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BaseModal } from './BaseModal';
import { Notification } from '../types';
import { goalService } from '../services/GoalService';
import { userService } from '../services/userService';
import { notificationService } from '../services/NotificationService';
import { PersonalizedHintModal, HintSubmission } from './PersonalizedHintModal';
import { storageService } from '../services/StorageService';
import { useApp } from '../context/AppContext';
import AudioPlayer from './AudioPlayer';
import ImageViewer from './ImageViewer';
import { logger } from '../utils/logger';
import Colors from '../config/colors';
import { useToast } from '../context/ToastContext';

interface GoalProgressNotificationProps {
    notification: Notification;
    isLatest?: boolean;
}

export const GoalProgressNotification: React.FC<GoalProgressNotificationProps> = ({
    notification,
    isLatest = true, // Default to true for backwards compatibility
}) => {
    const { state } = useApp();
    const { showError } = useToast();
    const [showHintModal, setShowHintModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
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
            logger.error('Error fetching goal:', error);
            showError('Could not load goal details');
        } finally {
            setLoading(false);
        }
    };

    const handleViewHistory = async () => {
        if (!goal) {
            try {
                setLoading(true);
                const goalData = await goalService.getGoalById(notification.data?.goalId || '');
                setGoal(goalData);
                setShowHistoryModal(true);
            } catch (error) {
                logger.error('Error fetching goal:', error);
                showError('Could not load goal details');
            } finally {
                setLoading(false);
            }
        } else {
            setShowHistoryModal(true);
        }
    };

    const handleSubmitHint = async (submission: HintSubmission) => {
        if (!goal || !notification.data?.goalId) return;

        const totalSessionsDone =
            (goal.currentCount * goal.sessionsPerWeek) + goal.weeklyCount;
        // We want to leave a hint for the session AFTER the current one (or the one about to start)
        // If 0 sessions done, we want hint for Session 2 (since Session 1 is "current")
        const nextSessionNumber = totalSessionsDone + 2;

        try {
            // Get giver name
            const giverName = await userService.getUserName(state.user!.id);

            let audioUrl: string | undefined;
            let imageUrl: string | undefined;

            // Upload media if present
            if (submission.type === 'audio' && submission.audioUri) {
                audioUrl = await storageService.uploadAudio(submission.audioUri, state.user!.id);
            } else if (submission.imageUri) {
                imageUrl = await storageService.uploadImage(submission.imageUri, state.user!.id);
            }

            const hintData: any = {
                type: submission.type,
                giverName: giverName || 'Your Giver',
                forSessionNumber: nextSessionNumber,
                createdAt: new Date(),
            };

            if (submission.text) hintData.text = submission.text;
            if (audioUrl) hintData.audioUrl = audioUrl;
            if (imageUrl) hintData.imageUrl = imageUrl;
            if (submission.duration) hintData.duration = submission.duration;

            // Set the personalized hint
            await goalService.setPersonalizedNextHint(
                notification.data.goalId,
                hintData
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
                    ...hintData,
                    createdAt: new Date(),
                },
            });

            logger.log('✅ Personalized hint set successfully');
        } catch (error) {
            logger.error('Error setting personalized hint:', error);
            throw error;
        }
    };

    const hasPersonalizedHint = goal?.personalizedNextHint !== null && goal?.personalizedNextHint !== undefined;
    // Only show hint button if this is an actual session progress notification (has sessionNumber)
    // Start reminders like "Today's the day!" shouldn't have hint buttons
    const isActualProgress = notification.data?.sessionNumber != null;
    const isDisabled = loading || hasPersonalizedHint || !isLatest || !isActualProgress;

    const handleClear = async () => {
        try {
            await notificationService.deleteNotification(notification.id!);
        } catch (error) {
            logger.error('Error clearing notification:', error);
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

                    {/* Only show hint button for actual progress notifications */}
                    {isActualProgress && (
                        <TouchableOpacity
                            style={[
                                styles.button,
                                isDisabled && styles.buttonDisabled
                            ]}
                            onPress={handleLeaveHint}
                            disabled={isDisabled}
                        >
                            <Text style={styles.buttonText}>
                                {!isLatest
                                    ? '✓ Hint Already Set'
                                    : hasPersonalizedHint
                                        ? '✓ Hint Already Set'
                                        : loading
                                            ? 'Loading...'
                                            : 'Leave Hint For Next Session'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {isActualProgress && (
                        <TouchableOpacity
                            style={styles.historyButton}
                            onPress={handleViewHistory}
                            disabled={loading}
                        >
                            <Text style={styles.historyButtonText}>
                                View Hint History
                            </Text>
                        </TouchableOpacity>
                    )}
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

            {/* Hint History Modal */}
            <BaseModal visible={showHistoryModal} onClose={() => setShowHistoryModal(false)} title="Hint History">
                <ScrollView style={historyStyles.scrollView}>
                    {goal?.hints && goal.hints.length > 0 ? (
                        [...goal.hints].reverse().map((hint: any, index: number) => {
                            const isAudio = hint.type === 'audio' || hint.type === 'mixed';
                            const hasImage = hint.imageUrl;
                            const text = hint.text || hint.hint;

                            // Handle date
                            let dateMs = 0;
                            if (hint.createdAt) {
                                if (typeof hint.createdAt.toMillis === 'function') {
                                    dateMs = hint.createdAt.toMillis();
                                } else if (hint.createdAt instanceof Date) {
                                    dateMs = hint.createdAt.getTime();
                                } else {
                                    dateMs = new Date(hint.createdAt).getTime();
                                }
                            } else if (hint.date) {
                                dateMs = hint.date;
                            }

                            return (
                                <View key={hint.id || index} style={historyStyles.hintItem}>
                                    <View style={historyStyles.hintHeader}>
                                        <Text style={historyStyles.sessionLabel}>
                                            Session {hint.session || index + 1}
                                        </Text>
                                        <Text style={historyStyles.dateLabel}>
                                            {new Date(dateMs).toLocaleDateString()}
                                        </Text>
                                    </View>

                                    {hasImage && (
                                        <TouchableOpacity
                                            onPress={() => setSelectedImageUri(hint.imageUrl)}
                                            activeOpacity={0.9}
                                        >
                                            <Image
                                                source={{ uri: hint.imageUrl }}
                                                style={historyStyles.hintImage}
                                                resizeMode="cover"
                                            />
                                        </TouchableOpacity>
                                    )}

                                    {text && (
                                        <Text style={historyStyles.hintText}>{text}</Text>
                                    )}

                                    {isAudio && hint.audioUrl && (
                                        <View style={historyStyles.audioContainer}>
                                            <AudioPlayer uri={hint.audioUrl} duration={hint.duration} />
                                        </View>
                                    )}
                                </View>
                            );
                        })
                    ) : (
                        <Text style={historyStyles.emptyText}>
                            No hints have been sent yet.
                        </Text>
                    )}
                </ScrollView>
            </BaseModal>

            {/* Fullscreen Image Viewer */}
            {selectedImageUri && (
                <ImageViewer
                    visible={!!selectedImageUri}
                    imageUri={selectedImageUri}
                    onClose={() => setSelectedImageUri(null)}
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
        borderColor: Colors.border,
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
        color: Colors.textPrimary,
        flex: 1,
    },
    cardMessage: {
        color: '#4b5563',
        fontSize: 14,
        marginBottom: 12,
        lineHeight: 20,
    },
    button: {
        backgroundColor: Colors.secondary,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    buttonDisabled: {
        backgroundColor: Colors.textMuted,
    },
    buttonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    historyButton: {
        marginTop: 8,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        backgroundColor: Colors.backgroundLight,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    historyButtonText: {
        color: Colors.textSecondary,
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
    clearNotificationButton: {
        padding: 8,
        paddingRight: 12,
    },
    clearNotificationText: {
        fontSize: 24,
        color: Colors.textMuted,
        fontWeight: '300',
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Colors.primary,
        marginLeft: 8,
    },
});

const historyStyles = StyleSheet.create({
    scrollView: {
        maxHeight: 500,
        padding: 20,
    },
    hintItem: {
        marginBottom: 20,
        padding: 16,
        backgroundColor: Colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    hintHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    sessionLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.primary,
    },
    dateLabel: {
        fontSize: 12,
        color: Colors.textSecondary,
    },
    hintImage: {
        width: '100%',
        height: 150,
        borderRadius: 8,
        marginBottom: 8,
        backgroundColor: Colors.border,
    },
    hintText: {
        fontSize: 15,
        lineHeight: 22,
        color: '#374151',
        marginBottom: 8,
    },
    audioContainer: {
        marginTop: 8,
    },
    emptyText: {
        textAlign: 'center',
        color: Colors.textMuted,
        fontSize: 15,
        paddingVertical: 40,
    },
});
