import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Bell, ShoppingCart } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { notificationService } from '../services/NotificationService';
import type { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface SharedHeaderProps {
    title: string;
    subtitle?: string;
    variant?: 'default' | 'gradient' | 'simple';
    showBack?: boolean;
    showNotifications?: boolean;
    showCart?: boolean;
    rightActions?: React.ReactNode;
    onBackPress?: () => void;
}

const SharedHeader: React.FC<SharedHeaderProps> = ({
    title,
    subtitle,
    variant = 'gradient',
    showBack,
    showNotifications,
    showCart,
    rightActions,
    onBackPress,
}) => {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute();
    const { state } = useApp();
    const [unreadCount, setUnreadCount] = useState(0);

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

    const handleBackPress = () => {
        if (onBackPress) {
            onBackPress();
        } else if (navigation.canGoBack()) {
            navigation.goBack();
        } else {
            // Fallback: navigate to Goals if there's no history (e.g., after page refresh)
            navigation.navigate('Goals' as any);
        }
    };

    const handleNotificationsPress = () => {
        navigation.navigate('Notification');
    };

    const handleCartPress = () => {
        navigation.navigate('Cart' as any);
    };

    const headerColors = ['#462088ff', '#235c9eff'] as const;

    const ActionButton: React.FC<{
        onPress: () => void;
        icon: React.ReactNode;
        badge?: number;
    }> = ({ onPress, icon, badge }) => {
        const scaleAnim = new Animated.Value(1);

        const handlePress = () => {
            Animated.sequence([
                Animated.spring(scaleAnim, {
                    toValue: 0.9,
                    useNativeDriver: true,
                    speed: 20,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    friction: 3,
                }),
            ]).start();
            onPress();
        };

        return (
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <TouchableOpacity onPress={handlePress} style={styles.actionButton}>
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

    return (
        <LinearGradient colors={headerColors} style={styles.gradientHeader}>
            <View style={[styles.header, showBack && styles.headerWithBack]}>
                <View style={styles.headerTop}>
                    <View style={styles.headerLeft}>
                        {showBack && (
                            <TouchableOpacity onPress={handleBackPress} style={styles.backButtonGradient}>
                                <ChevronLeft color="#ffffff" size={24} />
                            </TouchableOpacity>
                        )}
                        <View style={styles.headerTextContainer}>
                            <Text style={styles.headerTitle}>{title}</Text>
                            {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
                        </View>
                    </View>

                    <View style={styles.headerButtons}>
                        {rightActions}
                        {shouldShowCart && (
                            <ActionButton
                                onPress={handleCartPress}
                                icon={<ShoppingCart color="#fff" size={22} />}
                                badge={cartItemCount}
                            />
                        )}
                        {shouldShowNotifications && (
                            <ActionButton
                                onPress={handleNotificationsPress}
                                icon={<Bell color="#fff" size={22} />}
                                badge={unreadCount}
                            />
                        )}
                    </View>
                </View>
            </View>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    gradientHeader: {
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        overflow: 'hidden',
        paddingBottom: 18,
        paddingTop: 28,
    },
    header: {
        paddingHorizontal: 24,
        paddingBottom: 10,
    },
    headerWithBack: {
        paddingHorizontal: 16,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    headerLeft: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 12,
    },
    backButtonGradient: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerTextContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 26,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 15,
        color: '#e0e7ff',
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#ef4444',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderWidth: 2,
        borderColor: '#fff',
    },
    badgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    rightActions: {
        flexDirection: 'row',
        gap: 8,
    },
    // Simple variant styles
    simpleHeader: {
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        paddingTop: 16,
        paddingBottom: 12,
    },
    simpleHeaderContent: {
        paddingHorizontal: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    simpleTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
        flex: 1,
    },
});

export default SharedHeader;