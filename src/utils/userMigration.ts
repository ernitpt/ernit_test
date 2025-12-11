/**
 * Migration Script: Add onboardingStatus to Existing Users
 * 
 * This script adds the onboardingStatus field to all existing users in Firestore
 * who don't have it yet. It sets the default value to "not_started".
 * 
 * Run this once to migrate existing users.
 */

import { db } from '../services/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

export async function migrateUsersOnboardingStatus() {
    console.log('🔄 Starting user migration for onboardingStatus field...');

    try {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);

        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const userDoc of snapshot.docs) {
            try {
                const userData = userDoc.data();

                // Check if user already has onboardingStatus
                if (userData.onboardingStatus) {
                    console.log(`⏭️  User ${userDoc.id} already has onboardingStatus: ${userData.onboardingStatus}`);
                    skippedCount++;
                    continue;
                }

                // Add onboardingStatus field
                await updateDoc(doc(db, 'users', userDoc.id), {
                    onboardingStatus: 'not_started',
                    updatedAt: new Date().toISOString(),
                });

                console.log(`✅ Migrated user ${userDoc.id} - set onboardingStatus to "not_started"`);
                migratedCount++;
            } catch (error) {
                console.error(`❌ Error migrating user ${userDoc.id}:`, error);
                errorCount++;
            }
        }

        console.log('\n📊 Migration Summary:');
        console.log(`  ✅ Migrated: ${migratedCount} users`);
        console.log(`  ⏭️  Skipped: ${skippedCount} users (already had field)`);
        console.log(`  ❌ Errors: ${errorCount} users`);
        console.log(`  📝 Total: ${snapshot.docs.length} users`);

        return {
            total: snapshot.docs.length,
            migrated: migratedCount,
            skipped: skippedCount,
            errors: errorCount,
        };
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

/**
 * Alternative: Set existing users to "completed" instead of "not_started"
 * Use this if you want existing users to skip onboarding (they've already used the app)
 */
export async function migrateUsersOnboardingStatusAsCompleted() {
    console.log('🔄 Starting user migration for onboardingStatus field (marking as completed)...');

    try {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);

        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const userDoc of snapshot.docs) {
            try {
                const userData = userDoc.data();

                // Check if user already has onboardingStatus
                if (userData.onboardingStatus) {
                    console.log(`⏭️  User ${userDoc.id} already has onboardingStatus: ${userData.onboardingStatus}`);
                    skippedCount++;
                    continue;
                }

                // Set onboardingStatus to "completed" for existing users
                await updateDoc(doc(db, 'users', userDoc.id), {
                    onboardingStatus: 'completed',
                    updatedAt: new Date().toISOString(),
                });

                console.log(`✅ Migrated user ${userDoc.id} - set onboardingStatus to "completed"`);
                migratedCount++;
            } catch (error) {
                console.error(`❌ Error migrating user ${userDoc.id}:`, error);
                errorCount++;
            }
        }

        console.log('\n📊 Migration Summary:');
        console.log(`  ✅ Migrated: ${migratedCount} users`);
        console.log(`  ⏭️  Skipped: ${skippedCount} users (already had field)`);
        console.log(`  ❌ Errors: ${errorCount} users`);
        console.log(`  📝 Total: ${snapshot.docs.length} users`);

        return {
            total: snapshot.docs.length,
            migrated: migratedCount,
            skipped: skippedCount,
            errors: errorCount,
        };
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

// Example usage (call this from a component or script):
// import { migrateUsersOnboardingStatus, migrateUsersOnboardingStatusAsCompleted } from './utils/userMigration';
//
// // To show onboarding to existing users:
// await migrateUsersOnboardingStatus();
//
// // OR to skip onboarding for existing users (recommended):
// await migrateUsersOnboardingStatusAsCompleted();
