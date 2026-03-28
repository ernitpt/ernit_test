import React, { useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

import type { RootStackParamList } from '../types';
import { Colors, useColors } from '../config';
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

import { useAuthGuard } from '../context/AuthGuardContext';
import { MotiView, MotiText } from 'moti';

export const FOOTER_HEIGHT = 72;

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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const scaleAnim = useRef(new Animated.Value(1)).current;

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
          <MotiView
            animate={{
              opacity: isActive ? 0.3 : 0,
              scale: isActive ? 1 : 0.4,
            }}
            transition={{
              type: 'timing',
              duration: isActive ? 400 : 250,
            }}
            style={[
              styles.iconGlow,
              { backgroundColor: colors.secondary },
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

        <MotiText
          animate={{
            color: isActive ? colors.primary : colors.textMuted,
          }}
          transition={{
            type: 'timing',
            duration: 250,
          }}
          style={[
            styles.navLabel,
            { fontWeight: isActive ? '700' : '600' },
          ]}
        >
          {label}
        </MotiText>
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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

  const footerHeight = FOOTER_HEIGHT;
  const safeAreaSpacer = Math.max(insets.bottom, Spacing.sm);

  return (
    <View style={styles.outerWrapper}>
      <View style={[styles.container, { height: footerHeight }]}>
        <BlurView intensity={8} tint="default" style={StyleSheet.absoluteFill} />
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
        <View style={{ height: safeAreaSpacer, backgroundColor: colors.surface }} />
      )}
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    outerWrapper: {
      backgroundColor: 'transparent',
    },

    container: {
      backgroundColor: colors.surfaceFrosted,
      overflow: 'hidden',
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      // No container shadow — web reference has none; glow comes from active icons only
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
      ...Platform.select({
        web: {
          width: 36,
          height: 36,
          borderRadius: 18,
          filter: 'blur(6px)',
        },
        android: {
          // Match web dimensions; no blur available but opacity + size match web
          width: 36,
          height: 36,
          borderRadius: 18,
        },
        default: {
          width: 36,
          height: 36,
          borderRadius: 18,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 10,
          shadowOpacity: 0.6,
        },
      }),
    } as any,

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
      backgroundColor: colors.error,
      paddingHorizontal: Spacing.xs,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.white,
    },

    badgeText: {
      color: colors.white,
      ...Typography.micro,
    },
  });

export default React.memo(FooterNavigation);
