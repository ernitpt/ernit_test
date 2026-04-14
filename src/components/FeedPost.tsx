import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react-native';
import ImageViewer from './ImageViewer';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FeedPost as FeedPostType, ReactionType, Comment as CommentType, RootStackParamList } from '../types';
import CompactReactionBar from './CompactReactionBar';
import CommentSection from './CommentSection';
import CommentModal from './CommentModal';
import ReactionViewerModal from './ReactionViewerModal';
import MotivationModal from './MotivationModal';
import EmpowerChoiceModal from './EmpowerChoiceModal';
import FeedPostHeader from './feed/FeedPostHeader';
import FeedPostContent from './feed/FeedPostContent';
import FeedPostEmpowerActions from './feed/FeedPostEmpowerActions';
import { reactionService } from '../services/ReactionService';
import { commentService } from '../services/CommentService';
import { motivationService } from '../services/MotivationService';
import { useApp } from '../context/AppContext';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import { analyticsService } from '../services/AnalyticsService';
import { goalService } from '../services/GoalService';
import { getTimeAgo } from '../utils/timeUtils';
import { Platform } from 'react-native';
import { Colors, useColors, Spacing, BorderRadius, Shadows } from '../config';
import { Typography } from '../config/typography';
import * as Haptics from 'expo-haptics';

interface FeedPostProps {
    post: FeedPostType;
    isHighlighted?: boolean;
}

