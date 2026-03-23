import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, useColors, Typography, Spacing, BorderRadius } from '../../config';
import { Avatar } from '../Avatar';

interface FeedPostHeaderProps {
    userName: string;
    userProfileImageUrl?: string;
    typeInfoText: React.ReactNode;
    timeAgo: string;
    onUserPress: () => void;
    typeColor: string;
    typeLabel: string;
}

const FeedPostHeader: React.FC<FeedPostHeaderProps> = ({
    userName,
    userProfileImageUrl,
    typeInfoText,
    timeAgo,
    onUserPress,
    typeColor,
    typeLabel,
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <View style={styles.header}>
            <TouchableOpacity
                onPress={onUserPress}
                style={styles.clickableHeader}
                accessibilityRole="button"
                accessibilityLabel={`View ${userName}'s profile`}
            >
                <Avatar
                    uri={userProfileImageUrl}
                    name={userName}
                    size="md"
                    style={{ borderWidth: 2, borderColor: typeColor + '4D' }}
                />

                <View style={styles.headerInfo}>
                    <Text style={styles.userName} numberOfLines={1}>
                        <Text style={{ ...Typography.bodyBold }}>{userName}</Text>{' '}{typeInfoText}
                    </Text>
                    <View style={styles.metaRow}>
                        <Text style={styles.timeAgo}>{timeAgo}</Text>
                        {typeLabel ? (
                            <View style={[styles.typeChip, { backgroundColor: typeColor + '1A' }]}>
                                <Text style={[styles.typeChipText, { color: typeColor }]}>{typeLabel}</Text>
                            </View>
                        ) : null}
                    </View>
                </View>
            </TouchableOpacity>
        </View>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    headerInfo: {
        marginLeft: Spacing.md,
        flex: 1,
    },
    userName: {
        ...Typography.small,
        color: colors.textPrimary,
        marginBottom: Spacing.xxs,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    timeAgo: {
        ...Typography.caption,
        color: colors.textMuted,
    },
    typeChip: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.pill,
    },
    typeChipText: {
        ...Typography.tiny,
    },
    clickableHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
});

export default React.memo(FeedPostHeader);
