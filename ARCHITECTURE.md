# PrivacyCall - Privacy-Focused Audio Calling App

## Overview
**PrivacyCall** is a React Native (Expo SDK 51) privacy-first audio calling application with Firebase backend and LiveKit Cloud for real-time audio calls. The app prioritizes user privacy, collects no personal data, and uses Firebase Anonymous Authentication for persistent anonymous user IDs.

## Quick Start for New Claude Instances

### Development Commands
```bash
# Install dependencies
npm install

# Run the app
npm run ios                    # iOS (default)
npm run android               # Android
npm start                     # Expo dev client

# Building for production
npx eas build --platform ios --profile production    # Cloud build (recommended)
npx eas build --platform android --profile production

# Local Android build
cd android && ./gradlew assembleRelease
```

### Key Files to Understand First
- `App.js` - Main app router with React Navigation stack and FCM setup
- `index.js` - Expo app entry point with background message handler
- `src/config/AppConfig.js` - Centralized configuration for all app constants
- `src/services/` - Core service layer (Auth, Contacts, LiveKit, Notifications, Firebase)
- `src/screens/` - All screen components (Contacts, History, Profile, Call screens)
- `functions/src/index.js` - Firebase Cloud Functions for secure backend operations

---

## App Architecture

### High-Level Structure
```
PrivacyCall Architecture:
┌─ Entry Point (index.js → App.js)
├─ React Navigation Stack (10 screens)
├─ Bottom Tab Navigation (3 main sections: Contacts, History, Profile)
├─ Service Layer (Auth, Contacts, LiveKit, Notifications, Firebase)
├─ Firebase Backend (Functions, Firestore, FCM)
└─ LiveKit Integration (Audio calls with E2EE)
```

### Core Technology Stack
- **React Native**: 0.74.5 with Expo SDK 51
- **Navigation**: React Navigation 6 (Stack + Bottom Tab navigators)
- **Authentication**: Firebase Anonymous Auth (no registration required)
- **Database**: Firestore for server data, AsyncStorage for local data
- **Audio Calls**: LiveKit Client SDK with WebRTC
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Backend**: Firebase Cloud Functions (Node.js 20)

---

## Core Features & Implementation

### 🔐 Privacy-First Design
- **No personal data collection**: Uses anonymous Firebase UIDs only
- **Local contact storage**: Contacts stored in AsyncStorage, not server
- **Temporary server data**: All server data auto-expires (15 minutes max)
- **Auto-cleanup**: Firestore TTL policies automatically delete expired data

### 📞 Audio Calling System
- **1:1 calls**: Direct audio calls between contacts
- **Group calls**: Multi-participant audio calls (max 8 participants)
- **LiveKit integration**: WebRTC with end-to-end encryption
- **Secure token generation**: Server-side LiveKit token creation via Firebase Functions
- **Room isolation**: Unique room names prevent accidental merging

### 📱 Push Notification System
- **Cross-platform**: Works on both iOS and Android
- **Background support**: Notifications work when app is closed/backgrounded
- **Multiple call handling**: Smart routing for simultaneous incoming calls
- **Old notification protection**: Validates call sessions before showing UI

### 🔗 Contact System
- **Invite-based**: Add contacts via one-time links and QR codes
- **15-minute expiry**: Invite links expire automatically
- **Mutual contacts**: Temporary contact relationships with auto-cleanup
- **Privacy-focused nicknames**: Auto-generated contact names for privacy

---

## Screen Architecture & Navigation

### Main Navigation Flow
```
App Launch → Welcome → MainTabs (Contacts | History | Profile)
    ↓
Contacts → AddContact | ContactDetail | CreateGroup
    ↓
Calls → IncomingCall | MultipleIncomingCalls | Call
```

### Key Screens

#### **ContactsScreen.js**
- **Main hub**: Shows contacts, groups, and pending invites
- **Search functionality**: Real-time contact search with auto-complete
- **Multiple calls detection**: Routes to selection screen when multiple calls arrive
- **Real-time invite updates**: Firestore listener for efficient invite status sync
- **AppState refresh**: Updates invite timers when app becomes active

