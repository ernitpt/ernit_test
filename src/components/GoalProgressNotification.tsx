import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Button from './Button';
import { LinearGradient } from 'expo-linear-gradient';
import { BaseModal } from './BaseModal';
import { Notification, Goal, PersonalizedHint } from '../types';
import { goalService } from '../services/GoalService';
import { userService } from '../services/userService';
import { notificationService } from '../services/NotificationService';
import { PersonalizedHintModal, HintSubmission } from './PersonalizedHintModal';
import { storageService } from '../services/StorageService';
import { useApp } from '../context/AppContext';
import AudioPlayer from './AudioPlayer';
import ImageViewer from './ImageViewer';
import { logger } from '../utils/logger';
import { Colors, useColors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import { X } from 'lucide-react-native';
import { useToast } from '../context/ToastContext';
import { vh } from '../utils/responsive';

interface GoalProgressNotificationProps {
    notification: Notification;
    isLatest?: boolean;
}

export const GoalProgressNotification: React.FC<GoalProgressNotificationProps> = ({
    notification,
    isLatest = true, // Default to true for backwards compatibility
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { state } = useApp();
    const { showError } = useToast();
    const [showHintModal, setShowHintModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
    const [goal, setGoal] = useState<Goal | null>(null);
    const [loading, setLoading] = useState(false);

    // Fetch goal on mount to check completion status
    useEffect(() => {
        const goalId = notification.data?.goalId;
        if (!goalId) return;
        goalService.getGoalById(goalId).then(setGoal).catch(() => {});
    }, [notification.data?.goalId]);

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

            const hintData: PersonalizedHint = {
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
    const isDisabled = loading || hasPersonalizedHint || !isLatest || !isActualProgress || goal?.isCompleted;

    const handleClear = async () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

                    {/* Only show hint button for actual progress notifications on active goals */}
                    {isActualProgress && !goal?.isCompleted && (
                        <Button
                            title={
                                !isLatest || hasPersonalizedHint
                                    ? '✓ Hint Already Set'
                                    : loading
                                        ? 'Loading...'
                                        : 'Leave Hint For Next Session'
                            }
                            variant="primary"
                            size="sm"
                            onPress={handleLeaveHint}
                            disabled={isDisabled}
                            loading={loading && !hasPersonalizedHint && isLatest}
                            style={{ marginTop: Spacing.sm }}
                        />
                    )}

                    {isActualProgress && !goal?.isCompleted && (
                        <Button
                            title="View Hint History"
                            variant="ghost"
                            size="sm"
                            onPress={handleViewHistory}
                            disabled={loading}
                            style={{ marginTop: Spacing.sm }}
                        />
                    )}
                </View>

                <TouchableOpacity
                    style={styles.clearNotificationButton}
                    onPress={handleClear}
                    accessibilityRole="button"
                    accessibilityLabel="Clear this notification"
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                    <X size={14} color={colors.textMuted} />
                </TouchableOpacity>
            </View>

            {goal && (
                <PersonalizedHintModal
                    visible={showHintModal}
                    recipientName={notification?.data?.recipientName || notification?.data?.userName || 'Friend'}
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
                <ScrollView style={styles.historyScrollView}>
                    {goal?.hints && goal.hints.length > 0 ? (
                        [...goal.hints].reverse().map((hint, index: number) => {
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
                                <View key={hint.id || index} style={styles.historyHintItem}>
                                    <View style={styles.historyHintHeader}>
                                        <Text style={styles.historySessionLabel}>
                                            Session {hint.session || index + 1}
                                        </Text>
                                        <Text style={styles.historyDateLabel}>
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
                                                style={styles.historyHintImage}
                                                contentFit="cover" cachePolicy="memory-disk"
                                            />
                                        </TouchableOpacity>
                                    )}

                                    {text && (
                                        <Text style={styles.historyHintText}>{text}</Text>
                                    )}

                                    {isAudio && hint.audioUrl && (
                                        <View style={styles.historyAudioContainer}>
                                            <AudioPlayer uri={hint.audioUrl} duration={hint.duration} />
                                        </View>
                                    )}
                                </View>
                            );
                        })
                    ) : (
                        <Text style={styles.historyEmptyText}>
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

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    card: {
        backgroundColor: colors.white,
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.md,
        ...Shadows.sm,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
        overflow: 'hidden',
    },
    cardContent: {
        padding: Spacing.lg,
        paddingRight: Spacing.xxl + Spacing.lg,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    cardTitle: {
        ...Typography.subheading,
        color: colors.textPrimary,
        flex: 1,
    },
    cardMessage: {
        color: colors.gray600,
        ...Typography.small,
        marginBottom: Spacing.md,
        lineHeight: 20,
    },
    clearNotificationButton: {
        position: 'absolute' as const,
        top: Spacing.md,
        right: Spacing.md,
        width: 32,
        height: 32,
        borderRadius: BorderRadius.circle,
        backgroundColor: colors.backgroundLight,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: BorderRadius.circle,
        backgroundColor: colors.secondary,
        marginLeft: Spacing.sm,
    },
    historyScrollView: {
        maxHeight: 500,
        padding: Spacing.xl,
    },
    historyHintItem: {
        marginBottom: Spacing.xl,
        padding: Spacing.lg,
        backgroundColor: colors.surface,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    historyHintHeader: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        marginBottom: Spacing.md,
    },
    historySessionLabel: {
        ...Typography.small,
        fontWeight: '700' as const,
        color: colors.primary,
    },
    historyDateLabel: {
        ...Typography.caption,
        color: colors.textSecondary,
    },
    historyHintImage: {
        width: '100%' as const,
        height: vh(150),
        borderRadius: BorderRadius.sm,
        marginBottom: Spacing.sm,
        backgroundColor: colors.border,
    },
    historyHintText: {
        ...Typography.body,
        lineHeight: 22,
        color: colors.gray700,
        marginBottom: Spacing.sm,
    },
    historyAudioContainer: {
        marginTop: Spacing.sm,
    },
    historyEmptyText: {
        textAlign: 'center' as const,
        color: colors.textMuted,
        ...Typography.body,
        paddingVertical: Spacing.huge,
    },
});
