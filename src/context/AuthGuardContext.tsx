import React, { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import { useApp } from './AppContext';
import { NavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';

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

  // Note: Navigation is handled by AuthScreen after success animation
  // This effect is kept as a backup but AuthScreen will call handleAuthSuccess directly
  useEffect(() => {
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

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
            console.error('Navigation ref not available');
          }
        } catch (error) {
          console.error('Navigation error:', error);
          // Fallback to safe route
          try {
            if (navigationRef) {
              navigationRef.navigate('CategorySelection');
            }
          } catch (fallbackError) {
            console.error('Fallback navigation error:', fallbackError);
          }
        }
      } else {
        // Fallback to safe route
        try {
          if (navigationRef) {
            navigationRef.navigate('CategorySelection');
          }
        } catch (error) {
          console.error('Fallback navigation error:', error);
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

