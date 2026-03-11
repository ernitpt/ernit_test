import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Colors from '../../config/colors';
import { Avatar } from '../Avatar';

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
                <Avatar uri={userProfileImageUrl} name={userName} size="md" />

                <View style={styles.headerInfo}>
                    <Text style={styles.userName} numberOfLines={1}>
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
