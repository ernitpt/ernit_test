import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Trophy, Gift } from 'lucide-react-native';
import type { FeedPost as FeedPostType } from '../../types';
import Colors from '../../config/colors';

interface FeedPostContentProps {
    post: FeedPostType;
    currentUserId?: string;
    onEmpowerContext: () => void;
    onNavigate: (screen: string, params?: any) => void;
}

const FeedPostContent: React.FC<FeedPostContentProps> = ({
    post,
    currentUserId,
    onEmpowerContext,
    onNavigate,
}) => {
    return (
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
                                            ? { backgroundColor: Colors.primary }
                                            : { backgroundColor: Colors.border },
                                    ]}
                                />
                            ))}
                        </View>
                    </View>

                    <View style={styles.progressBlock}>
                        <View style={styles.progressHeader}>
                            <Text style={styles.progressLabel}>Weeks completed</Text>
                            <Text style={styles.progressText}>
                                {Math.floor((post.sessionNumber - (post.weeklyCount || 0)) / (post.sessionsPerWeek || 1))}/{Math.floor((post.totalSessions || 1) / (post.sessionsPerWeek || 1))}
                            </Text>
                        </View>
                        <View style={styles.capsuleRow}>
                            {Array.from({ length: Math.min(Math.floor((post.totalSessions || 1) / (post.sessionsPerWeek || 1)), 20) }, (_, i) => (
                                <View
                                    key={i}
                                    style={[
                                        styles.capsule,
                                        i < Math.floor((post.sessionNumber - (post.weeklyCount || 0)) / (post.sessionsPerWeek || 1))
                                            ? { backgroundColor: Colors.secondary }
                                            : { backgroundColor: Colors.border },
                                    ]}
                                />
                            ))}
                        </View>
                    </View>
                </>
            )}
            {post.type === 'goal_completed' && post.experienceTitle && !(post.isFreeGoal && !post.experienceGiftId) ? (
                <View style={styles.experienceSection}>
                    {post.isMystery ? (
                        <View style={[styles.experienceImage, styles.experienceImagePlaceholder, { backgroundColor: '#fef3c7' }]}>
                            <Text style={styles.experienceImagePlaceholderText}>?</Text>
                        </View>
                    ) : post.experienceImageUrl ? (
                        <Image source={{ uri: post.experienceImageUrl }} style={styles.experienceImage} />
                    ) : (
                        <View style={[styles.experienceImage, styles.experienceImagePlaceholder]}>
                            <Text style={styles.experienceImagePlaceholderText}>🎁</Text>
                        </View>
                    )}
                    <View style={styles.experienceContent}>
                        <Text style={styles.experienceTitle} numberOfLines={1}>
                            {post.isMystery ? 'Mystery Experience' : post.experienceTitle}
                        </Text>
                        {!post.isMystery && post.partnerName && (
                            <Text style={styles.partnerName} numberOfLines={1}>
                                {post.partnerName}
                            </Text>
                        )}
                        <Text style={styles.goalDescriptionText} numberOfLines={2}>
                            Goal: {post.goalDescription}
                        </Text>
                        {post.totalSessions && post.sessionsPerWeek && (
                            <Text style={styles.experienceMeta}>
                                {post.totalSessions} sessions • {Math.floor(post.totalSessions / post.sessionsPerWeek)} weeks
                            </Text>
                        )}
                    </View>
                </View>
            ) : post.type === 'goal_completed' && !post.experienceTitle ? (
                <View style={styles.achievementCard}>
                    <View style={styles.achievementIconRow}>
                        <View style={styles.achievementIcon}>
                            <Trophy size={18} color={Colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.achievementGoal} numberOfLines={2}>{post.goalDescription}</Text>
                            {post.totalSessions && post.sessionsPerWeek && (
                                <Text style={styles.achievementStats}>
                                    {post.totalSessions} sessions • {Math.floor(post.totalSessions / post.sessionsPerWeek)} weeks
                                </Text>
                            )}
                        </View>
                    </View>
                    {post.userId !== currentUserId && !post.isFreeGoal && (
                        <TouchableOpacity
                            style={styles.congratsGiftButton}
                            onPress={() => {
                                onEmpowerContext();
                                onNavigate('CategorySelection');
                            }}
                            activeOpacity={0.8}
                        >
                            <Gift size={15} color="#fff" />
                            <Text style={styles.congratsGiftText}>Gift an Experience</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : post.type !== 'session_progress' ? (
                <View>
                    <Text style={styles.activityText}>
                        <Text style={styles.progressLabel}>{post.goalDescription}</Text>
                    </Text>
                </View>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 16,
        marginBottom: 10,
    },
    activityText: {
        fontSize: 15,
        lineHeight: 22,
        color: '#374151',
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
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    progressText: {
        fontSize: 13,
        color: Colors.textPrimary,
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
    experienceSection: {
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: Colors.border,
        marginTop: 8,
    },
    experienceImage: {
        width: '100%',
        height: 140,
        backgroundColor: Colors.border,
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
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    partnerName: {
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 4,
    },
    goalDescriptionText: {
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 6,
    },
    experienceMeta: {
        fontSize: 13,
        color: Colors.textMuted,
    },
    achievementCard: {
        backgroundColor: Colors.primarySurface,
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: Colors.primaryBorder,
    },
    achievementIconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    achievementIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.primaryTint,
        alignItems: 'center',
        justifyContent: 'center',
    },
    achievementGoal: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textPrimary,
        lineHeight: 20,
    },
    achievementStats: {
        fontSize: 12,
        color: Colors.textMuted,
        marginTop: 2,
    },
    congratsGiftButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: Colors.secondary,
        paddingVertical: 10,
        borderRadius: 10,
        marginTop: 12,
    },
    congratsGiftText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
});

export default React.memo(FeedPostContent);
