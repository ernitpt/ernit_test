import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Heart, Gift, X, CheckCircle } from 'lucide-react-native';
import { Notification } from '../types';
import { notificationService } from '../services/NotificationService';
import { goalService } from '../services/GoalService';
import { motivationService } from '../services/MotivationService';
import { useApp } from '../context/AppContext';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import { Colors, useColors, Typography, Spacing, BorderRadius, Shadows } from '../config';
import MotivationModal from './MotivationModal';
import EmpowerChoiceModal from './EmpowerChoiceModal';
import Button from './Button';
import { Avatar } from './Avatar';

interface FreeGoalNotificationProps {
    notification: Notification;
    isLatest?: boolean;
    onActionComplete?: () => void;
}

const FreeGoalNotification: React.FC<FreeGoalNotificationProps> = ({
    notification,
    isLatest = true,
    onActionComplete,
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { state } = useApp();
    const [showEmpowerModal, setShowEmpowerModal] = useState(false);
    const [showMotivationModal, setShowMotivationModal] = useState(false);
    const [alreadyEmpowered, setAlreadyEmpowered] = useState(false);
    const [alreadySentMotivation, setAlreadySentMotivation] = useState(false);
    const [goalIsCompleted, setGoalIsCompleted] = useState(false);
    const [targetSession, setTargetSession] = useState<number>(1);
    const isMounted = useRef(true);

    const data = notification.data || {};
    const isCompleted = notification.type === 'free_goal_completed' || data.milestone === 100;
    const milestone = data.milestone || 0;

    useEffect(() => {
        return () => { isMounted.current = false; };
    }, []);

    // Check if goal already has a gift attached, is completed, and if user already sent motivation
    useEffect(() => {
        if (!data.goalId || !state.user?.id) return;
        const check = async () => {
            try {
                const goal = await goalService.getGoalById(data.goalId);
                if (!isMounted.current) return;
                if (goal?.giftAttachedAt) setAlreadyEmpowered(true);
                if (goal?.isCompleted) setGoalIsCompleted(true);
                if (goal) {
                    const currentDone = (goal.currentCount || 0) * (goal.sessionsPerWeek || 1) + (goal.weeklyCount || 0);
                    const nextSession = currentDone + 1;
                    setTargetSession(nextSession);

                    // Check if user already sent motivation for this session
                    const alreadySent = await motivationService.hasUserSentMotivation(
                        data.goalId, state.user.id, nextSession
                    );
                    if (!isMounted.current) return;
                    setAlreadySentMotivation(alreadySent);
                }
            } catch (error) {
                logger.error('Error checking goal empowerment:', error);
            }
        };
        check();
    }, [data.goalId, state.user?.id]);

    const handleClear = async () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            await notificationService.deleteNotification(notification.id!);
        } catch (error) {
            logger.error('Error clearing notification:', error);
            await logErrorToFirestore(error, {
                screenName: 'FreeGoalNotification',
                feature: 'ClearNotification',
                userId: 'system',
                additionalData: { notificationId: notification.id },
            });
        }
    };

    const handleMotivationSent = () => {
        onActionComplete?.();
    };

    return (
        <>
            <View style={[styles.card, !notification.read && styles.cardUnread]}>
                {/* Clear button */}
                <TouchableOpacity
                    style={styles.clearButton}
                    onPress={handleClear}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                    <X color={colors.textMuted} size={14} />
                </TouchableOpacity>

                {/* Header: Avatar + Title */}
                <View style={styles.header}>
                    <Avatar uri={data.goalUserProfileImageUrl} name={data.goalUserName} size="md" />
                    <View style={styles.headerText}>
                        <Text style={styles.title} numberOfLines={2}>
                            {notification.title}
                        </Text>
                        {!notification.read && <View style={styles.unreadDot} />}
                    </View>
                </View>

                {/* Message */}
                <Text style={styles.message}>{notification.message}</Text>

                {/* Experience Preview */}
                {data.experienceTitle && (
                    <View style={styles.experienceRow}>
                        {data.experienceCoverImageUrl && (
                            <Image
                                source={{ uri: data.experienceCoverImageUrl }}
                                style={styles.experienceImage}
                            />
                        )}
                        <View style={styles.experienceInfo}>
                            <Text style={styles.experienceTitle} numberOfLines={1}>
                                {data.experienceTitle}
                            </Text>
                            {data.experiencePrice != null && (
                                <Text style={styles.experiencePrice}>
                                    {'\u20AC'}{data.experiencePrice}
                                </Text>
                            )}
                        </View>
                    </View>
                )}

                {/* Category Badge (for category-only goals) */}
                {!data.experienceTitle && data.preferredRewardCategory && (
                    <View style={styles.experienceRow}>
                        <View style={[styles.experienceImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.backgroundLight }]}>
                            <Text style={{ fontSize: Typography.heading2.fontSize }}>
                                {data.preferredRewardCategory === 'adventure' ? '🏔️' : data.preferredRewardCategory === 'wellness' ? '🧘' : '🎨'}
                            </Text>
                        </View>
                        <View style={styles.experienceInfo}>
                            <Text style={styles.experienceTitle} numberOfLines={1}>
                                Loves {data.preferredRewardCategory.charAt(0).toUpperCase() + data.preferredRewardCategory.slice(1)} experiences
                            </Text>
                        </View>
                    </View>
                )}

                {/* Milestone Badge */}
                {milestone > 0 && (
                    <View style={[
                        styles.milestoneBadge,
                        isCompleted && styles.milestoneBadgeCompleted,
                    ]}>
                        <Text style={[
                            styles.milestoneText,
                            isCompleted && styles.milestoneTextCompleted,
                        ]}>
                            {isCompleted ? 'Challenge Completed!' : `${milestone}% Complete`}
                        </Text>
                    </View>
                )}

                {/* Action Buttons (hidden on completed goals) */}
                {!isCompleted && !goalIsCompleted && (
                <View style={styles.actions}>
                    {alreadyEmpowered ? (
                        <View style={styles.empoweredBadge}>
                            <CheckCircle size={16} color={colors.primary} />
                            <Text style={styles.empoweredBadgeText}>Already Empowered</Text>
                        </View>
                    ) : (
                        <Button
                            title="Empower"
                            variant="primary"
                            size="sm"
                            onPress={() => setShowEmpowerModal(true)}
                            icon={<Gift size={16} color={colors.white} />}
                            style={{ flex: 1 }}
                        />
                    )}

                    {/* Only show Motivate for latest milestone, not completed, not already sent */}
                    {!isCompleted && !goalIsCompleted && !alreadySentMotivation && isLatest && (
                        <Button
                            title="Motivate"
                            variant="secondary"
                            size="sm"
                            onPress={() => setShowMotivationModal(true)}
                            icon={<Heart size={16} color={colors.primary} />}
                            style={{ flex: 1 }}
                        />
                    )}
                </View>
                )}
            </View>

            {/* Empower Choice Modal */}
            <EmpowerChoiceModal
                visible={showEmpowerModal}
                userName={data.goalUserName || 'Friend'}
                experienceTitle={data.experienceTitle}
                experiencePrice={data.experiencePrice}
                pledgedExperienceId={data.experienceId}
                goalId={data.goalId || ''}
                goalUserId={data.goalUserId || ''}
                preferredRewardCategory={data.preferredRewardCategory}
                onClose={() => setShowEmpowerModal(false)}
            />

            {/* Motivation Modal */}
            <MotivationModal
                visible={showMotivationModal}
                recipientName={data.goalUserName || 'Friend'}
                goalId={data.goalId || ''}
                targetSession={targetSession}
                onClose={() => setShowMotivationModal(false)}
                onSent={handleMotivationSent}
            />
        </>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    card: {
        backgroundColor: colors.white,
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.md,
        padding: Spacing.cardPadding,
        ...Shadows.sm,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 3,
        borderLeftColor: colors.secondary,
        overflow: 'hidden',
    },
    cardUnread: {
        borderColor: colors.primaryBorder,
        backgroundColor: colors.primarySurface,
    },
    clearButton: {
        position: 'absolute',
        top: Spacing.md,
        right: Spacing.md,
        width: 32,
        height: 32,
        borderRadius: BorderRadius.circle,
        backgroundColor: colors.backgroundLight,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        marginBottom: Spacing.sm,
        paddingRight: Spacing.xxl,
    },
    headerText: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    title: {
        ...Typography.bodyBold,
        color: colors.textPrimary,
        flex: 1,
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: BorderRadius.xs,
        backgroundColor: colors.secondary,
    },
    message: {
        ...Typography.small,
        color: colors.textSecondary,
        lineHeight: 20,
        marginBottom: Spacing.md,
    },
    experienceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: colors.surface,
        padding: Spacing.sm,
        borderRadius: BorderRadius.md,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: colors.backgroundLight,
    },
    experienceImage: {
        width: 48,
        height: 48,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.border,
    },
    experienceInfo: {
        flex: 1,
    },
    experienceTitle: {
        ...Typography.smallBold,
        color: colors.textPrimary,
    },
    experiencePrice: {
        ...Typography.captionBold,
        color: colors.primary,
        marginTop: Spacing.xxs,
    },
    milestoneBadge: {
        alignSelf: 'flex-start',
        backgroundColor: colors.primarySurface,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.sm,
        marginBottom: Spacing.md,
    },
    milestoneBadgeCompleted: {
        backgroundColor: colors.secondary,
    },
    milestoneText: {
        ...Typography.captionBold,
        color: colors.primary,
    },
    milestoneTextCompleted: {
        color: colors.white,
    },
    actions: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    empoweredBadge: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.xs,
        backgroundColor: colors.primarySurface,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: colors.primaryBorder,
    },
    empoweredBadgeText: {
        ...Typography.smallBold,
        color: colors.primary,
    },
});

export default React.memo(FreeGoalNotification);
