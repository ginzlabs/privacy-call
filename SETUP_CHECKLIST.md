# PrivacyCall Setup Checklist

**Welcome!** This checklist will guide you through setting up the PrivacyCall project on your own development environment with your own Firebase and LiveKit accounts.

**Estimated Time**: 45-60 minutes for first-time setup

---

## Prerequisites ✅

Before starting, ensure you have these accounts and tools:

### Required Accounts
- [ ] **Firebase account** - https://console.firebase.google.com (free Spark plan to start)
- [ ] **LiveKit Cloud account** - https://cloud.livekit.io (free tier available)
- [ ] **Expo account** - https://expo.dev (free account)
- [ ] **GitHub account** - For code access (you probably already have this!)

### Required Tools
- [ ] **Node.js 16+** installed - Run `node --version` to check
- [ ] **npm** installed - Usually comes with Node.js
- [ ] **Git** installed - Run `git --version` to check
- [ ] **Xcode** (for iOS development) - Mac only, download from App Store
- [ ] **Android Studio** (for Android development) - Optional if only doing iOS

---

## Step 1: Clone and Install Dependencies ⬇️

### 1.1 Clone the Repository
```bash
git clone <repository-url>
cd PrivacyCall
```

### 1.2 Install Node Modules
```bash
npm install --legacy-peer-deps
```

**Note**: The `--legacy-peer-deps` flag is required due to version conflicts with LiveKit packages.

**Expected**: Should complete in 2-5 minutes. You'll see a lot of packages being installed.

### 1.3 Install iOS CocoaPods Dependencies
```bash
cd ios
pod install
cd ..
```

**Expected**: Takes 5-10 minutes on first install. May show some warnings (normal).

✅ **Checkpoint**: You should have `node_modules/` folder and `ios/Pods/` folder created.

---

## Step 2: Firebase Project Setup 🔥

### 2.1 Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click "**Add project**"
3. **Project name**: Choose your name (e.g., "MyPrivacyCall")
4. **Google Analytics**: Disable (recommended for privacy)
5. Click "**Create project**" and wait 1-2 minutes

✅ **Checkpoint**: You should see your Firebase project dashboard.

### 2.2 Enable Authentication
1. In Firebase Console sidebar, click **Authentication**
2. Click "**Get started**"
3. Go to "**Sign-in method**" tab
4. Click "**Anonymous**" provider
5. Toggle to **Enable**
6. Click "**Save**"

✅ **Checkpoint**: Anonymous provider should show as "Enabled" in the Sign-in methods list.

