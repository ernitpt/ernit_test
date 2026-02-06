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
            const fcmTokens = userData.fcmTokens || [];

            // Send push notification to all registered devices
            if (fcmTokens.length === 0) {
                logger.warn(`Partner user ${partnerUserId} has no FCM tokens registered`);
            } else {
                logger.info(`📲 Sending Valentine completion notification to ${fcmTokens.length} device(s)`);

                const messaging = admin.messaging();
                const results = await Promise.allSettled(
                    fcmTokens.map((token: string) =>
                        messaging.send({
                            token,
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
                        })
                    )
                );

                // Log results and clean up invalid tokens
                let successCount = 0;
                let failureCount = 0;
                const invalidTokens: string[] = [];

                results.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        successCount++;
                        logger.info(`✅ Sent to device ${index + 1}`);
                    } else {
                        failureCount++;
                        const error = result.reason;
                        logger.error(`❌ Failed to send to device ${index + 1}:`, error);

                        // Check if token is invalid
                        if (
                            error.code === 'messaging/invalid-registration-token' ||
                            error.code === 'messaging/registration-token-not-registered'
                        ) {
                            invalidTokens.push(fcmTokens[index]);
                        }
                    }
                });

                logger.info(`📊 Push notification results: ${successCount} sent, ${failureCount} failed`);

                // Remove invalid tokens from Firestore
                if (invalidTokens.length > 0) {
                    logger.info(`🧹 Removing ${invalidTokens.length} invalid token(s)`);
                    await db
                        .collection('users')
                        .doc(partnerUserId)
                        .update({
                            fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
                        });
                }
            }

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
