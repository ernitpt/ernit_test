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
const AppNavigatorContent = () => {
  const { showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  // Set navigation ref for AuthGuardContext
  useEffect(() => {
    if (navigationRef.current) {
      setNavigationRef(navigationRef.current);
    }
    return () => {
      setNavigationRef(null);
    };
  }, []);

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
      onStateChange={(navState) => {
        // Only update document title, no navigation blocking
        if (Platform.OS === 'web') document.title = 'Ernit';
      }}
    >
      <RootStack.Navigator
        initialRouteName="CategorySelection"
        screenOptions={{ headerShown: false, animation: 'none' }}
      >

        {/* PUBLIC ROUTES */}
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
  // Show loading screen while checking auth
  // -----------------------------
  if (isCheckingAuth) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // -----------------------------
  // RENDER
  // -----------------------------
  return (
    <AuthGuardProvider>
      <AppNavigatorContent />
    </AuthGuardProvider>
  );
};

export default AppNavigator;
