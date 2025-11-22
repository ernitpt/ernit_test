import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Animated,
  StyleSheet,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { ChevronLeft } from 'lucide-react-native';
import { auth } from '../services/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  sendEmailVerification,
} from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { useAuthGuard } from '../context/AuthGuardContext';
import { userService } from '../services/userService';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { Check } from 'lucide-react-native';


WebBrowser.maybeCompleteAuthSession();

type AuthScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

const AuthScreen = () => {
  const navigation = useNavigation<AuthScreenNavigationProp>();
  const route = useRoute();
  const { dispatch } = useApp();
  const { handleAuthSuccess } = useAuthGuard();

  const routeParams = route.params as { mode?: 'signin' | 'signup'; fromModal?: boolean };
  const [isLogin, setIsLogin] = useState(routeParams?.mode !== 'signup');
  const [showSuccess, setShowSuccess] = useState(false);

  // Success animation
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const successOpacityAnim = useRef(new Animated.Value(0)).current;

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('CategorySelection');
    }
  };

  // Animated gradient for background
  const gradientAnim = useRef(new Animated.Value(0)).current;

  // Button glow animation - pulsing effect
  const buttonGlowAnim = useRef(new Animated.Value(0)).current;

  // Button press animation
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;

  // Card glow animation
  const cardGlowAnim = useRef(new Animated.Value(0)).current;

  // Button gradient animation - shifts colors
  const buttonGradientAnim = useRef(new Animated.Value(0)).current;

  // Helper: Transfer onboarding status from AsyncStorage to Firestore
  const transferOnboardingStatus = async (userId: string) => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const hasSeenOnboarding = await AsyncStorage.getItem('hasSeenOnboarding');

      if (hasSeenOnboarding === 'true') {
        console.log('✅ Transferring onboarding status from AsyncStorage to Firestore');
        await userService.updateOnboardingStatus(userId, 'completed');
      } else {
        console.log('🎯 No onboarding status in AsyncStorage - keeping Firestore default');
      }
    } catch (error) {
      console.error('Error transferring onboarding status:', error);
    }
  };

  useEffect(() => {
    // Animate background gradient
    Animated.loop(
      Animated.sequence([
        Animated.timing(gradientAnim, {
          toValue: 1,
          duration: 15000,
          useNativeDriver: true,
        }),
        Animated.timing(gradientAnim, {
          toValue: 0,
          duration: 15000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Animate button glow - slower, more dramatic pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(buttonGlowAnim, {
          toValue: 1,
          duration: 2500,
          useNativeDriver: false,
        }),
        Animated.timing(buttonGlowAnim, {
          toValue: 0,
          duration: 2500,
          useNativeDriver: false,
        }),
      ])
    ).start();

    // Animate card glow
    Animated.loop(
      Animated.sequence([
        Animated.timing(cardGlowAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(cardGlowAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Animate button gradient colors
    Animated.loop(
      Animated.sequence([
        Animated.timing(buttonGradientAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: false,
        }),
        Animated.timing(buttonGradientAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: false,
        }),
      ])
    ).start();
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

  // Google sign-in warning modal state
  // const [showGoogleWarning, setShowGoogleWarning] = useState(false);
  // const [verificationEmail, setVerificationEmail] = useState('');
  // const [isSendingVerification, setIsSendingVerification] = useState(false);

  // ✅ Use makeRedirectUri for proper OAuth configuration
  const redirectUri = makeRedirectUri({
    scheme: 'ernit',
  });

  // ✅ Use environment variable for Google Client ID
  const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "806487127981-ob9oap6pvjhpm4leik8qjt8e994jeckt.apps.googleusercontent.com";

  // Log OAuth config for debugging
  useEffect(() => {
    console.log('🔐 Google OAuth Configuration:');
    console.log('  Client ID:', GOOGLE_CLIENT_ID?.substring(0, 30) + '...');
    console.log('  Redirect URI:', redirectUri);
    console.log('  ⚠️  Add this URI to Google Console Authorized redirect URIs');
  }, []);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
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
          const isNewUser = user.metadata.creationTime === user.metadata.lastSignInTime;

          if (isNewUser) {
            await userService.createUserProfile({
              id: user.uid,
              email: user.email || '',
              displayName: user.displayName || '',
              userType: 'giver',
              createdAt: new Date(),
              wishlist: [],
            });

            // ✅ Transfer onboarding status from AsyncStorage to Firestore
            await transferOnboardingStatus(user.uid);
          }

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

          // Show success animation
          setShowSuccess(true);
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
          setTimeout(() => {
            handleAuthSuccess();
          }, 1500);

        })
        .catch(async (error) => {
          console.error('Google Sign-In Error:', error);

          // ✅ Handle account linking when email already exists with password provider
          if (error.code === 'auth/account-exists-with-different-credential') {
            try {
              const email = error.customData?.email;
              if (email) {
                // Check existing sign-in methods
                const methods = await fetchSignInMethodsForEmail(auth, email);
                console.log('Existing sign-in methods for', email, ':', methods);

                if (methods.includes('password')) {
                  Alert.alert(
                    'Account Linking',
                    'An account with this email already exists. Both Google and email/password sign-in will be enabled for your account.',
                    [{ text: 'OK' }]
                  );

                  // The account is already linked by Firebase automatically in newer versions
                  // Just sign in with the credential
                  const userCredential = await signInWithCredential(auth, GoogleAuthProvider.credential(response.params.id_token));
                  const user = userCredential.user;

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

                  setShowSuccess(true);
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

                  setTimeout(() => {
                    handleAuthSuccess();
                  }, 1500);
                  return;
                }
              }
            } catch (linkError) {
              console.error('Account linking error:', linkError);
            }
          }

          Alert.alert('Google Sign-In Failed', 'Unable to sign in with Google. Please try again.');
          setIsLoading(false);
        });
    } else if (response?.type === 'error') {
      Alert.alert('Google Sign-In Canceled', 'The sign-in process was canceled or failed.');
    }
  }, [response]);

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  /**
   * ✅ Comprehensive input sanitization
   * Removes HTML tags, limits length, handles special characters
   */
  const sanitizeInput = (input: string, maxLength: number = 500): string => {
    if (!input) return '';

    let sanitized = input.trim();

    // Remove HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');

    // Remove potentially dangerous characters
    sanitized = sanitized.replace(/[<>\"'`]/g, '');

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ');

    // Limit length
    sanitized = sanitized.substring(0, maxLength);

    return sanitized;
  };

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
    if (!validateEmail(emailToCheck)) {
      setEmailError('');
      return false;
    }

    setIsCheckingEmail(true);
    try {
      const methods = await fetchSignInMethodsForEmail(auth, emailToCheck);
      if (methods.length > 0) {
        setEmailError('Email already in use');
        setIsCheckingEmail(false);
        return true;
      }
      setEmailError('');
      setIsCheckingEmail(false);
      return false;
    } catch (error: any) {
      if (error.code !== 'auth/email-already-in-use') {
        setEmailError('');
      }
      setIsCheckingEmail(false);
      return false;
    }
  };

  const handleEmailChange = async (text: string) => {
    const sanitized = sanitizeInput(text);
    setEmail(sanitized);
    // Clear email error when user starts typing
    if (emailError) {
      setEmailError('');
    }

    if (sanitized && !isLogin) {
      await checkEmailExists(sanitized);
    }
  };

  const handlePasswordChange = (text: string) => {
    const sanitized = sanitizeInput(text);
    setPassword(sanitized);
    // Clear password error when user starts typing
    if (passwordError) {
      setPasswordError('');
    }
    if (!isLogin) {
      validatePasswordStrength(sanitized);
    }
  };

  const handleDisplayNameChange = (text: string) => {
    const sanitized = sanitizeInput(text);
    setDisplayName(sanitized);
  };

  const handleAuth = async () => {
    const sanitizedEmail = sanitizeInput(email);
    const sanitizedPassword = sanitizeInput(password);
    const sanitizedDisplayName = sanitizeInput(displayName);
    const sanitizedConfirmPassword = sanitizeInput(confirmPassword);

    if (!sanitizedEmail || !sanitizedPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (!validateEmail(sanitizedEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (!isLogin) {
      if (!sanitizedDisplayName.trim()) {
        Alert.alert('Error', 'Please enter your name');
        return;
      }
      if (!isPasswordValid()) {
        Alert.alert('Error', 'Password does not meet security requirements');
        return;
      }
      if (sanitizedPassword !== sanitizedConfirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
      const emailExists = await checkEmailExists(sanitizedEmail);
      if (emailExists) {
        Alert.alert('Error', 'Email already in use');
        return;
      }
    }

    setIsLoading(true);
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      let userCredential;
      if (isLogin) {
        userCredential = await signInWithEmailAndPassword(auth, sanitizedEmail, sanitizedPassword);
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, sanitizedEmail, sanitizedPassword);
        await updateProfile(userCredential.user, { displayName: sanitizedDisplayName.trim() });

        // ✅ Send email verification immediately after signup
        try {
          await sendEmailVerification(userCredential.user);
          console.log('✅ Verification email sent to:', sanitizedEmail);
        } catch (verifyError) {
          console.error('Error sending verification email:', verifyError);
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

        // ✅ Transfer onboarding status from AsyncStorage to Firestore
        await transferOnboardingStatus(userCredential.user.uid);

        // ✅ Show verification message to user
        Alert.alert(
          'Account Created!',
          'A verification email has been sent to ' + sanitizedEmail + '. Please verify your email to secure your account.',
          [{ text: 'OK' }]
        );
      }

      const user = userCredential.user;
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

      // Show success animation
      setShowSuccess(true);
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
      setTimeout(() => {
        handleAuthSuccess();
      }, 1500); // Show success for 1.5 seconds

    } catch (error: any) {
      console.error('Auth error:', error);
      let errorMessage = 'An unexpected error occurred. Please try again.';

      // Clear previous errors
      setEmailError('');
      setPasswordError('');

      // Check if this is a multi-provider issue
      if (isLogin && (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential')) {
        try {
          // Check what sign-in methods are available for this email
          const methods = await fetchSignInMethodsForEmail(auth, sanitizedEmail);
          console.log('Available sign-in methods:', methods);

          if (methods.includes('google.com') && !methods.includes('password')) {
            errorMessage = 'This email is registered with Google Sign-In. Please use the "Continue with Google" button to sign in.';
            setEmailError(errorMessage);
            Alert.alert('Sign In Method Mismatch', errorMessage);
            setIsLoading(false);
            dispatch({ type: 'SET_LOADING', payload: false });
            return;
          } else if (methods.includes('google.com') && methods.includes('password')) {
            errorMessage = 'This account has multiple sign-in methods. You can sign in with either email/password or Google.';
          }
        } catch (fetchError) {
          console.error('Error fetching sign-in methods:', fetchError);
        }
      }

      // Standard error messages with inline error display
      if (isLogin) {
        switch (error.code) {
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
            // For other errors, show in alert
            Alert.alert('Sign In Failed', errorMessage);
            return;
        }
      } else {
        // Sign up errors
        switch (error.code) {
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
            Alert.alert('Sign Up Failed', errorMessage);
            return;
        }
      }

      // Show alert for login errors with inline feedback
      if (isLogin) {
        Alert.alert('Sign In Failed', errorMessage);
      }
    } finally {
      if (!showSuccess) {
        setIsLoading(false);
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      Alert.alert('Reset Password', 'Please enter your email address first.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert('Email Sent', 'A password reset link has been sent to your email. Please check your spam folder.');
    } catch (error: any) {
      let message = 'Failed to send reset email.';
      if (error.code === 'auth/invalid-email') message = 'Invalid email address.';
      if (error.code === 'auth/user-not-found') message = 'No account found with that email.';
      Alert.alert('Error', message);
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

  const cardGlowOpacity = cardGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 0.35],
  });

  return (
    <View style={{ flex: 1 }}>
      {/* Base gradient */}
      <LinearGradient
        colors={['#7C3AED', '#3B82F6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Animated overlay gradient */}
      <Animated.View
        style={{
          flex: 1,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: gradientAnim,
        }}
      >
        <LinearGradient
          colors={['#9333EA', '#2563EB', '#3B82F6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        />
      </Animated.View>

      <SafeAreaView style={{ flex: 1, zIndex: 1, backgroundColor: 'transparent' }}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingVertical: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Back Button */}
            <View style={{ position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 20, zIndex: 10 }}>
              <TouchableOpacity
                onPress={handleBack}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  elevation: 3,
                }}
                activeOpacity={0.7}
              >
                <ChevronLeft color="white" size={24} />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingTop: 60 }}>

              {/* Logo */}
              <View style={{ marginBottom: 40, alignItems: 'center' }}>
                <Image
                  source={require('../assets/icon.png')}
                  style={{
                    width: 120,
                    height: 120,
                    marginBottom: 24,
                  }}
                  resizeMode="contain"
                />
                <Text style={{ fontSize: 48, fontWeight: 'bold', color: 'white', textAlign: 'center', marginBottom: 16 }}>
                  {isLogin ? 'Welcome Back' : 'Join Ernit'}
                </Text>
                <Text style={{ fontSize: 18, color: '#E9D5FF', textAlign: 'center', maxWidth: 280 }}>
                  {isLogin ? 'Sign in to your account below' : 'Create your account to start gifting experiences'}
                </Text>
              </View>

              {/* Form - Wrapped in card with animated glow */}
              <View style={{ width: '100%', maxWidth: 400, position: 'relative' }}>
                {/* Animated glow background for card */}
                <Animated.View
                  style={{
                    position: 'absolute',
                    top: -10,
                    left: -10,
                    right: -10,
                    bottom: -10,
                    borderRadius: 34,
                    opacity: cardGlowOpacity,
                  }}
                >
                  <LinearGradient
                    colors={['#7C3AED', '#3B82F6', '#9333EA']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ flex: 1, borderRadius: 34 }}
                  />
                </Animated.View>

                <View style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: 24,
                  padding: 24,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 12,
                  elevation: 8,
                }}>
                  {/* Google Sign-In Button - Primary Option */}
                  <TouchableOpacity
                    onPress={() => promptAsync()}
                    disabled={isLoading || !request}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'white',
                      borderRadius: 12,
                      paddingVertical: 14,
                      marginBottom: 20,
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 4,
                      elevation: 2,
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{
                      width: 20,
                      height: 20,
                      marginRight: 12,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#4285F4' }}>G</Text>
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#374151' }}>
                      Continue with Google
                    </Text>
                  </TouchableOpacity>

                  {/* OR Divider */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 20,
                  }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
                    <Text style={{ marginHorizontal: 16, color: '#6B7280', fontSize: 14, fontWeight: '500' }}>or</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
                  </View>

                  {!isLogin && (
                    <View style={{ marginBottom: 20 }}>
                      <TextInput
                        style={{
                          backgroundColor: '#F9FAFB',
                          borderRadius: 12,
                          paddingHorizontal: 16,
                          paddingVertical: 14,
                          fontSize: 16,
                          borderWidth: 1,
                          borderColor: '#E5E7EB',
                        }}
                        placeholder="Username"
                        placeholderTextColor="#9CA3AF"
                        value={displayName}
                        onChangeText={handleDisplayNameChange}
                        autoCapitalize="words"
                      />
                    </View>
                  )}

                  <View style={{ marginBottom: 20 }}>
                    <TextInput
                      style={{
                        backgroundColor: '#F9FAFB',
                        borderRadius: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        fontSize: 16,
                        borderWidth: 1,
                        borderColor: emailError ? '#EF4444' : '#E5E7EB',
                      }}
                      placeholder="Email address"
                      placeholderTextColor="#9CA3AF"
                      value={email}
                      onChangeText={handleEmailChange}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                    {emailError && (
                      <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4, marginLeft: 4 }}>
                        {emailError}
                      </Text>
                    )}
                    {isCheckingEmail && (
                      <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 4, marginLeft: 4 }}>
                        Checking email...
                      </Text>
                    )}
                  </View>

                  <View style={{ marginBottom: 16 }}>
                    <View style={{ position: 'relative' }}>
                      <TextInput
                        style={{
                          backgroundColor: '#F9FAFB',
                          borderRadius: 12,
                          paddingHorizontal: 16,
                          paddingVertical: 14,
                          paddingRight: 80,
                          fontSize: 16,
                          borderWidth: 1,
                          borderColor: passwordError ? '#EF4444' : '#E5E7EB',
                        }}
                        placeholder="Password"
                        placeholderTextColor="#9CA3AF"
                        value={password}
                        onChangeText={handlePasswordChange}
                        secureTextEntry={!showPassword}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={{ position: 'absolute', right: 16, top: '50%', transform: [{ translateY: -10 }] }}
                      >
                        <Text style={{ color: '#7C3AED', fontWeight: '600', fontSize: 14 }}>
                          {showPassword ? 'Hide' : 'Show'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {passwordError && (
                      <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4, marginLeft: 4 }}>
                        {passwordError}
                      </Text>
                    )}

                    {!isLogin && password.length > 0 && (
                      <View style={{ marginTop: 12, padding: 12, backgroundColor: '#F3F4F6', borderRadius: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8 }}>
                          Password Requirements:
                        </Text>
                        <View style={{ gap: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ fontSize: 14, marginRight: 8 }}>
                              {passwordChecks.minLength ? '✔' : '✖'}
                            </Text>
                            <Text style={{ fontSize: 12, color: passwordChecks.minLength ? '#10B981' : '#6B7280' }}>
                              At least 8 characters
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ fontSize: 14, marginRight: 8 }}>
                              {passwordChecks.hasUpperCase ? '✔' : '✖'}
                            </Text>
                            <Text style={{ fontSize: 12, color: passwordChecks.hasUpperCase ? '#10B981' : '#6B7280' }}>
                              One uppercase letter
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ fontSize: 14, marginRight: 8 }}>
                              {passwordChecks.hasLowerCase ? '✔' : '✖'}
                            </Text>
                            <Text style={{ fontSize: 12, color: passwordChecks.hasLowerCase ? '#10B981' : '#6B7280' }}>
                              One lowercase letter
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ fontSize: 14, marginRight: 8 }}>
                              {passwordChecks.hasNumber ? '✔' : '✖'}
                            </Text>
                            <Text style={{ fontSize: 12, color: passwordChecks.hasNumber ? '#10B981' : '#6B7280' }}>
                              One number
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ fontSize: 14, marginRight: 8 }}>
                              {passwordChecks.hasSpecialChar ? '✔' : '✖'}
                            </Text>
                            <Text style={{ fontSize: 12, color: passwordChecks.hasSpecialChar ? '#10B981' : '#6B7280' }}>
                              One special character
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}

                    {isLogin && (
                      <TouchableOpacity onPress={handlePasswordReset} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
                        <Text style={{ color: '#7C3AED', fontSize: 14, fontWeight: '500' }}>Forgot password?</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {!isLogin && (
                    <View style={{ marginBottom: 20 }}>
                      <View style={{ position: 'relative' }}>
                        <TextInput
                          style={{
                            backgroundColor: '#F9FAFB',
                            borderRadius: 12,
                            paddingHorizontal: 16,
                            paddingVertical: 14,
                            paddingRight: 80,
                            fontSize: 16,
                            borderWidth: 1,
                            borderColor: confirmPassword && password !== confirmPassword ? '#EF4444' : '#E5E7EB',
                          }}
                          placeholder="Confirm password"
                          placeholderTextColor="#9CA3AF"
                          value={confirmPassword}
                          onChangeText={(text) => {
                            const sanitized = sanitizeInput(text);
                            setConfirmPassword(sanitized);
                          }}
                          secureTextEntry={!showConfirmPassword}
                        />
                        <TouchableOpacity
                          onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                          style={{ position: 'absolute', right: 16, top: '50%', transform: [{ translateY: -10 }] }}
                        >
                          <Text style={{ color: '#7C3AED', fontWeight: '600', fontSize: 14 }}>
                            {showConfirmPassword ? 'Hide' : 'Show'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {confirmPassword && password !== confirmPassword && (
                        <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4, marginLeft: 4 }}>
                          Passwords do not match
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Glowing Animated Button */}
                  <Animated.View
                    style={{
                      marginBottom: 16,
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
                              borderRadius: 18,
                              opacity: buttonGlowAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.6, 1],
                              }),
                            }}
                          >
                            <LinearGradient
                              colors={['rgba(124, 58, 237, 0.8)', 'rgba(147, 51, 234, 0.8)']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={{ flex: 1, borderRadius: 18 }}
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
                      >
                        <LinearGradient
                          colors={isButtonDisabled ? ['#D1D5DB', '#D1D5DB'] : ['#7C3AED', '#9333EA', '#7C3AED']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={{
                            borderRadius: 12,
                            paddingVertical: 16,
                            shadowColor: isButtonDisabled ? '#000' : '#7C3AED',
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: isButtonDisabled ? 0.1 : 0.5,
                            shadowRadius: 16,
                            elevation: isButtonDisabled ? 2 : 12,
                          }}
                        >
                          {showSuccess ? (
                            <Animated.View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                opacity: successOpacityAnim,
                                transform: [{ scale: successScaleAnim }],
                              }}
                            >
                              <Check color="white" size={20} strokeWidth={3} />
                              <Text
                                style={{
                                  fontSize: 18,
                                  fontWeight: 'bold',
                                  color: 'white',
                                  textAlign: 'center',
                                  letterSpacing: 0.5,
                                }}
                              >
                                Success!
                              </Text>
                            </Animated.View>
                          ) : (
                            <Text
                              style={{
                                fontSize: 18,
                                fontWeight: 'bold',
                                color: isButtonDisabled ? '#6B7280' : 'white',
                                textAlign: 'center',
                                letterSpacing: 0.5,
                              }}
                            >
                              {isLoading ? 'Loading...' : isLogin ? 'Sign In' : 'Create Account'}
                            </Text>
                          )}
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </Animated.View>

                  {/* Toggle between Sign In / Sign Up */}
                  <TouchableOpacity
                    onPress={() => {
                      setIsLogin(!isLogin);
                      // Clear errors when switching modes
                      setEmailError('');
                      setPasswordError('');
                    }}
                    style={{ alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 16, color: '#7C3AED', fontWeight: '600' }}>
                      {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>


      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  animatedGradientWeb: {},
});

export default AuthScreen; 