import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  LayoutAnimation,
  TouchableWithoutFeedback,
  Modal,
  ScrollView,
  Platform,
  UIManager,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { getAuth, signOut } from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { Avatar } from './Avatar';

import PurchaseIcon from '../assets/icons/PurchaseIcon';
import RedeemIcon from '../assets/icons/Redeem';
import LogoutIcon from '../assets/icons/Logout';
import { LogIn, Download, MessageSquare, LifeBuoy, HelpCircle, Bell, X, ChevronRight, Moon } from 'lucide-react-native';
import { useTheme } from '../themes/ThemeContext';
import LogoutConfirmation from './LogoutConfirmation';
import LoginPrompt from './LoginPrompt';
import ContactModal from './ContactModal';
import HowItWorksModal from './HowItWorksModal';
import { logger } from '../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, BorderRadius, Shadows, Animations } from '../config';
import { useToast } from '../context/ToastContext';
import { userService } from '../services/userService';
import * as Haptics from 'expo-haptics';

// Wrapper component to adapt Lucide LogIn icon to MenuItem interface
const LoginIcon: React.FC<{ width?: number; height?: number; color?: string }> = ({
  width = 22,
  height = 22,
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

const STAGGER_COUNT = 4;

// Section header sub-component
const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <View style={styles.sectionHeader} accessibilityRole="header">
    <Text style={styles.sectionHeaderText}>{title}</Text>
  </View>
);

// Reusable menu item
const MenuItem: React.FC<{
  Icon: React.FC<{ width?: number; height?: number; color?: string }>;
  title: string;
  onPress: () => void;
  showChevron?: boolean;
  iconColor?: string;
  textColor?: string;
}> = ({ Icon, title, onPress, showChevron = false, iconColor = Colors.primary, textColor = Colors.textPrimary }) => (
  <TouchableOpacity
    onPress={onPress}
    style={styles.menuItem}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityLabel={title}
  >
    <View style={[styles.iconWrapper, iconColor === Colors.error && styles.iconWrapperDanger]}>
      <Icon width={20} height={20} color={iconColor} />
    </View>
    <Text style={[styles.menuTitle, { color: textColor }]}>{title}</Text>
    {showChevron && (
      <ChevronRight size={18} color={Colors.textMuted} />
    )}
  </TouchableOpacity>
);

const SideMenu: React.FC<SideMenuProps> = ({ visible, onClose }) => {
  const navigation = useNavigation<NavigationProp>();
  const { state, dispatch } = useApp();
  const { requireAuth, showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const { showError } = useToast();
  const { isDark, toggleTheme } = useTheme();
  const [shouldRender, setShouldRender] = useState(false);
  const slideAnim = useRef(new Animated.Value(screenWidth)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef(
    Array.from({ length: STAGGER_COUNT }, () => new Animated.Value(0))
  ).current;
  const headerAnim = useRef(new Animated.Value(0)).current;
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [howItWorksVisible, setHowItWorksVisible] = useState(false);
  const [contactModalType, setContactModalType] = useState<'feedback' | 'support'>('feedback');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState('19:00');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerHour, setPickerHour] = useState(19);
  const [pickerMinute, setPickerMinute] = useState(0);
  const pickerAnim = useRef(new Animated.Value(0)).current;

  const isAuthenticated = !!state.user;
  const displayName = state.user?.displayName || state.user?.profile?.name || 'User';
  const profileImageUrl = state.user?.profile?.profileImageUrl;

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
      setShouldRender(true);
      // Lock body scroll on web to prevent white space on drag
      if (Platform.OS === 'web') {
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
      }
      // Open: spring panel + fade overlay + stagger sections
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          ...Animations.springs.gentle,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0.5,
          duration: Animations.durations.normal,
          useNativeDriver: true,
        }),
      ]).start();

      // Header fade in with slight delay
      Animated.spring(headerAnim, {
        toValue: 1,
        delay: 80,
        ...Animations.springs.gentle,
      }).start();

      // Stagger section groups
      Animated.stagger(
        60,
        itemAnims.map(anim =>
          Animated.spring(anim, {
            toValue: 1,
            ...Animations.springs.snappy,
          })
        )
      ).start();
    } else {
      // Close: fade out items + header, slide panel out, fade overlay
      Animated.parallel([
        Animated.timing(headerAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        ...itemAnims.map(anim =>
          Animated.timing(anim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          })
        ),
        Animated.timing(slideAnim, {
          toValue: screenWidth,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShouldRender(false);
        // Unlock body scroll on web
        if (Platform.OS === 'web') {
          document.body.style.overflow = '';
          document.documentElement.style.overflow = '';
        }
      });
    }

    return () => {
      if (Platform.OS === 'web') {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      }
    };
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
        break;

      case 'Get Support':
        setContactModalType('support');
        setContactModalVisible(true);
        break;

      case 'How It Works':
        setHowItWorksVisible(true);
        break;

      case 'Logout':
        if (isAuthenticated) {
          setShowLogoutConfirmation(true);
        } else {
          requireAuth('Please log in to access your account.');
        }
        break;

      default:
        onClose();
        logger.log(`${action} pressed`);
    }
  };

  const handleLogoutConfirm = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    onClose();
    try {
      try { await AsyncStorage.removeItem('global_timer_state'); } catch {}

      const auth = getAuth();
      await signOut(auth);
      dispatch({ type: 'RESET_STATE' });

      navigation.navigate('CategorySelection');
    } catch (error) {
      logger.error('Logout failed:', error);
      showError('Failed to log out. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirmation(false);
  };

  const handleReminderToggle = async () => {
    if (!state.user?.id) return;
    if (!state.user?.profile) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newValue = !reminderEnabled;
    setReminderEnabled(newValue);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await userService.updateUserProfile(state.user.id, {
        profile: { ...state.user.profile, reminderEnabled: newValue, timezone },
      });
    } catch (error) {
      logger.error('Error saving reminder preference:', error);
      setReminderEnabled(!newValue);
    }
  };

  const handleReminderTimeChange = async (time: string) => {
    if (!state.user?.id) return;
    if (!state.user?.profile) return;
    setReminderTime(time);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await userService.updateUserProfile(state.user.id, {
        profile: { ...state.user.profile, reminderTime: time, timezone },
      });
    } catch (error) {
      logger.error('Error saving reminder time:', error);
    }
  };

  useEffect(() => {
    if (showTimePicker) {
      pickerAnim.setValue(0);
      Animated.spring(pickerAnim, {
        toValue: 1,
        tension: 65,
        friction: 10,
        useNativeDriver: true,
      }).start();
    }
  }, [showTimePicker, pickerAnim]);

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

  // Helper to create stagger animated style
  const staggerStyle = (index: number) => ({
    opacity: itemAnims[index],
    transform: [{
      translateX: itemAnims[index].interpolate({
        inputRange: [0, 1],
        outputRange: [30, 0],
      }),
    }],
  });

  return (
    <>
      {shouldRender && (
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
              {/* Profile Header */}
              <Animated.View style={[styles.header, { opacity: headerAnim }]}>
                {/* Close button */}
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeButton}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Close menu"
                >
                  <X size={20} color={Colors.textMuted} />
                </TouchableOpacity>

                {isAuthenticated ? (
                  <TouchableOpacity
                    style={styles.profileSection}
                    activeOpacity={0.7}
                    onPress={() => {
                      onClose();
                      navigation.navigate('Profile');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Go to profile"
                  >
                    <Avatar
                      size="lg"
                      uri={profileImageUrl}
                      name={displayName}
                    />
                    <Text style={styles.profileName}>{displayName}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.brandSection}>
                    <Text style={styles.brandName}>Ernit</Text>
                    <Text style={styles.brandTagline}>Experiences worth giving</Text>
                    <TouchableOpacity
                      onPress={() => handleMenuPress('Logout')}
                      style={styles.signInButton}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Sign in"
                    >
                      <Text style={styles.signInButtonText}>Sign In</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>

              {/* Menu Body */}
              <ScrollView
                style={styles.menuBody}
                bounces={false}
                showsVerticalScrollIndicator={false}
              >
                {/* Install App (standalone, web only) */}
                {showInstallButton && (
                  <Animated.View style={staggerStyle(0)}>
                    <MenuItem
                      Icon={({ width, height, color }) => <Download size={width} color={color} />}
                      title="Install App"
                      onPress={() => handleMenuPress('Install App')}
                    />
                  </Animated.View>
                )}

                {/* Section: Actions */}
                <Animated.View style={staggerStyle(0)}>
                  <SectionHeader title="ACTIONS" />
                  <MenuItem
                    Icon={RedeemIcon}
                    title="Redeem Coupon"
                    onPress={() => handleMenuPress('Redeem Coupon')}
                    showChevron
                  />
                  <MenuItem
                    Icon={PurchaseIcon}
                    title="Purchased Gifts"
                    onPress={() => handleMenuPress('Purchased Gifts')}
                    showChevron
                  />
                </Animated.View>

                {/* Section: Help & Info */}
                <Animated.View style={staggerStyle(1)}>
                  <SectionHeader title="HELP & INFO" />
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
                </Animated.View>

                {/* Section: Settings (auth only) */}
                {isAuthenticated && (
                  <Animated.View style={staggerStyle(2)}>
                    <SectionHeader title="SETTINGS" />
                    {/* Dark Mode toggle */}
                    <View style={styles.darkModeRow}>
                      <View style={styles.darkModeLeft}>
                        <View style={styles.iconWrapper}>
                          <Moon size={20} color={Colors.primary} />
                        </View>
                        <Text style={styles.menuTitle}>Dark Mode</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          toggleTheme();
                        }}
                        style={[styles.toggle, isDark && styles.toggleActive]}
                        activeOpacity={0.8}
                        accessibilityRole="switch"
                        accessibilityLabel="Toggle dark mode"
                        accessibilityState={{ checked: isDark }}
                      >
                        <View style={[styles.toggleThumb, isDark && styles.toggleThumbActive]} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.reminderSection}>
                      <View style={styles.reminderHeader}>
                        <View style={styles.iconWrapper}>
                          <Bell size={20} color={Colors.primary} />
                        </View>
                        <Text style={styles.menuTitle}>Reminders</Text>
                      </View>
                      <View style={styles.reminderRow}>
                        <Text style={styles.reminderLabel}>Session reminders</Text>
                        <TouchableOpacity
                          onPress={handleReminderToggle}
                          style={[styles.toggle, reminderEnabled && styles.toggleActive]}
                          activeOpacity={0.8}
                          accessibilityRole="switch"
                          accessibilityLabel="Toggle session reminders"
                          accessibilityState={{ checked: reminderEnabled }}
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
                            accessibilityRole="button"
                            accessibilityLabel={`Change reminder time, currently ${formatTime12h(reminderTime)}`}
                          >
                            <Text style={styles.timeChipTextActive}>
                              {formatTime12h(reminderTime)}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </Animated.View>
                )}

                {/* Divider */}
                <View style={styles.divider} />

                {/* Login/Logout */}
                <Animated.View style={staggerStyle(3)}>
                  <MenuItem
                    Icon={isAuthenticated ? LogoutIcon : LoginIcon}
                    title={isAuthenticated ? (isLoggingOut ? 'Logging out…' : 'Logout') : 'Login'}
                    onPress={isLoggingOut ? () => {} : () => handleMenuPress('Logout')}
                    iconColor={isAuthenticated ? Colors.error : Colors.primary}
                    textColor={isAuthenticated ? (isLoggingOut ? Colors.textMuted : Colors.error) : Colors.primary}
                  />
                </Animated.View>
              </ScrollView>

              {/* Footer */}
              <View style={styles.menuFooter}>
                <Text style={styles.footerText}>Ernit App v1.0.0</Text>
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      )}

      {/* Logout Confirmation Popup */}
      <LogoutConfirmation
        visible={showLogoutConfirmation}
        onClose={handleLogoutCancel}
        onConfirm={handleLogoutConfirm}
      />

      {/* Login Prompt */}
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
          onClose();
        }}
      />

      {/* Contact Modal */}
      <ContactModal
        visible={contactModalVisible}
        type={contactModalType}
        onClose={() => {
          setContactModalVisible(false);
          onClose();
        }}
      />

      {/* Time Picker Modal */}
      <Modal
        visible={showTimePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowTimePicker(false)}>
          <View style={styles.pickerOverlay}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.pickerBox,
                  {
                    opacity: pickerAnim,
                    transform: [{
                      scale: pickerAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.9, 1],
                      }),
                    }],
                  },
                ]}
              >
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
                <TouchableOpacity
                  onPress={confirmTimePicker}
                  style={styles.pickerConfirm}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm reminder time"
                >
                  <Text style={styles.pickerConfirmText}>Set Time</Text>
                </TouchableOpacity>
              </Animated.View>
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
    zIndex: 9999,
    overflow: 'hidden',
  },
  overlay: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  menuPanel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: Math.min(320, screenWidth * 0.85),
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xxl,
    borderBottomLeftRadius: BorderRadius.xxl,
    overflow: 'hidden',
    ...Shadows.lg,
  },
  menuContent: {
    flex: 1,
    overflow: 'hidden',
  },

  // Header
  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.xxl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeButton: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 44,
    height: 44,
    borderRadius: BorderRadius.circle,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  profileSection: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  profileName: {
    ...Typography.heading3,
    color: Colors.textPrimary,
    marginTop: Spacing.md,
  },
  brandSection: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
  },
  brandName: {
    ...Typography.heading1,
    color: Colors.textPrimary,
  },
  brandTagline: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  signInButton: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.lg,
  },
  signInButtonText: {
    ...Typography.bodyBold,
    color: Colors.primary,
  },

  // Menu Body
  menuBody: {
    flex: 1,
    paddingTop: Spacing.sm,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  sectionHeaderText: {
    ...Typography.tiny,
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primaryTintAlpha40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapperDanger: {
    backgroundColor: Colors.errorLight,
  },
  menuTitle: {
    ...Typography.subheading,
    color: Colors.textPrimary,
    marginLeft: Spacing.md,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.xxl,
    marginVertical: Spacing.sm,
  },

  // Footer
  menuFooter: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'center',
  },
  footerText: {
    ...Typography.caption,
    color: Colors.textMuted,
  },

  // Reminder settings
  reminderSection: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.sm,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  reminderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  reminderLabel: {
    ...Typography.small,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  toggle: {
    width: 48,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.disabled,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: Colors.primary,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.white,
    ...Shadows.sm,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  timeChipActive: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primarySurface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  timeChipTextActive: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.primary,
  },

  // Time Picker Modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerBox: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: 280,
    maxHeight: 400,
    ...Shadows.lg,
  },
  pickerTitle: {
    ...Typography.subheading,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  pickerColumns: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  pickerColumn: {
    flex: 1,
  },
  pickerColumnLabel: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerScroll: {
    maxHeight: 220,
  },
  pickerItem: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  pickerItemActive: {
    backgroundColor: Colors.primarySurface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  pickerItemText: {
    ...Typography.small,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  pickerItemTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  pickerConfirm: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  pickerConfirmText: {
    ...Typography.bodyBold,
    color: Colors.white,
  },

  // Dark mode toggle row
  darkModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
  },
  darkModeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
});

export default SideMenu;
