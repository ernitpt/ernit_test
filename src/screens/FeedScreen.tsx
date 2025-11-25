import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import MainScreen from './MainScreen';
import SharedHeader from '../components/SharedHeader';
import FeedPost from '../components/FeedPost';
import CommentModal from '../components/CommentModal';
import type { FeedPost as FeedPostType } from '../types';
import { feedService } from '../services/FeedService';
import { useApp } from '../context/AppContext';
import { useFocusEffect } from '@react-navigation/native';

const FeedScreen: React.FC = () => {
    const { state } = useApp();
    const [posts, setPosts] = useState<FeedPostType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

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
            console.error('Error loading feed:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await loadFeed();
        setIsRefreshing(false);
    };

    const renderPost = ({ item }: { item: FeedPostType }) => (
        <FeedPost post={item} />
    );

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
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#8b5cf6" />
                </View>
            ) : (
                <FlatList
                    data={posts}
                    keyExtractor={(item) => item.id}
                    renderItem={renderPost}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={renderEmpty}
                    showsVerticalScrollIndicator={false}
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
