import React, { useEffect, useState, useMemo } from 'react';
import { Colors, useColors } from '../config';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    useWindowDimensions,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { ChevronLeft, Bell, ShoppingCart, Bug } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { notificationService } from '../services/NotificationService';
import { isTest } from '../config/environment';
import { DateHelper } from '../utils/DateHelper';
import { useRootNavigation } from '../types/navigation';

interface SharedHeaderProps {
    title: string;
    subtitle?: string;
    showBack?: boolean;
    showNotifications?: boolean;
    showCart?: boolean;
    rightActions?: React.ReactNode;
    onBackPress?: () => void;
    /** Pass an already-fetched unread count to avoid creating a duplicate Firestore listener */
    unreadNotificationCount?: number;
}

type HeaderStyles = ReturnType<typeof createStyles>;

const ActionButton: React.FC<{
    onPress: () => void;
    icon: React.ReactNode;
    badge?: number;
    accessibilityLabel?: string;
    styles: HeaderStyles;
}> = ({ onPress, icon, badge, accessibilityLabel, styles }) => {
    const scaleAnim = React.useRef(new Animated.Value(1)).current;

    const handlePress = () => {
        Animated.sequence([
            Animated.timing(scaleAnim, {
                toValue: 0.85,
                duration: 80,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 300,
                friction: 10,
            }),
        ]).start();
        onPress();
    };

    return (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
                onPress={handlePress}
                style={styles.actionButton}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
            >
                {icon}
                {badge !== undefined && badge > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                            {badge > 9 ? '9+' : badge}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
};

const SharedHeader: React.FC<SharedHeaderProps> = ({
    title,
    subtitle,
    showBack,
    showNotifications,
    showCart,
    rightActions,
    onBackPress,
    unreadNotificationCount,
}) => {
    const colors = useColors();
    const { width: screenWidth } = useWindowDimensions();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const headerPaddingHorizontal = screenWidth < 380 ? Spacing.lg : Spacing.xl;

    const navigation = useRootNavigation();
    const route = useRoute();
    const { state, dispatch } = useApp();
    const [ownUnreadCount, setOwnUnreadCount] = useState(0);
    const [, setTick] = useState(0);

    // Auto-detect context from route name
    const routeName = route.name;
    const isFooterPage = ['CategorySelection', 'Goals', 'Profile', 'Feed'].includes(routeName);
    const isCategorySelection = routeName === 'CategorySelection';

    // Auto-enable notifications button for footer pages
    const shouldShowNotifications = showNotifications ?? isFooterPage;

    // Auto-enable cart button for CategorySelection
    const shouldShowCart = showCart ?? isCategorySelection;

    // Calculate cart item count
    const currentCart = state.user?.cart || state.guestCart || [];
    const cartItemCount = currentCart.reduce((total, item) => total + item.quantity, 0) || 0;

    // Listen to notifications only when a count isn't provided from outside (avoid duplicate listeners)
    useEffect(() => {
        if (unreadNotificationCount !== undefined) return; // caller owns the count
        if (!state.user?.id || !shouldShowNotifications) {
            setOwnUnreadCount(0);
            return;
        }
        const unsubscribe = notificationService.listenToUserNotifications(
            state.user.id,
            (notifications) => {
                const unread = notifications.filter((n) => !n.read).length;
                setOwnUnreadCount(unread);
            }
        );
        return unsubscribe;
    }, [state.user?.id, shouldShowNotifications, unreadNotificationCount]);

    const unreadCount = unreadNotificationCount ?? ownUnreadCount;

    // Refresh time offset display every 1s when debug mode is active
    useEffect(() => {
        if (!isTest || !state.debugMode) return;
        const interval = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, [state.debugMode]);

    const handleDebugToggle = () => {
        dispatch({ type: 'TOGGLE_DEBUG_MODE' });
    };

    const timeOffset = DateHelper.getOffset();
    const hasTimeOffset = timeOffset !== 0;
    const simulatedTimeLabel = hasTimeOffset
        ? DateHelper.now().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : null;

    const handleBackPress = () => {
        if (onBackPress) {
            onBackPress();
        } else if (navigation.canGoBack()) {
            navigation.goBack();
        } else {
            navigation.navigate('Goals');
        }
    };

    const handleNotificationsPress = () => {
        navigation.navigate('Notification');
    };

    const handleCartPress = () => {
        navigation.navigate('Cart');
    };

    return (
        <View style={styles.headerWrapper}>
            <View style={[styles.header, { paddingHorizontal: headerPaddingHorizontal }]}>
                {/* Left: back + title */}
                <View style={styles.headerLeft}>
                    {showBack && (
                        <TouchableOpacity
                            onPress={handleBackPress}
                            style={styles.backButton}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            accessibilityLabel="Go back"
                            accessibilityRole="button"
                        >
                            <ChevronLeft color={colors.textPrimary} size={24} strokeWidth={2} />
                        </TouchableOpacity>
                    )}
                    <View style={styles.headerTextContainer}>
                        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
                        {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
                    </View>
                </View>

                {/* Right: actions */}
                <View style={styles.headerButtons}>
                    {isTest && (
                        <View style={styles.debugToggleWrapper}>
                            <TouchableOpacity
                                onPress={handleDebugToggle}
                                style={[
                                    styles.debugButton,
                                    state.debugMode && styles.debugActiveBackground,
                                ]}
                                accessibilityLabel="Toggle debug mode"
                                accessibilityRole="button"
                            >
                                <Bug
                                    color={state.debugMode ? colors.white : colors.textMuted}
                                    size={18}
                                    strokeWidth={2}
                                />
                            </TouchableOpacity>
                            {state.debugMode && hasTimeOffset && simulatedTimeLabel && (
                                <View style={styles.timeOffsetBadge}>
                                    <Text style={styles.timeOffsetText}>{simulatedTimeLabel}</Text>
                                </View>
                            )}
                        </View>
                    )}
                    {rightActions}
                    {shouldShowCart && (
                        <ActionButton
                            onPress={handleCartPress}
                            icon={<ShoppingCart color={colors.textSecondary} size={22} strokeWidth={1.8} />}
                            badge={cartItemCount}
                            accessibilityLabel="Shopping cart"
                            styles={styles}
                        />
                    )}
                    {shouldShowNotifications && (
                        <ActionButton
                            onPress={handleNotificationsPress}
                            icon={<Bell color={colors.textSecondary} size={22} strokeWidth={1.8} />}
                            badge={unreadCount}
                            accessibilityLabel="Notifications"
                            styles={styles}
                        />
                    )}
                </View>
            </View>
            <View style={[styles.separator, { marginHorizontal: headerPaddingHorizontal }]} />
        </View>
    );
};

const createStyles = (colors: typeof Colors) =>
    StyleSheet.create({
        headerWrapper: {
            zIndex: 100,
            backgroundColor: colors.white,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: Spacing.xl,
            paddingTop: Spacing.lg,
            paddingBottom: Spacing.md,
        },
        separator: {
            height: 1,
            backgroundColor: colors.border,
            marginHorizontal: Spacing.xl,
        },
        headerLeft: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            marginRight: Spacing.md,
        },
        backButton: {
            width: 44,
            height: 44,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: Spacing.sm,
        },
        headerTextContainer: {
            flex: 1,
        },
        headerTitle: {
            ...Typography.heading2,
            color: colors.textPrimary,
            letterSpacing: -0.3,
        },
        headerSubtitle: {
            ...Typography.caption,
            color: colors.textMuted,
            marginTop: Spacing.xxs,
        },
        headerButtons: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.lg,
        },
        actionButton: {
            position: 'relative',
            padding: Spacing.xs,
        },
        badge: {
            position: 'absolute',
            top: -2,
            right: -4,
            backgroundColor: colors.error,
            borderRadius: 9,
            minWidth: 18,
            height: 18,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 3,
            borderWidth: 2,
            borderColor: colors.surface,
        },
        badgeText: {
            color: colors.white,
            ...Typography.micro,
        },
        debugToggleWrapper: {
            alignItems: 'center',
        },
        debugButton: {
            width: 32,
            height: 32,
            borderRadius: BorderRadius.md,
            justifyContent: 'center',
            alignItems: 'center',
        },
        debugActiveBackground: {
            backgroundColor: colors.error,
        },
        timeOffsetBadge: {
            position: 'absolute',
            top: 36,
            backgroundColor: colors.error,
            paddingHorizontal: Spacing.xs,
            paddingVertical: Spacing.xxs,
            borderRadius: BorderRadius.xs,
            minWidth: 80,
            alignItems: 'center',
        },
        timeOffsetText: {
            color: colors.white,
            ...Typography.micro,
        },
    });

export default React.memo(SharedHeader);
