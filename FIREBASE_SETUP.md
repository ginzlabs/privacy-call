# 🔥 Firebase Setup Guide for PrivacyCall

## Step 1: Create Firebase Project

1. **Go to [Firebase Console](https://console.firebase.google.com)**
2. **Click "Add project"**
3. **Enter project name**: `privacycall-app` (or your preferred name)
4. **Disable Google Analytics** (privacy-first approach)
5. **Click "Create project"**

## Step 2: Enable Required Services

### Authentication
1. **Go to Authentication > Sign-in method**
2. **Enable "Anonymous" provider**
3. **Click "Save"**

### Firestore Database
1. **Go to Firestore Database**
2. **Click "Create database"**
3. **Start in "test mode"** (we'll add security rules later)
4. **Choose location** closest to your users

### Cloud Functions
1. **Go to Functions**
2. **Click "Get started"**
3. **Upgrade to Blaze plan** (required for external API calls)

### Cloud Messaging
1. **Go to Cloud Messaging**
2. **Enable the service** (no setup needed yet)

## Step 3: Add iOS App

1. **Go to Project Settings (gear icon)**
2. **Click "Add app" > iOS**
3. **Bundle ID**: `com.privacycall.app`
4. **App nickname**: `PrivacyCall iOS`
5. **Download `GoogleService-Info.plist`**
6. **Replace the placeholder file** at `/ios/GoogleService-Info.plist`

## Step 4: Add Android App

1. **Click "Add app" > Android**
2. **Package name**: `com.privacycall.app`
3. **App nickname**: `PrivacyCall Android`
4. **Download `google-services.json`**
5. **Replace the placeholder file** at `/android/app/google-services.json`

## Step 5: Test the Setup

1. **Install dependencies** (if not done):
   ```bash
   npm install
   cd ios && pod install && cd ..
   ```

2. **Clean build** (iOS):
   ```bash
   npx react-native run-ios --reset-cache
   ```

3. **Check logs** for Firebase initialization:
   - Should see "Firebase services verified successfully"
   - No Firebase-related errors

## Step 6: Set Up Security Rules

### Firestore Rules
Go to Firestore > Rules and replace with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only allow access to authenticated users
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // Invites collection - more restrictive rules
    match /invites/{inviteId} {
      allow read: if resource.data.expiresAt > request.time;
      allow write: if request.auth != null && request.auth.uid == resource.data.createdBy;
    }
  }
}
```

## Step 7: Verify Anonymous Auth Works

1. **Run the app**
2. **Tap "Get Started"** on welcome screen
3. **Check Firebase Console > Authentication > Users**
4. **Should see anonymous user** appear

## Troubleshooting

### Common Issues

**"GoogleService-Info.plist not found"**
- Make sure file is placed in `/ios/` directory
- Clean and rebuild project

**"Default FirebaseApp is not a FirebaseApp instance"**
- Check bundle ID matches Firebase project
- Verify config files are valid JSON/plist

**"Network error"**
- Check internet connection
- Verify Firebase project is active

**Build errors after adding Firebase**
- Clean build folder: `cd ios && xcodebuild clean && cd ..`
- Reset Metro cache: `npx react-native start --reset-cache`
- Reinstall pods: `cd ios && pod deintegrate && pod install && cd ..`

### Debug Commands

```bash
# Check Firebase configuration
npx react-native run-ios --verbose

# Reset everything
npm start -- --reset-cache
cd ios && pod deintegrate && pod install && cd ..
```

## Next Steps

Once Firebase is working:
1. ✅ Anonymous authentication will work
2. ✅ Contacts will be stored in Firestore
3. ✅ Ready for invite system implementation
4. ✅ Push notifications can be configured

---

**Important**: Keep your Firebase config files secure and never commit them to public repositories!