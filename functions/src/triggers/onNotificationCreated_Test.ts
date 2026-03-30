import * as functions from "firebase-functions/v2";
import { logger } from "firebase-functions/v2";
import { sendPushNotification } from "../utils/notificationSender";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * Cloud Function: onNotificationCreated_Test
 * Triggers when a new notification document is created in Firestore TEST database (ernitclone2)
 * Sends FCM push notification to all user's registered devices
 */
export const onNotificationCreated_Test = functions.firestore.onDocumentCreated(
    {
        document: "notifications/{notificationId}",
        database: "ernitclone2",
        region: "europe-west1",
    },
    async (event) => {
        const snapshot = event.data;
        const notificationId = event.params.notificationId;

        if (!snapshot) {
            logger.warn("⚠️ [TEST] No snapshot data");
            return null;
        }

        const notificationData = snapshot.data();

        // BUG-01: Idempotency guard — Cloud Functions use at-least-once delivery,
        // so a retry after a crash or timeout would send a duplicate push.
        // If pushSentAt is already set, this notification was already processed.
        if (notificationData?.pushSentAt) {
            logger.info("ℹ️ [TEST] Push already sent for notification, skipping duplicate", { notificationId });
            return null;
        }

        try {
            // Get the recipient user ID
            const userId = notificationData.userId;
            if (!userId) {
                logger.warn("⚠️ [TEST] No userId found in notification");
                return null;
            }

            // Use getFirestore("ernitclone2") directly — avoids a circular require through index.ts
            // which returns undefined on cold-start due to module initialization order.
            const db = getFirestore("ernitclone2");

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
                db,
                envLabel: "TEST",
            });

            // BUG-01: Mark as sent so any retry due to at-least-once delivery skips it.
            await snapshot.ref.update({ pushSentAt: FieldValue.serverTimestamp() });

            return null;
        } catch (error: unknown) {
            logger.error("❌ [TEST] Error sending push notification:", error);
            return null;
        }
    });
