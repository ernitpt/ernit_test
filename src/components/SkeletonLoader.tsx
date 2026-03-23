import React, { useMemo } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Dimensions } from 'react-native';
import { MotiView } from 'moti';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import { Shadows } from '../config/shadows';
import { vh } from '../utils/responsive';

const SCREEN_W = Dimensions.get('window').width;

interface SkeletonLoaderProps {
    width?: number | string;
    height?: number;
    borderRadius?: number;
    style?: StyleProp<ViewStyle>;
}

export const SkeletonBox: React.FC<SkeletonLoaderProps> = ({
    width = '100%',
    height = 20,
    borderRadius = 4,
    style,
}) => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <MotiView
            from={{ opacity: 0.3 }}
            animate={{ opacity: 1 }}
            transition={{
                type: 'timing',
                duration: 800,
                loop: true,
                repeatReverse: true,
            }}
            style={[
                styles.skeleton,
                {
                    width,
                    height,
                    borderRadius,
                },
                style,
            ]}
        />
    );
};

// Feed Post Skeleton
export const FeedPostSkeleton: React.FC = () => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.feedPostSkeleton} accessibilityLabel="Loading">
            {/* Header */}
            <View style={styles.header}>
                <SkeletonBox width={48} height={48} borderRadius={24} />
                <View style={styles.headerInfo}>
                    <SkeletonBox width="70%" height={16} style={{ marginBottom: Spacing.sm }} />
                    <SkeletonBox width="40%" height={12} />
                </View>
            </View>

            {/* Content */}
            <View style={styles.content}>
                <SkeletonBox width="100%" height={12} style={{ marginBottom: Spacing.sm }} />
                <SkeletonBox width="85%" height={12} />
            </View>

            {/* Progress bars */}
            <View style={{ marginTop: Spacing.lg }}>
                <SkeletonBox width="100%" height={8} style={{ marginBottom: Spacing.md }} />
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
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.goalCardSkeleton} accessibilityLabel="Loading">
            <View style={styles.goalHeader}>
                <SkeletonBox width="60%" height={20} style={{ marginBottom: Spacing.sm }} />
                <SkeletonBox width="40%" height={14} />
            </View>
            <View style={{ marginVertical: Spacing.lg }}>
                <SkeletonBox width="100%" height={8} style={{ marginBottom: Spacing.sm }} />
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
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.experienceCardSkeleton} accessibilityLabel="Loading">
            <SkeletonBox width={175} height={100} borderRadius={12} style={{ marginBottom: 0 }} />
            <View style={{ padding: 10 }}>
                <SkeletonBox width="80%" height={15} style={{ marginBottom: 6 }} />
                <SkeletonBox width="60%" height={13} style={{ marginBottom: Spacing.sm }} />
                <SkeletonBox width="40%" height={14} />
            </View>
        </View>
    );
};

// List Item Skeleton
export const ListItemSkeleton: React.FC = () => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.listItemSkeleton} accessibilityLabel="Loading">
            <SkeletonBox width={48} height={48} borderRadius={24} />
            <View style={styles.listItemContent}>
                <SkeletonBox width="70%" height={16} style={{ marginBottom: Spacing.sm }} />
                <SkeletonBox width="50%" height={12} />
            </View>
        </View>
    );
};

// Notification Skeleton
export const NotificationSkeleton: React.FC = () => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.notificationSkeleton} accessibilityLabel="Loading">
            <SkeletonBox width={40} height={40} borderRadius={20} />
            <View style={styles.notificationContent}>
                <SkeletonBox width="90%" height={14} style={{ marginBottom: 6 }} />
                <SkeletonBox width="60%" height={12} style={{ marginBottom: 6 }} />
                <SkeletonBox width="30%" height={10} />
            </View>
        </View>
    );
};

// Comment Skeleton - for CommentModal loading state
export const CommentSkeleton: React.FC = () => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.commentSkeleton} accessibilityLabel="Loading">
            <SkeletonBox width={40} height={40} borderRadius={20} />
            <View style={styles.commentSkeletonContent}>
                <SkeletonBox width="40%" height={14} style={{ marginBottom: 6 }} />
                <SkeletonBox width="90%" height={12} style={{ marginBottom: Spacing.xs }} />
                <SkeletonBox width="60%" height={12} />
            </View>
        </View>
    );
};

