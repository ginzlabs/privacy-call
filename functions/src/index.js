const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { AccessToken } = require("livekit-server-sdk");
const { z } = require("zod");

// Initialize Firebase Admin
admin.initializeApp();

/**
 * Server-side validation schemas using Zod
 * Ensures all client input is properly validated before processing
 */

// LiveKit token generation validation
const LiveKitTokenSchema = z.object({
  roomName: z.string()
    .min(1, "Room name is required")
    .max(100, "Room name too long")
    .regex(/^privacycall_/, "Invalid room name format"),
  participantName: z.string()
    .min(1, "Participant name is required")
    .max(50, "Participant name too long"),
});

// Call session validation
const CallSessionSchema = z.object({
  roomName: z.string()
    .min(1, "Room name is required")
    .regex(/^privacycall_/, "Invalid room name format"),
  callType: z.enum(["direct", "group"]).default("direct"),
  participantCount: z.number().int().min(1).max(8).default(1),
  participantUIDs: z.array(z.string()).optional(), // Array of participant UIDs for usage tracking
});

const EndCallSessionSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
});

// Usage tracking validation
const UsageTrackingSchema = z.object({
  roomName: z.string().min(1, "Room name is required"),
  durationMinutes: z.number().int().min(0).max(720), // Max 12 hours
  participantCount: z.number().int().min(1).max(8).default(1),
});

// Invite creation validation (reserved for future use)
// const InviteCreationSchema = z.object({
//   nickname: z.string()
//     .min(1, "Nickname is required")
//     .max(30, "Nickname too long")
//     .trim(),
// });

// Invite acceptance validation (reserved for future use)
// const InviteAcceptanceSchema = z.object({
//   token: z.string().min(32, "Invalid invite token"),
//   acceptorNickname: z.string()
//     .min(1, "Nickname is required")
//     .max(30, "Nickname too long")
//     .trim(),
// });

// Call notification validation
const CallNotificationSchema = z.object({
  targetUserUID: z.string().min(1, "Target user UID is required"),
  callerName: z.string().min(1, "Caller name is required"),
  callerUID: z.string().min(1, "Caller UID is required"),
  roomName: z.string().min(1, "Room name is required"),
  callType: z.enum(["direct", "group"]).default("direct"),
});

/**
 * Validation helper function
 */
function validateInput(schema, data, errorMessage = "Invalid input data") {
  try {
    return schema.parse(data);
  } catch (error) {
    console.error("Validation error:", error);
    console.error("Error details:", error.errors);
    
    let message = "Unknown validation error";
    if (error.errors && error.errors.length > 0) {
      const firstError = error.errors[0];
      message = firstError.message || "Unknown validation error";
    } else if (error.message) {
      message = error.message;
    }
    
    throw new functions.https.HttpsError(
      "invalid-argument", 
      `${errorMessage}: ${message}`
    );
  }
}

/**
 * Calculate user's monthly usage from Firestore
 * @param {string} userId - Firebase user ID
 * @returns {number} Total minutes used this month
 */
async function calculateMonthlyUsage(userId) {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usageSnapshot = await admin.firestore()
      .collection("usage_tracking")
      .where("userId", "==", userId)
      .where("timestamp", ">=", startOfMonth)
      .get();

    let totalMinutes = 0;
    usageSnapshot.forEach(doc => {
      const data = doc.data();
      totalMinutes += data.durationMinutes || 0;
    });

    return totalMinutes;
  } catch (error) {
    console.error("Error calculating monthly usage:", error);
    return 0; // Return 0 on error to avoid blocking users
  }
}

/**
 * Enhanced rate limiting functions for various operations
 */

/**
 * Check invite creation rate limits
 * @param {string} userId - Firebase user ID
 * @returns {boolean} Whether user can create more invites
 */
async function checkInviteRateLimit(userId) {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const recentInvitesSnapshot = await admin.firestore()
      .collection("Invites")
      .where("createdBy", "==", userId)
      .where("createdAt", ">=", oneHourAgo)
      .get();

    const inviteCount = recentInvitesSnapshot.size;
    const maxInvitesPerHour = 10; // Reasonable limit to prevent spam

    console.log("Invite rate limit check:", {
      userId: userId,
      invitesLastHour: inviteCount,
      limit: maxInvitesPerHour,
    });

    return inviteCount < maxInvitesPerHour;
  } catch (error) {
    console.error("Error checking invite rate limit:", error);
    return true; // Allow on error to avoid blocking legitimate users
  }
}

/**
 * Check call session rate limits
 * @param {string} userId - Firebase user ID
 * @returns {boolean} Whether user can start more calls
 */
async function checkCallRateLimit(userId) {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const recentCallsSnapshot = await admin.firestore()
      .collection("call_sessions")
      .where("userId", "==", userId)
      .where("startTime", ">=", oneHourAgo)
      .get();

    const callCount = recentCallsSnapshot.size;
    const maxCallsPerHour = 50; // Allow reasonable call frequency

    console.log("Call rate limit check:", {
      userId: userId,
      callsLastHour: callCount,
      limit: maxCallsPerHour,
    });

    return callCount < maxCallsPerHour;
  } catch (error) {
    console.error("Error checking call rate limit:", error);
    return true; // Allow on error to avoid blocking legitimate users
  }
}

/**
 * Check token generation rate limits
 * @param {string} userId - Firebase user ID
 * @returns {boolean} Whether user can request more tokens
 */
async function checkTokenRateLimit(userId) {
  try {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    
    // Check a rate limiting collection for token requests
    const recentTokensSnapshot = await admin.firestore()
      .collection("token_requests")
      .where("userId", "==", userId)
      .where("timestamp", ">=", oneMinuteAgo)
      .get();

    const tokenCount = recentTokensSnapshot.size;
    const maxTokensPerMinute = 10; // Reasonable limit for token requests

    console.log("Token rate limit check:", {
      userId: userId,
      tokensLastMinute: tokenCount,
      limit: maxTokensPerMinute,
    });

    return tokenCount < maxTokensPerMinute;
  } catch (error) {
    console.error("Error checking token rate limit:", error);
    return true; // Allow on error to avoid blocking legitimate users
  }
}

/**
 * Record a token request for rate limiting
 * @param {string} userId - Firebase user ID
 */
