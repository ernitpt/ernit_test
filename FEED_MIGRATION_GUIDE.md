# Feed Backfill Migration - Usage Guide

## Overview
This migration script generates historical feed posts from existing goal data to ensure users don't start with an empty feed when you deploy to production.

**Strategy:** Recent + Completions
- Feed posts from last 30 days of goal activity
- All completed goals (regardless of date)

---

## Prerequisites

1. **Firebase Admin SDK Key**
   - Download from Firebase Console → Project Settings → Service Accounts
   - Save as `ernit-3fc0b-firebase-adminsdk.json` in project root
   - **DO NOT commit this file** (already in .gitignore)

2. **Build TypeScript**
   - Migration uses compiled JavaScript
   - Automatically handled by npm scripts

---

## Usage

### Step 1: Preview (Dry Run)
```bash
npm run migrate:feed:preview
```

**What it does:**
- ✅ Scans all goals in database
- ✅ Shows how many posts would be created
- ✅ Displays sample post data
- ❌ Does NOT write to database

**Expected output:**
```
🚀 Starting feed backfill migration (DRY RUN)
📅 Scope: Last 30 days + All completions
📊 Found 47 total goals

📈 Processed 10/47 goals...
📈 Processed 20/47 goals...
...

============================================================
   MIGRATION COMPLETE
============================================================

📊 Statistics:
   Goals processed:        47
   Progress posts created: 134
   Completion posts:       12
   Skipped:                2
   Errors:                 0
   TOTAL POSTS:            146

✅ Dry run complete - no data was written
💡 Run with execute flag to perform migration
```

### Step 2: Execute Migration
```bash
npm run migrate:feed
```

**What it does:**
- ✅ Creates actual feed posts in Firestore
- ✅ Batches writes for performance (500 per batch)
- ✅ Skips duplicates (won't create if post already exists)
- ✅ Logs progress and errors

**Duration:** ~2-5 minutes depending on data size

---

## Safety Features

1. **Duplicate Prevention**
   - Checks if post exists before creating
   - Safe to run multiple times

2. **Batch Processing**
   - Firestore batches (500 limit)
   - Atomic operations

3. **Error Handling**
   - Logs errors without stopping migration
   - Tracks statistics

4. **Dry Run First**
   - Always preview before executing
   - Verify post count is reasonable

---

## When to Run

**Recommended timing:**
1. **Before production deployment**
   ```bash
   # On your local machine
   npm run migrate:feed:preview   # Check numbers
   npm run migrate:feed            # Execute
   
   # Then deploy
   git push origin main
   ```

2. **After initial deployment** (alternative)
   - Deploy app first
   - Run migration from your machine
   - Users see feed populate gradually

---

## Troubleshooting

### Error: "Service account file not found"
```bash
# Download from Firebase Console:
# Project Settings → Service Accounts → Generate New Private Key
# Save as: ernit-3fc0b-firebase-adminsdk.json
```

###Error: "Permission denied"
```bash
# Ensure service account has Firestore permissions:
# Firebase Console → IAM & Admin
# Service account needs: Cloud Datastore User role
```

### Error: "Too many posts created"
```bash
# If preview shows unexpectedly high number:
# - Check date ranges in code
# - Verify THIRTY_DAYS_AGO calculation
# - Consider reducing scope
```

### Migration takes too long
```bash
# Normal: 2-5 minutes for 50-100 users
# If longer:
# - Check network connection
# - Monitor Firebase Console for throttling
# - Consider running during off-peak hours
```

---

## Expected Results

### Small App (< 50 users)
- **Preview:** 50-200 posts
- **Duration:** 1-2 minutes
- **Cost:** Negligible (< $0.01)

### Medium App (50-200 users)
- **Preview:** 200-1000 posts
- **Duration:** 2-5 minutes
- **Cost:** ~$0.02-0.05

### Large App (> 200 users)
- **Preview:** 1000+ posts
- **Duration:** 5-10 minutes
- **Cost:** Contact Firebase for pricing

---

## Verification

After running migration:

1. **Check Firebase Console**
   ```
   Firestore → feedPosts collection
   - Verify posts exist
   - Check createdAt dates
   - Spot-check data quality
   ```

2. **Test in App**
   ```
   - Open app
   - Navigate to Feed
   - Should see historical activity
   - Verify chronological order
   - Check post content
   ```

3. **Query Database** (optional)
   ```javascript
   // In Firebase Console or code:
   db.collection('feedPosts')
     .orderBy('createdAt', 'desc')
     .limit(10)
     .get()
   ```

---

## Rollback (if needed)

If migration creates unwanted posts:

```bash
# Option 1: Delete via Firebase Console
# Firestore → feedPosts → Select all → Delete

# Option 2: Script to delete (create if needed)
# Delete all posts created after a specific date
```

---

## Next Steps

After successful migration:

1. ✅ Verify feed loads in app
2. ✅ Deploy app to production
3. ✅ Monitor Firebase usage
4. ✅ User feedback on feed quality

**Migration is one-time only** - future posts created automatically by app.
