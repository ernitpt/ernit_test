import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FooterNavigation from '../components/FooterNavigation';
import SideMenu from '../components/SideMenu';
import LoginPrompt from '../components/LoginPrompt';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useApp } from '../context/AppContext';
import Colors from '../config/colors';

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
  const [sideMenuVisible, setSideMenuVisible] = useState(false);
  const { showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const { state } = useApp();
  useNetworkStatus();

  const handleMenuPress = () => setSideMenuVisible(true);
  const handleCloseSideMenu = () => setSideMenuVisible(false);

  return (
    <ErrorBoundary screenName="MainScreen" userId={state.user?.id}>
      <SafeAreaView edges={['bottom']} style={styles.container}>
        {/* Main Content */}
        <View style={styles.content}>{children}</View>

        {/* Login Prompt Popup - shown when protected route is accessed without auth */}
        <LoginPrompt
          visible={showLoginPrompt}
          onClose={closeLoginPrompt}
          message={loginMessage}
        />

        {/* Footer Navigation with guarded navigation */}
        <FooterNavigation
          activeRoute={activeRoute}
          onMenuPress={handleMenuPress}
        />

        {/* Side Menu */}
        <SideMenu visible={sideMenuVisible} onClose={handleCloseSideMenu} />
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  content: {
    flex: 1,
  },
});

export default MainScreen;
