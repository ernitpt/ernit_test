import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList, GiverStackParamList, RecipientStackParamList } from '../types';
import { ActivityIndicator, View, Platform } from 'react-native';
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
import OnboardingScreen from '../screens/OnboardingScreen';
import LandingScreen from '../screens/LandingScreen';
import AuthScreen from '../screens/AuthScreen';
import CategorySelectionScreen from '../screens/giver/CategorySelectionScreen';
import ExperienceDetailsScreen from '../screens/giver/ExperienceDetailsScreen.web';
import ExperienceCheckoutScreen from '../screens/giver/ExperienceCheckoutScreen';
import ConfirmationScreen from '../screens/giver/ConfirmationScreen';
import ConfirmationMultipleScreen from '../screens/giver/ConfirmationMultipleScreen';
import CouponEntryScreen from '../screens/recipient/CouponEntryScreen';
import GoalSettingScreen from '../screens/recipient/GoalSettingScreen';
import RoadmapScreen from '../screens/recipient/RoadmapScreen';
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

const RootStack = createNativeStackNavigator<RootStackParamList>() as any;
const GiverStack = createNativeStackNavigator<GiverStackParamList>() as any;
const RecipientStack = createNativeStackNavigator<RecipientStackParamList>() as any;

const PROTECTED_ROUTES: (keyof RootStackParamList)[] = [
  'GiverFlow',
  'Confirmation',
  'ConfirmationMultiple',
  'Profile',
  'Goals',
  'GoalDetail',
  'Roadmap',
  'ExperienceCheckout',
  'RecipientFlow',
  'Completion',
  'Notification',
  'AddFriend',
  'FriendProfile',
  'FriendsList',
  'PurchasedGifts',
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
  <GiverStack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
    <GiverStack.Screen name="CategorySelection" component={CategorySelectionScreen} />
    <GiverStack.Screen name="ExperienceDetails" component={ExperienceDetailsScreen} />
    <GiverStack.Screen name="ExperienceCheckout" component={ExperienceCheckoutScreen} />
    <GiverStack.Screen name="Cart" component={CartScreen} />
    <GiverStack.Screen name="Confirmation" component={ConfirmationScreen} />
  </GiverStack.Navigator>
);

// Recipient
const RecipientNavigator = () => (
  <RecipientStack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
    <RecipientStack.Screen name="CouponEntry" component={CouponEntryScreen} />
    <RecipientStack.Screen name="GoalSetting" component={GoalSettingScreen} />
    <RecipientStack.Screen name="Roadmap" component={RoadmapScreen} />
    <RecipientStack.Screen name="Profile" component={UserProfileScreen} />
    <RecipientStack.Screen name="Completion" component={CompletionScreen} />
  </RecipientStack.Navigator>
);

// -------------------------------------------------------------------
// MAIN APP NAVIGATOR
// -------------------------------------------------------------------

