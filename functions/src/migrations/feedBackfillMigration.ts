/**
 * Feed Backfill Migration Script
 * Generates historical feed posts from existing goal data
 * 
 * Strategy: Recent + Completions
 * - Last 60 days of progress
 * - All completed goals
 * 
 * Usage (from functions directory):
 *   Dry-run: npm run migrate:feed:preview
 *   Execute: npm run migrate:feed
 * 
 * IMPORTANT: Before running, download your Firebase Admin SDK credentials from:
 * Firebase Console -> Project Settings -> Service Accounts -> Generate New Private Key
 * Save as: ernit-3fc0b-firebase-adminsdk.json in the project root (c:\ErnitAppWeb_Test\)
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from 'firebase-functions/v2';

// Path is relative to functions/lib/migrations/ -> project root
const serviceAccountPath = path.join(__dirname, '..', '..', '..', 'ernit-3fc0b-firebase-adminsdk.json');

logger.info(`\nLooking for service account at: ${serviceAccountPath}`);

if (!fs.existsSync(serviceAccountPath)) {
    logger.error(`\n❌ ERROR: Firebase Admin SDK credentials file not found!`);
    logger.error(`\nExpected path: ${serviceAccountPath}`);
    logger.error(`\nTo fix this:`);
    logger.error(`1. Go to Firebase Console -> Project Settings -> Service Accounts`);
    logger.error(`2. Click "Generate new private key"`);
    logger.error(`3. Save the file as "ernit-3fc0b-firebase-adminsdk.json" in the project root`);
    logger.error(`   (c:\\ErnitAppWeb_Test\\ernit-3fc0b-firebase-adminsdk.json)\n`);
    process.exit(1);
}

// Load and initialize
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
}

// Use default (production) database
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore(admin.app());

logger.info(`📦 Using database: (default)`);

interface MigrationStats {
    goalsProcessed: number;
    progressPostsCreated: number;
    completionPostsCreated: number;
    errors: number;
    skipped: number;
}

// 60 days for testing
const DAYS_AGO = new Date();
DAYS_AGO.setDate(DAYS_AGO.getDate() - 60);

/**
 * Clean up old migration posts (for re-running the migration)
 */
async function cleanupOldMigrationPosts(dryRun: boolean = true): Promise<number> {
    logger.info(`\n🧹 Cleaning up old migration posts (${dryRun ? 'DRY RUN' : 'LIVE'})...\n`);

    // Find posts with type 'goal_progress' (the old incorrect type) or 'session_progress' with reactionCounts all 0
    // This targets posts created by migration, not user activity
    const postsToDelete = await db
        .collection('feedPosts')
        .where('type', 'in', ['goal_progress', 'session_progress'])
        .get();

    let deleteCount = 0;
    const BATCH_SIZE = 500;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of postsToDelete.docs) {
        const data = doc.data();
        // Only delete posts with 0 reactions (likely migration-created, not real user posts)
        const totalReactions = (data.reactionCounts?.muscle || 0) +
            (data.reactionCounts?.heart || 0) +
            (data.reactionCounts?.like || 0);

        if (totalReactions === 0 && data.commentCount === 0) {
            if (!dryRun) {
                batch.delete(doc.ref);
                batchCount++;

                if (batchCount >= BATCH_SIZE) {
                    await batch.commit();
                    logger.info(`🗑️  Deleted batch of ${batchCount} posts`);
                    batch = db.batch();
                    batchCount = 0;
                }
            }
            deleteCount++;
        }
    }

    if (batchCount > 0 && !dryRun) {
        await batch.commit();
        logger.info(`🗑️  Deleted final batch of ${batchCount} posts`);
    }

    logger.info(`📊 ${dryRun ? 'Would delete' : 'Deleted'} ${deleteCount} old migration posts\n`);
    return deleteCount;
}

/**
 * Main migration function
 */
