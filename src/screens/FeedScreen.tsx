import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    RefreshControl,
    Animated,
    Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRoute, RouteProp } from '@react-navigation/native';
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
import Colors from '../config/colors';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { logErrorToFirestore } from '../utils/errorLogger';
import { useToast } from '../context/ToastContext';
import ErrorRetry from '../components/ErrorRetry';
import { EmptyState } from '../components/EmptyState';

type FeedScreenRouteProp = RouteProp<RootStackParamList, 'Feed'>;


const FeedScreen: React.FC = () => {
    const { state } = useApp();
    const route = useRoute<FeedScreenRouteProp>();
    const { showError } = useToast();
    const [posts, setPosts] = useState<FeedPostType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(false);
    const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
    const highlightAnim = React.useRef(new Animated.Value(0)).current;
    const flatListRef = React.useRef<FlatList>(null);
    const scrollRetryCount = React.useRef(0);

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

    useFocusEffect(
        React.useCallback(() => {
            loadFeed();
        }, [state.user?.id])
    );

    const loadFeed = async () => {
        if (!state.user?.id) {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(false);
            const { posts: loadedPosts } = await feedService.getFriendsFeed(state.user.id);
            setPosts(loadedPosts);
        } catch (error) {
            logger.error('Error loading feed:', error);
            setError(true);
            showError('Could not load feed. Pull to refresh to try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await loadFeed();
        setIsRefreshing(false);
    };

    const renderPost = ({ item }: { item: FeedPostType }) => {
        const isHighlighted = item.id === highlightedPostId;

        const borderColor = isHighlighted
            ? highlightAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['rgba(139, 92, 246, 0)', 'rgba(139, 92, 246, 1)'],
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
                    borderRadius: 12,
                    marginBottom: 16,
                }}>
                    <FeedPost post={item} />
                </Animated.View>
            </MotiView>
        );
    };

    const renderEmpty = () => {
        if (isLoading) return null;

        if (error) {
            return <ErrorRetry message="Could not load your feed" onRetry={loadFeed} />;
        }

        return (
            <EmptyState
                icon="👥"
                title="No Activity Yet"
                message="Add friends to see their goal progress and celebrate together!"
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

                {isLoading ? (
                    <View style={styles.list}>
                        <FeedPostSkeleton />
                        <FeedPostSkeleton />
                        <FeedPostSkeleton />
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={posts}
                        keyExtractor={(item) => item.id}
                        renderItem={renderPost}
                        contentContainerStyle={styles.list}
                        ListEmptyComponent={renderEmpty}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        removeClippedSubviews={Platform.OS !== 'web'}
                        maxToRenderPerBatch={10}
                        windowSize={5}
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
                                colors={[Colors.secondary]}
                                tintColor={Colors.secondary}
                            />
                        }
                    />
                )}
            </MainScreen>
        </ErrorBoundary>
    );
};

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        padding: 16,
    },
});

export default FeedScreen;
