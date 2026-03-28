import { setGlobalOptions } from "firebase-functions";
import { aiGenerateHint } from "./aiGenerateHint";
import { searchUsers } from "./searchUsers";
// Test functions
import { stripeCreatePaymentIntent_Test } from "./stripeCreatePaymentIntent_Test";
import { getGiftsByPaymentIntent_Test } from "./getGiftsByPaymentIntent_Test";
import { stripeWebhook_Test } from "./stripeWebhook_Test";
import { updatePaymentIntentMetadata_Test } from "./updatePaymentIntentMetadata_Test";
import { onNotificationCreated_Test } from "./triggers/onNotificationCreated_Test";
import { checkUnstartedGoals_Test } from "./scheduled/checkUnstartedGoals_Test";
import { sendSessionReminders_Test } from "./scheduled/sendSessionReminders_Test";
import { sendInactivityNudges_Test } from "./scheduled/sendInactivityNudges_Test";
import { sendWeeklyRecap_Test } from "./scheduled/sendWeeklyRecap_Test";
import { sendBookingReminders_Test } from "./scheduled/sendBookingReminders_Test";
import { createFreeGift_Test } from "./createFreeGift_Test";
import { createDeferredGift_Test } from "./createDeferredGift_Test";
import { chargeDeferredGift_Test } from "./triggers/chargeDeferredGift_Test";
import { deleteGoal_Test } from "./deleteGoal_Test";
// Production functions
import { stripeCreatePaymentIntent } from "./stripeCreatePaymentIntent";
import { getGiftsByPaymentIntent } from "./getGiftsByPaymentIntent";
import { stripeWebhook } from "./stripeWebhook";
import { updatePaymentIntentMetadata } from "./updatePaymentIntentMetadata";
import { onNotificationCreated } from "./triggers/onNotificationCreated";
import { checkUnstartedGoals } from "./scheduled/checkUnstartedGoals";
import { sendSessionReminders } from "./scheduled/sendSessionReminders";
import { sendInactivityNudges } from "./scheduled/sendInactivityNudges";
import { sendWeeklyRecap } from "./scheduled/sendWeeklyRecap";
import { sendBookingReminders } from "./scheduled/sendBookingReminders";
import { sendContactEmail } from "./sendContactEmail";
import { createFreeGift } from "./createFreeGift";
import { createDeferredGift } from "./createDeferredGift";
import { chargeDeferredGift } from "./triggers/chargeDeferredGift";
import { retryFailedCharges } from "./retryFailedCharges";

import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

setGlobalOptions({ maxInstances: 10 });

const firebaseApp = admin.initializeApp();

// Test database (ernitclone2)
export const db = getFirestore(firebaseApp, 'ernitclone2');

// Production database (default)
export const dbProd = getFirestore(firebaseApp);

// Export all functions (both test and production)
export {
    // Shared
    aiGenerateHint,
    searchUsers,
    sendContactEmail,
    // Test
    stripeCreatePaymentIntent_Test,
    getGiftsByPaymentIntent_Test,
    stripeWebhook_Test,
    updatePaymentIntentMetadata_Test,
    onNotificationCreated_Test,
    checkUnstartedGoals_Test,
    sendSessionReminders_Test,
    sendInactivityNudges_Test,
    sendWeeklyRecap_Test,
    sendBookingReminders_Test,
    createFreeGift_Test,
    createDeferredGift_Test,
    chargeDeferredGift_Test,
    deleteGoal_Test,
    // Production
    stripeCreatePaymentIntent,
    getGiftsByPaymentIntent,
    stripeWebhook,
    updatePaymentIntentMetadata,
    onNotificationCreated,
    checkUnstartedGoals,
    sendSessionReminders,
    sendInactivityNudges,
    sendWeeklyRecap,
    sendBookingReminders,
    createFreeGift,
    createDeferredGift,
    chargeDeferredGift,
    retryFailedCharges,
};

// Admin functions
export { createExperience } from "./createExperience";
export { updateExperience } from "./updateExperience";
export { deleteExperience } from "./deleteExperience";
export { deleteGoal } from "./deleteGoal";

// B2B functions (ernitxfi database)
export { b2bCreateCompany } from "./b2bCreateCompany";
export { b2bInviteEmployee } from "./b2bInviteEmployee";
export { b2bAcceptInvite } from "./b2bAcceptInvite";
export { b2bCreateGoal } from "./b2bCreateGoal";
export { b2bLogSession } from "./b2bLogSession";
export { b2bGoalMilestone } from "./b2bGoalMilestone";