async function recordTokenRequest(userId) {
  try {
    await admin.firestore().collection("token_requests").add({
      userId: userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Error recording token request:", error);
    // Don't throw - this shouldn't block the operation
  }
}

/**
 * Generate LiveKit Access Token
 * Secure server-side token generation for audio calls
 */
exports.generateLiveKitToken = functions.https.onCall(async (data, context) => {
  try {
    // Debug: Log what we're receiving
    console.log("Function called with context:", {
      hasContextAuth: !!context.auth,
      hasDataAuth: !!(data.auth),
      authUid: context.auth ? context.auth.uid : (data.auth ? data.auth.uid : "NO_UID"),
      dataReceived: data,
    });

    // Get user ID from the correct location (data.auth.uid for httpsCallable)
    const userAuth = context.auth || data.auth;
    const userId = userAuth ? userAuth.uid : null;

    // Verify user is authenticated (including anonymous users)
    if (!userId) {
      console.error("Authentication failed. Context auth:", context.auth, "Data auth:", data.auth);
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to generate tokens"
      );
    }

    // Log authentication details for debugging
    console.log("Authenticated user requesting token:", {
      uid: userId,
      source: context.auth ? "context.auth" : "data.auth",
    });

    // Extract data from the correct location
    const extractedData = {
      roomName: data.roomName || (data.data && data.data.roomName),
      participantName: data.participantName || (data.data && data.data.participantName),
    };
    
    // Debug: Log extracted values
    console.log("Extracted parameters:", {
      roomName: extractedData.roomName,
      participantName: extractedData.participantName,
      dataStructure: data,
    });
    
    // Server-side validation using Zod schema
    const validatedData = validateInput(
      LiveKitTokenSchema, 
      extractedData, 
      "Invalid LiveKit token request"
    );
    
    const { roomName, participantName } = validatedData;

    // Check token generation rate limits
    const canRequestToken = await checkTokenRateLimit(userId);
    if (!canRequestToken) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Token request rate limit exceeded. Please wait before requesting another token."
      );
    }

    // Record this token request for rate limiting
    await recordTokenRequest(userId);

    // Get LiveKit credentials from environment variables (secure)
    // Note: functions.config() is deprecated in v2, use process.env
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    
    if (!apiKey || !apiSecret) {
      console.error("LiveKit credentials missing. API Key exists:", !!apiKey, "API Secret exists:", !!apiSecret);
      throw new functions.https.HttpsError(
        "internal",
        "LiveKit credentials not configured. Please set LIVEKIT_API_KEY and LIVEKIT_API_SECRET environment variables."
      );
    }

    // Check user's monthly usage quota before issuing token
    const monthlyUsage = await calculateMonthlyUsage(userId);
    const monthlyQuotaMinutes = 1000; // 1000 minutes per month (from AppConfig)
    
    if (monthlyUsage >= monthlyQuotaMinutes) {
      console.log("User exceeded monthly quota:", {
        userId: userId,
        currentUsage: monthlyUsage,
        quota: monthlyQuotaMinutes,
      });
      
      throw new functions.https.HttpsError(
        "resource-exhausted",
        `Monthly quota exceeded. Used ${monthlyUsage}/${monthlyQuotaMinutes} minutes.`
      );
    }

    // Log quota status for monitoring
    console.log("User quota check passed:", {
      userId: userId,
      currentUsage: monthlyUsage,
      quota: monthlyQuotaMinutes,
      remaining: monthlyQuotaMinutes - monthlyUsage,
    });

    // Create access token
    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId, // Use Firebase UID as identity
      name: participantName,
    });

    // Grant permissions for audio calls (corrected format)
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    // Set token expiration (2 hours) - use ttl string format
    at.ttl = "2h";

    // Generate JWT token (async in v2)
    const token = await at.toJwt();

    // Generate encryption key for E2EE (32 random bytes as hex)
    const crypto = require("crypto");
    const encryptionKey = crypto.randomBytes(32).toString("hex");

    // Calculate expiration for return value
    const expirationTime = Math.round(Date.now() / 1000) + (2 * 3600);

    // Log for monitoring (without exposing sensitive data)
    console.log("Generated LiveKit token with E2EE for user:", {
      uid: userId,
      roomName: roomName,
      participantName: participantName,
      expiresAt: new Date(expirationTime * 1000).toISOString(),
      hasEncryptionKey: !!encryptionKey,
    });

    // Return token, server URL, and encryption key
    return {
      token: token,
      serverUrl: process.env.LIVEKIT_SERVER_URL || "wss://privacycallingapp-29fcxbl3.livekit.cloud", // Use env variable
      expiresAt: expirationTime,
      roomName: roomName,
      encryptionKey: encryptionKey,
    };

  } catch (error) {
    console.error("Error generating LiveKit token:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to generate LiveKit token"
    );
  }
});

/**
 * Track Call Usage
 * Record call duration and usage for quota management
 */
exports.trackCallUsage = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    // Server-side validation using Zod schema
    const validatedData = validateInput(
      UsageTrackingSchema, 
      data, 
      "Invalid usage tracking data"
    );
    
    const { roomName, durationMinutes, participantCount } = validatedData;

    // Store usage data in Firestore (DEPRECATED: Use server-side session tracking instead)
    await admin.firestore().collection("usage_tracking").add({
      userId: context.auth.uid,
      roomName: roomName,
      durationMinutes: durationMinutes,
      participantCount: participantCount,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      sessionType: "audio_call",
    });

    console.log("Tracked call usage:", {
      userId: context.auth.uid,
      roomName: roomName,
      durationMinutes: durationMinutes,
      participantCount: participantCount,
    });

    return {
      success: true,
      message: "Usage tracked successfully",
    };

  } catch (error) {
    console.error("Error tracking call usage:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to track usage"
    );
  }
});

/**
 * Create Invite with Rate Limiting
 * Server-side invite creation with spam protection
 */
exports.createInviteWithRateLimit = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    const userAuth = context.auth || data.auth;
    const userId = userAuth ? userAuth.uid : null;

    if (!userId) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const { token, createdByNickname } = data;
    
    // Validate input
    if (!token || !createdByNickname) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "token and createdByNickname are required"
      );
    }

    // Check invite creation rate limits
    const canCreateInvite = await checkInviteRateLimit(userId);
    if (!canCreateInvite) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many invites created recently. Please wait before creating more."
      );
    }

    // Create invite document with proper UTC server timing
    const serverExpiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now in UTC
    );
    
    const inviteRef = await admin.firestore().collection("Invites").add({
      token: token,
      createdBy: userId,
      createdByNickname: createdByNickname,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: serverExpiresAt, // Proper Firestore timestamp
    });

    console.log("Rate-limited invite created:", {
      inviteId: inviteRef.id,
      createdBy: userId,
      createdByNickname: createdByNickname,
    });

    return {
      success: true,
      inviteId: inviteRef.id,
      message: "Invite created successfully",
    };

  } catch (error) {
    console.error("Error creating invite with rate limit:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to create invite"
    );
  }
});

