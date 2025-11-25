import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Image,
    Animated,
} from 'react-native';
import { X, Send } from 'lucide-react-native';
import { commentService } from '../services/CommentService';
import type { Comment } from '../types';
import { useApp } from '../context/AppContext';

interface CommentModalProps {
    visible: boolean;
    postId: string;
    onClose: () => void;
    onChange?: () => void;
}

const CommentModal: React.FC<CommentModalProps> = ({ visible, postId, onClose, onChange }) => {
    const { state } = useApp();
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentText, setCommentText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const slideAnim = useRef(new Animated.Value(1000)).current;

    useEffect(() => {
        if (visible) {
            loadComments();
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 80,
                friction: 10,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: 1000,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, postId]);

    const loadComments = async () => {
        setIsLoading(true);
        try {
            const loadedComments = await commentService.getComments(postId);
            setComments(loadedComments);
        } catch (error) {
            console.error('Error loading comments:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendComment = async () => {
        if (!commentText.trim() || !state.user?.id) return;

        setIsSending(true);
        try {
            await commentService.addComment(postId, {
                userId: state.user.id,
                userName: state.user.displayName || state.user.profile?.name || 'User',
                userProfileImageUrl: state.user.profile?.profileImageUrl,
                text: commentText.trim(),
            });

            setCommentText('');
            await loadComments();
            onChange?.();
        } catch (error) {
            console.error('Error sending comment:', error);
        } finally {
            setIsSending(false);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        try {
            await commentService.deleteComment(postId, commentId);
            await loadComments();
            onChange?.();
        } catch (error) {
            console.error('Error deleting comment:', error);
        }
    };

    const renderComment = ({ item }: { item: Comment }) => {
        const isOwnComment = state.user?.id === item.userId;

        return (
            <View style={styles.commentItem}>
                {item.userProfileImageUrl ? (
                    <Image source={{ uri: item.userProfileImageUrl }} style={styles.avatar} />
                ) : (
                    <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>
                            {item.userName?.[0]?.toUpperCase() || 'U'}
                        </Text>
                    </View>
                )}

                <View style={styles.commentContent}>
                    <View style={styles.commentHeader}>
                        <Text style={styles.userName}>{item.userName}</Text>
                        {isOwnComment && (
                            <TouchableOpacity
                                onPress={() => handleDeleteComment(item.id)}
                                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                            >
                                <Text style={styles.deleteText}>Delete</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text style={styles.commentText}>{item.text}</Text>
                    <Text style={styles.timestamp}>{getTimeAgo(item.createdAt)}</Text>
                </View>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity
                    style={styles.backdrop}
                    activeOpacity={1}
                    onPress={onClose}
                />
                <Animated.View
                    style={[
                        styles.modalContainer,
                        { transform: [{ translateY: slideAnim }] }
                    ]}
                >
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.keyboardView}
                    >
                        <View style={styles.header}>
                            <Text style={styles.headerTitle}>Comments</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <X color="#6b7280" size={24} />
                            </TouchableOpacity>
                        </View>

                        {isLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#8b5cf6" />
                            </View>
                        ) : comments.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>No comments yet</Text>
                                <Text style={styles.emptySubtext}>Be the first to comment!</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={comments}
                                keyExtractor={(item) => item.id}
                                renderItem={renderComment}
                                contentContainerStyle={styles.commentsList}
                                showsVerticalScrollIndicator={false}
                            />
                        )}

                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="Write a comment..."
                                placeholderTextColor="#9ca3af"
                                value={commentText}
                                onChangeText={setCommentText}
                                multiline
                                maxLength={300}
                            />
                            <TouchableOpacity
                                style={[
                                    styles.sendButton,
                                    (!commentText.trim() || isSending) && styles.sendButtonDisabled,
                                ]}
                                onPress={handleSendComment}
                                disabled={!commentText.trim() || isSending}
                            >
                                {isSending ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Send color="#fff" size={20} />
                                )}
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </Animated.View>
            </View>
        </Modal>
    );
};

const getTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString();
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContainer: {
        height: '70%',
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
    keyboardView: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    closeButton: {
        padding: 4,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#6b7280',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#9ca3af',
    },
    commentsList: {
        padding: 20,
        paddingHorizontal: 16,
    },
    commentItem: {
        flexDirection: 'row',
        marginBottom: 16,
        gap: 12,
        paddingRight: 8,
        alignItems: 'flex-start',
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    avatarPlaceholder: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#e0e7ff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#4f46e5',
    },
    commentContent: {
        flex: 1,
        maxWidth: '85%',
    },
    commentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    userName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111827',
        flexShrink: 1,
    },
    deleteText: {
        fontSize: 13,
        color: '#ef4444',
        fontWeight: '600',
    },
    commentText: {
        fontSize: 15,
        color: '#374151',
        lineHeight: 20,
        marginBottom: 4,
    },
    timestamp: {
        fontSize: 12,
        color: '#9ca3af',
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
        gap: 12,
        alignItems: 'flex-end',
    },
    input: {
        flex: 1,
        backgroundColor: '#f3f4f6',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 15,
        color: '#111827',
        maxHeight: 100,
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#8b5cf6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#d1d5db',
    },
});

export default CommentModal;
