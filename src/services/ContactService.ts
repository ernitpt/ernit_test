import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { logger } from '../utils/logger';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

interface ContactSubmission {
    type: 'feedback' | 'support';
    subject: string;
    message: string;
    userMetadata: {
        userId: string;
        email: string;
        displayName: string;
        timestamp: string;
        platform: string;
        appVersion: string;
    };
}

class ContactService {
    /**
     * Submit feedback to the backend
     */
    async submitFeedback(subject: string, message: string): Promise<void> {
        return this.submitContact('feedback', subject, message);
    }

    /**
     * Submit support request to the backend
     */
    async submitSupport(subject: string, message: string): Promise<void> {
        return this.submitContact('support', subject, message);
    }

    /**
     * Generic contact submission handler
     */
    private async submitContact(
        type: 'feedback' | 'support',
        subject: string,
        message: string
    ): Promise<void> {
        try {
            const auth = getAuth();
            const user = auth.currentUser;

            if (!user) {
                throw new Error('User must be authenticated to submit contact form');
            }

            // Gather user metadata
            const userMetadata = {
                userId: user.uid,
                email: user.email || 'No email',
                displayName: user.displayName || 'Anonymous User',
                timestamp: new Date().toISOString(),
                platform: Platform.OS,
                appVersion: Constants.expoConfig?.version || 'Unknown',
            };

            const submission: ContactSubmission = {
                type,
                subject,
                message,
                userMetadata,
            };

            // Call Firebase Cloud Function (deployed in europe-west1)
            const functions = getFunctions(undefined, 'europe-west1');
            const sendContactEmail = httpsCallable(functions, 'sendContactEmail');

            logger.log(`Submitting ${type} message:`, { subject });

            const result = await sendContactEmail(submission);

            logger.log(`${type} submitted successfully:`, result.data);
        } catch (error) {
            logger.error(`Error submitting ${type}:`, error);
            throw error;
        }
    }
}

export const contactService = new ContactService();
