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
import NativeStripeProvider from './src/components/NativeStripeProvider';

import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';

// PWA: Register service worker and inject manifest at module load time (before React renders).
// This runs as early as possible so Chrome can detect installability before beforeinstallprompt fires.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  // Service worker registration
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/firebase-messaging-sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }

  // Manifest link
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest.json';
    document.head.appendChild(link);
  }

  // Theme color
  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#8B5CF6';
    document.head.appendChild(meta);
  }

  // Apple PWA meta
  if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
    const meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-capable';
    meta.content = 'yes';
    document.head.appendChild(meta);
  }

  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const link = document.createElement('link');
    link.rel = 'apple-touch-icon';
    link.href = '/icon_192.png';
    document.head.appendChild(link);
  }
}

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
      document.title = 'Ernit';

      // Initialize Google Analytics 4 (web only)
      initializeAnalytics();

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
      <NativeStripeProvider>
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
      </NativeStripeProvider>
    </SafeAreaProvider>
    </ThemeProvider>
  );
}
