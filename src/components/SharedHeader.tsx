import React, { useEffect, useState } from 'react';
import Colors from '../config/colors';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
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
    variant?: 'default' | 'transparent' | 'solid';
    showBack?: boolean;
    showNotifications?: boolean;
    showCart?: boolean;
    rightActions?: React.ReactNode;
    onBackPress?: () => void;
}

const ActionButton: React.FC<{
    onPress: () => void;
    icon: React.ReactNode;
    badge?: number;
}> = ({ onPress, icon, badge }) => {
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
    variant = 'default',
    showBack,
    showNotifications,
    showCart,
    rightActions,
    onBackPress,
}) => {
    const navigation = useRootNavigation();
    const route = useRoute();
    const { state, dispatch } = useApp();
    const [unreadCount, setUnreadCount] = useState(0);
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

    // Listen to notifications
    useEffect(() => {
        if (!state.user?.id || !shouldShowNotifications) {
            setUnreadCount(0);
            return;
        }
        const unsubscribe = notificationService.listenToUserNotifications(
            state.user.id,
            (notifications) => {
                const unread = notifications.filter((n) => !n.read).length;
                setUnreadCount(unread);
            }
        );
        return unsubscribe;
    }, [state.user?.id, shouldShowNotifications]);

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
            <View style={styles.header}>
                {/* Left: back + title */}
                <View style={styles.headerLeft}>
                    {showBack && (
                        <TouchableOpacity
                            onPress={handleBackPress}
                            style={styles.backButton}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                            <ChevronLeft color={Colors.textPrimary} size={24} strokeWidth={2} />
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
                            >
                                <Bug
                                    color={state.debugMode ? Colors.white : Colors.textMuted}
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
                            icon={<ShoppingCart color={Colors.textSecondary} size={22} strokeWidth={1.8} />}
                            badge={cartItemCount}
                        />
                    )}
                    {shouldShowNotifications && (
                        <ActionButton
                            onPress={handleNotificationsPress}
                            icon={<Bell color={Colors.textSecondary} size={22} strokeWidth={1.8} />}
                            badge={unreadCount}
                        />
                    )}
                </View>
            </View>
            <View style={styles.separator} />
        </View>
    );
};

const styles = StyleSheet.create({
    headerWrapper: {
        zIndex: 100,
        backgroundColor: Colors.white,
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
        backgroundColor: Colors.border,
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
        color: Colors.textPrimary,
        letterSpacing: -0.3,
    },
    headerSubtitle: {
        ...Typography.caption,
        color: Colors.textMuted,
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
        backgroundColor: Colors.error,
        borderRadius: 9,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 3,
        borderWidth: 2,
        borderColor: Colors.white,
    },
    badgeText: {
        color: Colors.white,
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
        backgroundColor: Colors.error,
    },
    timeOffsetBadge: {
        position: 'absolute',
        top: 36,
        backgroundColor: Colors.error,
        paddingHorizontal: Spacing.xs,
        paddingVertical: Spacing.xxs,
        borderRadius: BorderRadius.xs,
        minWidth: 80,
        alignItems: 'center',
    },
    timeOffsetText: {
        color: Colors.white,
        ...Typography.micro,
    },
});

export default SharedHeader;
