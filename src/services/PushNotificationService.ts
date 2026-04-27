import { Platform } from 'react-native';
import { getMessaging, getToken, onMessage, isSupported, Messaging, MessagePayload } from 'firebase/messaging';
import { doc, runTransaction } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';
import { logger } from '../utils/logger';

class PushNotificationService {
    private messaging: Messaging | null = null;
    private isInitialized = false;

    /**
     * Initialize Firebase Messaging
     * Only works on web platform
     */
    async initialize(): Promise<boolean> {
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
        } catch (error: unknown) {
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
        } catch (error: unknown) {
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

        const safariNav = window.navigator as Navigator & { standalone?: boolean };
        return window.matchMedia('(display-mode: standalone)').matches ||
            safariNav.standalone === true ||
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
        } catch (error: unknown) {
            logger.error('🔔 Error getting FCM token:', error);
            return null;
        }
    }

    /**
     * Save FCM token to user's Firestore profile.
     * Uses a transaction to atomically remove the old token and add the new one,
     * preventing a crash between the two operations from leaving the array inconsistent.
     */
    private async saveTokenToFirestore(userId: string, token: string): Promise<void> {
        try {
            const userRef = doc(db, 'users', userId);

            await runTransaction(db, async (transaction) => {
                const snap = await transaction.get(userRef);
                const tokens: string[] = snap.exists() ? (snap.data()?.fcmTokens ?? []) : [];
                // Remove any existing copy of this token, then add it once
                const updatedTokens = tokens.filter((t: string) => t !== token);
                updatedTokens.push(token);
                transaction.update(userRef, { fcmTokens: updatedTokens });
            });

            logger.log('🔔 FCM token saved to Firestore (deduplicated)');
        } catch (error: unknown) {
            logger.error('🔔 Error saving FCM token to Firestore:', error);
            throw error;
        }
    }

    /**
     * Remove the CURRENT device's FCM token from the given user's Firestore doc.
     * Call this on logout so that a subsequent user logging in on the same device
     * does not inherit push delivery intended for the logged-out user.
     *
     * Failure here is non-fatal — logout must proceed even if token lookup fails
     * (e.g. permission revoked, messaging not initialized).
     */
    async removeTokenForUser(userId: string): Promise<void> {
        if (Platform.OS !== 'web' || !this.isInitialized || !this.messaging) return;
        try {
            const permission = this.getPermissionStatus();
            if (permission !== 'granted') return;

            const vapidKey = process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY;
            if (!vapidKey) return;

            const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
            if (!registration) return;

            const currentToken = await getToken(this.messaging, {
                vapidKey,
                serviceWorkerRegistration: registration,
            });
            if (!currentToken) return;

            const userRef = doc(db, 'users', userId);
            await runTransaction(db, async (transaction) => {
                const snap = await transaction.get(userRef);
                if (!snap.exists()) return;
                const tokens: string[] = snap.data()?.fcmTokens ?? [];
                const filtered = tokens.filter((t: string) => t !== currentToken);
                if (filtered.length !== tokens.length) {
                    transaction.update(userRef, { fcmTokens: filtered });
                }
            });
            logger.log('🔔 FCM token removed from Firestore for logged-out user');
        } catch (error: unknown) {
            logger.warn('🔔 Could not remove FCM token on logout (non-fatal):', error);
        }
    }

    /**
     * Listen for foreground messages (when app is open)
     * @param callback - Function to call when a message is received
     */
    listenForMessages(callback: (payload: MessagePayload) => void) {
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

                    try {
                        // Samsung Internet and Chrome Mobile PWAs throw "Illegal constructor" for new Notification()
                        // We need to use ServiceWorkerRegistration.showNotification() instead
                        new Notification(notificationTitle, notificationOptions);
                    } catch (e: unknown) {
                        // Fallback: try service worker notification if available
                        logger.warn('🔔 Failed to create browser notification, trying service worker:', e);
                        if ('serviceWorker' in navigator) {
                            navigator.serviceWorker.ready.then(registration => {
                                registration.showNotification(notificationTitle, notificationOptions);
                            }).catch(err => {
                                logger.error('🔔 Service worker notification also failed:', err);
                            });
                        }
                    }
                }

                // Call the callback with the payload
                callback(payload);
            });

            return unsubscribe;
        } catch (error: unknown) {
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
        } catch (error: unknown) {
            logger.error('🔔 Error setting up push notifications:', error);
            return false;
        }
    }

    /**
     * Setup notification handler for local notifications
     * Call this on app startup to configure how notifications behave
     */
    async setupNotificationHandler() {
        // Android 8.0+ requires a notification channel before any local notification can show
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Ernit Notifications',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#15803D', // Colors.secondary — forest green
                sound: 'default',
            });
        }

        // Configure how notifications are handled when app is in foreground
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: false, // Don't show when app is open
                shouldPlaySound: false,
                shouldSetBadge: false,
                shouldShowBanner: false,
                shouldShowList: false,
            }),
        });

        logger.log('🔔 Local notification handler configured');
    }

    /**
     * Request local notification permissions (for iOS/Android)
     */
    async requestLocalNotificationPermissions(): Promise<boolean> {
        try {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;

            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }

            if (finalStatus !== 'granted') {
                logger.warn('🔔 Local notification permission not granted');
                return false;
            }

            logger.log('🔔 Local notification permission granted');
            return true;
        } catch (error: unknown) {
            logger.error('🔔 Error requesting local notification permission:', error);
            return false;
        }
    }

    /**
     * Schedule a notification for when session timer completes (Web/PWA compatible)
     * Uses Service Worker for true background notifications
     * @param goalId - Goal ID for tracking
     * @param targetSeconds - Duration in seconds until notification should fire
     * @returns Message ID if scheduled successfully, null otherwise
     */
    async scheduleSessionCompletionNotification(
        goalId: string,
        targetSeconds: number
    ): Promise<string | null> {
        if (Platform.OS !== 'web') {
            // For native apps, use expo-notifications
            try {
                const hasPermission = await this.requestLocalNotificationPermissions();
                if (!hasPermission) {
                    logger.warn('🔔 Cannot schedule notification without permission');
                    return null;
                }

                await this.cancelSessionNotification(goalId);

                const notificationId = await Notifications.scheduleNotificationAsync({
                    content: {
                        title: "⏰ Session Time's Up!",
                        body: "Great job! You can now finish your session and log your progress.",
                        data: { goalId, type: 'session_completion' },
                        sound: true,
                        ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
                    },
                    trigger: {
                        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                        seconds: targetSeconds,
                    } as Notifications.TimeIntervalTriggerInput,
                });

                await AsyncStorage.setItem(
                    `session_notification_${goalId}`,
                    notificationId
                );

                logger.log(`🔔 Session notification scheduled for goal ${goalId} in ${targetSeconds}s (ID: ${notificationId})`);
                return notificationId;
            } catch (error: unknown) {
                logger.error('🔔 Error scheduling session notification:', error);
                return null;
            }
        }

        // Web/PWA: Use Service Worker for background notifications
        try {
            // Check if browser supports notifications
            if (!('Notification' in window)) {
                logger.warn('🔔 Browser does not support notifications');
                return null;
            }

            // Request permission if needed
            if (Notification.permission === 'default') {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    logger.warn('🔔 Notification permission denied');
                    return null;
                }
            }

            if (Notification.permission !== 'granted') {
                logger.warn('🔔 Notification permission not granted');
                return null;
            }

            // Cancel any existing scheduled notification
            await this.cancelSessionNotification(goalId);

            // Register service worker if not already registered
            if ('serviceWorker' in navigator) {
                try {
                    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                    await navigator.serviceWorker.ready;

                    // Send message to service worker to schedule notification
                    const messageId = `session-${goalId}-${Date.now()}`;
                    const targetTime = Date.now() + (targetSeconds * 1000);

                    // Store notification data
                    await AsyncStorage.setItem(
                        `session_notification_${goalId}`,
                        JSON.stringify({
                            messageId,
                            goalId,
                            targetTime,
                            targetSeconds,
                        })
                    );

                    // Post message to service worker
                    registration.active?.postMessage({
                        type: 'SCHEDULE_SESSION_NOTIFICATION',
                        payload: {
                            messageId,
                            goalId,
                            targetTime,
                            targetSeconds,
                        },
                    });

                    logger.log(`🔔 Service Worker notification scheduled for goal ${goalId} in ${targetSeconds}s`);
                    return messageId;
                } catch (error: unknown) {
                    logger.error('🔔 Service Worker registration failed:', error);
                    return null;
                }
            } else {
                logger.warn('🔔 Service Worker not supported');
                return null;
            }
        } catch (error: unknown) {
            logger.error('🔔 Error scheduling session notification:', error);
            return null;
        }
    }

    /**
     * Cancel scheduled session notification for a goal
     * @param goalId - Goal ID
     */
    async cancelSessionNotification(goalId: string): Promise<void> {
        try {
            // Get stored notification/timeout ID
            const storedId = await AsyncStorage.getItem(
                `session_notification_${goalId}`
            );

            if (storedId) {
                if (Platform.OS === 'web') {
                    // Parse stored notification data and send cancel to service worker
                    try {
                        const notifData = JSON.parse(storedId);
                        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                            navigator.serviceWorker.controller.postMessage({
                                type: 'CANCEL_SESSION_NOTIFICATION',
                                payload: { messageId: notifData.messageId, goalId },
                            });
                        }
                    } catch {
                        // Fallback: try as numeric timeout ID for backward compatibility
                        clearTimeout(Number(storedId));
                    }
                    logger.log(`🔔 Cancelled session notification for goal ${goalId}`);
                } else {
                    // Native: Cancel scheduled notification
                    await Notifications.cancelScheduledNotificationAsync(storedId);
                    logger.log(`🔔 Cancelled session notification for goal ${goalId}`);
                }

                await AsyncStorage.removeItem(`session_notification_${goalId}`);
            }
        } catch (error: unknown) {
            logger.error('🔔 Error cancelling session notification:', error);
        }
    }

    /**
     * Cancel all scheduled notifications
     */
    async cancelAllScheduledNotifications(): Promise<void> {
        try {
            await Notifications.cancelAllScheduledNotificationsAsync();
            logger.log('🔔 All scheduled notifications cancelled');
        } catch (error: unknown) {
            logger.error('🔔 Error cancelling all notifications:', error);
        }
    }

    /**
     * Show (or update) an ongoing timer progress notification.
     * Android: sticky = true keeps it visible until explicitly cancelled.
     * iOS: regular immediate notification (iOS doesn't support sticky).
     * Web: no-op.
     */
    async showTimerProgressNotification(
        goalId: string,
        goalTitle: string,
        elapsedSeconds: number,
        targetSeconds: number
    ): Promise<void> {
        if (Platform.OS === 'web') return;
        try {
            const hasPermission = await this.requestLocalNotificationPermissions();
            if (!hasPermission) return;

            // Cancel the previous one so we can "update" with fresh elapsed time
            await this.cancelTimerProgressNotification(goalId);

            const mins = Math.floor(elapsedSeconds / 60);
            const secs = String(elapsedSeconds % 60).padStart(2, '0');
            const elapsed = `${mins}:${secs}`;
            const body = targetSeconds > 0
                ? `${elapsed} / ${Math.floor(targetSeconds / 60)} min — keep going! 💪`
                : `${elapsed} elapsed — keep going! 💪`;

            const notifId = await Notifications.scheduleNotificationAsync({
                content: {
                    title: `🏃 ${goalTitle}`,
                    body,
                    data: { goalId, type: 'timer_progress' },
                    // sticky keeps the notification alive on Android until cancelled
                    sticky: Platform.OS === 'android',
                    ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
                },
                trigger: null, // show immediately
            });

            await AsyncStorage.setItem(`timer_notif_${goalId}`, notifId);
        } catch (error: unknown) {
            logger.error('🔔 Error showing timer progress notification:', error);
        }
    }

    /**
     * Cancel the ongoing timer progress notification for a goal.
     */
    async cancelTimerProgressNotification(goalId: string): Promise<void> {
        if (Platform.OS === 'web') return;
        try {
            const storedId = await AsyncStorage.getItem(`timer_notif_${goalId}`);
            if (storedId) {
                await Notifications.dismissNotificationAsync(storedId);
                await AsyncStorage.removeItem(`timer_notif_${goalId}`);
            }
        } catch (error: unknown) {
            logger.error('🔔 Error cancelling timer progress notification:', error);
        }
    }
}

export const pushNotificationService = new PushNotificationService();
