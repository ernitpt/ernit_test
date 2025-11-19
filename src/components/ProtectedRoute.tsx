import React, { useEffect, useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { useAuthGuard } from '../hooks/useAuthGuard';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Component that protects routes requiring authentication
 * Shows login prompt overlay when accessed without authentication
 * Navigation blocking should happen BEFORE navigation, not after
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
}) => {
  const { state } = useApp();
  const navigation = useNavigation();
  const { requireAuth, showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();

  // When route is focused and user is not authenticated, show login prompt
  // This is a safety net in case navigation wasn't blocked at the source
  useFocusEffect(
    useCallback(() => {
      if (!state?.user) {
        // Show login prompt instead of navigating back
        requireAuth('Please log in to access this page.');
        // Navigate back after a short delay to prevent the protected page from rendering
        const timer = setTimeout(() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          }
        }, 0);
        
        return () => {
          clearTimeout(timer);
        };
      }
    }, [state?.user, navigation, requireAuth])
  );

  // DO NOT render protected content when not authenticated
  // This prevents the protected page from mounting at all
  if (!state?.user) {
    // Return null - don't render anything
    // The login prompt is shown via useAuthGuard hook
    return null;
  }

  // Only render protected content when authenticated
  return <>{children}</>;
};

export default ProtectedRoute;
