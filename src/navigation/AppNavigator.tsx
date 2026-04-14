import React, { useEffect, useState, useRef, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, NavigationContainerRef, LinkingOptions, NavigationState, PartialState, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList, GiverStackParamList, RecipientStackParamList } from '../types';
import { Platform, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, useColors } from '../config';
import { onAuthStateChanged } from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { auth } from '../services/firebase';
import { userService } from '../services/userService';
import { cartService } from '../services/CartService';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuthGuard } from '../context/AuthGuardContext';
import LoginPrompt from '../components/LoginPrompt';
import { setNavigationRef } from '../context/AuthGuardContext';
import { AuthGuardProvider } from '../context/AuthGuardContext';

// Screens
import LandingScreen from '../screens/LandingScreen';
import AuthScreen from '../screens/AuthScreen';
import CategorySelectionScreen from '../screens/giver/CategorySelectionScreen';
import ExperienceDetailsScreen from '../screens/giver/ExperienceDetailsScreen';
import ExperienceCheckoutScreen from '../screens/giver/ExperienceCheckoutScreen';
import ConfirmationScreen from '../screens/giver/ConfirmationScreen';
import ConfirmationMultipleScreen from '../screens/giver/ConfirmationMultipleScreen';
import CouponEntryScreen from '../screens/recipient/CouponEntryScreen';
import GoalSettingScreen from '../screens/recipient/GoalSettingScreen';
import JourneyScreen from '../screens/recipient/JourneyScreen';
// CompletionScreen removed — merged into AchievementDetailScreen
import UserProfileScreen from '../screens/UserProfileScreen';
import GoalsScreen from '../screens/GoalsScreen';
import GoalDetailScreen from '../screens/GoalDetailScreen';
import CartScreen from '../screens/giver/CartScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import AddFriendScreen from '../screens/AddFriendScreen';
import FriendProfileScreen from '../screens/FriendProfileScreen';
import FriendsListScreen from '../screens/FriendsListScreen';
import PurchasedGiftsScreen from '../screens/PurchasedGiftsScreen';
import FeedScreen from '../screens/FeedScreen';
// FreeGoalCompletionScreen removed — merged into AchievementDetailScreen
import ChallengeLandingScreen from '../screens/ChallengeLandingScreen';
import ChallengeSetupScreen from '../screens/ChallengeSetupScreen';
import MysteryChoiceScreen from '../screens/giver/MysteryChoiceScreen';
import AchievementDetailScreen from '../screens/recipient/AchievementDetailScreen';
import ShareScreen from '../screens/recipient/ShareScreen';
import AnimationPreviewScreen from '../screens/AnimationPreviewScreen';
import HeroPreviewScreen from '../screens/HeroPreviewScreen';
// GiftLanding now uses ChallengeLandingScreen with mode='gift' param
import GiftFlowScreen from '../screens/GiftFlowScreen';
import DeferredSetupScreen from '../screens/giver/DeferredSetupScreen';
import MainTabNavigator from './MainTabNavigator';
import { NotificationBadgeProvider } from '../context/NotificationBadgeContext';
import { useLanguageSync } from '../context/LanguageContext';
import { logger } from '../utils/logger';
import { analyticsService } from '../services/AnalyticsService';
import { identifyClarity, setClarityTag } from '../utils/clarity';
import { config } from '../config/environment';
import * as Notifications from 'expo-notifications';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const GiverStack = createNativeStackNavigator<GiverStackParamList>();
const RecipientStack = createNativeStackNavigator<RecipientStackParamList>();

// Helper function to detect incognito mode
const isIncognitoMode = () => {
  if (Platform.OS !== 'web') return false;

  try {
    // Test if localStorage is available
    localStorage.setItem('test', 'test');
    localStorage.removeItem('test');
    return false;
  } catch (e: unknown) {
    return true; // Incognito mode detected
  }
};

// Giver
const GiverNavigator = () => {
  const colors = useColors();
  return (
    <GiverStack.Navigator id={undefined} screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.surface } }}>
      <GiverStack.Screen name="CategorySelection" component={CategorySelectionScreen} />
      <GiverStack.Screen name="ExperienceDetails" component={ExperienceDetailsScreen} />
      <GiverStack.Screen name="ExperienceCheckout" component={ExperienceCheckoutScreen} />
      <GiverStack.Screen name="Cart" component={CartScreen} />
      <GiverStack.Screen name="Confirmation" component={ConfirmationScreen} />
    </GiverStack.Navigator>
  );
};