/**
 * Accept Invite with Mutual Contact Addition (15-minute temporary storage)
 * Handles invite acceptance and creates temporary mutual contact relationship
 */
exports.acceptInviteWithMutualContacts = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    const userAuth = context.auth || data.auth;
    const acceptorUID = userAuth ? userAuth.uid : null;

    if (!acceptorUID) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    // Extract parameters (check both direct and nested locations)
    const inviteId = data.inviteId || (data.data && data.data.inviteId);
    
    // Validate input (removed acceptorNickname requirement for privacy)
    if (!inviteId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "inviteId is required"
      );
    }

    // Get invite document
    const inviteRef = admin.firestore().collection("Invites").doc(inviteId);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Invite not found"
      );
    }

    const inviteData = inviteDoc.data();

    // Verify invite is still valid
    if (inviteData.status !== "pending") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Invite is no longer valid"
      );
    }

    if (inviteData.expiresAt.toDate() < new Date()) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Invite has expired"
      );
    }

    // Update invite status (no nicknames for privacy)
    await inviteRef.update({
      status: "accepted",
      acceptedBy: acceptorUID,
      // Remove acceptedByNickname for privacy
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create mutual contact relationship with sync tracking
    // Entry will be deleted immediately once both users confirm sync
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min fallback TTL

    const relationshipRef = await admin.firestore().collection("contact_relationships").add({
      user1: inviteData.createdBy,
      user2: acceptorUID,
      user1Synced: false, // Track if user1 synced this contact
      user2Synced: false, // Track if user2 synced this contact
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAt, // Fallback TTL if sync never completes
      inviteId: inviteId,
    });

    console.log("Created contact relationship with sync tracking:", relationshipRef.id);

    console.log("Invite accepted with temporary mutual contact relationship (15min expiry):", {
      inviteId: inviteId,
      inviter: inviteData.createdBy,
      acceptor: acceptorUID,
      expiresAt: expiresAt.toISOString(),
    });


    // Return contact information for both users (no nicknames for privacy)
    return {
      success: true,
      inviteAccepted: true,
      inviterContact: {
        uid: inviteData.createdBy,
        // Remove nickname for privacy
      },
      acceptorContact: {
        uid: acceptorUID,
        // Remove nickname for privacy
      },
      expiresAt: expiresAt.toISOString(),
      message: "Invite accepted and temporary mutual contact relationship created (expires in 15 minutes)",
    };

  } catch (error) {
    console.error("Error accepting invite with mutual contacts:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to accept invite"
    );
  }
});

/**
 * Report Contact Synced
 * Called by client after successfully adding contact from relationship
 * Deletes relationship immediately once both users have synced
 */
exports.reportContactSynced = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    const userAuth = context.auth || data.auth;
    const userId = userAuth ? userAuth.uid : null;

    if (!userId) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to report sync"
      );
    }

    const otherUserId = data.otherUserId || (data.data && data.data.otherUserId);

    if (!otherUserId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "otherUserId is required"
      );
    }

    console.log("SYNC_REPORT: User", userId.substring(0, 8) + "...", "synced contact", otherUserId.substring(0, 8) + "...");

    // Find the relationship document
    const relationshipsSnapshot = await admin.firestore()
      .collection("contact_relationships")
      .where("user1", "in", [userId, otherUserId])
      .get();

    let relationshipDoc = null;

    // Find the specific relationship between these two users
    relationshipsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if ((data.user1 === userId && data.user2 === otherUserId) ||
          (data.user1 === otherUserId && data.user2 === userId)) {
        relationshipDoc = doc;
      }
    });

    if (!relationshipDoc) {
      console.log("SYNC_REPORT: No relationship found (may already be deleted)");
      return { success: true, message: "Relationship not found (already deleted)" };
    }

    const relationshipData = relationshipDoc.data();

    // Determine which user is reporting sync
    const isUser1 = relationshipData.user1 === userId;
    const updateField = isUser1 ? "user1Synced" : "user2Synced";

    // Update the sync flag
    await relationshipDoc.ref.update({
      [updateField]: true,
    });

    console.log("SYNC_REPORT: Updated", updateField, "to true");

    // CRITICAL: Re-read document to get FRESH values (includes other user's updates)
    const updatedDoc = await relationshipDoc.ref.get();
    const updatedData = updatedDoc.data();

    if (!updatedDoc.exists || !updatedData) {
      console.log("SYNC_REPORT: Document disappeared after update");
      return { success: true, message: "Relationship already deleted" };
    }

    // Check if both users have now synced (using FRESH data)
    const bothSynced = updatedData.user1Synced && updatedData.user2Synced;

    console.log("SYNC_REPORT: Sync status -", {
      user1Synced: updatedData.user1Synced,
      user2Synced: updatedData.user2Synced,
      bothSynced: bothSynced,
    });

    if (bothSynced) {
      // Both users have synced - delete the relationship immediately
      await relationshipDoc.ref.delete();
      console.log("SYNC_REPORT: ✅ Both users synced - deleted relationship:", relationshipDoc.id);

      return {
        success: true,
        message: "Both users synced - relationship deleted",
        deleted: true,
      };
    } else {
      console.log("SYNC_REPORT: Waiting for other user to sync");

      return {
        success: true,
        message: "Sync reported, waiting for other user",
        deleted: false,
      };
    }

  } catch (error) {
    console.error("Error reporting contact sync:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      "Failed to report contact sync"
    );
  }
});

/**
 * Send Call Notification
 * Send push notification to user for incoming calls
 */
