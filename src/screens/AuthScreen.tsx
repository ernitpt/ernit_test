import React, { useState, useEffect, useRef } from 'react';
import { vh } from '../utils/responsive';
import { Colors, useColors } from '../config';
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
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
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


WebBrowser.maybeCompleteAuthSession();

type AuthScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

const AuthScreen = () => {
  const colors = useColors();
  const navigation = useNavigation<AuthScreenNavigationProp>();
  const route = useRoute();
  const { state, dispatch } = useApp();
  const { handleAuthSuccess } = useAuthGuard();
  const { showSuccess, showError, showInfo } = useToast();

  const routeParams = route.params as { mode?: 'signin' | 'signup'; fromModal?: boolean };
  const [isLogin, setIsLogin] = useState(routeParams?.mode !== 'signup');
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  // Success animation
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const successOpacityAnim = useRef(new Animated.Value(0)).current;

  // Input refs for keyboard navigation
  const emailRef = useRef<RNTextInput>(null);
  const passwordRef = useRef<RNTextInput>(null);
  const confirmPasswordRef = useRef<RNTextInput>(null);

  // Timer management for memory leak prevention
  const navTimerRef = useRef<NodeJS.Timeout | null>(null);
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Goals');
    }
  };

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

  // Cleanup navigation timer on unmount
  useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);

  // Cleanup email debounce timer on unmount
  useEffect(() => {
    return () => { clearTimeout(emailCheckTimer.current); };
  }, []);

  // Button press animation handler
  const handleButtonPressIn = () => {
    Animated.parallel([
      Animated.spring(buttonScaleAnim, {
        toValue: 0.96,
        useNativeDriver: true,
        friction: 5,
        tension: 100,
      }),
    ]).start();
  };

  const handleButtonPressOut = () => {
    Animated.parallel([
      Animated.spring(buttonScaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 5,
        tension: 100,
      }),
    ]).start();
  };

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
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  // Password error state for login
  const [passwordError, setPasswordError] = useState('');

  // ? Use makeRedirectUri for proper OAuth configuration
  const redirectUri = makeRedirectUri({
    scheme: 'ernit',
  });

  // ? SECURITY FIX: No fallback - fail if env var missing
  const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

  // Log OAuth config for debugging
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      logger.error('?? CRITICAL: Missing EXPO_PUBLIC_GOOGLE_CLIENT_ID environment variable');
    }
  }, []);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID ?? 'NOT_CONFIGURED',
    webClientId: GOOGLE_CLIENT_ID ?? 'NOT_CONFIGURED', // Fail gracefully instead of crashing
    redirectUri,
  });

  useEffect(() => {
    if (response?.type === 'success') {
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
                logger.log('🎁 Navigating to gift flow after auth');
                const config = JSON.parse(giftData);
                await removeStorageItem('pending_gift_flow');
                navigation.navigate('GiftFlow', { prefill: config });
                return;
              }
            } catch (error) {
              logger.error('Error handling pending gift flow after auth:', error);
              await removeStorageItem('pending_gift_flow').catch(() => {});
              showInfo('Your previous progress could not be restored. Please start again.');
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
            } catch (error) {
              logger.error('Error handling pending challenge after auth:', error);
              await removeStorageItem('pending_free_challenge').catch(() => {});
              showInfo('Your previous progress could not be restored. Please start again.');
            }
            // Default: use auth guard to navigate
            handleAuthSuccess();
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
                showInfo('An account with this email already exists. Both Google and email/password sign-in will be enabled for your account.');
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
                    // Check for pending gift flow
                    try {
                      const giftData = await getStorageItem('pending_gift_flow');
                      if (giftData) {
                        const config = JSON.parse(giftData);
                        await removeStorageItem('pending_gift_flow');
                        navigation.navigate('GiftFlow', { prefill: config });
                        return;
                      }
                    } catch (error) {
                      logger.error('Error handling pending gift flow after auth:', error);
                      await removeStorageItem('pending_gift_flow').catch(() => {});
                      showInfo('Your previous progress could not be restored. Please start again.');
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
                    } catch (error) {
                      logger.error('Error handling pending challenge after auth:', error);
                      await removeStorageItem('pending_free_challenge').catch(() => {});
                      showInfo('Your previous progress could not be restored. Please start again.');
                    }
                    // Default: use auth guard to navigate
                    handleAuthSuccess();
                  }, 1500);
                  return;
                }
              }
            } catch (linkError) {
              logger.error('Account linking error:', linkError);
            }
          }

          await logErrorToFirestore(error, {
            screenName: 'AuthScreen',
            feature: 'GoogleSignIn',
            additionalData: { errorCode: error.code }
          });

          showError('Unable to sign in with Google. Please try again.');
          setIsLoading(false);
        })
        .finally(() => { if (!showSuccessOverlay) setIsLoading(false); });
    } else if (response?.type === 'error') {
      showError('The sign-in process was canceled or failed.');
    }
  }, [response]);

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validatePasswordStrength = (pwd: string) => {
    const checks = {
      minLength: pwd.length >= 8,
      hasUpperCase: /[A-Z]/.test(pwd),
      hasLowerCase: /[a-z]/.test(pwd),
      hasNumber: /[0-9]/.test(pwd),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
    };
    setPasswordChecks(checks);
    return Object.values(checks).every(check => check === true);
  };

  const isPasswordValid = () => {
    return Object.values(passwordChecks).every(check => check === true);
  };

  const checkEmailExists = async (emailToCheck: string) => {
    // fetchSignInMethodsForEmail is deprecated in Firebase Auth v10+.
    // We probe email existence by attempting sign-in with a sentinel password.
    // auth/wrong-password / auth/invalid-credential → account exists
    // auth/user-not-found → no account
    // auth/too-many-requests → rate limited (treat as unknown, don't block signup)
    if (!validateEmail(emailToCheck)) {
      setEmailError('');
      return false;
    }

    setIsCheckingEmail(true);
    try {
      await signInWithEmailAndPassword(auth, emailToCheck, '\x00PROBE_ONLY');
      // Unreachable — any valid sign-in would be unexpected during signup check
      setEmailError('');
      setIsCheckingEmail(false);
      return false;
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      if (
        firebaseError.code === 'auth/wrong-password' ||
        firebaseError.code === 'auth/invalid-credential'
      ) {
        // Account exists with email/password
        setEmailError('Email already in use');
        setIsCheckingEmail(false);
        return true;
      }
      if (firebaseError.code === 'auth/user-not-found') {
        // No account — safe to sign up
        setEmailError('');
        setIsCheckingEmail(false);
        return false;
      }
      if (firebaseError.code === 'auth/too-many-requests') {
        // Rate limited — allow signup to proceed; duplicate will be caught by createUserWithEmailAndPassword
        setEmailError('');
        setIsCheckingEmail(false);
        return false;
      }
      // Other errors (network, invalid-email, etc.) — don't block signup
      setEmailError('');
      setIsCheckingEmail(false);
      return false;
    }
  };

  const handleEmailChange = async (text: string) => {
    const sanitized = sanitizeText(text, 254);
    setEmail(sanitized);
    // Clear email error when user starts typing
    if (emailError) {
      setEmailError('');
    }

    if (sanitized && !isLogin) {
      clearTimeout(emailCheckTimer.current);
      emailCheckTimer.current = setTimeout(() => {
        checkEmailExists(sanitized);
      }, 600);
    }
  };

  const handlePasswordChange = (text: string) => {
    // SECURITY: Never sanitize passwords — they must reach Firebase Auth unmodified
    setPassword(text);
    if (passwordError) {
      setPasswordError('');
    }
    if (!isLogin) {
      validatePasswordStrength(text);
    }
  };

  const handleDisplayNameChange = (text: string) => {
    const sanitized = sanitizeText(text, 30); // Limit username to 30 characters
    setDisplayName(sanitized);
  };

  const handleAuth = async () => {
    const sanitizedEmail = sanitizeText(email, 254);
    const sanitizedDisplayName = sanitizeText(displayName, 30);
    // Passwords must NEVER be modified before being sent to Firebase Auth
    const rawPassword = password;
    const rawConfirmPassword = confirmPassword;

    if (!sanitizedEmail || !rawPassword) {
      showError('Please fill in all fields');
      return;
    }
    if (!validateEmail(sanitizedEmail)) {
      showError('Please enter a valid email address');
      return;
    }

    if (!isLogin) {
      if (!sanitizedDisplayName.trim()) {
        showError('Please enter your name');
        return;
      }
      if (!isPasswordValid()) {
        showError('Password does not meet security requirements');
        return;
      }
      if (rawPassword !== rawConfirmPassword) {
        showError('Passwords do not match');
        return;
      }
      const emailExists = await checkEmailExists(sanitizedEmail);
      if (emailExists) {
        showError('Email already in use');
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
        } catch (verifyError) {
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
        showInfo('A verification email has been sent to ' + sanitizedEmail + '. Please verify your email to secure your account.');
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
        } catch (error) {
          logger.error('Error handling pending gift flow after auth:', error);
          await removeStorageItem('pending_gift_flow').catch(() => {});
          showInfo('Your previous progress could not be restored. Please start again.');
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
        } catch (error) {
          logger.error('Error handling pending challenge after auth:', error);
          await removeStorageItem('pending_free_challenge').catch(() => {});
          showInfo('Your previous progress could not be restored. Please start again.');
        }
        // Check for pending coupon claim code
        try {
          const pendingCode = await getStorageItem('pending_claim_code');
          if (pendingCode) {
            await removeStorageItem('pending_claim_code');
            navigation.navigate('RecipientFlow', { screen: 'CouponEntry', params: { code: pendingCode } });
            return;
          }
        } catch (error) {
          logger.error('Error handling pending claim code after auth:', error);
          await removeStorageItem('pending_claim_code').catch(() => {});
        }
        // Default: use auth guard to navigate
        handleAuthSuccess();
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

      let errorMessage = 'An unexpected error occurred. Please try again.';

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
            errorMessage = 'No account found with this email address.';
            setEmailError(errorMessage);
            break;
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            errorMessage = 'Incorrect email or password. Please check your credentials and try again.';
            setPasswordError('Email or password is incorrect.');
            break;
          case 'auth/invalid-email':
            errorMessage = 'Invalid email address.';
            setEmailError(errorMessage);
            break;
          case 'auth/too-many-requests':
            errorMessage = 'Too many failed attempts. Please try again later or reset your password.';
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
            errorMessage = 'An account with this email already exists.';
            setEmailError(errorMessage);
            break;
          case 'auth/weak-password':
            errorMessage = 'Password is too weak. Please choose a stronger password.';
            setPasswordError(errorMessage);
            break;
          case 'auth/invalid-email':
            errorMessage = 'Invalid email address.';
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
      if (!showSuccessOverlay) {
        setIsLoading(false);
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      showInfo('Please enter your email address first.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, sanitizeText(email, 254));
      showSuccess('A password reset link has been sent to your email. Please check your spam folder.');
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      await logErrorToFirestore(error instanceof Error ? error : new Error('Password reset failed'), {
        screenName: 'AuthScreen',
        feature: 'PasswordReset',
        additionalData: { emailDomain: email.split('@')[1] || 'unknown' }
      });
      let message = 'Failed to send reset email.';
      if (firebaseError.code === 'auth/invalid-email') message = 'Invalid email address.';
      if (firebaseError.code === 'auth/user-not-found') message = 'No account found with that email.';
      showError(message);
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
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingVertical: Spacing.huge }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
          >
            {/* Back Button */}
            <View style={{ position: 'absolute', top: Platform.OS === 'ios' ? vh(50) : vh(20), left: 20, zIndex: 10 }}>
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
                accessibilityLabel="Go back"
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <ChevronLeft color={colors.textPrimary} size={24} />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xxxl, paddingTop: vh(56) }}>

              {/* Logo */}
              <View style={{ marginBottom: Spacing.huge, alignItems: 'center' }}>
                <Image
                  source={require('../assets/icon.png')}
                  style={{
                    width: 120,
                    height: 120,
                    marginBottom: Spacing.xxl,
                  }}
                  resizeMode="contain"
                  accessibilityLabel="Ernit app logo"
                />
                <Text style={{ fontSize: Typography.emoji.fontSize, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: Spacing.lg }}>
                  {isLogin ? 'Welcome Back' : 'Join Ernit'}
                </Text>
                <Text style={{ ...Typography.heading3, color: colors.textSecondary, textAlign: 'center', maxWidth: 280 }}>
                  {isLogin ? 'Sign in to your account below' : 'Create your account to start gifting experiences'}
                </Text>
              </View>

              {/* Form Card */}
              <View style={{ width: '100%', maxWidth: 400 }}>
                <View style={{
                  backgroundColor: colors.surfaceFrosted,
                  borderRadius: BorderRadius.xxl,
                  padding: Spacing.xxl,
                  shadowColor: colors.black,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 12,
                  elevation: 8,
                }}>
                  {/* Google Sign-In Button - Primary Option */}
                  <Button
                    variant="secondary"
                    onPress={() => promptAsync()}
                    disabled={isLoading || !request}
                    fullWidth
                    title="Continue with Google"
                    icon={<Text style={{ ...Typography.subheading, fontWeight: '700', color: colors.googleBlue }}>G</Text>}
                    style={{ marginBottom: Spacing.xl }}
                  />

                  {/* OR Divider */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: Spacing.xl,
                  }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                    <Text style={{ marginHorizontal: Spacing.lg, color: colors.textSecondary, ...Typography.small, fontWeight: '500' }}>or</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                  </View>

                  {!isLogin && (
                    <View style={{ marginBottom: Spacing.xl }}>
                      <TextInput
                        label="Username"
                        placeholder="Username"
                        placeholderTextColor={colors.textMuted}
                        maxLength={50}
                        value={displayName}
                        onChangeText={handleDisplayNameChange}
                        autoCapitalize="words"
                        accessibilityLabel="Username"
                        returnKeyType="next"
                        onSubmitEditing={() => emailRef.current?.focus()}
                      />
                    </View>
                  )}

                  <View style={{ marginBottom: Spacing.xl }}>
                    <RNTextInput
                      ref={emailRef}
                      style={{
                        backgroundColor: colors.surface,
                        borderRadius: BorderRadius.md,
                        paddingHorizontal: Spacing.lg,
                        paddingVertical: Spacing.md,
                        ...Typography.subheading,
                        borderWidth: 1,
                        borderColor: emailError ? colors.error : colors.border,
                      }}
                      placeholder="Email address"
                      placeholderTextColor={colors.textMuted}
                      maxLength={254}
                      value={email}
                      onChangeText={handleEmailChange}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      accessibilityLabel="Email address"
                      returnKeyType="next"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                    />
                    {emailError && (
                      <Text style={{ color: colors.error, ...Typography.caption, marginTop: Spacing.xs, marginLeft: Spacing.xs }}>
                        {emailError}
                      </Text>
                    )}
                    {isCheckingEmail && (
                      <Text style={{ color: colors.textSecondary, ...Typography.caption, marginTop: Spacing.xs, marginLeft: Spacing.xs }}>
                        Checking email...
                      </Text>
                    )}
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
                          borderWidth: 1,
                          borderColor: passwordError ? colors.error : colors.border,
                        }}
                        placeholder="Password"
                        placeholderTextColor={colors.textMuted}
                        maxLength={128}
                        value={password}
                        onChangeText={handlePasswordChange}
                        secureTextEntry={!showPassword}
                        accessibilityLabel="Password"
                        returnKeyType={isLogin ? "done" : "next"}
                        onSubmitEditing={isLogin ? handleAuth : () => confirmPasswordRef.current?.focus()}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={{ position: 'absolute', right: 16, top: '50%', transform: [{ translateY: -12 }] }}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? "Hide password" : "Show password"}
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
                        <Text style={{ ...Typography.caption, fontWeight: '600', color: colors.gray700, marginBottom: Spacing.sm }}>
                          Password Requirements:
                        </Text>
                        <View style={{ gap: Spacing.xs }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {passwordChecks.minLength ? (
                              <Check size={14} color={colors.secondary} style={{ marginRight: Spacing.sm }} />
                            ) : (
                              <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textMuted, marginRight: Spacing.sm }} />
                            )}
                            <Text style={{ ...Typography.caption, color: passwordChecks.minLength ? colors.secondary : colors.textSecondary }}>
                              At least 8 characters
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {passwordChecks.hasUpperCase ? (
                              <Check size={14} color={colors.secondary} style={{ marginRight: Spacing.sm }} />
                            ) : (
                              <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textMuted, marginRight: Spacing.sm }} />
                            )}
                            <Text style={{ ...Typography.caption, color: passwordChecks.hasUpperCase ? colors.secondary : colors.textSecondary }}>
                              One uppercase letter
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {passwordChecks.hasLowerCase ? (
                              <Check size={14} color={colors.secondary} style={{ marginRight: Spacing.sm }} />
                            ) : (
                              <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textMuted, marginRight: Spacing.sm }} />
                            )}
                            <Text style={{ ...Typography.caption, color: passwordChecks.hasLowerCase ? colors.secondary : colors.textSecondary }}>
                              One lowercase letter
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {passwordChecks.hasNumber ? (
                              <Check size={14} color={colors.secondary} style={{ marginRight: Spacing.sm }} />
                            ) : (
                              <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textMuted, marginRight: Spacing.sm }} />
                            )}
                            <Text style={{ ...Typography.caption, color: passwordChecks.hasNumber ? colors.secondary : colors.textSecondary }}>
                              One number
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {passwordChecks.hasSpecialChar ? (
                              <Check size={14} color={colors.secondary} style={{ marginRight: Spacing.sm }} />
                            ) : (
                              <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textMuted, marginRight: Spacing.sm }} />
                            )}
                            <Text style={{ ...Typography.caption, color: passwordChecks.hasSpecialChar ? colors.secondary : colors.textSecondary }}>
                              One special character
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}

                    {isLogin && (
                      <Button
                        variant="ghost"
                        onPress={handlePasswordReset}
                        title="Forgot password?"
                        style={{ alignSelf: 'flex-end', marginTop: Spacing.sm }}
                        textStyle={{ color: colors.primary, ...Typography.small, fontWeight: '500' }}
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
                            borderWidth: 1,
                            borderColor: confirmPassword && password !== confirmPassword ? colors.error : colors.border,
                          }}
                          placeholder="Confirm password"
                          placeholderTextColor={colors.textMuted}
                          maxLength={128}
                          value={confirmPassword}
                          onChangeText={(text) => {
                            // SECURITY: Never sanitize passwords
                            setConfirmPassword(text);
                          }}
                          secureTextEntry={!showConfirmPassword}
                          accessibilityLabel="Confirm password"
                          returnKeyType="done"
                          onSubmitEditing={handleAuth}
                        />
                        <TouchableOpacity
                          onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                          style={{ position: 'absolute', right: 16, top: '50%', transform: [{ translateY: -12 }] }}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
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
                          Passwords do not match
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
                                  fontWeight: '700',
                                  color: colors.white,
                                  textAlign: 'center',
                                  letterSpacing: 0.5,
                                }}
                              >
                                Success!
                              </Text>
                            </Animated.View>
                          ) : isLoading ? (
                            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxs }}>
                              <ActivityIndicator size="small" color={colors.white} />
                            </View>
                          ) : (
                            <Text
                              style={{
                                ...Typography.heading3,
                                fontWeight: '700',
                                color: isButtonDisabled ? colors.textSecondary : colors.white,
                                textAlign: 'center',
                                letterSpacing: 0.5,
                              }}
                            >
                              {isLogin ? 'Sign In' : 'Create Account'}
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
                      setIsCheckingEmail(false);
                      setPasswordChecks({
                        minLength: false,
                        hasUpperCase: false,
                        hasLowerCase: false,
                        hasNumber: false,
                        hasSpecialChar: false,
                      });
                    }}
                    title={isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
                    style={{ alignSelf: 'center' }}
                    textStyle={{ ...Typography.subheading, color: colors.primary, fontWeight: '600' }}
                  />
                </View>
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