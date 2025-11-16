import { Room, RoomEvent, ConnectionState, AudioTrack } from 'livekit-client';
import { AudioSession } from '@livekit/react-native';
import { Platform } from 'react-native';
import { AppConfig } from '../config/AppConfig';
import { FirebaseService } from './FirebaseService';
import { AuthService } from './AuthService';
import { NotificationService } from './NotificationService';

/**
 * LiveKit Service
 * Handles all audio calling functionality using LiveKit React Native SDK
 *
 * Features:
 * - 1:1 audio calls
 * - Group audio calls
 * - iOS earpiece routing (fixes loudspeaker default)
 * - Call state management
 * - Usage tracking
 */

class LiveKitCallService {
  constructor() {
    this.room = null;
    this.isConnected = false;
    this.isAudioEnabled = true;
    this.participants = new Map();
    this.callStartTime = null;
    this.currentSessionId = null; // Track server-side session
    this.audioSessionStarted = false; // Track audio session state
    this.audioTrackReady = false; // Track if remote audio track subscribed
    this.recentlyEndedRooms = new Set(); // Track rooms we just left (prevent ghost calls)

    // Event handlers
    this.onParticipantConnected = null;
    this.onParticipantDisconnected = null;
    this.onConnectionStateChanged = null;
    this.onCallEnded = null;
    this.onAudioReady = null; // Callback when audio track is ready
  }

  /**
   * Check if a room was recently ended (prevents ghost call re-entry)
   */
  wasRecentlyEnded(roomName) {
    return this.recentlyEndedRooms.has(roomName);
  }

  /**
   * Generate LiveKit room token via secure backend
   *
   * Calls Firebase Cloud Function to generate secure token with E2EE encryption key.
   * Tokens are generated server-side to protect LiveKit API credentials.
   *
   * @param {string} roomName - Unique room identifier (format: privacycall_CALLER_PARTICIPANTS_TIMESTAMP)
   * @param {string} participantName - User ID joining the room (Firebase anonymous UID)
   * @returns {Promise<{token: string, serverUrl: string, expiresAt: number, encryptionKey: string}>}
   * @throws {Error} If user not authenticated or token generation fails
   */
  async generateToken(roomName, participantName) {
    try {
      console.log('Requesting LiveKit token from secure backend for:', { roomName, participantName });
      
      // Get current Firebase user for authentication
      const currentUser = FirebaseService.getCurrentUser();
      if (!currentUser) {
        throw new Error('User must be authenticated to generate tokens');
      }

      // Get Firebase Auth ID token for backend authentication
      const idToken = await currentUser.getIdToken();
      
      // Call our secure Cloud Function
      const generateLiveKitToken = FirebaseService.functions().httpsCallable('generateLiveKitToken');
      
      const result = await generateLiveKitToken({
        roomName: roomName,
        participantName: participantName,
      });

      console.log('Received secure token with E2EE from backend:', {
        roomName: result.data.roomName,
        expiresAt: result.data.expiresAt,
        serverUrl: result.data.serverUrl,
        hasEncryptionKey: !!result.data.encryptionKey,
      });
      
      return {
        token: result.data.token,
        serverUrl: result.data.serverUrl,
        expiresAt: result.data.expiresAt,
        encryptionKey: result.data.encryptionKey,
      };
    } catch (error) {
      console.error('Error generating secure LiveKit token:', error);
      throw error;
    }
  }

