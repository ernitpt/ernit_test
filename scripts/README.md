# Seed Experiences Script

This script seeds the Firestore database with experience data.

## Setup

### Option 1: Using Service Account Key File (Recommended for local development)

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Save the JSON file as `serviceAccountKey.json` in the `scripts` directory
4. Update `seedExperiences.js` line 10 to uncomment the credential line:
   ```javascript
   credential: admin.credential.cert('./serviceAccountKey.json'),
   ```

### Option 2: Using Environment Variable

1. Download your service account key JSON file
2. Set the environment variable before running:
   ```bash
   # Windows PowerShell
   $env:GOOGLE_APPLICATION_CREDENTIALS="path\to\serviceAccountKey.json"
   node seedExperiences.js
   
   # Windows CMD
   set GOOGLE_APPLICATION_CREDENTIALS=path\to\serviceAccountKey.json
   node seedExperiences.js
   ```

## Running the Script

```bash
cd scripts
node seedExperiences.js
```

## Notes

- Make sure `firebase-admin` is installed: `npm install firebase-admin`
- The script targets the `ernitclone` database
- Never commit `serviceAccountKey.json` to version control (it's in .gitignore)
