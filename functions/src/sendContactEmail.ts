import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as nodemailer from 'nodemailer';

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
 * Cloud Function to send contact emails with diagnostic logging
 */
export const sendContactEmail = onCall(
    {
        region: 'europe-west1',
        cors: [
            'http://localhost:8081',
            'http://localhost:3000',
            'https://ernit-nine.vercel.app',
            'https://ernit.app',
        ],
        secrets: [EMAIL_USER, EMAIL_PASS],
    },
    async (request) => {
        console.log('=== sendContactEmail function started ===');

        // Verify authentication
        if (!request.auth) {
            console.log('ERROR: No authentication');
            throw new HttpsError(
                'unauthenticated',
                'User must be authenticated to submit contact form'
            );
        }

        const data = request.data as ContactSubmission;
        const { type, subject, message, userMetadata } = data;

        console.log(`Request from user: ${userMetadata.userId}, type: ${type}`);

        // Validate input
        if (!type || !subject || !message) {
            console.log('ERROR: Missing required fields');
            throw new HttpsError(
                'invalid-argument',
                'Missing required fields: type, subject, or message'
            );
        }

        if (type !== 'feedback' && type !== 'support') {
            console.log('ERROR: Invalid type');
            throw new HttpsError(
                'invalid-argument',
                'Invalid type. Must be "feedback" or "support"'
            );
        }

        console.log('Getting secrets...');
        const emailUser = EMAIL_USER.value();
        const emailPass = EMAIL_PASS.value();

        console.log(`Secrets retrieved: user=${emailUser ? 'YES' : 'NO'}, pass=${emailPass ? 'YES' : 'NO'}`);

        if (!emailUser || !emailPass) {
            console.error('ERROR: Email credentials missing');
            throw new HttpsError(
                'failed-precondition',
                'Email service not configured'
            );
        }

        const recipientEmail = type === 'feedback'
            ? 'feedback@ernit.app'
            : 'support@ernit.app';

        console.log(`Recipient: ${recipientEmail}`);

        try {
            console.log('Creating transporter...');
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
        <p><span class="label">From:</span> ${userMetadata.displayName}</p>
        <p><span class="label">Email:</span> ${userMetadata.email}</p>
        <p><span class="label">User ID:</span> ${userMetadata.userId}</p>
      </div>
      
      <div class="message-box">
        <h2>${subject}</h2>
        <p style="white-space: pre-wrap;">${message}</p>
      </div>
      
      <div class="metadata">
        <p><strong>Metadata:</strong></p>
        <p>⏰ Timestamp: ${userMetadata.timestamp}</p>
        <p>📱 Platform: ${userMetadata.platform}</p>
        <p>📦 App Version: ${userMetadata.appVersion}</p>
      </div>
    </div>
  </div>
</body>
</html>`;

            const mailOptions = {
                from: `Ernit App <redirect@ernit.app>`, // Send from redirect so it arrives as unread
                to: recipientEmail,
                replyTo: userMetadata.email,
                subject: `[${type.toUpperCase()}] ${subject}`,
                html: emailHtml,
            };

            console.log('Sending email...');
            const startTime = Date.now();
            const info = await transporter.sendMail(mailOptions);
            const duration = Date.now() - startTime;

            console.log(`=== Email sent successfully in ${duration}ms ===`);
            console.log(`Message ID: ${info.messageId}`);

            return {
                success: true,
                message: 'Email sent successfully',
                messageId: info.messageId,
                duration,
            };
        } catch (error) {
            console.error('=== ERROR in sendContactEmail ===');
            console.error('Error details:', error);
            throw new HttpsError(
                'internal',
                `Failed to send email: ${error}`
            );
        }
    }
);
