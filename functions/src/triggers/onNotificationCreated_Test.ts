import * as functions from "firebase-functions/v2";
import { sendPushNotification } from "../utils/notificationSender";

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
            // Get the recipient user ID
            const userId = notificationData.userId;
            if (!userId) {
                console.warn("⚠️ [TEST] No userId found in notification");
                return null;
            }

            // Import db from index.ts (test database)
            const db = require("../index").db;

            // Send push notification using shared utility
            await sendPushNotification({
                notificationData: {
                    notificationId,
                    userId,
                    type: notificationData.type,
                    title: notificationData.title || "New notification",
                    message: notificationData.message || "",
                    data: notificationData.data,
                },
                db: db,
                envLabel: "TEST",
            });

            return null;
        } catch (error) {
            console.error("❌ [TEST] Error sending push notification:", error);
            return null;
        }
    });
