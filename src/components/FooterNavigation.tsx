import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../types';

import HomeIcon from '../assets/icons/home.svg';
import HomeIconActive from '../assets/icons/HomeActive';
import BellIcon from '../assets/icons/notifications.svg';
import BellIconActive from '../assets/icons/NotificationsActive';
import GoalsIcon from '../assets/icons/goals.svg';
import GoalsIconActive from '../assets/icons/GoalsActive';
import ProfileIcon from '../assets/icons/profile.svg';
import ProfileIconActive from '../assets/icons/ProfileActive';
import MenuIcon from '../assets/icons/sidemenu.svg';

import { notificationService } from '../services/NotificationService';
import { useApp } from '../context/AppContext';
import { useAuthGuard } from '../hooks/useAuthGuard';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type FooterNavigationProps = {
  activeRoute: 'Home' | 'Goals' | 'Profile' | 'Notification' | 'Settings';
  onMenuPress: () => void;
};

const FooterNavigation: React.FC<FooterNavigationProps> = ({
  activeRoute,
  onMenuPress,
}) => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const {
    state: { user },
  } = useApp();
  const { requireAuth } = useAuthGuard();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      setUnreadCount(0);
      return;
    }
    const unsubscribe = notificationService.listenToUserNotifications(
      user.id,
      (notifications) => {
        const unread = notifications.filter((n) => !n.read).length;
        setUnreadCount(unread);
      }
    );
    return unsubscribe;
  }, [user?.id]);

  const handleNavigation = (route: string) => {
    // Home is always accessible
    if (route === 'Home') {
      navigation.navigate('CategorySelection');
      return;
    }
    
    // Protected routes - check authentication BEFORE navigating
    if (route === 'Goals' || route === 'Notification' || route === 'Profile') {
      // Require authentication - this will show popup if not authenticated
      // and return false to block navigation. Pass route name for post-auth navigation.
      if (!requireAuth('Please log in to access this feature.', route as keyof RootStackParamList)) {
        return; // Don't navigate - popup is shown
      }
      
      // User is authenticated - navigate normally
      if (route === 'Goals') navigation.navigate('Goals');
      if (route === 'Notification') navigation.navigate('Notification');
      if (route === 'Profile') navigation.navigate('Profile');
    }
  };

  const NavButton: React.FC<{
    icon: React.FC<any>;
    activeIcon: React.FC<any>;
    label: string;
    isActive: boolean;
    onPress: () => void;
    badgeCount?: number;
  }> = ({ icon: Icon, activeIcon: IconActive, label, isActive, onPress, badgeCount }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const colorAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;
    const rotateAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.spring(colorAnim, {
        toValue: isActive ? 1 : 0,
        useNativeDriver: false,
        friction: 5,
      }).start();
    }, [isActive]);

    const handlePress = () => {
      onPress();

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
          tension: 40,
        }),
      ]).start();

      rotateAnim.setValue(0);
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    };

    const labelColor = colorAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['rgba(156,163,175,1)', 'rgba(139,92,246,1)'],
    });

    const backgroundColor = colorAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['rgba(139,92,246,0)', 'rgba(139,92,246,0.10)'],
    });

    const iconRotate = rotateAnim.interpolate({
      inputRange: [0, 0.25, 0.75, 1],
      outputRange: ['0deg', '-15deg', '15deg', '0deg'],
    });

    const SelectedIcon = isActive ? IconActive : Icon;

    return (
      <TouchableOpacity
        onPress={handlePress}
        style={styles.navButton}
        activeOpacity={0.9}
      >
        <Animated.View
          style={[
            styles.navButtonContent,
            {
              backgroundColor,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.iconWrapper}>
            <Animated.View style={{ transform: [{ rotate: iconRotate }] }}>
              <SelectedIcon width={26} height={26} />
            </Animated.View>
          </View>

          {badgeCount !== undefined && badgeCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {badgeCount > 9 ? '9+' : badgeCount}
              </Text>
            </View>
          )}

          <Animated.Text style={[styles.navLabel, { color: labelColor }]}>
            {label}
          </Animated.Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const footerHeight = 70;
  const safeAreaSpacer = Platform.OS === 'ios' ? insets.bottom : 0;

  return (
    <View style={{ backgroundColor: '#fff' }}>
      <View
        style={[
          styles.container,
          { height: footerHeight },
          Platform.OS === 'android' && styles.androidContainer,
        ]}
      >
        <View style={styles.navContainer}>
          <NavButton
            icon={HomeIcon}
            activeIcon={HomeIconActive}
            label="Home"
            isActive={activeRoute === 'Home'}
            onPress={() => handleNavigation('Home')}
          />

          <NavButton
            icon={BellIcon}
            activeIcon={BellIconActive}
            label="Alerts"
            isActive={activeRoute === 'Notification'}
            onPress={() => handleNavigation('Notification')}
            badgeCount={unreadCount}
          />

          <NavButton
            icon={GoalsIcon}
            activeIcon={GoalsIconActive}
            label="Goals"
            isActive={activeRoute === 'Goals'}
            onPress={() => handleNavigation('Goals')}
          />

          <NavButton
            icon={ProfileIcon}
            activeIcon={ProfileIconActive}
            label="Profile"
            isActive={activeRoute === 'Profile'}
            onPress={() => handleNavigation('Profile')}
          />

          <NavButton
            icon={MenuIcon}
            activeIcon={MenuIcon}
            label="Menu"
            isActive={false}
            onPress={onMenuPress}
          />
        </View>
      </View>

      {safeAreaSpacer > 0 && (
        <View style={{ height: safeAreaSpacer, backgroundColor: '#fff' }} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 8,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  androidContainer: {
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
  },
  navContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    flex: 1,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 16,
    minWidth: 64,
    position: 'relative',
    overflow: 'visible',
  },
  iconWrapper: {
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
});

export default FooterNavigation;