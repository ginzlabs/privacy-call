import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
// import { useFocusEffect } from '@react-navigation/native'; // Removed to prevent focus loops
import { LiveKitService } from '../services/LiveKitService';
import { AuthService } from '../services/AuthService';
import { NotificationService } from '../services/NotificationService';
import { ContactsService } from '../services/ContactsService';
import { FirebaseService } from '../services/FirebaseService';
import { AppConfig } from '../config/AppConfig';

/**
 * Call Screen
 * Handles active audio calls using LiveKit
 * Supports both 1:1 and group calls
 */

export default function CallScreen({ route, navigation }) {
  const { type, contact, group, callId, isOutgoing, roomName, participants: callParticipants } = route.params || {};

  // Call state
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [callStatus, setCallStatus] = useState('connecting');
  const [participants, setParticipants] = useState([]);
  const [connectionError, setConnectionError] = useState(null);
  const [callStartTime, setCallStartTime] = useState(null);
  const [callTimeout, setCallTimeout] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);

  // Note: iOS audio routing is handled by AudioSession.configureAudio() in LiveKitService
  // The useIOSAudioManagement hook caused null pointer errors, so we rely on
  // the AudioSession configuration which runs before room connection

  // Use refs to avoid stale closure issues
  const callStatusRef = useRef(callStatus);
  const callTimeoutRef = useRef(callTimeout);
  const currentUserRef = useRef(null);
  
  // Update refs when state changes
  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);
  
  useEffect(() => {
    callTimeoutRef.current = callTimeout;
  }, [callTimeout]);

  // Get current user ID for filtering self-connections
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const userId = await AuthService.getCurrentUserId();
        currentUserRef.current = userId;
        console.log('Current user ID for call:', userId);
      } catch (error) {
        console.error('Error getting current user ID:', error);
      }
    };
    getCurrentUser();
  }, []);

  // Initialize call when component mounts (NOT on focus changes)
  useEffect(() => {
    console.log('CallScreen mounted - initializing call');
    initializeCall();
    
    // Cleanup when component unmounts
    return () => {
      console.log('CallScreen unmounting - cleaning up');
      // Clear timeout if component unmounts
      if (callTimeout) {
        clearTimeout(callTimeout);
      }

      // Clean up LiveKit listeners
      LiveKitService.onParticipantConnected = null;
      LiveKitService.onParticipantDisconnected = null;
      LiveKitService.onConnectionStateChanged = null;
      LiveKitService.onCallEnded = null;

      // CRITICAL: Clean up room and audio session state
      // Prevents stale singleton state from causing crashes on next call
      console.log('UNMOUNT: Calling LiveKitService.cleanup()');
      LiveKitService.cleanup();
    };
  }, []); // Empty dependency array - only run once on mount

  // Set up call decline listener (for calling device)
  useEffect(() => {
    const handleCallDeclined = () => {
      console.log('CallScreen: Call was declined by receiver');
      if (callStatusRef.current === 'calling' && isOutgoing) {
        setCallStatus('declined');
        
        // Clear timeout since call was declined
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
          setCallTimeout(null);
        }
        
        // Show decline message and navigate immediately
        Alert.alert(
          'Call Declined',
          `${contact?.nickname || group?.name || 'Contact'} declined the call.`,
          [{ text: 'OK', onPress: () => navigation.navigate('MainTabs', { screen: 'Contacts' }) }]
        );
      }
    };

    // Set up the decline callback for calling device
    NotificationService.onCallDeclined = handleCallDeclined;

    // Cleanup
    return () => {
      NotificationService.onCallDeclined = null;
    };
  }, [isOutgoing, contact, group, navigation]);

  // Cleanup event listeners on unmount
  useEffect(() => {
    return () => {
      // Cleanup listeners when component unmounts
      LiveKitService.onParticipantConnected = null;
      LiveKitService.onParticipantDisconnected = null;
      LiveKitService.onConnectionStateChanged = null;
      LiveKitService.onCallEnded = null;
    };
  }, []);

  // Sync mute state with LiveKit when call connects
  useEffect(() => {
    if (callStatus === 'connected') {
      const callState = LiveKitService.getCallState();
      const actualMutedState = !callState.isAudioEnabled;

      console.log('🎤 MUTE_SYNC: Call connected - syncing mute state');
      console.log('🎤 MUTE_SYNC: isAudioEnabled:', callState.isAudioEnabled);
      console.log('🎤 MUTE_SYNC: Setting isMuted to:', actualMutedState);
      console.log('🎤 MUTE_SYNC: Visual state: Button will be', actualMutedState ? 'RED (muted)' : 'GREEN (active)');
      setIsMuted(actualMutedState);
    }
  }, [callStatus]);

  // Call duration timer and keep awake management
  useEffect(() => {
    if (callStatus === 'connected' && callStartTime) {
      console.log('Call connected - activating KeepAwake');
      activateKeepAwakeAsync('call-active'); // Prevent screen lock during calls

      const timer = setInterval(() => {
        const duration = Math.floor((new Date() - callStartTime) / 1000);
        setCallDuration(duration);
      }, 1000);

      return () => {
        clearInterval(timer);
      };
    } else if (callStatus === 'ended' || callStatus === 'disconnected' || callStatus === 'timeout') {
      console.log('Call ended - deactivating KeepAwake');
      deactivateKeepAwake('call-active'); // Allow screen lock when call ends
    }
  }, [callStatus, callStartTime]);

  // Monitor app state changes during calls
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      console.log('App state changed during call:', nextAppState);
      
      if (nextAppState === 'background' && callStatus === 'connected') {
        console.log('App backgrounded during call - maintaining audio session');
        // Keep the call active but log the background state
      } else if (nextAppState === 'active' && callStatus === 'connected') {
        console.log('App foregrounded during call - resuming UI');
        // Refresh call state when returning to foreground
        setParticipants(LiveKitService.getParticipants());
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
    };
  }, [callStatus]);

  // Ensure KeepAwake is deactivated when component unmounts
  useEffect(() => {
    return () => {
      console.log('CallScreen unmounting - deactivating KeepAwake');
      deactivateKeepAwake('call-active');
    };
  }, []);

  // Auto-dismiss call ended screen after 2 seconds
  useEffect(() => {
    if (callStatus === 'ended') {
      console.log('CALL_ENDED: Setting up auto-dismiss timer');
      const timer = setTimeout(() => {
        console.log('AUTO_DISMISS: Automatically dismissing call ended screen');
        try {
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs', params: { screen: 'Contacts' } }],
          });
          console.log('AUTO_DISMISS: Navigation completed successfully');
        } catch (error) {
          console.error('AUTO_DISMISS: Navigation error:', error);
        }
      }, 600);

      // Cleanup timer if component unmounts or status changes
      return () => {
        console.log('CALL_ENDED: Clearing auto-dismiss timer');
        clearTimeout(timer);
      };
    }
  }, [callStatus, navigation]);

  const initializeCall = async () => {
    // Prevent multiple simultaneous initializations
    if (isInitializing) {
      console.log('Call already initializing - skipping');
      return;
    }
    
    try {
      console.log('=== INITIALIZING CALL ===');
      console.log('Route params:', { type, contact, group, isOutgoing, roomName });
      
      setIsInitializing(true);
      setCallStatus('connecting');
      setConnectionError(null);
      
      const targetRoomName = roomName || await generateRoomName();
      console.log('Target room name:', targetRoomName);
      
      let result;
      if (isOutgoing) {
        // Start new call
        const participantIds = callParticipants || (contact ? [contact.uid] : group?.members?.map(member => member.uid) || []);
        result = await LiveKitService.startCall(targetRoomName, participantIds, !!group);
        
        if (result.success) {
          console.log('OUTGOING: Room connected successfully');
          
          // Log outgoing call to history
          await logCallToHistory('call_outgoing', {
            contactName: contact?.nickname || group?.name || 'Contact',
          });
          
          // Set up event listeners AFTER room is created
          setupLiveKitListeners();

          // For outgoing calls, show "calling..." until other participant joins
          setCallStatus('calling');
          setParticipants(LiveKitService.getParticipants());
          
          console.log('OUTGOING: Starting 20-second timeout');
          // Start 20-second timeout
          const timeout = setTimeout(() => {
            console.log('TIMEOUT: Checking call status:', callStatusRef.current);
            if (callStatusRef.current === 'calling') {
              console.log('TIMEOUT: Call not answered');
              setCallStatus('timeout');
              handleCallTimeout();
            }
          }, 20000);
          
          setCallTimeout(timeout);
        }
      } else {
        // Join existing call
        result = await LiveKitService.joinCall(targetRoomName);
        if (result.success) {
          console.log('INCOMING: Joined call successfully');

          // Set up event listeners BEFORE checking state
          // This prevents race condition where TrackSubscribed fires before callback is set
          setupLiveKitListeners();

          // Check if there are already participants (cold start detection)
          const existingParticipants = LiveKitService.getParticipants();
          console.log('INCOMING: Existing participants after join:', existingParticipants.length);

          // If participants exist, check if they have audio tracks (prevents stuck on connecting)
          // Give a brief moment for TrackSubscribed event to fire
          await new Promise(resolve => setTimeout(resolve, 500));

          // Check if audio track is already subscribed (race condition fix)
          if (LiveKitService.audioTrackReady) {
            console.log('INCOMING: Audio track already ready - switching to connected immediately');
            setCallStatus('connected');
            setCallStartTime(new Date());
            setParticipants(existingParticipants);
          } else {
            // CRITICAL: Wait for audio track subscription before showing connected
            console.log('INCOMING: Waiting for audio track subscription...');
            setCallStatus('connecting');
            setParticipants(existingParticipants);

            // Set timeout for audio track subscription (10 seconds)
            const audioTimeout = setTimeout(() => {
              console.warn('AUDIO_TIMEOUT: Audio track not received within 10s, showing connected anyway');
              if (callStatusRef.current === 'connecting') {
                setCallStatus('connected');
                setCallStartTime(new Date());
              }
            }, 10000);

            setCallTimeout(audioTimeout);
          }

          // For cold start: ensure calling device gets notified we joined
          if (existingParticipants.length > 0) {
            console.log('COLD START: Other participants detected, call should connect on their end');
          }
        }
      }
    } catch (error) {
      // Check if this is a rapid cancellation error 
      const isRapidCancellation = error.message && (
        error.message.includes('Client initiated disconnect') ||
        error.message.includes('Room was destroyed during initialization')
      );
      
      // Suppress console errors for rapid cancellations (they're expected)
      if (isRapidCancellation) {
        console.log('RAPID_CANCEL: Expected error during rapid cancellation (suppressed):', error.message);
      } else {
        console.error('Error initializing call:', error);
      }

      // CRITICAL: Clean up LiveKitService state on failed initialization
      // Prevents stale room/audio state from corrupting next call attempt
      try {
        console.log('ERROR_CLEANUP: Cleaning up LiveKitService after initialization failure');
        LiveKitService.cleanup();
      } catch (cleanupError) {
        console.error('ERROR_CLEANUP: Error during cleanup:', cleanupError);
      }

      setConnectionError(error.message);
      setCallStatus('error');

      // Log failed call to history
      await logCallToHistory('call_failed', {
        contactName: contact?.nickname || group?.name || 'Unknown',
        error: error.message,
      });
      
      // Don't show error alert for rapid cancellations (user already navigated away)
      if (!isRapidCancellation) {
        // Don't immediately navigate - show error state first
        setTimeout(() => {
          Alert.alert(
            'Call Failed',
            'Unable to connect to the call. Please try again.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        }, 1000);
      } else {
        console.log('RAPID_CANCEL: Suppressing error alert for rapid cancellation');
        // Just navigate back immediately for rapid cancellations
        navigation.navigate('MainTabs', { screen: 'Contacts' });
      }
    } finally {
      setIsInitializing(false);
    }
  };

  const logCallToHistory = async (type, additionalData = {}) => {
    try {
      const historyEntry = {
        type,
        timestamp: new Date().toISOString(),
        contactName: contact?.nickname || group?.name || 'Unknown',
        contactNickname: contact?.nickname || undefined,
        groupName: group?.name || undefined,
        memberCount: group?.members?.length || undefined,
        ...additionalData,
      };
      
      // Remove undefined values to prevent rendering issues
      Object.keys(historyEntry).forEach(key => {
        if (historyEntry[key] === undefined) {
          delete historyEntry[key];
        }
      });
      
      console.log('Logging call to history:', historyEntry);
      await ContactsService.addHistoryEntry(historyEntry);
    } catch (error) {
      console.error('Error logging call to history:', error);
    }
  };

  const handleCallTimeout = async () => {
    const targetRoomName = roomName || await generateRoomName();

    // Clear this call from pending_calls storage to prevent stale notifications
    try {
      const pendingCallsJson = await AsyncStorage.getItem('@privacycall/pending_calls');
      if (pendingCallsJson) {
        const pendingCalls = JSON.parse(pendingCallsJson);
        const filtered = pendingCalls.filter(call => call.roomName !== targetRoomName);
        await AsyncStorage.setItem('@privacycall/pending_calls', JSON.stringify(filtered));
        console.log('TIMEOUT: Cleared timed-out call from pending storage');
      }
    } catch (storageError) {
      console.error('Error clearing pending call:', storageError);
    }

    // Log timeout to history
    await logCallToHistory('call_timeout', {
      contactName: contact?.nickname || group?.name || 'Contact',
    });

    // CRITICAL: Send cancellation notification to receiver
    // Without this, receiver's incoming call screen stays up and they can still "answer"
    const participantIds = callParticipants || (contact ? [contact.uid] : group?.members?.map(member => member.uid) || []);
    const currentUserId = await AuthService.getCurrentUserId();

    console.log('TIMEOUT: Sending cancellation to participants who never answered:', participantIds);
    sendCallCancellation(targetRoomName, currentUserId).catch(error => {
      console.error('TIMEOUT: Error sending cancellation:', error);
    });

    // CRITICAL: End the call session on server when timeout occurs
    try {
      console.log('TIMEOUT: Ending call session due to timeout');
      await LiveKitService.endCall();
    } catch (error) {
      console.error('TIMEOUT: Error ending call session:', error);
    }

    Alert.alert(
      'Call Not Answered',
      `${contact?.nickname || group?.name || 'Contact'} didn't pick up. Try again later.`,
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  };

  const sendCallCancellation = async (roomNameForCancel = null, callerUIDForCancel = null) => {
    try {
      // Send cancellation notification to participants who haven't answered yet
      const participantIds = callParticipants || (contact ? [contact.uid] : group?.members?.map(member => member.uid) || []);
      
      console.log('Sending call cancellation to participants:', participantIds);
      console.log('CANCELLATION_SEND: Using room name:', roomNameForCancel);
      console.log('CANCELLATION_SEND: Using caller UID:', callerUIDForCancel);
      
      for (const participantUID of participantIds) {
        console.log('Sending call cancellation to participant:', participantUID);
        const result = await NotificationService.sendCallCancellation(
          participantUID, 
          roomNameForCancel, 
          callerUIDForCancel
        );
        console.log('Cancellation sent result:', result);
      }
      
      console.log('All cancellation notifications sent');
    } catch (error) {
      console.error('Error sending call cancellation:', error);
      // Don't throw - cancellation failure shouldn't block call ending
    }
  };

  const setupLiveKitListeners = () => {
    console.log('Setting up LiveKit event listeners');

    // Audio track ready (for incoming calls waiting for audio)
    LiveKitService.onAudioReady = () => {
      console.log('AUDIO_READY: Audio track subscription complete');

      // For incoming calls in "connecting" state, switch to "connected"
      if (!isOutgoing && callStatusRef.current === 'connecting') {
        console.log('AUDIO_READY: Switching to connected state for incoming call');
        setCallStatus('connected');
        setCallStartTime(new Date());

        // Clear audio timeout
        if (callTimeoutRef.current) {
          console.log('AUDIO_READY: Clearing audio timeout');
          clearTimeout(callTimeoutRef.current);
          setCallTimeout(null);
        }
      } else {
        console.log('AUDIO_READY: Audio ready but not in expected state:', callStatusRef.current, 'isOutgoing:', isOutgoing);
      }
    };

    // Participant joined
    LiveKitService.onParticipantConnected = (participant) => {
      console.log('EVENT: Participant joined call:', participant.identity);
      console.log('EVENT: Current call status (ref):', callStatusRef.current);
      console.log('EVENT: Is outgoing call:', isOutgoing);
      
      const updatedParticipants = LiveKitService.getParticipants();
      console.log('EVENT: Updated participants count:', updatedParticipants.length);
      setParticipants(updatedParticipants);
      
      // If this is an outgoing call in calling state, switch to connected
      if (isOutgoing && callStatusRef.current === 'calling') {
        console.log('EVENT: Switching to connected state - participant joined');
        setCallStatus('connected');
        setCallStartTime(new Date());
        
        // Clear timeout
        if (callTimeoutRef.current) {
          console.log('EVENT: Clearing timeout - call answered');
          clearTimeout(callTimeoutRef.current);
          setCallTimeout(null);
        }
      }
    };

    // Participant left
    LiveKitService.onParticipantDisconnected = (participant) => {
      console.log('Participant left call:', participant.identity);
      const updatedParticipants = LiveKitService.getParticipants();
      setParticipants(updatedParticipants);
      
      // If all other participants left during a connected call, end the call
      if (callStatusRef.current === 'connected' && updatedParticipants.length === 0) {
        console.log('All participants left - ending call');
        setCallStatus('ended');
        
        // End the call after a very brief delay (optimistic UI)
        setTimeout(() => {
          LiveKitService.endCall();
          navigation.navigate('MainTabs', { screen: 'Contacts' });
        }, 300); // Show "Call ended" for 0.3 seconds only
      }
    };

    // Connection state changed
    LiveKitService.onConnectionStateChanged = (state) => {
      console.log('Call connection state:', state);
      
      if (state === 'disconnected') {
        console.log('LiveKit disconnected - setting status to disconnected (NOT auto-navigating)');
        setCallStatus('disconnected');
        // REMOVED: navigation.goBack(); // Don't auto-navigate, let user control navigation
      } else if (state === 'connected' && !isOutgoing) {
        setCallStatus('connected');
        if (!callStartTime) {
          setCallStartTime(new Date());
        }
      }
    };

    // Call ended
    LiveKitService.onCallEnded = (duration) => {
      console.log('Call ended. Duration:', duration, 'minutes');
      console.log('LiveKit onCallEnded fired - setting status to ended');
      setCallStatus('ended');
    };
  };

  const generateRoomName = async () => {
    // Get current user ID to ensure unique room names per caller
    const currentUserId = await AuthService.getCurrentUserId();
    
    if (contact) {
      return LiveKitService.generateRoomName([contact.uid], currentUserId);
    } else if (group) {
      return LiveKitService.generateRoomName(group.members.map(member => member.uid), currentUserId);
    }
    return `${AppConfig.LIVEKIT.ROOM_NAME_PREFIX}${currentUserId}_${Date.now()}`;
  };

  const trackCallCancellation = async (roomName, participantUIDs) => {
    try {
      console.log('TRACK_CANCELLATION: Recording call cancellation for participants:', { roomName, participantUIDs });
      
      // Track cancellation for each participant
      const trackCancellationFunction = FirebaseService.functions().httpsCallable('trackCallCancellation');
      
      const cancellationPromises = participantUIDs.map(async (participantUID) => {
        try {
          const result = await trackCancellationFunction({
            roomName: roomName,
            targetUserUID: participantUID,
          });
          console.log('TRACK_CANCELLATION: Recorded for participant:', participantUID);
          return result.data;
        } catch (error) {
          console.error('TRACK_CANCELLATION: Error for participant:', participantUID, error);
          return null;
        }
      });
      
      await Promise.all(cancellationPromises);
      console.log('TRACK_CANCELLATION: All cancellation records created');
      return true;
    } catch (error) {
      console.error('TRACK_CANCELLATION: Error tracking cancellations:', error);
      // Don't throw - cancellation failure shouldn't block the UI
      return false;
    }
  };

  const handleEndCall = async () => {
    console.log('=== HANDLE END CALL FUNCTION CALLED ===');
    console.log('Current call status:', callStatus);
    console.log('Is outgoing call:', isOutgoing);
    
    try {
      // IMMEDIATE ACTIONS: Cut audio and navigate right away (optimistic UI)
      console.log('IMMEDIATE: Disabling audio and navigating');
      
      // Immediately disable audio locally (only if connected)
      try {
        const callState = LiveKitService.getCallState();
        if (callState.isConnected) {
          await LiveKitService.enableAudio(false);
          console.log('Local audio disabled immediately');
        } else {
          console.log('Skip audio disable - not connected to call yet');
        }
      } catch (error) {
        console.log('Could not disable audio immediately:', error.message);
      }
      
      // Immediately navigate away (optimistic UI)
      console.log('IMMEDIATE: Navigating back to Contacts');
      navigation.navigate('MainTabs', { screen: 'Contacts' });

      // BACKGROUND CLEANUP: Do server cleanup in background
      // Clear timeout if active
      if (callTimeout) {
        clearTimeout(callTimeout);
        setCallTimeout(null);
      }
      
      // Handle different call states differently
      if ((callStatus === 'calling' || callStatus === 'connecting') && isOutgoing) {
        console.log('BACKGROUND: Cancelling call during calling/connecting phase - state:', callStatus);
        
        // Get the participant UIDs and room name
        const targetRoomName = roomName || await generateRoomName();
        const participantIds = callParticipants || (contact ? [contact.uid] : group?.members?.map(member => member.uid) || []);
        
        console.log('RAPID_CANCEL: Participants for cancellation:', participantIds);
        console.log('RAPID_CANCEL: Room name for cancellation:', targetRoomName);
        
        // CRITICAL: Force LiveKit cleanup FIRST to prevent room conflicts
        console.log('RAPID_CANCEL: Forcing LiveKit cleanup to prevent room connection issues');
        try {
          LiveKitService.cleanup();
          console.log('RAPID_CANCEL: LiveKit cleanup completed');
        } catch (error) {
          console.error('RAPID_CANCEL: Error during LiveKit cleanup:', error);
        }
        
        // THEN send cancellation notification with correct room name and caller UID
        console.log('BACKGROUND: Sending cancellation notification');
        const currentUserId = await AuthService.getCurrentUserId();
        sendCallCancellation(targetRoomName, currentUserId).catch(error => {
          console.error('BACKGROUND: Error sending cancellation notification:', error);
        });
        
        // Log cancelled call to history
        logCallToHistory('call_cancelled', {
          contactName: contact?.nickname || group?.name || 'Contact',
        });
      } else if (callStatus === 'connected') {
        // Log normal call ending to history
        logCallToHistory('call_ended', {
          contactName: contact?.nickname || group?.name || 'Contact',
          duration: callDuration,
        });
        
        // Do server cleanup in background (don't await)
        console.log('BACKGROUND: Cleaning up connected call session');
        LiveKitService.endCall().catch(error => {
          console.error('Background server cleanup error:', error);
        });
      } else {
        // For other states, just do normal cleanup
        console.log('BACKGROUND: Cleaning up call session for state:', callStatus);
        LiveKitService.endCall().catch(error => {
          console.error('Background server cleanup error:', error);
        });
      }
      
    } catch (error) {
      console.error('Error ending call:', error);
      // Still navigate even if there's an error
      navigation.navigate('MainTabs', { screen: 'Contacts' });
    }
  };

  const handleToggleMute = async () => {
    const targetMutedState = !isMuted;

    console.log('🎤 MUTE_TOGGLE: User tapped mute button');
    console.log('🎤 MUTE_TOGGLE: Current UI state isMuted:', isMuted);
    console.log('🎤 MUTE_TOGGLE: Target state:', targetMutedState ? 'MUTED (RED)' : 'ACTIVE (GREEN)');

    try {
      // Toggle the microphone
      await LiveKitService.enableAudio(!targetMutedState);

      // Verify the actual microphone state from LiveKit
      const callState = LiveKitService.getCallState();
      const actualMutedState = !callState.isAudioEnabled;

      console.log('🎤 MUTE_TOGGLE: LiveKit isAudioEnabled:', callState.isAudioEnabled);
      console.log('🎤 MUTE_TOGGLE: Calculated actualMutedState:', actualMutedState);
      console.log('🎤 MUTE_TOGGLE: UI will show:', actualMutedState ? 'RED button (muted)' : 'GREEN button (active)');

      // Always update UI to match actual LiveKit state (not our target)
      setIsMuted(actualMutedState);

      // Warn if state mismatch
      if (actualMutedState !== targetMutedState) {
        console.warn('🎤 MUTE_TOGGLE: ⚠️ State mismatch! Target:', targetMutedState, 'Actual:', actualMutedState);
      }
    } catch (error) {
      console.error('🎤 MUTE_TOGGLE: Error toggling mute:', error);

      // On error, sync UI with actual state (don't leave it out of sync)
      try {
        const callState = LiveKitService.getCallState();
        setIsMuted(!callState.isAudioEnabled);
      } catch (stateError) {
        console.error('Could not get call state:', stateError);
      }

      Alert.alert('Error', 'Failed to toggle microphone');
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getCallTitle = () => {
    if (contact) {
      return contact.nickname;
    } else if (group) {
      return group.name;
    }
    return 'Audio Call';
  };

  const getCallSubtitle = () => {
    if (callStatus === 'connecting') {
      return isOutgoing ? 'Setting up call...' : 'Connecting...';
    } else if (callStatus === 'calling') {
      return 'Calling...';
    } else if (callStatus === 'connected') {
      const participantCount = participants.length + 1; // +1 for current user
      if (participantCount === 2) {
        return formatDuration(callDuration);
      } else {
        return `${participantCount} participants • ${formatDuration(callDuration)}`;
      }
    } else if (callStatus === 'timeout') {
      return 'Call not answered';
    } else if (callStatus === 'ended') {
      return 'Call ended';
    } else if (callStatus === 'declined') {
      return 'Call declined';
    } else if (callStatus === 'error') {
      return 'Connection failed';
    }
    return '';
  };

  // Show ended/declined UI for final states
  if (callStatus === 'ended' || callStatus === 'declined' || callStatus === 'timeout') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.connectingContainer}>
          <View style={styles.endCallIcon}>
            <Icon name="call-end" size={60} color="#FF3B30" />
          </View>
          
          <Text style={styles.callTitle}>{getCallTitle()}</Text>
          <Text style={styles.callSubtitle}>{getCallSubtitle()}</Text>
          
        </View>
      </SafeAreaView>
    );
  }

  // Show calling/connecting UI for these states
  if (callStatus === 'connecting' || callStatus === 'calling') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.connectingContainer}>
          <ActivityIndicator size="large" color="#667eea" style={styles.spinner} />
          
          <Text style={styles.callTitle}>{getCallTitle()}</Text>
          <Text style={styles.callSubtitle}>{getCallSubtitle()}</Text>
          
          <View style={styles.connectingActions}>
            <TouchableOpacity 
              style={styles.endCallButton} 
              onPress={() => {
                console.log('RED BUTTON PRESSED - calling/connecting screen');
                handleEndCall();
              }}
            >
              <Icon name="call-end" size={32} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.callContainer}>
        {/* Call Info */}
        <View style={styles.callInfo}>
          <Text style={styles.callTitle}>{getCallTitle()}</Text>
          <Text style={styles.callSubtitle}>{getCallSubtitle()}</Text>
          
          {connectionError && (
            <Text style={styles.errorText}>{connectionError}</Text>
          )}
        </View>

        {/* Participants List */}
        {participants.length > 0 && (
          <View style={styles.participantsContainer}>
            <Text style={styles.participantsTitle}>Participants</Text>
            {participants.map((participant, index) => (
              <View key={participant.identity} style={styles.participantItem}>
                <Icon 
                  name={participant.isAudioEnabled ? "mic" : "mic-off"} 
                  size={16} 
                  color={participant.isAudioEnabled ? "#34C759" : "#FF3B30"} 
                />
                <Text style={styles.participantName}>
                  {participant.name || `Participant ${index + 1}`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Call Controls */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity
            style={[
              styles.controlButton,
              isMuted ? styles.controlButtonMuted : styles.controlButtonActive
            ]}
            onPress={handleToggleMute}
          >
            <Icon
              name={isMuted ? "mic-off" : "mic"}
              size={28}
              color="white"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.endCallButton}
            onPress={() => {
              console.log('RED BUTTON PRESSED - connected screen');
              handleEndCall();
            }}
          >
            <Icon name="call-end" size={32} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  connectingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  callContainer: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 20,
  },
  spinner: {
    marginBottom: 30,
  },
  callInfo: {
    alignItems: 'center',
    marginTop: 60,
  },
  callTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 8,
  },
  callSubtitle: {
    fontSize: 18,
    color: '#8E8E93',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 10,
  },
  participantsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    margin: 20,
  },
  participantsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 12,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  participantName: {
    fontSize: 16,
    color: 'white',
    marginLeft: 12,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 40,
  },
  connectingActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: '#34C759', // Green for active/unmuted mic
  },
  controlButtonMuted: {
    backgroundColor: '#FF3B30', // Red for muted mic
  },
  endCallButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  doneButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 25,
    marginTop: 30,
  },
  doneButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});