exports.sendCallNotification = functions.https.onCall(async (data, context) => {
  try {
    // Verify user is authenticated
    const userAuth = context.auth || data.auth;
    const userId = userAuth ? userAuth.uid : null;

    if (!userId) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    // Debug: Log what we're receiving
    console.log("sendCallNotification called with data:", {
      dataReceived: data,
      dataKeys: Object.keys(data),
    });

    // Extract parameters (check both direct and nested locations)
    const extractedData = {
      targetUserUID: data.targetUserUID || (data.data && data.data.targetUserUID),
      callerName: data.callerName || (data.data && data.data.callerName),
      callerUID: data.callerUID || (data.data && data.data.callerUID),
      roomName: data.roomName || (data.data && data.data.roomName),
      callType: data.callType || (data.data && data.data.callType) || "direct",
      isCancellation: data.isCancellation || (data.data && data.data.isCancellation),
      isDecline: data.isDecline || (data.data && data.data.isDecline),
    };
    
    // Debug: Log extracted parameters
    console.log("Extracted notification parameters:", extractedData);
    
    // Check notification type (before validation)
    const isCancellation = extractedData.isCancellation === true || extractedData.isCancellation === "true";
    const isDecline = extractedData.isDecline === true || extractedData.isDecline === "true";
    
    // Server-side validation using Zod schema (only validate core fields)
    const validatedData = validateInput(
      CallNotificationSchema, 
      {
        targetUserUID: extractedData.targetUserUID,
        callerName: extractedData.callerName,
        callerUID: extractedData.callerUID,
        roomName: extractedData.roomName,
        callType: extractedData.callType,
      }, 
      "Invalid call notification data"
    );
    
    const { targetUserUID, callerName, callerUID, roomName, callType } = validatedData;

    // Get target user's FCM token
    const userTokenDoc = await admin.firestore()
      .collection("user_tokens")
      .doc(targetUserUID)
      .get();

    if (!userTokenDoc.exists) {
      console.log("No FCM token found for user:", targetUserUID);
      return { success: false, reason: "User not available for notifications" };
    }

    const userData = userTokenDoc.data();
    const fcmToken = userData.fcmToken;

    if (!fcmToken) {
      console.log("No FCM token available for user:", targetUserUID);
      return { success: false, reason: "FCM token not available" };
    }

    console.log("DEBUG: Final notification data:", {
      targetUserUID,
      callerName,
      callerUID,
      roomName,
      callType,
      isCancellation: extractedData.isCancellation,
      isCancellationDetected: isCancellation,
      isDecline: extractedData.isDecline,
      isDeclineDetected: isDecline,
    });
    
    // Create push notification payload
    const notificationPayload = {
      token: fcmToken,
      notification: isCancellation ? {
        title: "Call Cancelled",
        body: "Call was cancelled",
      } : isDecline ? {
        title: "Call Declined",
        body: "Call was declined",
      } : {
        title: `Incoming ${callType === "group" ? "Group" : ""} Call`,
        body: `${callerName} is calling you`,
      },
      data: {
        type: "incoming_call",
        callerName: callerName,
        callerUID: callerUID,
        roomName: roomName,
        callType: callType,
        timestamp: Date.now().toString(),
        isCancellation: isCancellation ? "true" : "false",
        isDecline: isDecline ? "true" : "false",
      },
      android: {
        priority: "high",
        ttl: 30000, // 30 seconds TTL for calls
        notification: {
          channelId: "incoming_calls",
          priority: "max", // Use max priority for VoIP calls
          sound: null, // Disable notification sound to prevent continuous ringing
          visibility: "public", // Show on lock screen
          color: "#00FF00", // Green color for call notifications
          tag: `incoming_call_${callerUID}_${Date.now()}`, // Unique tag to allow multiple notifications
        },
      },
      apns: {
        payload: {
          aps: {
            alert: isCancellation ? {
              title: "Call Cancelled",
              body: "Call was cancelled",
            } : isDecline ? {
              title: "Call Declined",
              body: "Call was declined",
            } : {
              title: `Incoming ${callType === "group" ? "Group" : ""} Call`,
              body: `${callerName} is calling you`,
            },
            sound: "default",
            // Remove badge: 1 to prevent badge from appearing
            category: "incoming_call",
          },
        },
      },
    };

    // Send notification via FCM
    const response = await admin.messaging().send(notificationPayload);
    
    console.log("Call notification sent successfully:", {
      targetUser: targetUserUID,
      caller: callerName,
      roomName: roomName,
      messageId: response,
    });

    // CRITICAL: Log this call attempt to the target user's history (server-side)
    // This ensures all incoming calls are logged, even if notification is never tapped
    try {
      const historyType = isCancellation ? "call_missed" : "call_incoming";
      const historyEntry = {
        type: historyType,
        timestamp: new Date().toISOString(),
        contactName: callerName,
        callerUID: callerUID !== "system" ? callerUID : null,
        messageId: response,
        source: "server_notification",
      };
      
      // Remove null/undefined values
      Object.keys(historyEntry).forEach(key => {
        if (historyEntry[key] === null || historyEntry[key] === undefined) {
          delete historyEntry[key];
        }
      });
      
      // Store in a user-specific history collection
      await admin.firestore()
        .collection("user_history")
        .doc(targetUserUID)
        .collection("entries")
        .add(historyEntry);
        
      console.log("Server-side history logged:", historyType, "for user:", targetUserUID);
    } catch (historyError) {
      console.error("Error logging server-side history:", historyError);
      // Don't throw - history logging shouldn't block notifications
    }

    return {
      success: true,
      messageId: response,
      message: "Call notification sent successfully",
    };

  } catch (error) {
    console.error("Error sending call notification:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to send call notification"
    );
  }
});

/**
 * Start Call Session
 * Server-side call session start tracking with server timestamps
 */
