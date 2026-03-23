/**
 * Shared CORS configuration for Cloud Functions.
 * Localhost origins are only included when running in the Firebase emulator.
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

/** Whether we're running in the Firebase emulator */
const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

/** CORS origins to use in all Cloud Functions.
 * Dev origins (localhost) are always included — they cannot be spoofed
 * remotely and are needed for local dev against deployed functions. */
export const allowedOrigins: string[] = [...DEV_ORIGINS, ...PRODUCTION_ORIGINS];
