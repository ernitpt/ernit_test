import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { vh } from '../utils/responsive';
import { useColors } from '../config';
import { Typography } from '../config/typography';
import { BorderRadius } from '../config/borderRadius';
import { Spacing } from '../config/spacing';
import {
  View,
  Text,
  TextInput as RNTextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react-native';
import { auth } from '../services/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  sendPasswordResetEmail,
  sendEmailVerification,
  getAdditionalUserInfo,
} from 'firebase/auth';
import { sanitizeText } from '../utils/sanitization';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useApp } from '../context/AppContext';
import { useAuthGuard } from '../context/AuthGuardContext';
import { useToast } from '../context/ToastContext';
import { userService } from '../services/userService';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { Check } from 'lucide-react-native';
import { logger } from '../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logErrorToFirestore } from '../utils/errorLogger';
import { analyticsService } from '../services/AnalyticsService';
import { TextInput } from '../components/TextInput';
import Button from '../components/Button';
import { Card } from '../components/Card';


WebBrowser.maybeCompleteAuthSession();

type AuthScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

// Pure function outside component — stable reference, never causes useCallback re-creation
const computePasswordChecks = (pwd: string) => ({
  minLength: pwd.length >= 8,
  hasUpperCase: /[A-Z]/.test(pwd),
  hasLowerCase: /[a-z]/.test(pwd),
  hasNumber: /[0-9]/.test(pwd),
  hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
});