exports.startCallSession = functions.https.onCall(async (data, context) => {
  try {
    // Debug: Log what we're receiving for startCallSession
    console.log("startCallSession called with context:", {
      hasContextAuth: !!context.auth,
      hasDataAuth: !!(data.auth),
      authUid: context.auth ? context.auth.uid : (data.auth ? data.auth.uid : "NO_UID"),
      dataReceived: data,
    });

    // Get user ID from the correct location (same pattern as generateLiveKitToken)
    const userAuth = context.auth || data.auth;
    const userId = userAuth ? userAuth.uid : null;

    // Verify user is authenticated (including anonymous users)
    if (!userId) {
      console.error("startCallSession authentication failed. Context auth:", context.auth, "Data auth:", data.auth);
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to start call session"
      );
    }

    // Log authentication details for debugging
    console.log("Authenticated user starting call session:", {
      uid: userId,
      source: context.auth ? "context.auth" : "data.auth",
    });

    // Extract data from the correct location (same pattern as generateLiveKitToken)
    const extractedData = {
      roomName: data.roomName || (data.data && data.data.roomName),
      callType: data.callType || (data.data && data.data.callType),
      participantCount: data.participantCount || (data.data && data.data.participantCount),
      participantUIDs: data.participantUIDs || (data.data && data.data.participantUIDs),
    };

    // Debug: Log extracted values
    console.log("Extracted call session parameters:", extractedData);

    // Server-side validation using Zod schema
    const validatedData = validateInput(
      CallSessionSchema,
      extractedData,
      "Invalid call session data"
    );

    const { roomName, callType, participantCount, participantUIDs } = validatedData;

    // Check call session rate limits
    const canStartCall = await checkCallRateLimit(userId);
    if (!canStartCall) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Call rate limit exceeded. Please wait before starting another call."
      );
    }

    // Create call session record with server timestamp
    const sessionRef = await admin.firestore().collection("call_sessions").add({
      userId: userId,
      roomName: roomName,
      callType: callType,
      participantCount: participantCount,
      participantUIDs: participantUIDs || [], // Store participant UIDs for usage tracking
      startTime: admin.firestore.FieldValue.serverTimestamp(),
      status: "active",
      endTime: null,
      durationMinutes: null,
    });

    console.log("Call session started:", {
      sessionId: sessionRef.id,
      userId: userId,
      roomName: roomName,
      callType: callType,
    });

    return {
      success: true,
      sessionId: sessionRef.id,
      message: "Call session started successfully",
    };

  } catch (error) {
    console.error("Error starting call session:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to start call session"
    );
  }
});

/**
 * End Call Session
 * Server-side call session end tracking with duration calculation
 */
exports.endCallSession = functions.https.onCall(async (data, context) => {
  try {
    // Debug: Log what we're receiving for endCallSession
    console.log("endCallSession called with context:", {
      hasContextAuth: !!context.auth,
      hasDataAuth: !!(data.auth),
      authUid: context.auth ? context.auth.uid : (data.auth ? data.auth.uid : "NO_UID"),
      dataReceived: data,
    });

    // Get user ID from the correct location (same pattern as generateLiveKitToken)
    const userAuth = context.auth || data.auth;
    const userId = userAuth ? userAuth.uid : null;

    // Verify user is authenticated (including anonymous users)
    if (!userId) {
      console.error("endCallSession authentication failed. Context auth:", context.auth, "Data auth:", data.auth);
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to end call session"
      );
    }

    // Log authentication details for debugging
    console.log("Authenticated user ending call session:", {
      uid: userId,
      source: context.auth ? "context.auth" : "data.auth",
    });

    // Extract data from the correct location (same pattern as generateLiveKitToken)
    const extractedData = {
      sessionId: data.sessionId || (data.data && data.data.sessionId),
    };
    
    // Debug: Log extracted values
    console.log("Extracted end call session parameters:", extractedData);
    
    // Server-side validation using Zod schema
    const validatedData = validateInput(
      EndCallSessionSchema, 
      extractedData, 
      "Invalid end call session data"
    );
    
    const { sessionId } = validatedData;

    // Get the session document
    const sessionRef = admin.firestore().collection("call_sessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Call session not found"
      );
    }

    const sessionData = sessionDoc.data();

    // Verify session belongs to the authenticated user
    if (sessionData.userId !== userId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Cannot end session for another user"
      );
    }

    // Check if session is already ended
    if (sessionData.status === "ended") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Call session already ended"
      );
    }

    // Calculate duration using server timestamps
    const endTime = new Date();
    const startTime = sessionData.startTime.toDate();
    const durationMinutes = Math.ceil((endTime - startTime) / 1000 / 60); // Round up to nearest minute

    // Update session with end time and duration
    await sessionRef.update({
      endTime: admin.firestore.FieldValue.serverTimestamp(),
      status: "ended",
      durationMinutes: durationMinutes,
    });

    // Record usage for quota tracking - FOR ALL PARTICIPANTS
    if (durationMinutes > 0) {
      // Get all participant UIDs (caller + other participants)
      const allParticipants = new Set();
      allParticipants.add(userId); // Caller

      if (sessionData.participantUIDs && Array.isArray(sessionData.participantUIDs)) {
        sessionData.participantUIDs.forEach(uid => allParticipants.add(uid));
      }

      console.log("Tracking usage for participants:", Array.from(allParticipants));

      // Create usage tracking entries for each participant
      const batch = admin.firestore().batch();

      allParticipants.forEach(participantUID => {
        const usageRef = admin.firestore().collection("usage_tracking").doc();
        batch.set(usageRef, {
          userId: participantUID,
          roomName: sessionData.roomName,
          durationMinutes: durationMinutes,
          participantCount: sessionData.participantCount || 1,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          sessionType: "audio_call",
          sessionId: sessionId,
          verifiedServerSide: true, // Mark as server-verified
        });
      });

      await batch.commit();
      console.log("Usage tracked for", allParticipants.size, "participants");
    }

    console.log("Call session ended:", {
      sessionId: sessionId,
      userId: userId,
      roomName: sessionData.roomName,
      durationMinutes: durationMinutes,
      participantsTracked: sessionData.participantUIDs ? sessionData.participantUIDs.length + 1 : 1,
    });

    return {
      success: true,
      sessionId: sessionId,
      durationMinutes: durationMinutes,
      message: "Call session ended successfully",
    };

  } catch (error) {
    console.error("Error ending call session:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to end call session"
    );
  }
});

/**
 * LiveKit Webhook Handler
 * Receives events from LiveKit to verify actual call participation
 * This provides server-side verification of call events
 */
