import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FooterNavigation, { FOOTER_HEIGHT } from '../components/FooterNavigation';
import SideMenu from '../components/SideMenu';
import LoginPrompt from '../components/LoginPrompt';
import { useAuthGuard } from '../context/AuthGuardContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useApp } from '../context/AppContext';
import { notificationService } from '../services/NotificationService';
import { Colors, useColors } from '../config';
import { Typography } from '../config/typography';
import { Spacing } from '../config/spacing';

type MainScreenProps = {
  children: React.ReactNode;
  activeRoute: 'Home' | 'Goals' | 'Profile' | 'Feed' | 'Settings';
};

/**
 * Enhanced MainScreen wrapper
 * - Universal guarded navigation for footer
 * - Shows login popup overlay when protected routes are accessed
 * - Compatible with your existing FooterNavigation and SideMenu
 */
const MainScreen: React.FC<MainScreenProps> = ({ children, activeRoute }) => {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [sideMenuVisible, setSideMenuVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const { state } = useApp();
  const { isConnected } = useNetworkStatus();

  useEffect(() => {
    if (!state.user?.id) {
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
  }, [state.user?.id]);

  const handleMenuPress = () => setSideMenuVisible(true);
  const handleCloseSideMenu = () => setSideMenuVisible(false);

  return (
    <ErrorBoundary screenName="MainScreen" userId={state.user?.id}>
      <SafeAreaView edges={['top']} style={styles.container}>
        {/* Offline Banner */}
        {!isConnected && (
          <View style={{ backgroundColor: colors.error, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md, alignItems: 'center' }}>
            <Text style={{ ...Typography.caption, color: colors.white }}>You're offline — some features may not work</Text>
          </View>
        )}

        {/* Main Content */}
        <View style={styles.content}>{children}</View>

        {/* Login Prompt Popup - shown when protected route is accessed without auth */}
        <LoginPrompt
          visible={showLoginPrompt}
          onClose={closeLoginPrompt}
          message={loginMessage}
        />

        {/* Footer Navigation — absolutely positioned to overlap content */}
        <View style={styles.footerWrapper}>
          <FooterNavigation
            activeRoute={activeRoute}
            onMenuPress={handleMenuPress}
            notificationBadgeCount={unreadCount}
          />
        </View>

        {/* Side Menu */}
        <SideMenu visible={sideMenuVisible} onClose={handleCloseSideMenu} />
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const createStyles = (colors: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flex: 1,
  },
  footerWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});

export default MainScreen;