#### **IncomingCallScreen.js**  
- **Call validation**: Checks notification age and call session existence
- **Call expired handling**: Shows "Call Expired" for old/ended calls
- **Auto-dismiss**: Returns to contacts after 1.3 seconds for expired calls
- **Contact lookup**: Shows proper names from local contacts

#### **MultipleIncomingCallsScreen.js**
- **Multiple caller selection**: Shows list of all incoming callers
- **Deduplication**: Prevents duplicate cards for same caller
- **Call management**: Answers chosen call, automatically declines others
- **Contact name lookup**: Shows proper contact names when available

#### **CallScreen.js**
- **Call state management**: Handles connecting, calling, connected, ended states
- **Audio controls**: Mute/unmute, call end functionality
- **Participant tracking**: Shows other call participants
- **Auto-dismiss**: Call ended screen dismisses after 0.6 seconds

#### **HistoryScreen.js**
- **Call history display**: Shows all call attempts, contacts changes, invites
- **Loading states**: Shows spinner while loading data
- **Safe text rendering**: Bulletproof against invalid data
- **Server history sync**: Syncs missed notifications from server, then deletes

#### **ProfileScreen.js**
- **Usage tracking**: Shows monthly minutes used vs quota
- **Privacy information**: Displays privacy-focused messaging
- **Loading states**: Shows "..." while loading usage data
- **Simplified UI**: Removed settings and account sections

---

## Service Layer Deep Dive

### **AuthService.js**
- **Anonymous authentication**: Firebase Anonymous Auth for persistent IDs
- **No registration**: Users get persistent IDs without personal data
- **Session management**: Handles auth state across app lifecycles

### **ContactsService.js**
- **Local storage**: All contacts stored in AsyncStorage only
- **Invite system**: Creates and manages invite links with expiry
- **Mutual contact sync**: Syncs contacts from accepted invites
- **History management**: Logs all call and contact events
- **Server history sync**: Downloads and deletes server-logged missed calls

### **LiveKitService.js**
- **Audio call management**: Handles LiveKit room creation and management
- **Token generation**: Secure server-side token requests
- **Room naming**: Unique caller-specific room names with timestamps
- **Cleanup**: Proper cleanup including server session termination
- **Event handling**: Participant join/leave, connection state changes

### **NotificationService.js**
- **FCM management**: Handles all Firebase Cloud Messaging operations
- **Multiple call detection**: Tracks simultaneous incoming calls
- **Background logging**: Logs notifications even if untapped
- **Real-time listeners**: Efficient Firestore listeners vs polling
- **Cancellation tracking**: Handles rapid call cancellation edge cases

### **FirebaseService.js**
- **Centralized Firebase**: Single point for all Firebase operations
- **Invite management**: Server-side invite creation and validation
- **Usage tracking**: Server-side call duration and quota management
- **History logging**: Server-side logging for missed notifications

---

## Firebase Backend Architecture

### **Cloud Functions (functions/src/index.js)**

#### **Core Functions:**
- **`generateLiveKitToken`**: Secure token generation with E2EE
- **`sendCallNotification`**: FCM notification sending with history logging
- **`startCallSession`** / **`endCallSession`**: Call session lifecycle tracking
- **`acceptInviteWithMutualContacts`**: Invite acceptance with contact relationships

#### **Privacy Functions:**
- **`cleanupExpiredContactRelationships`**: Manual cleanup of expired data
- **`scheduledCleanupContactRelationships`**: HTTP endpoint for scheduled cleanup
- **`checkActiveCallsToUser`**: Validates active calls for expiry checking

#### **Rate Limiting & Security:**
- **Token rate limiting**: Prevents token request spam
- **Call rate limiting**: Prevents call session spam
- **Input validation**: Zod schemas for all function inputs
- **Authentication**: Firebase Auth integration with anonymous users

### **Firestore Collections:**

#### **`Invites`**
- **Temporary storage**: 15-minute expiring invite links
- **Privacy-focused**: No personal data, only anonymous UIDs
- **TTL cleanup**: Firestore TTL policy on `expiresAt` field

#### **`contact_relationships`**
- **Mutual contacts**: Temporary 15-minute contact relationships
- **Auto-expiry**: TTL policy automatically deletes expired relationships
- **Privacy compliance**: No nicknames or personal data stored

