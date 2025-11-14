import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList, GiverStackParamList, RecipientStackParamList } from '../types';
import { ActivityIndicator, View } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { auth } from '../services/firebase';
import { userService } from '../services/userService';

// Import screens (we'll create these next)
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

// Giver Flow Navigator
const GiverNavigator = () => {
  return (
    <GiverStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'none',
      }}
    >
      <GiverStack.Screen name="CategorySelection" component={CategorySelectionScreen} />
      <GiverStack.Screen name="ExperienceDetails" component={ExperienceDetailsScreen} />
      <GiverStack.Screen name="ExperienceCheckout" component={ExperienceCheckoutScreen} />
      <GiverStack.Screen name="Cart" component={CartScreen} />
      <GiverStack.Screen name="Confirmation" component={ConfirmationScreen} />
    </GiverStack.Navigator>
  );
};

// Recipient Flow Navigator
const RecipientNavigator = () => {
  return (
    <RecipientStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'none',
      }}
    >
      <RecipientStack.Screen name="CouponEntry" component={CouponEntryScreen} />
      <RecipientStack.Screen name="GoalSetting" component={GoalSettingScreen} />
      <RecipientStack.Screen name="Roadmap" component={RoadmapScreen} />
      <RecipientStack.Screen name="Profile" component={UserProfileScreen} />
      <RecipientStack.Screen name="Completion" component={CompletionScreen} />
    </RecipientStack.Navigator>
  );
};

// Main App Navigator
const AppNavigator = () => {
  const { state, dispatch } = useApp();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const persistedUser = await userService.getUserById(firebaseUser.uid);

          if (!isMounted) {
            return;
          }

          if (persistedUser) {
            dispatch({ type: 'SET_USER', payload: persistedUser });
          } else {
            dispatch({
              type: 'SET_USER',
              payload: {
                id: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || undefined,
                userType: 'giver',
                createdAt: new Date(),
                wishlist: [],
                cart: [],
              },
            });
          }
        } else if (isMounted) {
          dispatch({ type: 'SET_USER', payload: null });
        }
      } catch (error) {
        if (isMounted) {
          console.error('Failed to restore user session', error);
          dispatch({ type: 'SET_USER', payload: null });
        }
      } finally {
        if (isMounted) {
          setIsCheckingAuth(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [dispatch]);

  if (isCheckingAuth) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'none',
        }}
      >
        {!state.user ? (
          <>
            <RootStack.Screen name="Landing" component={LandingScreen} />
            <RootStack.Screen name="Auth" component={AuthScreen} />
          </>
        ) : (
          <>
            <RootStack.Screen name="GiverFlow" component={GiverNavigator} />
            <RootStack.Screen name="CategorySelection" component={CategorySelectionScreen} />
            <RootStack.Screen name="Confirmation" component={ConfirmationScreen} />
            <RootStack.Screen name="ConfirmationMultiple" component={ConfirmationMultipleScreen} />
            <RootStack.Screen name="Profile" component={UserProfileScreen} />
            <RootStack.Screen name="Goals" component={GoalsScreen} />
            <RootStack.Screen name="GoalDetail" component={GoalDetailScreen} />
            <RootStack.Screen name="Cart" component={CartScreen} />
            <RootStack.Screen name="Roadmap" component={RoadmapScreen} />
            <RootStack.Screen name="ExperienceDetails" component={ExperienceDetailsScreen} />
            <RootStack.Screen name="ExperienceCheckout" component={ExperienceCheckoutScreen} />
            <RootStack.Screen name="RecipientFlow" component={RecipientNavigator} />
            <RootStack.Screen name="Completion" component={CompletionScreen} />
            <RootStack.Screen name="Notification" component={NotificationsScreen} />
            <RootStack.Screen name="AddFriend" component={AddFriendScreen} />
            <RootStack.Screen name="FriendProfile" component={FriendProfileScreen} />
            <RootStack.Screen name="FriendsList" component={FriendsListScreen} />
            <RootStack.Screen name="PurchasedGifts" component={PurchasedGiftsScreen} />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
