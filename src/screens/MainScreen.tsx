import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FooterNavigation from '../components/FooterNavigation';
import SideMenu from '../components/SideMenu';
import LoginPrompt from '../components/LoginPrompt';
import { useAuthGuard } from '../hooks/useAuthGuard';

type MainScreenProps = {
  children: React.ReactNode;
  activeRoute: 'Home' | 'Goals' | 'Profile' | 'Notification' | 'Settings';
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

  const handleMenuPress = () => setSideMenuVisible(true);
  const handleCloseSideMenu = () => setSideMenuVisible(false);

  return (
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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    flex: 1,
  },
});

export default MainScreen;
