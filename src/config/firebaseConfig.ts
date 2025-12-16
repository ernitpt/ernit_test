import Constants from 'expo-constants';

import { logger } from '../utils/logger';
// Firebase configuration using environment variables
export const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.firebaseApiKey || process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: Constants.expoConfig?.extra?.firebaseAuthDomain || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: Constants.expoConfig?.extra?.firebaseProjectId || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: Constants.expoConfig?.extra?.firebaseStorageBucket || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: Constants.expoConfig?.extra?.firebaseAppId || process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: Constants.expoConfig?.extra?.firebaseMeasurementId || process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate that all required Firebase config values are present
export const validateFirebaseConfig = () => {
  const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const missingKeys = requiredKeys.filter(key => !firebaseConfig[key as keyof typeof firebaseConfig]);

  if (missingKeys.length > 0) {
    logger.warn('Missing Firebase configuration:', missingKeys);
    return false;
  }

  return true;
};

// Development vs Production configuration
// Use __DEV__ for React Native/Metro, fallback to EXPO_PUBLIC_APP_ENV for web (Vercel)
export const isDevelopment = typeof __DEV__ !== 'undefined'
  ? __DEV__
  : process.env.EXPO_PUBLIC_APP_ENV === 'test';
export const isProduction = !isDevelopment;

// Debug log to help troubleshoot Vercel deployment
console.log(`🔧 firebaseConfig: __DEV__=${typeof __DEV__ !== 'undefined' ? __DEV__ : 'undefined'}, EXPO_PUBLIC_APP_ENV=${process.env.EXPO_PUBLIC_APP_ENV}, isDevelopment=${isDevelopment}`);