  /**
   * Start a new call (1:1 or group)
   *
   * Initiates outgoing call by:
   * 1. Configuring audio session (iOS only - earpiece routing)
   * 2. Generating LiveKit token
   * 3. Creating and connecting to LiveKit room
   * 4. Enabling microphone
   * 5. Sending FCM notifications to participants
   *
   * @param {string} roomName - Unique room identifier
   * @param {Array<string>} participants - Array of participant UIDs to invite
   * @param {boolean} isGroup - Whether this is a group call (default: false)
   * @returns {Promise<{success: boolean, roomName: string, participantCount: number}>}
   * @throws {Error} If room creation, connection, or notification fails
   */
  async startCall(roomName, participants, isGroup = false) {
    try {
      console.log('Starting call:', { roomName, participants, isGroup });

      const currentUser = await AuthService.getCurrentUserId();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Reset audio track readiness for new call
      this.audioTrackReady = false;

      // STEP 1: Configure audio session BEFORE connecting (iOS earpiece fix)
      // CRITICAL: iOS only - Android WebRTC handles audio routing natively
      // AudioSession on Android causes native crashes during WebRTC audio setup
      if (Platform.OS === 'ios' && !this.audioSessionStarted) {
        console.log('iOS: Configuring audio session for earpiece routing...');
        await AudioSession.configureAudio({
          ios: {
            // iOS earpiece routing - THIS FIXES THE LOUDSPEAKER ISSUE
            defaultOutput: 'earpiece',
          },
        });

        await AudioSession.startAudioSession();
        this.audioSessionStarted = true;
        console.log('iOS: Audio session configured for earpiece routing');
      } else if (Platform.OS === 'android') {
        console.log('Android: Skipping AudioSession (WebRTC handles audio natively)');
        // Android WebRTC already routes to earpiece by default
        // No AudioSession needed - prevents conflicts with WebRTC audio manager
      }

      // Generate room token
      const { token, serverUrl } = await this.generateToken(roomName, currentUser);

      // STEP 2: Create room instance with native SDK
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      console.log('LiveKit room created with React Native SDK');

      // Set up event listeners
      this.setupEventListeners();

      // Start server-side call session tracking
      const sessionData = {
        roomName,
        callType: isGroup ? 'group' : 'direct',
        participantCount: participants.length,
        participantUIDs: participants, // Send participant UIDs for usage tracking
      };

      console.log('DEBUG: Sending to startCallSession:', sessionData);

      const startSessionFunction = FirebaseService.functions().httpsCallable('startCallSession');
      const sessionResult = await startSessionFunction(sessionData);
      
      this.currentSessionId = sessionResult.data.sessionId;
      console.log('Server-side call session started:', this.currentSessionId);

      // Safety check before connecting
      if (!this.room) {
        console.error('CRITICAL: Room is null before connect - this should not happen');
        throw new Error('Room was destroyed during initialization');
      }

      // Connect to room
      console.log('Connecting to LiveKit room...');
      await this.room.connect(serverUrl, token);
      
      // Verify connection succeeded
      if (this.room.state === 'connected') {
        this.isConnected = true;
        console.log('LiveKit room connection verified');
      } else {
        console.warn('LiveKit room connection state:', this.room.state);
        this.isConnected = false;
      }
      this.callStartTime = new Date();

      // Enable audio by default with enhanced debugging
      console.log('Enabling audio for new call...');
      const audioEnabled = await this.enableAudio(true);
      console.log('Audio enable result:', audioEnabled);
      
      // Check initial audio state
      const initialAudioState = this.room.localParticipant.isMicrophoneEnabled;
      console.log('Initial microphone state:', initialAudioState);

      console.log('Successfully connected to LiveKit room:', roomName);
      
      // Track call start event (separate from usage tracking)
      await this.trackCallEvent('call_started', {
        roomName,
        participants: participants.length,
        isGroup,
        userId: currentUser,
        sessionId: this.currentSessionId,
      });

      // Send notifications to other participants
      await this.notifyParticipants(participants, currentUser, roomName, isGroup);

      return {
        success: true,
        roomName,
        participantCount: this.room ? this.room.numParticipants : 0,
      };
    } catch (error) {
      // Suppress console error for rapid cancellations (expected behavior)
      const isRapidCancellation = error.message && error.message.includes('Client initiated disconnect');
      
      if (isRapidCancellation) {
        console.log('RAPID_CANCEL: Expected LiveKit error during rapid cancellation (suppressed):', error.message);
      } else {
        console.error('Error starting call:', error);
      }
      
      throw error;
    }
  }