exports.livekitWebhook = functions.https.onRequest(async (req, res) => {
  try {
    // Verify webhook signature for security (you should implement this)
    // const signature = req.headers['lk-signature'];
    // if (!verifyWebhookSignature(req.body, signature)) {
    //   return res.status(401).send('Unauthorized');
    // }

    const event = req.body;
    console.log("LiveKit webhook event received:", event);

    if (event.event === "participant_joined") {
      // Verify participant joined event
      const { room, participant } = event;
      
      console.log("Participant joined room:", {
        roomName: room.name,
        participantId: participant.identity,
        joinedAt: new Date().toISOString(),
      });

      // Cross-reference with our call sessions
      const sessionSnapshot = await admin.firestore()
        .collection("call_sessions")
        .where("roomName", "==", room.name)
        .where("status", "==", "active")
        .get();

      if (!sessionSnapshot.empty) {
        const sessionDoc = sessionSnapshot.docs[0];
        await sessionDoc.ref.update({
          livekitVerified: true,
          lastLivekitEvent: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

    } else if (event.event === "participant_left") {
      // Verify participant left event
      const { room, participant } = event;
      
      console.log("Participant left room:", {
        roomName: room.name,
        participantId: participant.identity,
        leftAt: new Date().toISOString(),
      });

    } else if (event.event === "room_finished") {
      // Room ended - can be used to verify call end times
      const { room } = event;
      
      console.log("Room finished:", {
        roomName: room.name,
        finishedAt: new Date().toISOString(),
      });

      // Update any active sessions for this room
      const sessionSnapshot = await admin.firestore()
        .collection("call_sessions")
        .where("roomName", "==", room.name)
        .where("status", "==", "active")
        .get();

      const batch = admin.firestore().batch();
      sessionSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          livekitRoomFinished: true,
          livekitFinishedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Error processing LiveKit webhook:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * Cancel Call Session
 * Server-side call session cancellation tracking for immediate cancellations
 * This ensures receiving devices can check call status before showing incoming call UI
 */
exports.cancelCallSession = functions.https.onCall(async (data, context) => {
  try {
    // Debug: Log what we're receiving for cancelCallSession
    console.log("cancelCallSession called with context:", {
      hasContextAuth: !!context.auth,
      hasDataAuth: !!(data.auth),
      authUid: context.auth ? context.auth.uid : (data.auth ? data.auth.uid : "NO_UID"),
      dataReceived: data,
    });

    // Get user ID from the correct location (same pattern as other functions)
    const userAuth = context.auth || data.auth;
    const userId = userAuth ? userAuth.uid : null;

    // Verify user is authenticated (including anonymous users)
    if (!userId) {
      console.error("cancelCallSession authentication failed. Context auth:", context.auth, "Data auth:", data.auth);
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to cancel call session"
      );
    }

    // Log authentication details for debugging
    console.log("Authenticated user canceling call session:", {
      uid: userId,
      source: context.auth ? "context.auth" : "data.auth",
    });

    // Extract data from the correct location
    const extractedData = {
      sessionId: data.sessionId || (data.data && data.data.sessionId),
      roomName: data.roomName || (data.data && data.data.roomName),
    };
    
    // Debug: Log extracted values
    console.log("Extracted cancel call session parameters:", extractedData);
    
    const { sessionId, roomName } = extractedData;

    // Validate input
    if (!sessionId && !roomName) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Either sessionId or roomName is required to cancel call"
      );
    }

    let sessionRef;
    let sessionDoc;

    if (sessionId) {
      // Cancel by session ID (preferred method)
      sessionRef = admin.firestore().collection("call_sessions").doc(sessionId);
      sessionDoc = await sessionRef.get();
    } else {
      // Cancel by room name (fallback method)
      const sessionSnapshot = await admin.firestore()
        .collection("call_sessions")
        .where("roomName", "==", roomName)
        .where("userId", "==", userId)
        .where("status", "==", "active")
        .orderBy("startTime", "desc")
        .limit(1)
        .get();

      if (!sessionSnapshot.empty) {
        sessionDoc = sessionSnapshot.docs[0];
        sessionRef = sessionDoc.ref;
      }
    }

    if (!sessionDoc || !sessionDoc.exists) {
      // Don't throw error - cancellation might happen after call already ended
      console.log("No active call session found to cancel for user:", userId);
      return {
        success: true,
        message: "No active call session found (may have already ended)",
      };
    }

    const sessionData = sessionDoc.data();

    // Verify session belongs to the authenticated user
    if (sessionData.userId !== userId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Cannot cancel session for another user"
      );
    }

    // Check if session is already ended or cancelled
    if (sessionData.status === "ended" || sessionData.status === "cancelled") {
      return {
        success: true,
        message: `Call session already ${sessionData.status}`,
      };
    }

    // Update session status to cancelled with server timestamp
    await sessionRef.update({
      status: "cancelled",
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      endTime: admin.firestore.FieldValue.serverTimestamp(),
      durationMinutes: 0, // No usage for cancelled calls
    });

    console.log("Call session cancelled:", {
      sessionId: sessionDoc.id,
      userId: userId,
      roomName: sessionData.roomName,
      cancelledAt: new Date().toISOString(),
    });

    return {
      success: true,
      sessionId: sessionDoc.id,
      roomName: sessionData.roomName,
      message: "Call session cancelled successfully",
    };

  } catch (error) {
    console.error("Error cancelling call session:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to cancel call session"
    );
  }
});

/**
 * Track Call Cancellation
 * Simple tracking system to record when calls are cancelled
 * Used to prevent race conditions with incoming call notifications
 */
exports.trackCallCancellation = functions.https.onCall(async (data, context) => {
  try {
    // Get user ID from the correct location
    const userAuth = context.auth || data.auth;
    const userId = userAuth ? userAuth.uid : null;

    if (!userId) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to track call cancellation"
      );
    }

    const extractedData = {
      roomName: data.roomName || (data.data && data.data.roomName),
      targetUserUID: data.targetUserUID || (data.data && data.data.targetUserUID),
    };
    
    const { roomName, targetUserUID } = extractedData;

    if (!roomName || !targetUserUID) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "roomName and targetUserUID are required"
      );
    }

    // Store cancellation record with short expiry (30 seconds is enough)
    const cancellationDoc = {
      roomName: roomName,
      callerUID: userId,
      targetUserUID: targetUserUID,
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 30000), // 30 seconds
    };

    await admin.firestore().collection("call_cancellations").add(cancellationDoc);

    console.log("Call cancellation tracked:", {
      roomName: roomName,
      callerUID: userId,
      targetUserUID: targetUserUID,
    });

    return {
      success: true,
      message: "Call cancellation tracked successfully",
    };

  } catch (error) {
    console.error("Error tracking call cancellation:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to track call cancellation"
    );
  }
});

/**
 * Check Call Cancellation Status
 * Check if a specific call was cancelled before showing incoming call UI
 * Used by receiving devices to verify call status before showing incoming call UI
 */