// Recipient
const RecipientNavigator = () => {
  const colors = useColors();
  return (
    <RecipientStack.Navigator id={undefined} screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.surface } }}>
      <RecipientStack.Screen name="CouponEntry" component={CouponEntryScreen} />
      <RecipientStack.Screen name="Profile" component={UserProfileScreen} />
    </RecipientStack.Navigator>
  );
};

// -------------------------------------------------------------------
// MAIN APP NAVIGATOR
// -------------------------------------------------------------------

// Inner component that uses useAuthGuard - must be inside AuthGuardProvider
const AppNavigatorContent = ({ initialRoute }: { initialRoute: keyof RootStackParamList }) => {
  const { showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const colors = useColors();
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const pendingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isNavigationReady, setIsNavigationReady] = useState(false);

  // Custom navigation theme — overrides DefaultTheme's gray/white background which
  // causes a flash during back navigation on web (visible during the display:none→flex swap).
  const navTheme = useMemo(() => ({
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.surface,
      card: colors.surface,
      primary: colors.primary,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.error,
    },
  }), [colors]);

  // Reset URL to root on web refresh (except for checkout and URLs with query params)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      const hasQueryParams = window.location.search.length > 0;

      // Don't reset if:
      // 1. Already at root
      // 2. On checkout page (has important state)
      // 3. URL has query parameters (might contain important data)
      // 4. On recipient redemption page (deep link)
      // 5. On challenge pages (preserve challenge flow)
      const shouldNotReset =
        pathname === '/' ||
        pathname === '' ||
        pathname.includes('/checkout') ||
        pathname.includes('/recipient/redeem/') ||
        pathname.includes('/challenge') ||
        pathname.includes('/gift') ||
        hasQueryParams;

      if (!shouldNotReset) {
        logger.log('🔄 Resetting URL from', pathname, 'to root');
        window.history.replaceState({}, '', '/');
      }
    }
  }, []);

  // Clear navigation ref on unmount (registration happens in onReady below)
  useEffect(() => {
    return () => {
      setNavigationRef(null);
    };
  }, []);

  // Handle push notification taps — route user to relevant screen
  useEffect(() => {
    // expo-notifications tap routing is only applicable on native (iOS/Android)
    // On web, FCM foreground messages are handled by PushNotificationService
    if (Platform.OS === 'web') return;

    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      if (!data) return;

      // Wait until navigation is ready before dispatching
      const navigate = () => {
        if (!navigationRef.current) return;
        if (typeof data.goalId === 'string') {
          navigationRef.current.navigate('MainTabs', { screen: 'GoalsTab', params: { screen: 'GoalDetail', params: { goalId: data.goalId } } });
        } else if (data.type === 'friend_request') {
          navigationRef.current.navigate('Notification');
        } else {
          navigationRef.current.navigate('Notification');
        }
      };

      if (isNavigationReady) {
        navigate();
      } else {
        // Poll until navigation is ready (handles cold-start taps)
        const interval = setInterval(() => {
          if (navigationRef.current) {
            clearInterval(interval);
            navigate();
          }
        }, 100);
        // Store interval id so cleanup can cancel it if listener fires before nav is ready
        if (pendingIntervalRef.current) clearInterval(pendingIntervalRef.current);
        pendingIntervalRef.current = interval;
      }
    });

    return () => {
      if (pendingIntervalRef.current) clearInterval(pendingIntervalRef.current);
      responseListener.remove();
    };
  }, [isNavigationReady]);

  // -----------------------------
  // RENDER
  // -----------------------------
  const linking: LinkingOptions<RootStackParamList> = {
    prefixes: [
      'ernit://',
      'https://ernit.app',
      'https://ernit981723498127658912765187923546.vercel.app',
    ],
    config: {
      screens: {
        RecipientFlow: {
          path: 'recipient',
          screens: {
            CouponEntry: {
              path: 'redeem/:code',
              parse: {
                code: (code: string) => code,
              },
            },
          },
        },
        MainTabs: {
          screens: {
            HomeTab: {
              screens: {
                CategorySelection: 'browse',
                ExperienceDetails: 'experience/:id',
                Cart: 'cart',
              },
            },
            GoalsTab: {
              screens: {
                Goals: 'goals',
                GoalDetail: 'goal/:goalId',
                Journey: 'journey',
                GoalSetting: 'goal-setting',
                AchievementDetail: 'achievement',
              },
            },
            FeedTab: {
              screens: {
                Feed: 'feed',
                FriendProfile: 'friend/:userId',
              },
            },
            ProfileTab: {
              screens: {
                Profile: 'profile',
                FriendsList: 'friends',
                AddFriend: 'add-friend',
                PurchasedGifts: 'purchased-gifts',
              },
            },
          },
        },
        Notification: 'notifications',
        Landing: 'landing',
        Auth: 'auth',
        GiverFlow: 'giver',
        ExperienceCheckout: 'checkout',
        Confirmation: 'confirmation',
        ConfirmationMultiple: 'confirmation-multiple',
        GiftLanding: 'gift',
        GiftFlow: 'gift/create',
        DeferredSetup: 'gift/setup-payment',
        ChallengeSetup: 'challenge/create',
        ChallengeLanding: '',
        MysteryChoice: 'mystery-choice',
        AnimationPreview: 'animation-preview',
        HeroPreview: 'hero-preview',
      },
    },
  };

  return (
    <NavigationContainer
      theme={navTheme}
      linking={linking}
      ref={navigationRef}
      onReady={() => {
        logger.log('🧭 Navigation ready');
        setIsNavigationReady(true);
        setNavigationRef(navigationRef.current);
      }}
      onStateChange={(navState) => {
        // Update document title
        if (Platform.OS === 'web') document.title = 'Ernit';

        // Track screen views
        if (navState) {
          let route: { name?: string; state?: NavigationState | PartialState<NavigationState> } = navState.routes[navState.index ?? 0];
          // Drill into nested navigators
          while (route.state?.routes) {
            route = route.state.routes[route.state.index ?? 0];
          }
          if (route.name) {
            analyticsService.trackScreenView(route.name);
          }
        }
      }}
    >
      <RootStack.Navigator
        id={undefined}
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: colors.surface },
        }}
      >

        {/* TAB NAVIGATOR — main app shell */}
        <RootStack.Screen name="MainTabs" component={MainTabNavigator} />

        {/* PUBLIC ROUTES (no tabs) */}
        <RootStack.Screen name="ChallengeLanding" component={ChallengeLandingScreen} />
        <RootStack.Screen name="Landing" component={LandingScreen} />
        <RootStack.Screen name="Auth" component={AuthScreen} />
        <RootStack.Screen name="ChallengeSetup" component={ChallengeSetupScreen} />
        <RootStack.Screen name="GiftLanding" component={ChallengeLandingScreen} initialParams={{ mode: 'gift' }} />
        <RootStack.Screen name="GiftFlow" component={GiftFlowScreen} />
        <RootStack.Screen name="HeroPreview" component={HeroPreviewScreen} />
        <RootStack.Screen name="MysteryChoice" component={MysteryChoiceScreen} />

        {/* PROTECTED NON-TAB ROUTES */}
        <RootStack.Screen name="DeferredSetup">
          {() => (
            <ProtectedRoute>
              <DeferredSetupScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="GiverFlow">
          {() => (
            <ProtectedRoute>
              <GiverNavigator />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="RecipientFlow">
          {() => (
            <ProtectedRoute>
              <RecipientNavigator />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="ExperienceCheckout">
          {() => (
            <ProtectedRoute>
              <ExperienceCheckoutScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="Confirmation">
          {() => (
            <ProtectedRoute>
              <ConfirmationScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="ConfirmationMultiple">
          {() => (
            <ProtectedRoute>
              <ConfirmationMultipleScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="Notification">
          {() => (
            <ProtectedRoute>
              <NotificationsScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="ShareGoal" options={{ presentation: 'modal' }}>
          {() => (
            <ProtectedRoute>
              <ShareScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        {config.debugEnabled && (
          <RootStack.Screen name="AnimationPreview">
            {() => (
              <ProtectedRoute>
                <AnimationPreviewScreen />
              </ProtectedRoute>
            )}
          </RootStack.Screen>
        )}

        {/* 🔥 LOGIN PROMPT MODAL SHOULD BE LAST */}
        <RootStack.Screen
          name="LoginPromptModal"
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
          }}
        >
          {() => (
            <LoginPrompt
              visible={showLoginPrompt}
              onClose={closeLoginPrompt}
              message={loginMessage}
            />
          )}
        </RootStack.Screen>

      </RootStack.Navigator>
    </NavigationContainer>
  );
};

// Main AppNavigator component - wraps content with AuthGuardProvider
const AppNavigator = () => {
  const colors = useColors();
  const splashStyles = useMemo(() => createSplashStyles(colors), [colors]);
  const { state, dispatch } = useApp();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Sync app language from the authenticated user's profile preference
  useLanguageSync(state.user?.profile?.preferredLanguage as 'en' | 'pt' | undefined);

  // -----------------------------
  // Restore Authentication
  // -----------------------------
  useEffect(() => {
    let mounted = true;

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        analyticsService.setUserId(firebaseUser?.uid ?? null);
        if (firebaseUser) {
          const guestCart = await cartService.getGuestCart();
          const persisted = await userService.getUserById(firebaseUser.uid);

          if (!mounted) return;

          if (persisted) {
            const mergedCart = cartService.mergeCarts(guestCart, persisted.cart || []);

            if (JSON.stringify(mergedCart) !== JSON.stringify(persisted.cart ?? [])) {
              await userService.updateCart(firebaseUser.uid, mergedCart);
            }

            // Set GA4 user properties for audience segmentation
            analyticsService.setUserProperties({
              user_type: persisted.userType || 'giver',
              account_age_days: Math.floor(
                (Date.now() - (persisted.createdAt instanceof Date ? persisted.createdAt.getTime() : new Date(persisted.createdAt).getTime())) / 86_400_000
              ),
              has_goals: (persisted.goalCount ?? 0) > 0,
            });

            // Identify user in Clarity for session attribution
            identifyClarity(firebaseUser.uid, persisted.displayName);
            setClarityTag('user_type', persisted.userType || 'giver');

            dispatch({
              type: 'SET_USER',
              payload: { ...persisted, cart: mergedCart },
            });

            await cartService.clearGuestCart();
          } else {
            const newUser = {
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || undefined,
              userType: 'giver' as const,
              createdAt: new Date(),
              wishlist: [],
              cart: guestCart,
            };

            await userService.createUserProfile(newUser);
            if (!mounted) return;
            dispatch({ type: 'SET_USER', payload: newUser });

            await cartService.clearGuestCart();
          }
        } else if (mounted) {
          dispatch({ type: 'SET_USER', payload: null });
        }
      } catch (error) {
        logger.error('[AppNavigator] Failed to create user profile:', error);
        if (mounted) dispatch({ type: 'SET_USER', payload: null });
      } finally {
        if (mounted) setIsCheckingAuth(false);
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [dispatch]);

  // -----------------------------
  // Load guest cart AFTER auth resolved
  // -----------------------------
  useEffect(() => {
    if (isCheckingAuth || state.user) return;

    let mounted = true;
    cartService.getGuestCart().then(guestCart => {
      if (mounted && guestCart.length > 0) {
        dispatch({ type: 'SET_CART', payload: guestCart });
      }
    }).catch((e) => { logger.warn('Failed to load guest cart:', e); });
    return () => { mounted = false; };
  }, [isCheckingAuth, state.user?.id, dispatch]);

  // -----------------------------
  // Show loading screen while checking auth
  // -----------------------------
  if (isCheckingAuth) {
    return (
      <LinearGradient colors={colors.gradientPrimary} style={splashStyles.container}>
        <Image
          source={require('../assets/icon.png')}
          style={splashStyles.logo}
          resizeMode="contain"
        />
        <ActivityIndicator size="small" color={colors.white} style={splashStyles.spinner} />
      </LinearGradient>
    );
  }

  // -----------------------------
  // RENDER — logged-in users go straight to Goals, guests see landing
  // -----------------------------
  const initialRoute = state.user?.id ? 'MainTabs' : 'ChallengeLanding';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthGuardProvider>
        <NotificationBadgeProvider>
          <AppNavigatorContent initialRoute={initialRoute} />
        </NotificationBadgeProvider>
      </AuthGuardProvider>
    </GestureHandlerRootView>
  );
};

const createSplashStyles = (colors: typeof Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 100,
    height: 100,
  },
  spinner: {
    marginTop: 24,
  },
});

export default AppNavigator;