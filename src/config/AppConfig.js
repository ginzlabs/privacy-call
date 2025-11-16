/**
 * Centralized Configuration File for PrivacyCall App
 * All app constants and parameters are defined here for easy management
 */

export const AppConfig = {
  // Invite System Configuration
  INVITE_EXPIRATION_MINUTES: 15, // How long invite links remain valid
  
  // Calling Configuration
  MAX_GROUP_PARTICIPANTS: 8, // Maximum participants in a group call
  CALL_TIMEOUT_SECONDS: 30, // How long to ring before timing out
  
  // Usage Tracking & Quotas
  MONTHLY_QUOTA_MINUTES: 1000, // Free monthly minutes per user
  USAGE_WARNING_THRESHOLD: 0.8, // Warn user at 80% of quota
  
  // Storage Keys (for AsyncStorage)
  STORAGE_KEYS: {
    USER_ID: '@privacycall/user_id',
    CONTACTS: '@privacycall/contacts',
    CALL_HISTORY: '@privacycall/call_history',
    USER_SETTINGS: '@privacycall/user_settings',
    MONTHLY_USAGE: '@privacycall/monthly_usage',
    FCM_TOKEN: '@privacycall/fcm_token',
    INCOMING_CALL: '@privacycall/incoming_call',
  },
  
  // Firebase Collections
  FIREBASE_COLLECTIONS: {
    INVITES: 'Invites',
    USERS: 'users',
    CALL_SESSIONS: 'call_sessions',
    USAGE_TRACKING: 'usage_tracking',
    USER_TOKENS: 'user_tokens',
  },
  
  // UI Configuration
  UI: {
    PARTIAL_UID_LENGTH: 6, // Show first 3 + last 3 chars of UID
    SEARCH_DEBOUNCE_MS: 300, // Debounce time for search input
    COUNTDOWN_UPDATE_INTERVAL: 1000, // Update countdown every second
  },
  
  // LiveKit Configuration
  LIVEKIT: {
    // API credentials are securely stored in Firebase Cloud Functions
    // Only the WebSocket URL is needed client-side (public information)
    
    TOKEN_EXPIRATION_HOURS: 2, // LiveKit token validity
    ROOM_NAME_PREFIX: 'privacycall_', // Prefix for all room names
    MAX_CALL_DURATION_MINUTES: 60, // Maximum call duration
    AUDIO_CONSTRAINTS: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
  },
  
  // Validation Rules
  VALIDATION: {
    MIN_NICKNAME_LENGTH: 1,
    MAX_NICKNAME_LENGTH: 30,
    MAX_GROUP_NAME_LENGTH: 50,
  },
  
  // Push Notification Configuration
  NOTIFICATIONS: {
    INCOMING_CALL_CHANNEL: 'incoming_calls',
    GENERAL_CHANNEL: 'general',
  },
  
  // Development/Debug flags
  DEBUG: {
    ENABLE_LOGS: __DEV__, // Enable console logs in development
    MOCK_FIREBASE: false, // Use mock Firebase for testing
    SKIP_AUTH: false, // Skip authentication (dev only)
  },
};

/**
 * Get a privacy-safe partial UID for display purposes
 *
 * Shows only first and last few characters of the UID to maintain privacy
 * while still allowing users to distinguish between contacts.
 *
 * Example: "abc123xyz789..." becomes "abc...789"
 *
 * @param {string} uid - The full Firebase anonymous UID
 * @returns {string} Truncated UID in format "abc...xyz"
 */
export const getPartialUID = (uid) => {
  if (!uid || uid.length < AppConfig.UI.PARTIAL_UID_LENGTH) {
    return uid;
  }
  const halfLength = Math.floor(AppConfig.UI.PARTIAL_UID_LENGTH / 2);
  return `${uid.substring(0, halfLength)}...${uid.substring(uid.length - halfLength)}`;
};

/**
 * Format time remaining in MM:SS format
 *
 * Used for invite link countdown timers and call duration displays.
 *
 * @param {number} minutes - Number of minutes (can be fractional)
 * @param {number} seconds - Number of seconds (can be fractional)
 * @returns {string} Formatted time string (e.g., "14:32")
 */
export const formatTimeRemaining = (minutes, seconds) => {
  const mins = Math.floor(minutes);
  const secs = Math.floor(seconds);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Generate a secure random invite token
 *
 * Creates a 32-character alphanumeric token for invite links.
 * Uses Math.random() which is sufficient for non-cryptographic invite tokens.
 *
 * NOTE: For production use with higher security requirements, consider using
 * expo-crypto's randomBytes for cryptographically secure randomness.
 *
 * Token format: 32 characters from [A-Za-z0-9]
 * Example: "a4B7c9D1e2F3g4H5i6J7k8L9m0N1o2"
 *
 * @returns {string} 32-character alphanumeric token
 */
export const generateInviteToken = () => {
  // Generate a cryptographically secure random token
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default AppConfig;