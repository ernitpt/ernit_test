import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Pressable,
  TouchableWithoutFeedback,
  Modal,
  ScrollView,
  Platform,
  BackHandler,
} from 'react-native';

import Animated2, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { getAuth, signOut } from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { useAuthGuard } from '../context/AuthGuardContext';
import { Avatar } from './Avatar';

import PurchaseIcon from '../assets/icons/PurchaseIcon';
import RedeemIcon from '../assets/icons/Redeem';
import LogoutIcon from '../assets/icons/Logout';
import { LogIn, Download, MessageSquare, LifeBuoy, HelpCircle, Bell, X, ChevronRight, Moon, Globe } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../themes/ThemeContext';
import LogoutConfirmation from './LogoutConfirmation';
import LoginPrompt from './LoginPrompt';
import ContactModal from './ContactModal';
import HowItWorksModal from './HowItWorksModal';
import { logger } from '../utils/logger';
import { DateHelper } from '../utils/DateHelper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, BorderRadius, Shadows, Animations } from '../config';
import { useToast } from '../context/ToastContext';
import { userService } from '../services/userService';
import * as Haptics from 'expo-haptics';

// Wrapper component to adapt Lucide LogIn icon to MenuItem interface
const LoginIcon: React.FC<{ width?: number; height?: number; color?: string }> = ({
  width = 22,
  height = 22,
  color,
}) => {
  const { colors } = useTheme();
  const effectiveColor = color ?? colors.primary;
  return <LogIn size={width} color={effectiveColor} />;
};

type SideMenuProps = {
  visible: boolean;
  onClose: () => void;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: screenWidth } = Dimensions.get('window');

const STAGGER_COUNT = 4;

const MENU_ACTIONS = {
  INSTALL_APP: 'install_app',
  REDEEM: 'redeem_coupon',
  PURCHASED: 'purchased_gifts',
  FEEDBACK: 'feedback',
  SUPPORT: 'support',
  HOW_IT_WORKS: 'how_it_works',
  LOGOUT: 'logout',
} as const;

type SideMenuStyles = ReturnType<typeof createStyles>;

