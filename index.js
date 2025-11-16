import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerGlobals } from '@livekit/react-native';

// CRITICAL: Must be called before any LiveKit code
registerGlobals();

import App from './App';

// Background message handler to capture ALL FCM notifications (even untapped ones)
// This is critical for Android multiple calls detection
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('📱 BACKGROUND_HANDLER: FCM notification received:', remoteMessage.messageId);
  
  if (remoteMessage.data?.type === 'incoming_call') {
    const { callerName, callerUID, roomName, callType, isCancellation } = remoteMessage.data;
    
    // Handle cancellations - don't log (original incoming call already logged)
    // Cancellation is just for UI dismissal, not a separate history event
    if (isCancellation === 'true' || callerName === 'Call Cancelled') {
      console.log('📱 BACKGROUND_HANDLER: Skipping cancellation (original call already logged)');
      return;
    }
    
    console.log('📱 BACKGROUND_HANDLER: Logging incoming call to history for:', callerUID?.substring(0, 8) + '...');
    
    try {
      // Store this call data immediately for multiple calls detection
      const callData = {
        callerName,
        callerUID,
        roomName,
        callType,
        timestamp: Date.now(),
        messageId: remoteMessage.messageId,
        source: 'background_handler',
      };
      
      // Get existing pending calls
      const existingCallsJson = await AsyncStorage.getItem('@privacycall/pending_calls');
      const existingCalls = existingCallsJson ? JSON.parse(existingCallsJson) : [];
      
      // Check for duplicates (same caller + room)
      const isDuplicate = existingCalls.some(call => 
        call.callerUID === callerUID && call.roomName === roomName
      );
      
      if (!isDuplicate) {
        // Add this call to the list
        existingCalls.push(callData);
        await AsyncStorage.setItem('@privacycall/pending_calls', JSON.stringify(existingCalls));
        console.log('📱 BACKGROUND_HANDLER: Stored call. Total pending calls:', existingCalls.length);
      } else {
        console.log('📱 BACKGROUND_HANDLER: Duplicate call - not storing');
      }
      
      // CRITICAL: Store active call for direct app opening detection
      const activeCallData = {
        callerName: callerName || 'Unknown Caller',
        callerUID,
        roomName,
        callType,
        timestamp: Date.now(),
        messageId: remoteMessage.messageId,
      };
      
      await AsyncStorage.setItem('@privacycall/active_incoming_call', JSON.stringify(activeCallData));
      console.log('📱 BACKGROUND_HANDLER: Stored active call for direct app opening detection');
      
      // CRITICAL: Log incoming call to history (even if untapped)
      const historyJson = await AsyncStorage.getItem('@privacycall/call_history');
      const history = historyJson ? JSON.parse(historyJson) : [];
      
      // Check if this call is already logged (prevent duplicates)
      const isAlreadyLogged = history.some(entry => 
        entry.callerUID === callerUID && 
        entry.type === 'call_incoming' &&
        Math.abs(Date.now() - new Date(entry.timestamp).getTime()) < 30000 // Within 30 seconds
      );
      
      if (!isAlreadyLogged) {
        const historyEntry = {
          type: 'call_incoming',
          timestamp: new Date().toISOString(),
          contactName: callerName === 'Unknown Caller' ? 'Unknown Caller' : callerName,
          callerUID: callerUID,
        };
        
        const updatedHistory = [historyEntry, ...history].slice(0, 1000);
        await AsyncStorage.setItem('@privacycall/call_history', JSON.stringify(updatedHistory));
        console.log('📱 BACKGROUND_HANDLER: Logged incoming call to history');
      } else {
        console.log('📱 BACKGROUND_HANDLER: Call already logged to history');
      }
      
    } catch (error) {
      console.error('📱 BACKGROUND_HANDLER: Error storing call data:', error);
    }
  }
  
  return Promise.resolve();
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
