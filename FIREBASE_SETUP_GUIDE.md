# Firebase Setup Guide for Ernit MVP

## 🔥 Complete Firebase Configuration Walkthrough

This guide will walk you through setting up Firebase with environment variables for your Ernit MVP app.

## Step 1: Create a Firebase Project

1. **Go to Firebase Console**
   - Visit [https://console.firebase.google.com/](https://console.firebase.google.com/)
   - Sign in with your Google account

2. **Create New Project**
   - Click "Create a project"
   - Enter project name: `ernit-mvp` (or your preferred name)
   - Disable Google Analytics for now (you can enable later)
   - Click "Create project"

## Step 2: Enable Required Services

### Authentication
1. In Firebase Console, go to "Authentication" → "Sign-in method"
2. Enable "Email/Password" provider
3. Click "Save"

### Firestore Database
1. Go to "Firestore Database" → "Create database"
2. Choose "Start in test mode" (for development)
3. Select a location close to your users
4. Click "Done"

### Storage
1. Go to "Storage" → "Get started"
2. Choose "Start in test mode"
3. Select the same location as Firestore
4. Click "Done"

### Cloud Functions (Optional)
1. Go to "Functions" → "Get started"
2. Follow the setup instructions if you want to use Cloud Functions for AI hints

## Step 3: Get Your Firebase Configuration

1. **Go to Project Settings**
   - Click the gear icon → "Project settings"
   - Scroll down to "Your apps" section

2. **Add Web App**
   - Click "Add app" → Web icon (`</>`)
   - Enter app nickname: `Ernit MVP`
   - Check "Also set up Firebase Hosting" (optional)
   - Click "Register app"

3. **Copy Configuration**
   - You'll see a config object like this:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSyC...",
     authDomain: "ernit-mvp.firebaseapp.com",
     projectId: "ernit-mvp",
     storageBucket: "ernit-mvp.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef123456"
   };
   ```

## Step 4: Configure Your App

### Option A: Using app.json (Recommended for Expo)
Update the `extra` section in your `app.json` file:

```json
{
  "expo": {
    "extra": {
      "firebaseApiKey": "AIzaSyC...",
      "firebaseAuthDomain": "ernit-mvp.firebaseapp.com",
      "firebaseProjectId": "ernit-mvp",
      "firebaseStorageBucket": "ernit-mvp.appspot.com",
      "firebaseMessagingSenderId": "123456789",
      "firebaseAppId": "1:123456789:web:abcdef123456"
    }
  }
}
```

### Option B: Using Environment Variables
Create a `.env` file in your project root:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyC...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=ernit-mvp.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=ernit-mvp
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=ernit-mvp.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef123456
```

## Step 5: Security Rules (Important!)

### Firestore Rules
Go to "Firestore Database" → "Rules" and update:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Experience gifts
    match /experienceGifts/{giftId} {
      allow read, write: if request.auth != null;
    }
    
    // Goals
    match /goals/{goalId} {
      allow read, write: if request.auth != null;
    }
    
    // Hints
    match /hints/{hintId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Storage Rules
Go to "Storage" → "Rules" and update:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Step 6: Test Your Configuration

1. **Start your app**:
   ```bash
   npm start
   ```

2. **Check the console** for any Firebase configuration errors

3. **Test Authentication**:
   - Try signing up with a test email
   - Check Firebase Console → Authentication to see if user was created

## Step 7: Environment Variables Best Practices

### For Development
- Use `app.json` extra section for local development
- Keep sensitive data out of version control

### For Production
- Use environment variables in your deployment platform
- Never commit real Firebase credentials to Git

### Security Tips
- Firebase API keys are safe to expose in client apps
- The real security comes from Firestore/Storage rules
- Never put sensitive server-side keys in client code

## Troubleshooting

### Common Issues

1. **"Firebase configuration is incomplete"**
   - Check that all required fields are filled in `app.json`
   - Make sure there are no typos in the configuration

2. **Authentication not working**
   - Verify Email/Password is enabled in Firebase Console
   - Check Firestore rules allow authenticated users

3. **Permission denied errors**
   - Update Firestore/Storage security rules
   - Make sure user is authenticated before accessing data

### Debug Steps
1. Check browser/app console for error messages
2. Verify Firebase project ID matches in all places
3. Test with Firebase Console to see if data is being written
4. Check network tab for failed requests

## Next Steps

Once Firebase is configured:
1. Test user authentication flow
2. Test creating experience gifts
3. Test goal setting and progress tracking
4. Set up Cloud Functions for AI hints (optional)

## Support

If you run into issues:
1. Check Firebase Console for error logs
2. Review Expo documentation for environment variables
3. Check Firebase documentation for your specific service

Happy coding! 🚀
