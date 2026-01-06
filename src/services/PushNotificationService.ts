import { Platform } from 'react-native';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';
import { logger } from '../utils/logger';

class PushNotificationService {
    private messaging: any = null;
    private isInitialized = false;

    /**
     * Initialize Firebase Messaging
     * Only works on web platform
     */
    async initialize() {
        // Only run on web
        if (Platform.OS !== 'web') {
            logger.log('🔔 Push notifications are only supported on web platform');
            return false;
        }

        try {
            // Check if Firebase Messaging is supported in this browser
            const supported = await isSupported();
            if (!supported) {
                logger.warn('🔔 Firebase Messaging is not supported in this browser');
                return false;
            }

            this.messaging = getMessaging();
            this.isInitialized = true;
            logger.log('🔔 Firebase Messaging initialized successfully');
            return true;
        } catch (error) {
            logger.error('🔔 Error initializing Firebase Messaging:', error);
            return false;
        }
    }

    /**
     * Request notification permission from the user
     */
    async requestPermission(): Promise<NotificationPermission> {
        if (Platform.OS !== 'web') {
            return 'denied';
        }

        try {
            const permission = await Notification.requestPermission();
            logger.log('🔔 Notification permission:', permission);
            return permission;
        } catch (error) {
            logger.error('🔔 Error requesting notification permission:', error);
            return 'denied';
        }
    }

    /**
     * Get the current notification permission status
     */
    getPermissionStatus(): NotificationPermission {
        if (Platform.OS !== 'web' || typeof Notification === 'undefined') {
            return 'denied';
        }
        return Notification.permission;
    }

    /**
     * Check if the app is installed as a PWA (standalone mode)
     */
    isStandalone(): boolean {
        if (Platform.OS !== 'web') return false;

        return window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone ||
            document.referrer.includes('android-app://');
    }

    /**
     * Get FCM registration token
     * @param userId - User ID to associate the token with
     */
    async getToken(userId: string): Promise<string | null> {
        if (!this.isInitialized) {
            const initialized = await this.initialize();
            if (!initialized) return null;
        }

        try {
            // Check if we have permission
            const permission = this.getPermissionStatus();
            if (permission !== 'granted') {
                logger.warn('🔔 Notification permission not granted');
                return null;
            }

            // Get VAPID key from environment
            const vapidKey = process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY;
            if (!vapidKey) {
                logger.error('🔔 VAPID key not found in environment variables');
                return null;
            }

            // Register service worker
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            logger.log('🔔 Service Worker registered successfully');

            // Wait for service worker to be ready
            await navigator.serviceWorker.ready;

            // Get FCM token
            const token = await getToken(this.messaging, {
                vapidKey,
                serviceWorkerRegistration: registration,
            });

            if (token) {
                logger.log('🔔 FCM token obtained successfully');
                // Save token to Firestore
                await this.saveTokenToFirestore(userId, token);
                return token;
            } else {
                logger.warn('🔔 No registration token available');
                return null;
            }
        } catch (error) {
            logger.error('🔔 Error getting FCM token:', error);
            return null;
        }
    }

    /**
     * Save FCM token to user's Firestore profile
     */
    private async saveTokenToFirestore(userId: string, token: string) {
        try {
            const userRef = doc(db, 'users', userId);
            await updateDoc(userRef, {
                fcmTokens: arrayUnion(token),
            });
            logger.log('🔔 FCM token saved to Firestore');
        } catch (error) {
            logger.error('🔔 Error saving FCM token to Firestore:', error);
            throw error;
        }
    }

    /**
     * Listen for foreground messages (when app is open)
     * @param callback - Function to call when a message is received
     */
    listenForMessages(callback: (payload: any) => void) {
        if (!this.isInitialized || !this.messaging) {
            logger.warn('🔔 Cannot listen for messages: Messaging not initialized');
            return () => { };
        }

        try {
            const unsubscribe = onMessage(this.messaging, (payload) => {
                logger.log('🔔 Foreground message received:', payload);

                // Show browser notification if permission is granted
                if (Notification.permission === 'granted') {
                    const notificationTitle = payload.notification?.title || 'New notification';
                    const notificationOptions = {
                        body: payload.notification?.body || '',
                        icon: payload.notification?.icon || '/icon-192.png',
                        badge: '/icon-192.png',
                        tag: payload.data?.notificationId || 'default',
                        data: payload.data,
                    };

                    new Notification(notificationTitle, notificationOptions);
                }

                // Call the callback with the payload
                callback(payload);
            });

            return unsubscribe;
        } catch (error) {
            logger.error('🔔 Error setting up message listener:', error);
            return () => { };
        }
    }

    /**
     * Setup push notifications for a user
     * This is the main method to call when a user logs in
     */
    async setupPushNotifications(userId: string): Promise<boolean> {
        try {
            // Initialize messaging
            const initialized = await this.initialize();
            if (!initialized) {
                logger.warn('🔔 Could not initialize push notifications');
                return false;
            }

            // Check if standalone (for iOS, this is required)
            const isStandalone = this.isStandalone();
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

            if (isIOS && !isStandalone) {
                logger.log('🔔 iOS user needs to install PWA first before enabling notifications');
                return false;
            }

            // Check current permission status
            const currentPermission = this.getPermissionStatus();

            if (currentPermission === 'denied') {
                logger.warn('🔔 Notification permission was previously denied');
                return false;
            }

            if (currentPermission === 'default') {
                // Request permission
                const permission = await this.requestPermission();
                if (permission !== 'granted') {
                    logger.warn('🔔 User denied notification permission');
                    return false;
                }
            }

            // Get and save token
            const token = await this.getToken(userId);
            if (!token) {
                logger.warn('🔔 Could not get FCM token');
                return false;
            }

            logger.log('🔔 Push notifications setup successfully');
            return true;
        } catch (error) {
            logger.error('🔔 Error setting up push notifications:', error);
            return false;
        }
    }
}

export const pushNotificationService = new PushNotificationService();
