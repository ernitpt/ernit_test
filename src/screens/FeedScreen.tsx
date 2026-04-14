import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    View,
    FlatList,
    StyleSheet,
    RefreshControl,
    Animated,
    Platform,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import { FOOTER_HEIGHT } from '../components/CustomTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FeedScreenRouteProp = RouteProp<RootStackParamList, 'Feed'>;

// Filter labels are translated dynamically inside the component
const FILTER_KEYS = ['all', 'goals', 'sessions', 'completed'] as const;

const FeedScreen: React.FC = () => {
    const { t } = useTranslation();
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
    // M9: Ref mirrors isRefreshing so loadFeed can check it without being a dep
    const isRefreshingRef = useRef(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    // M: Ref mirrors hasMore so loadFeed can check it without being a dep (prevents excess reloads)
    const hasMoreRef = useRef(true);
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
        if (activeFilter === 'sessions') return posts.filter(p => p.type === 'session_progress' || p.type === 'goal_progress');
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
    // M24: Use posts.length (not posts array) as dep — reaction updates change object identity
    //      but not count, preventing unnecessary re-scroll on every reaction update.
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
    }, [highlightedPostId, posts.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync hasMoreRef with state so loadFeed can use the ref without it being a dep
    useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

    const loadFeed = useCallback(async (loadMore = false) => {
        if (!state.user?.id) {
            setIsLoading(false);
            return;
        }

        if (loadMore && !hasMoreRef.current) return;

        try {
            // M9: Read from ref instead of isRefreshing state to avoid it being a dep
            if (!loadMore && !isRefreshingRef.current) {
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
            const newHasMore = loadedPosts.length >= FEED_PAGE_SIZE;
            setHasMore(newHasMore);
            hasMoreRef.current = newHasMore;
        } catch (error: unknown) {
            logger.error('Error loading feed:', error);
            if (!loadMore) {
                setError(true);
                showError(t('feed.error.couldNotLoad'));
            }
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
        // M9: isRefreshing removed from deps — use isRefreshingRef.current inside instead
        // hasMore removed from deps — use hasMoreRef.current inside instead to prevent excess reloads
    }, [state.user?.id]);

    useFocusEffect(
        React.useCallback(() => {
            analyticsService.trackScreenView('FeedScreen');
            // FIX 5A: Reset pagination cursor on re-focus so the feed reloads
            // from the top instead of appending from a stale position.
            lastTimestampRef.current = undefined;
            loadFeed();
        }, [loadFeed])
    );

    const handleRefresh = useCallback(async () => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        isRefreshingRef.current = true; // M9: sync ref before loadFeed reads it
        setIsRefreshing(true);
        lastTimestampRef.current = undefined;
        setHasMore(true);
        await loadFeed();
        isRefreshingRef.current = false; // M9: reset ref after load completes
        setIsRefreshing(false);
    }, [loadFeed]);

    const handleLoadMore = useCallback(() => {
        if (isLoadingMore || !hasMore || isLoading) return;
        setIsLoadingMore(true);
        loadFeed(true);
    }, [isLoadingMore, hasMore, isLoading, loadFeed]); // FIX 5B: added loadFeed dep

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

        const card = (
            <Animated.View style={{
                borderWidth: 2,
                borderColor,
                transform: [{ scale }],
                borderRadius: BorderRadius.md,
                marginBottom: Spacing.lg,
            }}>
                <FeedPost post={item} />
            </Animated.View>
        );

        // Skip MotiView on Android — opacity:0 animation causes white flash artifacts
        if (Platform.OS === 'android') return card;

        return (
            <MotiView
                from={{ opacity: 0, translateY: 12 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 350 }}
            >
                {card}
            </MotiView>
        );
    }, [highlightedPostId, highlightAnim, colors]);

    const filterOptions = useMemo(() => [
        { key: 'all', label: t('feed.filters.all') },
        { key: 'goals', label: t('feed.filters.goals') },
        { key: 'sessions', label: t('feed.filters.sessions') },
        { key: 'completed', label: t('feed.filters.completed') },
    ], [t]);

    const renderFilterRow = useCallback(() => (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            accessibilityRole="tablist"
            accessibilityLabel={t('feed.filtersAccessibility')}
        >
            {filterOptions.map(({ key, label }) => (
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
    ), [activeFilter, handleFilterChange, styles, filterOptions, t]);

    const renderEmpty = () => {
        if (isLoading) return null;

        if (error) {
            return <ErrorRetry message={t('feed.error.couldNotLoad')} onRetry={loadFeed} />;
        }

        if (activeFilter !== 'all') {
            return (
                <EmptyState
                    icon="🔍"
                    title={t('feed.empty.noPostsTitle')}
                    message={t('feed.empty.noPostsMessage')}
                />
            );
        }

        return (
            <EmptyState
                icon="👥"
                title={t('feed.empty.noActivityTitle')}
                message={t('feed.empty.noActivityMessage')}
                actionLabel={t('feed.empty.addFriends')}
                onAction={() => navigation.navigate('MainTabs', { screen: 'ProfileTab', params: { screen: 'AddFriend' } })}
            />
        );
    };

    return (
        <ErrorBoundary screenName="FeedScreen" userId={state.user?.id}>
            <View style={{ flex: 1, backgroundColor: colors.surface }}>
                <StatusBar style="light" />
                <SharedHeader
                    title={t('feed.screenTitle')}
                    subtitle={t('feed.screenSubtitle')}
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
                        accessibilityLabel={t('feed.listAccessibility')}
                        ListEmptyComponent={renderEmpty}
                        ListFooterComponent={isLoadingMore ? (
                            <View style={styles.loadingMore}>
                                <ActivityIndicator size="small" color={colors.textMuted} />
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
                                accessibilityLabel={t('feed.pullToRefreshAccessibility')}
                            />
                        }
                    />
                )}
                </View>
            </View>
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