const AuthScreen = () => {
  const { t } = useTranslation();
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AuthScreenNavigationProp>();
  const route = useRoute();
  const { state, dispatch } = useApp();
  const { handleAuthSuccess } = useAuthGuard();
  const { showSuccess, showError, showInfo } = useToast();

  const routeParams = route.params as { mode?: 'signin' | 'signup'; fromModal?: boolean };
  const [isLogin, setIsLogin] = useState(routeParams?.mode !== 'signup');
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const showSuccessOverlayRef = useRef(false);

  // Success animation
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const successOpacityAnim = useRef(new Animated.Value(0)).current;

  // Input refs for keyboard navigation
  const passwordRef = useRef<RNTextInput>(null);
  const confirmPasswordRef = useRef<RNTextInput>(null);

  // Timer management for memory leak prevention
  const navTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('ChallengeLanding');
    }
  }, [navigation]);

  // Button glow animation - pulsing effect
  const buttonGlowAnim = useRef(new Animated.Value(0)).current;

  // Button press animation
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;

  // Button gradient animation - shifts colors
  const buttonGradientAnim = useRef(new Animated.Value(0)).current;

  // Storage helpers (web + native)
  const getStorageItem = async (key: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return localStorage.getItem(key);
    }
    return await AsyncStorage.getItem(key);
  };

  const removeStorageItem = async (key: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      localStorage.removeItem(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  };

  // Helper: Transfer onboarding status from AsyncStorage to Firestore

  useEffect(() => {
    // Animate button glow - slower, more dramatic pulse
    const buttonGlowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(buttonGlowAnim, {
          toValue: 1,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(buttonGlowAnim, {
          toValue: 0,
          duration: 2500,
          useNativeDriver: true,
        }),
      ])
    );
    buttonGlowLoop.start();

    // Animate button gradient colors
    const buttonGradientLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(buttonGradientAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(buttonGradientAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    );
    buttonGradientLoop.start();

    // Clean up on unmount
    return () => {
      buttonGlowLoop.stop();
      buttonGradientLoop.stop();
    };
  }, []);

  // Cleanup navigation timer and mount ref on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isLogin) {
      analyticsService.trackEvent('signup_started', 'conversion', {}, 'AuthScreen');
    }
  }, [isLogin]);


  // Button press animation handler
  const handleButtonPressIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(buttonScaleAnim, {
        toValue: 0.96,
        useNativeDriver: true,
        friction: 5,
        tension: 100,
      }),
    ]).start();
  }, [buttonScaleAnim]);

  const handleButtonPressOut = useCallback(() => {
    Animated.parallel([
      Animated.spring(buttonScaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 5,
        tension: 100,
      }),
    ]).start();
  }, [buttonScaleAnim]);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Password validation state
  const [passwordChecks, setPasswordChecks] = useState({
    minLength: false,
    hasUpperCase: false,
    hasLowerCase: false,
    hasNumber: false,
    hasSpecialChar: false,
  });

  // Email validation state
  const [emailError, setEmailError] = useState('');

  // Password error state for login
  const [passwordError, setPasswordError] = useState('');

  // ? Use makeRedirectUri for proper OAuth configuration
  const redirectUri = makeRedirectUri({
    scheme: 'ernit',
  });

  // ? SECURITY FIX: No fallback - fail if env var missing
  const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

  // Log OAuth config for debugging
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      logger.error('?? CRITICAL: Missing EXPO_PUBLIC_GOOGLE_CLIENT_ID environment variable');
    }
    if (Platform.OS === 'android' && !GOOGLE_ANDROID_CLIENT_ID) {
      logger.warn('?? Missing EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID — Android OAuth may fail');
    }
  }, []);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: Platform.OS === 'android'
      ? (GOOGLE_ANDROID_CLIENT_ID ?? GOOGLE_CLIENT_ID ?? 'NOT_CONFIGURED')
      : (GOOGLE_CLIENT_ID ?? 'NOT_CONFIGURED'),
    webClientId: GOOGLE_CLIENT_ID ?? 'NOT_CONFIGURED',
    redirectUri,
  });

  useEffect(() => {
    if (response?.type !== 'success') {
      if (response?.type === 'error') {
        showError(t('authErrors.googleSignInCanceled'));
      }
      return;
    }

    let mounted = true;

    const handleGoogle = async () => {
      setIsLoading(true);
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);

      signInWithCredential(auth, credential)
        .then(async (userCredential) => {
          const user = userCredential.user;
          const isNewUser = getAdditionalUserInfo(userCredential)?.isNewUser ?? false;

          if (isNewUser) {
            await userService.createUserProfile({
              id: user.uid,
              email: user.email || '',
              displayName: user.displayName || '',
              userType: 'giver',
              createdAt: new Date(),
              wishlist: [],
            });
          }

          const existingUser = await userService.getUserById(user.uid);
          if (existingUser) {
            dispatch({ type: 'SET_USER', payload: existingUser });
          } else {
            // Fallback if Firestore fetch fails — use minimal Firebase Auth data
            dispatch({
              type: 'SET_USER',
              payload: {
                id: user.uid,
                email: user.email || '',
                displayName: user.displayName || '',
                userType: 'giver',
                createdAt: new Date(),
                wishlist: [],
              },
            });
          }

          analyticsService.trackEvent('login_completed', 'conversion', { method: 'google' });

          // Show success animation
          showSuccessOverlayRef.current = true;
          setShowSuccessOverlay(true);
          Animated.parallel([
            Animated.spring(successScaleAnim, {
              toValue: 1,
              friction: 5,
              tension: 40,
              useNativeDriver: true,
            }),
            Animated.timing(successOpacityAnim, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
          ]).start();

          // After success animation, navigate to pending route or default
          navTimerRef.current = setTimeout(async () => {
            if (!isMountedRef.current) return;
            // Check for pending gift flow
            try {
              const giftData = await getStorageItem('pending_gift_flow');
              if (giftData) {
                logger.log('🎁 Navigating to gift flow after auth');
                const config = JSON.parse(giftData);
                await removeStorageItem('pending_gift_flow');
                navigation.navigate('GiftFlow', { prefill: config });
                return;
              }
            } catch (error: unknown) {
              logger.error('Error handling pending gift flow after auth:', error);
              await removeStorageItem('pending_gift_flow').catch(() => {});
              showInfo(t('authErrors.previousProgressLost'));
            }
            // Check for pending free challenge
            try {
              const challengeData = await getStorageItem('pending_free_challenge');
              if (challengeData) {
                logger.log('🏆 Navigating to challenge setup after auth');
                const config = JSON.parse(challengeData);
                await removeStorageItem('pending_free_challenge');
                navigation.navigate('ChallengeSetup', { prefill: config });
                return;
              }
            } catch (error: unknown) {
              logger.error('Error handling pending challenge after auth:', error);
              await removeStorageItem('pending_free_challenge').catch(() => {});
              showInfo(t('authErrors.previousProgressLost'));
            }
            // Navigate directly — bypasses navigationRef which can be null on Android
            navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'GoalsTab', params: { screen: 'Goals' } } }] });
          }, 1500);

        })
        .catch(async (error) => {
          logger.error('Google Sign-In Error:', error);
          analyticsService.trackEvent('login_failed', 'error', { method: 'google', errorCode: error?.code || 'unknown' });

          // ? Handle account linking when email already exists with password provider
          if (error.code === 'auth/account-exists-with-different-credential') {
            try {
              const email = error.customData?.email;
              if (email) {
                // Try signing in with Google credential directly — Firebase handles provider merging
                // Note: fetchSignInMethodsForEmail is deprecated in Firebase Auth v10+
                showInfo(t('authErrors.accountExistsDifferentCredential'));
                {

                  // The account is already linked by Firebase automatically in newer versions
                  // Just sign in with the credential
                  const userCredential = await signInWithCredential(auth, GoogleAuthProvider.credential(response.params.id_token));
                  const user = userCredential.user;

                  const fetchedUser = await userService.getUserById(user.uid);
                  dispatch({
                    type: 'SET_USER',
                    payload: fetchedUser || {
                      id: user.uid,
                      email: user.email || '',
                      displayName: user.displayName || '',
                      userType: 'giver',
                      createdAt: new Date(),
                      wishlist: [],
                    },
                  });

                  showSuccessOverlayRef.current = true;
                  setShowSuccessOverlay(true);
                  Animated.parallel([
                    Animated.spring(successScaleAnim, {
                      toValue: 1,
                      friction: 5,
                      tension: 40,
                      useNativeDriver: true,
                    }),
                    Animated.timing(successOpacityAnim, {
                      toValue: 1,
                      duration: 300,
                      useNativeDriver: true,
                    }),
                  ]).start();

                  navTimerRef.current = setTimeout(async () => {
                    if (!isMountedRef.current) return;
                    // Check for pending gift flow
                    try {
                      const giftData = await getStorageItem('pending_gift_flow');
                      if (giftData) {
                        const config = JSON.parse(giftData);
                        await removeStorageItem('pending_gift_flow');
                        navigation.navigate('GiftFlow', { prefill: config });
                        return;
                      }
                    } catch (error: unknown) {
                      logger.error('Error handling pending gift flow after auth:', error);
                      await removeStorageItem('pending_gift_flow').catch(() => {});
                      showInfo(t('authErrors.previousProgressLost'));
                    }
                    // Check for pending free challenge
                    try {
                      const challengeData = await getStorageItem('pending_free_challenge');
                      if (challengeData) {
                        const config = JSON.parse(challengeData);
                        await removeStorageItem('pending_free_challenge');
                        navigation.navigate('ChallengeSetup', { prefill: config });
                        return;
                      }
                    } catch (error: unknown) {
                      logger.error('Error handling pending challenge after auth:', error);
                      await removeStorageItem('pending_free_challenge').catch(() => {});
                      showInfo(t('authErrors.previousProgressLost'));
                    }
                    // Navigate directly — bypasses navigationRef which can be null on Android
                    navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'GoalsTab', params: { screen: 'Goals' } } }] });
                  }, 1500);
                  return;
                }
              }
            } catch (linkError: unknown) {
              logger.error('Account linking error:', linkError);
            }
          }

          await logErrorToFirestore(error, {
            screenName: 'AuthScreen',
            feature: 'GoogleSignIn',
            additionalData: { errorCode: error.code }
          });

          if (mounted) {
            showError(t('authErrors.googleSignInFailed'));
            setIsLoading(false);
          }
        })
        .finally(() => { if (mounted && !showSuccessOverlayRef.current) setIsLoading(false); });
    };

    handleGoogle();
    return () => { mounted = false; };
  }, [response]);

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validatePasswordStrength = useCallback((pwd: string) => {
    const checks = computePasswordChecks(pwd);
    setPasswordChecks(checks);
    return Object.values(checks).every(check => check === true);
  }, []);

  const isPasswordValid = () => {
    return Object.values(passwordChecks).every(check => check === true);
  };

  // Email existence is checked by createUserWithEmailAndPassword at submit time.
  // The old probe approach (signInWithEmailAndPassword with a dummy password) broke
  // in Firebase Auth v10+ because auth/invalid-credential is now returned for ALL
  // failed sign-ins, making every email appear "already in use."

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleEmailChange = useCallback((text: string) => {
    const sanitized = sanitizeText(text, 254);
    setEmail(sanitized);
    if (sanitized && !EMAIL_REGEX.test(sanitized)) {
      setEmailError(t('authErrors.invalidEmail'));
    } else {
      setEmailError('');
    }
  }, []);

  const handlePasswordChange = useCallback((text: string) => {
    // SECURITY: Never sanitize passwords — they must reach Firebase Auth unmodified
    setPassword(text);
    if (passwordError) {
      setPasswordError('');
    }
    if (!isLogin) {
      validatePasswordStrength(text);
    }
  }, [passwordError, isLogin]);

  const handleDisplayNameChange = useCallback((text: string) => {
    const sanitized = sanitizeText(text, 30); // Limit username to 30 characters
    setDisplayName(sanitized);
  }, []);

  const handleAuth = async () => {
    if (isLoading) return;
    const sanitizedEmail = sanitizeText(email, 254);
    const sanitizedDisplayName = sanitizeText(displayName, 30);
    // Passwords must NEVER be modified before being sent to Firebase Auth
    const rawPassword = password;
    const rawConfirmPassword = confirmPassword;

    if (!sanitizedEmail || !rawPassword) {
      showError(t('authErrors.fillAllFields'));
      return;
    }
    if (!validateEmail(sanitizedEmail)) {
      showError(t('authErrors.invalidEmail'));
      return;
    }

    if (!isLogin) {
      if (!sanitizedDisplayName.trim()) {
        showError(t('authErrors.enterName'));
        return;
      }
      if (!isPasswordValid()) {
        showError(t('authErrors.passwordRequirements'));
        return;
      }
      if (rawPassword !== rawConfirmPassword) {
        showError(t('authErrors.passwordsDoNotMatch'));
        return;
      }
    }

    setIsLoading(true);
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      let userCredential;
      if (isLogin) {
        userCredential = await signInWithEmailAndPassword(auth, sanitizedEmail, rawPassword);
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, sanitizedEmail, rawPassword);
        await updateProfile(userCredential.user, { displayName: sanitizedDisplayName.trim() });

        // ? Send email verification immediately after signup
        try {
          await sendEmailVerification(userCredential.user);
        } catch (verifyError: unknown) {
          logger.error('Error sending verification email:', verifyError);
          // Don't block signup if verification email fails
        }

        await userService.createUserProfile({
          id: userCredential.user.uid,
          email: userCredential.user.email || '',
          displayName: userCredential.user.displayName || sanitizedDisplayName.trim() || '',
          userType: 'giver',
          createdAt: new Date(),
          wishlist: [],
          cart: [],
        });

        // ? Show verification message to user
        showInfo(t('authErrors.verificationEmailSent', { email: sanitizedEmail }));
      }

      const user = userCredential.user;
      const fetchedUser = await userService.getUserById(user.uid);
      if (fetchedUser) {
        dispatch({ type: 'SET_USER', payload: fetchedUser });
      } else {
        // Fallback if Firestore fetch fails — use minimal Firebase Auth data
        dispatch({
          type: 'SET_USER',
          payload: {
            id: user.uid,
            email: user.email || '',
            displayName: user.displayName || sanitizedDisplayName.trim() || undefined,
            userType: 'giver',
            createdAt: new Date(),
            wishlist: [],
            cart: [],
          },
        });
      }

      if (isLogin) {
        analyticsService.trackEvent('login_completed', 'conversion', { method: 'email' });
      } else {
        analyticsService.trackEvent('signup_completed', 'conversion', { method: 'email' });
      }

      // Show success animation
      showSuccessOverlayRef.current = true;
      setShowSuccessOverlay(true);
      Animated.parallel([
        Animated.spring(successScaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(successOpacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // After success animation, navigate to pending route or default
      navTimerRef.current = setTimeout(async () => {
        // Check for pending gift flow
        try {
          const giftData = await getStorageItem('pending_gift_flow');
          if (giftData) {
            const config = JSON.parse(giftData);
            await removeStorageItem('pending_gift_flow');
            navigation.navigate('GiftFlow', { prefill: config });
            return;
          }
        } catch (error: unknown) {
          logger.error('Error handling pending gift flow after auth:', error);
          await removeStorageItem('pending_gift_flow').catch(() => {});
          showInfo(t('authErrors.previousProgressLost'));
        }
        // Check for pending free challenge
        try {
          const challengeData = await getStorageItem('pending_free_challenge');
          if (challengeData) {
            const config = JSON.parse(challengeData);
            await removeStorageItem('pending_free_challenge');
            navigation.navigate('ChallengeSetup', { prefill: config });
            return;
          }
        } catch (error: unknown) {
          logger.error('Error handling pending challenge after auth:', error);
          await removeStorageItem('pending_free_challenge').catch(() => {});
          showInfo(t('authErrors.previousProgressLost'));
        }
        // Check for pending coupon claim code
        try {
          const pendingCode = await getStorageItem('pending_claim_code');
          if (pendingCode) {
            await removeStorageItem('pending_claim_code');
            navigation.navigate('RecipientFlow', { screen: 'CouponEntry', params: { code: pendingCode } });
            return;
          }
        } catch (error: unknown) {
          logger.error('Error handling pending claim code after auth:', error);
          await removeStorageItem('pending_claim_code').catch(() => {});
        }
        // Navigate directly — bypasses navigationRef which can be null on Android
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'GoalsTab', params: { screen: 'Goals' } } }] });
      }, 1500); // Show success for 1.5 seconds

    } catch (error: unknown) {
      logger.error('Auth error:', error);
      const firebaseError = error as { code?: string; message?: string };

      analyticsService.trackEvent('login_failed', 'error', { errorCode: firebaseError.code || 'unknown' });

      // Log for all auth errors except common user mistakes (wrong password, etc)
      if (firebaseError.code !== 'auth/wrong-password' && firebaseError.code !== 'auth/user-not-found' && firebaseError.code !== 'auth/invalid-email') {
        await logErrorToFirestore(error instanceof Error ? error : new Error(firebaseError.message || 'Unknown auth error'), {
          screenName: 'AuthScreen',
          feature: isLogin ? 'Login' : 'Signup',
          additionalData: { emailDomain: sanitizedEmail.split('@')[1] || 'unknown' }
        });
      }

      let errorMessage = t('authErrors.unexpectedError');

      // Clear previous errors
      setEmailError('');
      setPasswordError('');

      // Note: fetchSignInMethodsForEmail is deprecated in Firebase Auth v10+.
      // We rely solely on error codes to determine the appropriate message.
      // auth/wrong-password / auth/invalid-credential → account exists, wrong password
      // auth/user-not-found → no account with this email
      // If the user may have signed up with Google, the standard error messages below guide them.

      // Standard error messages with inline error display
      if (isLogin) {
        switch (firebaseError.code) {
          case 'auth/user-not-found':
            errorMessage = t('authErrors.emailNotFound');
            setEmailError(errorMessage);
            break;
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            errorMessage = t('authErrors.incorrectCredentials');
            setPasswordError(t('authErrors.emailOrPasswordIncorrect'));
            break;
          case 'auth/invalid-email':
            errorMessage = t('authErrors.invalidEmailAddress');
            setEmailError(errorMessage);
            break;
          case 'auth/too-many-requests':
            errorMessage = t('authErrors.tooManyAttempts');
            setPasswordError(errorMessage);
            break;
          default:
            // For other errors, show toast
            showError(errorMessage);
            return;
        }
      } else {
        // Sign up errors
        switch (firebaseError.code) {
          case 'auth/email-already-in-use':
            errorMessage = t('authErrors.emailAlreadyInUse');
            setEmailError(errorMessage);
            break;
          case 'auth/weak-password':
            errorMessage = t('authErrors.weakPassword');
            setPasswordError(errorMessage);
            break;
          case 'auth/invalid-email':
            errorMessage = t('authErrors.invalidEmailAddress');
            setEmailError(errorMessage);
            break;
          default:
            showError(errorMessage);
            return;
        }
      }

      // Show toast for login errors with inline feedback
      if (isLogin) {
        showError(errorMessage);
      }
    } finally {
      // Always reset global context loading state so screens don't get stuck showing a spinner
      dispatch({ type: 'SET_LOADING', payload: false });
      // Only reset local loading state when the success overlay is not shown (overlay handles its own animation)
      if (!showSuccessOverlayRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      showInfo(t('authErrors.enterEmailFirst'));
      return;
    }

    try {
      await sendPasswordResetEmail(auth, sanitizeText(email, 254));
      showSuccess(t('authErrors.passwordResetEmailSent'));
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      await logErrorToFirestore(error instanceof Error ? error : new Error('Password reset failed'), {
        screenName: 'AuthScreen',
        feature: 'PasswordReset',
        additionalData: { emailDomain: email.split('@')[1] || 'unknown', errorCode: firebaseError.code }
      });
      // Prevent email enumeration: for `auth/user-not-found` (and any other account
      // existence signal), show the same success message as a real send. Only reveal
      // a distinct error for syntactic problems (invalid-email) or transport errors
      // that cannot reveal whether the account exists.
      if (firebaseError.code === 'auth/invalid-email') {
        showError(t('authErrors.invalidEmailAddress'));
      } else if (firebaseError.code === 'auth/user-not-found') {
        showSuccess(t('authErrors.passwordResetEmailSent'));
      } else {
        showError(t('authErrors.passwordResetFailed'));
      }
    }
  };



  const isButtonDisabled = isLoading || (!isLogin && (!isPasswordValid() || !!emailError || !displayName.trim() || password !== confirmPassword));

  // Interpolate glow scale and opacity for more dramatic effect
  const glowScale = buttonGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.01],
  });

  const glowOpacity = buttonGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.9],
  });

  return (
    <ErrorBoundary screenName="AuthScreen" userId={state.user?.id}>
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar style="auto" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingVertical: Platform.OS === 'android' ? Spacing.lg : Spacing.huge }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
          >
            {/* Back Button */}
            <View style={{ position: 'absolute', top: insets.top + Spacing.md, left: 20, zIndex: 10 }}>
              <TouchableOpacity
                onPress={handleBack}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: BorderRadius.xl,
                  backgroundColor: colors.backgroundLight,
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: colors.black,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  elevation: 3,
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.goBack')}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <ChevronLeft color={colors.textPrimary} size={24} />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xxxl, paddingTop: Platform.OS === 'android' ? Spacing.xl : vh(56) }}>

              <View style={{ marginBottom: Platform.OS === 'android' ? Spacing.xl : Spacing.huge, alignItems: 'center', marginTop: Platform.OS === 'android' ? 80 + Spacing.lg : 120 + Spacing.xxl }}>
                <Text style={{ ...Typography.displayLarge, color: colors.textPrimary, textAlign: 'center', marginBottom: Spacing.lg }}>
                  {isLogin ? t('auth.welcomeBack') : t('auth.joinErnit')}
                </Text>
                <Text style={{ ...Typography.heading3, color: colors.textSecondary, textAlign: 'center', maxWidth: 280 }}>
                  {isLogin ? t('auth.signInSubtitle') : t('auth.signUpSubtitle')}
                </Text>
              </View>

              {/* Form Card */}
              <View style={{ width: '100%', maxWidth: Math.min(400, screenWidth - 40) }}>
                <Card variant="glassmorphism" noPadding style={{ padding: Spacing.xxl }}>
                  {/* Google Sign-In Button - Primary Option */}
                  <Button
                    variant="secondary"
                    onPress={() => promptAsync()}
                    disabled={isLoading || !request}
                    fullWidth
                    title={t('auth.continueWithGoogle')}
                    icon={<Text style={{ ...Typography.heading3, color: colors.googleBlue }}>G</Text>}
                    style={{ marginBottom: Spacing.xl }}
                  />

                  {/* OR Divider */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: Spacing.xl,
                  }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                    <Text style={{ marginHorizontal: Spacing.lg, color: colors.textSecondary, ...Typography.smallMedium }}>{t('auth.orDivider')}</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                  </View>

                  {!isLogin && (
                    <View style={{ marginBottom: Spacing.xl }}>
                      <TextInput
                        label={t('auth.fields.username')}
                        placeholder={t('auth.fields.username')}
                        placeholderTextColor={colors.textMuted}
                        maxLength={50}
                        value={displayName}
                        onChangeText={handleDisplayNameChange}
                        autoCapitalize="words"
                        accessibilityLabel={t('auth.fields.username')}
                        returnKeyType="next"
                        onSubmitEditing={() => passwordRef.current?.focus()}
                      />
                    </View>
                  )}

                  <View style={{ marginBottom: Spacing.xl }}>
                    <TextInput
                      label={t('auth.fields.emailAddress')}
                      placeholder={t('auth.fields.emailAddress')}
                      placeholderTextColor={colors.textMuted}
                      maxLength={254}
                      value={email}
                      onChangeText={handleEmailChange}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      accessibilityLabel={t('auth.fields.emailAddress')}
                      returnKeyType="next"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      error={emailError || undefined}
                    />
                  </View>

                  <View style={{ marginBottom: Spacing.lg }}>
                    <View style={{ position: 'relative' }}>
                      <RNTextInput
                        ref={passwordRef}
                        style={{
                          backgroundColor: colors.surface,
                          borderRadius: BorderRadius.md,
                          paddingHorizontal: Spacing.lg,
                          paddingVertical: Spacing.md,
                          paddingRight: vh(60),
                          ...Typography.subheading,
                          color: colors.textPrimary,
                          borderWidth: 1,
                          borderColor: passwordError ? colors.error : colors.border,
                        }}
                        placeholder={t('auth.fields.password')}
                        placeholderTextColor={colors.textMuted}
                        maxLength={128}
                        value={password}
                        onChangeText={handlePasswordChange}
                        secureTextEntry={!showPassword}
                        accessibilityLabel={t('auth.fields.password')}
                        returnKeyType={isLogin ? "done" : "next"}
                        onSubmitEditing={isLogin ? handleAuth : () => confirmPasswordRef.current?.focus()}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={{ position: 'absolute', right: 16, top: '50%', transform: [{ translateY: -12 }] }}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                      >
                        {showPassword ? (
                          <EyeOff size={20} color={colors.textMuted} />
                        ) : (
                          <Eye size={20} color={colors.textMuted} />
                        )}
                      </TouchableOpacity>
                    </View>
                    {passwordError && (
                      <Text style={{ color: colors.error, ...Typography.caption, marginTop: Spacing.xs, marginLeft: Spacing.xs }}>
                        {passwordError}
                      </Text>
                    )}

                    {!isLogin && password.length > 0 && (
                      <View style={{ marginTop: Spacing.md, padding: Spacing.md, backgroundColor: colors.backgroundLight, borderRadius: BorderRadius.sm }}>
                        <Text style={{ ...Typography.captionBold, color: colors.gray700, marginBottom: Spacing.sm }}>
                          {t('auth.passwordRequirements.title')}
                        </Text>
                        <View style={{ gap: Spacing.xs }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {passwordChecks.minLength ? (
                              <Check size={14} color={colors.secondary} style={{ marginRight: Spacing.sm }} />
                            ) : (
                              <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textMuted, marginRight: Spacing.sm }} />
                            )}
                            <Text style={{ ...Typography.caption, color: passwordChecks.minLength ? colors.secondary : colors.textSecondary }}>
                              {t('auth.passwordRequirements.minLength')}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {passwordChecks.hasUpperCase ? (
                              <Check size={14} color={colors.secondary} style={{ marginRight: Spacing.sm }} />
                            ) : (
                              <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textMuted, marginRight: Spacing.sm }} />
                            )}
                            <Text style={{ ...Typography.caption, color: passwordChecks.hasUpperCase ? colors.secondary : colors.textSecondary }}>
                              {t('auth.passwordRequirements.uppercase')}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {passwordChecks.hasLowerCase ? (
                              <Check size={14} color={colors.secondary} style={{ marginRight: Spacing.sm }} />
                            ) : (
                              <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textMuted, marginRight: Spacing.sm }} />
                            )}
                            <Text style={{ ...Typography.caption, color: passwordChecks.hasLowerCase ? colors.secondary : colors.textSecondary }}>
                              {t('auth.passwordRequirements.lowercase')}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {passwordChecks.hasNumber ? (
                              <Check size={14} color={colors.secondary} style={{ marginRight: Spacing.sm }} />
                            ) : (
                              <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textMuted, marginRight: Spacing.sm }} />
                            )}
                            <Text style={{ ...Typography.caption, color: passwordChecks.hasNumber ? colors.secondary : colors.textSecondary }}>
                              {t('auth.passwordRequirements.number')}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {passwordChecks.hasSpecialChar ? (
                              <Check size={14} color={colors.secondary} style={{ marginRight: Spacing.sm }} />
                            ) : (
                              <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textMuted, marginRight: Spacing.sm }} />
                            )}
                            <Text style={{ ...Typography.caption, color: passwordChecks.hasSpecialChar ? colors.secondary : colors.textSecondary }}>
                              {t('auth.passwordRequirements.specialChar')}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}

                    {isLogin && (
                      <Button
                        variant="ghost"
                        onPress={handlePasswordReset}
                        title={t('auth.forgotPassword')}
                        style={{ alignSelf: 'flex-end', marginTop: Spacing.sm }}
                        textStyle={{ color: colors.primary, ...Typography.smallMedium }}
                      />
                    )}
                  </View>

                  {!isLogin && (
                    <View style={{ marginBottom: Spacing.xl }}>
                      <View style={{ position: 'relative' }}>
                        <RNTextInput
                          ref={confirmPasswordRef}
                          style={{
                            backgroundColor: colors.surface,
                            borderRadius: BorderRadius.md,
                            paddingHorizontal: Spacing.lg,
                            paddingVertical: Spacing.md,
                            paddingRight: vh(60),
                            ...Typography.subheading,
                            color: colors.textPrimary,
                            borderWidth: 1,
                            borderColor: confirmPassword && password !== confirmPassword ? colors.error : colors.border,
                          }}
                          placeholder={t('auth.fields.confirmPassword')}
                          placeholderTextColor={colors.textMuted}
                          maxLength={128}
                          value={confirmPassword}
                          onChangeText={(text) => {
                            // SECURITY: Never sanitize passwords
                            setConfirmPassword(text);
                          }}
                          secureTextEntry={!showConfirmPassword}
                          accessibilityLabel={t('auth.fields.confirmPassword')}
                          returnKeyType="done"
                          onSubmitEditing={handleAuth}
                        />
                        <TouchableOpacity
                          onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                          style={{ position: 'absolute', right: 16, top: '50%', transform: [{ translateY: -12 }] }}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={showConfirmPassword ? t('auth.hideConfirmPassword') : t('auth.showConfirmPassword')}
                        >
                          {showConfirmPassword ? (
                            <EyeOff size={20} color={colors.textMuted} />
                          ) : (
                            <Eye size={20} color={colors.textMuted} />
                          )}
                        </TouchableOpacity>
                      </View>
                      {confirmPassword && password !== confirmPassword && (
                        <Text style={{ color: colors.error, ...Typography.caption, marginTop: Spacing.xs, marginLeft: Spacing.xs }}>
                          {t('authErrors.passwordsDoNotMatch')}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Glowing Animated Button */}
                  <Animated.View
                    style={{
                      marginBottom: Spacing.lg,
                      transform: [{ scale: buttonScaleAnim }],
                    }}
                  >
                    <View style={{ position: 'relative' }}>
                      {/* Outer glow layers - multiple for more depth */}
                      {!isButtonDisabled && (
                        <>
                          {/* Middle glow */}
                          <Animated.View
                            style={{
                              position: 'absolute',
                              top: -6,
                              left: -6,
                              right: -6,
                              bottom: -6,
                              borderRadius: BorderRadius.xl,
                              opacity: buttonGlowAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.6, 1],
                              }),
                            }}
                          >
                            <LinearGradient
                              colors={[colors.primary + 'CC', colors.primaryDark + 'CC']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={{ flex: 1, borderRadius: BorderRadius.xl }}
                            />
                          </Animated.View>
                        </>
                      )}

                      {/* Actual button with animated gradient */}
                      <TouchableOpacity
                        onPress={handleAuth}
                        onPressIn={handleButtonPressIn}
                        onPressOut={handleButtonPressOut}
                        disabled={isButtonDisabled}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel={isLogin ? "Sign in to your account" : "Create your account"}
                      >
                        <LinearGradient
                          colors={isButtonDisabled ? [colors.gray300, colors.gray300] : colors.gradientTriple}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={{
                            borderRadius: BorderRadius.md,
                            paddingVertical: Spacing.lg,
                            shadowColor: isButtonDisabled ? colors.black : colors.primary,
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: isButtonDisabled ? 0.1 : 0.5,
                            shadowRadius: 16,
                            elevation: isButtonDisabled ? 2 : 12,
                          }}
                        >
                          {showSuccessOverlay ? (
                            <Animated.View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: Spacing.sm,
                                opacity: successOpacityAnim,
                                transform: [{ scale: successScaleAnim }],
                              }}
                            >
                              <Check color={colors.white} size={20} strokeWidth={3} />
                              <Text
                                style={{
                                  ...Typography.heading3,
                                  color: colors.white,
                                  textAlign: 'center',
                                  letterSpacing: 0.5,
                                }}
                              >
                                {t('auth.buttons.success')}
                              </Text>
                            </Animated.View>
                          ) : isLoading ? (
                            <Text
                              style={{
                                ...Typography.heading3,
                                color: colors.white,
                                textAlign: 'center',
                                letterSpacing: 0.5,
                              }}
                            >
                              {isLogin ? t('auth.buttons.signingIn') : t('auth.buttons.creatingAccount')}
                            </Text>
                          ) : (
                            <Text
                              style={{
                                ...Typography.heading3,
                                color: isButtonDisabled ? colors.textSecondary : colors.white,
                                textAlign: 'center',
                                letterSpacing: 0.5,
                              }}
                            >
                              {isLogin ? t('auth.buttons.signIn') : t('auth.buttons.createAccount')}
                            </Text>
                          )}
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </Animated.View>

                  {/* Toggle between Sign In / Sign Up */}
                  <Button
                    variant="ghost"
                    onPress={() => {
                      setIsLogin(!isLogin);
                      // Clear all form fields and errors when switching modes
                      setEmail('');
                      setPassword('');
                      setConfirmPassword('');
                      setDisplayName('');
                      setEmailError('');
                      setPasswordError('');
                      setPasswordChecks({
                        minLength: false,
                        hasUpperCase: false,
                        hasLowerCase: false,
                        hasNumber: false,
                        hasSpecialChar: false,
                      });
                    }}
                    title={isLogin ? t('auth.toggleSignUp') : t('auth.toggleSignIn')}
                    style={{ alignSelf: 'center' }}
                    textStyle={{ ...Typography.smallMedium, color: colors.primary }}
                  />
                </Card>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>


      </SafeAreaView>
    </View>
    </ErrorBoundary>
  );
};

export default AuthScreen;