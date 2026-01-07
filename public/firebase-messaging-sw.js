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
