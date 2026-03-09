import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableWithoutFeedback,
  Modal,
  ScrollView,
  Platform,
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
import { LogIn, Download, MessageSquare, LifeBuoy, HelpCircle, Bell } from 'lucide-react-native';
import LogoutConfirmation from './LogoutConfirmation';
import LoginPrompt from './LoginPrompt';
import ContactModal from './ContactModal';
import HowItWorksModal from './HowItWorksModal';
import { logger } from '../utils/logger';
import Colors from '../config/colors';
import { useToast } from '../context/ToastContext';
import { userService } from '../services/userService';

// Wrapper component to adapt Lucide LogIn icon to MenuItem interface
const LoginIcon: React.FC<{ width?: number; height?: number; color?: string }> = ({
  width = 26,
  height = 26,
  color = Colors.primary
}) => {
  return <LogIn size={width} color={color} />;
};

type SideMenuProps = {
  visible: boolean;
  onClose: () => void;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: screenWidth } = Dimensions.get('window');

// Reusable menu item
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
    accessibilityRole="button"
    accessibilityLabel={title}
  >
    <View style={styles.iconWrapper}>
      <Icon width={26} height={26} color={Colors.primary} />
    </View>
    <Text style={styles.menuTitle}>{title}</Text>
  </TouchableOpacity>
);

