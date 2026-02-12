// Google Analytics 4 - Web Only
import { Platform } from 'react-native';
import ReactGA from 'react-ga4';

const GA_MEASUREMENT_ID = process.env.EXPO_PUBLIC_GA4_MEASUREMENT_ID || '';

/**
 * Initialize Google Analytics 4 (Web Only)
 * This should be called once when the app starts
 */
export const initializeAnalytics = () => {
    if (Platform.OS === 'web' && GA_MEASUREMENT_ID) {
        try {
            ReactGA.initialize(GA_MEASUREMENT_ID, {
                gaOptions: {
                    anonymizeIp: true, // Privacy-friendly
                },
            });
            console.log('✅ Google Analytics initialized');
        } catch (error) {
            console.error('Failed to initialize Google Analytics:', error);
        }
    }
};

/**
 * Track page views
 * @param path - The page path (e.g., '/home', '/goals')
 */
export const trackPageView = (path: string) => {
    if (Platform.OS === 'web' && GA_MEASUREMENT_ID) {
        ReactGA.send({ hitType: 'pageview', page: path });
    }
};

/**
 * Track custom events
 * @param category - Event category (e.g., 'User', 'Goal', 'Payment')
 * @param action - Event action (e.g., 'click', 'submit', 'share')
 * @param label - Optional label for more context
 */
export const trackEvent = (category: string, action: string, label?: string) => {
    if (Platform.OS === 'web' && GA_MEASUREMENT_ID) {
        ReactGA.event({
            category,
            action,
            label,
        });
    }
};

/**
 * Track errors to Google Analytics
 * @param description - Error description
 * @param fatal - Whether the error is fatal (default: false)
 */
export const trackError = (description: string, fatal: boolean = false) => {
    if (Platform.OS === 'web' && GA_MEASUREMENT_ID) {
        ReactGA.event({
            category: 'Error',
            action: fatal ? 'Fatal Error' : 'Non-Fatal Error',
            label: description,
        });
    }
};
