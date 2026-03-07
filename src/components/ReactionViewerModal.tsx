import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Image,
    ScrollView,
    Animated,
} from 'react-native';
import { X } from 'lucide-react-native';
import type { Reaction, ReactionType } from '../types';
import { reactionService } from '../services/ReactionService';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { commonStyles } from '../styles/commonStyles';
import { ReactionSkeleton } from './SkeletonLoader';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../config';

interface ReactionViewerModalProps {
    visible: boolean;
    postId: string;
    onClose: () => void;
}

const REACTION_EMOJIS: Record<ReactionType, string> = {
    like: '\u{1F44D}',
    heart: '\u{2764}\u{FE0F}',
    muscle: '\u{1F4AA}',
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
            await logErrorToFirestore(error, {
                screenName: 'ReactionViewerModal',
                feature: 'LoadReactions',
                userId: 'system',
                additionalData: { postId },
            });
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        onClose();
    };

    const groupedReactions = useMemo(() =>
        reactions.reduce((acc, reaction) => {
            if (!acc[reaction.type]) {
                acc[reaction.type] = [];
            }
            acc[reaction.type].push(reaction);
            return acc;
        }, {} as Record<ReactionType, Reaction[]>),
        [reactions]
    );

    const reactionTypes = Object.keys(groupedReactions) as ReactionType[];

    const filteredReactions = useMemo(() =>
        selectedTab === 'all'
            ? reactions
            : groupedReactions[selectedTab] || [],
        [selectedTab, reactions, groupedReactions]
    );

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
                                <X color={Colors.textSecondary} size={24} />
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
        backgroundColor: Colors.white,
        borderTopLeftRadius: BorderRadius.xxl,
        borderTopRightRadius: BorderRadius.xxl,
        maxHeight: '80%',
        paddingBottom: Spacing.xl,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.screenPadding,
        paddingTop: Spacing.screenPadding,
        paddingBottom: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    title: {
        ...Typography.heading3,
        color: Colors.textPrimary,
    },
    closeButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tabsContainer: {
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    tabsContent: {
        paddingHorizontal: Spacing.cardPadding,
        paddingVertical: Spacing.md,
        gap: Spacing.sm,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.cardPadding,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.xl,
        backgroundColor: Colors.backgroundLight,
        gap: Spacing.xs,
        marginRight: Spacing.sm,
    },
    tabActive: {
        backgroundColor: Colors.primarySurface,
        borderWidth: 1.5,
        borderColor: Colors.secondary,
    },
    tabEmoji: {
        fontSize: 16,
    },
    tabText: {
        ...Typography.smallBold,
        color: Colors.textSecondary,
    },
    tabTextActive: {
        color: Colors.secondary,
    },
    reactionsList: {
        paddingHorizontal: Spacing.screenPadding,
        paddingTop: Spacing.md,
    },
    loadingContainer: {
        paddingVertical: Spacing.huge,
        alignItems: 'center',
    },
    emptyContainer: {
        paddingVertical: Spacing.huge,
        alignItems: 'center',
    },
    emptyText: {
        ...Typography.body,
        color: Colors.textMuted,
    },
    reactionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.backgroundLight,
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
        backgroundColor: Colors.primarySurface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        ...Typography.heading3,
        color: Colors.primary,
    },
    userInfo: {
        flex: 1,
        marginLeft: Spacing.md,
    },
    userName: {
        ...Typography.bodyBold,
        color: Colors.textPrimary,
    },
    reactionEmoji: {
        fontSize: 20,
    },
});

export default ReactionViewerModal;
