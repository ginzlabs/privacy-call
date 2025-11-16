# Known Issues and Limitations

This document tracks current limitations, known bugs, and their workarounds.

**Last Updated**: November 2025
**Version**: 1.0.0
**Status**: Nearly Ready

---

## Current Limitations

### 1. Speaker/Earpiece Toggle Not Functional

**Issue**: The speaker toggle button appears in CallScreen but doesn't actually switch audio output.

**Details**:
- Calls correctly default to earpiece (not loudspeaker) ✅
- Toggle button UI works (icon changes) ✅
- Actual audio routing doesn't change ❌
- Audio stays on earpiece regardless of button state

**Root Cause**:
- LiveKit React Native SDK 2.9.1 `AudioSession.configureAudio()` only works for initial setup
- Runtime audio switching conflicts with LiveKit's automatic audio management
- Would require native iOS module for `AVAudioSession.overrideOutputAudioPort()`

**Workaround**:
- Users can use iOS system controls (Control Center) to switch to speaker
- Or accept earpiece-only calls (more private anyway)

**Future Fix Options**:
1. Write custom native module for direct AVAudioSession control
2. Upgrade to newer LiveKit SDK with better runtime audio APIs
3. Implement useIOSAudioManagement hook properly (had null pointer issues)

**Priority**: Low (main requirement met - earpiece default works)

---



### 2. Fresh Install First Call Delay

**Issue**: On fresh app install, first incoming call may be delayed by 1-2 seconds.

**Details**:
- Fresh install: First call ~1-2s delay
- Subsequent calls: Instant ✅
- Affects both iOS and Android

**Root Cause**:
- FCM token registration with Firestore
- 100ms propagation delay
- Server query for token during sendCallNotification

**Workaround**:
- Already optimized (was 3+ seconds, now ~1s)
- Acceptable for fresh install

**Priority**: Low (only affects first call ever)

---

### 4. Firestore Eventually Consistent

**Issue**: Rare edge cases where data updates aren't immediately visible.

**Details**:
- User deletes contact → Firestore write
- Other device checks immediately → Might not see deletion yet
- Typical delay: < 500ms

**Root Cause**: Firestore's eventual consistency model

**Workaround**:
- App already handles with retry logic
- Firestore listener provides real-time updates
- Sync blacklist prevents race conditions

**Not a Practical Issue**: Delays are sub-second and handled gracefully

---

### 5. App Reinstall Keeps Anonymous UID

**Issue**: Deleting and reinstalling app on iOS keeps the same anonymous user ID.

**Details**:
- This is **by design** for usage tracking persistence
- iOS Keychain stores Firebase auth data
- Allows usage quota to persist across reinstalls

**Not a Bug**: Intentional behavior for user experience

**Privacy Note**: UID is anonymous - doesn't reveal identity

---



## Testing Notes

### Simulator vs Physical Device


**Physical Device Required For:**
- ✅ Testing audio calls end-to-end
- ✅ Testing foreground notifications
- ✅ Testing microphone permissions
- ✅ Verifying audio routing (earpiece vs speaker)

---

## Performance Notes

### Startup Times

**Fresh Install:**
- With permission dialogs: ~1.5-2 seconds
- Expected behavior (permissions block UI)

**Returning User:**
- Typical: 600-800ms
- Target met: < 1.5 seconds ✅

**What Takes Time:**
- NotificationService init: ~200ms
- Auth: ~200ms
- FCM token registration: ~200ms (includes 100ms propagation delay)
- Data preload: ~50-100ms

### Call Connection Times

**First Call After Fresh Install:**
- ~1-2 seconds to connect
- Includes permission prompts

**Subsequent Calls:**
- ~500ms to connect
- Near-instant user experience

---

## Debugging Tips

### Enable Verbose Logging

All services already have comprehensive logging with emojis:
- 🔔 `INIT:` - Initialization events
- 📱 `FOREGROUND:` - Foreground notification handling
- 🎤 `MUTE_TOGGLE:` - Mute button state changes
- ⏱️ `STARTUP:` - Performance timing logs
- 🗑️ `CLEANUP:` - Resource cleanup

### Common Log Patterns

**Normal Call Flow:**
```
Starting call → Room created → Connecting → connected → ParticipantConnected → Audio track subscribed → Call ended → cleanup
```

**Look for these errors:**
- `permission-denied` → Check Firestore rules deployed
- `No FCM token found` → User not authenticated or token not registered
- `Audio track not received` → WebRTC negotiation issue

### Firebase Console Debugging

- **Functions**: Check logs for errors
- **Firestore**: Verify data structure matches expectations
- **Auth**: Verify anonymous users being created

---
