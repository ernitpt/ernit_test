import * as functions from "firebase-functions/v2";
import { sendPushNotification } from "../utils/notificationSender";

/**
 * Cloud Function: onNotificationCreated
 * Triggers when a new notification document is created in Firestore PRODUCTION database
 * Sends FCM push notification to all user's registered devices
 */
export const onNotificationCreated = functions.firestore.onDocumentCreated(
    {
        document: "notifications/{notificationId}",
        region: "europe-west1",
    },
    async (event) => {
        const snapshot = event.data;
        const notificationId = event.params.notificationId;

        if (!snapshot) {
            console.warn("⚠️ [PROD] No snapshot data");
            return null;
        }

        const notificationData = snapshot.data();

        try {
            // Get the recipient user ID
            const userId = notificationData.userId;
            if (!userId) {
                console.warn("⚠️ [PROD] No userId found in notification");
                return null;
            }

            // Import dbProd from index.ts (production database)
            const dbProd = require("../index").dbProd;

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
                db: dbProd,
                envLabel: "PROD",
            });

            return null;
        } catch (error) {
            console.error("❌ [PROD] Error sending push notification:", error);
            return null;
        }
    });
