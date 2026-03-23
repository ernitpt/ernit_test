/**
 * B2B Cloud Functions config.
 * All B2B data lives in the named Firestore database 'ernitxfi',
 * separate from the default B2C database.
 */
import { getFirestore } from "firebase-admin/firestore";

/** Firestore instance for the ernitxfi (B2B) database */
export const b2bDb = getFirestore("ernitxfi");
