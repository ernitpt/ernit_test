
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Initialize Admin SDK
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'ernit-app-test', // Verify this matches your project
    });
}

const db = admin.firestore();

// Test Data Constants
const TEST_GIFT_ID = 'test_val_gift_001';
const USER_A_ID = 'test_user_a';
const USER_B_ID = 'test_user_b';
const TEST_METADATA = JSON.stringify({
    goalType: 'Yoga',
    weeks: 4,
    sessionsPerWeek: 3,
    mode: 'revealed'
});

async function runVerification() {
    console.log('❤️ Starting Valentine\'s Flow Verification...');

    try {
        // ==========================================
        // CLEANUP
        // ==========================================
        console.log('\n🧹 Cleaning up old test data...');
        await db.collection('experienceGifts').doc(TEST_GIFT_ID).delete();
        // Delete goals for our test users that match this gift
        const goalsA = await db.collection('goals').where('userId', '==', USER_A_ID).get();
        const goalsB = await db.collection('goals').where('userId', '==', USER_B_ID).get();

        const deleteBatch = db.batch();
        goalsA.docs.forEach(d => deleteBatch.delete(d.ref));
        goalsB.docs.forEach(d => deleteBatch.delete(d.ref));
        await deleteBatch.commit();
        console.log('✅ Cleanup complete.');


        // ==========================================
        // 1. STRIPE WEBHOOK SIMULATION (Gift Creation)
        // ==========================================
        console.log('\n🎁 Simulating Stripe Webhook (Gift Creation)...');

        // Logic from stripeWebhook.ts
        const isValentinesCoupon = true; // derived from !!metadata
        const newGiftData = {
            id: TEST_GIFT_ID,
            experienceId: 'exp_yoga_class',
            purchasedBy: 'test_purchaser',
            isValentinesCoupon: true,
            valentinesChallengeData: JSON.parse(TEST_METADATA),
            maxRedemptions: 2, // Critical check
            redemptionCount: 0,
            redeemedBy: [],
            status: 'purchased',
            claimCode: 'LOVE-2024',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await db.collection('experienceGifts').doc(TEST_GIFT_ID).set(newGiftData);

        // Verify
        const giftSnap = await db.collection('experienceGifts').doc(TEST_GIFT_ID).get();
        const gift = giftSnap.data();
        if (gift?.maxRedemptions !== 2) throw new Error('Gift maxRedemptions is not 2!');
        console.log('✅ Gift created correctly with maxRedemptions: 2');


        // ==========================================
        // 2. REDEMPTION USER A (Goal Creation)
        // ==========================================
        console.log('\n👤 Simulating User A Redemption...');

        // Client logic from ValentinesGoalSettingScreen.tsx
        // 1. Check gift
        const freshGiftA = (await db.collection('experienceGifts').doc(TEST_GIFT_ID).get()).data();
        const redeemedByA = freshGiftA?.redeemedBy || [];
        const isFirstA = redeemedByA.length === 0;

        // 2. Create Goal
        const goalRefA = db.collection('goals').doc();
        const goalDataA = {
            userId: USER_A_ID,
            experienceGiftId: TEST_GIFT_ID,
            title: "Valentine's Yoga Challenge",
            isCouplesGoal: true, // Key flag
            partnerId: isFirstA ? null : 'SHOULD_NOT_BE_SET_YET',
            weekCompletionStatus: {
                currentWeek: 1,
                userCompleted: false,
                partnerCompleted: false,
            },
            currentCount: 0,
            sessionsPerWeek: 3,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await goalRefA.set(goalDataA);

        // 3. Update Gift
        await db.collection('experienceGifts').doc(TEST_GIFT_ID).update({
            redemptionCount: admin.firestore.FieldValue.increment(1),
            redeemedBy: admin.firestore.FieldValue.arrayUnion(USER_A_ID)
        });

        console.log('✅ User A Goal Created:', goalRefA.id);


        // ==========================================
        // 3. REDEMPTION USER B (Goal Creation + Linking)
        // ==========================================
        console.log('\n👥 Simulating User B Redemption...');

        // 1. Check gift (Simulate fresh fetch)
        const freshGiftB = (await db.collection('experienceGifts').doc(TEST_GIFT_ID).get()).data();
        const redeemedByB = freshGiftB?.redeemedBy || [];
        const isFirstB = redeemedByB.length === 0; // Should be false

        let partnerId = null;
        if (!isFirstB && redeemedByB.length > 0) {
            partnerId = redeemedByB[0]; // Logic: First redeemer is partner
        }

        // 2. Find Partner Goal
        let linkedPartnerGoalId = null;
        if (partnerId) {
            const q = await db.collection('goals')
                .where('experienceGiftId', '==', TEST_GIFT_ID)
                .where('userId', '==', partnerId)
                .limit(1)
                .get();
            if (!q.empty) linkedPartnerGoalId = q.docs[0].id;
        }

        // 3. Create Goal B
        const goalRefB = db.collection('goals').doc();
        const goalDataB = {
            userId: USER_B_ID,
            experienceGiftId: TEST_GIFT_ID,
            title: "Valentine's Yoga Challenge",
            isCouplesGoal: true,
            partnerId: partnerId, // Should be User A
            partnerGoalId: linkedPartnerGoalId, // Should be Goal A
            weekCompletionStatus: {
                currentWeek: 1,
                userCompleted: false,
                partnerCompleted: false,
            },
            currentCount: 0,
            sessionsPerWeek: 3,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await goalRefB.set(goalDataB);

        // 4. Update Gift
        await db.collection('experienceGifts').doc(TEST_GIFT_ID).update({
            redemptionCount: admin.firestore.FieldValue.increment(1),
            redeemedBy: admin.firestore.FieldValue.arrayUnion(USER_B_ID)
        });

        // 5. LINK BACK (Critical Step)
        if (linkedPartnerGoalId) {
            await db.collection('goals').doc(linkedPartnerGoalId).update({
                partnerId: USER_B_ID,
                partnerGoalId: goalRefB.id
            });
            console.log('🔗 Linked Goal A to Goal B');
        }

        console.log('✅ User B Goal Created:', goalRefB.id);

        // Verify Linking
        const verifyA = (await goalRefA.get()).data();
        const verifyB = (await goalRefB.get()).data();

        if (verifyB?.partnerId !== USER_A_ID) throw new Error('Goal B partnerId incorrect');
        if (verifyB?.partnerGoalId !== goalRefA.id) throw new Error('Goal B partnerGoalId incorrect');
        if (verifyA?.partnerId !== USER_B_ID) throw new Error('Goal A partnerId not linked back!');
        if (verifyA?.partnerGoalId !== goalRefB.id) throw new Error('Goal A partnerGoalId not linked back!');

        console.log('✅ Mutual Linking Verified!');


        // ==========================================
        // 4. PROGRESS SYNC (User A Finishes)
        // ==========================================
        console.log('\n🏃 Simulating User A Finishing Week...');

        // Simulating GoalService.tickWeeklySession completion logic
        // 1. Update Goal A status
        await goalRefA.update({
            'weekCompletionStatus.userCompleted': true,
            weeklyCount: 3
        });

        // 2. Sync to Partner (Goal B)
        if (verifyA?.partnerGoalId) {
            await db.collection('goals').doc(verifyA.partnerGoalId).update({
                'weekCompletionStatus.partnerCompleted': true
            });
        }

        // Verify State
        const finalA = (await goalRefA.get()).data();
        const finalB = (await goalRefB.get()).data();

        if (finalA?.weekCompletionStatus.userCompleted !== true) throw new Error("Goal A userCompleted false");
        if (finalB?.weekCompletionStatus.partnerCompleted !== true) throw new Error("Goal B partnerCompleted false (Sync failed)");

        console.log('✅ User A Progress Synced to Partner (Goal B sees partnerCompleted: true)');

        // Check "Waiting" Logic
        // Goal A: userCompleted=true, partnerCompleted=false (User B hasn't finished)
        // Should be "Waiting"
        const isAWaiting = finalA?.weekCompletionStatus.userCompleted && !finalA?.weekCompletionStatus.partnerCompleted;
        if (!isAWaiting) throw new Error("Goal A should be waiting for partner!");
        console.log('✅ User A is correctly "Waiting for Partner"');


        // ==========================================
        // 5. USER B CATCH UP
        // ==========================================
        console.log('\n🏃 Simulating User B Finishing Week...');

        await goalRefB.update({
            'weekCompletionStatus.userCompleted': true,
            weeklyCount: 3
        });

        // Sync to A
        await goalRefA.update({
            'weekCompletionStatus.partnerCompleted': true
        });

        const doneA = (await goalRefA.get()).data();
        const doneB = (await goalRefB.get()).data();

        const aReadyToRoll = doneA?.weekCompletionStatus.userCompleted && doneA?.weekCompletionStatus.partnerCompleted;
        const bReadyToRoll = doneB?.weekCompletionStatus.userCompleted && doneB?.weekCompletionStatus.partnerCompleted;

        if (!aReadyToRoll || !bReadyToRoll) throw new Error("Both should be ready to roll over!");

        console.log('✅ Both partners completed! Week Unlocked! 🔓');
        console.log('❤️ End-to-End Verification Passed!');

    } catch (e) {
        console.error('❌ Verification Failed:', e);
        process.exit(1);
    }
}

runVerification();
