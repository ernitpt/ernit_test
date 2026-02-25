import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Image,
    ScrollView,
    ActivityIndicator,
    Animated,
} from 'react-native';
import { X } from 'lucide-react-native';
import type { Reaction, ReactionType } from '../types';
import { reactionService } from '../services/ReactionService';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { commonStyles } from '../styles/commonStyles';
import { ReactionSkeleton } from './SkeletonLoader';
import { logger } from '../utils/logger';
import Colors from '../config/colors';

interface ReactionViewerModalProps {
    visible: boolean;
    postId: string;
    onClose: () => void;
}

const REACTION_EMOJIS: Record<ReactionType, string> = {
    like: '??',
    heart: '??',
    muscle: '??',
};

const REACTION_LABELS: Record<ReactionType, string> = {
    like: 'Likes',
    heart: 'Hearts',
    muscle: 'Muscle',
};

const ReactionViewerModal: React.FC<ReactionViewerModalProps> = ({
    visible,
    postId,
    onClose,
}) => {
    const [reactions, setReactions] = useState<Reaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedTab, setSelectedTab] = useState<ReactionType | 'all'>('all');
    const slideAnim = useModalAnimation(visible);

    useEffect(() => {
        if (visible) {
            loadReactions();
        }
    }, [visible, postId]);

    const loadReactions = async () => {
        setLoading(true);
        try {
            const allReactions = await reactionService.getReactions(postId);
            setReactions(allReactions);

            // Auto-select first tab with reactions
            if (allReactions.length > 0) {
                const firstType = allReactions[0].type;
                setSelectedTab('all');
            }
        } catch (error) {
            logger.error('Error loading reactions:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        onClose();
    };

    const groupedReactions = reactions.reduce((acc, reaction) => {
        if (!acc[reaction.type]) {
            acc[reaction.type] = [];
        }
        acc[reaction.type].push(reaction);
        return acc;
    }, {} as Record<ReactionType, Reaction[]>);

    const reactionTypes = Object.keys(groupedReactions) as ReactionType[];

    const filteredReactions = selectedTab === 'all'
        ? reactions
        : groupedReactions[selectedTab] || [];

    const getTabCount = (type: ReactionType | 'all') => {
        if (type === 'all') return reactions.length;
        return groupedReactions[type]?.length || 0;
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleClose}
        >
            <TouchableOpacity
                style={[commonStyles.modalOverlay, { justifyContent: 'flex-end' }]}
                activeOpacity={1}
                onPress={handleClose}
            >
                <Animated.View
                    style={[
                        styles.modalContainer,
                        {
                            transform: [{ translateY: slideAnim }],
                        },
                    ]}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={(e) => e.stopPropagation()}
                        style={{ flex: 1 }}
                    >
                        <View style={styles.header}>
                            <Text style={styles.title}>Reactions</Text>
                            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                                <X color="#6b7280" size={24} />
                            </TouchableOpacity>
                        </View>

                        {/* Tabs */}
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.tabsContainer}
                            contentContainerStyle={styles.tabsContent}
                        >
                            <TouchableOpacity
                                style={[
                                    styles.tab,
                                    selectedTab === 'all' && styles.tabActive,
                                ]}
                                onPress={() => setSelectedTab('all')}
                            >
                                <Text
                                    style={[
                                        styles.tabText,
                                        selectedTab === 'all' && styles.tabTextActive,
                                    ]}
                                >
                                    All {reactions.length > 0 && `(${reactions.length})`}
                                </Text>
                            </TouchableOpacity>

                            {reactionTypes.map((type) => (
                                <TouchableOpacity
                                    key={type}
                                    style={[
                                        styles.tab,
                                        selectedTab === type && styles.tabActive,
                                    ]}
                                    onPress={() => setSelectedTab(type)}
                                >
                                    <Text style={styles.tabEmoji}>{REACTION_EMOJIS[type]}</Text>
                                    <Text
                                        style={[
                                            styles.tabText,
                                            selectedTab === type && styles.tabTextActive,
                                        ]}
                                    >
                                        {getTabCount(type)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Reactions List */}
                        <ScrollView style={styles.reactionsList}>
                            {loading ? (
                                <>
                                    {[1, 2, 3].map((i) => (
                                        <ReactionSkeleton key={i} />
                                    ))}
                                </>
                            ) : filteredReactions.length === 0 ? (
                                <View style={styles.emptyContainer}>
                                    <Text style={styles.emptyText}>No reactions yet</Text>
                                </View>
                            ) : (
                                filteredReactions.map((reaction) => (
                                    <View key={reaction.id} style={styles.reactionItem}>
                                        {reaction.userProfileImageUrl ? (
                                            <Image
                                                source={{ uri: reaction.userProfileImageUrl }}
                                                style={styles.avatar}
                                            />
                                        ) : (
                                            <View style={styles.avatarPlaceholder}>
                                                <Text style={styles.avatarText}>
                                                    {reaction.userName?.[0]?.toUpperCase() || 'U'}
                                                </Text>
                                            </View>
                                        )}
                                        <View style={styles.userInfo}>
                                            <Text style={styles.userName}>{reaction.userName}</Text>
                                        </View>
                                        <Text style={styles.reactionEmoji}>
                                            {REACTION_EMOJIS[reaction.type]}
                                        </Text>
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    </TouchableOpacity>
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '80%',
        paddingBottom: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    closeButton: {
        padding: 4,
    },
    tabsContainer: {
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    tabsContent: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f3f4f6',
        gap: 6,
        marginRight: 8,
    },
    tabActive: {
        backgroundColor: '#e0e7ff',
        borderWidth: 1.5,
        borderColor: Colors.secondary,
    },
    tabEmoji: {
        fontSize: 16,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6b7280',
    },
    tabTextActive: {
        color: Colors.secondary,
    },
    reactionsList: {
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    loadingContainer: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    emptyContainer: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 15,
        color: '#9ca3af',
    },
    reactionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    avatarPlaceholder: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#e0e7ff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.accentDark,
    },
    userInfo: {
        flex: 1,
        marginLeft: 12,
    },
    userName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111827',
    },
    reactionEmoji: {
        fontSize: 20,
    },
});

export default ReactionViewerModal;
