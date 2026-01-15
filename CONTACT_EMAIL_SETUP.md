# Contact Email Setup Guide

This guide will help you configure and deploy the contact email functionality for feedback and support requests.

## Prerequisites

- Firebase CLI installed and authenticated
- Gmail account or SMTP service credentials

## Step 1: Configure Email Credentials

The Cloud Function uses environment variables to store email credentials securely. You have two options:

### Option A: Using Gmail (Recommended for Development)

1. **Create a Gmail App Password** (if using Gmail):
   - Go to your Google Account settings
   - Navigate to Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
   - Copy the 16-character password

2. **Set Firebase Function Configuration**:
   ```bash
   # Navigate to your project root
   cd d:\ErnitAppWeb_Test

   # Set the email configuration
   firebase functions:config:set email.user="your-email@gmail.com" email.pass="your-app-password"
   ```

### Option B: Using Another Email Service

If you're using a different email provider (SendGrid, Mailgun, etc.), you'll need to:

1. Modify `functions/src/sendContactEmail.ts`
2. Update the `transporter` configuration with your SMTP settings
3. Set appropriate config values

## Step 2: Update Recipient Email Addresses

Edit `functions/src/sendContactEmail.ts` and replace the placeholder emails:

```typescript
// Line ~62-64
const recipientEmail = type === 'feedback' 
  ? 'feedback@ernit.app'  // Replace with your actual feedback email
  : 'support@ernit.app';  // Replace with your actual support email
```

## Step 3: Build and Deploy

```bash
# Navigate to functions directory
cd functions

# Build the TypeScript code
npm run build

# Deploy to Firebase (production)
firebase deploy --only functions:sendContactEmail

# Or deploy all functions
firebase deploy --only functions
```

## Step 4: Verify Deployment

After deployment, verify the function is working:

1. Check Firebase Console → Functions to see if `sendContactEmail` is deployed
2. Test the function by submitting feedback/support from the app
3. Check the Firebase Functions logs for any errors:
   ```bash
   firebase functions:log --only sendContactEmail
   ```

## Testing Locally (Optional)

To test the function locally before deploying:

```bash
# Start Firebase emulators
cd d:\ErnitAppWeb_Test
firebase emulators:start --only functions

# Update your app to point to the emulator
# In src/services/ContactService.ts, uncomment the following:
# import { connectFunctionsEmulator } from 'firebase/functions';
# connectFunctionsEmulator(functions, 'localhost', 5001);
```

## Environment-Specific Configuration

For different environments (test vs production):

```bash
# Test environment
firebase functions:config:set email.user="test-support@ernit.app" --project your-test-project

# Production environment  
firebase functions:config:set email.user="support@ernit.app" --project your-prod-project
```

## Troubleshooting

### "Email service not configured" Error
- Make sure you've run `firebase functions:config:set` commands
- Redeploy the function after setting config
- Check config with: `firebase functions:config:get`

### Emails Not Sending
- Check Firebase Functions logs: `firebase functions:log`
- Verify Gmail app password is correct
- Check spam folder for test emails
- Ensure "Less secure app access" is enabled (for Gmail)

### Rate Limiting
Gmail has sending limits (~500 emails/day for free accounts). For production:
- Use a professional email service (SendGrid, Mailgun, AWS SES)
- Implement rate limiting in the Cloud Function

## Cost Considerations

- Firebase Functions: Free tier includes 2M invocations/month
- Each email sent = 1 function invocation
- Monitor usage in Firebase Console → Usage and billing

## Security Notes

- Never commit email credentials to version control
- Use Firebase Functions config for sensitive data
- The function validates user authentication before sending
- Consider implementing rate limiting to prevent abuse

## Next Steps

After deployment:
1. Test the feedback flow from the app
2. Test the support flow from the app
3. Verify emails arrive at the correct addresses
4. Check email formatting looks good
5. Monitor function logs for any issues
