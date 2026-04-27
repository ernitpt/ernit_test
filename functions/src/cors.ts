/**
 * Shared CORS configuration for Cloud Functions.
 * Localhost origins are always included so developers running the web app on
 * localhost can call deployed functions during test-environment work. Functions
 * still enforce auth + rate limits, so localhost in CORS isn't a real attack
 * surface — an attacker on localhost would need a valid user token anyway.
 */

const PRODUCTION_ORIGINS = [
  "https://ernit-nine.vercel.app",
  "https://ernit981723498127658912765187923546.vercel.app",
  "https://ernit.app",
  "https://ernit.xyz",
  "https://ernitpartner.vercel.app",
  "https://teams.ernit.app",
];

const DEV_ORIGINS = [
  "http://localhost:8081",
  "http://localhost:3000",
];

/** CORS origins to use in all Cloud Functions. */
export const allowedOrigins: string[] = [...PRODUCTION_ORIGINS, ...DEV_ORIGINS];
