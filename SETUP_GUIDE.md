# PrivacyCall Setup Guide

Complete guide for connecting PrivacyCall to your own Firebase and LiveKit accounts.

## Prerequisites

Before starting, ensure you have:
- ✅ Node.js 16+ installed
- ✅ Firebase account (https://console.firebase.google.com)
- ✅ LiveKit Cloud account (https://cloud.livekit.io)
- ✅ Expo account (https://expo.dev)
- ✅ Xcode (for iOS) or Android Studio (for Android)

---

## Part 1: Firebase Project Setup

### Step 1.1: Create Firebase Project

1. Go to https://console.firebase.google.com
2. Click "**Add project**"
3. **Project name**: Choose your project name (e.g., "MyPrivacyCall")
4. **Google Analytics**: Disable (optional - for privacy)
5. Click "**Create project**"

### Step 1.2: Enable Authentication

1. In Firebase Console, go to **Authentication**
2. Click "**Get started**"
3. Click "**Sign-in method**" tab
4. Enable "**Anonymous**" provider
5. Click "**Save**"

### Step 1.3: Create Firestore Database

1. Go to **Firestore Database**
2. Click "**Create database**"
3. Choose "**Production mode**"
4. Select location (choose closest to your users)
5. Click "**Enable**"

### Step 1.4: Deploy Security Rules

```bash
# From project root
firebase deploy --only firestore:rules
```

This deploys the comprehensive security rules in `firestore.rules`.

### Step 1.5: Enable Cloud Functions

1. Go to **Functions** in Firebase Console
2. Click "**Get started**"
3. Upgrade to **Blaze plan** (pay-as-you-go, required for Cloud Functions)
   - Don't worry: costs are minimal for this app
   - Free tier covers most usage

### Step 1.6: Enable Cloud Messaging

1. Go to **Cloud Messaging**
2. Should be auto-enabled
3. No additional configuration needed

### Step 1.7: Download Configuration Files

**For iOS:**
1. Go to **Project Settings** → **Your apps**
2. Click iOS app (or add one if none exists)
3. Download `GoogleService-Info.plist`
4. Place in `ios/` directory in project root

**For Android:**
1. Go to **Project Settings** → **Your apps**
2. Click Android app (or add one if none exists)
3. Download `google-services.json`
4. Place in `android/app/` directory

### Step 1.8: Configure Project ID

1. Copy the template:
   ```bash
   cp .firebaserc.example .firebaserc
   ```

2. Edit `.firebaserc` and replace with YOUR project ID:
   ```json
   {
     "projects": {
       "default": "your-firebase-project-id"
     }
   }
   ```

---

## Part 2: LiveKit Cloud Setup

### Step 2.1: Create LiveKit Project

1. Go to https://cloud.livekit.io
2. Sign up or log in
3. Click "**New Project**"
4. **Project name**: Choose name (e.g., "PrivacyCall Production")
5. Click "**Create**"

### Step 2.2: Get Credentials

1. Go to your project **Settings**
2. Find "**API Keys**" section
3. Note down:
   - **API Key** (starts with "API...")
   - **API Secret** (long random string)
   - **WebSocket URL** (format: `wss://yourproject-abc123.livekit.cloud`)

### Step 2.3: Configure Functions Environment

1. Navigate to functions directory:
   ```bash
   cd functions
   ```

2. Copy environment template:
   ```bash
   cp .env.example .env
   ```

3. Edit `functions/.env` with your LiveKit credentials:
   ```bash
   LIVEKIT_API_KEY=APIa1b2c3d4e5f6...
   LIVEKIT_API_SECRET=your_secret_here...
   LIVEKIT_SERVER_URL=wss://yourproject-abc123.livekit.cloud
   ```

4. **Important**: Never commit `.env` file (it's gitignored)

---

## Part 3: Expo/EAS Configuration

**IMPORTANT**: This project uses **LOCAL BUILDS** (Xcode/Android Studio), NOT EAS Cloud builds.
EAS is only needed for the project ID in app.json.

### Step 3.1: Install EAS CLI

```bash
npm install -g eas-cli
```

### Step 3.2: Login to Expo

```bash
eas login
# Enter your Expo credentials
```

### Step 3.3: Initialize EAS Project (For Project ID Only)

```bash
# From project root
eas init
```

This creates a new EAS project ID for app.json. **You won't use EAS for building.**

### Step 3.4: Configure app.json

1. Copy the template:
   ```bash
   cp app.json.example app.json
   ```

2. Edit `app.json` and replace:
   - `"owner": "YOUR_EXPO_USERNAME"` → Your Expo username
   - `"projectId": "YOUR_EAS_PROJECT_ID"` → ID from `eas init`
   - `"bundleIdentifier": "com.yourcompany.privacycall"` → Your unique bundle ID
   - `"package": "com.yourcompany.privacycall"` → Your unique package name

**Tip**: Bundle IDs must be unique globally. Use reverse domain notation:
- Good: `com.mycompany.privacycall`
- Bad: `com.privacycall.app` (might be taken)

---

## Part 4: Install Dependencies

### Step 4.1: Install Node Modules

```bash
# From project root
npm install --legacy-peer-deps
```

**Note**: `--legacy-peer-deps` is required due to version conflicts with LiveKit packages.

### Step 4.2: Install iOS Pods

```bash
cd ios
pod install
cd ..
```

**Note**: This may take 5-10 minutes on first install.

---

## Part 5: Deploy Backend

### Step 5.1: Login to Firebase

```bash
firebase login
```

### Step 5.2: Deploy Cloud Functions

```bash
firebase deploy --only functions
```

**Expected output**: All functions deployed successfully
- generateLiveKitToken
- sendCallNotification
- startCallSession
- endCallSession
- reportContactSynced
- acceptInviteWithMutualContacts
- checkActiveCallsToUser
- etc.

### Step 5.3: Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### Step 5.4: Verify Deployment

1. Go to Firebase Console → Functions
2. All functions should show "Deployed" status
3. Test one function by clicking "Logs" - should show no errors

---

## Part 6: Build and Test

### Step 6.1: Run Development Build

**iOS:**
```bash
npm run ios
# Or for specific device:
# npm run ios -- --device "iPhone 15 Pro"
```

**Android:**
```bash
npm run android
```

**Note**: First build takes 10-15 minutes (compiles native modules).



## Part 7: Production Build

**IMPORTANT**: This project uses **LOCAL BUILDS** via Xcode and Android Studio, NOT EAS Cloud builds.

### Step 7.1: iOS Production Build (via Xcode)

1. **Open Xcode**:
   ```bash
   cd ios
   open PrivacyCall.xcworkspace
   ```

2. **Configure signing**:
   - Select "PrivacyCall" target
   - Go to "Signing & Capabilities"
   - Select your team/provisioning profile
   - Update bundle identifier if needed

3. **Select build target**:
   - Choose "Any iOS Device" or specific device
   - Select "Product" → "Archive"

4. **Archive and distribute**:
   - Wait for archive to complete (5-10 minutes)
   - Organizer window opens
   - Click "Distribute App"
   - Follow prompts for App Store Connect or Ad Hoc distribution

### Step 7.2: Android Production Build (via Android Studio or CLI)

**Option A: Using Gradle CLI (faster)**:
```bash
cd android
./gradlew assembleRelease
```

Release APK location: `android/app/build/outputs/apk/release/app-release.apk`

**Option B: Using Android Studio**:
1. Open `android/` folder in Android Studio
2. Select "Build" → "Generate Signed Bundle/APK"
3. Choose APK or Bundle
4. Configure signing (create keystore if needed)
5. Build Release variant
6. Wait for build (5-10 minutes)

### Step 7.3: Why Local Builds?

This project uses Expo Development Builds (not Expo Go), which allows:
- ✅ Local builds via Xcode/Android Studio
- ✅ Full control over build process
- ✅ No EAS cloud build costs
- ✅ Access to all native modules (LiveKit, Firebase)
- ✅ Standard iOS/Android build workflow

**EAS Cloud builds are optional but not configured for this project.**

---

## Troubleshooting Common Setup Issues

### Firebase Connection Fails

**Symptom**: "Firebase not configured" error

**Fix**:
1. Verify `GoogleService-Info.plist` in `ios/` directory
2. Verify `google-services.json` in `android/app/` directory
3. Check file names are exact (case-sensitive)
4. Rebuild app after adding config files

### LiveKit Tokens Not Generated

**Symptom**: Calls fail with "Failed to generate token"

**Fix**:
1. Check `functions/.env` has correct credentials
2. Verify LIVEKIT_SERVER_URL format: `wss://project.livekit.cloud`
3. Redeploy functions: `firebase deploy --only functions`
4. Check Firebase Functions logs for errors

### Notifications Not Working

**Symptom**: No incoming call notifications

**Fix**:
1. Verify Cloud Messaging enabled in Firebase
2. Check `GoogleService-Info.plist` / `google-services.json` are correct
3. On Android: Grant notification permission in app
4. On iOS: Grant notification permission when prompted
5. Test on physical devices (simulators unreliable)

### Firestore Permission Denied

**Symptom**: "permission-denied" errors in console

**Fix**:
1. Deploy security rules: `firebase deploy --only firestore:rules`
2. Verify user is authenticated (check Firebase Auth console)
3. Check Firestore Rules tab in console - should show deployed rules

### Build Failures

**iOS:**
```bash
# Clean derived data
rm -rf ~/Library/Developer/Xcode/DerivedData/*
cd ios && rm -rf build Pods Podfile.lock
pod install
cd ..
npm run ios
```

**Android:**
```bash
cd android
./gradlew clean
cd ..
npm run android
```

---

## Monitoring and Maintenance

### Check Firebase Usage

1. Go to Firebase Console → Usage and billing
2. Monitor:
   - Firestore reads/writes
   - Cloud Function invocations
   - Cloud Messaging sends

### Check LiveKit Usage

1. Go to LiveKit Console → Usage
2. Monitor:
   - Room minutes
   - Participant minutes
   - Bandwidth usage

### Expected Costs

**Firebase (Blaze plan):**
- Typical usage: $0-5/month for < 1000 users
- Free tier covers most usage

**LiveKit:**
- Free tier: 50 hours/month
- After: ~$0.02/participant-minute

---


## Next Steps After Setup

1. Review `KNOWN_ISSUES.md` for current limitations
2. Check `README.md` for development commands
3. Review code comments in `src/services/` for implementation details
