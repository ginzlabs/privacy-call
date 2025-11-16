import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { AccessToken } from 'livekit-server-sdk';

// Initialize Firebase Admin
admin.initializeApp();

/**
 * Generate LiveKit Access Token
 * Secure server-side token generation for audio calls
 * 
 * @param data.roomName - Name of the room to join
 * @param data.participantName - Name/ID of the participant
 * @param context - Firebase function context with auth info
 */
export const generateLiveKitToken = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to generate tokens'
      );
    }

    const { roomName, participantName } = data;
    
    // Validate input parameters
    if (!roomName || !participantName) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'roomName and participantName are required'
      );
    }

    // Validate room name format (security check)
    if (!roomName.startsWith('privacycall_')) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid room name format'
      );
    }

    // Get LiveKit credentials from environment variables
    const apiKey = functions.config().livekit?.api_key;
    const apiSecret = functions.config().livekit?.api_secret;
    
    if (!apiKey || !apiSecret) {
      throw new functions.https.HttpsError(
        'internal',
        'LiveKit credentials not configured'
      );
    }

    // Create access token
    const at = new AccessToken(apiKey, apiSecret, {
      identity: context.auth.uid, // Use Firebase UID as identity
      name: participantName,
    });

    // Grant permissions for audio calls
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false, // No data publishing for audio-only
    });

    // Set token expiration (2 hours)
    const expirationTime = Math.round(Date.now() / 1000) + (2 * 3600);
    at.ttl = expirationTime;

    // Generate JWT token
    const token = at.toJwt();

    // Log for monitoring (without exposing sensitive data)
    console.log('Generated LiveKit token for user:', {
      uid: context.auth.uid,
      roomName: roomName,
      participantName: participantName,
      expiresAt: new Date(expirationTime * 1000).toISOString(),
    });

    // Return token and server URL
    return {
      token: token,
      serverUrl: 'wss://privacycallingapp-29fcxbl3.livekit.cloud',
      expiresAt: expirationTime,
      roomName: roomName,
    };

  } catch (error) {
    console.error('Error generating LiveKit token:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      'Failed to generate LiveKit token'
    );
  }
});

/**
 * Validate Room Access
 * Check if user has permission to join a specific room
 * 
 * @param data.roomName - Name of the room to validate
 * @param context - Firebase function context with auth info
 */
export const validateRoomAccess = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { roomName } = data;
    
    if (!roomName) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'roomName is required'
      );
    }

    // Validate room name format
    if (!roomName.startsWith('privacycall_')) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Access denied to this room'
      );
    }

    // For privacy-focused app, we can implement additional checks here:
    // - Check if user is in the room participant list
    // - Validate against contacts/groups
    // - Check usage quotas
    
    // For now, allow access to any properly formatted room
    return {
      hasAccess: true,
      roomName: roomName,
    };

  } catch (error) {
    console.error('Error validating room access:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      'Failed to validate room access'
    );
  }
});

/**
 * Track Call Usage
 * Record call duration and usage for quota management
 * 
 * @param data.roomName - Name of the room
 * @param data.durationMinutes - Call duration in minutes
 * @param data.participantCount - Number of participants
 * @param context - Firebase function context with auth info
 */
export const trackCallUsage = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const { roomName, durationMinutes, participantCount } = data;
    
    // Validate input
    if (!roomName || durationMinutes == null) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'roomName and durationMinutes are required'
      );
    }

    // Store usage data in Firestore
    await admin.firestore().collection('usage_tracking').add({
      userId: context.auth.uid,
      roomName: roomName,
      durationMinutes: durationMinutes,
      participantCount: participantCount || 1,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      sessionType: 'audio_call',
    });

    console.log('Tracked call usage:', {
      userId: context.auth.uid,
      roomName: roomName,
      durationMinutes: durationMinutes,
      participantCount: participantCount,
    });

    return {
      success: true,
      message: 'Usage tracked successfully',
    };

  } catch (error) {
    console.error('Error tracking call usage:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      'Failed to track usage'
    );
  }
});