// Reaction Item Skeleton - for ReactionViewerModal loading state
export const ReactionSkeleton: React.FC = () => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.reactionSkeleton} accessibilityLabel="Loading">
            <SkeletonBox width={44} height={44} borderRadius={22} />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <SkeletonBox width="50%" height={15} />
            </View>
            <SkeletonBox width={24} height={24} borderRadius={12} />
        </View>
    );
};

// Gift Card Skeleton - for PurchasedGiftsScreen
export const GiftCardSkeleton: React.FC = () => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.giftCardSkeleton} accessibilityLabel="Loading">
            <View style={styles.giftCardRow}>
                <SkeletonBox width="55%" height={18} />
                <SkeletonBox width={70} height={24} borderRadius={8} />
            </View>
            <SkeletonBox width="65%" height={14} style={{ marginTop: Spacing.sm }} />
            <SkeletonBox width="40%" height={14} style={{ marginTop: 6 }} />
        </View>
    );
};

// Cart Item Skeleton - horizontal card for CartScreen
export const CartItemSkeleton: React.FC = () => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.cartItemSkeleton} accessibilityLabel="Loading">
            <SkeletonBox width={120} height={120} borderRadius={0} />
            <View style={styles.cartItemSkeletonContent}>
                <SkeletonBox width="80%" height={16} style={{ marginBottom: 6 }} />
                <SkeletonBox width="50%" height={13} />
                <View style={styles.cartItemSkeletonFooter}>
                    <SkeletonBox width={90} height={32} borderRadius={8} />
                    <SkeletonBox width={60} height={20} />
                </View>
            </View>
        </View>
    );
};


// Experience Detail Skeleton — hero image + info sections
export const ExperienceDetailSkeleton: React.FC = () => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.experienceDetailSkeleton} accessibilityLabel="Loading">
            <SkeletonBox width="100%" height={250} borderRadius={0} />
            <View style={{ padding: Spacing.xl }}>
                <SkeletonBox width="70%" height={22} style={{ marginBottom: 10 }} />
                <SkeletonBox width="50%" height={16} style={{ marginBottom: Spacing.xl }} />
                <SkeletonBox width="100%" height={14} style={{ marginBottom: Spacing.sm }} />
                <SkeletonBox width="90%" height={14} style={{ marginBottom: Spacing.sm }} />
                <SkeletonBox width="75%" height={14} style={{ marginBottom: Spacing.xxl }} />
                <SkeletonBox width="100%" height={48} borderRadius={12} />
            </View>
        </View>
    );
};

// Checkout Summary Skeleton
export const CheckoutSkeleton: React.FC = () => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.checkoutSkeleton} accessibilityLabel="Loading">
            <SkeletonBox width="100%" height={120} borderRadius={12} style={{ marginBottom: Spacing.lg }} />
            <SkeletonBox width="60%" height={18} style={{ marginBottom: Spacing.md }} />
            <SkeletonBox width="100%" height={14} style={{ marginBottom: Spacing.sm }} />
            <SkeletonBox width="80%" height={14} style={{ marginBottom: Spacing.xxl }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.lg }}>
                <SkeletonBox width="45%" height={16} />
                <SkeletonBox width="25%" height={16} />
            </View>
            <SkeletonBox width="100%" height={48} borderRadius={12} />
        </View>
    );
};

// Session Card Skeleton — for JourneyScreen session list
export const SessionCardSkeleton: React.FC = () => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.sessionCardSkeleton} accessibilityLabel="Loading">
            <SkeletonBox width={40} height={40} borderRadius={20} />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <SkeletonBox width="50%" height={16} style={{ marginBottom: 6 }} />
                <SkeletonBox width="70%" height={12} />
            </View>
            <SkeletonBox width={24} height={24} borderRadius={12} />
        </View>
    );
};

