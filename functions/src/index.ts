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
import { sendContactEmail } from "./sendContactEmail";

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
};

// Admin functions
export { createExperience } from "./createExperience";
export { updateExperience } from "./updateExperience";
export { deleteExperience } from "./deleteExperience";