import React, { useEffect } from 'react';
import { AppProvider } from './src/context/AppContext';
import { TimerProvider } from './src/context/TimerContext';
import AppNavigator from './src/navigation/AppNavigator';
import { ActivityIndicator, Platform, View } from 'react-native';
import Colors from './src/config/colors';
import { PWAInstaller } from './src/components/PWAInstaller';
import { pushNotificationService } from './src/services/PushNotificationService';
import { initializeAnalytics } from './src/utils/analytics';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ToastProvider } from './src/context/ToastContext';
import { ThemeProvider } from './src/themes/ThemeContext';
import ToastOverlay from './src/components/Toast';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { logger } from './src/utils/logger';

import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';

export default function App() {
  logger.log('[App] Component mounting...');

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  useEffect(() => {
    logger.log('[App] useEffect running...');

    // Setup local notification handler
    try {
      pushNotificationService.setupNotificationHandler();
    } catch (e) {
      console.warn('Failed to setup notification handler:', e);
    }

    // Set document title to "Ernit" on web and keep it constant
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // Set initial title
      document.title = 'Ernit';

      // Add manifest link to head
      const manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.href = '/manifest.json';
      document.head.appendChild(manifestLink);

      // Add theme color meta tag
      const themeColorMeta = document.createElement('meta');
      themeColorMeta.name = 'theme-color';
      themeColorMeta.content = Colors.primary;
      document.head.appendChild(themeColorMeta);

      // Add apple mobile web app capable
      const appleMeta = document.createElement('meta');
      appleMeta.name = 'apple-mobile-web-app-capable';
      appleMeta.content = 'yes';
      document.head.appendChild(appleMeta);

      // Use MutationObserver to watch for title changes and reset to "Ernit"
      const titleObserver = new MutationObserver(() => {
        if (document.title !== 'Ernit') {
          document.title = 'Ernit';
        }
      });

      // Observe changes to the document title
      const titleElement = document.querySelector('title');
      if (titleElement) {
        titleObserver.observe(titleElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }

      // Initialize Google Analytics 4 (web only)
      initializeAnalytics();

      return () => {
        titleObserver.disconnect();
      };
    }
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.secondary} />
      </View>
    );
  }

  logger.log('[App] Rendering AppProvider and AppNavigator');

  return (
    <ThemeProvider>
    <SafeAreaProvider>
      <ErrorBoundary screenName="App">
        <AppProvider>
          <ToastProvider>
            <TimerProvider>
              <AppNavigator />
              <PWAInstaller />
            </TimerProvider>
            <ToastOverlay />
          </ToastProvider>
        </AppProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
    </ThemeProvider>
  );
}
