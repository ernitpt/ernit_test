import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import type { Comment as CommentType } from '../types';
import Colors from '../config/colors';

interface CommentSectionProps {
    comments: CommentType[];
    totalComments: number;
    onViewAll: () => void;
}

const CommentSection: React.FC<CommentSectionProps> = ({
    comments,
    totalComments,
    onViewAll,
}) => {
    if (totalComments === 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            {totalComments > comments.length && (
                <TouchableOpacity onPress={onViewAll} style={styles.viewAllButton}>
                    <Text style={styles.viewAllText}>
                        View all {totalComments} comments
                    </Text>
                </TouchableOpacity>
            )}

            {comments.map((comment) => (
                <View key={comment.id} style={styles.commentItem}>
                    {comment.userProfileImageUrl ? (
                        <Image
                            source={{ uri: comment.userProfileImageUrl }}
                            style={styles.avatar}
                        />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarText}>
                                {comment.userName?.[0]?.toUpperCase() || 'U'}
                            </Text>
                        </View>
                    )}

                    <View style={styles.commentContent}>
                        <Text style={styles.userName}>{comment.userName}</Text>
                        <Text style={styles.commentText}>{comment.text}</Text>
                    </View>
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: 8,
    },
    viewAllButton: {
        marginBottom: 8,
    },
    viewAllText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.secondary,
    },
    commentItem: {
        flexDirection: 'row',
        marginBottom: 8,
        gap: 8,
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    avatarPlaceholder: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#e0e7ff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.accentDark,
    },
    commentContent: {
        flex: 1,
        backgroundColor: '#f9fafb',
        padding: 8,
        borderRadius: 12,
    },
    userName: {
        fontSize: 13,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 2,
    },
    commentText: {
        fontSize: 14,
        color: '#374151',
        lineHeight: 18,
    },
});

export default CommentSection;
