import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    RefreshControl,
    Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRoute, RouteProp } from '@react-navigation/native';
import MainScreen from './MainScreen';
import SharedHeader from '../components/SharedHeader';
import FeedPost from '../components/FeedPost';
import CommentModal from '../components/CommentModal';
import { FeedPostSkeleton } from '../components/SkeletonLoader';
import type { FeedPost as FeedPostType, RootStackParamList } from '../types';
import { feedService } from '../services/FeedService';
import { useApp } from '../context/AppContext';
import { useFocusEffect } from '@react-navigation/native';
import { logger } from '../utils/logger';

type FeedScreenRouteProp = RouteProp<RootStackParamList, 'Feed'>;


const FeedScreen: React.FC = () => {
    const { state } = useApp();
    const route = useRoute<FeedScreenRouteProp>();
    const [posts, setPosts] = useState<FeedPostType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
    const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
    const highlightAnim = React.useRef(new Animated.Value(0)).current;
    const flatListRef = React.useRef<FlatList>(null);

    // Handle highlight parameter from navigation
    useEffect(() => {
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
            setTimeout(() => {
                setHighlightedPostId(null);
            }, 2400);
        }
    }, [route.params?.highlightPostId]);

    // Scroll to highlighted post
    useEffect(() => {
        if (highlightedPostId && posts.length > 0 && flatListRef.current) {
            const index = posts.findIndex(post => post.id === highlightedPostId);
            if (index !== -1) {
                setTimeout(() => {
                    flatListRef.current?.scrollToIndex({
                        index,
                        animated: true,
                        viewPosition: 0.3
                    });
                }, 300);
            }
        }
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
            const { posts: loadedPosts } = await feedService.getFriendsFeed(state.user.id);
            setPosts(loadedPosts);
        } catch (error) {
            logger.error('Error loading feed:', error);
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
            <Animated.View style={{
                borderWidth: 2,
                borderColor,
                transform: [{ scale }],
                borderRadius: 12,
                marginBottom: 16,
            }}>
                <FeedPost post={item} />
            </Animated.View>
        );
    };

    const renderEmpty = () => {
        if (isLoading) return null;

        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>👥</Text>
                <Text style={styles.emptyTitle}>No Activity Yet</Text>
                <Text style={styles.emptyText}>
                    Add friends to see their goal progress and celebrate together!
                </Text>
            </View>
        );
    };

    return (
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
                    onScrollToIndexFailed={(info) => {
                        const wait = new Promise(resolve => setTimeout(resolve, 500));
                        wait.then(() => {
                            flatListRef.current?.scrollToIndex({
                                index: info.index,
                                animated: true,
                                viewPosition: 0.3
                            });
                        });
                    }}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={handleRefresh}
                            colors={['#8b5cf6']}
                            tintColor="#8b5cf6"
                        />
                    }
                />
            )}

            {/* Comment Modal */}
            {selectedPostId && (
                <CommentModal
                    visible={selectedPostId !== null}
                    postId={selectedPostId}
                    onClose={() => setSelectedPostId(null)}
                />
            )}
        </MainScreen>
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
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        paddingTop: 80,
    },
    emptyIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 15,
        color: '#6b7280',
        textAlign: 'center',
        lineHeight: 22,
    },
});

export default FeedScreen;
