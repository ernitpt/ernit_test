import * as nodemailer from 'nodemailer';
import { defineSecret } from 'firebase-functions/params';

// Define secrets for general email credentials (used for transactional emails like Valentine codes)
const GENERAL_EMAIL_USER = defineSecret('GENERAL_EMAIL_USER');
const GENERAL_EMAIL_PASS = defineSecret('GENERAL_EMAIL_PASS');

/**
 * Send email using nodemailer with Gmail
 */
export async function sendEmail(
    to: string,
    subject: string,
    html: string
): Promise<void> {
    const emailUser = GENERAL_EMAIL_USER.value();
    const emailPass = GENERAL_EMAIL_PASS.value();

    if (!emailUser || !emailPass) {
        console.error('❌ General email credentials missing');
        throw new Error('General email service not configured');
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: emailUser,
            pass: emailPass,
        },
    });

    const mailOptions = {
        from: `Ernit <info@ernit.app>`,
        to,
        subject,
        html,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${to}, messageId: ${info.messageId}`);
    } catch (error) {
        console.error(`❌ Failed to send email to ${to}:`, error);
        throw error;
    }
}

// Export secrets for use in webhooks and other functions
export { GENERAL_EMAIL_USER, GENERAL_EMAIL_PASS };
