import React from 'react';
import { AppProvider } from './src/context/AppContext';
import { AuthGuardProvider } from './src/context/AuthGuardContext';
import { TimerProvider } from './src/context/TimerContext';
import AppNavigator from './src/navigation/AppNavigator';
import { Ionicons } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { PWAInstaller } from './src/components/PWAInstaller';
import { pushNotificationService } from './src/services/PushNotificationService';

export default function App() {
  console.log('[App] Component mounting...');

  useEffect(() => {
    console.log('[App] useEffect running...');

    // Setup local notification handler
    pushNotificationService.setupNotificationHandler();

    // Load Ionicons font on web
    Font.loadAsync(Ionicons.font);

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
      themeColorMeta.content = '#8B5CF6';
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

      // Also use a fallback interval to ensure title stays "Ernit"
      const titleInterval = setInterval(() => {
        if (document.title !== 'Ernit') {
          document.title = 'Ernit';
        }
      }, 100);

      return () => {
        titleObserver.disconnect();
        clearInterval(titleInterval);
      };
    }
  }, []);

  console.log('[App] Rendering AppProvider and AppNavigator');

  return (
    <>
      <AppProvider>
        <AuthGuardProvider>
          <TimerProvider>
            <AppNavigator />
          </TimerProvider>
        </AuthGuardProvider>
      </AppProvider>
      <PWAInstaller />
    </>
  );
}
