import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Reaction, ReactionType } from '../types';
import { reactionService } from '../services/ReactionService';
import { ReactionSkeleton } from './SkeletonLoader';
import { logger } from '../utils/logger';
import { logErrorToFirestore } from '../utils/errorLogger';
import { Colors, useColors, Typography, Spacing, BorderRadius } from '../config';
import { EmptyState } from './EmptyState';
import { BaseModal } from './BaseModal';
import { Avatar } from './Avatar';

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
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();

    useEffect(() => {
        if (!visible) return;
        let mounted = true;

        const load = async () => {
            setLoading(true);
            try {
                const allReactions = await reactionService.getReactions(postId);
                if (!mounted) return;
                setReactions(allReactions);
                setSelectedTab('all');
            } catch (error: unknown) {
                if (!mounted) return;
                logger.error('Error loading reactions:', error);
                await logErrorToFirestore(error, {
                    screenName: 'ReactionViewerModal',
                    feature: 'LoadReactions',
                    userId: 'system',
                    additionalData: { postId },
                });
            } finally {
                if (mounted) setLoading(false);
            }
        };

        load();
        return () => { mounted = false; };
    }, [visible, postId]);

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
        <BaseModal visible={visible} onClose={handleClose} title="Reactions" variant="bottom" noPadding>
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
                    accessibilityRole="tab"
                    accessibilityLabel={t('modals.reactionViewer.allReactions')}
                    accessibilityState={{ selected: selectedTab === 'all' }}
                >
                    <Text
                        style={[
                            styles.tabText,
                            selectedTab === 'all' && styles.tabTextActive,
                        ]}
                    >
                        {reactions.length > 0 ? t('modals.reactionViewer.allTabWithCount', { count: reactions.length }) : t('modals.reactionViewer.allTab')}
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
                        accessibilityRole="tab"
                        accessibilityLabel={t('modals.reactionViewer.reactionType', { emoji: REACTION_EMOJIS[type] })}
                        accessibilityState={{ selected: selectedTab === type }}
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
                    <EmptyState
                        icon="❤️"
                        title={t('modals.reactionViewer.noReactionsTitle')}
                        message={t('modals.reactionViewer.noReactionsMessage')}
                    />
                ) : (
                    filteredReactions.map((reaction) => (
                        <View key={reaction.id} style={styles.reactionItem}>
                            <Avatar uri={reaction.userProfileImageUrl} name={reaction.userName} size="sm" />
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
        </BaseModal>
    );
};

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        tabsContainer: {
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
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
            backgroundColor: colors.backgroundLight,
            gap: Spacing.xs,
            marginRight: Spacing.sm,
        },
        tabActive: {
            backgroundColor: colors.primarySurface,
            borderWidth: 1.5,
            borderColor: colors.secondary,
        },
        tabEmoji: {
            fontSize: Typography.subheading.fontSize,
        },
        tabText: {
            ...Typography.smallBold,
            color: colors.textSecondary,
        },
        tabTextActive: {
            color: colors.secondary,
        },
        reactionsList: {
            paddingHorizontal: Spacing.screenPadding,
            paddingTop: Spacing.md,
        },
        loadingContainer: {
            paddingVertical: Spacing.huge,
            alignItems: 'center',
        },
        reactionItem: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: Spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.backgroundLight,
        },
        userInfo: {
            flex: 1,
            marginLeft: Spacing.md,
        },
        userName: {
            ...Typography.bodyBold,
            color: colors.textPrimary,
        },
        reactionEmoji: {
            fontSize: Typography.large.fontSize,
        },
    });

export default React.memo(ReactionViewerModal);
