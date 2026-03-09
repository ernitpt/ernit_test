import { firebaseConfig } from '../config/firebaseConfig';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFunctions } from 'firebase/functions';
import { config } from '../config/environment';
import { logger } from '../utils/logger';


// ✅ Prevent re-init on hot reload
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// ✅ Initialize Auth with correct persistence
let auth;

if (typeof window !== 'undefined') {
  // 🌐 Web
  auth = getAuth(app);
  setPersistence(auth, browserLocalPersistence);
} else {
  // 📱 React Native (iOS/Android)
  const { getReactNativePersistence } = require('firebase/auth'); // ✅ no /react-native needed
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

// ✅ Use environment-based database selection
// Test: 'ernitclone2' database | Production: default database (no second param)
const db = config.isProduction
  ? getFirestore(app)  // default database
  : getFirestore(app, 'ernitclone2');  // test database

// Debug logging to verify database connection
logger.log(`🔥 Firebase Database: ${config.isProduction ? 'DEFAULT (Production)' : 'ernitclone2 (Test)'}`);
logger.log(`🔥 Environment Config: isProduction=${config.isProduction}, name=${config.name}`);

const storage = getStorage(app);

// ✅ Use environment-based region
export const functions = getFunctions(app, 'europe-west1');

export { app, auth, db, storage };