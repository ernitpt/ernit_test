import { setGlobalOptions } from "firebase-functions";
import { aiGenerateHint } from "./aiGenerateHint";
import { searchUsers } from "./searchUsers";
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
import { onUserDeleted } from "./triggers/onUserDeleted";
import { retryFailedCharges } from "./retryFailedCharges";

import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

setGlobalOptions({ maxInstances: 10 });

const firebaseApp = admin.initializeApp();

// Production database (default)
export const dbProd = getFirestore(firebaseApp);

// Test database (ernitclone2) — initialized at module level so that
// `import { db } from './index'` always resolves in test function files.
// This is a Firestore reference only; no network connection is made until
// a query is executed, so it is harmless in production (where the emulator
// guard below prevents any test functions from being registered or called).
export const db = getFirestore(firebaseApp, 'ernitclone2');

// Test functions — only registered as Cloud Function exports in the local emulator
if (process.env.FUNCTIONS_EMULATOR === 'true') {
    const { stripeCreatePaymentIntent_Test } = require("./stripeCreatePaymentIntent_Test");
    const { getGiftsByPaymentIntent_Test } = require("./getGiftsByPaymentIntent_Test");
    const { stripeWebhook_Test } = require("./stripeWebhook_Test");
    const { updatePaymentIntentMetadata_Test } = require("./updatePaymentIntentMetadata_Test");
    const { onNotificationCreated_Test } = require("./triggers/onNotificationCreated_Test");
    const { checkUnstartedGoals_Test } = require("./scheduled/checkUnstartedGoals_Test");
    const { sendSessionReminders_Test } = require("./scheduled/sendSessionReminders_Test");
    const { sendInactivityNudges_Test } = require("./scheduled/sendInactivityNudges_Test");
    const { sendWeeklyRecap_Test } = require("./scheduled/sendWeeklyRecap_Test");
    const { sendBookingReminders_Test } = require("./scheduled/sendBookingReminders_Test");
    const { createFreeGift_Test } = require("./createFreeGift_Test");
    const { createDeferredGift_Test } = require("./createDeferredGift_Test");
    const { chargeDeferredGift_Test } = require("./triggers/chargeDeferredGift_Test");
    const { deleteGoal_Test } = require("./deleteGoal_Test");

    exports.stripeCreatePaymentIntent_Test = stripeCreatePaymentIntent_Test;
    exports.getGiftsByPaymentIntent_Test = getGiftsByPaymentIntent_Test;
    exports.stripeWebhook_Test = stripeWebhook_Test;
    exports.updatePaymentIntentMetadata_Test = updatePaymentIntentMetadata_Test;
    exports.onNotificationCreated_Test = onNotificationCreated_Test;
    exports.checkUnstartedGoals_Test = checkUnstartedGoals_Test;
    exports.sendSessionReminders_Test = sendSessionReminders_Test;
    exports.sendInactivityNudges_Test = sendInactivityNudges_Test;
    exports.sendWeeklyRecap_Test = sendWeeklyRecap_Test;
    exports.sendBookingReminders_Test = sendBookingReminders_Test;
    exports.createFreeGift_Test = createFreeGift_Test;
    exports.createDeferredGift_Test = createDeferredGift_Test;
    exports.chargeDeferredGift_Test = chargeDeferredGift_Test;
    exports.deleteGoal_Test = deleteGoal_Test;
}

// Export all production functions
export {
    // Shared
    aiGenerateHint,
    searchUsers,
    sendContactEmail,
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
    onUserDeleted,
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