exports.checkCallCancellation = functions.https.onCall(async (data, context) => {
  try {
    // Get user ID from the correct location
    const userAuth = context.auth || data.auth;
    const userId = userAuth ? userAuth.uid : null;

    if (!userId) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to check call cancellation"
      );
    }

    const extractedData = {
      roomName: data.roomName || (data.data && data.data.roomName),
      callerUID: data.callerUID || (data.data && data.callerUID),
    };
    
    const { roomName, callerUID } = extractedData;

    console.log("DEBUG: Checking call cancellation with params:", {
      roomName: roomName,
      callerUID: callerUID,
      currentUserId: userId,
    });

    if (!roomName || !callerUID) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "roomName and callerUID are required"
      );
    }

    // Look for recent cancellation record for this call
    const cancellationSnapshot = await admin.firestore()
      .collection("call_cancellations")
      .where("roomName", "==", roomName)
      .where("callerUID", "==", callerUID)
      .where("targetUserUID", "==", userId)
      .where("expiresAt", ">", new Date()) // Not expired
      .orderBy("expiresAt", "desc") // Order by expiresAt instead to avoid index issues
      .limit(1)
      .get();

    console.log("DEBUG: Cancellation query results:", {
      isEmpty: cancellationSnapshot.empty,
      size: cancellationSnapshot.size,
      roomName: roomName,
      callerUID: callerUID,
    });

    if (!cancellationSnapshot.empty) {
      const cancellationDoc = cancellationSnapshot.docs[0];
      const cancellationData = cancellationDoc.data();
      
      console.log("Found call cancellation record:", {
        roomName: roomName,
        callerUID: callerUID,
        cancelledAt: (cancellationData.cancelledAt && cancellationData.cancelledAt.toDate) 
          ? cancellationData.cancelledAt.toDate().toISOString() 
          : "unknown",
      });

      return {
        cancelled: true,
        roomName: roomName,
        callerUID: callerUID,
        cancelledAt: (cancellationData.cancelledAt && cancellationData.cancelledAt.toDate) 
          ? cancellationData.cancelledAt.toDate().toISOString() 
          : null,
        message: "Call was cancelled",
      };
    }

    console.log("No cancellation found for call:", roomName);
    return {
      cancelled: false,
      roomName: roomName,
      callerUID: callerUID,
      message: "Call is not cancelled",
    };

  } catch (error) {
    console.error("Error checking call cancellation:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to check call cancellation"
    );
  }
});

/**
 * Check Call Session Status  
 * Check if a call session is still active, cancelled, or ended
 * Used by receiving devices to verify call status before showing incoming call UI
 */
exports.checkCallSessionStatus = functions.https.onCall(async (data, context) => {
  try {
    // Debug: Log what we're receiving for checkCallSessionStatus
    console.log("checkCallSessionStatus called with context:", {
      hasContextAuth: !!context.auth,
      hasDataAuth: !!(data.auth),
      authUid: context.auth ? context.auth.uid : (data.auth ? data.auth.uid : "NO_UID"),
      dataReceived: data,
    });

    // Get user ID from the correct location (same pattern as other functions)
    const userAuth = context.auth || data.auth;
    const userId = userAuth ? userAuth.uid : null;

    // Verify user is authenticated (including anonymous users)
    if (!userId) {
      console.error("checkCallSessionStatus authentication failed. Context auth:", context.auth, "Data auth:", data.auth);
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to check call session status"
      );
    }

    // Extract data from the correct location
    const extractedData = {
      roomName: data.roomName || (data.data && data.data.roomName),
      callerUID: data.callerUID || (data.data && data.callerUID),
    };
    
    // Debug: Log extracted values
    console.log("Extracted check call session parameters:", extractedData);
    
    const { roomName, callerUID } = extractedData;

    // Validate input
    if (!roomName) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "roomName is required to check call status"
      );
    }

    // Find the most recent call session for this room
    // We check sessions from the caller (not the current user)
    console.log("DEBUG: Searching for call sessions with params:", {
      roomName: roomName,
      callerUID: callerUID,
      currentUserId: userId,
      searchingForUserId: callerUID || userId,
    });

    const sessionSnapshot = await admin.firestore()
      .collection("call_sessions")
      .where("roomName", "==", roomName)
      .where("userId", "==", callerUID || userId) // Use callerUID if provided, else current user
      .orderBy("startTime", "desc")
      .limit(1)
      .get();

    console.log("DEBUG: Session query results:", {
      isEmpty: sessionSnapshot.empty,
      size: sessionSnapshot.size,
      roomName: roomName,
      searchedUserId: callerUID || userId,
    });

    if (sessionSnapshot.empty) {
      console.log("No call session found for room:", roomName);
      return {
        status: "not_found",
        message: "No call session found for this room",
      };
    }

    const sessionDoc = sessionSnapshot.docs[0];
    const sessionData = sessionDoc.data();

    console.log("Found call session status:", {
      sessionId: sessionDoc.id,
      roomName: roomName,
      status: sessionData.status,
      callerUID: sessionData.userId,
      startTime: (sessionData.startTime && sessionData.startTime.toDate) 
        ? sessionData.startTime.toDate().toISOString() 
        : "unknown",
    });

    return {
      status: sessionData.status, // 'active', 'cancelled', 'ended'
      sessionId: sessionDoc.id,
      roomName: sessionData.roomName,
      callType: sessionData.callType,
      startTime: (sessionData.startTime && sessionData.startTime.toDate) 
        ? sessionData.startTime.toDate().toISOString() 
        : null,
      callerUID: sessionData.userId,
      message: `Call session status: ${sessionData.status}`,
    };

  } catch (error) {
    console.error("Error checking call session status:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to check call session status"
    );
  }
});

/**
 * Internal cleanup function that can be called by other functions
 */
async function cleanupExpiredContactRelationshipsInternal() {
  try {
    const now = new Date();
    
    console.log("PRIVACY_CLEANUP: Starting expired contact relationships cleanup...");
    
    // Find expired contact relationships
    const expiredRelationships = await admin.firestore()
      .collection("contact_relationships")
      .where("expiresAt", "<", now)
      .get();

    if (expiredRelationships.empty) {
      console.log("PRIVACY_CLEANUP: No expired contact relationships to clean up");
      return { cleaned: 0, message: "No expired relationships found" };
    }

    console.log(`PRIVACY_CLEANUP: Found ${expiredRelationships.size} expired relationships to delete`);

    // Delete expired relationships in batches
    const batch = admin.firestore().batch();
    expiredRelationships.docs.forEach(doc => {
      const data = doc.data();
      console.log("PRIVACY_CLEANUP: Deleting expired relationship:", {
        documentId: doc.id,
        user1: (data.user1 ? data.user1.substring(0, 8) + "..." : "unknown"),
        user2: (data.user2 ? data.user2.substring(0, 8) + "..." : "unknown"),
        expiredAt: (data.expiresAt && data.expiresAt.toDate) 
          ? data.expiresAt.toDate().toISOString() 
          : "unknown",
      });
      batch.delete(doc.ref);
    });

    await batch.commit();
    
    console.log(`PRIVACY_CLEANUP: Successfully deleted ${expiredRelationships.size} expired contact relationships`);
    
    return {
      cleaned: expiredRelationships.size,
      message: `Successfully cleaned up ${expiredRelationships.size} expired relationships`
    };

  } catch (error) {
    console.error("PRIVACY_CLEANUP: Error cleaning up expired contact relationships:", error);
    throw error;
  }
}

