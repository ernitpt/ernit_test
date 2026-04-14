import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Gift, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Colors, useColors } from '../../../config';
import { BorderRadius } from '../../../config/borderRadius';
import { Typography } from '../../../config/typography';
import { Spacing } from '../../../config/spacing';

interface PledgedExperiencePreviewProps {
    experience: {
        experienceId: string;
        title: string;
        subtitle: string;
        description: string;
        category: string;
        price: number;
        coverImageUrl: string;
        imageUrl: string[];
        partnerId: string;
        location?: string;
    };
    /** "Pledged" = user pledged but no gift bought, "Gift Received" = gift attached */
    status: 'pledged' | 'gift_received';
    /** Current session count / total for the progress label */
    sessionsCompleted?: number;
    totalSessions?: number;
    onPress?: () => void;
}

const PledgedExperiencePreview: React.FC<PledgedExperiencePreviewProps> = ({
    experience,
    status,
    sessionsCompleted,
    totalSessions,
}) => {
    const { t } = useTranslation();
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const isGiftReceived = status === 'gift_received';
    const showProgress = sessionsCompleted !== undefined && totalSessions !== undefined && totalSessions > 0;
    const progressPct = showProgress ? Math.min((sessionsCompleted! / totalSessions!) * 100, 100) : 0;

    return (
        <View style={styles.container}>
            {/* Thin progress track at top */}
            {showProgress && (
                <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                </View>
            )}

            <View style={styles.row}>
                {/* Small thumbnail or icon */}
                {experience.coverImageUrl ? (
                    <Image source={{ uri: experience.coverImageUrl }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={`${experience.title} thumbnail`} />
                ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                        <Gift size={14} color={colors.primary} />
                    </View>
                )}

                {/* Title + status */}
                <View style={styles.info}>
                    <Text style={styles.title} numberOfLines={1}>{experience.title}</Text>
                    <Text style={styles.subtitle}>
                        {isGiftReceived ? t('recipient.pledgedExperience.giftReceived') : t('recipient.pledgedExperience.yourReward')}
                        {showProgress ? ` · ${sessionsCompleted}/${totalSessions}` : ''}
                    </Text>
                </View>

                {/* Status indicator */}
                {isGiftReceived && (
                    <View style={styles.checkBadge}>
                        <Check size={12} color={colors.white} strokeWidth={3} />
                    </View>
                )}
            </View>
        </View>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    container: {
        backgroundColor: colors.primarySurface,
        borderRadius: BorderRadius.sm,
        marginTop: Spacing.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.primaryBorder,
    },
    progressTrack: {
        height: 3,
        backgroundColor: colors.primaryTint,
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.primary,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.sm,
        gap: Spacing.sm,
    },
    thumb: {
        width: 32,
        height: 32,
        borderRadius: BorderRadius.xs,
        backgroundColor: colors.border,
    },
    thumbFallback: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primaryTint,
    },
    info: {
        flex: 1,
    },
    title: {
        ...Typography.caption,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    subtitle: {
        ...Typography.tiny,
        fontWeight: '500',
        color: colors.textMuted,
        marginTop: 1,
    },
    checkBadge: {
        width: 20,
        height: 20,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default React.memo(PledgedExperiencePreview);
