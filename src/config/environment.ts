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

type Environment = 'test' | 'production';

// Default to 'test' unless explicitly set to 'production'
// This ensures development and test deployments use test functions
const rawEnvValue = process.env.EXPO_PUBLIC_APP_ENV;
const envValue = rawEnvValue?.trim().replace(/['"]/g, ''); // Remove quotes and whitespace

const APP_ENV: Environment = envValue === 'production' ? 'production' : 'test';


interface EnvironmentConfig {
    name: Environment;
    isProduction: boolean;

    // Cloud function names
    functionsUrl: string;
    stripeFunctions: {
        createPaymentIntent: string;
        createValentinePaymentIntent: string;
        updatePaymentIntentMetadata: string;
        getGiftsByPaymentIntent: string;
        webhook: string;
    };

    // Debug settings
    debugEnabled: boolean;
}

const configs: Record<Environment, EnvironmentConfig> = {
    test: {
        name: 'test',
        isProduction: false,
        functionsUrl: 'https://europe-west1-ernit-3fc0b.cloudfunctions.net',
        stripeFunctions: {
            createPaymentIntent: 'stripeCreatePaymentIntent_Test',
            createValentinePaymentIntent: 'stripeCreateValentinePaymentIntent_Test',
            updatePaymentIntentMetadata: 'updatePaymentIntentMetadata_Test',
            getGiftsByPaymentIntent: 'getGiftsByPaymentIntent_Test',
            webhook: 'stripeWebhook_Test',
        },
        debugEnabled: true,
    },
    production: {
        name: 'production',
        isProduction: true,
        functionsUrl: 'https://europe-west1-ernit-3fc0b.cloudfunctions.net',
        stripeFunctions: {
            createPaymentIntent: 'stripeCreatePaymentIntent',
            createValentinePaymentIntent: 'stripeCreateValentinePaymentIntent',
            updatePaymentIntentMetadata: 'updatePaymentIntentMetadata',
            getGiftsByPaymentIntent: 'getGiftsByPaymentIntent',
            webhook: 'stripeWebhook',
        },
        debugEnabled: false,
    },
};

export const config = configs[APP_ENV];
export const isProduction = config.isProduction;
export const isTest = !config.isProduction;

// Log environment on startup (test only)
if (!config.isProduction) {
    console.log(`🔧 Environment: ${config.name.toUpperCase()}`);
}
