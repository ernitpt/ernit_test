import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../types';
import Colors from '../config/colors';
import { Spacing } from '../config/spacing';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { useRootNavigation } from '../types/navigation';

import HomeIcon from '../assets/icons/home.svg';
import HomeIconActive from '../assets/icons/HomeActive';
import FeedIcon from '../assets/icons/feed.svg';
import FeedIconActive from '../assets/icons/feedActive';
import GoalsIcon from '../assets/icons/goals.svg';
import GoalsIconActive from '../assets/icons/GoalsActive';
import ProfileIcon from '../assets/icons/profile.svg';
import ProfileIconActive from '../assets/icons/ProfileActive';
import MenuIcon from '../assets/icons/sidemenu.svg';

import type { SvgProps } from 'react-native-svg';

import { useAuthGuard } from '../hooks/useAuthGuard';

type FooterNavigationProps = {
  activeRoute: 'Home' | 'Goals' | 'Profile' | 'Feed' | 'Settings';
  onMenuPress: () => void;
  notificationBadgeCount?: number;
};

// ─── Nav Button ─────────────────────────────────────────────────────────────

const NavButton = React.memo<{
  icon: React.FC<SvgProps>;
  activeIcon: React.FC<SvgProps>;
  label: string;
  isActive: boolean;
  onPress: () => void;
  badgeCount?: number;
}>(({ icon: Icon, activeIcon: IconActive, label, isActive, onPress, badgeCount }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  // Always start glow at 0 so the entrance animation plays on every mount
  const glowAnim = useRef(new Animated.Value(0)).current;
  const labelColorAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(glowAnim, {
        toValue: isActive ? 1 : 0,
        duration: isActive ? 400 : 250,
        useNativeDriver: false,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(labelColorAnim, {
        toValue: isActive ? 1 : 0,
        useNativeDriver: false,
        friction: 6,
        tension: 80,
      }),
    ]).start();
  }, [isActive]);

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
  };

  const labelColor = labelColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.textMuted, Colors.primary],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.3],
  });

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  const SelectedIcon = isActive ? IconActive : Icon;

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={styles.navButton}
      activeOpacity={0.8}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={`${label} tab`}
    >
      <Animated.View
        style={[
          styles.navButtonContent,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View style={styles.iconWrapper}>
          {/* Soft circular glow behind icon */}
          <Animated.View
            style={[
              styles.iconGlow,
              {
                opacity: glowOpacity,
                transform: [{ scale: glowScale }],
                backgroundColor: Colors.secondary,
              },
            ]}
          />
          <SelectedIcon width={28} height={28} />
        </View>

        {badgeCount !== undefined && badgeCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {badgeCount > 9 ? '9+' : badgeCount}
            </Text>
          </View>
        )}

        <Animated.Text
          style={[
            styles.navLabel,
            { color: labelColor, fontWeight: isActive ? '700' : '600' },
          ]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
});

// ─── Footer Navigation ──────────────────────────────────────────────────────

const FooterNavigation: React.FC<FooterNavigationProps> = ({
  activeRoute,
  onMenuPress,
  notificationBadgeCount,
}) => {
  const navigation = useRootNavigation();
  const insets = useSafeAreaInsets();
  const { requireAuth } = useAuthGuard();

  const handleNavigation = (route: string) => {
    if (route === 'Home') {
      navigation.navigate('CategorySelection');
      return;
    }

    if (route === 'Goals' || route === 'Feed' || route === 'Profile') {
      if (!requireAuth('Please log in to access this feature.', route as keyof RootStackParamList)) {
        return;
      }

      if (route === 'Goals') navigation.navigate('Goals');
      if (route === 'Feed') navigation.navigate('Feed');
      if (route === 'Profile') navigation.navigate('Profile');
    }
  };

  const footerHeight = 72;
  const safeAreaSpacer = Platform.OS === 'ios' ? insets.bottom : 0;

  return (
    <View style={styles.outerWrapper}>
      <View
        style={[
          styles.container,
          { height: footerHeight },
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
            icon={FeedIcon}
            activeIcon={FeedIconActive}
            label="Feed"
            isActive={activeRoute === 'Feed'}
            onPress={() => handleNavigation('Feed')}
            badgeCount={notificationBadgeCount}
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
        <View style={{ height: safeAreaSpacer, backgroundColor: Colors.white }} />
      )}
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  outerWrapper: {
    backgroundColor: Colors.white,
  },

  container: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
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
    paddingVertical: Spacing.xs,
  },

  iconWrapper: {
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
  },

  iconGlow: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    ...(Platform.OS === 'web'
      ? { filter: 'blur(6px)' }
      : {}),
  },

  navLabel: {
    ...Typography.tiny,
    marginTop: Spacing.xxs,
    letterSpacing: 0.1,
  },

  badge: {
    position: 'absolute',
    top: 2,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: BorderRadius.circle,
    backgroundColor: Colors.error,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },

  badgeText: {
    color: Colors.white,
    ...Typography.micro,
  },
});

export default FooterNavigation;
