import React from 'react';
import { AppProvider } from './src/context/AppContext';
import { AuthGuardProvider } from './src/context/AuthGuardContext';
import AppNavigator from './src/navigation/AppNavigator';
import { Ionicons } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { useEffect } from 'react';
import { Platform } from 'react-native';

export default function App() {
  console.log('[App] Component mounting...');

  useEffect(() => {
    console.log('[App] useEffect running...');
    // Load Ionicons font on web
    Font.loadAsync(Ionicons.font);

    // Set document title to "Ernit" on web and keep it constant
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // Set initial title
      document.title = 'Ernit';

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
    <AppProvider>
      <AppNavigator />
    </AppProvider>
  );
}


