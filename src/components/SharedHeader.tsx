import React, { useEffect, useState } from 'react';
import Colors from '../config/colors';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Platform,
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

    const ActionButton: React.FC<{
        onPress: () => void;
        icon: React.ReactNode;
        badge?: number;
    }> = ({ onPress, icon, badge }) => {
        const scaleAnim = new Animated.Value(1);

        const handlePress = () => {
            Animated.sequence([
                Animated.timing(scaleAnim, {
                    toValue: 0.88,
                    duration: 100,
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
                <TouchableOpacity onPress={handlePress} style={styles.actionButton}
                    hitSlop={{ top: 3, bottom: 3, left: 3, right: 3 }}>
                    <View style={styles.iconBackground}>
                        {icon}
                    </View>
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

    return (
        <View style={styles.headerWrapper}>
            <View style={styles.solidBackground}>
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <View style={styles.headerLeft}>
                            {showBack && (
                                <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
                                    <ChevronLeft color={Colors.gray800} size={26} strokeWidth={2.5} />
                                </TouchableOpacity>
                            )}
                            <View style={styles.headerTextContainer}>
                                <Text style={styles.headerTitle}>{title}</Text>
                                {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
                            </View>
                        </View>

                        <View style={styles.headerButtons}>
                            {isTest && (
                                <View style={styles.debugToggleWrapper}>
                                    <TouchableOpacity
                                        onPress={handleDebugToggle}
                                        style={[
                                            styles.iconBackground,
                                            state.debugMode && styles.debugActiveBackground,
                                        ]}
                                    >
                                        <Bug
                                            color={state.debugMode ? Colors.white : '#9CA3AF'}
                                            size={20}
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
                                    icon={<ShoppingCart color={Colors.secondary} size={22} strokeWidth={2} />}
                                    badge={cartItemCount}
                                />
                            )}
                            {shouldShowNotifications && (
                                <ActionButton
                                    onPress={handleNotificationsPress}
                                    icon={<Bell color={Colors.secondary} size={22} strokeWidth={2} />}
                                    badge={unreadCount}
                                />
                            )}
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    headerWrapper: {
        zIndex: 100,
    },
    solidBackground: {
        backgroundColor: Colors.white,
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 8,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 56 : 20,
        paddingBottom: 24,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerLeft: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: Colors.white,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    headerTextContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: Colors.textPrimary,
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 14,
        color: Colors.textSecondary,
        marginTop: 2,
        fontWeight: '500',
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    actionButton: {
        position: 'relative',
    },
    iconBackground: {
        width: 38,
        height: 38,
        borderRadius: 14,
        backgroundColor: Colors.primarySurface,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
    },
    badge: {
        position: 'absolute',
        top: -6,
        right: -6,
        backgroundColor: Colors.error,
        borderRadius: 11,
        minWidth: 22,
        height: 22,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
        borderWidth: 2.5,
        borderColor: Colors.white,
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    badgeText: {
        color: Colors.white,
        fontSize: 11,
        fontWeight: '800',
    },
    debugToggleWrapper: {
        alignItems: 'center',
    },
    debugActiveBackground: {
        backgroundColor: Colors.error,
    },
    timeOffsetBadge: {
        position: 'absolute',
        top: 40,
        backgroundColor: Colors.error,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        minWidth: 80,
        alignItems: 'center',
    },
    timeOffsetText: {
        color: Colors.white,
        fontSize: 9,
        fontWeight: '700',
    },
});

export default SharedHeader;