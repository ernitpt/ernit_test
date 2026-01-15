import React, { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import { useApp } from './AppContext';
import { NavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { Platform } from 'react-native';
import { pushNotificationService } from '../services/PushNotificationService';
import { logger } from '../utils/logger';
type PendingNavigation = {
  routeName: keyof RootStackParamList;
  params?: any;
};

interface AuthGuardContextType {
  isAuthenticated: boolean;
  requireAuth: (message?: string, routeName?: keyof RootStackParamList, params?: any) => boolean;
  showLoginPrompt: boolean;
  loginMessage: string;
  closeLoginPrompt: () => void;
  clearAuthBlock: () => void;
  handleAuthSuccess: () => void;
}

const AuthGuardContext = createContext<AuthGuardContextType | null>(null);

// Navigation ref that will be set by AppNavigator
let navigationRef: NavigationContainerRef<RootStackParamList> | null = null;

export const setNavigationRef = (ref: NavigationContainerRef<RootStackParamList> | null) => {
  navigationRef = ref;
};

export const AuthGuardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { state } = useApp();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginMessage, setLoginMessage] = useState('Please log in to continue.');
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);

  // Prevent double-trigger spam
  const isBlockingRef = useRef(false);
  const wasAuthenticatedRef = useRef(!!state.user);

  const isAuthenticated = !!state.user;

  // Initialize push notifications when user becomes authenticated
  useEffect(() => {
    const wasAuthenticated = wasAuthenticatedRef.current;
    const isNowAuthenticated = isAuthenticated;

    // User just logged in
    if (!wasAuthenticated && isNowAuthenticated && state.user && Platform.OS === 'web') {
      logger.log('🔔 User authenticated, setting up push notifications...');

      // Setup push notifications asynchronously
      pushNotificationService.setupPushNotifications(state.user.id)
        .then((success) => {
          if (success) {
            logger.log('🔔 Push notifications setup completed');
          } else {
            logger.log('🔔 Push notifications setup skipped (may need PWA install first)');
          }
        })
        .catch((error) => {
          logger.error('🔔 Error setting up push notifications:', error);
        });

      // Setup foreground message listener
      const unsubscribe = pushNotificationService.listenForMessages((payload) => {
        logger.log('🔔 Received foreground notification:', payload);
        // The notification is already shown by the service
        // You can add additional handling here if needed
      });

      // Cleanup listener when user logs out
      return () => {
        unsubscribe();
      };
    }

    wasAuthenticatedRef.current = isNowAuthenticated;
  }, [isAuthenticated, state.user]);

  // Periodic token health check - re-register if token is missing
  useEffect(() => {
    if (!isAuthenticated || !state.user || Platform.OS !== 'web') {
      return;
    }

    // Check token health every 5 minutes
    const healthCheckInterval = setInterval(async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('../services/firebase');

        const userRef = doc(db, 'users', state.user!.id);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const fcmTokens = userData?.fcmTokens || [];

          // If user has no tokens, re-register
          if (fcmTokens.length === 0) {
            logger.warn('🔔 FCM token missing from Firestore, re-registering...');
            await pushNotificationService.setupPushNotifications(state.user!.id);
          }
        }
      } catch (error) {
        logger.error('🔔 Token health check failed:', error);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    // Also do an initial check after 10 seconds (give app time to fully load)
    const initialCheckTimeout = setTimeout(async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('../services/firebase');

        const userRef = doc(db, 'users', state.user!.id);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const fcmTokens = userData?.fcmTokens || [];

          if (fcmTokens.length === 0) {
            logger.warn('🔔 FCM token missing on startup, re-registering...');
            await pushNotificationService.setupPushNotifications(state.user!.id);
          }
        }
      } catch (error) {
        logger.error('🔔 Initial token check failed:', error);
      }
    }, 10000);

    return () => {
      clearInterval(healthCheckInterval);
      clearTimeout(initialCheckTimeout);
    };
  }, [isAuthenticated, state.user]);

  /**
   * Require authentication for an action
   * @param message - Optional message to show
   * @param routeName - Optional route name to navigate to after auth
   * @param params - Optional params for navigation
   * @returns true = allowed, false = BLOCKED (modal shown)
   */
  const requireAuth = useCallback(
    (message?: string, routeName?: keyof RootStackParamList, params?: any): boolean => {
      if (isAuthenticated) return true; // user allowed

      // Avoid repeated modal triggers
      if (!isBlockingRef.current) {
        isBlockingRef.current = true;

        if (message) setLoginMessage(message);

        // Store pending navigation if provided
        if (routeName) {
          setPendingNavigation({ routeName, params });
        }

        setShowLoginPrompt(true);
      }

      return false; // BLOCK action
    },
    [isAuthenticated]
  );

  /**
   * Close modal and allow future requireAuth calls again
   */
  const closeLoginPrompt = useCallback(() => {
    setShowLoginPrompt(false);
    isBlockingRef.current = false;
    // Don't clear pending navigation - user might come back
  }, []);

  /**
   * When user logs in successfully, navigate to pending route
   * Called by AuthScreen after success animation
   */
  const handleAuthSuccess = useCallback(() => {
    setShowLoginPrompt(false);
    isBlockingRef.current = false;

    // Small delay to ensure navigation is ready
    setTimeout(() => {
      if (pendingNavigation) {
        const { routeName, params } = pendingNavigation;
        setPendingNavigation(null);

        // Navigate to the originally intended route using ref
        try {
          if (navigationRef) {
            if (params) {
              navigationRef.navigate(routeName as any, params);
            } else {
              navigationRef.navigate(routeName as any);
            }
          } else {
            logger.error('Navigation ref not available');
          }
        } catch (error) {
          logger.error('Navigation error:', error);
          // Fallback to safe route
          try {
            if (navigationRef) {
              navigationRef.navigate('CategorySelection');
            }
          } catch (fallbackError) {
            logger.error('Fallback navigation error:', fallbackError);
          }
        }
      } else {
        // Fallback to safe route
        try {
          if (navigationRef) {
            navigationRef.navigate('CategorySelection');
          }
        } catch (error) {
          logger.error('Fallback navigation error:', error);
        }
      }
    }, 100);
  }, [pendingNavigation]);

  /**
   * When user logs in successfully, call this to reset block state
   */
  const clearAuthBlock = useCallback(() => {
    setShowLoginPrompt(false);
    isBlockingRef.current = false;
    setPendingNavigation(null);
  }, []);

  return (
    <AuthGuardContext.Provider
      value={{
        isAuthenticated,
        requireAuth,
        showLoginPrompt,
        loginMessage,
        closeLoginPrompt,
        clearAuthBlock,
        handleAuthSuccess,
      }}
    >
      {children}
    </AuthGuardContext.Provider>
  );
};

export const useAuthGuard = () => {
  const context = useContext(AuthGuardContext);
  if (!context) {
    throw new Error('useAuthGuard must be used within an AuthGuardProvider');
  }
  return context;
};

