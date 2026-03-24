import React, { useEffect, useState, useRef, useMemo } from 'react';
import { NavigationContainer, NavigationContainerRef, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList, GiverStackParamList, RecipientStackParamList } from '../types';
import { View, Platform, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, useColors } from '../config';
import { onAuthStateChanged } from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { auth } from '../services/firebase';
import { userService } from '../services/userService';
import { cartService } from '../services/CartService';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuthGuard } from '../hooks/useAuthGuard';
import LoginPrompt from '../components/LoginPrompt';
import { setNavigationRef } from '../context/AuthGuardContext';
import { AuthGuardProvider } from '../context/AuthGuardContext';

// Screens
import LandingScreen from '../screens/LandingScreen';
import AuthScreen from '../screens/AuthScreen';
import CategorySelectionScreen from '../screens/giver/CategorySelectionScreen';
import ExperienceDetailsScreen from '../screens/giver/ExperienceDetailsScreen.web';
import ExperienceCheckoutScreen from '../screens/giver/ExperienceCheckoutScreen';
import ConfirmationScreen from '../screens/giver/ConfirmationScreen';
import ConfirmationMultipleScreen from '../screens/giver/ConfirmationMultipleScreen';
import CouponEntryScreen from '../screens/recipient/CouponEntryScreen';
import GoalSettingScreen from '../screens/recipient/GoalSettingScreen';
import JourneyScreen from '../screens/recipient/JourneyScreen';
import CompletionScreen from '../screens/recipient/CompletionScreen';
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
import FreeGoalCompletionScreen from '../screens/recipient/FreeGoalCompletionScreen';
import ChallengeLandingScreen from '../screens/ChallengeLandingScreen';
import ChallengeSetupScreen from '../screens/ChallengeSetupScreen';
import MysteryChoiceScreen from '../screens/giver/MysteryChoiceScreen';
import AchievementDetailScreen from '../screens/recipient/AchievementDetailScreen';
import AnimationPreviewScreen from '../screens/AnimationPreviewScreen';
import HeroPreviewScreen from '../screens/HeroPreviewScreen';
// GiftLanding now uses ChallengeLandingScreen with mode='gift' param
import GiftFlowScreen from '../screens/GiftFlowScreen';
import DeferredSetupScreen from '../screens/giver/DeferredSetupScreen';
import { logger } from '../utils/logger';
import { analyticsService } from '../services/AnalyticsService';
import { config } from '../config/environment';
import * as Notifications from 'expo-notifications';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const GiverStack = createNativeStackNavigator<GiverStackParamList>();
const RecipientStack = createNativeStackNavigator<RecipientStackParamList>();

const PROTECTED_ROUTES: (keyof RootStackParamList)[] = [
  'GiverFlow',
  'Confirmation',
  'ConfirmationMultiple',
  'Profile',
  'Goals',
  'GoalDetail',
  'Journey',
  'ExperienceCheckout',
  'RecipientFlow',
  'Completion',
  'Notification',
  'Feed',
  'AddFriend',
  'FriendProfile',
  'FriendsList',
  'PurchasedGifts',
  'FreeGoalCompletion',
  'AchievementDetail',
];

// Helper function to detect incognito mode
const isIncognitoMode = () => {
  if (Platform.OS !== 'web') return false;

  try {
    // Test if localStorage is available
    localStorage.setItem('test', 'test');
    localStorage.removeItem('test');
    return false;
  } catch (e) {
    return true; // Incognito mode detected
  }
};

// Giver
const GiverNavigator = () => (
  <GiverStack.Navigator id={undefined} screenOptions={{ headerShown: false, animation: Platform.OS === 'web' ? 'fade' : 'slide_from_right' }}>
    <GiverStack.Screen name="CategorySelection" component={CategorySelectionScreen} />
    <GiverStack.Screen name="ExperienceDetails" component={ExperienceDetailsScreen} />
    <GiverStack.Screen name="ExperienceCheckout" component={ExperienceCheckoutScreen} />
    <GiverStack.Screen name="Cart" component={CartScreen} />
    <GiverStack.Screen name="Confirmation" component={ConfirmationScreen} />
  </GiverStack.Navigator>
);

// Recipient
const RecipientNavigator = () => (
  <RecipientStack.Navigator id={undefined} screenOptions={{ headerShown: false, animation: Platform.OS === 'web' ? 'fade' : 'slide_from_right' }}>
    <RecipientStack.Screen name="CouponEntry" component={CouponEntryScreen} />
    <RecipientStack.Screen name="GoalSetting" component={GoalSettingScreen} />
    <RecipientStack.Screen name="Journey" component={JourneyScreen} />
    <RecipientStack.Screen name="Profile" component={UserProfileScreen} />
    <RecipientStack.Screen name="Completion" component={CompletionScreen} />
  </RecipientStack.Navigator>
);

// -------------------------------------------------------------------
// MAIN APP NAVIGATOR
// -------------------------------------------------------------------

