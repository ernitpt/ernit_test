/**
 * Feed Backfill Migration Script
 * Generates historical feed posts from existing goal data
 * 
 * Strategy: Recent + Completions
 * - Last 30 days of progress
 * - All completed goals
 * 
 * Usage:
 *   Dry-run: npm run migrate:feed:preview
 *   Execute:  npm run migrate:feed
 */

import { initializeApp } from 'firebase/app';
import {
    getFirestore,
    collection,
    getDocs,
    writeBatch,
    doc,
    query,
    where,
    Timestamp,
} from 'firebase/firestore';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin (for server-side migration)
const serviceAccount = require('../../ernit-3fc0b-firebase-adminsdk.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();

interface MigrationStats {
    goalsProcessed: number;
    progressPostsCreated: number;
    completionPostsCreated: number;
    errors: number;
    skipped: number;
}

const THIRTY_DAYS_AGO = new Date();
THIRTY_DAYS_AGO.setDate(THIRTY_DAYS_AGO.getDate() - 30);

/**
 * Main migration function
 */
async function backfillFeedPosts(dryRun: boolean = true): Promise<MigrationStats> {
    console.log(`\n🚀 Starting feed backfill migration (${dryRun ? 'DRY RUN' : 'LIVE'})\n`);
    console.log(`📅 Scope: Last 30 days + All completions\n`);

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
        console.log(`📊 Found ${goalsSnapshot.size} total goals\n`);

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
                    console.log(`⚠️  Skipping goal ${goalId}: User not found`);
                    stats.skipped++;
                    continue;
                }

                const userData = userDoc.data()!;
                const userName = userData.displayName || 'User';
                const userProfileImageUrl = userData.profile?.profileImageUrl;

                // Calculate total sessions done
                const currentCount = goalData.currentCount || 0;
                const weeklyCount = goalData.weeklyCount || 0;
                const sessionsPerWeek = goalData.sessionsPerWeek || 1;
                const targetCount = goalData.targetCount || 1;
                const totalSessions = targetCount * sessionsPerWeek;

                // Process weekly log dates (progress posts)
                const weeklyLogDates: string[] = goalData.weeklyLogDates || [];

                for (let i = 0; i < weeklyLogDates.length; i++) {
                    const sessionDate = new Date(weeklyLogDates[i]);

                    // Only create posts for last 30 days OR if goal is completed
                    if (sessionDate >= THIRTY_DAYS_AGO || goalData.isCompleted) {
                        const sessionNumber = i + 1;
                        const progressPercentage = Math.round((sessionNumber / totalSessions) * 100);

                        // Check if post already exists for this goal + date
                        const existingPost = await db
                            .collection('feedPosts')
                            .where('goalId', '==', goalId)
                            .where('type', '==', 'goal_progress')
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
                                type: 'goal_progress',
                                sessionNumber,
                                totalSessions,
                                progressPercentage,
                                weeklyCount: (sessionNumber % sessionsPerWeek) || sessionsPerWeek,
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
                                    console.log(`✅ Committed batch of ${batchCount} posts`);
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
                                    experienceImageUrl = expData.imageUrl;

                                    // Get partner name
                                    const partnerDoc = await db.collection('partnerUsers').doc(expData.partnerId).get();
                                    if (partnerDoc.exists) {
                                        partnerName = partnerDoc.data()!.businessName;
                                    }
                                }
                            }
                        } catch (err) {
                            console.log(`⚠️  Could not fetch experience details for goal ${goalId}`);
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
                                console.log(`✅ Committed batch of ${batchCount} posts`);
                                currentBatch = db.batch();
                                batchCount = 0;
                            }
                        }

                        stats.completionPostsCreated++;
                    }
                }

                // Progress logging
                if (stats.goalsProcessed % 10 === 0) {
                    console.log(`📈 Processed ${stats.goalsProcessed}/${goalsSnapshot.size} goals...`);
                }

            } catch (error) {
                console.error(`❌ Error processing goal ${goalDoc.id}:`, error);
                stats.errors++;
            }
        }

        // Commit any remaining posts in the batch
        if (batchCount > 0 && !dryRun) {
            await currentBatch.commit();
            console.log(`✅ Committed final batch of ${batchCount} posts`);
        }

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }

    return stats;
}

/**
 * Run the migration
 */
async function runMigration(dryRun: boolean = true) {
    console.log('\n' + '='.repeat(60));
    console.log('   FEED BACKFILL MIGRATION');
    console.log('='.repeat(60));

    try {
        const stats = await backfillFeedPosts(dryRun);

        console.log('\n' + '='.repeat(60));
        console.log('   MIGRATION COMPLETE');
        console.log('='.repeat(60));
        console.log(`\n📊 Statistics:`);
        console.log(`   Goals processed:        ${stats.goalsProcessed}`);
        console.log(`   Progress posts created: ${stats.progressPostsCreated}`);
        console.log(`   Completion posts:       ${stats.completionPostsCreated}`);
        console.log(`   Skipped:                ${stats.skipped}`);
        console.log(`   Errors:                 ${stats.errors}`);
        console.log(`   TOTAL POSTS:            ${stats.progressPostsCreated + stats.completionPostsCreated}`);
        console.log('\n' + '='.repeat(60) + '\n');

        if (dryRun) {
            console.log('✅ Dry run complete - no data was written');
            console.log('💡 Run with dryRun=false to execute migration\n');
        } else {
            console.log('✅ Migration executed successfully!');
            console.log('🎉 Feed posts have been created\n');
        }

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    }

    process.exit(0);
}

// Execute based on command line argument
const isDryRun = process.argv[2] !== 'execute';
runMigration(isDryRun);
