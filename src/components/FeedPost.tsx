import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Animated,
    Modal,
} from 'react-native';
import { MessageCircle, Heart, Send, X, Trophy, Gift } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FeedPost as FeedPostType, ReactionType, Comment as CommentType, RootStackParamList } from '../types';
import CompactReactionBar from './CompactReactionBar';
import CommentSection from './CommentSection';
import CommentModal from './CommentModal';
import ReactionViewerModal from './ReactionViewerModal';
import MotivationModal from './MotivationModal';
import EmpowerChoiceModal from './EmpowerChoiceModal';
import { reactionService } from '../services/ReactionService';
import { commentService } from '../services/CommentService';
import { useApp } from '../context/AppContext';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import { analyticsService } from '../services/AnalyticsService';
import { getTimeAgo } from '../utils/timeUtils';
import Colors from '../config/colors';

interface FeedPostProps {
    post: FeedPostType;
    isHighlighted?: boolean;
}

const FeedPost: React.FC<FeedPostProps> = ({ post, isHighlighted = false }) => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { state, dispatch } = useApp();
    const [userReaction, setUserReaction] = useState<ReactionType | null>(null);
    const [comments, setComments] = useState<CommentType[]>([]);
    const [reactionCounts, setReactionCounts] = useState(post.reactionCounts);
    const [commentCount, setCommentCount] = useState(post.commentCount);
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [showReactionModal, setShowReactionModal] = useState(false);
    const [showMotivationModal, setShowMotivationModal] = useState(false);
    const [fullscreenMedia, setFullscreenMedia] = useState(false);
    const [showEmpowerModal, setShowEmpowerModal] = useState(false);

    // Animated value for highlight effect
    const highlightAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        loadUserReaction();
        loadComments();
    }, [post.id]);

    // Animate highlight effect
    useEffect(() => {
        const timeoutRef = { current: null as ReturnType<typeof setTimeout> | null };

        if (isHighlighted) {
            // Fade in with easing
            Animated.timing(highlightAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: false,
                easing: (t) => t * t, // Ease in
            }).start(() => {
                // Wait 3 seconds, then fade out
                timeoutRef.current = setTimeout(() => {
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

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [isHighlighted]);

    const loadUserReaction = async () => {
        if (!state.user?.id) return;
        try {
            const reaction = await reactionService.getUserReaction(post.id, state.user.id);
            setUserReaction(reaction?.type || null);
        } catch (error) {
            logger.error('Error loading user reaction:', error);
            await logErrorToFirestore(error, {
                screenName: 'FeedPost',
                feature: 'LoadUserReaction',
                userId: state.user?.id || 'unknown',
                additionalData: { postId: post.id },
            });
        }
    };

    const loadComments = async () => {
        try {
            const loadedComments = await commentService.getComments(post.id, 3);
            setComments(loadedComments);
        } catch (error) {
            logger.error('Error loading comments:', error);
            await logErrorToFirestore(error, {
                screenName: 'FeedPost',
                feature: 'LoadComments',
                userId: state.user?.id || 'unknown',
                additionalData: { postId: post.id },
            });
        }
    };

    const handleCommentsChange = async (newCount?: number) => {
        await loadComments();
        if (newCount !== undefined) {
            setCommentCount(newCount);
        }
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
            analyticsService.trackEvent('feed_reaction', 'social', { postId: post.id, reactionType: type }, 'FeedPost');
            await reactionService.addReaction(
                post.id,
                state.user.id,
                state.user.displayName || state.user.profile?.name || 'User',
                type,
                state.user.profile?.profileImageUrl
            );
        } catch (error) {
            logger.error('Error reacting:', error);
            await logErrorToFirestore(error, {
                screenName: 'FeedPost',
                feature: 'AddReaction',
                userId: state.user?.id || 'unknown',
                additionalData: { postId: post.id, reactionType: type },
            });
            setUserReaction(previousReaction);
            setReactionCounts(previousCounts);
        }
    };
    const setEmpowerContext = () => {
        dispatch({
            type: 'SET_EMPOWER_CONTEXT',
            payload: { goalId: post.goalId, userId: post.userId, userName: post.userName },
        });
    };

    const handleEmpower = () => {
        if (!post.pledgedExperienceId) {
            // No pledged experience — go straight to browse
            setEmpowerContext();
            navigation.navigate('CategorySelection');
            return;
        }
        // Has pledged experience — show choice modal
        setShowEmpowerModal(true);
    };

    // get third word from goal description
    const getActivityType = (text: string) => {
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
                if (post.experienceTitle) {
                    return {
                        text: (<>completed their goal and earned:</>),
                        color: '#22c55e',
                    };
                }
                return {
                    text: 'completed their goal!',
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
            {/* Session Media — at top of card */}
            {post.mediaUrl && (
                <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setFullscreenMedia(true)}
                    style={styles.sessionMediaContainer}
                >
                    <Image source={{ uri: post.mediaUrl }} style={styles.sessionMediaImage} resizeMode="cover" />
                    {post.mediaType === 'video' && (
                        <View style={styles.sessionMediaVideoOverlay}>
                            <Text style={styles.sessionMediaPlayIcon}>▶</Text>
                        </View>
                    )}
                </TouchableOpacity>
            )}

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
                                                ? { backgroundColor: Colors.primary }
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
                                    {Math.floor((post.sessionNumber - (post.weeklyCount || 0)) / (post.sessionsPerWeek || 1))}/{Math.floor((post.totalSessions || 1) / (post.sessionsPerWeek || 1))}
                                </Text>
                            </View>
                            <View style={styles.capsuleRow}>
                                {Array.from({ length: Math.min(Math.floor((post.totalSessions || 1) / (post.sessionsPerWeek || 1)), 20) }, (_, i) => (
                                    <View
                                        key={i}
                                        style={[
                                            styles.capsule,
                                            i < Math.floor((post.sessionNumber - (post.weeklyCount || 0)) / (post.sessionsPerWeek || 1))
                                                ? { backgroundColor: Colors.secondary }
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
                        {post.isMystery ? (
                            <View style={[styles.experienceImage, styles.experienceImagePlaceholder, { backgroundColor: '#fef3c7' }]}>
                                <Text style={styles.experienceImagePlaceholderText}>?</Text>
                            </View>
                        ) : post.experienceImageUrl ? (
                            <Image source={{ uri: post.experienceImageUrl }} style={styles.experienceImage} />
                        ) : (
                            <View style={[styles.experienceImage, styles.experienceImagePlaceholder]}>
                                <Text style={styles.experienceImagePlaceholderText}>🎁</Text>
                            </View>
                        )}
                        <View style={styles.experienceContent}>
                            <Text style={styles.experienceTitle} numberOfLines={1}>
                                {post.isMystery ? 'Mystery Experience' : post.experienceTitle}
                            </Text>
                            {!post.isMystery && post.partnerName && (
                                <Text style={styles.partnerName} numberOfLines={1}>
                                    {post.partnerName}
                                </Text>
                            )}
                            <Text style={styles.goalDescriptionText} numberOfLines={2}>
                                Goal: {post.goalDescription}
                            </Text>
                            {post.totalSessions && post.sessionsPerWeek && (
                                <Text style={styles.experienceMeta}>
                                    {post.totalSessions} sessions • {Math.floor(post.totalSessions / post.sessionsPerWeek)} weeks
                                </Text>
                            )}
                        </View>
                    </View>
                ) : post.type === 'goal_completed' && !post.experienceTitle ? (
                    <View style={styles.achievementCard}>
                        <View style={styles.achievementIconRow}>
                            <View style={styles.achievementIcon}>
                                <Trophy size={18} color={Colors.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.achievementGoal} numberOfLines={2}>{post.goalDescription}</Text>
                                {post.totalSessions && post.sessionsPerWeek && (
                                    <Text style={styles.achievementStats}>
                                        {post.totalSessions} sessions • {Math.floor(post.totalSessions / post.sessionsPerWeek)} weeks
                                    </Text>
                                )}
                            </View>
                        </View>
                        {post.userId !== state.user?.id && (
                            <TouchableOpacity
                                style={styles.congratsGiftButton}
                                onPress={() => {
                                    setEmpowerContext();
                                    navigation.navigate('CategorySelection');
                                }}
                                activeOpacity={0.8}
                            >
                                <Gift size={15} color="#fff" />
                                <Text style={styles.congratsGiftText}>Gift an Experience</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : post.type !== 'session_progress' ? (
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
                post.experienceTitle && !post.isMystery && (
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
                                {post.type === 'goal_completed' ? 'Gift This Experience' : post.type === 'session_progress' ? 'Empower Now' : 'Empower'}
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
            <MotivationModal
                visible={showMotivationModal}
                recipientName={post.userName}
                goalId={post.goalId}
                onClose={() => setShowMotivationModal(false)}
            />

            {/* Empower Choice Modal */}
            <EmpowerChoiceModal
                visible={showEmpowerModal}
                userName={post.userName}
                experienceTitle={post.experienceTitle}
                experiencePrice={post.pledgedExperiencePrice}
                pledgedExperienceId={post.pledgedExperienceId}
                goalId={post.goalId}
                goalUserId={post.userId}
                onClose={() => setShowEmpowerModal(false)}
            />

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

            {/* Fullscreen media viewer */}
            {post.mediaUrl && (
                <Modal
                    visible={fullscreenMedia}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setFullscreenMedia(false)}
                >
                    <View style={styles.fullscreenOverlay}>
                        <TouchableOpacity
                            style={styles.fullscreenClose}
                            onPress={() => setFullscreenMedia(false)}
                        >
                            <X color="#fff" size={24} strokeWidth={2.5} />
                        </TouchableOpacity>
                        <Image
                            source={{ uri: post.mediaUrl }}
                            style={styles.fullscreenImage}
                            resizeMode="contain"
                        />
                    </View>
                </Modal>
            )}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
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
        color: '#111827',
        marginBottom: 1,
    },
    timeAgo: {
        fontSize: 12,
        color: '#9ca3af',
    },
    content: {
        paddingHorizontal: 16,
        marginBottom: 10,
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
        paddingHorizontal: 16,
        paddingVertical: 6,
        paddingBottom: 10,
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
        marginVertical: 8,
        marginHorizontal: 16,
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
    // Completed goal without experience
    achievementCard: {
        backgroundColor: Colors.primarySurface,
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: Colors.primaryBorder,
    },
    achievementIconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    achievementIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.primaryTint,
        alignItems: 'center',
        justifyContent: 'center',
    },
    achievementGoal: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textPrimary,
        lineHeight: 20,
    },
    achievementStats: {
        fontSize: 12,
        color: Colors.textMuted,
        marginTop: 2,
    },
    congratsGiftButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: Colors.secondary,
        paddingVertical: 10,
        borderRadius: 10,
        marginTop: 12,
    },
    congratsGiftText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    // Free Goal Action Buttons
    freeGoalActions: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 16,
        marginTop: 4,
        marginBottom: 10,
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
        marginHorizontal: 16,
        marginTop: 4,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: Colors.primaryTint,
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
    // Session media (top of card)
    sessionMediaContainer: {
        backgroundColor: '#F3F4F6',
    },
    sessionMediaImage: {
        width: '100%',
        aspectRatio: 4 / 3,
    },
    sessionMediaVideoOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sessionMediaPlayIcon: {
        color: '#fff',
        fontSize: 36,
    },
    // Fullscreen media viewer
    fullscreenOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullscreenClose: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 10,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullscreenImage: {
        width: '100%',
        height: '80%',
    },
});

export default FeedPost;
