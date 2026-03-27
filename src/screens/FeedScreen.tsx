import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    View,
    FlatList,
    StyleSheet,
    RefreshControl,
    Animated,
    Platform,
    ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MainScreen from './MainScreen';
import SharedHeader from '../components/SharedHeader';
import FeedPost from '../components/FeedPost';
import { MotiView } from 'moti';
import { FeedPostSkeleton } from '../components/SkeletonLoader';
import type { FeedPost as FeedPostType, RootStackParamList } from '../types';
import { feedService } from '../services/FeedService';
import { useApp } from '../context/AppContext';
import { useFocusEffect } from '@react-navigation/native';
import { logger } from '../utils/logger';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Chip } from '../components/Chip';
import { analyticsService } from '../services/AnalyticsService';
import { useToast } from '../context/ToastContext';
import ErrorRetry from '../components/ErrorRetry';
import { EmptyState } from '../components/EmptyState';
import { FOOTER_HEIGHT } from '../components/FooterNavigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FeedScreenRouteProp = RouteProp<RootStackParamList, 'Feed'>;

const FILTER_OPTIONS = [
    { key: 'all', label: 'All' },
    { key: 'goals', label: 'Goals' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'completed', label: 'Completed' },
] as const;

const FeedScreen: React.FC = () => {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { state } = useApp();
    const route = useRoute<FeedScreenRouteProp>();
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const { showError } = useToast();
    const [posts, setPosts] = useState<FeedPostType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
    const highlightAnim = React.useRef(new Animated.Value(0)).current;
    const flatListRef = React.useRef<FlatList>(null);
    const scrollRetryCount = React.useRef(0);
    const lastTimestampRef = useRef<Date | undefined>(undefined);
    const FEED_PAGE_SIZE = 15;
    const MAX_POSTS = 200;

    const [activeFilter, setActiveFilter] = useState<string>('all');

    const filteredPosts = useMemo(() => {
        if (activeFilter === 'all') return posts;
        if (activeFilter === 'goals') return posts.filter(p => p.type === 'goal_started' || p.type === 'goal_approved');
        if (activeFilter === 'sessions') return posts.filter(p => p.type === 'session_progress');
        if (activeFilter === 'completed') return posts.filter(p => p.type === 'goal_completed');
        return posts;
    }, [posts, activeFilter]);

    const handleFilterChange = useCallback((key: string) => {
        setActiveFilter(key);
    }, []);

    // Handle highlight parameter from navigation
    useEffect(() => {
        let highlightTimeout: ReturnType<typeof setTimeout> | null = null;

        if (route.params?.highlightPostId) {
            setHighlightedPostId(route.params.highlightPostId);

            // Start border pulse animation
            Animated.sequence([
                Animated.timing(highlightAnim, {
                    toValue: 1,
                    duration: 600,
                    useNativeDriver: false,
                }),
                Animated.timing(highlightAnim, {
                    toValue: 0,
                    duration: 600,
                    useNativeDriver: false,
                }),
            ]).start();

            // Auto-clear highlight after animation
            highlightTimeout = setTimeout(() => {
                setHighlightedPostId(null);
            }, 2400);
        }

        return () => {
            if (highlightTimeout) clearTimeout(highlightTimeout);
        };
    }, [route.params?.highlightPostId]);

    // Scroll to highlighted post
    useEffect(() => {
        let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

        if (highlightedPostId && posts.length > 0 && flatListRef.current) {
            const index = posts.findIndex(post => post.id === highlightedPostId);
            if (index !== -1) {
                scrollRetryCount.current = 0;
                scrollTimeout = setTimeout(() => {
                    flatListRef.current?.scrollToIndex({
                        index,
                        animated: true,
                        viewPosition: 0.3
                    });
                }, 300);
            }
        }

        return () => {
            if (scrollTimeout) clearTimeout(scrollTimeout);
        };
    }, [highlightedPostId, posts]);

    const loadFeed = useCallback(async (loadMore = false) => {
        if (!state.user?.id) {
            setIsLoading(false);
            return;
        }

        if (loadMore && !hasMore) return;

        try {
            if (!loadMore && !isRefreshing) {
                setIsLoading(true);
                setError(false);
            }
            const cursor = loadMore ? lastTimestampRef.current : undefined;
            const { posts: loadedPosts, lastTimestamp } = await feedService.getFriendsFeed(
                state.user.id,
                FEED_PAGE_SIZE,
                cursor
            );

            if (loadMore) {
                setPosts(prev => [...prev, ...loadedPosts].slice(-MAX_POSTS));
            } else {
                setPosts(loadedPosts);
            }

            lastTimestampRef.current = lastTimestamp;
            setHasMore(loadedPosts.length >= FEED_PAGE_SIZE);
        } catch (error: unknown) {
            logger.error('Error loading feed:', error);
            if (!loadMore) {
                setError(true);
                showError('Could not load feed. Pull to refresh to try again.');
            }
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, [state.user?.id, hasMore, isRefreshing]);

    useFocusEffect(
        React.useCallback(() => {
            analyticsService.trackScreenView('FeedScreen');
            loadFeed();
        }, [loadFeed])
    );

    const handleRefresh = useCallback(async () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsRefreshing(true);
        lastTimestampRef.current = undefined;
        setHasMore(true);
        await loadFeed();
        setIsRefreshing(false);
    }, [loadFeed]);

    const handleLoadMore = useCallback(() => {
        if (isLoadingMore || !hasMore || isLoading) return;
        setIsLoadingMore(true);
        loadFeed(true);
    }, [isLoadingMore, hasMore, isLoading]);

    const renderPost = useCallback(({ item }: { item: FeedPostType }) => {
        const isHighlighted = item.id === highlightedPostId;

        const borderColor = isHighlighted
            ? highlightAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['transparent', colors.primary],
            })
            : 'transparent';

        const scale = isHighlighted
            ? highlightAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.01],
            })
            : 1;

        return (
            <MotiView
                from={{ opacity: 0, translateY: 12 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 350 }}
            >
                <Animated.View style={{
                    borderWidth: 2,
                    borderColor,
                    transform: [{ scale }],
                    borderRadius: BorderRadius.md,
                    marginBottom: Spacing.lg,
                }}>
                    <FeedPost post={item} />
                </Animated.View>
            </MotiView>
        );
    }, [highlightedPostId, highlightAnim, colors]);

    const renderFilterRow = useCallback(() => (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            accessibilityRole="tablist"
            accessibilityLabel="Filter posts by type"
        >
            {FILTER_OPTIONS.map(({ key, label }) => (
                <Chip
                    key={key}
                    label={label}
                    selected={activeFilter === key}
                    onPress={() => handleFilterChange(key)}
                    size="sm"
                    style={styles.filterChip}
                />
            ))}
        </ScrollView>
    ), [activeFilter, handleFilterChange, styles]);

    const renderEmpty = () => {
        if (isLoading) return null;

        if (error) {
            return <ErrorRetry message="Could not load your feed" onRetry={loadFeed} />;
        }

        if (activeFilter !== 'all') {
            return (
                <EmptyState
                    icon="🔍"
                    title="No Posts Found"
                    message="There are no posts matching this filter yet."
                />
            );
        }

        return (
            <EmptyState
                icon="👥"
                title="No Activity Yet"
                message="Add friends to see their goal progress and celebrate together!"
                actionLabel="Add Friends"
                onAction={() => navigation.navigate('AddFriend')}
            />
        );
    };

    return (
        <ErrorBoundary screenName="FeedScreen" userId={state.user?.id}>
            <MainScreen activeRoute="Feed">
                <StatusBar style="light" />
                <SharedHeader
                    title="Feed"
                    subtitle="See what you and your friends have achieved"
                />

                <View accessibilityLiveRegion="polite" style={{ flex: 1 }}>
                {isLoading ? (
                    <View style={styles.list}>
                        {renderFilterRow()}
                        <FeedPostSkeleton />
                        <FeedPostSkeleton />
                        <FeedPostSkeleton />
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={filteredPosts}
                        keyExtractor={(item) => item.id}
                        ListHeaderComponent={renderFilterRow}
                        renderItem={renderPost}
                        contentContainerStyle={[styles.list, { paddingBottom: Spacing.lg + FOOTER_HEIGHT + insets.bottom }]}
                        accessibilityRole="list"
                        accessibilityLabel="Activity feed"
                        ListEmptyComponent={renderEmpty}
                        ListFooterComponent={isLoadingMore ? (
                            <View style={styles.loadingMore}>
                                <FeedPostSkeleton />
                            </View>
                        ) : null}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        removeClippedSubviews={Platform.OS !== 'web'}
                        initialNumToRender={5}
                        maxToRenderPerBatch={10}
                        windowSize={5}
                        onEndReached={handleLoadMore}
                        onEndReachedThreshold={0.5}
                        onScrollToIndexFailed={(info) => {
                            if (scrollRetryCount.current >= 3) return;
                            scrollRetryCount.current += 1;
                            setTimeout(() => {
                                flatListRef.current?.scrollToIndex({
                                    index: info.index,
                                    animated: true,
                                    viewPosition: 0.3
                                });
                            }, 500);
                        }}
                        refreshControl={
                            <RefreshControl
                                refreshing={isRefreshing}
                                onRefresh={handleRefresh}
                                colors={[colors.secondary]}
                                tintColor={colors.secondary}
                                accessibilityLabel="Pull to refresh feed"
                            />
                        }
                    />
                )}
                </View>
            </MainScreen>
        </ErrorBoundary>
    );
};

const createStyles = (_colors: typeof Colors) => StyleSheet.create({
    list: {
        padding: Spacing.lg,
        paddingBottom: Spacing.lg + FOOTER_HEIGHT,
    },
    loadingMore: {
        paddingVertical: Spacing.xl,
        alignItems: 'center',
    },
    filterRow: {
        paddingHorizontal: Spacing.screenPadding,
        gap: Spacing.sm,
        marginBottom: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
    },
    filterChip: {
        borderRadius: BorderRadius.xl,
    },
});

export default FeedScreen;
