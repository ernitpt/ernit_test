import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableWithoutFeedback,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { getAuth, signOut } from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { useAuthGuard } from '../hooks/useAuthGuard';

import SettingsIcon from '../assets/icons/Settings';
import PurchaseIcon from '../assets/icons/PurchaseIcon';
import RedeemIcon from '../assets/icons/Redeem';
import LogoutIcon from '../assets/icons/Logout';
import { LogIn } from 'lucide-react-native';
import LogoutConfirmation from './LogoutConfirmation';
import LoginPrompt from './LoginPrompt';

// Wrapper component to adapt Lucide LogIn icon to MenuItem interface
const LoginIcon: React.FC<{ width?: number; height?: number; color?: string }> = ({ 
  width = 26, 
  height = 26, 
  color = '#7C3AED' 
}) => {
  return <LogIn size={width} color={color} />;
};

type SideMenuProps = {
  visible: boolean;
  onClose: () => void;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: screenWidth } = Dimensions.get('window');

const SideMenu: React.FC<SideMenuProps> = ({ visible, onClose }) => {
  const navigation = useNavigation<NavigationProp>();
  const { state } = useApp();
  const { requireAuth, showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const slideAnim = useRef(new Animated.Value(screenWidth)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  
  const isAuthenticated = !!state.user;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0.5,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: screenWidth,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleMenuPress = async (action: string) => {
    switch (action) {
      case 'Redeem Coupon':
        onClose();
        navigation.navigate('RecipientFlow', { screen: 'CouponEntry' });
        break;

      case 'Purchased Gifts':
        onClose();
        navigation.navigate('PurchasedGifts');
        break;

      case 'Logout':
        if (isAuthenticated) {
          // Show confirmation popup immediately - don't close side menu yet
          setShowLogoutConfirmation(true);
        } else {
          // User not authenticated - show login prompt
          requireAuth('Please log in to access your account.');
        }
        break;

      default:
        onClose();
        console.log(`${action} pressed`);
    }
  };

  const handleLogoutConfirm = async () => {
    // Close side menu when confirming logout
    onClose();
    try {
      const auth = getAuth();
      await signOut(auth);
      
      // Navigate to CategorySelection after successful logout
      navigation.navigate('CategorySelection');
    } catch (error) {
      console.error('Logout failed:', error);
      Alert.alert('Error', 'Failed to log out. Please try again.');
    }
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirmation(false);
    // Keep side menu open when canceling
  };

  // 🔹 Reusable menu item
  const MenuItem: React.FC<{
    Icon: React.FC<{ width?: number; height?: number; color?: string }>;
    title: string;
    onPress: () => void;
    isLast?: boolean;
  }> = ({ Icon, title, onPress, isLast = false }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.menuItem, isLast && { borderBottomWidth: 0 }]}
      activeOpacity={0.8}
    >
      <View style={styles.iconWrapper}>
        <Icon width={26} height={26} color="#7C3AED" />
      </View>
      <Text style={styles.menuTitle}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      {visible && (
        <View style={styles.container}>
          {/* Overlay */}
          <TouchableWithoutFeedback onPress={onClose}>
            <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
          </TouchableWithoutFeedback>

          {/* Sliding panel */}
          <Animated.View
            style={[styles.menuPanel, { transform: [{ translateX: slideAnim }] }]}
          >
            <SafeAreaView style={styles.menuContent}>
              {/* Header */}
              <View style={styles.menuHeader}>
                <Text style={styles.menuHeaderTitle}>Menu</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>×</Text>
                </TouchableOpacity>
              </View>

              {/* Menu list */}
              <View style={styles.menuItemsContainer}>
                {/* <MenuItem
                  Icon={SettingsIcon}
                  title="Settings"
                  onPress={() => handleMenuPress('Settings')}
                /> */}
                <MenuItem
                  Icon={RedeemIcon}
                  title="Redeem Coupon"
                  onPress={() => handleMenuPress('Redeem Coupon')}
                />
                <MenuItem
                  Icon={PurchaseIcon}
                  title="Purchased Gifts"
                  onPress={() => handleMenuPress('Purchased Gifts')}
                />
                <MenuItem
                  Icon={isAuthenticated ? LogoutIcon : LoginIcon}
                  title={isAuthenticated ? "Logout" : "Login"}
                  onPress={() => handleMenuPress('Logout')}
                  isLast
                />
              </View>

              {/* Footer */}
              <View style={styles.menuFooter}>
                <Text style={styles.footerText}>Ernit App v1.0.0</Text>
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      )}

      {/* Logout Confirmation Popup - rendered outside side menu so it's always available */}
      <LogoutConfirmation
        visible={showLogoutConfirmation}
        onClose={handleLogoutCancel}
        onConfirm={handleLogoutConfirm}
      />

      {/* Login Prompt - shown when not authenticated user tries to logout */}
      <LoginPrompt
        visible={showLoginPrompt}
        onClose={closeLoginPrompt}
        message={loginMessage}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  overlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  menuPanel: {
    position: 'absolute',
    right: 0,
    width: 310,
    height: '100%',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
  },
  menuContent: {
    flex: 1,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  menuHeaderTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  closeButton: {
    padding: 6,
  },
  closeButtonText: {
    fontSize: 26,
    color: '#9CA3AF',
  },
  menuItemsContainer: {
    flex: 1,
    paddingVertical: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  iconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 16,
  },
  menuFooter: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  footerText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});

export default SideMenu;
