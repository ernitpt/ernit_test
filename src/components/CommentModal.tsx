import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MotiView, AnimatePresence } from 'moti';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ScrollView,
    Platform,
    ActivityIndicator,
    Animated,
    KeyboardAvoidingView,
} from 'react-native';
import { vh } from '../utils/responsive';
import { ConfirmationDialog } from './ConfirmationDialog';
import { X, Send, MoreHorizontal, Edit2, Trash2, Heart } from 'lucide-react-native';
import { Avatar } from './Avatar';
import { commentService } from '../services/CommentService';
import type { Comment } from '../types';
import { useApp } from '../context/AppContext';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { CommentSkeleton } from './SkeletonLoader';
import { logger } from '../utils/logger';
import { analyticsService } from '../services/AnalyticsService';
import { getTimeAgo } from '../utils/timeUtils';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import { useToast } from '../context/ToastContext';
import { EmptyState } from './EmptyState';
import * as Haptics from 'expo-haptics';

interface CommentModalProps {
    visible: boolean;
    postId: string;
    onClose: () => void;
    onChange?: (newCount?: number) => void;
}

const MODAL_HEIGHT = vh(630);

const CommentModal: React.FC<CommentModalProps> = ({ visible, postId, onClose, onChange }) => {
    const { state } = useApp();
    const { showError } = useToast();
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentText, setCommentText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [menuVisibleId, setMenuVisibleId] = useState<string | null>(null);
    const [originalCommentText, setOriginalCommentText] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const slideAnim = useModalAnimation(visible, {
        initialValue: 1000,
        tension: 80,
        friction: 10,
    });

    useEffect(() => {
        if (visible) {
            loadComments();
        } else {
            setEditingCommentId(null);
            setOriginalCommentText('');
            setCommentText('');
            setMenuVisibleId(null);
        }
    }, [visible, postId]);

    const loadComments = async () => {
        setIsLoading(true);
        try {
            const loadedComments = await commentService.getComments(postId);
            setComments(loadedComments);
        } catch (error) {
            logger.error('Error loading comments:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendComment = async () => {
        if (!commentText.trim() || !state.user?.id) return;

        setIsSending(true);
        try {
            if (editingCommentId) {
                await commentService.updateComment(postId, editingCommentId, commentText.trim());
                setEditingCommentId(null);
                setOriginalCommentText('');
            } else {
                analyticsService.trackEvent('feed_comment', 'social', { postId }, 'CommentModal');
                await commentService.addComment(postId, {
                    userId: state.user.id,
                    userName: state.user.displayName || state.user.profile?.name || 'User',
                    userProfileImageUrl: state.user.profile?.profileImageUrl,
                    text: commentText.trim(),
                });
            }

            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setCommentText('');
            const reloaded = await commentService.getComments(postId);
            setComments(reloaded);
            onChange?.(reloaded.length);
        } catch (error) {
            logger.error('Error sending/updating comment:', error);
            showError('Could not send comment. Please try again.');
        } finally {
            setIsSending(false);
        }
    };

    const startEditing = useCallback((comment: Comment) => {
        setEditingCommentId(comment.id);
        setOriginalCommentText(comment.text);
        setCommentText(comment.text);
        setMenuVisibleId(null);
    }, []);

    const cancelEditing = useCallback(() => {
        setEditingCommentId(null);
        setCommentText('');
        setOriginalCommentText('');
    }, []);

    const handleLikeComment = useCallback(async (comment: Comment) => {
        if (!state.user?.id) return;
        const isLiked = comment.likedBy?.includes(state.user.id);

        setComments(prev => prev.map(c => {
            if (c.id !== comment.id) return c;
            const currentLikedBy = c.likedBy || [];
            return {
                ...c,
                likedBy: isLiked
                    ? currentLikedBy.filter(id => id !== (state.user?.id ?? ""))
                    : [...currentLikedBy, state.user?.id ?? ""],
            };
        }));

        try {
            if (isLiked) {
                await commentService.unlikeComment(postId, comment.id, state.user.id);
            } else {
                await commentService.likeComment(postId, comment.id, state.user.id);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        } catch (error) {
            logger.error('Error toggling comment like:', error);
            await loadComments();
        }
    }, [state.user?.id, postId]);

    const handleDeleteComment = useCallback((commentId: string) => {
        setDeleteConfirmId(commentId);
    }, []);

    const confirmDeleteComment = useCallback(async () => {
        const commentId = deleteConfirmId;
        if (!commentId) return;
        setDeleteConfirmId(null);

        try {
            await commentService.deleteComment(postId, commentId);
            const reloaded = await commentService.getComments(postId);
            setComments(reloaded);
            onChange?.(reloaded.length);
            setMenuVisibleId(null);
        } catch (error) {
            logger.error('Error deleting comment:', error);
            showError('Could not delete comment. Please try again.');
        }
    }, [deleteConfirmId, postId, onChange, showError]);

    const renderCommentItem = (item: Comment) => {
        const isOwnComment = state.user?.id === item.userId;
        const isLiked = item.likedBy?.includes(state.user?.id || '');
        const likeCount = item.likedBy?.length || 0;

        return (
            <View key={item.id} style={styles.commentBubble}>
                {/* Avatar + Name + menu */}
                <View style={styles.bubbleHeader}>
                    <Avatar uri={item.userProfileImageUrl} name={item.userName} size="sm" />
                    <Text style={styles.userName}>{item.userName}</Text>
                    {isOwnComment && (
                        <View style={{ position: 'relative', zIndex: menuVisibleId === item.id ? 100 : 0 }}>
                            <TouchableOpacity
                                onPress={() => setMenuVisibleId(menuVisibleId === item.id ? null : item.id)}
                                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                                style={styles.moreButton}
                                accessibilityLabel="Comment options"
                                accessibilityRole="button"
                            >
                                <MoreHorizontal size={14} color={colors.textMuted} />
                            </TouchableOpacity>

                            <AnimatePresence>
                                {menuVisibleId === item.id && (
                                    <MotiView
                                        key="menu"
                                        from={{ opacity: 0, scale: 0.85, translateY: -4 }}
                                        animate={{ opacity: 1, scale: 1, translateY: 0 }}
                                        exit={{ opacity: 0, scale: 0.85, translateY: -4 }}
                                        transition={{ type: 'timing', duration: 150 }}
                                        style={styles.menuDropdown}
                                    >
                                        <TouchableOpacity
                                            style={styles.menuItem}
                                            onPress={() => startEditing(item)}
                                        >
                                            <Edit2 size={14} color={colors.gray600} />
                                            <Text style={styles.menuText}>Edit</Text>
                                        </TouchableOpacity>
                                        <View style={styles.menuDivider} />
                                        <TouchableOpacity
                                            style={styles.menuItem}
                                            onPress={() => handleDeleteComment(item.id)}
                                        >
                                            <Trash2 size={14} color={colors.error} />
                                            <Text style={[styles.menuText, { color: colors.error }]}>Delete</Text>
                                        </TouchableOpacity>
                                    </MotiView>
                                )}
                            </AnimatePresence>
                        </View>
                    )}
                </View>

                {/* Comment text */}
                <Text style={styles.commentText}>{item.text}</Text>

                {/* Meta row */}
                <View style={styles.bubbleMeta}>
                    <Text style={styles.timestamp}>{getTimeAgo(item.createdAt)}</Text>
                    {item.updatedAt && <Text style={styles.editedTag}>edited</Text>}
                    <TouchableOpacity
                        onPress={() => handleLikeComment(item)}
                        style={styles.likeButton}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Heart
                            size={13}
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
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            {/* Full-screen backdrop */}
            <TouchableOpacity
                style={styles.backdrop}
                activeOpacity={1}
                onPress={onClose}
            />

            {/* Bottom sheet container — absolute positioned, fixed pixel height */}
            <Animated.View
                style={[
                    styles.modalContainer,
                    { transform: [{ translateY: slideAnim }] }
                ]}
                accessibilityViewIsModal={true}
            >
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Comments</Text>
                    <TouchableOpacity
                        onPress={onClose}
                        style={styles.closeButton}
                        accessibilityLabel="Close comments"
                        accessibilityRole="button"
                    >
                        <X color={colors.textSecondary} size={24} />
                    </TouchableOpacity>
                </View>

                {/* Scrollable content area */}
                <ScrollView
                    style={styles.scrollArea}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >
                    {isLoading ? (
                        <>
                            {[1, 2, 3, 4].map((i) => (
                                <CommentSkeleton key={i} />
                            ))}
                        </>
                    ) : comments.length === 0 ? (
                        <EmptyState
                            icon="💬"
                            title="No comments yet"
                            message="Be the first to comment!"
                        />
                    ) : (
                        comments.map(renderCommentItem)
                    )}
                </ScrollView>

                {/* Input bar — always visible at bottom */}
                <View style={styles.inputContainer}>
                    {editingCommentId && (
                        <TouchableOpacity
                            onPress={cancelEditing}
                            style={styles.cancelEditButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <X size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                    <View style={styles.inputWrapper}>
                        <TextInput
                            style={styles.input}
                            placeholder={editingCommentId ? "Edit your comment..." : "Write a comment..."}
                            placeholderTextColor={colors.textMuted}
                            value={commentText}
                            onChangeText={setCommentText}
                            multiline
                            maxLength={300}
                            autoFocus={!!editingCommentId}
                            returnKeyType="send"
                            onSubmitEditing={handleSendComment}
                        />
                        <Text style={[styles.charCount, commentText.length > 280 && { color: colors.error }]}>
                            {commentText.length}/300
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!commentText.trim() || isSending) && styles.sendButtonDisabled,
                        ]}
                        onPress={handleSendComment}
                        disabled={!commentText.trim() || isSending}
                    >
                        {isSending ? (
                            <ActivityIndicator size="small" color={colors.white} />
                        ) : editingCommentId ? (
                            <Edit2 color={colors.white} size={18} />
                        ) : (
                            <Send color={colors.white} size={20} />
                        )}
                    </TouchableOpacity>
                </View>
                </KeyboardAvoidingView>
            </Animated.View>
            <ConfirmationDialog
                visible={deleteConfirmId !== null}
                title="Delete Comment"
                message="Are you sure you want to delete this comment?"
                confirmLabel="Delete"
                onConfirm={confirmDeleteComment}
                onCancel={() => setDeleteConfirmId(null)}
                variant="danger"
            />
        </Modal>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.overlay,
    },
    modalContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: MODAL_HEIGHT,
        backgroundColor: colors.white,
        borderTopLeftRadius: BorderRadius.xxl,
        borderTopRightRadius: BorderRadius.xxl,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.xl,
        paddingBottom: Spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: colors.backgroundLight,
    },
    headerTitle: {
        ...Typography.large,
        color: colors.textPrimary,
    },
    closeButton: {
        padding: Spacing.xs,
    },
    scrollArea: {
        flex: 1,
    },
    scrollContent: {
        paddingVertical: Spacing.lg,
        paddingHorizontal: Spacing.xl,
    },
    commentBubble: {
        backgroundColor: colors.surface,
        borderRadius: BorderRadius.lg,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        marginBottom: Spacing.md,
        overflow: 'visible',
    },
    bubbleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    userName: {
        ...Typography.smallBold,
        color: colors.textPrimary,
        flex: 1,
    },
    commentText: {
        ...Typography.body,
        color: colors.gray700,
        lineHeight: 21,
    },
    bubbleMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginTop: Spacing.xs,
    },
    timestamp: {
        ...Typography.caption,
        color: colors.textMuted,
    },
    editedTag: {
        ...Typography.caption,
        color: colors.textMuted,
        fontStyle: 'italic',
    },
    inputContainer: {
        flexDirection: 'row',
        padding: Spacing.lg,
        borderTopWidth: 1,
        borderTopColor: colors.backgroundLight,
        gap: Spacing.md,
        alignItems: 'flex-end',
        backgroundColor: colors.white,
    },
    inputWrapper: {
        flex: 1,
    },
    input: {
        backgroundColor: colors.backgroundLight,
        borderRadius: BorderRadius.xl,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        ...Typography.body,
        color: colors.textPrimary,
        maxHeight: 100,
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.circle,
        backgroundColor: colors.secondary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: colors.gray300,
    },
    charCount: {
        ...Typography.caption,
        color: colors.textMuted,
        textAlign: 'right' as const,
        marginTop: Spacing.xs,
        paddingHorizontal: Spacing.lg,
    },
    moreButton: {
        padding: Spacing.sm,
    },
    menuDropdown: {
        position: 'absolute',
        top: 30,
        right: 0,
        backgroundColor: colors.white,
        borderRadius: BorderRadius.md,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
        zIndex: 1000,
        minWidth: 140,
        borderWidth: 1,
        borderColor: colors.border,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.lg,
        gap: Spacing.sm,
    },
    menuText: {
        ...Typography.small,
        color: colors.gray700,
        fontWeight: '500',
    },
    menuDivider: {
        height: 1,
        backgroundColor: colors.backgroundLight,
    },
    cancelEditButton: {
        padding: Spacing.sm,
        marginRight: Spacing.xs,
    },
    likeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xxs,
        marginLeft: 'auto',
        paddingVertical: Spacing.xxs,
        paddingHorizontal: Spacing.xs,
    },
    likeCount: {
        ...Typography.caption,
        color: colors.textMuted,
        fontWeight: '600',
    },
});

export default React.memo(CommentModal);