const SideMenu: React.FC<SideMenuProps> = ({ visible, onClose }) => {
  const navigation = useNavigation<NavigationProp>();
  const { state, dispatch } = useApp();
  const { requireAuth, showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const { showError } = useToast();
  const slideAnim = useRef(new Animated.Value(screenWidth)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [howItWorksVisible, setHowItWorksVisible] = useState(false);
  const [contactModalType, setContactModalType] = useState<'feedback' | 'support'>('feedback');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState('19:00');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerHour, setPickerHour] = useState(19);
  const [pickerMinute, setPickerMinute] = useState(0);

  const isAuthenticated = !!state.user;

  // Format "HH:MM" to display like "7:00 PM"
  const formatTime12h = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
  };

  // Load reminder preferences from user profile
  useEffect(() => {
    if (state.user?.profile) {
      setReminderEnabled(state.user.profile.reminderEnabled ?? true);
      setReminderTime(state.user.profile.reminderTime ?? '19:00');
    }
  }, [state.user?.profile]);

  // Check if app is installed as PWA
  useEffect(() => {
    if (Platform.OS !== 'web') {
      setShowInstallButton(false);
      return;
    }

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone ||
      document.referrer.includes('android-app://');

    setShowInstallButton(!isStandalone);
  }, []);

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
      case 'Install App':
        onClose();
        // Clear dismissal flag and trigger page reload to show install prompt
        if (Platform.OS === 'web') {
          localStorage.removeItem('pwa-install-dismissed-until');
          // Reload page to trigger install prompt
          window.location.reload();
        }
        break;

      case 'Redeem Coupon':
        onClose();
        navigation.navigate('RecipientFlow', { screen: 'CouponEntry' });
        break;

      case 'Purchased Gifts':
        onClose();
        navigation.navigate('PurchasedGifts');
        break;

      case 'Give Feedback':
        setContactModalType('feedback');
        setContactModalVisible(true);
        // Don't close side menu yet - will close when modal opens
        break;

      case 'Get Support':
        setContactModalType('support');
        setContactModalVisible(true);
        // Don't close side menu yet - will close when modal opens
        break;

      case 'How It Works':
        setHowItWorksVisible(true);
        // Don't close side menu yet - will close when modal opens
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
        logger.log(`${action} pressed`);
    }
  };

  const handleLogoutConfirm = async () => {
    // Close side menu when confirming logout
    onClose();
    try {
      const auth = getAuth();
      await signOut(auth);
      dispatch({ type: 'RESET_STATE' });

      // Navigate to CategorySelection after successful logout
      navigation.navigate('CategorySelection');
    } catch (error) {
      logger.error('Logout failed:', error);
      showError('Failed to log out. Please try again.');
    }
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirmation(false);
    // Keep side menu open when canceling
  };

  const handleReminderToggle = async () => {
    if (!state.user?.id) return;
    const newValue = !reminderEnabled;
    setReminderEnabled(newValue);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await userService.updateUserProfile(state.user.id, {
        profile: { ...state.user.profile!, reminderEnabled: newValue, timezone },
      });
    } catch (error) {
      logger.error('Error saving reminder preference:', error);
      setReminderEnabled(!newValue);
    }
  };

  const handleReminderTimeChange = async (time: string) => {
    if (!state.user?.id) return;
    setReminderTime(time);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await userService.updateUserProfile(state.user.id, {
        profile: { ...state.user.profile!, reminderTime: time, timezone },
      });
    } catch (error) {
      logger.error('Error saving reminder time:', error);
    }
  };

  const openTimePicker = () => {
    const [h, m] = reminderTime.split(':').map(Number);
    setPickerHour(h);
    setPickerMinute(m);
    setShowTimePicker(true);
  };

  const confirmTimePicker = () => {
    const time = `${pickerHour.toString().padStart(2, '0')}:${pickerMinute.toString().padStart(2, '0')}`;
    handleReminderTimeChange(time);
    setShowTimePicker(false);
  };

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
                <Text style={styles.menuHeaderTitle} accessibilityRole="header">Menu</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close menu">
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
                {showInstallButton && (
                  <MenuItem
                    Icon={({ width, height, color }) => <Download size={width} color={color} />}
                    title="Install App"
                    onPress={() => handleMenuPress('Install App')}
                  />
                )}
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
                  Icon={({ width, height, color }) => <HelpCircle size={width} color={color} />}
                  title="How It Works"
                  onPress={() => handleMenuPress('How It Works')}
                />
                <MenuItem
                  Icon={({ width, height, color }) => <MessageSquare size={width} color={color} />}
                  title="Give Feedback"
                  onPress={() => handleMenuPress('Give Feedback')}
                />
                <MenuItem
                  Icon={({ width, height, color }) => <LifeBuoy size={width} color={color} />}
                  title="Get Support"
                  onPress={() => handleMenuPress('Get Support')}
                />
                {/* Session Reminders Section */}
                {isAuthenticated && (
                  <View style={styles.reminderSection}>
                    <View style={styles.reminderHeader}>
                      <View style={styles.iconWrapper}>
                        <Bell size={26} color={Colors.primary} />
                      </View>
                      <Text style={styles.menuTitle}>Reminders</Text>
                    </View>
                    <View style={styles.reminderRow}>
                      <Text style={styles.reminderLabel}>Session reminders</Text>
                      <TouchableOpacity
                        onPress={handleReminderToggle}
                        style={[styles.toggle, reminderEnabled && styles.toggleActive]}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.toggleThumb, reminderEnabled && styles.toggleThumbActive]} />
                      </TouchableOpacity>
                    </View>
                    {reminderEnabled && (
                      <View style={styles.reminderRow}>
                        <Text style={styles.reminderLabel}>Remind me at</Text>
                        <TouchableOpacity
                          onPress={openTimePicker}
                          style={styles.timeChipActive}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.timeChipTextActive}>
                            {formatTime12h(reminderTime)}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
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

      {/* How It Works Modal */}
      <HowItWorksModal
        visible={howItWorksVisible}
        onClose={() => {
          setHowItWorksVisible(false);
          onClose(); // Also close side menu
        }}
      />

      {/* Contact Modal - shown for feedback and support */}
      <ContactModal
        visible={contactModalVisible}
        type={contactModalType}
        onClose={() => {
          setContactModalVisible(false);
          onClose(); // Also close side menu
        }}
      />

      {/* Time Picker Popbox */}
      <Modal
        visible={showTimePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowTimePicker(false)}>
          <View style={styles.pickerOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerBox}>
                <Text style={styles.pickerTitle}>Set Reminder Time</Text>
                <View style={styles.pickerColumns}>
                  {/* Hour column */}
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerColumnLabel}>Hour</Text>
                    <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                      {Array.from({ length: 24 }, (_, h) => {
                        const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
                        return (
                          <TouchableOpacity
                            key={h}
                            onPress={() => setPickerHour(h)}
                            style={[styles.pickerItem, pickerHour === h && styles.pickerItemActive]}
                          >
                            <Text style={[styles.pickerItemText, pickerHour === h && styles.pickerItemTextActive]}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                  {/* Minute column */}
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerColumnLabel}>Minute</Text>
                    <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                      {[0, 15, 30, 45].map((m) => (
                        <TouchableOpacity
                          key={m}
                          onPress={() => setPickerMinute(m)}
                          style={[styles.pickerItem, pickerMinute === m && styles.pickerItemActive]}
                        >
                          <Text style={[styles.pickerItemText, pickerMinute === m && styles.pickerItemTextActive]}>
                            :{m.toString().padStart(2, '0')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
                <TouchableOpacity onPress={confirmTimePicker} style={styles.pickerConfirm} activeOpacity={0.8}>
                  <Text style={styles.pickerConfirmText}>Set Time</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    overflow: 'hidden',  // Prevent scrolling beyond bounds
  },
  menuContent: {
    flex: 1,
    overflow: 'hidden',  // Prevent horizontal scrolling in content
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
    backgroundColor: Colors.primarySurface,
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
  // Reminder settings
  reminderSection: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reminderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  reminderLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: Colors.primary,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  timeChipActive: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.primarySurface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  timeChipTextActive: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: 280,
    maxHeight: 400,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 16,
  },
  pickerColumns: {
    flexDirection: 'row',
    gap: 12,
  },
  pickerColumn: {
    flex: 1,
  },
  pickerColumnLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerScroll: {
    maxHeight: 220,
  },
  pickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 4,
  },
  pickerItemActive: {
    backgroundColor: Colors.primarySurface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  pickerItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  pickerItemTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  pickerConfirm: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pickerConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});

export default SideMenu;