const FeedPost: React.FC<FeedPostProps> = ({ post, isHighlighted = false }) => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { state, dispatch } = useApp();
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const [userReaction, setUserReaction] = useState<ReactionType | null>(null);
    const [comments, setComments] = useState<CommentType[]>([]);
    const [reactionCounts, setReactionCounts] = useState(post.reactionCounts ?? { muscle: 0, heart: 0, like: 0 });
    const [commentCount, setCommentCount] = useState(post.commentCount ?? 0);
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [showReactionModal, setShowReactionModal] = useState(false);
    const [showMotivationModal, setShowMotivationModal] = useState(false);
    const [fullscreenMedia, setFullscreenMedia] = useState(false);
    const [showEmpowerModal, setShowEmpowerModal] = useState(false);
    const [canMotivate, setCanMotivate] = useState(false);
    const [alreadySent, setAlreadySent] = useState(false);
    const [goalHasGift, setGoalHasGift] = useState(false);

    // Check goal state: gift status + motivate visibility
    // H11a: isMounted guard — prevents setState after unmount
    useEffect(() => {
        let mounted = true;

        const checkGoal = async () => {
            try {
                const goal = await goalService.getGoalById(post.goalId);
                if (!mounted) return;
                if (!goal) {
                    setCanMotivate(false);
                    setGoalHasGift(false);
                    return;
                }

                // Always check gift status (attached or pending empower)
                setGoalHasGift(!!goal.experienceGiftId || !!goal.empowerPending);

                // Motivate logic
                if (post.userId === state.user?.id || post.type === 'goal_completed') {
                    setCanMotivate(false);
                    return;
                }
                if (goal.isCompleted) {
                    setCanMotivate(false);
                    return;
                }
                const currentSessionsDone =
                    (goal.currentCount || 0) * (goal.sessionsPerWeek || 1) + (goal.weeklyCount || 0);
                if (post.sessionNumber) {
                    if (post.sessionNumber !== currentSessionsDone) {
                        setCanMotivate(false);
                        return;
                    }
                } else {
                    if (currentSessionsDone !== 0) {
                        setCanMotivate(false);
                        return;
                    }
                }
                // Structural checks passed — user is eligible to motivate this session.
                setCanMotivate(true);
                // Separately track whether they've already sent one (for disabled-state UI).
                const targetSession = post.sessionNumber ? post.sessionNumber + 1 : 1;
                const sent = await motivationService.hasUserSentMotivation(
                    post.goalId, state.user?.id ?? "", targetSession
                );
                if (!mounted) return;
                setAlreadySent(sent);
            } catch (error: unknown) {
                if (!mounted) return;
                logger.error('Error checking goal:', error);
                setCanMotivate(false);
            }
        };
        checkGoal();
        return () => { mounted = false; };
    }, [post.goalId, post.userId, post.type, post.sessionNumber, state.user?.id]);

    // Animated value for highlight effect
    const highlightAnim = useRef(new Animated.Value(0)).current;

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

    const loadUserReaction = useCallback(async () => {
        if (!state.user?.id) return;
        try {
            const reaction = await reactionService.getUserReaction(post.id, state.user.id);
            setUserReaction(reaction?.type || null);
        } catch (error: unknown) {
            logger.error('Error loading user reaction:', error);
            await logErrorToFirestore(error, {
                screenName: 'FeedPost',
                feature: 'LoadUserReaction',
                userId: state.user?.id || 'unknown',
                additionalData: { postId: post.id },
            });
        }
    }, [post.id, state.user?.id]);

    const loadComments = useCallback(async () => {
        try {
            const loadedComments = await commentService.getComments(post.id, 3);
            setComments(loadedComments);
        } catch (error: unknown) {
            logger.error('Error loading comments:', error);
            await logErrorToFirestore(error, {
                screenName: 'FeedPost',
                feature: 'LoadComments',
                userId: state.user?.id || 'unknown',
                additionalData: { postId: post.id },
            });
        }
    }, [post.id, state.user?.id]);

    const handleCommentsChange = useCallback(async (newCount?: number) => {
        await loadComments();
        if (newCount !== undefined) {
            setCommentCount(newCount);
        } else {
            setCommentCount(prev => prev + 1);
        }
    }, [loadComments]);

    // Load reactions and comments on mount/post change
    useEffect(() => {
        loadUserReaction();
        loadComments();
    }, [loadUserReaction, loadComments]);

    const handleReact = async (type: ReactionType) => {
        if (!state.user?.id) return;

        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        const previousReaction = userReaction;
        const previousCounts = { ...reactionCounts };

        if (userReaction === type) {
            setUserReaction(null);
            // H11b: Functional update avoids stale closure — concurrent taps read latest state
            setReactionCounts(prev => ({
                ...prev,
                [type]: Math.max(0, (prev[type] || 0) - 1),
            }));
        } else {
            setUserReaction(type);
            // H11b: Functional update avoids stale closure — concurrent taps read latest state
            setReactionCounts(prev => {
                const next = { ...prev };
                if (previousReaction) {
                    next[previousReaction] = Math.max(0, (next[previousReaction] || 0) - 1);
                }
                next[type] = (next[type] || 0) + 1;
                return next;
            });
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
        } catch (error: unknown) {
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
    const setEmpowerContext = useCallback(() => {
        dispatch({
            type: 'SET_EMPOWER_CONTEXT',
            payload: { goalId: post.goalId, userId: post.userId, userName: post.userName },
        });
    }, [dispatch, post.goalId, post.userId, post.userName]);

    const handleEmpower = useCallback(() => {
        if (goalHasGift) return;
        if (!post.pledgedExperienceId && !post.preferredRewardCategory) {
            // No pledged experience and no category — go straight to browse
            setEmpowerContext();
            navigation.navigate('MainTabs', { screen: 'HomeTab', params: { screen: 'CategorySelection' } });
            return;
        }
        if (!post.pledgedExperienceId && post.preferredRewardCategory) {
            // Has category preference but no specific experience — browse pre-filtered
            setEmpowerContext();
            navigation.navigate('MainTabs', { screen: 'HomeTab', params: { screen: 'CategorySelection', params: { prefilterCategory: post.preferredRewardCategory } } });
            return;
        }
        // Has pledged experience — show choice modal
        setShowEmpowerModal(true);
    }, [goalHasGift, post.pledgedExperienceId, post.preferredRewardCategory, navigation, setEmpowerContext]);

    // get third word from goal description
    const getActivityType = (text: string) => {
        if (!text) return '';
        const words = text.trim().split(/\s+/);
        return words[2] || words[words.length - 1]; // fallback if fewer than 3 words
    };

    const getPostTypeInfo = useCallback(() => {
        switch (post.type) {
            case 'goal_started':
                return {
                    text: t('feed.post.typeInfo.setNewGoal'),
                    color: colors.accent,
                    typeLabel: t('feed.post.postTypes.newGoalChip'),
                };
            case 'goal_approved':
                return {
                    text: t('feed.post.typeInfo.gotGoalApproved'),
                    color: colors.secondary,
                    typeLabel: t('feed.post.postTypes.approvedChip'),
                };
            case 'session_progress':
            case 'goal_progress': // Support migrated posts with this type
                return {
                    text: (<>{t('feed.post.typeInfo.completedSession')} <Text style={{ fontWeight: '500' }}>{getActivityType(post.goalDescription)}</Text> {t('feed.post.typeInfo.session')}</>),
                    color: colors.secondary,
                    typeLabel: t('feed.post.postTypes.sessionChip'),
                };
            case 'goal_completed':
                if (post.isFreeGoal && !post.experienceGiftId) {
                    // Free goal without attached gift — they completed a challenge, not earned a reward
                    return {
                        text: t('feed.post.typeInfo.completedChallenge'),
                        color: colors.successText,
                        typeLabel: t('feed.post.postTypes.completedChip'),
                    };
                }
                if (post.experienceTitle) {
                    return {
                        text: (<>{t('feed.post.typeInfo.completedGoalEarned')}</>),
                        color: colors.successText,
                        typeLabel: t('feed.post.postTypes.completedChip'),
                    };
                }
                return {
                    text: t('feed.post.typeInfo.completedGoal'),
                    color: colors.successText,
                    typeLabel: t('feed.post.postTypes.completedChip'),
                };
            default:
                // Fallback for unknown post types
                return {
                    text: t('feed.post.typeInfo.madeProgress'),
                    color: colors.textSecondary,
                    typeLabel: '',
                };
        }
    }, [post.type, post.goalDescription, post.isFreeGoal, post.experienceGiftId, post.experienceTitle, colors, t]);

    const handleUserPress = () => {
        if (post.userId === state.user?.id) {
            navigation.navigate('MainTabs', { screen: 'ProfileTab', params: { screen: 'Profile' } });
        } else {
            navigation.navigate('FriendProfile', { userId: post.userId });
        }
    };

    const handleOpenFullscreen = useCallback(() => setFullscreenMedia(true), []);
    const handleOpenComments = useCallback(() => setShowCommentModal(true), []);

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

    // Static shadow offset extracted to avoid new object on every render (P3-16)
    const shadowOffset = useMemo(() => ({ width: 0, height: 2 }), []);

    // borderLeft style derived from typeInfo.color — memoised so React.memo is not defeated (P3-16)
    const borderLeftStyle = useMemo(() => ({
        borderLeftWidth: 3,
        borderLeftColor: typeInfo.color,
    }), [typeInfo.color]);

    return (
        <Animated.View
            accessibilityLabel={`${post.userName} - ${
                post.type === 'session_progress' || post.type === 'goal_progress'
                    ? t('feed.post.accessibility.loggedSession')
                    : post.type === 'goal_completed'
                    ? t('feed.post.accessibility.completedGoal')
                    : post.type === 'goal_started'
                    ? t('feed.post.accessibility.setNewGoal')
                    : t('feed.post.accessibility.madeProgress')
            } - ${timeAgo}`}
            style={[
            styles.container,
            borderLeftStyle,
            {
                // iOS shadow
                shadowColor: isHighlighted ? colors.secondary : colors.textPrimary,
                shadowOffset,
                shadowRadius: animatedShadowRadius,
                shadowOpacity: animatedShadowOpacity,
                // Android elevation
                elevation: highlightAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [2, 8],
                }),
                // Web shadow (boxShadow)
                ...Platform.select({
                    web: {
                        boxShadow: highlightAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [
                                `0 2px 8px rgba(${shadowColor}, 0.05)`,
                                `0 2px 20px rgba(${shadowColor}, 0.35)`,
                            ],
                        }),
                    },
                    default: {},
                }),
            }
        ]}>
            {/* Session Media — at top of card */}
            {post.mediaUrl && (
                <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={handleOpenFullscreen}
                    style={styles.sessionMediaContainer}
                    accessibilityRole="button"
                    accessibilityLabel={t('feed.post.accessibility.viewSessionMedia')}
                >
                    <Image
                        source={{ uri: post.mediaUrl }}
                        style={styles.sessionMediaImage}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                        accessibilityLabel={`Session ${post.mediaType || 'photo'} from ${post.userName}`}
                    />
                    {post.mediaType === 'video' && (
                        <View style={styles.sessionMediaVideoOverlay}>
                            <Text style={styles.sessionMediaPlayIcon}>▶</Text>
                        </View>
                    )}
                </TouchableOpacity>
            )}

            <FeedPostHeader
                userName={post.userName}
                userProfileImageUrl={post.userProfileImageUrl}
                typeInfoText={typeInfo.text}
                timeAgo={timeAgo}
                onUserPress={handleUserPress}
                typeColor={typeInfo.color}
                typeLabel={typeInfo.typeLabel}
            />

            <FeedPostContent
                post={post}
                currentUserId={state.user?.id}
                goalHasGift={goalHasGift}
                onEmpowerContext={setEmpowerContext}
                // React Navigation overloads cannot be inferred from generic screen+params — cast required
                onNavigate={(screen, params) => (navigation as { navigate: (s: string, p?: unknown) => void }).navigate(screen, params)}
            />

            <View style={styles.interactionRow}>
                <CompactReactionBar
                    reactionCounts={reactionCounts}
                    userReaction={userReaction}
                    onReact={handleReact}
                    onViewReactions={() => setShowReactionModal(true)}
                />

                <TouchableOpacity
                    style={styles.commentIconButton}
                    onPress={handleOpenComments}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t(commentCount === 1 ? 'feed.post.accessibility.commentCount_one' : 'feed.post.accessibility.commentCount_other', { count: commentCount })}
                >
                    <MessageCircle color={colors.textSecondary} size={18} />
                    {commentCount > 0 && (
                        <Text style={styles.commentCountText}>{commentCount}</Text>
                    )}
                </TouchableOpacity>
            </View>

            <FeedPostEmpowerActions
                post={post}
                currentUserId={state.user?.id}
                canMotivate={canMotivate}
                alreadySent={alreadySent}
                goalHasGift={goalHasGift}
                onEmpower={handleEmpower}
                onMotivate={() => setShowMotivationModal(true)}
            />

            {comments.length > 0 && (
                <>
                    <View style={styles.divider} />
                    <CommentSection
                        comments={comments}
                        totalComments={commentCount}
                        postId={post.id}
                        onViewAll={() => setShowCommentModal(true)}
                        onCommentsUpdate={(updated) => setComments(updated)}
                    />
                </>
            )}

            {/* Motivation Modal */}
            {showMotivationModal && (
                <MotivationModal
                    visible={showMotivationModal}
                    recipientName={post.userName}
                    goalId={post.goalId}
                    targetSession={post.sessionNumber ? post.sessionNumber + 1 : 1}
                    onClose={() => setShowMotivationModal(false)}
                    onSent={() => setAlreadySent(true)}
                />
            )}

            {/* Empower Choice Modal */}
            {showEmpowerModal && (
                <EmpowerChoiceModal
                    visible={showEmpowerModal}
                    userName={post.userName}
                    experienceTitle={post.experienceTitle}
                    experiencePrice={post.pledgedExperiencePrice}
                    pledgedExperienceId={post.pledgedExperienceId}
                    goalId={post.goalId}
                    goalUserId={post.userId}
                    preferredRewardCategory={post.preferredRewardCategory}
                    onClose={() => setShowEmpowerModal(false)}
                />
            )}

            {showCommentModal && (
                <CommentModal
                    visible={showCommentModal}
                    postId={post.id}
                    onClose={() => setShowCommentModal(false)}
                    onChange={handleCommentsChange}
                />
            )}

            {showReactionModal && (
                <ReactionViewerModal
                    visible={showReactionModal}
                    postId={post.id}
                    onClose={() => setShowReactionModal(false)}
                />
            )}

            {/* Fullscreen media viewer */}
            {post.mediaUrl && fullscreenMedia && (
                <ImageViewer
                    visible={fullscreenMedia}
                    imageUri={post.mediaUrl}
                    onClose={() => setFullscreenMedia(false)}
                />
            )}
        </Animated.View>
    );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
    container: {
        backgroundColor: colors.white,
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
        ...Shadows.sm,
    },
    interactionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
    },
    commentIconButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.xl,
        backgroundColor: colors.backgroundLight,
    },
    commentCountText: {
        ...Typography.caption,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: Spacing.xs,
        marginHorizontal: Spacing.md,
    },
    // Session media (top of card)
    sessionMediaContainer: {
        backgroundColor: colors.backgroundLight,
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
        backgroundColor: colors.blackAlpha20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sessionMediaPlayIcon: {
        color: colors.white,
        fontSize: Typography.emojiMedium.fontSize,
    },
});

export default React.memo(FeedPost);
