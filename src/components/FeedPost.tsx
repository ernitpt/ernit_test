import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Animated,
} from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FeedPost as FeedPostType, ReactionType, Comment as CommentType, RootStackParamList } from '../types';
import CompactReactionBar from './CompactReactionBar';
import CommentSection from './CommentSection';
import CommentModal from './CommentModal';
import ReactionViewerModal from './ReactionViewerModal';
import { reactionService } from '../services/ReactionService';
import { commentService } from '../services/CommentService';
import { useApp } from '../context/AppContext';
import { logger } from '../utils/logger';

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
                    color: '#3b82f6',
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
                    color: '#8b5cf6',
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
                shadowColor: isHighlighted ? '#8b5cf6' : '#000',
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
                                <Text style={styles.experienceImagePlaceholderText}>🎁</Text>
                            </View>
                        )}
                        <View style={styles.experienceContent}>
                            <Text style={styles.experienceTitle} numberOfLines={1}>
                                {post.experienceTitle}
                            </Text>
                            {post.partnerName && (
                                <Text style={styles.partnerName} numberOfLines={1}>
                                    👤 {post.partnerName}
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
        borderColor: '#8b5cf6',
        backgroundColor: '#f5f3ff',
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
        color: '#4f46e5',
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
});

export default FeedPost;
