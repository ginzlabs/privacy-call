import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Vibration,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { LiveKitService } from '../services/LiveKitService';
import { NotificationService } from '../services/NotificationService';
import { ContactsService } from '../services/ContactsService';
import { AuthService } from '../services/AuthService';
import { FirebaseService } from '../services/FirebaseService';
import { getPartialUID } from '../config/AppConfig';

export default function IncomingCallScreen({ route, navigation }) {
  const { callerName, callerUID, roomName, callType, timestamp } = route.params || {};
  const [isAnswering, setIsAnswering] = useState(false);
  const [displayName, setDisplayName] = useState(callerName || 'Unknown Caller');
  const [callWasCancelled, setCallWasCancelled] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [callExpired, setCallExpired] = useState(false);

  // Set up cancellation listener
  useEffect(() => {
    const handleCancellation = () => {
      console.log('IncomingCallScreen: Call was cancelled, dismissing');
      navigation.navigate('MainTabs', { screen: 'Contacts' });
    };

    // Set up the cancellation callback (this will overwrite the App.js callback)
    console.log('IncomingCallScreen: Setting up cancellation callback');
    NotificationService.onCallCancelled = handleCancellation;

    // Cleanup
    return () => {
      console.log('IncomingCallScreen: Cleaning up cancellation callback');
      NotificationService.onCallCancelled = null;
    };
  }, [navigation]);

  // Validate notification age and call session existence
  useEffect(() => {
    const validateCallStatus = async () => {
      try {
        console.log('CALL_VALIDATION: Checking if call is still valid');

        // Phase 1: Check if call session still exists (PRIORITY - most important check)
        if (roomName) {
          console.log('CALL_VALIDATION: Checking if call session still active');
          
          const currentUserId = await AuthService.getCurrentUserId();
          const checkActiveCallsFunction = FirebaseService.functions().httpsCallable('checkActiveCallsToUser');
          const result = await checkActiveCallsFunction({
            targetUserUID: currentUserId,
          });
          
          // Check if THIS specific room is in the active calls
          const isRoomActive = result.data.activeCalls?.some(call => call.roomName === roomName);
          
          if (!isRoomActive) {
            console.log('CALL_VALIDATION: Call session no longer active');
            setCallExpired(true);
            setDisplayName('Call Ended');
            return;
          }
          
          console.log('CALL_VALIDATION: Call session is still active');
        }
        
        // Phase 2: Check notification age (reject old/delayed notifications)
        const notificationTimestamp = parseInt(timestamp) || Date.now();
        const notificationAge = Date.now() - notificationTimestamp;
        const maxAge = 2 * 60 * 1000; // 2 minutes (stricter to prevent stale notifications)

        if (notificationAge > maxAge) {
          console.log('CALL_VALIDATION: Notification too old -', Math.round(notificationAge / 1000), 'seconds (>2min) - auto-rejecting');
          setCallExpired(true);
          setDisplayName('Call Expired');
          return;
        }
        
        setIsCheckingStatus(false);
      } catch (error) {
        console.error('CALL_VALIDATION: Error validating call:', error);
        setIsCheckingStatus(false);
      }
    };

    validateCallStatus();
  }, [timestamp, roomName, navigation]);

  // Auto-dismiss when call expires
  useEffect(() => {
    if (callExpired) {
      console.log('CALL_EXPIRED: Setting up auto-dismiss timer');
      const timer = setTimeout(() => {
        console.log('CALL_EXPIRED: Auto-dismissing expired call screen');
        navigation.navigate('MainTabs', { screen: 'Contacts' });
      }, 1300);

      return () => {
        console.log('CALL_EXPIRED: Clearing auto-dismiss timer');
        clearTimeout(timer);
      };
    }
  }, [callExpired, navigation]);

  // CRITICAL: Check if this specific call was cancelled (for background app scenarios)
  useEffect(() => {
    const checkCallStatus = async () => {
      if (!roomName || !callerUID) {
        console.log('INCOMING_CALL_CHECK: Missing roomName or callerUID, skipping status check');
        setIsCheckingStatus(false);
        return;
      }

      // Check if this specific call was cancelled (handles background app case)
      const wasCancelled = NotificationService.wasCallCancelled(callerUID, roomName);
      
      if (wasCancelled) {
        console.log('INCOMING_CALL_CHECK: This specific call was already cancelled');
        setCallWasCancelled(true);
        setDisplayName('Call Cancelled');
        
        // Show "Call Cancelled" message briefly, then navigate away
        setTimeout(() => {
          navigation.navigate('MainTabs', { screen: 'Contacts' });
        }, 1500); // Show message for 1.5 seconds
      }
      
      setIsCheckingStatus(false);
    };

    // Run the check immediately on mount
    checkCallStatus();
  }, [roomName, callerUID, navigation]);

  // Look up caller's nickname from local contacts and log incoming call
  useEffect(() => {
    // Skip if call was already cancelled
    if (callWasCancelled) {
      return;
    }

    const lookupCallerName = async () => {
      try {
        if (callerUID) {
          const contacts = await ContactsService.getContacts();
          const contact = contacts.find(c => c.uid === callerUID);
          
          if (contact) {
            console.log('Found caller in contacts:', contact.nickname);
            setDisplayName(contact.nickname);
          } else {
            console.log('Caller not found in contacts, using:', callerName || 'Unknown Caller');
            setDisplayName(callerName || 'Unknown Caller');
          }
          
          // Log incoming call to history
          const historyEntry = {
            type: 'call_incoming',
            timestamp: new Date().toISOString(),
            contactName: contact?.nickname || callerName || 'Unknown Caller',
            contactNickname: contact?.nickname,
            callerUID: callerUID,
          };
          
          console.log('Logging incoming call to history:', historyEntry);
          await ContactsService.addHistoryEntry(historyEntry);
        }
      } catch (error) {
        console.error('Error looking up caller name:', error);
        setDisplayName(callerName || 'Unknown Caller');
      }
    };
    
    lookupCallerName();
  }, [callerUID, callerName, callWasCancelled]);

  // Start vibration pattern for incoming call
  useEffect(() => {
    // Skip vibration if call was already cancelled
    if (callWasCancelled) {
      return;
    }

    const vibrationPattern = [1000, 500, 1000, 500]; // Vibrate pattern
    Vibration.vibrate(vibrationPattern, true); // Repeat until answered

    // Clear notification badge
    NotificationService.clearBadge();

    // Cleanup on unmount
    return () => {
      Vibration.cancel();
    };
  }, [callWasCancelled]);

  const handleAnswer = async () => {
    try {
      setIsAnswering(true);
      Vibration.cancel(); // Stop vibration

      // Clear this call from pending_calls storage to prevent stale notifications
      try {
        const pendingCallsJson = await AsyncStorage.getItem('@privacycall/pending_calls');
        if (pendingCallsJson) {
          const pendingCalls = JSON.parse(pendingCallsJson);
          const filtered = pendingCalls.filter(call => call.roomName !== roomName);
          await AsyncStorage.setItem('@privacycall/pending_calls', JSON.stringify(filtered));
          console.log('ANSWERED: Cleared call from pending storage');
        }
      } catch (storageError) {
        console.error('Error clearing pending call:', storageError);
      }

      // Navigate to call screen with LiveKit room info
      navigation.replace('Call', {
        type: callType,
        roomName: roomName,
        callerUID: callerUID,
        callerName: callerName,
        isOutgoing: false,
      });
    } catch (error) {
      console.error('Error answering call:', error);
      Alert.alert('Error', 'Unable to answer call. Please try again.');
      setIsAnswering(false);
    }
  };

  const handleDecline = async () => {
    try {
      Vibration.cancel(); // Stop vibration

      // Clear this call from pending_calls storage to prevent stale notifications
      try {
        const pendingCallsJson = await AsyncStorage.getItem('@privacycall/pending_calls');
        if (pendingCallsJson) {
          const pendingCalls = JSON.parse(pendingCallsJson);
          const filtered = pendingCalls.filter(call => call.roomName !== roomName);
          await AsyncStorage.setItem('@privacycall/pending_calls', JSON.stringify(filtered));
          console.log('DECLINED: Cleared call from pending storage');
        }
      } catch (storageError) {
        console.error('Error clearing pending call:', storageError);
      }

      // Send call decline notification to caller
      if (callerUID && callerUID !== 'system') {
        console.log('Sending call decline notification to caller:', callerUID);
        await NotificationService.sendCallDecline(callerUID);
      }

      // Log missed call to history
      const historyEntry = {
        type: 'call_missed',
        timestamp: new Date().toISOString(),
        contactName: displayName,
        contactNickname: displayName !== 'Unknown Caller' ? displayName : undefined,
        callerUID: callerUID,
      };
      
      console.log('Logging missed call to history:', historyEntry);
      await ContactsService.addHistoryEntry(historyEntry);
      
      console.log('Call declined from:', callerName);
      navigation.goBack();
    } catch (error) {
      console.error('Error declining call:', error);
      navigation.goBack();
    }
  };

  // Show loading state while checking call status
  if (isCheckingStatus) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.content, { justifyContent: 'center' }]}>
          <Text style={[styles.callerName, { fontSize: 18, color: '#8E8E93' }]}>
            Checking call status...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show "Call Expired" screen if call is too old
  if (callExpired) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.content, { justifyContent: 'center' }]}>
          <View style={[styles.avatar, { backgroundColor: '#FF9500' }]}>
            <Icon name="schedule" size={60} color="white" />
          </View>
          <Text style={styles.callerName}>Call Expired</Text>
          <Text style={[styles.callerUID, { color: '#FF9500' }]}>
            This call has already ended
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show "Call Cancelled" screen if call was cancelled
  if (callWasCancelled) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.content, { justifyContent: 'center' }]}>
          <View style={[styles.avatar, { backgroundColor: '#FF3B30' }]}>
            <Icon name="call-end" size={60} color="white" />
          </View>
          <Text style={styles.callerName}>Call Cancelled</Text>
          <Text style={[styles.callerUID, { color: '#FF3B30' }]}>
            This call was cancelled by the caller
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.callType}>
          {callType === 'group' ? 'Incoming Group Call' : 'Incoming Call'}
        </Text>
        
        <View style={styles.callerInfo}>
          <View style={styles.avatar}>
            <Icon name={callType === 'group' ? 'group' : 'person'} size={80} color="white" />
          </View>
          <Text style={styles.callerName}>{displayName}</Text>
          {callerUID && (
            <Text style={styles.callerUID}>
              {getPartialUID(callerUID)}
            </Text>
          )}
          {callType === 'group' && (
            <Text style={styles.callDetails}>Group audio call</Text>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity 
            style={styles.declineButton} 
            onPress={handleDecline}
            disabled={isAnswering}
          >
            <Icon name="call-end" size={32} color="white" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.answerButton, isAnswering && styles.answeringButton]} 
            onPress={handleAnswer}
            disabled={isAnswering}
          >
            <Icon name="call" size={32} color="white" />
          </TouchableOpacity>
        </View>

        <View style={styles.actionLabels}>
          <Text style={styles.actionLabel}>Decline</Text>
          <Text style={styles.actionLabel}>
            {isAnswering ? 'Connecting...' : 'Answer'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1D1D1F',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 60,
  },
  callType: {
    fontSize: 18,
    color: '#8E8E93',
    textAlign: 'center',
  },
  callerInfo: {
    alignItems: 'center',
  },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  callerName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 8,
  },
  callerUID: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 4,
  },
  callDetails: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '60%',
  },
  declineButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
  },
  answeringButton: {
    backgroundColor: '#007AFF',
  },
  actionLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '60%',
    marginTop: 16,
  },
  actionLabel: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
});