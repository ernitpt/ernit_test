import {setGlobalOptions} from "firebase-functions";
import {aiGenerateHint} from "./aiGenerateHint";
import {stripeCreatePaymentIntent_Test} from "./stripeCreatePaymentIntent_Test";
import {getGiftsByPaymentIntent} from "./getGiftsByPaymentIntent";
import {stripeWebhook_Test} from "./stripeWebhook_Test";
import {updatePaymentIntentMetadata_Test} from "./updatePaymentIntentMetadata_Test";

setGlobalOptions({maxInstances: 10});

export {aiGenerateHint, stripeCreatePaymentIntent_Test, getGiftsByPaymentIntent, stripeWebhook_Test, updatePaymentIntentMetadata_Test};