async function backfillFeedPosts(dryRun: boolean = true): Promise<MigrationStats> {
    logger.info(`\n🚀 Starting feed backfill migration (${dryRun ? 'DRY RUN' : 'LIVE'})\n`);
    logger.info(`📅 Scope: Last 60 days + All completions\n`);

    const stats: MigrationStats = {
        goalsProcessed: 0,
        progressPostsCreated: 0,
        completionPostsCreated: 0,
        errors: 0,
        skipped: 0,
    };

    try {
        // Get all goals
        const goalsSnapshot = await db.collection('goals').get();
        logger.info(`📊 Found ${goalsSnapshot.size} total goals\n`);

        // Process in batches of 500 (Firestore limit)
        let currentBatch = db.batch();
        let batchCount = 0;
        const BATCH_SIZE = 500;

        for (const goalDoc of goalsSnapshot.docs) {
            try {
                const goalData = goalDoc.data();
                const goalId = goalDoc.id;
                stats.goalsProcessed++;

                // Get user details
                const userDoc = await db.collection('users').doc(goalData.userId).get();
                if (!userDoc.exists) {
                    logger.info(`⚠️  Skipping goal ${goalId}: User not found`);
                    stats.skipped++;
                    continue;
                }

                const userData = userDoc.data()!;
                const userName = userData.displayName || 'User';
                const userProfileImageUrl = userData.profile?.profileImageUrl;

                // Get goal data
                const sessionsPerWeek = goalData.sessionsPerWeek || 1;
                const targetCount = goalData.targetCount || 1;
                const totalSessions = targetCount * sessionsPerWeek;
                const currentCount = goalData.currentCount || 0; // Completed weeks
                const weeklyCount = goalData.weeklyCount || 0; // Sessions in current week

                // weeklyLogDates only contains dates for the CURRENT week
                // We need to reconstruct all sessions from:
                // - currentCount (completed weeks) * sessionsPerWeek = sessions from completed weeks
                // - weeklyLogDates = sessions from current week
                const weeklyLogDates: string[] = goalData.weeklyLogDates || [];

                // Total sessions ever done = completed weeks * sessions/week + current week sessions
                const totalSessionsDone = currentCount * sessionsPerWeek + weeklyLogDates.length;

                logger.info(`  Goal ${goalId}: ${currentCount} weeks completed, ${weeklyLogDates.length} sessions this week, ${totalSessionsDone} total sessions`);

                // Create feed posts for current week's sessions
                for (let i = 0; i < weeklyLogDates.length; i++) {
                    const sessionDate = new Date(weeklyLogDates[i]);

                    // Only create posts for last 60 days OR if goal is completed
                    if (sessionDate >= DAYS_AGO || goalData.isCompleted) {
                        // Session number = completed weeks sessions + current week session index
                        const sessionNumber = currentCount * sessionsPerWeek + (i + 1);
                        // Weekly count = how many sessions done this week at this point (i + 1)
                        const weeklyCountAtThisPoint = i + 1;
                        const progressPercentage = Math.round((sessionNumber / totalSessions) * 100);

                        // Check if post already exists for this goal + date (check both types for idempotency)
                        const existingPost = await db
                            .collection('feedPosts')
                            .where('goalId', '==', goalId)
                            .where('type', 'in', ['goal_progress', 'session_progress'])
                            .where('createdAt', '==', admin.firestore.Timestamp.fromDate(sessionDate))
                            .limit(1)
                            .get();

                        if (existingPost.empty) {
                            const feedPostRef = db.collection('feedPosts').doc();
                            const feedPost = {
                                userId: goalData.userId,
                                userName,
                                userProfileImageUrl: userProfileImageUrl || null,
                                goalId,
                                goalDescription: goalData.description || goalData.title,
                                type: 'session_progress',
                                sessionNumber,
                                totalSessions,
                                progressPercentage,
                                // weeklyCount = sessions done this week at this point
                                weeklyCount: weeklyCountAtThisPoint,
                                sessionsPerWeek,
                                createdAt: admin.firestore.Timestamp.fromDate(sessionDate),
                                reactionCounts: {
                                    muscle: 0,
                                    heart: 0,
                                    like: 0,
                                },
                                commentCount: 0,
                            };

                            if (!dryRun) {
                                currentBatch.set(feedPostRef, feedPost);
                                batchCount++;

                                // Commit batch when it reaches limit
                                if (batchCount >= BATCH_SIZE) {
                                    await currentBatch.commit();
                                    logger.info(`✅ Committed batch of ${batchCount} posts`);
                                    currentBatch = db.batch();
                                    batchCount = 0;
                                }
                            }

                            stats.progressPostsCreated++;
                        }
                    }
                }

                // Create completion post if goal is completed
                if (goalData.isCompleted) {
                    // Use last session date or current date
                    const completionDate = weeklyLogDates.length > 0
                        ? new Date(weeklyLogDates[weeklyLogDates.length - 1])
                        : new Date();

                    // Check if completion post already exists
                    const existingCompletionPost = await db
                        .collection('feedPosts')
                        .where('goalId', '==', goalId)
                        .where('type', '==', 'goal_completed')
                        .limit(1)
                        .get();

                    if (existingCompletionPost.empty) {
                        // Get experience details
                        let experienceTitle = 'Experience';
                        let experienceImageUrl: string | undefined;
                        let partnerName: string | undefined;

                        try {
                            const giftDoc = await db.collection('experienceGifts').doc(goalData.experienceGiftId).get();
                            if (giftDoc.exists) {
                                const giftData = giftDoc.data()!;
                                const experienceDoc = await db.collection('experiences').doc(giftData.experienceId).get();

                                if (experienceDoc.exists) {
                                    const expData = experienceDoc.data()!;
                                    experienceTitle = expData.title;
                                    // Match GoalService: coverImageUrl takes priority, then first imageUrl array item
                                    experienceImageUrl = expData.coverImageUrl || (Array.isArray(expData.imageUrl) ? expData.imageUrl[0] : expData.imageUrl);

                                    // Get partner name
                                    const partnerDoc = await db.collection('partnerUsers').doc(expData.partnerId).get();
                                    if (partnerDoc.exists) {
                                        partnerName = partnerDoc.data()!.businessName;
                                    }
                                }
                            }
                        } catch (err) {
                            logger.info(`⚠️  Could not fetch experience details for goal ${goalId}`);
                        }

                        const feedPostRef = db.collection('feedPosts').doc();
                        const completionPost = {
                            userId: goalData.userId,
                            userName,
                            userProfileImageUrl: userProfileImageUrl || null,
                            goalId,
                            goalDescription: goalData.description || goalData.title,
                            type: 'goal_completed',
                            experienceTitle,
                            experienceImageUrl: experienceImageUrl || null,
                            partnerName: partnerName || null,
                            experienceGiftId: goalData.experienceGiftId,
                            createdAt: admin.firestore.Timestamp.fromDate(completionDate),
                            reactionCounts: {
                                muscle: 0,
                                heart: 0,
                                like: 0,
                            },
                            commentCount: 0,
                        };

                        if (!dryRun) {
                            currentBatch.set(feedPostRef, completionPost);
                            batchCount++;

                            if (batchCount >= BATCH_SIZE) {
                                await currentBatch.commit();
                                logger.info(`✅ Committed batch of ${batchCount} posts`);
                                currentBatch = db.batch();
                                batchCount = 0;
                            }
                        }

                        stats.completionPostsCreated++;
                    }
                }

                // Progress logging
                if (stats.goalsProcessed % 10 === 0) {
                    logger.info(`📈 Processed ${stats.goalsProcessed}/${goalsSnapshot.size} goals...`);
                }

            } catch (error) {
                logger.error(`❌ Error processing goal ${goalDoc.id}:`, error);
                stats.errors++;
            }
        }

        // Commit any remaining posts in the batch
        if (batchCount > 0 && !dryRun) {
            await currentBatch.commit();
            logger.info(`✅ Committed final batch of ${batchCount} posts`);
        }

    } catch (error) {
        logger.error('❌ Migration failed:', error);
        throw error;
    }

    return stats;
}

