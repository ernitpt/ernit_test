import * as admin from 'firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * Shared notification sender for onNotificationCreated functions
 * Handles FCM push notifications for both test and production environments
 */

interface NotificationData {
    notificationId: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: Record<string, any>;
}

interface SendNotificationOptions {
    notificationData: NotificationData;
    db: admin.firestore.Firestore;
    envLabel: 'TEST' | 'PROD';
}

/**
 * Sends FCM push notifications to all of a user's registered devices
 * @returns Number of successfully sent notifications
 */
export async function sendPushNotification(
    options: SendNotificationOptions
): Promise<number> {
    const { notificationData, db, envLabel } = options;
    const { notificationId, userId, type, title, message, data } = notificationData;

    console.log(
        `📬 [${envLabel}] Processing notification ${notificationId}`,
        { userId, type }
    );

    // Get user's FCM tokens
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        console.warn(`⚠️ [${envLabel}] User ${userId} not found`);
        return 0;
    }

    const userData = userDoc.data();
    const fcmTokens = userData?.fcmTokens || [];

    if (fcmTokens.length === 0) {
        console.log(`ℹ️ [${envLabel}] User ${userId} has no FCM tokens registered`);
        return 0;
    }

    console.log(
        `📲 [${envLabel}] Sending notification to ${fcmTokens.length} device(s)`
    );

    // Prepare click action URL based on notification type
    let clickAction = '/';
    if (type === 'friend_request') {
        clickAction = '/notifications';
    } else if (type === 'goal_progress') {
        clickAction = `/goal/${data?.goalId}`;
    } else if (type === 'personalized_hint_left') {
        clickAction = `/goal/${data?.goalId}`;
    } else if (type === 'post_reaction') {
        clickAction = `/feed`;
    }

    // Prepare notification data - FCM requires all values to be strings
    const notificationDataPayload: Record<string, string> = {
        notificationId,
        url: clickAction,
        type,
        title, // Add title for service worker
        body: message, // Add body for service worker
        icon: 'https://ernit.app/icon_192.png', // Full URL required for FCM
    };

    // Convert all data fields to strings
    if (data) {
        Object.keys(data).forEach((key) => {
            const value = data[key];
            notificationDataPayload[key] = value != null ? String(value) : '';
        });
    }

    // Create FCM message
    // IMPORTANT: Send ONLY 'data' payload, no 'notification' or 'webpush.notification'
    // The service worker's onBackgroundMessage will manually create the notification
    // Any notification-related fields cause FCM to auto-display, creating duplicates
    const messageTemplate = {
        data: notificationDataPayload,
        webpush: {
            fcmOptions: {
                link: clickAction, // URL to open when notification clicked
            },
        },
    };

    // Send to all registered devices
    const messaging = getMessaging();
    const results = await Promise.allSettled(
        fcmTokens.map((token: string) =>
            messaging.send({
                ...messageTemplate,
                token,
            })
        )
    );

    // Log results
    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];

    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            successCount++;
            console.log(`✅ [${envLabel}] Message sent to token ${index + 1}`);
        } else {
            failureCount++;
            const error = result.reason;
            console.error(
                `❌ [${envLabel}] Failed to send to token ${index + 1}:`,
                error
            );

            // Check if token is invalid
            if (
                error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered'
            ) {
                invalidTokens.push(fcmTokens[index]);
            }
        }
    });

    console.log(
        `📊 [${envLabel}] Push notification results: ${successCount} sent, ${failureCount} failed`
    );

    // Remove invalid tokens from Firestore
    if (invalidTokens.length > 0) {
        console.log(`🧹 [${envLabel}] Removing ${invalidTokens.length} invalid token(s)`);
        await db
            .collection('users')
            .doc(userId)
            .update({
                fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
            });
    }

    return successCount;
}
