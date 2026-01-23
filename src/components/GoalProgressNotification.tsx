import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Notification } from '../types';
import { goalService } from '../services/GoalService';
import { userService } from '../services/userService';
import { notificationService } from '../services/NotificationService';
import { PersonalizedHintModal, HintSubmission } from './PersonalizedHintModal';
import { storageService } from '../services/StorageService';
import { useApp } from '../context/AppContext';
import AudioPlayer from './AudioPlayer';
import ImageViewer from './ImageViewer';
import { commonStyles } from '../styles/commonStyles';
import { logger } from '../utils/logger';

interface GoalProgressNotificationProps {
    notification: Notification;
    isLatest?: boolean;
}

export const GoalProgressNotification: React.FC<GoalProgressNotificationProps> = ({
    notification,
    isLatest = true, // Default to true for backwards compatibility
}) => {
    const { state } = useApp();
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
            alert('Could not load goal details');
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
                alert('Could not load goal details');
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
    const isDisabled = loading || hasPersonalizedHint || !isLatest;

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

                    <TouchableOpacity
                        style={styles.historyButton}
                        onPress={handleViewHistory}
                        disabled={loading}
                    >
                        <Text style={styles.historyButtonText}>
                            View Hint History
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

            {/* Hint History Modal */}
            <Modal
                visible={showHistoryModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowHistoryModal(false)}
            >
                <TouchableOpacity
                    style={commonStyles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowHistoryModal(false)}
                >
                    <View style={historyStyles.modalContainer}>
                        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                            <View style={historyStyles.modalHeader}>
                                <Text style={historyStyles.modalTitle}>Hint History</Text>
                                <TouchableOpacity onPress={() => setShowHistoryModal(false)}>
                                    <Text style={historyStyles.closeButton}>×</Text>
                                </TouchableOpacity>
                            </View>

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
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

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
        backgroundColor: '#9ca3af',
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
        backgroundColor: '#f3f4f6',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    historyButtonText: {
        color: '#6b7280',
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
        color: '#9ca3af',
        fontWeight: '300',
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#7c3aed',
        marginLeft: 8,
    },
});

const historyStyles = StyleSheet.create({
    modalContainer: {
        backgroundColor: '#fff',
        borderRadius: 16,
        maxWidth: 500,
        width: '90%',
        maxHeight: '80%',
        alignSelf: 'center',
        marginTop: 'auto',
        marginBottom: 'auto',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    closeButton: {
        fontSize: 32,
        color: '#9ca3af',
        fontWeight: '300',
    },
    scrollView: {
        maxHeight: 500,
        padding: 20,
    },
    hintItem: {
        marginBottom: 20,
        padding: 16,
        backgroundColor: '#f9fafb',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    hintHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    sessionLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#7c3aed',
    },
    dateLabel: {
        fontSize: 12,
        color: '#6b7280',
    },
    hintImage: {
        width: '100%',
        height: 150,
        borderRadius: 8,
        marginBottom: 8,
        backgroundColor: '#e5e7eb',
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
        color: '#9ca3af',
        fontSize: 15,
        paddingVertical: 40,
    },
});
