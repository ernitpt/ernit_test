// Firebase Messaging Service Worker
// This file handles background push notifications when the app is closed

// Import Firebase scripts for service worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
// Note: These values will be replaced at runtime by the client
firebase.initializeApp({
    apiKey: "AIzaSyDiPC0xV0VuP1SJoUdpBZk8VkL8-2pL4fU",
    authDomain: "ernit-3fc0b.firebaseapp.com",
    projectId: "ernit-3fc0b",
    storageBucket: "ernit-3fc0b.firebasestorage.app",
    messagingSenderId: "686997772682",
    appId: "1:686997772682:web:25913c4f9419a3d97e16b2",
    measurementId: "G-3DFDNZPWLZ"
});

// Retrieve an instance of Firebase Messaging
const messaging = firebase.messaging();

// Handle background messages (when app is closed or in background)
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message:', payload);

    // Extract notification data
    const notificationTitle = payload.notification?.title || payload.data?.title || 'New notification';
    const notificationOptions = {
        body: payload.notification?.body || payload.data?.body || '',
        icon: payload.data?.icon || '/icon_192.png',
        badge: payload.data?.icon || '/icon_192.png',
        tag: payload.data?.notificationId || 'default',
        data: {
            url: payload.data?.url || '/',
            notificationId: payload.data?.notificationId,
            ...payload.data
        },
        requireInteraction: false,
        vibrate: [200, 100, 200]
    };

    // Show the notification
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification clicked:', event.notification);

    event.notification.close();

    // Get the URL to open (default to app root)
    const urlToOpen = event.notification.data?.url || '/';

    // Open the app or focus existing window
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Check if app is already open
                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus().then(client => {
                            // Navigate to the notification URL
                            if ('navigate' in client) {
                                return client.navigate(urlToOpen);
                            }
                        });
                    }
                }
                // If app is not open, open a new window
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Service worker activation
self.addEventListener('activate', (event) => {
    console.log('[firebase-messaging-sw.js] Service worker activated');
});

// Service worker installation
self.addEventListener('install', (event) => {
    console.log('[firebase-messaging-sw.js] Service worker installed');
    self.skipWaiting(); // Activate immediately
});

// ========================================
// Session Timer Notifications
// ========================================

// Store for scheduled session notifications
const scheduledNotifications = new Map();

// Handle messages from the main app
self.addEventListener('message', (event) => {
    console.log('[firebase-messaging-sw.js] Received message:', event.data);

    if (event.data && event.data.type === 'SCHEDULE_SESSION_NOTIFICATION') {
        const { messageId, goalId, targetTime, targetSeconds } = event.data.payload;

        // Cancel any existing timer for this goal
        if (scheduledNotifications.has(goalId)) {
            clearTimeout(scheduledNotifications.get(goalId));
        }

        // Calculate delay until target time
        const delay = targetTime - Date.now();

        if (delay > 0) {
            // Schedule the notification
            const timerId = setTimeout(() => {
                console.log('[firebase-messaging-sw.js] Showing session notification for goal:', goalId);

                self.registration.showNotification("⏰ Session Time's Up!", {
                    body: "Great job! You can now finish your session and log your progress.",
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: `session-${goalId}`,
                    requireInteraction: true,
                    data: {
                        goalId,
                        type: 'session_completion',
                        url: '/' // Open app root
                    },
                    vibrate: [200, 100, 200]
                });

                // Remove from map after showing
                scheduledNotifications.delete(goalId);
            }, delay);

            // Store the timer ID so we can cancel it later
            scheduledNotifications.set(goalId, timerId);
            console.log(`[firebase-messaging-sw.js] Scheduled session notification for goal ${goalId} in ${delay}ms`);
        } else {
            // Time already passed, show notification immediately
            console.log('[firebase-messaging-sw.js] Target time already passed, showing notification immediately');
            self.registration.showNotification("⏰ Session Time's Up!", {
                body: "Great job! You can now finish your session and log your progress.",
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: `session-${goalId}`,
                requireInteraction: true,
                data: {
                    goalId,
                    type: 'session_completion',
                    url: '/'
                },
                vibrate: [200, 100, 200]
            });
        }
    } else if (event.data && event.data.type === 'CANCEL_SESSION_NOTIFICATION') {
        const { goalId } = event.data.payload;

        if (scheduledNotifications.has(goalId)) {
            clearTimeout(scheduledNotifications.get(goalId));
            scheduledNotifications.delete(goalId);
            console.log(`[firebase-messaging-sw.js] Cancelled session notification for goal ${goalId}`);
        }
    }
});