// Section header sub-component
const SectionHeader: React.FC<{ title: string; styles: SideMenuStyles }> = ({ title, styles }) => (
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
  styles: SideMenuStyles;
}> = ({ Icon, title, onPress, showChevron = false, iconColor, textColor, styles }) => {
  const { colors } = useTheme();
  const effectiveIconColor = iconColor ?? colors.primary;
  const effectiveTextColor = textColor ?? colors.textPrimary;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.menuItem}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[styles.iconWrapper, effectiveIconColor === colors.error && styles.iconWrapperDanger]}>
        <Icon width={20} height={20} color={effectiveIconColor} />
      </View>
      <Text style={[styles.menuTitle, { color: effectiveTextColor }]}>{title}</Text>
      {showChevron && (
        <ChevronRight size={18} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
};

const SideMenu: React.FC<SideMenuProps> = ({ visible, onClose }) => {
  const navigation = useNavigation<NavigationProp>();
  const { state, dispatch } = useApp();
  const { requireAuth, showLoginPrompt, loginMessage, closeLoginPrompt } = useAuthGuard();
  const { showError } = useToast();
  const { isDark, toggleTheme, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  const [shouldRender, setShouldRender] = useState(false);
  const [menuReady, setMenuReady] = useState(false);
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

  // Android: close side menu on hardware back button press
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true; // swallow the event
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // Check if app is installed as PWA
  useEffect(() => {
    if (Platform.OS !== 'web') {
      setShowInstallButton(false);
      return;
    }

    const safariNav = window.navigator as Navigator & { standalone?: boolean };
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      safariNav.standalone === true ||
      document.referrer.includes('android-app://');

    setShowInstallButton(!isStandalone);
  }, []);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      setMenuReady(false);
      // Lock body scroll on web to prevent white space on drag
      if (Platform.OS === 'web') {
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
      }
      // Android: use fast timing instead of spring — Pressability cancels
      // onPress when the view-local coords drift during slow spring oscillation.
      // Timing (200ms, ease-out) stabilizes quickly, eliminating the tap delay.
      const slideAnimation = Platform.OS === 'android'
        ? Animated.timing(slideAnim, {
            toValue: 0,
            duration: 200,
            easing: Animations.easing.decelerate,
            useNativeDriver: true,
          })
        : Animated.spring(slideAnim, {
            toValue: 0,
            ...Animations.springs.gentle,
          });

      Animated.parallel([
        slideAnimation,
        Animated.timing(overlayOpacity, {
          toValue: 0.5,
          duration: Platform.OS === 'android' ? 200 : Animations.durations.normal,
          useNativeDriver: true,
        }),
      ]).start(() => setMenuReady(true));

      if (Platform.OS === 'android') {
        // Items/header visible immediately — tap delay fix
        headerAnim.setValue(1);
        itemAnims.forEach(anim => anim.setValue(1));
      } else {
        Animated.spring(headerAnim, {
          toValue: 1,
          delay: 80,
          ...Animations.springs.gentle,
        }).start();
        itemAnims.forEach(anim => anim.setValue(1));
      }
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
      case MENU_ACTIONS.INSTALL_APP:
        onClose();
        // Clear dismissal flag and trigger page reload to show install prompt
        if (Platform.OS === 'web') {
          localStorage.removeItem('pwa-install-dismissed-until');
          // Reload page to trigger install prompt
          window.location.reload();
        }
        break;

      case MENU_ACTIONS.REDEEM:
        onClose();
        navigation.navigate('RecipientFlow', { screen: 'CouponEntry' });
        break;

      case MENU_ACTIONS.PURCHASED:
        onClose();
        navigation.navigate('MainTabs', { screen: 'ProfileTab', params: { screen: 'PurchasedGifts' } });
        break;

      case MENU_ACTIONS.FEEDBACK:
        setContactModalType('feedback');
        setContactModalVisible(true);
        break;

      case MENU_ACTIONS.SUPPORT:
        setContactModalType('support');
        setContactModalVisible(true);
        break;

      case MENU_ACTIONS.HOW_IT_WORKS:
        setHowItWorksVisible(true);
        break;

      case MENU_ACTIONS.LOGOUT:
        if (isAuthenticated) {
          setShowLogoutConfirmation(true);
        } else {
          requireAuth(t('loginPrompt.accessAccount'));
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

      DateHelper.reset();

      const auth = getAuth();
      await signOut(auth);
      dispatch({ type: 'RESET_STATE' });

      navigation.reset({ index: 0, routes: [{ name: 'ChallengeLanding' }] });
    } catch (error: unknown) {
      logger.error('Logout failed:', error);
      showError(t('sideMenu.errors.logoutFailed'));
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
    const newValue = !reminderEnabled;
    setReminderEnabled(newValue);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await userService.updateUserProfile(state.user.id, {
        profile: { ...state.user.profile, reminderEnabled: newValue, timezone },
      });
    } catch (error: unknown) {
      logger.error('Error saving reminder preference:', error);
      setReminderEnabled(!newValue);
    }
  };

  const handleReminderTimeChange = async (time: string) => {
    if (!state.user?.id) return;
    if (!state.user?.profile) return;
    const previousTime = reminderTime;
    setReminderTime(time); // optimistic update
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await userService.updateUserProfile(state.user.id, {
        profile: { ...state.user.profile, reminderTime: time, timezone },
      });
    } catch (error: unknown) {
      setReminderTime(previousTime); // rollback on failure
      showError(t('sideMenu.errors.reminderTimeFailed'));
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

  // Helper to create stagger animated style — opacity only, no translateX
  // (translateX shifts touch targets on Android during native-driven animation,
  // causing taps to miss until the animation completes)
  const staggerStyle = (index: number) => ({
    opacity: itemAnims[index],
  });

  return (
    <>
      {shouldRender && (
        <View style={styles.container} pointerEvents="box-none" accessibilityViewIsModal={true}>
          {/* Overlay — only tappable after open animation finishes */}
          <Pressable onPress={onClose} style={StyleSheet.absoluteFill} pointerEvents={menuReady ? 'auto' : 'none'}>
            <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
          </Pressable>

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
                  accessibilityLabel={t('accessibility.closeMenu')}
                >
                  <X size={20} color={colors.textMuted} />
                </TouchableOpacity>

                {isAuthenticated ? (
                  <TouchableOpacity
                    style={styles.profileSection}
                    activeOpacity={0.7}
                    onPress={() => {
                      onClose();
                      navigation.navigate('MainTabs', { screen: 'ProfileTab', params: { screen: 'Profile' } });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('accessibility.goToProfile')}
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
                    <Text style={styles.brandTagline}>{t('sideMenu.brandTagline')}</Text>
                    <TouchableOpacity
                      onPress={() => handleMenuPress(MENU_ACTIONS.LOGOUT)}
                      style={styles.signInButton}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={t('accessibility.signIn')}
                    >
                      <Text style={styles.signInButtonText}>{t('sideMenu.signIn')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>

              {/* Menu Body */}
              <ScrollView
                style={styles.menuBody}
                contentContainerStyle={styles.menuBodyContent}
                bounces={false}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Install App (standalone, web only) */}
                {showInstallButton && (
                  <Animated.View style={staggerStyle(0)} >
                    <MenuItem
                      Icon={({ width, height, color }) => <Download size={width} color={color} />}
                      title={t('sideMenu.items.installApp')}
                      onPress={() => handleMenuPress(MENU_ACTIONS.INSTALL_APP)}
                      styles={styles}
                    />
                  </Animated.View>
                )}

                {/* Section: Actions */}
                <Animated.View style={staggerStyle(0)} >
                  <SectionHeader title={t('sideMenu.sections.actions')} styles={styles} />
                  <MenuItem
                    Icon={RedeemIcon}
                    title={t('sideMenu.items.redeemCoupon')}
                    onPress={() => handleMenuPress(MENU_ACTIONS.REDEEM)}
                    showChevron
                    styles={styles}
                  />
                  <MenuItem
                    Icon={PurchaseIcon}
                    title={t('sideMenu.items.purchasedGifts')}
                    onPress={() => handleMenuPress(MENU_ACTIONS.PURCHASED)}
                    showChevron
                    styles={styles}
                  />
                </Animated.View>

                {/* Section: Help & Info */}
                <Animated.View style={staggerStyle(1)} >
                  <SectionHeader title={t('sideMenu.sections.helpInfo')} styles={styles} />
                  <MenuItem
                    Icon={({ width, height, color }) => <HelpCircle size={width} color={color} />}
                    title={t('sideMenu.items.howItWorks')}
                    onPress={() => handleMenuPress(MENU_ACTIONS.HOW_IT_WORKS)}
                    styles={styles}
                  />
                  <MenuItem
                    Icon={({ width, height, color }) => <MessageSquare size={width} color={color} />}
                    title={t('sideMenu.items.giveFeedback')}
                    onPress={() => handleMenuPress(MENU_ACTIONS.FEEDBACK)}
                    styles={styles}
                  />
                  <MenuItem
                    Icon={({ width, height, color }) => <LifeBuoy size={width} color={color} />}
                    title={t('sideMenu.items.getSupport')}
                    onPress={() => handleMenuPress(MENU_ACTIONS.SUPPORT)}
                    styles={styles}
                  />
                </Animated.View>

                {/* Section: Settings (auth only) */}
                {isAuthenticated && (
                  <Animated.View style={staggerStyle(2)} >
                    <SectionHeader title={t('sideMenu.sections.settings')} styles={styles} />
                    {/* Dark Mode toggle */}
                    <View style={styles.darkModeRow}>
                      <View style={styles.darkModeLeft}>
                        <View style={styles.iconWrapper}>
                          <Moon size={20} color={colors.primary} />
                        </View>
                        <Text style={styles.menuTitle}>{t('sideMenu.items.darkMode')}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          toggleTheme();
                        }}
                        style={[styles.toggle, isDark && styles.toggleActive]}
                        activeOpacity={0.8}
                        accessibilityRole="switch"
                        accessibilityLabel={t('accessibility.toggleDarkMode')}
                        accessibilityState={{ checked: isDark }}
                      >
                        <View style={[styles.toggleThumb, isDark && styles.toggleThumbActive]} />
                      </TouchableOpacity>
                    </View>
                    {/* Language toggle */}
                    <View style={styles.darkModeRow}>
                      <View style={styles.darkModeLeft}>
                        <View style={styles.iconWrapper}>
                          <Globe size={20} color={colors.primary} />
                        </View>
                        <Text style={styles.menuTitle}>{t('sideMenu.language')}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                        <TouchableOpacity
                          onPress={() => {
                            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setLanguage('en');
                          }}
                          style={{
                            paddingHorizontal: Spacing.md,
                            paddingVertical: Spacing.xs,
                            backgroundColor: language === 'en' ? colors.primary : 'transparent',
                          }}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel="English"
                          accessibilityState={{ selected: language === 'en' }}
                        >
                          <Text style={{
                            ...Typography.caption,
                            fontWeight: '600',
                            color: language === 'en' ? '#FFFFFF' : colors.textSecondary,
                          }}>EN</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setLanguage('pt');
                          }}
                          style={{
                            paddingHorizontal: Spacing.md,
                            paddingVertical: Spacing.xs,
                            backgroundColor: language === 'pt' ? colors.primary : 'transparent',
                          }}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel="Português"
                          accessibilityState={{ selected: language === 'pt' }}
                        >
                          <Text style={{
                            ...Typography.caption,
                            fontWeight: '600',
                            color: language === 'pt' ? '#FFFFFF' : colors.textSecondary,
                          }}>PT</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.reminderSection}>
                      <View style={styles.reminderHeader}>
                        <View style={styles.iconWrapper}>
                          <Bell size={20} color={colors.primary} />
                        </View>
                        <Text style={styles.menuTitle}>{t('sideMenu.items.reminders')}</Text>
                      </View>
                      <View style={styles.reminderRow}>
                        <Text style={styles.reminderLabel}>{t('sideMenu.reminders.sessionReminders')}</Text>
                        <TouchableOpacity
                          onPress={handleReminderToggle}
                          style={[styles.toggle, reminderEnabled && styles.toggleActive]}
                          activeOpacity={0.8}
                          accessibilityRole="switch"
                          accessibilityLabel={t('accessibility.toggleSessionReminders')}
                          accessibilityState={{ checked: reminderEnabled }}
                        >
                          <View style={[styles.toggleThumb, reminderEnabled && styles.toggleThumbActive]} />
                        </TouchableOpacity>
                      </View>
                      {reminderEnabled && (
                        <Animated2.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.reminderRow}>
                          <Text style={styles.reminderLabel}>{t('sideMenu.reminders.remindMeAt')}</Text>
                          <TouchableOpacity
                            onPress={openTimePicker}
                            style={styles.timeChipActive}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={t('accessibility.changeReminderTime', { time: formatTime12h(reminderTime) })}
                          >
                            <Text style={styles.timeChipTextActive}>
                              {formatTime12h(reminderTime)}
                            </Text>
                          </TouchableOpacity>
                        </Animated2.View>
                      )}
                    </View>
                  </Animated.View>
                )}

                {/* Divider */}
                <View style={styles.divider} />

                {/* Login/Logout */}
                <Animated.View style={staggerStyle(3)} >
                  <MenuItem
                    Icon={isAuthenticated ? LogoutIcon : LoginIcon}
                    title={isAuthenticated ? (isLoggingOut ? t('sideMenu.items.loggingOut') : t('sideMenu.items.logout')) : t('sideMenu.items.login')}
                    onPress={isLoggingOut ? () => {} : () => handleMenuPress(MENU_ACTIONS.LOGOUT)}
                    iconColor={isAuthenticated ? colors.error : colors.primary}
                    textColor={isAuthenticated ? (isLoggingOut ? colors.textMuted : colors.error) : colors.primary}
                    styles={styles}
                  />
                </Animated.View>
              </ScrollView>

              {/* Footer */}
              <View style={styles.menuFooter}>
                <Text style={styles.footerText}>{t('sideMenu.footer')}</Text>
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
          <View style={styles.pickerOverlay} accessibilityViewIsModal={true}>
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
                <Text style={styles.pickerTitle}>{t('sideMenu.timePicker.title')}</Text>
                <View style={styles.pickerColumns}>
                  {/* Hour column */}
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerColumnLabel}>{t('sideMenu.timePicker.hourLabel')}</Text>
                    <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                      {Array.from({ length: 24 }, (_, h) => {
                        const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
                        return (
                          <TouchableOpacity
                            key={h}
                            onPress={() => setPickerHour(h)}
                            style={[styles.pickerItem, pickerHour === h && styles.pickerItemActive]}
                            accessibilityLabel={label}
                            accessibilityRole="button"
                            accessibilityState={{ selected: pickerHour === h }}
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
                    <Text style={styles.pickerColumnLabel}>{t('sideMenu.timePicker.minuteLabel')}</Text>
                    <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                      {[0, 15, 30, 45].map((m) => (
                        <TouchableOpacity
                          key={m}
                          onPress={() => setPickerMinute(m)}
                          style={[styles.pickerItem, pickerMinute === m && styles.pickerItemActive]}
                          accessibilityLabel={`:${m.toString().padStart(2, '0')}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: pickerMinute === m }}
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
                  accessibilityLabel={t('accessibility.confirmReminderTime')}
                >
                  <Text style={styles.pickerConfirmText}>{t('sideMenu.timePicker.setTime')}</Text>
                </TouchableOpacity>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
};

const createStyles = (colors: typeof Colors) =>
  StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      zIndex: 9999,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.black,
    },
    menuPanel: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: Math.min(320, screenWidth * 0.85),
      backgroundColor: colors.white,
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
      backgroundColor: colors.surface,
      paddingHorizontal: Spacing.xxl,
      paddingTop: Spacing.xxxl,
      paddingBottom: Spacing.xxl,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    closeButton: {
      position: 'absolute',
      top: Spacing.md,
      right: Spacing.md,
      width: 44,
      height: 44,
      borderRadius: BorderRadius.circle,
      backgroundColor: colors.backgroundLight,
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
      color: colors.textPrimary,
      marginTop: Spacing.md,
    },
    brandSection: {
      alignItems: 'center',
      paddingTop: Spacing.lg,
    },
    brandName: {
      ...Typography.heading1,
      color: colors.textPrimary,
    },
    brandTagline: {
      ...Typography.small,
      color: colors.textSecondary,
      marginTop: Spacing.xs,
    },
    signInButton: {
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.xxl,
      paddingVertical: Spacing.sm,
      marginTop: Spacing.lg,
    },
    signInButtonText: {
      ...Typography.bodyBold,
      color: colors.primary,
    },

    // Menu Body
    menuBody: {
      flex: 1,
      paddingTop: Spacing.sm,
    },
    menuBodyContent: {
      paddingBottom: Spacing.xxl,
    },
    sectionHeader: {
      paddingHorizontal: Spacing.xxl,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.sm,
    },
    sectionHeaderText: {
      ...Typography.tiny,
      color: colors.textMuted,
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
      backgroundColor: colors.primaryTintAlpha40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconWrapperDanger: {
      backgroundColor: colors.errorLight,
    },
    menuTitle: {
      ...Typography.subheading,
      color: colors.textPrimary,
      marginLeft: Spacing.md,
      flex: 1,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: Spacing.xxl,
      marginVertical: Spacing.sm,
    },

    // Footer
    menuFooter: {
      paddingVertical: Spacing.lg,
      paddingHorizontal: Spacing.xxl,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      alignItems: 'center',
    },
    footerText: {
      ...Typography.caption,
      color: colors.textMuted,
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
      color: colors.textSecondary,
      fontWeight: '500',
    },
    toggle: {
      width: 48,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.disabled,
      justifyContent: 'center',
      paddingHorizontal: 2,
    },
    toggleActive: {
      backgroundColor: colors.primary,
    },
    toggleThumb: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.white,
      ...Shadows.sm,
    },
    toggleThumbActive: {
      alignSelf: 'flex-end',
    },
    timeChipActive: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.sm,
      backgroundColor: colors.primarySurface,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    timeChipTextActive: {
      ...Typography.caption,
      fontWeight: '600',
      color: colors.primary,
    },

    // Time Picker Modal
    pickerOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pickerBox: {
      backgroundColor: colors.white,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      width: Math.min(280, screenWidth * 0.82),
      maxHeight: 400,
      ...Shadows.lg,
    },
    pickerTitle: {
      ...Typography.subheading,
      fontWeight: '700',
      color: colors.textPrimary,
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
      color: colors.textMuted,
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
      backgroundColor: colors.primarySurface,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    pickerItemText: {
      ...Typography.small,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    pickerItemTextActive: {
      color: colors.primary,
      fontWeight: '600',
    },
    pickerConfirm: {
      marginTop: Spacing.lg,
      backgroundColor: colors.primary,
      borderRadius: BorderRadius.sm,
      paddingVertical: Spacing.md,
      alignItems: 'center',
    },
    pickerConfirmText: {
      ...Typography.bodyBold,
      color: colors.white,
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

export default React.memo(SideMenu);