#### **`call_sessions`**
- **Call tracking**: Active call session management
- **Usage monitoring**: Duration tracking for quota enforcement
- **Session validation**: Used for active call detection and expiry checking

#### **`user_history`**
- **Temporary logging**: Server-side history for missed notifications
- **Auto-cleanup**: Deleted immediately after client sync
- **Privacy protection**: No persistent user data storage

#### **`user_tokens`**
- **FCM tokens**: Device tokens for push notifications
- **Platform tracking**: iOS vs Android for notification targeting

---

## Critical Edge Cases Handled

### 🚀 **Rapid Call Cancellation**
**Problem**: Cancelling calls very quickly during "setting up call" phase caused receiving device to show incoming call screen.

**Solution**: 
- Prevention flag system blocks racing notifications
- Client-side cancellation tracking with 1-second timeout
- LiveKit cleanup ensures no room conflicts
- Error suppression for expected rapid cancellation errors

**Files**: `CallScreen.js`, `IncomingCallScreen.js`, `NotificationService.js`

### 📱 **Multiple Incoming Calls**
**Problem**: Multiple callers to same person would auto-merge into group call.

**Solution**:
- Unique room names per caller with timestamp
- Background message handler captures all notifications
- Multiple calls detection with 10-second window
- Smart routing to MultipleIncomingCallsScreen
- Automatic decline of non-selected calls

**Files**: `NotificationService.js`, `MultipleIncomingCallsScreen.js`, `LiveKitService.js`

### 🔔 **Android Push Notifications**
**Problem**: Android notifications not appearing when app closed.

**Solution**:
- Added POST_NOTIFICATIONS permission for Android 13+
- Created high-priority notification channels
- Enhanced FCM payload with Android-specific settings
- Background message handler for notification capture

**Files**: `AndroidManifest.xml`, `MainApplication.kt`, Firebase Functions

### ❄️ **Cold Start Navigation**
**Problem**: Tapping FCM notifications on closed app showed welcome screen instead of call screen.

**Solution**:
- AppState listener detects app activation
- Active call detection during app initialization
- Server-side call session validation
- Smart routing based on number of active calls

**Files**: `App.js`, `WelcomeScreen.js`, Firebase Functions

### ⏰ **Old Notification Protection**
**Problem**: Tapping old notifications (from yesterday) would enter empty call rooms.

**Solution**:
- Notification age validation (2-minute threshold)
- Call session existence validation via server query
- "Call Expired" UI with auto-dismiss (1.3 seconds)
- Proper server session cleanup on timeout/cancellation

**Files**: `IncomingCallScreen.js`, `CallScreen.js`, `LiveKitService.js`

### 🌍 **Timezone-Safe Invite System**
**Problem**: Invite timers showed incorrect countdown across timezones.

**Solution**:
- Server-side UTC timestamp generation
- Firestore Timestamp objects for timezone safety
- Client-side relative time display ("14m 32s remaining")
- Real-time Firestore listeners instead of inefficient polling

**Files**: Firebase Functions, `ContactsService.js`, `ContactsScreen.js`

### 🗑️ **Privacy Compliance**
**Problem**: Contact relationships not auto-deleting after 15 minutes.

**Solution**:
- Firestore TTL policies on `expiresAt` field
- Automatic cleanup triggers during app operations
- Server history logging with immediate deletion after sync
- Privacy-compliant data lifecycle management

**Files**: Firebase Functions, `ContactsService.js`, Firestore Console

---

## Development Workflow & Patterns

### **Component Architecture**
- **Functional components**: Uses React hooks throughout
- **Service layer pattern**: All data operations through service classes
- **Error boundaries**: Comprehensive error handling and user feedback
- **Loading states**: Proper loading indicators for all async operations

### **State Management**
- **Local state**: React hooks (useState, useEffect)
- **Persistent storage**: AsyncStorage for contacts and settings
- **Server state**: Firestore for temporary data with auto-cleanup
- **Real-time updates**: Firestore listeners for live data sync

### **Navigation Patterns**
- **Stack navigation**: React Navigation 6 with proper parameter passing
- **Modal presentations**: Full-screen modals for call screens
- **Navigation safety**: Try-catch wrappers and retry mechanisms
- **Cold start handling**: Proper navigation timing for app launches

