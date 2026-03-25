import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import * as nodemailer from 'nodemailer';
import * as admin from 'firebase-admin';
import { allowedOrigins } from "./cors";

// Define secrets for email credentials
const EMAIL_USER = defineSecret('EMAIL_USER');
const EMAIL_PASS = defineSecret('EMAIL_PASS');

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

/**
 * Escapes user-controlled strings before injecting them into HTML email bodies.
 * Prevents HTML injection / stored XSS attacks.
 */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Cloud Function to send contact emails with diagnostic logging
 */
export const sendContactEmail = onCall(
    {
        region: 'europe-west1',
        cors: allowedOrigins,
        secrets: [EMAIL_USER, EMAIL_PASS],
    },
    async (request) => {
        logger.info('=== sendContactEmail function started ===');

        // Verify authentication
        if (!request.auth) {
            logger.info('ERROR: No authentication');
            throw new HttpsError(
                'unauthenticated',
                'User must be authenticated to submit contact form'
            );
        }

        // Rate limit: max 5 emails per hour per user
        const db = admin.firestore();
        const rateLimitRef = db.collection('rateLimits').doc(`contact_${request.auth.uid}`);
        const rateLimitDoc = await rateLimitRef.get();
        const now = Date.now();
        const ONE_HOUR = 3600000;

        if (rateLimitDoc.exists) {
            const rateLimitData = rateLimitDoc.data();
            const windowStart = rateLimitData?.windowStart || 0;
            const count = rateLimitData?.count || 0;

            if (now - windowStart < ONE_HOUR && count >= 5) {
                throw new HttpsError('resource-exhausted', 'Too many messages sent. Please try again later.');
            }

            if (now - windowStart >= ONE_HOUR) {
                // Reset window
                await rateLimitRef.set({ windowStart: now, count: 1 });
            } else {
                await rateLimitRef.update({ count: count + 1 });
            }
        } else {
            await rateLimitRef.set({ windowStart: now, count: 1 });
        }

        const data = request.data as ContactSubmission;
        const { type, subject, message, userMetadata } = data;

        // SECURITY: Use server-verified identity, not client-supplied values
        const verifiedUserId = request.auth!.uid;
        const verifiedEmail = request.auth!.token.email || userMetadata?.email || 'unknown';
        const verifiedDisplayName = userMetadata?.displayName || 'Unknown User';

        logger.info(`Request from user: ${verifiedUserId}, type: ${type}`);

        // Validate input
        if (!type || !subject || !message) {
            logger.info('ERROR: Missing required fields');
            throw new HttpsError(
                'invalid-argument',
                'Missing required fields: type, subject, or message'
            );
        }

        if (type !== 'feedback' && type !== 'support') {
            logger.info('ERROR: Invalid type');
            throw new HttpsError(
                'invalid-argument',
                'Invalid type. Must be "feedback" or "support"'
            );
        }

        // Add string type and length validation
        if (typeof subject !== 'string' || subject.length > 200) {
            throw new HttpsError('invalid-argument', 'Subject must be a string under 200 characters');
        }
        if (typeof message !== 'string' || message.length > 5000) {
            throw new HttpsError('invalid-argument', 'Message must be under 5000 characters');
        }

        const emailUser = EMAIL_USER.value();
        const emailPass = EMAIL_PASS.value();

        if (!emailUser || !emailPass) {
            logger.error('Email credentials not configured');
            throw new HttpsError(
                'failed-precondition',
                'Email service not configured'
            );
        }

        const recipientEmail = type === 'feedback'
            ? 'feedback@ernit.app'
            : 'support@ernit.app';

        logger.info(`Recipient: ${recipientEmail}`);

        try {
            logger.info('Creating transporter...');
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: emailUser,
                    pass: emailPass,
                },
            });

            const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #8b5cf6 0%, #6b46c1 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .user-info { background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #8b5cf6; }
    .message-box { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .metadata { background: #f3f4f6; padding: 15px; border-radius: 8px; font-size: 12px; color: #6b7280; }
    .label { font-weight: bold; color: #8b5cf6; }
    h1 { margin: 0; font-size: 24px; }
    h2 { color: #374151; font-size: 18px; margin-top: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔔 ${type === 'feedback' ? 'New Feedback' : 'Support Request'}</h1>
    </div>
    <div class="content">
      <div class="user-info">
        <p><span class="label">From:</span> ${escapeHtml(verifiedDisplayName)}</p>
        <p><span class="label">Email:</span> ${escapeHtml(verifiedEmail)}</p>
        <p><span class="label">User ID:</span> ${escapeHtml(verifiedUserId)}</p>
      </div>

      <div class="message-box">
        <h2>${escapeHtml(subject)}</h2>
        <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
      </div>

      <div class="metadata">
        <p><strong>Metadata:</strong></p>
        <p>⏰ Timestamp: ${escapeHtml(userMetadata?.timestamp || '')}</p>
        <p>📱 Platform: ${escapeHtml(userMetadata?.platform || '')}</p>
        <p>📦 App Version: ${escapeHtml(userMetadata?.appVersion || '')}</p>
      </div>
    </div>
  </div>
</body>
</html>`;

            const mailOptions = {
                from: `Ernit App <redirect@ernit.app>`, // Send from redirect so it arrives as unread
                to: recipientEmail,
                replyTo: verifiedEmail,
                subject: `[${type.toUpperCase()}] ${escapeHtml(subject)}`,
                html: emailHtml,
            };

            logger.info('Sending email...');
            const startTime = Date.now();
            const info = await transporter.sendMail(mailOptions);
            const duration = Date.now() - startTime;

            logger.info(`=== Email sent successfully in ${duration}ms ===`);
            logger.info(`Message ID: ${info.messageId}`);

            return {
                success: true,
                message: 'Email sent successfully',
            };
        } catch (error) {
            logger.error('=== ERROR in sendContactEmail ===');
            logger.error('Error details:', error);
            throw new HttpsError(
                'internal',
                'Failed to send email. Please try again later.'
            );
        }
    }
);
