import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';
import { Alert, Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppConfig } from '../config/AppConfig';
import { FirebaseService } from './FirebaseService';
import { AuthService } from './AuthService';

/**
 * Notification Service
 * Handles Firebase Cloud Messaging for incoming call notifications
 * Manages FCM token registration and incoming call handling
 */

export const NotificationService = {
  // Navigation callback for incoming calls
  onIncomingCall: null,
  
  // Navigation callback for call cancellations
  onCallCancelled: null,
  
  // Navigation callback for call declines
  onCallDeclined: null,
  
  // Track recent notifications to prevent duplicates
  recentNotifications: new Set(),
  
  // Track recent cancellations to prevent showing incoming calls that were already cancelled
  recentCancellations: new Set(),
  
  // Flag to block next incoming call (for rapid cancellations)
  shouldBlockNextIncomingCall: false,
  
  // Simple multiple calls tracking
  pendingIncomingCalls: new Map(),

  /**
   * Initialize FCM and request permissions
   */
  async initialize() {
    try {
      console.log('🔔 INIT: Initializing Firebase Cloud Messaging on', Platform.OS, '...');
      
      // Phase 3: Clean up old pending calls from previous sessions
      await this.cleanupOldPendingCalls();
      
      // Android 13+ requires explicit notification permission
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        console.log('Android 13+ detected - requesting notification permission');
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.warn('Android notification permission denied');
          Alert.alert(
            'Notification Permission Required',
            'To receive incoming call notifications, please allow notifications for this app.',
            [{ text: 'OK' }]
          );
          return false;
        }

        console.log('Android notification permission granted');
      }

      // Android: Request microphone permission for audio calls
      // CRITICAL: Must be granted before receiving first call or AudioSession.startAudioSession() fails
      if (Platform.OS === 'android') {
        console.log('Android: Requesting microphone permission for audio calls');
        const micGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'PrivacyCall needs microphone access to make and receive audio calls.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );

        if (micGranted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.warn('Android microphone permission denied');
          Alert.alert(
            'Microphone Permission Required',
            'To make and receive audio calls, please allow microphone access. You can change this later in Settings.',
            [{ text: 'OK' }]
          );
          // Don't return false - let user continue to explore app
        } else {
          console.log('Android microphone permission granted');
        }
      }
      
      // Request FCM permissions (handles iOS and older Android)
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (!enabled) {
        console.warn('FCM notification permissions not granted');
        return false;
      }

      console.log('FCM notification permissions granted');

      // Register device for remote messages (iOS requirement)
      if (Platform.OS === 'ios') {
        await messaging().registerDeviceForRemoteMessages();
        console.log('Device registered for remote messages (iOS)');
      }

      // Get FCM token
      const fcmToken = await messaging().getToken();
      if (fcmToken) {
        console.log('FCM Token received:', fcmToken.substring(0, 20) + '...');
        await this.saveFCMToken(fcmToken);
        await this.registerTokenWithBackend(fcmToken);
      }

      // Set up message handlers
      console.log('🔔 INIT: Setting up message handlers...');
      this.setupMessageHandlers();
      console.log('🔔 INIT: Message handlers set up successfully');

      // Handle token refresh
      messaging().onTokenRefresh(async (newToken) => {
        console.log('FCM Token refreshed');
        await this.saveFCMToken(newToken);
        await this.registerTokenWithBackend(newToken);
      });

      console.log('🔔 INIT: ✅ NotificationService initialization complete on', Platform.OS);
      return true;
    } catch (error) {
      console.error('Error initializing FCM:', error);
      return false;
    }
  },

  /**
   * Save FCM token locally
   */
  async saveFCMToken(token) {
    try {
      await AsyncStorage.setItem(AppConfig.STORAGE_KEYS.FCM_TOKEN, token);
      console.log('FCM token saved locally');
    } catch (error) {
      console.error('Error saving FCM token:', error);
    }
  },

  /**
   * Register FCM token with backend for targeted notifications
   */
  async registerTokenWithBackend(fcmToken) {
    try {
      const currentUser = await AuthService.getCurrentUserId();
      if (!currentUser) {
        console.warn('No authenticated user to register FCM token');
        return;
      }

      // Store FCM token in Firestore for targeted notifications
      await FirebaseService.firestore()
        .collection('user_tokens')
        .doc(currentUser)
        .set({
          fcmToken: fcmToken,
          updatedAt: firestore.FieldValue.serverTimestamp(),
          platform: Platform.OS,
        }, { merge: true });

      console.log('FCM token registered with backend for user:', currentUser);

      // Wait for Firestore write to propagate (eventual consistency)
      // Reduced to 100ms for faster startup (tested to still work reliably)
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('FCM token propagation delay complete (100ms)');
    } catch (error) {
      console.error('Error registering FCM token with backend:', error);
    }
  },

  /**
   * Set up FCM message handlers for different app states
   */
  setupMessageHandlers() {
    // Handle messages when app is in foreground
    messaging().onMessage(async (remoteMessage) => {
      console.log('📱 FOREGROUND: FCM message received:', remoteMessage.messageId);
      console.log('📱 FOREGROUND: Message data:', remoteMessage.data);

      if (remoteMessage.data?.type === 'incoming_call') {
        console.log('📱 FOREGROUND: Processing incoming call notification');
        // Store as active incoming call for direct app opening detection
        await this.storeActiveIncomingCall(remoteMessage);
        // Log to history immediately (even if not tapped)
        await this.logNotificationToHistory(remoteMessage);
        // Store immediately for multiple calls detection
        await this.storeNotificationInBackground(remoteMessage);
        console.log('📱 FOREGROUND: Calling handleIncomingCallNotification...');
        this.handleIncomingCallNotification(remoteMessage);
        console.log('📱 FOREGROUND: handleIncomingCallNotification completed');
      }
    });

    // Handle messages when app is in background or quit
    messaging().onNotificationOpenedApp(async (remoteMessage) => {
      console.log('FCM notification opened app:', remoteMessage);
      
      if (remoteMessage.data?.type === 'incoming_call') {
        // Store immediately for multiple calls detection (iOS needs this here)
        await this.storeNotificationInBackground(remoteMessage);
        this.handleIncomingCallNotification(remoteMessage);
      }
    });

    // Handle initial notification when app was opened from quit state
    messaging()
      .getInitialNotification()
      .then(async (remoteMessage) => {
        if (remoteMessage) {
          console.log('FCM notification opened app from quit state:', remoteMessage);
          
          if (remoteMessage.data?.type === 'incoming_call') {
            // Log to history immediately (iOS fallback for closed app)
            await this.logNotificationToHistory(remoteMessage);
            // Store immediately for multiple calls detection (iOS cold start)
            await this.storeNotificationInBackground(remoteMessage);
            this.handleIncomingCallNotification(remoteMessage);
          }
        }
      });
  },

  /**
   * Store active incoming call for direct app opening detection
   */
  async storeActiveIncomingCall(remoteMessage) {
    try {
      const { callerName, callerUID, roomName, callType, isCancellation } = remoteMessage.data;
      
      // Skip cancellations
      if (isCancellation === 'true' || callerName === 'Call Cancelled') {
        // Clear active call if it's a cancellation
        await AsyncStorage.removeItem('@privacycall/active_incoming_call');
        console.log('📞 ACTIVE_CALL: Cleared active call due to cancellation');
        return;
      }
      
      console.log('📞 ACTIVE_CALL: Storing active incoming call for:', callerUID?.substring(0, 8) + '...');
      
      const activeCallData = {
        callerName: callerName || 'Unknown Caller',
        callerUID,
        roomName,
        callType,
        timestamp: Date.now(),
        messageId: remoteMessage.messageId,
      };
      
      await AsyncStorage.setItem('@privacycall/active_incoming_call', JSON.stringify(activeCallData));
      console.log('📞 ACTIVE_CALL: Active call stored for direct app opening detection');
      
      // Auto-remove after 30 seconds (call timeout)
      setTimeout(async () => {
        try {
          await AsyncStorage.removeItem('@privacycall/active_incoming_call');
          console.log('📞 ACTIVE_CALL: Auto-removed expired active call');
        } catch (error) {
          console.error('Error removing active call:', error);
        }
      }, 30000);
      
    } catch (error) {
      console.error('📞 ACTIVE_CALL: Error storing active call:', error);
    }
  },

  /**
   * Log notification to history (for untapped notifications)
   */
  async logNotificationToHistory(remoteMessage) {
    try {
      const { callerName, callerUID, isCancellation } = remoteMessage.data;

      // Don't log cancellation notifications - the original incoming call is already logged
      // Cancellation is just for UI dismissal, not a separate history event
      if (isCancellation === 'true' || callerName === 'Call Cancelled') {
        console.log('📝 HISTORY_LOG: Skipping cancellation notification (original call already logged)');
        return;
      }

      console.log('📝 HISTORY_LOG: Logging notification to history for:', callerUID?.substring(0, 8) + '...');

      // Log as incoming call
      const historyType = 'call_incoming';
      const contactName = callerName || 'Unknown Caller';
      
      // Get current history
      const historyJson = await AsyncStorage.getItem('@privacycall/call_history');
      const history = historyJson ? JSON.parse(historyJson) : [];
      
      // Check for duplicates (same caller, same type, within 30 seconds)
      const isAlreadyLogged = history.some(entry => 
        entry.callerUID === callerUID && 
        entry.type === historyType &&
        Math.abs(Date.now() - new Date(entry.timestamp).getTime()) < 30000
      );
      
      if (!isAlreadyLogged) {
        const historyEntry = {
          type: historyType,
          timestamp: new Date().toISOString(),
          contactName: contactName,
          callerUID: callerUID !== 'system' ? callerUID : undefined,
        };
        
        // Remove undefined values
        Object.keys(historyEntry).forEach(key => {
          if (historyEntry[key] === undefined) {
            delete historyEntry[key];
          }
        });
        
        const updatedHistory = [historyEntry, ...history].slice(0, 1000);
        await AsyncStorage.setItem('@privacycall/call_history', JSON.stringify(updatedHistory));
        console.log('📝 HISTORY_LOG: Logged', historyType, 'to history');
      } else {
        console.log('📝 HISTORY_LOG: Already logged - skipping duplicate');
      }
    } catch (error) {
      console.error('📝 HISTORY_LOG: Error logging to history:', error);
    }
  },

  /**
   * Store notification data in background (shared by all handlers)
   */
  async storeNotificationInBackground(remoteMessage) {
    try {
      const { callerName, callerUID, roomName, callType, isCancellation } = remoteMessage.data;
      
      // Skip cancellations/declines
      if (isCancellation === 'true' || callerName === 'Call Cancelled') {
        console.log('📱 STORE_BACKGROUND: Skipping cancellation notification');
        return;
      }
      
      console.log('📱 STORE_BACKGROUND: Storing call data for:', callerUID?.substring(0, 8) + '...');
      
      const callData = {
        callerName,
        callerUID,
        roomName,
        callType,
        timestamp: Date.now(),
        messageId: remoteMessage.messageId,
        source: 'message_handler',
      };
      
      // Get existing pending calls
      const existingCallsJson = await AsyncStorage.getItem('@privacycall/pending_calls');
      const existingCalls = existingCallsJson ? JSON.parse(existingCallsJson) : [];
      
      // Check for duplicates (same caller + room)
      const isDuplicate = existingCalls.some(call => 
        call.callerUID === callerUID && call.roomName === roomName
      );
      
      if (!isDuplicate) {
        existingCalls.push(callData);
        await AsyncStorage.setItem('@privacycall/pending_calls', JSON.stringify(existingCalls));
        console.log('📱 STORE_BACKGROUND: Stored call. Total pending calls:', existingCalls.length);
        console.log('📱 STORE_BACKGROUND: All callers:', existingCalls.map(c => c.callerUID?.substring(0, 8) + '...'));
      } else {
        console.log('📱 STORE_BACKGROUND: Duplicate call - not storing');
      }
    } catch (error) {
      console.error('📱 STORE_BACKGROUND: Error storing call data:', error);
    }
  },

  /**
   * Handle incoming call notification
   */
  async handleIncomingCallNotification(remoteMessage) {
    try {
      const { callerName, callerUID, roomName, callType, isCancellation } = remoteMessage.data;

      // Check if already in this call room (prevent duplicate notifications)
      const LiveKitService = require('./LiveKitService').LiveKitService;
      if (LiveKitService.room && LiveKitService.room.name === roomName) {
        console.log('DUPLICATE: Already in call room:', roomName, '- ignoring notification');
        return;
      }

      // Check if this is a call cancellation or decline notification
      if (isCancellation === 'true' || isCancellation === true || callerName === 'Call Cancelled') {
        console.log('DETECTED CALL CANCELLATION - dismissing incoming call');
        this.handleCallCancellation(remoteMessage);
        return;
      } else if (remoteMessage.data.isDecline === 'true' || remoteMessage.data.isDecline === true || callerName === 'Call Declined') {
        console.log('DETECTED CALL DECLINE - notifying caller');
        this.handleCallDecline(remoteMessage);
        return;
      }
      
      // CRITICAL: Check if we should block this incoming call (rapid cancellation case)
      console.log('PREVENTION: Checking block flag:', {
        shouldBlock: this.shouldBlockNextIncomingCall,
        callerName,
        callerUID,
        roomName,
      });
      
      if (this.shouldBlockNextIncomingCall) {
        console.log('PREVENTION: ✅ BLOCKED - Incoming call blocked due to recent cancellation');
        this.shouldBlockNextIncomingCall = false; // Reset flag after use
        return; // Don't show the incoming call UI
      }
      
      // Create unique identifier for this notification (include timestamp for uniqueness)
      const notificationId = `${callerUID}_${roomName}_${remoteMessage.data.timestamp}`;
      
      // Check if we've already processed this exact notification recently (shorter window)
      if (this.recentNotifications.has(notificationId)) {
        console.log('Ignoring duplicate notification:', notificationId);
        return;
      }
      
      // Add to recent notifications and auto-remove after 10 seconds (shorter window)
      this.recentNotifications.add(notificationId);
      setTimeout(() => {
        this.recentNotifications.delete(notificationId);
      }, 10000); // 10 seconds instead of 30
      
      console.log('Handling incoming call notification:', {
        callerName,
        callerUID,
        roomName,
        callType,
      });

      // Store incoming call data
      const callData = {
        callerName,
        callerUID,
        roomName,
        callType,
        timestamp: Date.now(),
      };
      
      // SIMPLE MULTIPLE CALLS: Check for other pending calls in persistent storage
      const pendingCallsJson = await AsyncStorage.getItem('@privacycall/pending_calls');
      const existingCalls = pendingCallsJson ? JSON.parse(pendingCallsJson) : [];
      
      // Filter for recent calls from different callers (10-second window)
      const recentOtherCalls = existingCalls.filter(call => 
        call.callerUID !== callerUID && 
        (Date.now() - call.timestamp) < 10000 // 10-second window for multiple calls
      );
      
      console.log('MULTIPLE_CALLS: Found', recentOtherCalls.length, 'other recent calls');
      console.log('MULTIPLE_CALLS: Current caller:', callerUID?.substring(0, 8) + '...');
      console.log('MULTIPLE_CALLS: All stored calls:', existingCalls.length);
      if (recentOtherCalls.length > 0) {
        console.log('MULTIPLE_CALLS: Other callers:', recentOtherCalls.map(c => c.callerUID?.substring(0, 8) + '...'));
      }
      if (existingCalls.length > 0) {
        console.log('MULTIPLE_CALLS: All stored callers:', existingCalls.map(c => ({
          caller: c.callerUID?.substring(0, 8) + '...',
          age: Math.round((Date.now() - c.timestamp) / 1000) + 's',
          source: c.source || 'unknown'
        })));
      }
      
      // Add this call to persistent storage
      const updatedCalls = [...existingCalls, callData];
      await AsyncStorage.setItem('@privacycall/pending_calls', JSON.stringify(updatedCalls));
      
      // If no other calls found in storage, check server for active call sessions (iOS fallback)
      if (recentOtherCalls.length === 0) {
        console.log('MULTIPLE_CALLS: No stored calls found - checking server for active sessions');
        
        try {
          const currentUser = await AuthService.getCurrentUserId();
          
          // Check if there are active call sessions to this user from other callers
          const activeSessionsSnapshot = await FirebaseService.firestore()
            .collection('call_sessions')
            .where('status', '==', 'active')
            .get();
          
          // Look for sessions where the room name includes the current user and is from a different caller
          const otherActiveSessions = [];
          activeSessionsSnapshot.docs.forEach(doc => {
            const sessionData = doc.data();
            const roomName = sessionData.roomName;
            const sessionCaller = sessionData.userId;
            
            // Check if this session is calling the current user and is from a different caller
            if (roomName && roomName.includes(currentUser) && 
                sessionCaller !== callerUID && 
                sessionCaller !== currentUser) {
              
              const sessionAge = Date.now() - sessionData.startTime.toDate().getTime();
              if (sessionAge < 30000) { // Within 30 seconds
                console.log('MULTIPLE_CALLS: Found active server session from:', sessionCaller?.substring(0, 8) + '...');
                
                otherActiveSessions.push({
                  callerName: 'Unknown Caller',
                  callerUID: sessionCaller,
                  roomName: roomName,
                  callType: sessionData.callType || 'direct',
                  timestamp: sessionData.startTime.toDate().getTime(),
                  source: 'server_session',
                });
              }
            }
          });
          
          if (otherActiveSessions.length > 0) {
            console.log('MULTIPLE_CALLS: Found', otherActiveSessions.length, 'active server sessions');
            console.log('MULTIPLE_CALLS: Server callers:', otherActiveSessions.map(c => c.callerUID?.substring(0, 8) + '...'));
            
            // Create array of all calls (server sessions + this call)
            const allCalls = [...otherActiveSessions, callData];
            
            // Navigate to multiple calls screen
            if (this.onMultipleIncomingCalls) {
              console.log('MULTIPLE_CALLS: Navigating to multiple calls screen with', allCalls.length, 'calls');
              this.onMultipleIncomingCalls(allCalls);
              return; // Exit early - don't process as single call
            }
          }
        } catch (error) {
          console.error('MULTIPLE_CALLS: Error checking server sessions:', error);
        }
      }
      
      if (recentOtherCalls.length > 0) {
        console.log('MULTIPLE_CALLS: Multiple callers detected - showing selection screen');

        // Create array of all calls (other calls + this call)
        const allCalls = [...recentOtherCalls, callData];

        // Navigate to multiple calls screen
        if (this.onMultipleIncomingCalls) {
          console.log('MULTIPLE_CALLS: Navigating to multiple calls screen with', allCalls.length, 'calls');
          this.onMultipleIncomingCalls(allCalls);
        } else {
          console.error('MULTIPLE_CALLS: ❌ onMultipleIncomingCalls callback not set!');
        }
      } else {
        console.log('MULTIPLE_CALLS: Single call - showing normal incoming call screen');

        await this.storeIncomingCallData(callData);

        // Trigger navigation to single IncomingCallScreen
        if (this.onIncomingCall) {
          console.log('📱 NAVIGATION: Triggering onIncomingCall callback with data:', {
            callerUID: callData.callerUID?.substring(0, 8) + '...',
            roomName: callData.roomName,
          });
          this.onIncomingCall(callData);
          console.log('📱 NAVIGATION: onIncomingCall callback completed');
        } else {
          console.error('📱 NAVIGATION: ❌ onIncomingCall callback not set!');
        }
      }
      
      // Auto-cleanup old calls after 15 seconds (longer than detection window)
      setTimeout(async () => {
        try {
          const currentCallsJson = await AsyncStorage.getItem('@privacycall/pending_calls');
          const currentCalls = currentCallsJson ? JSON.parse(currentCallsJson) : [];
          const freshCalls = currentCalls.filter(call => (Date.now() - call.timestamp) < 15000);
          
          if (freshCalls.length !== currentCalls.length) {
            await AsyncStorage.setItem('@privacycall/pending_calls', JSON.stringify(freshCalls));
            console.log('MULTIPLE_CALLS: Cleaned up old calls:', currentCalls.length, '→', freshCalls.length);
          }
        } catch (error) {
          console.error('Error cleaning up pending calls:', error);
        }
      }, 15000);

    } catch (error) {
      console.error('Error handling incoming call notification:', error);
    }
  },

  /**
   * Handle call cancellation notification
   */
  async handleCallCancellation(remoteMessage) {
    try {
      console.log('Handling call cancellation notification');
      console.log('onCallCancelled callback exists:', !!this.onCallCancelled);
      
      // Create cancellation identifier to track this cancellation
      const { callerUID, roomName } = remoteMessage.data;
      const cancellationId = `${callerUID}_${roomName}`;
      
      console.log('CANCELLATION: Recording cancellation for future incoming calls:', {
        cancellationId,
        callerUID,
        roomName,
        fullMessageData: remoteMessage.data,
      });
      
      // Track this cancellation to prevent future incoming call from same caller/room
      this.recentCancellations.add(cancellationId);
      
      // Remove from cancellations after 10 seconds (enough time for background app notifications)
      setTimeout(() => {
        this.recentCancellations.delete(cancellationId);
        console.log('CANCELLATION: Removed cancellation record:', cancellationId);
      }, 10000);
      
      // Trigger navigation away from IncomingCallScreen if it exists
      if (this.onCallCancelled) {
        console.log('Calling onCallCancelled callback');
        this.onCallCancelled();
      } else {
        console.warn('No onCallCancelled callback set - will block future incoming call');
        
        // CRITICAL: Set a flag to prevent the incoming call notification from showing UI
        console.log('CANCELLATION: Setting prevention flag for incoming call');
        this.shouldBlockNextIncomingCall = true;
        
        // Clear the flag after 1 second (just enough time for the incoming call notification)
        setTimeout(() => {
          this.shouldBlockNextIncomingCall = false;
          console.log('CANCELLATION: Cleared prevention flag');
        }, 1000);
      }
    } catch (error) {
      console.error('Error handling call cancellation:', error);
    }
  },

  /**
   * Handle call decline notification (notify calling device)
   */
  async handleCallDecline(remoteMessage) {
    try {
      console.log('Handling call decline notification');
      console.log('onCallDeclined callback exists:', !!this.onCallDeclined);
      
      // Trigger call decline handling on calling device
      if (this.onCallDeclined) {
        console.log('Calling onCallDeclined callback');
        this.onCallDeclined();
      } else {
        console.warn('No onCallDeclined callback set!');
      }
    } catch (error) {
      console.error('Error handling call decline:', error);
    }
  },

  /**
   * Store incoming call data for app to handle
   */
  async storeIncomingCallData(callData) {
    try {
      await AsyncStorage.setItem(
        AppConfig.STORAGE_KEYS.INCOMING_CALL, 
        JSON.stringify(callData)
      );
      console.log('Incoming call data stored');
    } catch (error) {
      console.error('Error storing incoming call data:', error);
    }
  },

  /**
   * Get and clear incoming call data
   */
  async getAndClearIncomingCallData() {
    try {
      const callDataJson = await AsyncStorage.getItem(AppConfig.STORAGE_KEYS.INCOMING_CALL);
      if (callDataJson) {
        await AsyncStorage.removeItem(AppConfig.STORAGE_KEYS.INCOMING_CALL);
        return JSON.parse(callDataJson);
      }
      return null;
    } catch (error) {
      console.error('Error getting incoming call data:', error);
      return null;
    }
  },

  /**
   * Send incoming call notification to user
   * This would be called from your backend when someone starts a call
   */
  async sendIncomingCallNotification(targetUserUID, callerData, roomData) {
    try {
      // This calls our Cloud Function to send the notification
      const sendNotification = FirebaseService.functions().httpsCallable('sendCallNotification');
      
      const result = await sendNotification({
        targetUserUID: targetUserUID,
        callerName: callerData.nickname,
        callerUID: callerData.uid,
        roomName: roomData.name,
        callType: roomData.isGroup ? 'group' : 'direct',
      });

      console.log('Incoming call notification sent:', result.data);
      return result.data.success;
    } catch (error) {
      console.error('Error sending incoming call notification:', error);
      return false;
    }
  },

  /**
   * Send call cancellation notification to dismiss incoming call screen
   */
  async sendCallCancellation(targetUserUID, originalRoomName = null, originalCallerUID = null) {
    try {
      console.log('Sending call cancellation notification to:', {
        targetUserUID,
        originalRoomName,
        originalCallerUID,
      });
      
      // If we have the original call info, include it in the cancellation for better matching
      const cancellationData = {
        targetUserUID: targetUserUID,
        callerName: 'Call Cancelled',
        callerUID: originalCallerUID || 'system',
        roomName: originalRoomName || 'cancelled_call',
        callType: 'direct',
        isCancellation: true,
      };
      
      console.log('CANCELLATION_SEND: Sending with data:', cancellationData);
      
      const sendNotification = FirebaseService.functions().httpsCallable('sendCallNotification');
      const result = await sendNotification(cancellationData);

      console.log('Call cancellation notification sent:', result.data);
      return result.data.success;
    } catch (error) {
      console.error('Error sending call cancellation:', error);
      // Don't throw - cancellation failure shouldn't block the caller
      return false;
    }
  },

  /**
   * Send call decline notification to notify caller of rejection
   */
  async sendCallDecline(callerUID) {
    try {
      console.log('Sending call decline notification to caller:', callerUID);
      
      const sendNotification = FirebaseService.functions().httpsCallable('sendCallNotification');
      
      const result = await sendNotification({
        targetUserUID: callerUID,
        callerName: 'Call Declined',
        callerUID: 'system',
        roomName: 'declined_call',
        callType: 'direct',
        isDecline: true, // Add decline flag
      });

      console.log('Call decline notification sent:', result.data);
      return result.data.success;
    } catch (error) {
      console.error('Error sending call decline:', error);
      // Don't throw - decline failure shouldn't block the receiver
      return false;
    }
  },

  /**
   * Clean up old pending calls (session-independent)
   */
  async cleanupOldPendingCalls() {
    try {
      console.log('CLEANUP: Removing old pending calls');
      
      const pendingCallsJson = await AsyncStorage.getItem('@privacycall/pending_calls');
      if (pendingCallsJson) {
        const pendingCalls = JSON.parse(pendingCallsJson);
        const freshCalls = pendingCalls.filter(call => (Date.now() - call.timestamp) < 30000); // 30 seconds
        
        if (freshCalls.length !== pendingCalls.length) {
          console.log('CLEANUP: Filtered pending calls:', pendingCalls.length, '→', freshCalls.length);
          
          if (freshCalls.length > 0) {
            await AsyncStorage.setItem('@privacycall/pending_calls', JSON.stringify(freshCalls));
          } else {
            await AsyncStorage.removeItem('@privacycall/pending_calls');
          }
        } else {
          console.log('CLEANUP: All pending calls are fresh');
        }
      } else {
        console.log('CLEANUP: No pending calls to clean');
      }
    } catch (error) {
      console.error('Error cleaning up old pending calls:', error);
    }
  },

  /**
   * Check if a specific call was cancelled (for background app notifications)
   */
  wasCallCancelled(callerUID, roomName) {
    const cancellationId = `${callerUID}_${roomName}`;
    const wasCancelled = this.recentCancellations.has(cancellationId);
    
    console.log('CANCELLATION_CHECK: Checking if call was cancelled:', {
      cancellationId,
      wasCancelled,
      caller: callerUID,
      room: roomName,
    });
    
    return wasCancelled;
  },

  /**
   * Request notification permissions if not already granted
   */
  async requestPermissions() {
    try {
      const authStatus = await messaging().requestPermission();
      
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('Notification permissions granted');
        return true;
      } else {
        console.warn('Notification permissions denied');
        Alert.alert(
          'Notifications Disabled',
          'To receive incoming call notifications, please enable notifications in your device settings.',
          [{ text: 'OK' }]
        );
        return false;
      }
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  },

  /**
   * Get current FCM token
   */
  async getFCMToken() {
    try {
      const token = await messaging().getToken();
      console.log('Current FCM token retrieved');
      return token;
    } catch (error) {
      console.error('Error getting FCM token:', error);
      return null;
    }
  },

  /**
   * Clear notification badge (disabled - no badges used)
   */
  async clearBadge() {
    // No-op: App configured to never show badges
    console.log('Badge clearing not needed - app configured without badges');
  },
};

export default NotificationService;