// Inner component that uses useAuthGuard - must be inside AuthGuardProvider
const AppNavigatorContent = ({ initialRoute }: { initialRoute: 'Onboarding' | 'CategorySelection' }) => {
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
      const shouldNotReset =
        pathname === '/' ||
        pathname === '' ||
        pathname.includes('/checkout') ||
        hasQueryParams;

      if (!shouldNotReset) {
        console.log('🔄 Resetting URL from', pathname, 'to root');
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

  // Force navigation to onboarding when initialRoute changes
  useEffect(() => {
    if (!isNavigationReady || !navigationRef.current) return;

    console.log('🧭 Navigation effect triggered, initialRoute:', initialRoute);

    // Navigate to the correct initial route
    if (initialRoute === 'Onboarding') {
      console.log('🎯 Navigating to Onboarding screen');
      navigationRef.current.navigate('Onboarding');
    } else {
      console.log('✅ Staying on CategorySelection');
    }
  }, [initialRoute, isNavigationReady]);

  // -----------------------------
  // RENDER
  // -----------------------------
  const linking = {
    prefixes: [
      'ernit://',
      'https://ernit.app',
      'https://ernit981723498127658912765187923546.vercel.app',
    ],
    config: {
      screens: {
        Onboarding: 'onboarding',
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
        CategorySelection: '',
        Landing: 'landing',
        Auth: 'auth',
        ExperienceDetails: 'experience/:id',
        Cart: 'cart',
        GiverFlow: 'giver',
        Profile: 'profile',
        Goals: 'goals',
        GoalDetail: 'goal/:goalId',
        Roadmap: 'roadmap',
        ExperienceCheckout: 'checkout',
        Confirmation: 'confirmation',
        ConfirmationMultiple: 'confirmation-multiple',
        Completion: 'completion',
        Notification: 'notifications',
        AddFriend: 'add-friend',
        FriendProfile: 'friend/:userId',
        FriendsList: 'friends',
        PurchasedGifts: 'purchased-gifts',
        GoalSetting: 'goal-setting',
      },
    },
  };

  return (
    <NavigationContainer
      linking={linking as any}
      ref={navigationRef as any}
      onReady={() => {
        console.log('🧭 Navigation ready');
        setIsNavigationReady(true);
      }}
      onStateChange={(navState) => {
        // Only update document title, no navigation blocking
        if (Platform.OS === 'web') document.title = 'Ernit';
      }}
    >
      <RootStack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false, animation: 'none' }}
      >

        {/* PUBLIC ROUTES */}
        <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
        <RootStack.Screen name="CategorySelection" component={CategorySelectionScreen} />
        <RootStack.Screen name="Landing" component={LandingScreen} />
        <RootStack.Screen name="Auth" component={AuthScreen} />
        <RootStack.Screen name="ExperienceDetails" component={ExperienceDetailsScreen} />
        <RootStack.Screen name="Cart" component={CartScreen} />

        {/* PROTECTED ROUTES */}
        <RootStack.Screen name="GiverFlow">
          {(props) => (
            <ProtectedRoute>
              <GiverNavigator {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="RecipientFlow">
          {(props) => (
            <ProtectedRoute>
              <RecipientNavigator {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="Profile">
          {(props) => (
            <ProtectedRoute>
              <UserProfileScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="Goals">
          {(props) => (
            <ProtectedRoute>
              <GoalsScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="GoalDetail">
          {(props) => (
            <ProtectedRoute>
              <GoalDetailScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="Roadmap">
          {(props) => (
            <ProtectedRoute>
              <RoadmapScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="ExperienceCheckout">
          {(props) => (
            <ProtectedRoute>
              <ExperienceCheckoutScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="Confirmation">
          {(props) => (
            <ProtectedRoute>
              <ConfirmationScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="ConfirmationMultiple">
          {(props) => (
            <ProtectedRoute>
              <ConfirmationMultipleScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="Completion">
          {(props) => (
            <ProtectedRoute>
              <CompletionScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="Notification">
          {(props) => (
            <ProtectedRoute>
              <NotificationsScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="AddFriend">
          {(props) => (
            <ProtectedRoute>
              <AddFriendScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="FriendProfile">
          {(props) => (
            <ProtectedRoute>
              <FriendProfileScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="FriendsList">
          {(props) => (
            <ProtectedRoute>
              <FriendsListScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="PurchasedGifts">
          {(props) => (
            <ProtectedRoute>
              <PurchasedGiftsScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

        <RootStack.Screen name="GoalSetting">
          {(props) => (
            <ProtectedRoute>
              <GoalSettingScreen {...props} />
            </ProtectedRoute>
          )}
        </RootStack.Screen>

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
  const { state, dispatch } = useApp();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);

  // -----------------------------
  // Check if user has seen onboarding
  // -----------------------------
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        // 🧪 TEST MODE: Set to true to always show onboarding (for testing)
        const FORCE_SHOW_ONBOARDING = false;

        if (FORCE_SHOW_ONBOARDING) {
          console.log('🧪 TEST MODE: Forcing onboarding to show');
          setHasSeenOnboarding(false);
          setIsCheckingOnboarding(false);
          return;
        }

        // If user is logged in, ONLY check Firestore (ignore AsyncStorage)
        if (state.user?.id) {
          console.log('🔍 Checking onboarding status for logged-in user:', state.user.id);
          const userData = await userService.getUserById(state.user.id);
          console.log('📊 User onboardingStatus from Firestore:', userData?.onboardingStatus);

          if (userData?.onboardingStatus === 'completed' ||
            userData?.onboardingStatus === 'skipped') {
            console.log('✅ Onboarding completed/skipped - skipping onboarding screen');
            setHasSeenOnboarding(true);
          } else {
            console.log('🎯 Onboarding not completed - showing onboarding screen');
            setHasSeenOnboarding(false);
          }
        } else {
          // For guest users, check AsyncStorage
          console.log('🔍 Checking onboarding status for guest user');
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const seen = await AsyncStorage.getItem('hasSeenOnboarding');
          console.log('📊 AsyncStorage hasSeenOnboarding:', seen);

          // null or any value other than 'true' means show onboarding
          if (seen === 'true') {
            console.log('✅ Guest has seen onboarding - skipping');
            setHasSeenOnboarding(true);
          } else {
            console.log('🎯 Guest hasn\'t seen onboarding - showing (value was:', seen, ')');
            setHasSeenOnboarding(false);
          }
        }
      } catch (error) {
        console.error('Error checking onboarding status:', error);
        // Default to showing onboarding in case of error
        setHasSeenOnboarding(false);
      } finally {
        setIsCheckingOnboarding(false);
      }
    };
    checkOnboarding();
  }, [state.user]);

  // -----------------------------
  // Restore Authentication
  // -----------------------------
  useEffect(() => {
    let mounted = true;

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
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
  // Show loading screen while checking auth and onboarding
  // -----------------------------
  if (isCheckingAuth || isCheckingOnboarding) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // -----------------------------
  // RENDER
  // -----------------------------
  console.log('🧭 AppNavigator rendering with hasSeenOnboarding:', hasSeenOnboarding, '→ initialRoute:', hasSeenOnboarding ? 'CategorySelection' : 'Onboarding');

  return (
    <AuthGuardProvider>
      <AppNavigatorContent initialRoute={hasSeenOnboarding ? 'CategorySelection' : 'Onboarding'} />
    </AuthGuardProvider>
  );
};

export default AppNavigator;