import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { useAuthGuard } from '../context/AuthGuardContext';
import { useColors } from '../config';
import { RootStackParamList } from '../types';

type ProtectedRouteNavProp = NativeStackNavigationProp<RootStackParamList>;

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
  const colors = useColors();
  const navigation = useNavigation<ProtectedRouteNavProp>();
  const { requireAuth } = useAuthGuard();
  const { t } = useTranslation();

  // When route is focused and user is not authenticated, show login prompt
  // This is a safety net in case navigation wasn't blocked at the source
  useFocusEffect(
    useCallback(() => {
      if (!state?.user) {
        // Capture the current route name and params to restore after login
        const navState = navigation.getState();
        const currentRoute = navState?.routes?.slice(-1)?.[0];
        const routeName = currentRoute?.name as keyof RootStackParamList | undefined;
        const params = currentRoute?.params;

        // Show login prompt, preserving the deep-link destination
        requireAuth(t('loginPrompt.accessPage'), routeName, params as Record<string, unknown>);

        // Navigate back after a short delay to prevent the protected page from rendering.
        // On cold-start deep links there is no back stack, so fall back to ChallengeLanding.
        const timer = setTimeout(() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('ChallengeLanding');
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
    return <View style={{ flex: 1, backgroundColor: colors.surface }} />;
  }

  // Only render protected content when authenticated
  return <>{children}</>;
};

export default ProtectedRoute;