// Inner component that uses useAuthGuard - must be inside AuthGuardProvider
const AppNavigatorContent = ({ initialRoute }: { initialRoute: keyof RootStackParamList }) => {
  const { showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const [isNavigationReady, setIsNavigationReady] = useState(false);

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

  // Set navigation ref for AuthGuardContext
  useEffect(() => {
    if (navigationRef.current) {
      setNavigationRef(navigationRef.current);
    }
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
      const data = response.notification.request.content.data as Record<string, any> | undefined;
      if (!data) return;

      // Wait until navigation is ready before dispatching
      const navigate = () => {
        if (!navigationRef.current) return;
        if (data.goalId) {
          navigationRef.current.navigate('GoalDetail', { goalId: data.goalId });
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
      }
    });

    return () => {
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
        CategorySelection: 'browse',
        Landing: 'landing',
        Auth: 'auth',
        ExperienceDetails: 'experience/:id',
        Cart: 'cart',
        GiverFlow: 'giver',
        Profile: 'profile',
        Goals: 'goals',
        GoalDetail: 'goal/:goalId',
        Journey: 'journey',
        ExperienceCheckout: 'checkout',
        Confirmation: 'confirmation',
        ConfirmationMultiple: 'confirmation-multiple',
        Completion: 'completion',
        Notification: 'notifications',
        Feed: 'feed',
        AddFriend: 'add-friend',
        FriendProfile: 'friend/:userId',
        FriendsList: 'friends',
        PurchasedGifts: 'purchased-gifts',
        GoalSetting: 'goal-setting',
        FreeGoalCompletion: 'free-goal-completion',
        GiftLanding: 'gift',
        GiftFlow: 'gift/create',
        DeferredSetup: 'gift/setup-payment',
        ChallengeSetup: 'challenge/create',
        ChallengeLanding: '',
        MysteryChoice: 'mystery-choice',
        AchievementDetail: 'achievement',
        AnimationPreview: 'animation-preview',
        HeroPreview: 'hero-preview',
      },
    },
  };

  return (
    <NavigationContainer
      linking={linking}
      ref={navigationRef}
      onReady={() => {
        logger.log('🧭 Navigation ready');
        setIsNavigationReady(true);
      }}
      onStateChange={(navState) => {
        // Update document title
        if (Platform.OS === 'web') document.title = 'Ernit';

        // Track screen views
        if (navState) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let route: { name?: string; state?: any } = navState.routes[navState.index ?? 0];
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
        screenOptions={{ headerShown: false, animation: Platform.OS === 'web' ? 'fade' : 'slide_from_right' }}
      >

        {/* PUBLIC ROUTES */}
        <RootStack.Screen name="ChallengeLanding" component={ChallengeLandingScreen} />
        <RootStack.Screen name="CategorySelection" component={CategorySelectionScreen} />
        <RootStack.Screen name="Landing" component={LandingScreen} />
        <RootStack.Screen name="Auth" component={AuthScreen} />
        <RootStack.Screen name="ExperienceDetails" component={ExperienceDetailsScreen} />
        <RootStack.Screen name="Cart" component={CartScreen} />
        <RootStack.Screen name="ChallengeSetup" component={ChallengeSetupScreen} />
        <RootStack.Screen name="MysteryChoice" component={MysteryChoiceScreen} />
        <RootStack.Screen name="GiftLanding" component={ChallengeLandingScreen} initialParams={{ mode: 'gift' }} />
        <RootStack.Screen name="GiftFlow" component={GiftFlowScreen} />
        <RootStack.Screen name="DeferredSetup" component={DeferredSetupScreen} />

        {/* PROTECTED ROUTES */}
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

        <RootStack.Screen name="Profile">
          {() => (
            <ProtectedRoute>
              <UserProfileScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="Goals">
          {() => (
            <ProtectedRoute>
              <GoalsScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="GoalDetail">
          {() => (
            <ProtectedRoute>
              <GoalDetailScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="Journey">
          {() => (
            <ProtectedRoute>
              <JourneyScreen />
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

        <RootStack.Screen name="Completion">
          {() => (
            <ProtectedRoute>
              <CompletionScreen />
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

        <RootStack.Screen name="Feed">
          {() => (
            <ProtectedRoute>
              <FeedScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="AddFriend">
          {() => (
            <ProtectedRoute>
              <AddFriendScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="FriendProfile">
          {() => (
            <ProtectedRoute>
              <FriendProfileScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="FriendsList">
          {() => (
            <ProtectedRoute>
              <FriendsListScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="PurchasedGifts">
          {() => (
            <ProtectedRoute>
              <PurchasedGiftsScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="GoalSetting">
          {() => (
            <ProtectedRoute>
              <GoalSettingScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="FreeGoalCompletion">
          {() => (
            <ProtectedRoute>
              <FreeGoalCompletionScreen />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="AchievementDetail">
          {() => (
            <ProtectedRoute>
              <AchievementDetailScreen />
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

        <RootStack.Screen name="HeroPreview" component={HeroPreviewScreen} />

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

            if (mergedCart.length !== persisted.cart?.length) {
              await userService.updateCart(firebaseUser.uid, mergedCart);
            }

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
            dispatch({ type: 'SET_USER', payload: newUser });

            await cartService.clearGuestCart();
          }
        } else if (mounted) {
          dispatch({ type: 'SET_USER', payload: null });
        }
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
    if (isCheckingAuth) return;

    (async () => {
      if (!state.user) {
        const guestCart = await cartService.getGuestCart();
        if (guestCart.length > 0) {
          dispatch({ type: 'SET_CART', payload: guestCart });
        }
      }
    })();
  }, [isCheckingAuth, state.user]);

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
  const initialRoute = state.user?.id ? 'Goals' : 'ChallengeLanding';

  return (
    <AuthGuardProvider>
      <AppNavigatorContent initialRoute={initialRoute} />
    </AuthGuardProvider>
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