/**
 * Run the migration
 */
async function runMigration(dryRun: boolean = true) {
    logger.info('\n' + '='.repeat(60));
    logger.info('   FEED BACKFILL MIGRATION');
    logger.info('='.repeat(60));

    try {
        // First, clean up old migration posts
        await cleanupOldMigrationPosts(dryRun);

        // Then create new posts
        const stats = await backfillFeedPosts(dryRun);

        logger.info('\n' + '='.repeat(60));
        logger.info('   MIGRATION COMPLETE');
        logger.info('='.repeat(60));
        logger.info(`\n📊 Statistics:`);
        logger.info(`   Goals processed:        ${stats.goalsProcessed}`);
        logger.info(`   Progress posts created: ${stats.progressPostsCreated}`);
        logger.info(`   Completion posts:       ${stats.completionPostsCreated}`);
        logger.info(`   Skipped:                ${stats.skipped}`);
        logger.info(`   Errors:                 ${stats.errors}`);
        logger.info(`   TOTAL POSTS:            ${stats.progressPostsCreated + stats.completionPostsCreated}`);
        logger.info('\n' + '='.repeat(60) + '\n');

        if (dryRun) {
            logger.info('✅ Dry run complete - no data was written');
            logger.info('💡 Run with "npm run migrate:feed" to execute migration\n');
        } else {
            logger.info('✅ Migration executed successfully!');
            logger.info('🎉 Feed posts have been created\n');
        }

    } catch (error) {
        logger.error('\n❌ Migration failed:', error);
        process.exit(1);
    }

    process.exit(0);
}

// Execute based on command line argument
const isDryRun = process.argv[2] !== 'execute';
runMigration(isDryRun);
