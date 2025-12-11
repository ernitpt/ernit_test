import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

interface SkeletonLoaderProps {
    width?: number | string;
    height?: number;
    borderRadius?: number;
    style?: any;
}

export const SkeletonBox: React.FC<SkeletonLoaderProps> = ({
    width = '100%',
    height = 20,
    borderRadius = 4,
    style,
}) => {
    const opacity = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0.3,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    return (
        <Animated.View
            style={[
                styles.skeleton,
                {
                    width,
                    height,
                    borderRadius,
                    opacity,
                },
                style,
            ]}
        />
    );
};

// Feed Post Skeleton
export const FeedPostSkeleton: React.FC = () => {
    return (
        <View style={styles.feedPostSkeleton}>
            {/* Header */}
            <View style={styles.header}>
                <SkeletonBox width={48} height={48} borderRadius={24} />
                <View style={styles.headerInfo}>
                    <SkeletonBox width="70%" height={16} style={{ marginBottom: 8 }} />
                    <SkeletonBox width="40%" height={12} />
                </View>
            </View>

            {/* Content */}
            <View style={styles.content}>
                <SkeletonBox width="100%" height={12} style={{ marginBottom: 8 }} />
                <SkeletonBox width="85%" height={12} />
            </View>

            {/* Progress bars */}
            <View style={{ marginTop: 16 }}>
                <SkeletonBox width="100%" height={8} style={{ marginBottom: 12 }} />
                <SkeletonBox width="100%" height={8} />
            </View>

            {/* Reactions */}
            <View style={styles.reactions}>
                <SkeletonBox width={80} height={32} borderRadius={16} />
                <SkeletonBox width={60} height={32} borderRadius={16} />
            </View>
        </View>
    );
};

// Goal Card Skeleton
export const GoalCardSkeleton: React.FC = () => {
    return (
        <View style={styles.goalCardSkeleton}>
            <View style={styles.goalHeader}>
                <SkeletonBox width="60%" height={20} style={{ marginBottom: 8 }} />
                <SkeletonBox width="40%" height={14} />
            </View>
            <View style={{ marginVertical: 16 }}>
                <SkeletonBox width="100%" height={8} style={{ marginBottom: 8 }} />
                <SkeletonBox width="100%" height={8} />
            </View>
            <View style={styles.goalFooter}>
                <SkeletonBox width={100} height={36} borderRadius={8} />
                <SkeletonBox width={100} height={36} borderRadius={8} />
            </View>
        </View>
    );
};

// Experience Card Skeleton - Matches CategorySelectionScreen card dimensions
export const ExperienceCardSkeleton: React.FC = () => {
    return (
        <View style={styles.experienceCardSkeleton}>
            <SkeletonBox width={175} height={100} borderRadius={12} style={{ marginBottom: 0 }} />
            <View style={{ padding: 10 }}>
                <SkeletonBox width="80%" height={15} style={{ marginBottom: 6 }} />
                <SkeletonBox width="60%" height={13} style={{ marginBottom: 8 }} />
                <SkeletonBox width="40%" height={14} />
            </View>
        </View>
    );
};

// List Item Skeleton
export const ListItemSkeleton: React.FC = () => {
    return (
        <View style={styles.listItemSkeleton}>
            <SkeletonBox width={48} height={48} borderRadius={24} />
            <View style={styles.listItemContent}>
                <SkeletonBox width="70%" height={16} style={{ marginBottom: 8 }} />
                <SkeletonBox width="50%" height={12} />
            </View>
        </View>
    );
};

// Notification Skeleton
export const NotificationSkeleton: React.FC = () => {
    return (
        <View style={styles.notificationSkeleton}>
            <SkeletonBox width={40} height={40} borderRadius={20} />
            <View style={styles.notificationContent}>
                <SkeletonBox width="90%" height={14} style={{ marginBottom: 6 }} />
                <SkeletonBox width="60%" height={12} style={{ marginBottom: 6 }} />
                <SkeletonBox width="30%" height={10} />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    skeleton: {
        backgroundColor: '#e5e7eb',
    },
    feedPostSkeleton: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    headerInfo: {
        marginLeft: 12,
        flex: 1,
    },
    content: {
        marginBottom: 12,
    },
    reactions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 12,
    },
    goalCardSkeleton: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    goalHeader: {
        marginBottom: 8,
    },
    goalFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 16,
    },
    experienceCardSkeleton: {
        width: 175,
        height: 200,
        backgroundColor: '#fff',
        borderRadius: 12,
        marginRight: 12,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
        overflow: 'hidden',
    },
    listItemSkeleton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 8,
    },
    listItemContent: {
        marginLeft: 12,
        flex: 1,
    },
    notificationSkeleton: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 8,
    },
    notificationContent: {
        marginLeft: 12,
        flex: 1,
    },
});

export default SkeletonBox;
