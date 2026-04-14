import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing } from '../config/spacing';
import { FOOTER_HEIGHT } from '../components/CustomTabBar';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useColors } from '../config';
import { useAuthGuard } from '../context/AuthGuardContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import LoginPrompt from '../components/LoginPrompt';
import SideMenu from '../components/SideMenu';
import CustomTabBar from '../components/CustomTabBar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useApp } from '../context/AppContext';

import type {
  MainTabsParamList,
  HomeTabParamList,
  GoalsTabParamList,
  FeedTabParamList,
  ProfileTabParamList,
} from '../types';

// Screens
import CategorySelectionScreen from '../screens/giver/CategorySelectionScreen';
import ExperienceDetailsScreen from '../screens/giver/ExperienceDetailsScreen';
import CartScreen from '../screens/giver/CartScreen';
import MysteryChoiceScreen from '../screens/giver/MysteryChoiceScreen';
import GoalsScreen from '../screens/GoalsScreen';
import GoalDetailScreen from '../screens/GoalDetailScreen';
import JourneyScreen from '../screens/recipient/JourneyScreen';
import GoalSettingScreen from '../screens/recipient/GoalSettingScreen';
import AchievementDetailScreen from '../screens/recipient/AchievementDetailScreen';
import CouponEntryScreen from '../screens/recipient/CouponEntryScreen';
import FeedScreen from '../screens/FeedScreen';
import FriendProfileScreen from '../screens/FriendProfileScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import FriendsListScreen from '../screens/FriendsListScreen';
import AddFriendScreen from '../screens/AddFriendScreen';
import PurchasedGiftsScreen from '../screens/PurchasedGiftsScreen';

// ─── Inner Stacks ──────────────────────────────────────────────────
const HomeStack = createNativeStackNavigator<HomeTabParamList>();
const GoalsStack = createNativeStackNavigator<GoalsTabParamList>();
const FeedStack = createNativeStackNavigator<FeedTabParamList>();
const ProfileStack = createNativeStackNavigator<ProfileTabParamList>();

const HomeTabNavigator = () => {
  const colors = useColors();
  return (
    <HomeStack.Navigator id={undefined} screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.surface } }}>
      <HomeStack.Screen name="CategorySelection" component={CategorySelectionScreen} />
      <HomeStack.Screen name="ExperienceDetails" component={ExperienceDetailsScreen} />
      <HomeStack.Screen name="Cart" component={CartScreen} />
      <HomeStack.Screen name="MysteryChoice" component={MysteryChoiceScreen} />
    </HomeStack.Navigator>
  );
};

const GoalsTabNavigator = () => {
  const colors = useColors();
  return (
    <GoalsStack.Navigator id={undefined} screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.surface } }}>
      <GoalsStack.Screen name="Goals" component={GoalsScreen} />
      <GoalsStack.Screen name="GoalDetail" component={GoalDetailScreen} />
      <GoalsStack.Screen name="Journey" component={JourneyScreen} />
      <GoalsStack.Screen name="GoalSetting" component={GoalSettingScreen} />
      <GoalsStack.Screen name="AchievementDetail" component={AchievementDetailScreen} />
      <GoalsStack.Screen name="CouponEntry" component={CouponEntryScreen} />
    </GoalsStack.Navigator>
  );
};

const FeedTabNavigator = () => {
  const colors = useColors();
  return (
    <FeedStack.Navigator id={undefined} screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.surface } }}>
      <FeedStack.Screen name="Feed" component={FeedScreen} />
      <FeedStack.Screen name="FriendProfile" component={FriendProfileScreen} />
    </FeedStack.Navigator>
  );
};

const ProfileTabNavigator = () => {
  const colors = useColors();
  return (
    <ProfileStack.Navigator id={undefined} screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.surface } }}>
      <ProfileStack.Screen name="Profile" component={UserProfileScreen} />
      <ProfileStack.Screen name="FriendsList" component={FriendsListScreen} />
      <ProfileStack.Screen name="AddFriend" component={AddFriendScreen} />
      <ProfileStack.Screen name="PurchasedGifts" component={PurchasedGiftsScreen} />
    </ProfileStack.Navigator>
  );
};

// ─── Tab Navigator ─────────────────────────────────────────────────
const Tab = createBottomTabNavigator<MainTabsParamList>();

const MainTabNavigator = () => {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state } = useApp();
  const { showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const { isConnected } = useNetworkStatus();
  const [sideMenuVisible, setSideMenuVisible] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState(2); // GoalsTab = index 2
  const [tabReady, setTabReady] = useState(false);
  const tabNavRef = useRef<BottomTabBarProps['navigation'] | null>(null);

  const handleMenuOpen = useCallback(() => setSideMenuVisible(true), []);
  const handleMenuClose = useCallback(() => setSideMenuVisible(false), []);

  const handleTabBarProps = useCallback((props: BottomTabBarProps) => {
    tabNavRef.current = props.navigation;
    // Schedule state update for after render
    setTimeout(() => {
      setActiveTabIndex(props.state.index);
      setTabReady(true);
    }, 0);
    return null;
  }, []);

  return (
    <ErrorBoundary screenName="MainTabs" userId={state.user?.id}>
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.surface }}>
        {!isConnected && (
          <View style={{ backgroundColor: colors.error, paddingVertical: 4, alignItems: 'center' }}>
            {/* Offline banner — matches MainScreen */}
          </View>
        )}
        <Tab.Navigator
          id={undefined}
          initialRouteName="GoalsTab"
          screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
          sceneContainerStyle={{ backgroundColor: colors.surface }}
          tabBar={handleTabBarProps}
        >
          <Tab.Screen name="HomeTab" component={HomeTabNavigator} />
          <Tab.Screen name="FeedTab" component={FeedTabNavigator} />
          <Tab.Screen name="GoalsTab" component={GoalsTabNavigator} />
          <Tab.Screen name="ProfileTab" component={ProfileTabNavigator} />
        </Tab.Navigator>
        {tabReady && tabNavRef.current && (
          <View style={{ position: 'absolute', bottom: Platform.OS === 'android' ? -1 : 0, left: 0, right: 0 }} pointerEvents="box-none">
            <CustomTabBar onMenuPress={handleMenuOpen} tabNavigation={tabNavRef.current} activeTabIndex={activeTabIndex} />
          </View>
        )}
        <LoginPrompt visible={showLoginPrompt} onClose={closeLoginPrompt} message={loginMessage} />
        <SideMenu visible={sideMenuVisible} onClose={handleMenuClose} />
      </SafeAreaView>
    </ErrorBoundary>
  );
};

export default MainTabNavigator;