### **Error Handling Patterns**
- **Graceful degradation**: App continues working if services fail
- **User-friendly messages**: Clear error explanations
- **Debug logging**: Comprehensive logging for troubleshooting
- **Privacy-safe errors**: No sensitive data in error messages

---

## Security & Privacy Implementation

### **Data Minimization**
- **Anonymous UIDs only**: No names, phone numbers, or personal identifiers
- **Local-first**: Contacts and settings stored locally only
- **Temporary server data**: All server data expires automatically
- **Auto-generated nicknames**: Privacy-focused contact naming

### **Server-Side Security**
- **Input validation**: Zod schemas validate all client input
- **Rate limiting**: Prevents spam and abuse
- **Authentication required**: All functions require Firebase Auth
- **Secure token generation**: LiveKit tokens generated server-side only

### **Privacy Compliance Features**
- **15-minute data expiry**: Contact relationships auto-delete
- **Server history cleanup**: Notification history deleted after sync
- **TTL policies**: Firestore automatically deletes expired documents
- **Privacy-safe queries**: Only query specific data, no broad access

---

## Firebase Configuration

### **Required Environment Variables**
```bash
# Firebase Functions environment
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
```

### **Firebase Services Used**
- **Authentication**: Anonymous Auth for persistent user IDs
- **Firestore**: Real-time database with TTL policies
- **Cloud Functions**: Node.js 20 backend functions
- **Cloud Messaging**: Cross-platform push notifications

### **Firestore Security Rules** (Deployed)
**File**: `firestore.rules` | **Config**: `firebase.json`

Comprehensive security rules that enforce:
- ✅ User isolation - Users can only access their own data
- ✅ Privacy protection - No cross-user data leakage
- ✅ TTL enforcement - Expired contact relationships can't be read
- ✅ Anonymous auth requirement - All operations require authentication
- ✅ Write-only analytics - Usage tracking can't be read by clients
- ✅ Server-side control - Critical operations only via Cloud Functions

**Key Rules:**
- **Invites**: Readable by authenticated users, writable by creator only
- **user_tokens**: Owner-only read/write (prevents token theft)
- **call_sessions**: Owner creates/updates, queryable for active call detection (30-min window)
- **contact_relationships**: Mutual access with TTL enforcement, write via Cloud Functions only
- **user_history**: Completely isolated per user
- **usage_tracking**: Write-only for privacy (prevents quota inspection)
- **token_requests**: Write-only for rate limiting
- **call_cancellations**: Write-only for audit trail

**Deployment**:
```bash
firebase deploy --only firestore:rules
```

See `firestore.rules` for complete implementation details.

### **Required Firestore Indexes**
- **`call_sessions`**: Composite index on `status` (asc) + `startTime` (asc)
- **`token_requests`**: Composite index on `userId` (asc) + `timestamp` (asc)

### **TTL Policies**
- **Collection**: `contact_relationships`
- **TTL Field**: `expiresAt`
- **Auto-deletion**: Documents deleted when `expiresAt` timestamp reached

---

## LiveKit Integration

### **Room Naming Strategy**
- **Format**: `privacycall_CALLER_RECIPIENT_TIMESTAMP`
- **Uniqueness**: Each call gets unique room with caller UID + timestamp
- **Privacy**: Uses first 8 characters of UIDs only
- **Collision prevention**: Timestamp ensures no room conflicts

### **Audio Configuration**
```javascript
{
  adaptiveStream: true,
  dynacast: true,
  audioCaptureDefaults: {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
  }
}
```

### **Security**
- **Server-side tokens**: All LiveKit tokens generated via secure Cloud Functions
- **E2EE enabled**: End-to-end encryption for all audio streams
- **Room access control**: Only authenticated users can generate tokens
- **Time-limited tokens**: 2-hour expiry on all access tokens

---

## Platform-Specific Implementations

### **iOS Specific**
- **FCM integration**: Proper APNS configuration
- **Background handling**: Limited background processing capabilities
- **Cold start**: Navigation timing considerations for app launches
- **AppState listeners**: Detect app activation for data refresh

