import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Heart } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { Comment as CommentType } from '../types';
import { commentService } from '../services/CommentService';
import { useApp } from '../context/AppContext';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { Avatar } from './Avatar';
import { logger } from '../utils/logger';

interface CommentSectionProps {
    comments: CommentType[];
    totalComments: number;
    postId: string;
    onViewAll: () => void;
    onCommentsUpdate?: (comments: CommentType[]) => void;
}

const CommentSection: React.FC<CommentSectionProps> = ({
    comments,
    totalComments,
    postId,
    onViewAll,
    onCommentsUpdate,
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const { state } = useApp();
    const currentUserId = state.user?.id || '';

    const handleLike = async (comment: CommentType) => {
        if (!currentUserId) return;
        const isLiked = comment.likedBy?.includes(currentUserId);

        // Optimistic update
        const updated = comments.map(c => {
            if (c.id !== comment.id) return c;
            const currentLikedBy = c.likedBy || [];
            return {
                ...c,
                likedBy: isLiked
                    ? currentLikedBy.filter(id => id !== currentUserId)
                    : [...currentLikedBy, currentUserId],
            };
        });
        onCommentsUpdate?.(updated);

        try {
            if (isLiked) {
                await commentService.unlikeComment(postId, comment.id, currentUserId);
            } else {
                await commentService.likeComment(postId, comment.id, currentUserId);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        } catch (error) {
            logger.error('Error toggling comment like:', error);
        }
    };

    if (totalComments === 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            {comments.map((comment) => {
                const isLiked = comment.likedBy?.includes(currentUserId);
                const likeCount = comment.likedBy?.length || 0;

                return (
                    <View key={comment.id} style={styles.commentBubble}>
                        <View style={styles.commentTop}>
                            <Avatar uri={comment.userProfileImageUrl} name={comment.userName} size="sm" />
                            <Text style={styles.userName}>{comment.userName}</Text>
                            <TouchableOpacity
                                onPress={() => handleLike(comment)}
                                style={styles.likeButton}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Heart
                                    size={14}
                                    color={isLiked ? colors.error : colors.textMuted}
                                    fill={isLiked ? colors.error : 'none'}
                                />
                                {likeCount > 0 && (
                                    <Text style={[styles.likeCount, isLiked && { color: colors.error }]}>
                                        {likeCount}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.commentText}>{comment.text}</Text>
                    </View>
                );
            })}

            {totalComments > comments.length && (
                <TouchableOpacity
                    onPress={onViewAll}
                    style={styles.viewAllButton}
                    accessibilityRole="button"
                    accessibilityLabel={`View all ${totalComments} comments`}
                >
                    <Text style={styles.viewAllText}>
                        View all {totalComments} comments
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        container: {
            marginTop: Spacing.sm,
        },
        viewAllButton: {
            marginTop: Spacing.xs,
            marginLeft: Spacing.xl,
            minHeight: 44,
            justifyContent: 'center',
        },
        viewAllText: {
            ...Typography.small,
            color: colors.textMuted,
        },
        commentBubble: {
            backgroundColor: colors.surface,
            borderRadius: BorderRadius.md,
            padding: Spacing.md,
            marginBottom: Spacing.sm,
            marginRight: Spacing.xxl,
        },
        commentTop: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            marginBottom: Spacing.xs,
        },
        userName: {
            ...Typography.caption,
            fontWeight: '600',
            color: colors.textPrimary,
            flex: 1,
        },
        commentText: {
            ...Typography.small,
            color: colors.gray700,
            lineHeight: 18,
            marginLeft: 40,
        },
        likeButton: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.xxs,
        },
        likeCount: {
            ...Typography.tiny,
            color: colors.textMuted,
        },
    });

export default React.memo(CommentSection);
