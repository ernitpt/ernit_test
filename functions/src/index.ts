import { setGlobalOptions } from "firebase-functions";
import { aiGenerateHint } from "./aiGenerateHint";
// Test functions
import { stripeCreatePaymentIntent_Test } from "./stripeCreatePaymentIntent_Test";
import { getGiftsByPaymentIntent_Test } from "./getGiftsByPaymentIntent_Test";
import { stripeWebhook_Test } from "./stripeWebhook_Test";
import { updatePaymentIntentMetadata_Test } from "./updatePaymentIntentMetadata_Test";
import { onNotificationCreated_Test } from "./triggers/onNotificationCreated_Test";
import { checkUnstartedGoals_Test } from "./scheduled/checkUnstartedGoals_Test";
// Production functions
import { stripeCreatePaymentIntent } from "./stripeCreatePaymentIntent";
import { getGiftsByPaymentIntent } from "./getGiftsByPaymentIntent";
import { stripeWebhook } from "./stripeWebhook";
import { updatePaymentIntentMetadata } from "./updatePaymentIntentMetadata";
import { onNotificationCreated } from "./triggers/onNotificationCreated";
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
    sendContactEmail,
    // Test
    stripeCreatePaymentIntent_Test,
    getGiftsByPaymentIntent_Test,
    stripeWebhook_Test,
    updatePaymentIntentMetadata_Test,
    onNotificationCreated_Test,
    checkUnstartedGoals_Test,
    // Production
    stripeCreatePaymentIntent,
    getGiftsByPaymentIntent,
    stripeWebhook,
    updatePaymentIntentMetadata,
    onNotificationCreated,
};