/**
 * Scheduled cleanup of expired contact relationships
 * HTTP function for external cron service to call every 15 minutes
 * URL: https://[your-region]-[project-id].cloudfunctions.net/scheduledCleanupContactRelationships
 */
exports.scheduledCleanupContactRelationships = functions.https.onRequest(async (req, res) => {
  try {
    console.log("SCHEDULED_CLEANUP: Starting automated 15-minute cleanup...");
    
    // Optional: Add basic authentication/verification here if needed
    // For now, anyone can trigger cleanup (which is fine for privacy compliance)
    
    const result = await cleanupExpiredContactRelationshipsInternal();
    console.log("SCHEDULED_CLEANUP: Completed -", result.message);
    
    res.status(200).json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("SCHEDULED_CLEANUP: Error during automated cleanup:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Check Active Calls to User
 * Check if there are active call sessions targeting a specific user
 * Used to detect active calls when user opens app directly
 */
exports.checkActiveCallsToUser = functions.https.onCall(async (data, context) => {
  try {
    // Get user ID from the correct location
    const userAuth = context.auth || data.auth;
    const userId = userAuth ? userAuth.uid : null;

    if (!userId) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to check active calls"
      );
    }

    const extractedData = {
      targetUserUID: data.targetUserUID || (data.data && data.data.targetUserUID),
      excludeCallerUID: data.excludeCallerUID || (data.data && data.data.excludeCallerUID),
    };
    
    const { targetUserUID, excludeCallerUID } = extractedData;

    if (!targetUserUID) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "targetUserUID is required"
      );
    }

    console.log("DEBUG: Checking active calls to user:", {
      targetUserUID: targetUserUID,
      excludeCallerUID: excludeCallerUID,
      requestingUser: userId,
    });

    // Find active call sessions where the target user is being called
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000); // 30 seconds (prevent stale calls)

    console.log("DEBUG: Searching for call sessions with criteria:", {
      status: "active",
      startTimeAfter: thirtySecondsAgo.toISOString(),
      targetUser: targetUserUID,
    });

    const activeCallsSnapshot = await admin.firestore()
      .collection("call_sessions")
      .where("status", "==", "active")
      .where("startTime", ">=", thirtySecondsAgo) // Only very recent calls
      .get();
      
    console.log("DEBUG: Found total active sessions:", activeCallsSnapshot.size);

    // Filter for calls where the target user is the recipient
    const activeCalls = [];
    
    activeCallsSnapshot.docs.forEach(doc => {
      const sessionData = doc.data();
      const roomName = sessionData.roomName;
      const sessionCaller = sessionData.userId;

      // CRITICAL: Skip sessions that have been ended (have endTime set)
      if (sessionData.endTime) {
        console.log("DEBUG: Skipping ended session (has endTime):", doc.id);
        return;
      }

      // Skip sessions younger than 2 seconds (likely still being created/ended)
      // Prevents ghost calls from appearing when cleanup is still running
      const sessionAge = Date.now() - sessionData.startTime.toDate().getTime();
      if (sessionAge < 2000) {
        console.log("DEBUG: Skipping very recent session (< 2s old):", doc.id);
        return;
      }

      console.log("DEBUG: Examining session:", {
        sessionId: doc.id,
        roomName: roomName,
        sessionCaller: (sessionCaller ? sessionCaller.substring(0, 8) + "..." : "unknown"),
        targetUser: (targetUserUID ? targetUserUID.substring(0, 8) + "..." : "unknown"),
        roomIncludesTarget: roomName ? roomName.includes(targetUserUID) : false,
        callerNotTarget: sessionCaller !== targetUserUID,
        status: sessionData.status,
        callType: sessionData.callType,
        hasEndTime: !!sessionData.endTime,
      });

      // Check if this session is calling the target user
      // Handle both full UIDs and shortened UIDs in room names
      const shortTargetUID = targetUserUID.substring(0, 8);
      const roomIncludesTarget = roomName && (roomName.includes(targetUserUID) || roomName.includes(shortTargetUID));
      
      if (roomIncludesTarget && sessionCaller !== targetUserUID) {
        
        console.log("DEBUG: Session matches target user - adding to active calls");
        
        // Exclude specific caller if requested
        if (!excludeCallerUID || sessionCaller !== excludeCallerUID) {
          activeCalls.push({
            sessionId: doc.id,
            callerUID: sessionCaller,
            roomName: roomName,
            callType: sessionData.callType || "direct",
            startTime: (sessionData.startTime && sessionData.startTime.toDate) 
              ? sessionData.startTime.toDate().toISOString() 
              : null,
          });
          console.log("DEBUG: Added active call from:", (sessionCaller ? sessionCaller.substring(0, 8) + "..." : "unknown"));
        } else {
          console.log("DEBUG: Excluded caller:", (sessionCaller ? sessionCaller.substring(0, 8) + "..." : "unknown"));
        }
      } else {
        console.log("DEBUG: Session does not match criteria");
      }
    });

    console.log("Found active calls to user:", {
      targetUserUID: targetUserUID,
      totalActiveCalls: activeCalls.length,
      callers: activeCalls.map(c => (c.callerUID ? c.callerUID.substring(0, 8) + "..." : "unknown")),
    });

    return {
      activeCalls: activeCalls,
      totalCalls: activeCalls.length,
      targetUserUID: targetUserUID,
      message: `Found ${activeCalls.length} active calls to user`,
    };

  } catch (error) {
    console.error("Error checking active calls to user:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to check active calls"
    );
  }
});

/**
 * Cleanup Expired Contact Relationships
 * HTTP function to remove expired mutual contact relationships
 * Can be called manually for testing
 */
exports.cleanupExpiredContactRelationships = functions.https.onCall(async () => {
  try {
    return await cleanupExpiredContactRelationshipsInternal();
  } catch (error) {
    console.error("Error cleaning up expired contact relationships:", error);
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to cleanup expired relationships"
    );
  }
});

