import React, { useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    Image,
} from 'react-native';
import { MessageCircle, Mic, Image as ImageIcon } from 'lucide-react-native';
import { Goal, PersonalizedHint } from '../types';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { EmptyState } from './EmptyState';
import { BaseModal } from './BaseModal';
import { vh } from '../utils/responsive';

interface HintHistoryModalProps {
    visible: boolean;
    goal: Goal;
    onClose: () => void;
}

export const HintHistoryModal: React.FC<HintHistoryModalProps> = ({
    visible,
    goal,
    onClose,
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const hints = goal.hints || [];

    const formatDate = (date: Date | { toDate(): Date } | number | string | null | undefined) => {
        let d: Date;

        // Handle Firestore Timestamp
        if (date && typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
            d = date.toDate();
        }
        // Handle number (milliseconds)
        else if (typeof date === 'number') {
            d = new Date(date);
        }
        // Handle Date object
        else if (date instanceof Date) {
            d = date;
        }
        // Fallback
        else {
            d = new Date(date);
        }

        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const renderHint = (hint: NonNullable<Goal['hints']>[number], index: number) => {
        //Handle both hint types
        const isPersonalizedHint = 'type' in hint;

        if (isPersonalizedHint) {
            const pHint = hint as PersonalizedHint;
            return (
                <View key={index} style={styles.hintCard}>
                    <View style={styles.hintHeader}>
                        <View style={styles.hintTypeIcon}>
                            {pHint.type === 'audio' || pHint.type === 'mixed' ? (
                                <Mic size={16} color={colors.primary} />
                            ) : pHint.type === 'image' ? (
                                <ImageIcon size={16} color={colors.primary} />
                            ) : (
                                <MessageCircle size={16} color={colors.primary} />
                            )}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.sessionLabel}>Session {pHint.forSessionNumber}</Text>
                            <Text style={styles.dateText}>{formatDate(pHint.createdAt)}</Text>
                        </View>
                        <View style={[styles.typeBadge, { backgroundColor: getTypeBadgeColor(pHint.type) }]}>
                            <Text style={styles.typeBadgeText}>{pHint.type}</Text>
                        </View>
                    </View>

                    {pHint.text && (
                        <Text style={styles.hintText}>{pHint.text}</Text>
                    )}

                    {pHint.imageUrl && (
                        <Image source={{ uri: pHint.imageUrl }} style={styles.hintImage} resizeMode="cover" />
                    )}

                    {pHint.audioUrl && (
                        <View style={styles.audioIndicator}>
                            <Mic size={16} color={colors.textSecondary} />
                            <Text style={styles.audioText}>
                                Voice message{pHint.duration ? ` (${pHint.duration}s)` : ''}
                            </Text>
                        </View>
                    )}
                </View>
            );
        } else {
            // Legacy hint format
            const legacyHint = hint as { session: number; hint: string; date: number };
            return (
                <View key={index} style={styles.hintCard}>
                    <View style={styles.hintHeader}>
                        <View style={styles.hintTypeIcon}>
                            <MessageCircle size={16} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.sessionLabel}>Session {legacyHint.session}</Text>
                            <Text style={styles.dateText}>{formatDate(legacyHint.date)}</Text>
                        </View>
                        <View style={[styles.typeBadge, { backgroundColor: colors.infoLight }]}>
                            <Text style={styles.typeBadgeText}>text</Text>
                        </View>
                    </View>
                    <Text style={styles.hintText}>{legacyHint.hint}</Text>
                </View>
            );
        }
    };

    const getTypeBadgeColor = (type: string) => {
        switch (type) {
            case 'audio':
                return colors.warningLight;
            case 'image':
                return colors.infoLight;
            case 'mixed':
                return colors.primarySurface;
            default:
                return colors.infoLight;
        }
    };

    return (
        <BaseModal visible={visible} onClose={onClose} title="Hint History" variant="bottom" noPadding>
            <Text style={styles.subtitle}>
                {goal.title}
            </Text>

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {hints.length === 0 ? (
                    <EmptyState
                        icon="💡"
                        title="No hints sent yet"
                        message="Hints you send will appear here for future reference"
                    />
                ) : (
                    hints.map((hint, index) => renderHint(hint, index))
                )}
                <View style={{ height: 20 }} />
            </ScrollView>
        </BaseModal>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    subtitle: {
        ...Typography.body,
        color: colors.textSecondary,
        paddingHorizontal: Spacing.xxl,
        marginBottom: Spacing.xl,
    },
    scrollView: {
        paddingHorizontal: Spacing.xxl,
    },
    hintCard: {
        backgroundColor: colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    hintHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    hintTypeIcon: {
        width: 32,
        height: 32,
        borderRadius: BorderRadius.circle,
        backgroundColor: colors.backgroundLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: Spacing.md,
    },
    sessionLabel: {
        ...Typography.small,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: Spacing.xxs,
    },
    dateText: {
        ...Typography.caption,
        color: colors.textMuted,
    },
    typeBadge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.xs,
    },
    typeBadgeText: {
        ...Typography.tiny,
        fontWeight: '600',
        color: colors.gray600,
        textTransform: 'uppercase',
    },
    hintText: {
        ...Typography.body,
        color: colors.gray700,
        lineHeight: 22,
    },
    hintImage: {
        width: '100%',
        height: vh(180),
        borderRadius: BorderRadius.sm,
        marginTop: Spacing.md,
        backgroundColor: colors.border,
    },
    audioIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: Spacing.sm,
        padding: Spacing.sm,
        backgroundColor: colors.white,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    audioText: {
        marginLeft: Spacing.sm,
        ...Typography.small,
        color: colors.textSecondary,
        fontWeight: '500',
    },
});
