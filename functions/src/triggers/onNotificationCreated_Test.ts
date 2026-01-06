import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";
import { QueryDocumentSnapshot } from "firebase-functions/v1/firestore";

/**
 * Cloud Function: onNotificationCreated_Test
 * Triggers when a new notification document is created in Firestore TEST database
 * Sends FCM push notification to all user's registered devices
 */
export const onNotificationCreated_Test = functions.firestore
    .document("notifications/{notificationId}")
    .onCreate(async (snapshot: QueryDocumentSnapshot, context: functions.EventContext) => {
        const notificationData = snapshot.data();
        const notificationId = context.params.notificationId;

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
            const db = require("./index").db;

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
            const icon = "/icon-192.png";

            // Prepare click action URL based on notification type
            let clickAction = "/";
            if (notificationData.type === "friend_request") {
                clickAction = "/notifications";
            } else if (notificationData.type === "goal_progress") {
                clickAction = `/goal/${notificationData.data?.goalId}`;
            } else if (notificationData.type === "personalized_hint_left") {
                clickAction = `/goal/${notificationData.data?.goalId}`;
            }

            // Create FCM message
            const message = {
                notification: {
                    title,
                    body,
                    icon,
                },
                data: {
                    notificationId,
                    url: clickAction,
                    type: notificationData.type,
                    ...notificationData.data,
                },
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
