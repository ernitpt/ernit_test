import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Send } from 'lucide-react-native';
import type { FeedPost as FeedPostType } from '../../types';
import Colors from '../../config/colors';

interface FeedPostEmpowerActionsProps {
    post: FeedPostType;
    currentUserId?: string;
    canMotivate: boolean;
    onEmpower: () => void;
    onMotivate: () => void;
}

const FeedPostEmpowerActions: React.FC<FeedPostEmpowerActionsProps> = ({
    post,
    currentUserId,
    canMotivate,
    onEmpower,
    onMotivate,
}) => {
    return (
        <>
            {/* Free Goal: Experience Card Preview (milestone/completion posts) */}
            {post.isFreeGoal && post.pledgedExperienceId && post.userId !== currentUserId &&
                (post.type === 'session_progress' || post.type === 'goal_completed') &&
                post.experienceTitle && !post.isMystery && (
                    <TouchableOpacity style={styles.experiencePreviewCard} onPress={onEmpower} activeOpacity={0.85}>
                        {post.experienceImageUrl && (
                            <Image
                                source={{ uri: post.experienceImageUrl }}
                                style={styles.experiencePreviewImage}
                                accessibilityLabel={`${post.experienceTitle} experience`}
                            />
                        )}
                        <View style={styles.experiencePreviewInfo}>
                            <Text style={styles.experiencePreviewTitle} numberOfLines={1}>{post.experienceTitle}</Text>
                            {post.pledgedExperiencePrice && (
                                <Text style={styles.experiencePreviewPrice}>{'\u20AC'}{post.pledgedExperiencePrice}</Text>
                            )}
                        </View>
                        <View style={styles.experiencePreviewCta}>
                            <Text style={styles.experiencePreviewCtaText}>Gift</Text>
                        </View>
                    </TouchableOpacity>
                )}

            {/* Free Goal: Category Hint Card (no pledged experience, but has category preference) */}
            {post.isFreeGoal && !post.pledgedExperienceId && post.preferredRewardCategory &&
                post.userId !== currentUserId &&
                (post.type === 'session_progress' || post.type === 'goal_completed') && (
                <TouchableOpacity style={styles.categoryHintCard} onPress={onEmpower} activeOpacity={0.85}>
                    <Text style={styles.categoryHintEmoji}>
                        {post.preferredRewardCategory === 'adventure' ? '🏔️' : post.preferredRewardCategory === 'wellness' ? '🧘' : '🎨'}
                    </Text>
                    <View style={styles.categoryHintInfo}>
                        <Text style={styles.categoryHintText}>
                            Loves {post.preferredRewardCategory.charAt(0).toUpperCase() + post.preferredRewardCategory.slice(1)} experiences
                        </Text>
                    </View>
                    <View style={styles.experiencePreviewCta}>
                        <Text style={styles.experiencePreviewCtaText}>Gift</Text>
                    </View>
                </TouchableOpacity>
            )}

            {/* Free Goal: Empower Button */}
            {post.isFreeGoal && post.userId !== currentUserId && (post.pledgedExperienceId || post.preferredRewardCategory) && !(
                (post.type === 'session_progress' || post.type === 'goal_completed') &&
                post.experienceTitle && !post.isMystery
            ) && !(
                (post.type === 'session_progress' || post.type === 'goal_completed') &&
                post.preferredRewardCategory && !post.pledgedExperienceId
            ) && (
                <View style={styles.freeGoalActions}>
                    <TouchableOpacity
                        style={styles.empowerButton}
                        onPress={onEmpower}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`Empower ${post.userName} with this experience`}
                    >
                        <Image
                            source={require('../../assets/favicon.png')}
                            style={styles.empowerButtonLogo}
                        />
                        <Text style={styles.empowerButtonText}>Empower</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Motivate Button — all goals (only latest session, not completed) */}
            {canMotivate && (
                <View style={styles.motivateActions}>
                    <TouchableOpacity
                        style={styles.motivateButton}
                        onPress={onMotivate}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`Send motivation message to ${post.userName}`}
                    >
                        <Send color={Colors.secondary} size={16} />
                        <Text style={styles.motivateButtonText}>Motivate</Text>
                    </TouchableOpacity>
                </View>
            )}
        </>
    );
};

const styles = StyleSheet.create({
    freeGoalActions: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 16,
        marginTop: 4,
        marginBottom: 10,
    },
    motivateActions: {
        paddingHorizontal: 16,
        marginTop: 4,
        marginBottom: 10,
    },
    empowerButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: Colors.primarySurface,
        borderWidth: 1,
        borderColor: Colors.primaryTint,
    },
    empowerButtonLogo: {
        width: 18,
        height: 18,
        borderRadius: 4,
    },
    empowerButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.primary,
    },
    motivateButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: Colors.primarySurface,
        borderWidth: 1,
        borderColor: Colors.primaryTint,
    },
    motivateButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.secondary,
    },
    experiencePreviewCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primarySurface,
        borderRadius: 12,
        padding: 10,
        marginHorizontal: 16,
        marginTop: 4,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: Colors.primaryTint,
    },
    experiencePreviewImage: {
        width: 44,
        height: 44,
        borderRadius: 8,
        backgroundColor: Colors.border,
    },
    experiencePreviewInfo: {
        flex: 1,
        marginLeft: 10,
    },
    experiencePreviewTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1F2937',
    },
    experiencePreviewPrice: {
        fontSize: 12,
        fontWeight: '800',
        color: Colors.primary,
        marginTop: 2,
    },
    experiencePreviewCta: {
        backgroundColor: Colors.primary,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    experiencePreviewCtaText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
    },
    categoryHintCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8F9FA',
        borderRadius: 12,
        padding: 12,
        marginHorizontal: 16,
        marginTop: 4,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    categoryHintEmoji: {
        fontSize: 24,
        marginRight: 10,
    },
    categoryHintInfo: {
        flex: 1,
    },
    categoryHintText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
    },
});

export default React.memo(FeedPostEmpowerActions);
