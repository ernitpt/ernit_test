# Email Configuration

## General Email System (info@ernit.app)

The general email system is used for transactional emails including:
- Valentine's Challenge redemption codes
- Future transactional emails (order confirmations, password resets, etc.)

**Separate from:** Support/feedback emails which use `EMAIL_USER` and `EMAIL_PASS`

---

## Setup Instructions

### 1. Get Gmail App Password

For the `info@ernit.app` account:

1. Sign in to `info@ernit.app` Google Account
2. Navigate to **Security** → **2-Step Verification** (must be enabled)
3. Scroll down to **App passwords**
4. Generate new app password:
   - App: Mail
   - Device: Firebase Functions (General)
5. Copy the 16-character password (e.g., `xxxx xxxx xxxx xxxx`)

### 2. Set Firebase Secrets

```bash
# Set the general email address
firebase functions:secrets:set GENERAL_EMAIL_USER
# Enter: info@ernit.app

# Set the app password (remove spaces)
firebase functions:secrets:set GENERAL_EMAIL_PASS
# Enter: your-16-char-password
```

### 3. Deploy Functions

```bash
cd functions
npm run build
firebase deploy --only functions
```

---

## Current Email Secrets

| Secret Name | Purpose | Email Account |
|------------|---------|---------------|
| `EMAIL_USER` / `EMAIL_PASS` | Support & Feedback | (existing account) |
| `GENERAL_EMAIL_USER` / `GENERAL_EMAIL_PASS` | Transactional emails | info@ernit.app |

---

## Testing

After deployment, test the Valentine flow:
1. Make a test Valentine purchase
2. Check both email addresses receive codes
3. Verify sender shows as "Ernit <info@ernit.app>"
4. Confirm codes match Firestore `valentineChallenges` collection
5. Check emails are not in spam folder

View logs:
```bash
firebase functions:log
```
