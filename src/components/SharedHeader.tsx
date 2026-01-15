import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Platform,
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
            navigation.navigate('Goals' as any);
        }
    };

    const handleNotificationsPress = () => {
        navigation.navigate('Notification');
    };

    const handleCartPress = () => {
        navigation.navigate('Cart' as any);
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
                <TouchableOpacity onPress={handlePress} style={styles.actionButton}>
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
            <LinearGradient
                colors={['#5f23beff', '#7c3aed', '#8b5cf6', '#e5e7eb']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.gradientBackground}
            >
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <View style={styles.headerLeft}>
                            {showBack && (
                                <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
                                    <ChevronLeft color="#ffffff" size={26} strokeWidth={2.5} />
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
                                    icon={<ShoppingCart color="#ffffff" size={22} strokeWidth={2} />}
                                    badge={cartItemCount}
                                />
                            )}
                            {shouldShowNotifications && (
                                <ActionButton
                                    onPress={handleNotificationsPress}
                                    icon={<Bell color="#ffffff" size={22} strokeWidth={2} />}
                                    badge={unreadCount}
                                />
                            )}
                        </View>
                    </View>
                </View>
            </LinearGradient>
        </View>
    );
};

const styles = StyleSheet.create({
    headerWrapper: {
        zIndex: 100,
    },
    gradientBackground: {
        shadowColor: '#7c3aed',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
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
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerTextContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 26,
        fontWeight: '800',
        color: '#ffffff',
        letterSpacing: -0.5,
        textShadowColor: 'rgba(0, 0, 0, 0.1)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    headerSubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.9)',
        marginTop: 2,
        fontWeight: '500',
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    actionButton: {
        position: 'relative',
    },
    iconBackground: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    badge: {
        position: 'absolute',
        top: -6,
        right: -6,
        backgroundColor: '#ef4444',
        borderRadius: 11,
        minWidth: 22,
        height: 22,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
        borderWidth: 2.5,
        borderColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    badgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '800',
    },
});

export default SharedHeader;