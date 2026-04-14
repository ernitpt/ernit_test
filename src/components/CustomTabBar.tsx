import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import type { NavigationProp } from '@react-navigation/native';
import { Colors, useColors } from '../config';
import { Spacing } from '../config/spacing';
import { BorderRadius } from '../config/borderRadius';
import { Typography } from '../config/typography';
import { useAuthGuard } from '../context/AuthGuardContext';
import { useNotificationBadge } from '../context/NotificationBadgeContext';
import type { MainTabsParamList } from '../types';

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

export const FOOTER_HEIGHT = 72;

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
  const { t } = useTranslation();
  const glowAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: isActive ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isActive, glowAnim]);

  const handlePress = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  const SelectedIcon = isActive ? IconActive : Icon;

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={styles.navButton}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={`${label} tab`}
    >
      <View style={styles.navButtonContent}>
        <View style={styles.iconWrapper}>
          {Platform.OS !== 'android' ? (
            <Animated.View
              style={[
                styles.iconGlow,
                {
                  backgroundColor: colors.secondary,
                  opacity: Animated.multiply(glowAnim, 0.3),
                  transform: [{
                    scale: glowAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 1],
                    }),
                  }],
                },
              ]}
            />
          ) : (
            <Animated.View
              style={[
                styles.androidIndicator,
                {
                  backgroundColor: colors.primary,
                  opacity: glowAnim,
                  transform: [{
                    scaleX: glowAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 1],
                    }),
                  }],
                },
              ]}
            />
          )}
          <SelectedIcon width={28} height={28} />
        </View>

        {badgeCount !== undefined && badgeCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {badgeCount > 9 ? t('nav.badgeOverflow') : badgeCount}
            </Text>
          </View>
        )}

        <Text
          style={[
            styles.navLabel,
            {
              color: isActive ? colors.primary : colors.textMuted,
              fontWeight: isActive ? '700' : '600',
            },
          ]}
        >
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ─── Tab Name → UI Config ───────────────────────────────────────────────────

const TAB_CONFIG = [
  { tabName: 'HomeTab', label: 'Home', icon: HomeIcon, activeIcon: HomeIconActive, protected: false },
  { tabName: 'FeedTab', label: 'Feed', icon: FeedIcon, activeIcon: FeedIconActive, protected: true },
  { tabName: 'GoalsTab', label: 'Goals', icon: GoalsIcon, activeIcon: GoalsIconActive, protected: true },
  { tabName: 'ProfileTab', label: 'Profile', icon: ProfileIcon, activeIcon: ProfileIconActive, protected: true },
] as const;

// ─── Custom Tab Bar (standalone, no BottomTabBarProps dependency) ────────────

interface CustomTabBarProps {
  onMenuPress: () => void;
  tabNavigation: NavigationProp<MainTabsParamList>;
  activeTabIndex: number;
}

const TAB_NAMES = ['HomeTab', 'FeedTab', 'GoalsTab', 'ProfileTab'] as const;

const CustomTabBar: React.FC<CustomTabBarProps> = ({ onMenuPress, tabNavigation, activeTabIndex }) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { requireAuth } = useAuthGuard();
  const { unreadCount } = useNotificationBadge();
  const { t } = useTranslation();

  const tabLabels: Record<string, string> = {
    HomeTab: t('nav.home'),
    FeedTab: t('nav.feed'),
    GoalsTab: t('nav.goals'),
    ProfileTab: t('nav.profile'),
  };

  const activeTabName = TAB_NAMES[activeTabIndex] ?? 'GoalsTab';

  const popToTabRoot = useCallback((tabName: string) => {
    // When tab is already active, navigating to its root screen pops
    // the inner stack back to that root (React Navigation v7 behavior:
    // if the target screen is already in the stack, navigate pops to it).
    switch (tabName) {
      case 'HomeTab':
        tabNavigation.navigate('HomeTab', { screen: 'CategorySelection' });
        break;
      case 'FeedTab':
        tabNavigation.navigate('FeedTab', { screen: 'Feed' });
        break;
      case 'GoalsTab':
        tabNavigation.navigate('GoalsTab', { screen: 'Goals' });
        break;
      case 'ProfileTab':
        tabNavigation.navigate('ProfileTab', { screen: 'Profile' });
        break;
    }
  }, [tabNavigation]);

  const handleTabPress = useCallback((tabName: string, isProtected: boolean) => {
    if (isProtected && !requireAuth(t('loginPrompt.accessFeature'))) {
      return;
    }
    // Always pop to root — tapping a tab in the footer should never leave
    // the user stuck on a deep screen. This resets the tab's inner stack.
    popToTabRoot(tabName);
  }, [requireAuth, t, popToTabRoot]);

  const pressHandlers = useMemo(() =>
    TAB_CONFIG.map(tab => () => handleTabPress(tab.tabName, tab.protected)),
    [handleTabPress]
  );

  const footerHeight = FOOTER_HEIGHT;
  const safeAreaSpacer = insets.bottom;

  return (
    <View style={styles.outerWrapper}>
      <View style={[styles.container, { height: footerHeight }]}>
        {Platform.OS !== 'android' && (
          <BlurView intensity={8} tint="default" style={StyleSheet.absoluteFill} />
        )}
        <View style={styles.navContainer}>
          {TAB_CONFIG.map((tab, i) => (
            <NavButton
              key={tab.tabName}
              icon={tab.icon}
              activeIcon={tab.activeIcon}
              label={tabLabels[tab.tabName] || tab.label}
              isActive={activeTabName === tab.tabName}
              onPress={pressHandlers[i]}
              badgeCount={tab.tabName === 'FeedTab' ? unreadCount : undefined}
            />
          ))}
          <NavButton
            icon={MenuIcon}
            activeIcon={MenuIcon}
            label={t('nav.menu')}
            isActive={false}
            onPress={onMenuPress}
          />
        </View>
      </View>

      {safeAreaSpacer > 0 && (
        <View style={{ height: safeAreaSpacer, backgroundColor: colors.surfaceFrosted }} />
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

    androidIndicator: {
      position: 'absolute',
      bottom: -2,
      width: 20,
      height: 3,
      borderRadius: 2,
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

export default React.memo(CustomTabBar);
