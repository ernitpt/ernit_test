import { setGlobalOptions } from "firebase-functions";
import { aiGenerateHint } from "./aiGenerateHint";
import { stripeCreatePaymentIntent_Test } from "./stripeCreatePaymentIntent_Test";
import { getGiftsByPaymentIntent_Test } from "./getGiftsByPaymentIntent_Test";
import { stripeWebhook_Test } from "./stripeWebhook_Test";
import { updatePaymentIntentMetadata_Test } from "./updatePaymentIntentMetadata_Test";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

setGlobalOptions({ maxInstances: 10 });

const firebaseApp = admin.initializeApp();
export const db = getFirestore(firebaseApp, 'ernitclone2');

export { aiGenerateHint, stripeCreatePaymentIntent_Test, getGiftsByPaymentIntent_Test, stripeWebhook_Test, updatePaymentIntentMetadata_Test };