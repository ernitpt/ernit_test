import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import Colors from '../../config/colors';

interface FeedPostHeaderProps {
    userName: string;
    userProfileImageUrl?: string;
    typeInfoText: React.ReactNode;
    timeAgo: string;
    onUserPress: () => void;
}

const FeedPostHeader: React.FC<FeedPostHeaderProps> = ({
    userName,
    userProfileImageUrl,
    typeInfoText,
    timeAgo,
    onUserPress,
}) => {
    return (
        <View style={styles.header}>
            <TouchableOpacity
                onPress={onUserPress}
                style={styles.clickableHeader}
                accessibilityRole="button"
                accessibilityLabel={`View ${userName}'s profile`}
            >
                {userProfileImageUrl ? (
                    <Image
                        source={{ uri: userProfileImageUrl }}
                        style={styles.avatar}
                        accessibilityLabel={`${userName}'s profile picture`}
                    />
                ) : (
                    <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>
                            {userName?.[0]?.toUpperCase() || 'U'}
                        </Text>
                    </View>
                )}

                <View style={styles.headerInfo}>
                    <Text style={styles.userName}>
                        <Text style={{ fontWeight: '500' }}>{userName}</Text> {typeInfoText}
                    </Text>
                    <Text style={styles.timeAgo}>{timeAgo}</Text>
                </View>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 10,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    avatarPlaceholder: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.primarySurface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.primary,
    },
    headerInfo: {
        marginLeft: 10,
        flex: 1,
    },
    userName: {
        fontSize: 14,
        color: Colors.textPrimary,
        marginBottom: 1,
    },
    timeAgo: {
        fontSize: 12,
        color: Colors.textMuted,
    },
    clickableHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
});

export default React.memo(FeedPostHeader);
