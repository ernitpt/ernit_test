import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";

/**
 * Cloud Function: onNotificationCreated_Test
 * Triggers when a new notification document is created in Firestore TEST database
 * Sends FCM push notification to all user's registered devices
 */
export const onNotificationCreated_Test = functions.firestore.onDocumentCreated(
    {
        document: "notifications/{notificationId}",
        region: "europe-west1",
        database: "ernitclone2",  // Watch the test database
    },
    async (event) => {
        const snapshot = event.data;
        const notificationId = event.params.notificationId;

        if (!snapshot) {
            console.warn("⚠️ [TEST] No snapshot data");
            return null;
        }

        const notificationData = snapshot.data();

        try {
            console.log(
                `📬 [TEST] New notification created: ${notificationId}`,
                notificationData
            );

            // Get the recipient user ID
            const userId = notificationData.userId;
            if (!userId) {
                console.warn("⚠️ [TEST] No userId found in notification");
                return null;
            }

            // Import db from index.ts (test database)
            const db = require("../index").db;

            // Get user's FCM tokens
            const userDoc = await db.collection("users").doc(userId).get();
            if (!userDoc.exists) {
                console.warn(`⚠️ [TEST] User ${userId} not found`);
                return null;
            }

            const userData = userDoc.data();
            const fcmTokens = userData.fcmTokens || [];

            if (fcmTokens.length === 0) {
                console.log(
                    `ℹ️ [TEST] User ${userId} has no FCM tokens registered`
                );
                return null;
            }

            console.log(
                `📲 [TEST] Sending notification to ${fcmTokens.length} device(s)`
            );

            // Prepare notification payload
            const title = notificationData.title || "New notification";
            const body = notificationData.message || "";
            const icon = "https://ernit.app/icon_192.png"; // Full URL required for FCM

            // Prepare click action URL based on notification type
            let clickAction = "/";
            if (notificationData.type === "friend_request") {
                clickAction = "/notifications";
            } else if (notificationData.type === "goal_progress") {
                clickAction = `/goal/${notificationData.data?.goalId}`;
            } else if (notificationData.type === "personalized_hint_left") {
                clickAction = `/goal/${notificationData.data?.goalId}`;
            }

            // Prepare notification data - FCM requires all values to be strings
            const notificationDataPayload: Record<string, string> = {
                notificationId,
                url: clickAction,
                type: notificationData.type,
            };

            // Convert all data fields to strings
            if (notificationData.data) {
                Object.keys(notificationData.data).forEach((key) => {
                    const value = notificationData.data[key];
                    notificationDataPayload[key] = value != null ? String(value) : "";
                });
            }

            // Create FCM message
            const message = {
                notification: {
                    title,
                    body,
                    // Note: icon is not supported in main notification, only in webpush
                },
                data: notificationDataPayload,
                webpush: {
                    fcmOptions: {
                        link: clickAction,
                    },
                    notification: {
                        icon,
                        badge: icon,
                        requireInteraction: false,
                    },
                },
            };

            // Send to all registered devices
            const messaging = getMessaging();
            const results = await Promise.allSettled(
                fcmTokens.map((token: string) =>
                    messaging.send({
                        ...message,
                        token,
                    })
                )
            );

            // Log results
            let successCount = 0;
            let failureCount = 0;
            const invalidTokens: string[] = [];

            results.forEach((result, index) => {
                if (result.status === "fulfilled") {
                    successCount++;
                    console.log(`✅ [TEST] Message sent to token ${index + 1}`);
                } else {
                    failureCount++;
                    const error = result.reason;
                    console.error(
                        `❌ [TEST] Failed to send to token ${index + 1}:`,
                        error
                    );

                    // Check if token is invalid
                    if (
                        error.code === "messaging/invalid-registration-token" ||
                        error.code === "messaging/registration-token-not-registered"
                    ) {
                        invalidTokens.push(fcmTokens[index]);
                    }
                }
            });

            console.log(
                `📊 [TEST] Push notification results: ${successCount} sent, ${failureCount} failed`
            );

            // Remove invalid tokens from Firestore
            if (invalidTokens.length > 0) {
                console.log(
                    `🧹 [TEST] Removing ${invalidTokens.length} invalid token(s)`
                );
                await db
                    .collection("users")
                    .doc(userId)
                    .update({
                        fcmTokens: admin.firestore.FieldValue.arrayRemove(
                            ...invalidTokens
                        ),
                    });
            }

            return null;
        } catch (error) {
            console.error("❌ [TEST] Error sending push notification:", error);
            return null;
        }
    });