### **Android Specific**
- **Notification permissions**: POST_NOTIFICATIONS for Android 13+
- **Notification channels**: High-priority channels for incoming calls
- **Background message handler**: Captures notifications when app closed
- **Battery optimization**: Considerations for manufacturer power management

---

## Edge Cases & Robustness

### **Rapid Call Cancellation**
- **Foreground apps**: Prevention flag system blocks racing notifications
- **Background apps**: "Call Cancelled" message for rapid cancellations
- **Error suppression**: Silent handling of expected rapid cancellation errors
- **LiveKit cleanup**: Prevents room conflicts for subsequent calls

### **Multiple Incoming Calls**
- **Simultaneous calls**: Smart detection of multiple callers within 10-second window
- **Background notifications**: Works even when app is completely closed
- **Call selection**: User chooses which call to answer
- **Automatic decline**: Non-selected calls get decline notifications

### **Old Notification Handling**
- **Age validation**: Checks if notifications are older than 2 minutes
- **Session validation**: Verifies call sessions still exist on server
- **Call expired UI**: Clean messaging for expired calls
- **Group call support**: Works for both direct and group calls

### **Network & Connectivity**
- **Poor connectivity**: LiveKit adapts to network conditions
- **FCM delivery**: Server-side history logging ensures call tracking
- **Firebase outages**: Graceful degradation when services unavailable
- **Real-time sync**: Efficient Firestore listeners vs polling

---

## Data Flow & Lifecycle

### **Contact Addition Flow**
1. **User creates invite** → Server generates token with 15-min expiry
2. **Share invite link** → QR code or copy/paste sharing
3. **Recipient accepts** → Server creates temporary contact relationship
4. **Mutual sync** → Both users get each other as contacts
5. **Auto-cleanup** → Relationship auto-deletes after 15 minutes via TTL

### **Call Flow**
1. **Caller initiates** → Unique room created, server session started
2. **Notification sent** → FCM to target user(s) with call data
3. **Background logging** → Server logs call attempt to user history
4. **User interaction** → Answer, decline, or ignore notification
5. **Call ends** → Server session updated, usage tracked, cleanup

### **History Sync Flow**
1. **Server logging** → All notifications logged to user_history collection
2. **User opens history** → Client syncs with server history
3. **Local storage** → Server entries added to local AsyncStorage
4. **Server cleanup** → Server history deleted immediately after sync
5. **Display** → Combined local + synced history shown to user

---

## Configuration & Constants

### **AppConfig.js Key Settings**
```javascript
INVITE_EXPIRATION_MINUTES: 15,        // Invite link expiry time
MAX_GROUP_PARTICIPANTS: 8,            // Maximum group call size
CALL_TIMEOUT_SECONDS: 30,             // Ring timeout before giving up
MONTHLY_QUOTA_MINUTES: 1000,          // Free monthly minutes per user
PARTIAL_UID_LENGTH: 6,                // Show first 3 + last 3 chars of UID
```

### **Storage Keys**
```javascript
STORAGE_KEYS: {
  USER_ID: '@privacycall/user_id',
  CONTACTS: '@privacycall/contacts',
  CALL_HISTORY: '@privacycall/call_history',
  FCM_TOKEN: '@privacycall/fcm_token',
  // ... additional keys for different data types
}
```

---

## Testing & Quality Assurance

### **Critical Test Scenarios**
1. **Rapid call cancellation**: Call and cancel within 1 second
2. **Multiple simultaneous calls**: 2+ callers within 10 seconds
3. **Background app notifications**: App closed, don't tap notification, open app directly
4. **Old notification tapping**: Tap notifications from hours/days ago
5. **Network disruption**: Poor connectivity during active calls
6. **Permission scenarios**: Deny/grant notifications permissions
7. **Timezone changes**: Create invites, change timezone, check timers
8. **Group call cancellation**: Cancel group calls, tap old notifications

### **Performance Considerations**
- **Memory management**: Proper cleanup of LiveKit resources
- **Battery efficiency**: Real-time listeners vs polling
- **Network efficiency**: Minimal server requests
- **Storage optimization**: AsyncStorage data management

---

## Deployment & Environment

### **Development Environment**
- **Expo SDK 51**: Latest stable version
- **React Native 0.74.5**: Specific version for compatibility
- **Node.js 20**: For Firebase Functions
- **Firebase Project**: Standard project with all services enabled