  /**
   * Join an existing call
   */
  async joinCall(roomName) {
    try {
      console.log('Joining call:', roomName);

      const currentUser = await AuthService.getCurrentUserId();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Reset audio track readiness for new call
      this.audioTrackReady = false;

      // STEP 1: Configure audio session BEFORE connecting (iOS earpiece fix)
      // CRITICAL: iOS only - Android WebRTC handles audio routing natively
      // AudioSession on Android causes native crashes during WebRTC audio setup
      if (Platform.OS === 'ios' && !this.audioSessionStarted) {
        console.log('iOS: Configuring audio session for earpiece routing...');
        await AudioSession.configureAudio({
          ios: {
            // iOS earpiece routing - THIS FIXES THE LOUDSPEAKER ISSUE
            defaultOutput: 'earpiece',
          },
        });

        await AudioSession.startAudioSession();
        this.audioSessionStarted = true;
        console.log('iOS: Audio session configured for earpiece routing');
      } else if (Platform.OS === 'android') {
        console.log('Android: Skipping AudioSession (WebRTC handles audio natively)');
        // Android WebRTC already routes to earpiece by default
        // No AudioSession needed - prevents conflicts with WebRTC audio manager
      }

      // Generate room token
      const { token, serverUrl } = await this.generateToken(roomName, currentUser);

      // STEP 2: Create room instance if not exists
      if (!this.room) {
        this.room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      }

      // Set up event listeners
      this.setupEventListeners();

      // BUG FIX: Don't create a new call session when joining
      // Only the caller should create a session. The receiver just joins the existing room.
      // Creating a duplicate session causes the notification system to think there are multiple calls.
      console.log('Joining existing call - no new session needed (caller already created session)');

      // STEP 3: Connect to room
      await this.room.connect(serverUrl, token);
      this.isConnected = true;
      this.callStartTime = new Date();

      // Enable audio by default
      await this.enableAudio(true);

      console.log('Successfully joined LiveKit room:', roomName);

      // Track call join event (no session ID - receiver doesn't create a session)
      await this.trackCallEvent('call_joined', {
        roomName,
        userId: currentUser,
      });

      return {
        success: true,
        roomName,
        participantCount: this.room ? this.room.numParticipants : 0,
      };
    } catch (error) {
      console.error('Error joining call:', error);
      throw error;
    }
  }

  /**
   * End the current call
   */
  async endCall() {
    try {
      if (!this.room || !this.isConnected) {
        console.log('No active call to end');
        return;
      }

      console.log('Ending call');
      
      const currentUser = await AuthService.getCurrentUserId();
      let serverDuration = 0;
      
      // End server-side call session tracking
      if (this.currentSessionId) {
        try {
          const endSessionFunction = FirebaseService.functions().httpsCallable('endCallSession');
          const endResult = await endSessionFunction({
            sessionId: this.currentSessionId,
          });
          
          serverDuration = endResult.data.durationMinutes || 0;
          console.log('Server-side call session ended:', {
            sessionId: this.currentSessionId,
            serverDuration: serverDuration,
          });
        } catch (error) {
          console.error('Error ending server-side session:', error);
          // Continue with cleanup even if server tracking fails
        }
      }
      
      // Track call end event (separate from usage tracking)
      await this.trackCallEvent('call_ended', {
        userId: currentUser,
        sessionId: this.currentSessionId,
        serverDuration: serverDuration,
      });

      // Disconnect from room (defensive check - cleanup() might have already nulled it)
      if (this.room) {
        await this.room.disconnect();
        this.room = null;
      }
      this.isConnected = false;
      this.callStartTime = null;
      this.currentSessionId = null;
      this.participants.clear();

      // Stop audio session
      if (this.audioSessionStarted) {
        try {
          await AudioSession.stopAudioSession();
          this.audioSessionStarted = false;
          console.log('Audio session stopped');
        } catch (audioError) {
          console.warn('AudioSession already stopped:', audioError);
          this.audioSessionStarted = false;
        }
      }

      // Notify listeners with server-verified duration
      if (this.onCallEnded) {
        this.onCallEnded(serverDuration);
      }

      console.log('Call ended successfully. Server-verified duration:', serverDuration, 'minutes');
    } catch (error) {
      console.error('Error ending call:', error);
      // Don't throw - allow cleanup to complete even if error occurred
    }
  }