### 2.3 Create Firestore Database
1. In Firebase Console sidebar, click **Firestore Database**
2. Click "**Create database**"
3. Select "**Production mode**" (we'll deploy security rules later)
4. Choose **location** closest to your users (e.g., us-central for USA)
5. Click "**Enable**" and wait 1-2 minutes

✅ **Checkpoint**: You should see an empty Firestore database.

### 2.4 Upgrade to Blaze Plan (Required for Cloud Functions)
1. In Firebase Console, click **Upgrade** in the bottom left
2. Select "**Blaze (Pay as you go)**" plan
3. Set up billing (requires credit card)
4. Don't worry: **Free tier covers most usage** (~$0-5/month for small apps)

✅ **Checkpoint**: Console should show "Blaze plan" at bottom left.

### 2.5 Add iOS App
1. Click the **gear icon** (Settings) → **Project settings**
2. Scroll down to "**Your apps**" section
3. Click **iOS icon** (Apple logo)
4. **Bundle ID**: Enter `com.yourcompany.privacycall` (must match app.json later)
5. **App nickname**: "PrivacyCall iOS"
6. Click "**Register app**"
7. **Download** `GoogleService-Info.plist` file
8. Move this file to: **`ios/GoogleService-Info.plist`** in your project
9. Click "**Continue to console**"

✅ **Checkpoint**: `GoogleService-Info.plist` file should be in your `ios/` folder.

### 2.6 Add Android App
1. In Project Settings, click **Android icon** (robot logo)
2. **Package name**: Enter `com.yourcompany.privacycall` (must match app.json later)
3. **App nickname**: "PrivacyCall Android"
4. Click "**Register app**"
5. **Download** `google-services.json` file
6. Move this file to: **`android/app/google-services.json`** in your project
7. Click "**Continue to console**"

✅ **Checkpoint**: `google-services.json` file should be in your `android/app/` folder.

### 2.7 Configure Project ID
1. Copy the template:
   ```bash
   cp .firebaserc.example .firebaserc
   ```
2. Find your **Firebase Project ID**:
   - In Firebase Console, look at the URL: `https://console.firebase.google.com/project/<YOUR_PROJECT_ID>/...`
   - Or in Project Settings, under "Project ID"
3. Edit `.firebaserc` and replace `your-firebase-project-id` with YOUR project ID

✅ **Checkpoint**: `.firebaserc` file exists with your project ID.

---

## Step 3: LiveKit Cloud Setup 🎙️

### 3.1 Create LiveKit Project
1. Go to https://cloud.livekit.io
2. Sign up or log in
3. Click "**New Project**"
4. **Project name**: "PrivacyCall Production" (or your preferred name)
5. Click "**Create**"

✅ **Checkpoint**: You should see your LiveKit project dashboard.

### 3.2 Get API Credentials
1. In your LiveKit project, click "**Settings**" in sidebar
2. Find "**API Keys**" section
3. **Copy and save** these three values:
   - **API Key** (starts with "API...")
   - **API Secret** (long random string)
   - **WebSocket URL** (format: `wss://yourproject-abc123.livekit.cloud`)

✅ **Checkpoint**: You have all three values copied somewhere safe.

### 3.3 Configure Functions Environment
1. Navigate to functions directory:
   ```bash
   cd functions
   ```
2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
3. Edit `functions/.env` with **your LiveKit credentials**:
   ```bash
   LIVEKIT_API_KEY=APIa1b2c3d4e5f6...  # Your API Key
   LIVEKIT_API_SECRET=your_secret_here...  # Your API Secret
   LIVEKIT_SERVER_URL=wss://yourproject-abc123.livekit.cloud  # Your WebSocket URL
   ```
4. **Save the file** and go back to project root:
   ```bash
   cd ..
   ```

✅ **Checkpoint**: `functions/.env` file exists with YOUR credentials (not the examples).

---

## Step 4: Expo/EAS Configuration 📱

**Note**: This project uses **LOCAL BUILDS** (Xcode/Android Studio), NOT EAS Cloud builds. We only need Expo for the project ID.

### 4.1 Install EAS CLI
```bash
npm install -g eas-cli
```

### 4.2 Login to Expo
```bash
eas login
```
Enter your Expo credentials when prompted.

### 4.3 Initialize EAS Project
```bash
eas init
```
This creates a project ID. You won't use EAS for building.

✅ **Checkpoint**: Command completes without errors.

### 4.4 Configure app.json
1. Copy the template:
   ```bash
   cp app.json.example app.json
   ```
2. Get your **EAS Project ID** from the output of `eas init` or run:
   ```bash
   eas project:info
   ```
3. Get your **Expo username** from https://expo.dev (top right corner)
4. Edit `app.json` and replace:
   - `"owner": "YOUR_EXPO_USERNAME"` → Your Expo username
   - `"projectId": "YOUR_EAS_PROJECT_ID"` → Your EAS project ID
   - `"bundleIdentifier": "com.yourcompany.privacycall"` → Your unique bundle ID (iOS)
   - `"package": "com.yourcompany.privacycall"` → Your unique package name (Android)

**Important**: Bundle IDs must be unique globally. Use reverse domain notation:
- ✅ Good: `com.mycompany.privacycall`
- ❌ Bad: `com.privacycall.app` (might already be taken)

✅ **Checkpoint**: `app.json` file exists with YOUR values (no placeholders).

---

## Step 5: Deploy Firebase Backend ☁️

### 5.1 Login to Firebase CLI
```bash
firebase login
```
This opens a browser for authentication.

✅ **Checkpoint**: Command shows "Success! Logged in as <your-email>"

### 5.2 Deploy Cloud Functions
```bash
firebase deploy --only functions
```

**Expected**: Takes 3-5 minutes. You'll see 15 functions being deployed.

**Functions deployed:**
- generateLiveKitToken
- sendCallNotification
- startCallSession
- endCallSession
- reportContactSynced
- acceptInviteWithMutualContacts
- checkActiveCallsToUser
- ...and more

✅ **Checkpoint**: All functions show ✔ deployed successfully.

### 5.3 Deploy Firestore Security Rules
```bash
firebase deploy --only firestore:rules
```

**Expected**: Takes 30 seconds.

✅ **Checkpoint**: Command shows "✔ Deploy complete!"

### 5.4 Verify Deployment
1. Go to Firebase Console → **Functions**
2. All functions should show "Deployed" status with green checkmarks
3. Click one function → "Logs" tab → Should show no errors (may be empty)

✅ **Checkpoint**: Firebase Console shows all functions deployed.

---

## Step 6: First Build and Test 🚀

### 6.1 Build iOS App
```bash
npm run ios
```

**Expected**:
- First build: 10-15 minutes (compiles native modules)
- Subsequent builds: 2-3 minutes
- Simulator launches automatically
- App shows purple splash screen → Contacts screen

**Troubleshooting**:
- If build fails: See [Troubleshooting](#troubleshooting-common-issues) section below
- If stuck on splash: Check console logs for Firebase/LiveKit errors

✅ **Checkpoint**: App launches in simulator without crashing.

### 6.2 Build Android App (Optional)
```bash
npm run android
```

**Expected**: Similar timing to iOS, emulator launches automatically.

---

## Step 7: Test Core Functionality 🧪

Follow this test sequence to verify everything works:

### 7.1 Basic Launch
- [ ] App launches without errors
- [ ] Purple splash screen appears
- [ ] Transitions to Contacts screen (not stuck on splash)
- [ ] Bottom navigation shows (Contacts, History, Profile)

### 7.2 Invite System
- [ ] Tap **"+"** button → **"Invite new contact"**
- [ ] QR code displays
- [ ] Tap **"Copy Link"** → Success message shows
- [ ] Invite appears in "Pending Invites" section
- [ ] Countdown timer updates (e.g., "14m 32s remaining")

### 7.3 Accept Invite (Two Devices)
**You'll need two devices/simulators for this test:**
- [ ] **Device A**: Create invite and copy link
- [ ] **Device B**: Open invite link → Accept
- [ ] **Both devices**: Contact appears in contacts list
- [ ] **Both devices**: No errors in console

### 7.4 Audio Call (Two Devices)
**Requires two physical devices (simulators don't support microphone):**
- [ ] **Device A**: Tap contact → Tap call button (phone icon)
- [ ] **Device B**: Incoming call notification appears
- [ ] **Device B**: Accept call
- [ ] **Both devices**: "Connected" status shows
- [ ] **Test audio both directions**: Can hear each other
- [ ] **Device A**: Tap mute button → Icon changes to red
- [ ] **Device B**: Audio from Device A stops
- [ ] **Either device**: Tap end call → Returns to Contacts

### 7.5 History and Profile
- [ ] **History tab**: Shows calls and contact changes
- [ ] **Profile tab**: Shows usage stats (may be "0 minutes" initially)

✅ **Checkpoint**: All tests pass! You're ready to develop.

---

## Step 8: Production Build (Optional) 📦

When you're ready to distribute the app:

### iOS Production Build (via Xcode)
```bash
cd ios
open PrivacyCall.xcworkspace
```
1. Select "PrivacyCall" target
2. Go to "Signing & Capabilities"
3. Select your team/provisioning profile
4. Choose "Any iOS Device" from device menu
5. Product → Archive
6. Distribute App → Follow prompts

### Android Production Build
```bash
cd android
./gradlew assembleRelease
```
Release APK location: `android/app/build/outputs/apk/release/app-release.apk`

---

## Troubleshooting Common Issues 🔧

### "GoogleService-Info.plist not found"
- **Fix**: Verify file is in `ios/` directory (not `ios/PrivacyCall/`)
- Clean build: `cd ios && rm -rf build Pods && pod install && cd ..`
- Rebuild: `npm run ios`

### "Firebase not configured" Error
- **Fix**: Check `GoogleService-Info.plist` and `google-services.json` are in correct locations
- Verify bundle IDs match Firebase project
- Rebuild app completely

### LiveKit Token Generation Fails
- **Fix**: Check `functions/.env` has correct credentials
- Verify LIVEKIT_SERVER_URL format: `wss://project.livekit.cloud` (must include `wss://`)
- Redeploy functions: `firebase deploy --only functions`
- Check Firebase Functions logs: `firebase functions:log`

### Notifications Not Working
- **Fix**: Test on **physical devices** (simulators unreliable)
- Grant notification permission when prompted
- Check Firebase Cloud Messaging is enabled
- Verify `GoogleService-Info.plist` / `google-services.json` are correct

### Build Errors (iOS)
```bash
# Nuclear clean
rm -rf ~/Library/Developer/Xcode/DerivedData/*
cd ios && rm -rf build Pods Podfile.lock
pod install
cd ..
npm run ios
```

### Build Errors (Android)
```bash
cd android
./gradlew clean
cd ..
npm run android
```

### Firestore Permission Denied
- **Fix**: Verify rules deployed: `firebase deploy --only firestore:rules`
- Check user is authenticated (check Firebase Auth console)
- Review Firestore Rules tab in console

### Metro Bundler Issues
```bash
npx react-native start --reset-cache
# In another terminal:
npm run ios
```

---

## Next Steps After Setup 🎓

### Read the Documentation
1. **CLAUDE.md** - Deep dive into architecture and implementation
2. **KNOWN_ISSUES.md** - Current limitations and workarounds
3. **README.md** - Development commands and overview

### Explore the Codebase
- **`src/services/`** - Core business logic (Auth, Contacts, LiveKit, Notifications, Firebase)
- **`src/screens/`** - UI components (Contacts, Call, History, Profile screens)
- **`src/config/AppConfig.js`** - All app constants in one place
- **`functions/src/index.js`** - Firebase Cloud Functions (backend logic)
- **`firestore.rules`** - Security rules (heavily commented)

### Common Development Tasks
```bash
# Run the app
npm run ios
npm run android

# Deploy backend changes
firebase deploy --only functions
firebase deploy --only firestore:rules

# View Firebase logs
firebase functions:log

# Clean builds
cd ios && rm -rf build && cd ..  # iOS
cd android && ./gradlew clean && cd ..  # Android
```

---

## Getting Help 📚

### Documentation
- **SETUP_GUIDE.md** - Step-by-step Firebase/LiveKit setup
- **CLAUDE.md** - Technical architecture (680+ lines!)
- **KNOWN_ISSUES.md** - Current limitations

### External Resources
- **Firebase**: https://firebase.google.com/docs
- **LiveKit**: https://docs.livekit.io
- **Expo**: https://docs.expo.dev
- **React Native**: https://reactnative.dev/docs

### Review Commit History
```bash
git log --oneline --graph
```
Many commits have detailed explanations of implementation decisions.

---

## Verification Checklist ✅

Use this final checklist to confirm your setup is complete:

### Configuration Files
- [ ] `app.json` exists with YOUR project ID and bundle IDs
- [ ] `.firebaserc` exists with YOUR Firebase project ID
- [ ] `functions/.env` exists with YOUR LiveKit credentials
- [ ] `ios/GoogleService-Info.plist` exists with YOUR Firebase iOS config
- [ ] `android/app/google-services.json` exists with YOUR Firebase Android config

### Firebase Setup
- [ ] Firebase project created
- [ ] Anonymous Authentication enabled
- [ ] Firestore database created
- [ ] Blaze plan activated
- [ ] Cloud Functions deployed (15 functions)
- [ ] Firestore rules deployed

### LiveKit Setup
- [ ] LiveKit project created
- [ ] API credentials obtained
- [ ] Credentials added to `functions/.env`

### App Build
- [ ] Dependencies installed (`node_modules/`)
- [ ] iOS pods installed (`ios/Pods/`)
- [ ] App builds successfully
- [ ] App launches without crashing

### Functionality Tests
- [ ] Can create invite
- [ ] Can accept invite (two devices)
- [ ] Can make audio call (two physical devices)
- [ ] History logs events
- [ ] Profile shows usage

---

## You're Ready! 🎉

**Congratulations!** Your PrivacyCall development environment is fully set up. You're now ready to:
- Make changes to the codebase
- Test new features
- Deploy updates
- Build production apps

**Happy coding!** 🚀

---

## Final Note 

- Make sure to setup TTL on all the server events when you setup your firebase project. This is not something you can do through the CLI-- it must be done through the G-Cloud Console. Otherwise, data is stored on the server.

*Last updated: November 2025*
*Project: PrivacyCall - Privacy-focused audio calling app*
