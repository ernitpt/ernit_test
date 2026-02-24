import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Animated,
    Modal,
    TextInput,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { MessageCircle, Heart, Send } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FeedPost as FeedPostType, ReactionType, Comment as CommentType, RootStackParamList } from '../types';
import CompactReactionBar from './CompactReactionBar';
import CommentSection from './CommentSection';
import CommentModal from './CommentModal';
import ReactionViewerModal from './ReactionViewerModal';
import { reactionService } from '../services/ReactionService';
import { commentService } from '../services/CommentService';
import { experienceService } from '../services/ExperienceService';
import { motivationService } from '../services/MotivationService';
import { useApp } from '../context/AppContext';
import { logger } from '../utils/logger';
import Colors from '../config/colors';
import { commonStyles } from '../styles/commonStyles';

interface FeedPostProps {
    post: FeedPostType;
    isHighlighted?: boolean;
}

const FeedPost: React.FC<FeedPostProps> = ({ post, isHighlighted = false }) => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { state } = useApp();
    const [userReaction, setUserReaction] = useState<ReactionType | null>(null);
    const [comments, setComments] = useState<CommentType[]>([]);
    const [reactionCounts, setReactionCounts] = useState(post.reactionCounts);
    const [commentCount, setCommentCount] = useState(post.commentCount);
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [showReactionModal, setShowReactionModal] = useState(false);
    const [showMotivationModal, setShowMotivationModal] = useState(false);
    const [motivationText, setMotivationText] = useState('');
    const [sendingMotivation, setSendingMotivation] = useState(false);

    // Animated value for highlight effect
    const highlightAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        loadUserReaction();
        loadComments();
    }, [post.id]);

    // Animate highlight effect
    useEffect(() => {
        if (isHighlighted) {
            // Fade in with easing
            Animated.timing(highlightAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: false,
                easing: (t) => t * t, // Ease in
            }).start(() => {
                // Wait 3 seconds, then fade out
                setTimeout(() => {
                    Animated.timing(highlightAnim, {
                        toValue: 0,
                        duration: 800,
                        useNativeDriver: false,
                        easing: (t) => 1 - (1 - t) * (1 - t), // Ease out
                    }).start();
                }, 3000);
            });
        } else {
            highlightAnim.setValue(0);
        }
    }, [isHighlighted]);

    const loadUserReaction = async () => {
        if (!state.user?.id) return;
        try {
            const reaction = await reactionService.getUserReaction(post.id, state.user.id);
            setUserReaction(reaction?.type || null);
        } catch (error) {
            logger.error('Error loading user reaction:', error);
        }
    };

    const loadComments = async () => {
        try {
            const loadedComments = await commentService.getComments(post.id, 3);
            setComments(loadedComments);
            const allComments = await commentService.getComments(post.id);
            setCommentCount(allComments.length);
        } catch (error) {
            logger.error('Error loading comments:', error);
        }
    };

    const handleCommentsChange = async () => {
        await loadComments();
    };

    const handleReact = async (type: ReactionType) => {
        if (!state.user?.id) return;

        const previousReaction = userReaction;
        const previousCounts = { ...reactionCounts };

        if (userReaction === type) {
            setUserReaction(null);
            setReactionCounts({
                ...reactionCounts,
                [type]: Math.max(0, reactionCounts[type] - 1),
            });
        } else {
            setUserReaction(type);
            const newCounts = { ...reactionCounts };
            if (previousReaction) {
                newCounts[previousReaction] = Math.max(0, newCounts[previousReaction] - 1);
            }
            newCounts[type] = newCounts[type] + 1;
            setReactionCounts(newCounts);
        }

        try {
            await reactionService.addReaction(
                post.id,
                state.user.id,
                state.user.displayName || state.user.profile?.name || 'User',
                type
            );
        } catch (error) {
            logger.error('Error reacting:', error);
            setUserReaction(previousReaction);
            setReactionCounts(previousCounts);
        }
    };
    const handleSendMotivation = async () => {
        if (!motivationText.trim() || !state.user?.id) return;
        setSendingMotivation(true);
        try {
            await motivationService.leaveMotivation(
                post.goalId,
                state.user.id,
                state.user.displayName || state.user.profile?.name || 'A friend',
                motivationText.trim(),
                state.user.profile?.profileImageUrl,
            );
            setMotivationText('');
            setShowMotivationModal(false);
            Alert.alert('Sent!', 'Your motivation has been sent!');
        } catch (error) {
            logger.error('Error sending motivation:', error);
            Alert.alert('Error', 'Failed to send motivation. Please try again.');
        } finally {
            setSendingMotivation(false);
        }
    };

    const handleEmpower = async () => {
        if (!post.pledgedExperienceId) return;
        try {
            const experience = await experienceService.getExperienceById(post.pledgedExperienceId);
            if (experience) {
                navigation.navigate('ExperienceDetails', { experience });
            }
        } catch (error) {
            logger.error('Error navigating to experience:', error);
        }
    };

    // get third word from goal description
    const getActivityType = (text) => {
        if (!text) return '';
        const words = text.trim().split(/\s+/);
        return words[2] || words[words.length - 1]; // fallback if fewer than 3 words
    };

    const getPostTypeInfo = () => {
        switch (post.type) {
            case 'goal_started':
                return {
                    text: 'set a new goal',
                    color: Colors.accent,
                };
            case 'goal_approved':
                return {
                    text: 'got goal approved!',
                    color: '#10b981',
                };
            case 'session_progress':
            case 'goal_progress': // Support migrated posts with this type
                return {
                    text: (<>completed <Text style={{ fontWeight: '500' }}>{getActivityType(post.goalDescription)}</Text> session</>),
                    color: Colors.secondary,
                };
            case 'goal_completed':
                return {
                    text: (<>completed goal and earned: </>), //<Text style={{ fontWeight: '500' }}>{post.experienceTitle}</Text>
                    color: '#22c55e',
                };
            default:
                // Fallback for unknown post types
                return {
                    text: 'made progress',
                    color: '#6b7280',
                };
        }
    };

    const handleUserPress = () => {
        if (post.userId === state.user?.id) {
            navigation.navigate('Profile');
        } else {
            navigation.navigate('FriendProfile', { userId: post.userId });
        }
    };

    const typeInfo = getPostTypeInfo();
    const timeAgo = getTimeAgo(post.createdAt);

    // Interpolate shadow for smooth animation
    const animatedShadowRadius = highlightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [8, 20],
    });

    const animatedShadowOpacity = highlightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.05, 0.35],
    });

    // Create web-compatible box shadow
    const shadowColor = isHighlighted ? '139, 92, 246' : '0, 0, 0';

    return (
        <Animated.View style={[
            styles.container,
            {
                // iOS shadow
                shadowColor: isHighlighted ? Colors.secondary : '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowRadius: animatedShadowRadius,
                shadowOpacity: animatedShadowOpacity,
                // Android elevation
                elevation: highlightAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [2, 8],
                }),
                // Web shadow (boxShadow)
                boxShadow: highlightAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [
                        `0 2px 8px rgba(${shadowColor}, 0.05)`,
                        `0 2px 20px rgba(${shadowColor}, 0.35)`,
                    ],
                }),
            }
        ]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={handleUserPress} style={styles.clickableHeader}>
                    {post.userProfileImageUrl ? (
                        <Image
                            source={{ uri: post.userProfileImageUrl }}
                            style={styles.avatar}
                        />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarText}>
                                {post.userName?.[0]?.toUpperCase() || 'U'}
                            </Text>
                        </View>
                    )}

                    <View style={styles.headerInfo}>
                        <Text style={styles.userName}>
                            <Text style={{ fontWeight: '500' }}>{post.userName}</Text> {typeInfo.text}
                        </Text>
                        <Text style={styles.timeAgo}>{timeAgo}</Text>
                    </View>
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                {post.type === 'session_progress' && post.sessionNumber && post.totalSessions && (
                    <>
                        <View style={styles.progressBlock}>
                            <View style={styles.progressHeader}>
                                <Text style={styles.progressLabel}>Sessions this week</Text>
                                <Text style={styles.progressText}>
                                    {post.weeklyCount || 0}/{post.sessionsPerWeek || 1}
                                </Text>
                            </View>
                            <View style={styles.capsuleRow}>
                                {Array.from({ length: post.sessionsPerWeek || 1 }, (_, i) => (
                                    <View
                                        key={i}
                                        style={[
                                            styles.capsule,
                                            i < (post.weeklyCount || 0)
                                                ? { backgroundColor: '#84b3e9ff' }
                                                : { backgroundColor: '#E5E7EB' },
                                        ]}
                                    />
                                ))}
                            </View>
                        </View>

                        <View style={styles.progressBlock}>
                            <View style={styles.progressHeader}>
                                <Text style={styles.progressLabel}>Weeks completed</Text>
                                <Text style={styles.progressText}>
                                    {Math.floor((post.sessionNumber - post.weeklyCount) / post.sessionsPerWeek)}/{post.totalSessions / post.sessionsPerWeek}
                                </Text>
                            </View>
                            <View style={styles.capsuleRow}>
                                {Array.from({ length: Math.min(post.totalSessions / post.sessionsPerWeek, 20) }, (_, i) => (
                                    <View
                                        key={i}
                                        style={[
                                            styles.capsule,
                                            i < Math.floor((post.sessionNumber - post.weeklyCount) / post.sessionsPerWeek)
                                                ? { backgroundColor: '#84b3e9ff' }
                                                : { backgroundColor: '#E5E7EB' },
                                        ]}
                                    />
                                ))}
                            </View>
                        </View>
                    </>
                )}
                {post.type === 'goal_completed' && post.experienceTitle ? (
                    <View style={styles.experienceSection}>
                        {post.experienceImageUrl ? (
                            <Image source={{ uri: post.experienceImageUrl }} style={styles.experienceImage} />
                        ) : (
                            <View style={[styles.experienceImage, styles.experienceImagePlaceholder]}>
                                <Text style={styles.experienceImagePlaceholderText}>??</Text>
                            </View>
                        )}
                        <View style={styles.experienceContent}>
                            <Text style={styles.experienceTitle} numberOfLines={1}>
                                {post.experienceTitle}
                            </Text>
                            {post.partnerName && (
                                <Text style={styles.partnerName} numberOfLines={1}>
                                    ?? {post.partnerName}
                                </Text>
                            )}
                            <Text style={styles.goalDescriptionText} numberOfLines={2}>
                                Goal: {post.goalDescription}
                            </Text>
                            {post.totalSessions && post.sessionsPerWeek && (
                                <Text style={styles.experienceMeta}>
                                    {post.totalSessions} sessions completed • {post.totalSessions / post.sessionsPerWeek} weeks
                                </Text>
                            )}
                        </View>
                    </View>
                ) : post.type != 'session_progress' ? (
                    <View>
                        <Text style={styles.activityText}>
                            <Text style={styles.progressLabel}>{post.goalDescription}</Text>
                        </Text>
                    </View>
                ) : null}
            </View>

            <View style={styles.interactionRow}>
                <CompactReactionBar
                    reactionCounts={reactionCounts}
                    userReaction={userReaction}
                    onReact={handleReact}
                    onViewReactions={() => setShowReactionModal(true)}
                />

                <TouchableOpacity
                    style={styles.commentIconButton}
                    onPress={() => setShowCommentModal(true)}
                    activeOpacity={0.7}
                >
                    <MessageCircle color="#6b7280" size={18} />
                    {commentCount > 0 && (
                        <Text style={styles.commentCountText}>{commentCount}</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Free Goal: Experience Card Preview (milestone/completion posts) */}
            {post.isFreeGoal && post.pledgedExperienceId && post.userId !== state.user?.id &&
                (post.type === 'session_progress' || post.type === 'goal_completed') &&
                post.experienceTitle && (
                    <TouchableOpacity style={styles.experiencePreviewCard} onPress={handleEmpower} activeOpacity={0.85}>
                        {post.experienceImageUrl && (
                            <Image source={{ uri: post.experienceImageUrl }} style={styles.experiencePreviewImage} />
                        )}
                        <View style={styles.experiencePreviewInfo}>
                            <Text style={styles.experiencePreviewTitle} numberOfLines={1}>{post.experienceTitle}</Text>
                            {post.pledgedExperiencePrice && (
                                <Text style={styles.experiencePreviewPrice}>{'\u20AC'}{post.pledgedExperiencePrice}</Text>
                            )}
                        </View>
                        <View style={styles.experiencePreviewCta}>
                            <Text style={styles.experiencePreviewCtaText}>Gift</Text>
                        </View>
                    </TouchableOpacity>
                )}

            {/* Free Goal Action Buttons */}
            {post.isFreeGoal && post.userId !== state.user?.id && (
                <View style={styles.freeGoalActions}>
                    {post.pledgedExperienceId && (
                        <TouchableOpacity
                            style={[
                                styles.empowerButton,
                                (post.type === 'session_progress' || post.type === 'goal_completed') && styles.prominentEmpowerButton,
                            ]}
                            onPress={handleEmpower}
                            activeOpacity={0.8}
                        >
                            <Heart
                                color={(post.type === 'session_progress' || post.type === 'goal_completed') ? '#fff' : '#ec4899'}
                                size={16}
                                fill={(post.type === 'session_progress' || post.type === 'goal_completed') ? '#fff' : '#ec4899'}
                            />
                            <Text style={[
                                styles.empowerButtonText,
                                (post.type === 'session_progress' || post.type === 'goal_completed') && styles.prominentEmpowerButtonText,
                            ]}>
                                {post.type === 'goal_completed' ? '?? Gift This Experience' : post.type === 'session_progress' ? '?? Empower Now' : 'Empower'}
                            </Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={styles.motivateButton}
                        onPress={() => setShowMotivationModal(true)}
                        activeOpacity={0.8}
                    >
                        <Send color={Colors.secondary} size={16} />
                        <Text style={styles.motivateButtonText}>Motivate</Text>
                    </TouchableOpacity>
                </View>
            )}

            {comments.length > 0 && (
                <>
                    <View style={styles.divider} />
                    <CommentSection
                        comments={comments}
                        totalComments={commentCount}
                        onViewAll={() => setShowCommentModal(true)}
                    />
                </>
            )}

            {/* Motivation Modal */}
            <Modal
                visible={showMotivationModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowMotivationModal(false)}
            >
                <TouchableOpacity
                    style={commonStyles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowMotivationModal(false)}
                >
                    <View style={styles.motivationModal}>
                        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                            <Text style={styles.motivationModalTitle}>Send Motivation</Text>
                            <Text style={styles.motivationModalSubtitle}>
                                Leave an encouraging message for {post.userName}
                            </Text>
                            <TextInput
                                style={styles.motivationInput}
                                placeholder="You've got this! Keep going..."
                                value={motivationText}
                                onChangeText={setMotivationText}
                                multiline
                                maxLength={500}
                            />
                            <Text style={styles.motivationCharCount}>
                                {motivationText.length}/500
                            </Text>
                            <View style={styles.motivationModalButtons}>
                                <TouchableOpacity
                                    style={styles.motivationCancelButton}
                                    onPress={() => setShowMotivationModal(false)}
                                >
                                    <Text style={styles.motivationCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.motivationSendButton,
                                        (!motivationText.trim() || sendingMotivation) && { opacity: 0.5 },
                                    ]}
                                    onPress={handleSendMotivation}
                                    disabled={!motivationText.trim() || sendingMotivation}
                                >
                                    {sendingMotivation ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <Text style={styles.motivationSendText}>Send</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            <CommentModal
                visible={showCommentModal}
                postId={post.id}
                onClose={() => setShowCommentModal(false)}
                onChange={handleCommentsChange}
            />

            <ReactionViewerModal
                visible={showReactionModal}
                postId={post.id}
                onClose={() => setShowReactionModal(false)}
            />
        </Animated.View>
    );
};

const getTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    highlightedContainer: {
        borderWidth: 2,
        borderColor: Colors.secondary,
        backgroundColor: Colors.primarySurface,
        shadowOpacity: 0.15,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    avatarPlaceholder: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#e0e7ff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.accentDark,
    },
    headerInfo: {
        marginLeft: 12,
        flex: 1,
    },
    userName: {
        fontSize: 16,
        color: '#111827',
        marginBottom: 2,
    },
    timeAgo: {
        fontSize: 13,
        color: '#9ca3af',
    },
    content: {
        marginBottom: 12,
    },
    activityText: {
        fontSize: 15,
        lineHeight: 22,
        color: '#374151',
    },
    separator: {
        color: '#d1d5db',
        fontWeight: '400',
    },
    goalTitle: {
        fontWeight: '500',
        color: '#354668ff',
    },
    progressBlock: {
        marginBottom: 12,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    progressLabel: {
        fontSize: 13,
        color: '#6b7280',
        fontWeight: '500',
    },
    progressText: {
        fontSize: 13,
        color: '#111827',
        fontWeight: '600',
    },
    capsuleRow: {
        flexDirection: 'row',
        gap: 6,
    },
    capsule: {
        flex: 1,
        height: 8,
        borderRadius: 50,
    },
    interactionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    commentIconButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 18,
        backgroundColor: '#f3f4f6',
    },
    commentCountText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#6b7280',
    },
    divider: {
        height: 1,
        backgroundColor: '#e5e7eb',
        marginVertical: 12,
    },
    clickableHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    experienceSection: {
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        marginTop: 8,
    },
    experienceImage: {
        width: '100%',
        height: 140,
        backgroundColor: '#e5e7eb',
    },
    experienceImagePlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    experienceImagePlaceholderText: {
        fontSize: 40,
        opacity: 0.5,
    },
    experienceContent: {
        padding: 12,
    },
    experienceTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 4,
    },
    partnerName: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 4,
    },
    goalDescriptionText: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 6,
    },
    experienceMeta: {
        fontSize: 13,
        color: '#9ca3af',
    },
    // Free Goal Action Buttons
    freeGoalActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
        marginBottom: 4,
    },
    empowerButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#fdf2f8',
        borderWidth: 1,
        borderColor: '#fbcfe8',
    },
    empowerButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ec4899',
    },
    motivateButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: Colors.primarySurface,
        borderWidth: 1,
        borderColor: Colors.primaryTint,
    },
    motivateButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.secondary,
    },
    experiencePreviewCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primarySurface,
        borderRadius: 12,
        padding: 10,
        marginTop: 10,
        borderWidth: 1,
        borderColor: Colors.primarySurface,
    },
    experiencePreviewImage: {
        width: 44,
        height: 44,
        borderRadius: 8,
        backgroundColor: '#E5E7EB',
    },
    experiencePreviewInfo: {
        flex: 1,
        marginLeft: 10,
    },
    experiencePreviewTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1F2937',
    },
    experiencePreviewPrice: {
        fontSize: 12,
        fontWeight: '800',
        color: Colors.primary,
        marginTop: 2,
    },
    experiencePreviewCta: {
        backgroundColor: Colors.primary,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    experiencePreviewCtaText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
    },
    prominentEmpowerButton: {
        backgroundColor: Colors.primarySurface,
        borderColor: Colors.primaryTint,
        paddingVertical: 12,
        shadowColor: '#ec4899',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    prominentEmpowerButtonText: {
        color: '#fff',
        fontSize: 15,
    },
    // Motivation Modal
    motivationModal: {
        backgroundColor: '#fff',
        borderRadius: 20,
        width: '90%',
        maxWidth: 360,
        padding: 24,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
    },
    motivationModalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 4,
    },
    motivationModalSubtitle: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 16,
    },
    motivationInput: {
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        backgroundColor: '#f9fafb',
        minHeight: 100,
        textAlignVertical: 'top',
    },
    motivationCharCount: {
        fontSize: 12,
        color: '#9ca3af',
        textAlign: 'right',
        marginTop: 4,
        marginBottom: 16,
    },
    motivationModalButtons: {
        flexDirection: 'row',
        gap: 10,
    },
    motivationCancelButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#f3f4f6',
        alignItems: 'center',
    },
    motivationCancelText: {
        color: '#374151',
        fontWeight: '600',
        fontSize: 16,
    },
    motivationSendButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: Colors.secondary,
        alignItems: 'center',
    },
    motivationSendText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
});

export default FeedPost;