  /**
   * Toggle audio on/off
   */
  async enableAudio(enabled) {
    try {
      if (!this.room || !this.isConnected) {
        throw new Error('Not connected to call');
      }

      this.isAudioEnabled = enabled;

      if (enabled) {
        // Enable microphone
        await this.room.localParticipant.setMicrophoneEnabled(true);
      } else {
        // Mute microphone
        await this.room.localParticipant.setMicrophoneEnabled(false);
      }

      // VERIFY: Wait a moment and check if it actually took effect
      await new Promise(resolve => setTimeout(resolve, 100));

      const actualState = this.room.localParticipant.isMicrophoneEnabled;
      console.log('AUDIO_VERIFY: Requested:', enabled, 'Actual:', actualState);

      if (actualState !== enabled) {
        console.error('AUDIO_VERIFY: ❌ Failed to set microphone state! Requested:', enabled, 'Actual:', actualState);
        throw new Error(`Failed to ${enabled ? 'enable' : 'disable'} audio`);
      }

      console.log('AUDIO_VERIFY: ✅ Microphone state verified:', actualState ? 'enabled' : 'disabled');
      return actualState;
    } catch (error) {
      console.error('Error toggling audio:', error);
      throw error;
    }
  }

  /**
   * Toggle speaker on/off (iOS earpiece vs loudspeaker)
   * Uses stop/restart approach to guarantee route change (per deep research)
   */
  async toggleSpeaker(enabled) {
    try {
      console.log('Toggling speaker:', enabled ? 'ON (loudspeaker)' : 'OFF (earpiece)');

      if (!this.audioSessionStarted) {
        console.warn('Audio session not started - cannot toggle speaker');
        return false;
      }

      // Stop and restart audio session to force route change
      // This prevents LiveKit's automatic management from overriding our settings
      // Causes brief audio dropout (~100-200ms) but guarantees reliable switching
      console.log('Stopping audio session for reconfiguration...');
      await AudioSession.stopAudioSession();

      // Reconfigure with new output
      await AudioSession.configureAudio({
        android: {
          preferredOutputList: [enabled ? 'speaker' : 'earpiece'],
          audioTypeOptions: {
            manageAudioFocus: true,
            audioMode: 'communication',
            audioFocusMode: 'gainTransient',
            audioStreamType: 'voiceCall',
            audioAttributesUsageType: 'voiceCommunication',
            audioAttributesContentType: 'speech',
          },
        },
        ios: {
          defaultOutput: enabled ? 'speaker' : 'earpiece',
        },
      });

      // Restart audio session with new configuration
      console.log('Restarting audio session with new output...');
      await AudioSession.startAudioSession();

      console.log('Speaker toggled successfully to:', enabled ? 'speaker' : 'earpiece');
      return true;
    } catch (error) {
      console.error('Error toggling speaker:', error);

      // Try to restart audio session even on error to avoid broken state
      try {
        await AudioSession.startAudioSession();
        this.audioSessionStarted = true;
      } catch (restartError) {
        console.error('Could not restart audio session:', restartError);
        this.audioSessionStarted = false;
      }

      return false;
    }
  }

  /**
   * Get current call state
   */
  getCallState() {
    if (!this.room) {
      return {
        isConnected: false,
        participantCount: 0,
        isAudioEnabled: true,
        connectionState: 'disconnected',
      };
    }

    return {
      isConnected: this.isConnected,
      participantCount: this.room.numParticipants,
      isAudioEnabled: this.isAudioEnabled,
      connectionState: this.room.state,
      roomName: this.room.name,
    };
  }

  /**
   * Get list of current participants
   */
  getParticipants() {
    if (!this.room) return [];
    
    return Array.from(this.room.remoteParticipants.values()).map(participant => ({
      identity: participant.identity,
      name: participant.name,
      isAudioEnabled: participant.isMicrophoneEnabled,
      connectionQuality: participant.connectionQuality,
    }));
  }

