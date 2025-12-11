# Firestore Security Rules Update Guide

## 🚨 Permission Denied Error Fix

The error you're seeing indicates that Firestore security rules are blocking access to the database. Here's how to fix it:

## Step 1: Update Firestore Rules in Firebase Console

1. **Go to Firebase Console**
   - Visit [https://console.firebase.google.com/](https://console.firebase.google.com/)
   - Select your project

2. **Navigate to Firestore Rules**
   - Go to "Firestore Database" → "Rules" tab

3. **Replace the existing rules** with the updated rules from `firestore.rules` file

4. **Click "Publish"** to deploy the new rules

## Step 2: Verify Authentication

Make sure your app is properly authenticated before accessing Firestore:

```typescript
// Check if user is authenticated
import { auth } from './services/firebase';

const user = auth.currentUser;
if (!user) {
  console.log('User not authenticated');
  return;
}
```

## Step 3: Test the Rules

The updated rules allow:

### ✅ **Users Collection**
- Users can read/write their own data
- Users can read other users' profiles (for friend discovery)
- Users can manage their own goals subcollection

### ✅ **Friend Requests Collection**
- Users can read requests where they are sender or recipient
- Users can create requests where they are the sender
- Recipients can update request status (accept/decline)

### ✅ **Friends Collection**
- Users can read their own friends list
- Users can create friend relationships
- Users can delete their own friend relationships

### ✅ **Notifications Collection**
- Users can read their own notifications
- System can create notifications
- Users can update their own notifications (mark as read)

### ✅ **Other Collections**
- Experience gifts: Authenticated users can read/write
- Goals: Authenticated users can read/write
- Experiences: Public read, authenticated write

## Step 4: Debugging Tips

If you still get permission errors:

1. **Check Authentication State**
   ```typescript
   console.log('Current user:', auth.currentUser?.uid);
   ```

2. **Verify Collection Structure**
   - Make sure you're accessing the correct collection names
   - Check that document IDs match the expected format

3. **Test with Firebase Console**
   - Try reading/writing data directly in Firebase Console
   - Check if the issue is with rules or data structure

4. **Check Network Tab**
   - Look for 403 Forbidden errors
   - Verify the request is being made with proper authentication

## Step 5: Common Issues and Solutions

### Issue: "Missing or insufficient permissions"
**Solution**: Update Firestore rules as shown above

### Issue: "User not authenticated"
**Solution**: Ensure user is signed in before accessing Firestore

### Issue: "Document not found"
**Solution**: Check if the document exists and has the correct ID

### Issue: "Invalid document reference"
**Solution**: Verify collection and document paths are correct

## Step 6: Production Considerations

For production, consider:

1. **More Restrictive Rules**: Limit what users can read/write
2. **Field Validation**: Add rules to validate data structure
3. **Rate Limiting**: Implement rules to prevent abuse
4. **Audit Logging**: Monitor access patterns

## Example Rule Testing

You can test rules in Firebase Console using the Rules Playground:

1. Go to Firestore → Rules → Rules playground
2. Select "Authenticated" and enter a user ID
3. Test read/write operations on different collections
4. Verify the rules work as expected

## Need Help?

If you're still having issues:

1. Check the Firebase Console for detailed error logs
2. Verify your Firebase configuration is correct
3. Make sure all required services are enabled
4. Test with a simple read operation first

The updated rules should resolve the permission denied errors you're experiencing! 🚀
