/**
 * Environment Configuration
 *
 * Switch between test/production by changing EXPO_PUBLIC_APP_ENV
 *
 * What changes:
 * - Function names: stripeCreatePaymentIntent_Test → stripeCreatePaymentIntent
 * - Debug: true → false
 * - Firestore: uses default database in production
 */

import { logger } from '../utils/logger';

type Environment = 'test' | 'production';

// Default to 'test' unless explicitly set to 'production'
// This ensures development and test deployments use test functions
const rawEnvValue = process.env.EXPO_PUBLIC_APP_ENV;
const envValue = rawEnvValue?.trim().replace(/['"]/g, ''); // Remove quotes and whitespace

const APP_ENV: Environment = envValue === 'production' ? 'production' : 'test';

if (envValue !== undefined && envValue !== 'production' && envValue !== 'test') {
    logger.warn(`⚠️ Unrecognized EXPO_PUBLIC_APP_ENV value: "${envValue}". Defaulting to 'test'.`);
}


interface EnvironmentConfig {
    name: Environment;
    isProduction: boolean;

    // Cloud function names
    functionsUrl: string;
    stripeFunctions: {
        createPaymentIntent: string;
        updatePaymentIntentMetadata: string;
        getGiftsByPaymentIntent: string;
        webhook: string;
    };

    // Gift flow function names
    giftFunctions: {
        createFreeGift: string;
        createDeferredGift: string;
    };

    // Debug settings
    debugEnabled: boolean;
}

// Allow overriding functions URL via env var (useful for region migration or staging)
const functionsUrlOverride = process.env.EXPO_PUBLIC_FUNCTIONS_URL?.trim().replace(/['"]/g, '');

const configs: Record<Environment, EnvironmentConfig> = {
    test: {
        name: 'test',
        isProduction: false,
        functionsUrl: functionsUrlOverride || 'https://europe-west1-ernit-3fc0b.cloudfunctions.net',
        stripeFunctions: {
            createPaymentIntent: 'stripeCreatePaymentIntent_Test',
            updatePaymentIntentMetadata: 'updatePaymentIntentMetadata_Test',
            getGiftsByPaymentIntent: 'getGiftsByPaymentIntent_Test',
            webhook: 'stripeWebhook_Test',
        },
        giftFunctions: {
            createFreeGift: 'createFreeGift_Test',
            createDeferredGift: 'createDeferredGift_Test',
        },
        debugEnabled: true,
    },
    production: {
        name: 'production',
        isProduction: true,
        functionsUrl: functionsUrlOverride || 'https://europe-west1-ernit-3fc0b.cloudfunctions.net',
        stripeFunctions: {
            createPaymentIntent: 'stripeCreatePaymentIntent',
            updatePaymentIntentMetadata: 'updatePaymentIntentMetadata',
            getGiftsByPaymentIntent: 'getGiftsByPaymentIntent',
            webhook: 'stripeWebhook',
        },
        giftFunctions: {
            createFreeGift: 'createFreeGift',
            createDeferredGift: 'createDeferredGift',
        },
        debugEnabled: false,
    },
};

export const config = configs[APP_ENV];
export const isProduction = config.isProduction;
export const isTest = !config.isProduction;

// Log environment on startup (test only)
if (!config.isProduction) {
    logger.log(`🔧 Environment: ${config.name.toUpperCase()}`);
}