// Profile Skeleton — avatar + name + stats + goal cards
export const ProfileSkeleton: React.FC = () => {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.profileSkeleton} accessibilityLabel="Loading">
            <View style={{ alignItems: 'center', marginBottom: Spacing.xxl }}>
                <SkeletonBox width={80} height={80} borderRadius={40} style={{ marginBottom: Spacing.md }} />
                <SkeletonBox width={140} height={20} style={{ marginBottom: Spacing.sm }} />
                <SkeletonBox width={200} height={14} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: Spacing.xxl }}>
                <SkeletonBox width={60} height={50} borderRadius={8} />
                <SkeletonBox width={60} height={50} borderRadius={8} />
                <SkeletonBox width={60} height={50} borderRadius={8} />
            </View>
            <GoalCardSkeleton />
            <GoalCardSkeleton />
        </View>
    );
};

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        skeleton: {
            backgroundColor: colors.border,
        },
        feedPostSkeleton: {
            backgroundColor: colors.white,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            marginBottom: Spacing.md,
            ...Shadows.sm,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: Spacing.md,
        },
        headerInfo: {
            marginLeft: Spacing.md,
            flex: 1,
        },
        content: {
            marginBottom: Spacing.md,
        },
        reactions: {
            flexDirection: 'row',
            gap: Spacing.md,
            marginTop: Spacing.md,
        },
        goalCardSkeleton: {
            backgroundColor: colors.white,
            borderRadius: BorderRadius.lg,
            padding: Spacing.xl,
            marginBottom: Spacing.lg,
            ...Shadows.sm,
        },
        goalHeader: {
            marginBottom: Spacing.sm,
        },
        goalFooter: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: Spacing.lg,
        },
        experienceCardSkeleton: {
            width: (SCREEN_W - Spacing.lg * 3) / 2,
            height: vh(200),
            backgroundColor: colors.white,
            borderRadius: BorderRadius.md,
            marginRight: Spacing.md,
            ...Shadows.sm,
            overflow: 'hidden',
        },
        listItemSkeleton: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: Spacing.lg,
            backgroundColor: colors.white,
            borderRadius: BorderRadius.md,
            marginBottom: Spacing.sm,
        },
        listItemContent: {
            marginLeft: Spacing.md,
            flex: 1,
        },
        notificationSkeleton: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            padding: Spacing.lg,
            backgroundColor: colors.white,
            borderRadius: BorderRadius.md,
            marginBottom: Spacing.sm,
        },
        notificationContent: {
            marginLeft: Spacing.md,
            flex: 1,
        },
        commentSkeleton: {
            flexDirection: 'row',
            marginBottom: Spacing.lg,
            gap: Spacing.md,
            alignItems: 'flex-start',
        },
        commentSkeletonContent: {
            flex: 1,
        },
        reactionSkeleton: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: Spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.backgroundLight,
        },
        giftCardSkeleton: {
            backgroundColor: colors.white,
            borderRadius: BorderRadius.md,
            marginBottom: Spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
            padding: Spacing.lg,
        },
        giftCardRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        cartItemSkeleton: {
            backgroundColor: colors.white,
            borderRadius: BorderRadius.lg,
            marginBottom: Spacing.lg,
            overflow: 'hidden',
            flexDirection: 'row',
            shadowColor: colors.black,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 3,
        },
        cartItemSkeletonContent: {
            flex: 1,
            padding: Spacing.lg,
            justifyContent: 'space-between',
        },
        cartItemSkeletonFooter: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: Spacing.md,
        },
        experienceDetailSkeleton: {
            flex: 1,
            backgroundColor: colors.white,
        },
        checkoutSkeleton: {
            padding: Spacing.xl,
            backgroundColor: colors.white,
        },
        sessionCardSkeleton: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.white,
            borderRadius: BorderRadius.md,
            padding: Spacing.lg,
            marginBottom: Spacing.sm,
            borderWidth: 1,
            borderColor: colors.border,
        },
        profileSkeleton: {
            padding: Spacing.xl,
        },
    });

export default SkeletonBox;
