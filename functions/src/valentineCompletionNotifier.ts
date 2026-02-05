import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

/**
 * 💝 VALENTINE: Cloud function to notify partner when both goals are completed
 * Triggers when a goal document is updated and detects if it just became unlocked
 */
export const valentineCompletionNotifier = onDocumentUpdated(
    {
        document: 'goals/{goalId}',
        region: 'us-central1',
    },
    async (event) => {
        const before = event.data?.before.data();
        const after = event.data?.after.data();

        if (!after || !before) {
            logger.info('No data in event');
            return;
        }

        // Check if goal just became unlocked
        const justUnlocked = !before.isUnlocked && after.isUnlocked;
        if (!justUnlocked || !after.valentineChallengeId) {
            return;
        }

        logger.info(`💕 Goal ${event.params.goalId} just unlocked, sending notifications`);

        try {
            const db = admin.firestore();

            // Get challenge to find partner
            const challengeSnap = await db
                .collection('valentineChallenges')
                .doc(after.valentineChallengeId)
                .get();

            if (!challengeSnap.exists) {
                logger.warn('Valentine challenge not found');
                return;
            }

            const challengeData = challengeSnap.data()!;

            // Find partner's goal ID
            const partnerGoalId = event.params.goalId === challengeData.purchaserGoalId
                ? challengeData.partnerGoalId
                : challengeData.purchaserGoalId;

            if (!partnerGoalId) {
                logger.warn('Partner goal ID not found');
                return;
            }

            // Get partner goal to find user ID
            const partnerGoalSnap = await db.collection('goals').doc(partnerGoalId).get();
            if (!partnerGoalSnap.exists) {
                logger.warn('Partner goal not found');
                return;
            }

            const partnerUserId = partnerGoalSnap.data()!.userId;

            // Get partner's user document for FCM token
            const userSnap = await db.collection('users').doc(partnerUserId).get();
            if (!userSnap.exists) {
                logger.warn('Partner user not found');
                return;
            }

            const userData = userSnap.data()!;
            const fcmToken = userData.fcmToken;

            if (!fcmToken) {
                logger.warn('Partner has no FCM token');
                return;
            }

            // Send push notification
            await admin.messaging().send({
                token: fcmToken,
                notification: {
                    title: '🎉 Partner Finished!',
                    body: 'Your partner has completed their goal! You can now both redeem your experience.',
                },
                data: {
                    type: 'valentine_completion',
                    goalId: partnerGoalId,
                    challengeId: after.valentineChallengeId,
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: 1,
                        },
                    },
                },
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        channelId: 'default',
                    },
                },
            });

            logger.info(`✅ Sent completion notification to user ${partnerUserId}`);

            // Create in-app notification as backup
            await db.collection('notifications').add({
                userId: partnerUserId,
                type: 'valentine_completion',
                title: '🎉 Partner Finished!',
                message: 'Your partner has completed their goal! You can now both redeem your experience.',
                data: {
                    goalId: partnerGoalId,
                    challengeId: after.valentineChallengeId,
                },
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            logger.info('✅ Created in-app notification');

        } catch (error) {
            logger.error('Error sending Valentine completion notification:', error);
        }
    }
);