  /**
   * Set up room event listeners
   */
  setupEventListeners() {
    if (!this.room) return;

    // Participant connected
    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log('Participant connected:', participant.identity);
      this.participants.set(participant.identity, participant);
      
      if (this.onParticipantConnected) {
        this.onParticipantConnected(participant);
      }
    });

    // Participant disconnected
    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log('Participant disconnected:', participant.identity);
      this.participants.delete(participant.identity);
      
      if (this.onParticipantDisconnected) {
        this.onParticipantDisconnected(participant);
      }
    });

    // Connection state changed
    this.room.on(RoomEvent.ConnectionStateChanged, (state) => {
      console.log('Connection state changed:', state);
      
      if (state === ConnectionState.Disconnected) {
        this.isConnected = false;
      }
      
      if (this.onConnectionStateChanged) {
        this.onConnectionStateChanged(state);
      }
    });

    // Room disconnected
    this.room.on(RoomEvent.Disconnected, (reason) => {
      console.log('Room disconnected:', reason);
      this.isConnected = false;
      
      if (this.onCallEnded) {
        this.onCallEnded(0);
      }
    });

    // Track published
    this.room.on(RoomEvent.TrackPublished, (publication, participant) => {
      console.log('AUDIO_DEBUG: Track published by', participant.identity, 'kind:', publication.kind);
    });

    // Track unpublished
    this.room.on(RoomEvent.TrackUnpublished, (publication, participant) => {
      console.log('AUDIO_DEBUG: Track unpublished by', participant.identity, 'kind:', publication.kind);
    });

    // Track subscribed (for audio playback)
    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === 'audio') {
        console.log('AUDIO_READY: ✅ Audio track subscribed from:', participant.identity);
        console.log('AUDIO_READY: Track enabled:', !track.isMuted);
        console.log('AUDIO_READY: Publication subscribed:', publication.isSubscribed);

        this.audioTrackReady = true;

        // Notify receiver that audio is ready (can switch to "connected" state)
        if (this.onAudioReady) {
          console.log('AUDIO_READY: Triggering onAudioReady callback');
          this.onAudioReady();
        }
      }
    });
  }

  /**
   * Notify participants of incoming call
   */
  async notifyParticipants(participantUIDs, callerUID, roomName, isGroup) {
    try {
      console.log('DEBUG: notifyParticipants called with:', {
        participantUIDs,
        callerUID,
        roomName,
        isGroup,
      });
      
      // Get caller info for notification
      const callerNickname = 'Unknown Caller'; // TODO: Get from contacts
      
      // Extract UIDs from participants (handle both strings and objects)
      const participantUIDs_clean = participantUIDs.map(p => typeof p === 'string' ? p : p.uid);
      
      // Send notification to each participant
      for (const participantUID of participantUIDs_clean) {
        if (participantUID !== callerUID) { // Don't notify the caller
          try {
            console.log('DEBUG: Sending notification with params:', {
              targetUserUID: participantUID,
              callerData: { nickname: callerNickname, uid: callerUID },
              roomData: { name: roomName, isGroup: isGroup },
            });
            
            await NotificationService.sendIncomingCallNotification(
              participantUID,
              { nickname: callerNickname, uid: callerUID },
              { name: roomName, isGroup: isGroup }
            );
          } catch (error) {
            console.error('Error notifying participant:', participantUID, error);
            // Continue with other participants
          }
        }
      }
    } catch (error) {
      console.error('Error notifying participants:', error);
      // Don't throw - notification failures shouldn't break calls
    }
  }

  /**
   * Track call events in Firebase for analytics
   */
  async trackCallEvent(eventType, data) {
    try {
      await FirebaseService.trackUsage(data.userId, {
        eventType,
        ...data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error tracking call event:', error);
      // Don't throw - tracking shouldn't break calls
    }
  }


  /**
   * Generate room name for privacy - caller-specific to prevent room collisions
   */
  generateRoomName(participants, callerUID = null) {
    // Create privacy-friendly room name using participant IDs
    // Handle both array of strings (UIDs) and array of objects (members with uid property)
    const participantIds = participants.map(p => typeof p === 'string' ? p : p.uid);
    
    // CRITICAL: Include caller UID and timestamp to ensure each call gets unique room
    // This prevents multiple callers to the same person from joining the same room
    const timestamp = Date.now();
    const caller = callerUID || 'unknown';
    
    // Format: privacycall_CALLER_PARTICIPANTS_TIMESTAMP (shortened for 100 char limit)
    const sortedParticipants = [...participantIds].sort();
    
    // Shorten UIDs to prevent room name from exceeding 100 characters
    const shortCaller = caller.substring(0, 8);
    const shortParticipants = sortedParticipants.map(p => p.substring(0, 8));
    const shortTimestamp = timestamp.toString().substring(-8); // Last 8 digits
    
    const roomId = `${shortCaller}_${shortParticipants.join('_')}_${shortTimestamp}`;
    
    console.log('ROOM_GENERATION: Room name length:', `${AppConfig.LIVEKIT.ROOM_NAME_PREFIX}${roomId}`.length);
    
    return `${AppConfig.LIVEKIT.ROOM_NAME_PREFIX}${roomId}`;
  }

  /**
   * Clean up resources and end server session
   */
  cleanup() {
    console.log('LiveKitService cleanup - current room exists:', !!this.room);
    
    // CRITICAL: End server session before local cleanup
    if (this.currentSessionId) {
      console.log('CLEANUP: Ending server session during cleanup:', this.currentSessionId);
      try {
        // End server session asynchronously (don't await to avoid blocking cleanup)
        const endSessionFunction = FirebaseService.functions().httpsCallable('endCallSession');
        endSessionFunction({
          sessionId: this.currentSessionId,
        }).then((result) => {
          console.log('CLEANUP: Server session ended during cleanup:', result.data);
        }).catch((error) => {
          console.error('CLEANUP: Error ending server session during cleanup:', error);
        });
      } catch (error) {
        console.error('CLEANUP: Error initiating server session cleanup:', error);
      }
    }
    
    if (this.room) {
      console.log('Disconnecting and cleaning up LiveKit room');

      // Track this room as recently ended (prevent ghost call re-entry)
      const roomName = this.room.name;
      if (roomName) {
        this.recentlyEndedRooms.add(roomName);
        console.log('CLEANUP: Tracking recently ended room:', roomName);

        // Remove from set after 30 seconds
        setTimeout(() => {
          this.recentlyEndedRooms.delete(roomName);
          console.log('CLEANUP: Removed room from recently ended tracking:', roomName);
        }, 30000);
      }

      this.room.removeAllListeners();
      this.room.disconnect();
      this.room = null;
    }

    // Reset all state
    this.isConnected = false;
    this.participants.clear();
    this.callStartTime = null;
    this.currentSessionId = null;
    this.audioTrackReady = false; // Reset audio track readiness

    // CRITICAL: Always try to stop audio session, even if flag says not started
    // Flag could be stale from previous failed attempt
    if (this.audioSessionStarted) {
      try {
        console.log('CLEANUP: Stopping AudioSession');
        AudioSession.stopAudioSession()
          .then(() => {
            console.log('CLEANUP: AudioSession stopped successfully');
          })
          .catch((error) => {
            console.warn('CLEANUP: AudioSession stop failed (may already be stopped):', error);
          });
      } catch (error) {
        console.warn('CLEANUP: Error initiating AudioSession stop:', error);
      }
    }
    this.audioSessionStarted = false; // Always reset flag to prevent stale state

    // Clear all event handlers
    this.onParticipantConnected = null;
    this.onParticipantDisconnected = null;
    this.onConnectionStateChanged = null;
    this.onCallEnded = null;
    this.onAudioReady = null;

    console.log('LiveKitService cleanup complete');
  }
}

// Export singleton instance
export const LiveKitService = new LiveKitCallService();
export default LiveKitService;