### **Build Configuration**
- **EAS Build**: Recommended for cloud builds (avoids local Node.js issues)
- **Local builds**: Possible but may have compatibility issues
- **Signing**: Configured for both development and production

### **Environment Variables**
```bash
# Required for Firebase Functions
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...

# Firebase configuration (auto-configured via google-services files)
```

---

## Troubleshooting Guide

### **Common Issues**

#### **Build Problems**
- **Node.js compatibility**: Use EAS Build for production builds
- **Dependency conflicts**: Use `npm install` (not yarn)
- **Metro cache**: `npx react-native start --reset-cache` if needed

#### **Notification Issues**
- **Android permissions**: Ensure POST_NOTIFICATIONS granted
- **iOS background**: Background handlers limited when app terminated
- **FCM delivery**: Check Firebase console for delivery status

#### **Call Issues**
- **Room conflicts**: Unique room names prevent conflicts
- **Audio problems**: Check device permissions and LiveKit logs
- **Session cleanup**: Proper server session termination is critical

#### **Firebase Issues**
- **Missing indexes**: Create required Firestore composite indexes
- **Function errors**: Check Cloud Functions logs for debugging
- **TTL policies**: Ensure TTL policies configured correctly

### **Debug Logging**
The app includes comprehensive logging with prefixes:
- **`📱 BACKGROUND_HANDLER:`** - Background notification processing
- **`🔔 NOTIFICATION_TRACKING:`** - FCM notification flow
- **`MULTIPLE_CALLS:`** - Multiple call detection and routing
- **`CALL_VALIDATION:`** - Old notification and session validation
- **`PRIVACY_CLEANUP:`** - Data cleanup and compliance
- **`🗑️ PRIVACY_DELETE:`** - Server data deletion operations

---

## Privacy & Compliance

### **Data Retention Policies**
- **Contact relationships**: 15 minutes maximum via TTL
- **Server history**: Deleted immediately after client sync
- **Call sessions**: Cleaned up when calls end
- **Invite data**: 15-minute expiry with server cleanup

### **Anonymous Architecture**
- **No personal data**: Only anonymous Firebase UIDs used
- **Local contacts**: No server storage of contact information
- **Auto-generated names**: "Contact ABC...XYZ" format for privacy
- **Temporary relationships**: All server relationships expire automatically

### **Compliance Features**
- **Automatic cleanup**: Multiple cleanup triggers ensure data deletion
- **TTL policies**: Firestore handles automatic document expiry
- **Privacy logging**: Clear audit trail of all cleanup operations
- **Data minimization**: Only essential data stored, everything else discarded

---

## Future Considerations

### **Scalability**
- **User growth**: Anonymous auth scales infinitely
- **Call volume**: LiveKit infrastructure handles scale
- **Storage efficiency**: Local-first architecture minimizes server load

### **Feature Enhancements** (Not Currently Implemented)
- **CallKit integration**: iOS native call integration
- **ConnectionService**: Android native call integration
- **Video calls**: LiveKit supports video (audio-only currently)
- **Screen sharing**: Possible future LiveKit feature

### **Monitoring & Analytics**
- **Usage tracking**: Server-side call duration monitoring
- **Error tracking**: Comprehensive error logging
- **Performance metrics**: Call quality and connection statistics

---

## Notes for New Developers

### **When Working on This Codebase**
1. **Privacy first**: Always consider data minimization and auto-cleanup
2. **Cross-platform**: Test changes on both iOS and Android
3. **Edge cases**: The app handles many edge cases - don't break existing flows
4. **Server consistency**: Keep server session state in sync with client state
5. **Real-time listeners**: Prefer Firestore listeners over polling for efficiency

### **Key Principles**
- **No personal data**: Use anonymous IDs only
- **Temporary server storage**: All server data expires automatically
- **Graceful degradation**: App works even when services fail
- **User experience**: Smooth flows with proper loading states and error handling

### **Testing Approach**
- **Edge case focused**: Test rapid actions, network issues, old notifications
- **Cross-platform**: Verify features work on both iOS and Android
- **Privacy validation**: Ensure no data persists longer than intended
- **Performance testing**: Monitor resource usage and battery efficiency

---