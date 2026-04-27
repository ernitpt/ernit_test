import React, { useCallback, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import CustomTabBar from './CustomTabBar';
import SideMenu from './SideMenu';
import type { RootStackParamList, MainTabsParamList } from '../types';

type RootNavProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * Footer tab bar for root-level screens (Confirmation, Notification, etc.)
 * that sit outside MainTabs but still need the app-wide navigation footer.
 *
 * Provides a proxy `tabNavigation` that translates MainTabs-style calls
 * into root-level `navigate('MainTabs', { screen, params })` dispatches,
 * so tapping a tab pops the user into that tab's root.
 */
const RootFooterTabBar: React.FC = () => {
  const rootNavigation = useNavigation<RootNavProp>();
  const [sideMenuVisible, setSideMenuVisible] = useState(false);

  const tabNavigationProxy = useMemo(() => ({
    ...rootNavigation,
    navigate: (tabName: string, params?: { screen?: string }) => {
      rootNavigation.navigate('MainTabs' as never, {
        screen: tabName,
        params,
      } as never);
    },
  }), [rootNavigation]) as unknown as NavigationProp<MainTabsParamList>;

  const handleMenuOpen = useCallback(() => setSideMenuVisible(true), []);
  const handleMenuClose = useCallback(() => setSideMenuVisible(false), []);

  return (
    <>
      <View
        style={{
          position: 'absolute',
          bottom: Platform.OS === 'android' ? -1 : 0,
          left: 0,
          right: 0,
        }}
        pointerEvents="box-none"
      >
        <CustomTabBar
          onMenuPress={handleMenuOpen}
          tabNavigation={tabNavigationProxy}
          activeTabIndex={-1}
        />
      </View>
      <SideMenu visible={sideMenuVisible} onClose={handleMenuClose} />
    </>
  );
};

export default RootFooterTabBar;
