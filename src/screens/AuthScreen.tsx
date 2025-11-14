import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { auth } from '../services/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { userService } from '../services/userService';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { sendPasswordResetEmail } from 'firebase/auth';


WebBrowser.maybeCompleteAuthSession();

type AuthScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

const AuthScreen = () => {
  const navigation = useNavigation<AuthScreenNavigationProp>();
  const route = useRoute();
  const { dispatch } = useApp();

  const routeParams = route.params as { mode?: 'signin' | 'signup' };
  const [isLogin, setIsLogin] = useState(routeParams?.mode !== 'signup');

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const redirectUri = "https://auth.expo.io/@ernit/ernit";
  // const redirectUri = makeRedirectUri()

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: "806487127981-ob9oap6pvjhpm4leik8qjt8e994jeckt.apps.googleusercontent.com",
    redirectUri,
  });
  // ✅ Handle Google login (sign in or sign up automatically)
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

        })
        .catch((error) => {
          console.error('Google Sign-In Error:', error);
          Alert.alert('Google Sign-In Failed', 'Unable to sign in with Google. Please try again.');
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (response?.type === 'error') {
      Alert.alert('Google Sign-In Canceled', 'The sign-in process was canceled or failed.');
    }
  }, [response]);

  // --- Email/password logic ---
  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePassword = (password: string) => password.length >= 6;

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (!validateEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    if (!validatePassword(password)) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }
    if (!isLogin) {
      if (!displayName.trim()) {
        Alert.alert('Error', 'Please enter your name');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
    }

    setIsLoading(true);
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      let userCredential;
      if (isLogin) {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: displayName.trim() });

        await userService.createUserProfile({
          id: userCredential.user.uid,
          email: userCredential.user.email || '',
          displayName: userCredential.user.displayName || displayName.trim(),
          userType: 'giver',
          createdAt: new Date(),
          wishlist: [],
          cart: [],
        });
      }

      const user = userCredential.user;
      dispatch({
        type: 'SET_USER',
        payload: {
          id: user.uid,
          email: user.email || '',
          displayName: user.displayName || displayName.trim() || undefined,
          userType: 'giver',
          createdAt: new Date(),
          wishlist: [],
          cart: [],
        },
      });

    } catch (error: any) {
      let errorMessage = 'An unexpected error occurred. Please try again.';
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email address.';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password. Please try again.';
          break;
        case 'auth/email-already-in-use':
          errorMessage = 'An account with this email already exists.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password is too weak. Please choose a stronger password.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later.';
          break;
      }
      Alert.alert(isLogin ? 'Sign In Failed' : 'Sign Up Failed', errorMessage);
    } finally {
      setIsLoading(false);
      dispatch({ type: 'SET_LOADING', payload: false });
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


  return (
    <LinearGradient colors={['#7C3AED', '#3B82F6']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
              
              {/* Header */}
              <View style={{ marginBottom: 48, alignItems: 'center' }}>
                <Text style={{ fontSize: 48, fontWeight: 'bold', color: 'white', textAlign: 'center', marginBottom: 16 }}>
                  {isLogin ? 'Welcome Back' : 'Join Ernit'}
                </Text>
                <Text style={{ fontSize: 18, color: '#E9D5FF', textAlign: 'center', maxWidth: 280 }}>
                  {isLogin ? 'Sign in to your account below' : 'Create your account to start gifting experiences'}
                </Text>
              </View>

              {/* Form */}
              <View style={{ width: '100%', maxWidth: 400 }}>
                {!isLogin && (
                  <View style={{ marginBottom: 20 }}>
                    <TextInput
                      style={{
                        backgroundColor: 'white',
                        borderRadius: 16,
                        paddingHorizontal: 20,
                        paddingVertical: 16,
                        fontSize: 16,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 8,
                        elevation: 3,
                      }}
                      placeholder="Full name"
                      placeholderTextColor="#9CA3AF"
                      value={displayName}
                      onChangeText={setDisplayName}
                      autoCapitalize="words"
                    />
                  </View>
                )}

                <View style={{ marginBottom: 20 }}>
                  <TextInput
                    style={{
                      backgroundColor: 'white',
                      borderRadius: 16,
                      paddingHorizontal: 20,
                      paddingVertical: 16,
                      fontSize: 16,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 8,
                      elevation: 3,
                    }}
                    placeholder="Email address"
                    placeholderTextColor="#9CA3AF"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

      <View style={{ marginBottom: 16 }}>
        <View style={{ position: 'relative' }}>
          <TextInput
            style={{
              backgroundColor: 'white',
              borderRadius: 16,
              paddingHorizontal: 20,
              paddingVertical: 16,
              paddingRight: 80,
              fontSize: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
              elevation: 3,
            }}
            placeholder="Password"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
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

        {/* 🔹 Forgot Password button */}
        {isLogin && (
          <TouchableOpacity onPress={handlePasswordReset} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
            <Text style={{ color: '#E9D5FF', fontSize: 14, fontWeight: '500' }}>Forgot password?</Text>
          </TouchableOpacity>
        )}
      </View>

                {!isLogin && (
                  <View style={{ marginBottom: 32 }}>
                    <View style={{ position: 'relative' }}>
                      <TextInput
                        style={{
                          backgroundColor: 'white',
                          borderRadius: 16,
                          paddingHorizontal: 20,
                          paddingVertical: 16,
                          paddingRight: 80,
                          fontSize: 16,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.1,
                          shadowRadius: 8,
                          elevation: 3,
                        }}
                        placeholder="Confirm password"
                        placeholderTextColor="#9CA3AF"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
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
                  </View>
                )}

                {/* Email Sign-In / Sign-Up Button */}
                <TouchableOpacity
                  onPress={handleAuth}
                  disabled={isLoading}
                  style={{
                    backgroundColor: isLoading ? '#D1D5DB' : 'white',
                    borderRadius: 16,
                    paddingVertical: 20,
                    marginBottom: 16,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                    elevation: 5,
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: 'bold',
                      color: isLoading ? '#6B7280' : '#7C3AED',
                      textAlign: 'center',
                    }}
                  >
                    {isLoading ? 'Loading...' : isLogin ? 'Sign In' : 'Create Account'}
                  </Text>
                </TouchableOpacity>

                {/* ✅ Continue with Google Button */}
                {/* <TouchableOpacity
                  onPress={() => promptAsync()}
                  disabled={!request || isLoading}
                  style={{
                    backgroundColor: '#4285F4',
                    borderRadius: 16,
                    paddingVertical: 16,
                    marginBottom: 24,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                    elevation: 5,
                    opacity: isLoading ? 0.6 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: 'bold',
                      color: 'white',
                      textAlign: 'center',
                    }}
                  >
                    Continue with Google
                  </Text>
                </TouchableOpacity> */}

                {/* Toggle between Sign In / Sign Up */}
                <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, color: 'white', fontWeight: '600' }}>
                    {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default AuthScreen;
