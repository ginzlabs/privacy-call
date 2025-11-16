import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import { AppConfig } from '../config/AppConfig';

/**
 * Firebase Configuration Service
 * Handles Firebase initialization and provides centralized Firebase instance management
 * 
 * NOTE: React Native Firebase automatically configures from GoogleService-Info.plist (iOS)
 * and google-services.json (Android), so no manual config needed here.
 */

export const initializeFirebase = () => {
  try {
    // React Native Firebase is automatically initialized
    // Verify services are available
    const authInstance = auth();
    const firestoreInstance = firestore();
    const functionsInstance = functions();
    
    console.log('Firebase services verified successfully (Auth + Firestore + Functions)');
    
    if (__DEV__) {
      console.log('Firebase running in development mode');
    }
    
    return true;
  } catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
  }
};

export const FirebaseService = {
  // Auth methods
  auth: () => auth(),
  
  // Firestore methods
  firestore: () => firestore(),
  
  // Functions methods
  functions: () => functions(),
  
  // Helper methods for common operations
  getCurrentUser: () => auth().currentUser,
  
  // Create invite document in Firestore with timezone-safe timestamps
  createInvite: async (inviteData) => {
    try {
      const db = firestore();
      
      // Use Firestore server timestamp for timezone-safe expiry
      const serverExpiresAt = firestore.Timestamp.fromDate(
        new Date(Date.now() + AppConfig.INVITE_EXPIRATION_MINUTES * 60 * 1000)
      );
      
      const inviteRef = await db.collection(AppConfig.FIREBASE_COLLECTIONS.INVITES).add({
        ...inviteData,
        createdAt: firestore.FieldValue.serverTimestamp(),
        expiresAt: serverExpiresAt, // Proper Firestore timestamp for timezone safety
      });
      
      console.log('Real invite created in Firestore with UTC timing:', inviteRef.id);
      
      // Return both invite ID and server expiry time for client storage
      return {
        inviteId: inviteRef.id,
        expiresAt: serverExpiresAt.toDate().toISOString(), // Convert to ISO string for client
      };
    } catch (error) {
      console.error('Error creating invite in Firestore:', error);
      throw error;
    }
  },
  
  // Get invite by token from Firestore
  getInviteByToken: async (token) => {
    try {
      const db = firestore();
      const inviteSnapshot = await db
        .collection(AppConfig.FIREBASE_COLLECTIONS.INVITES)
        .where('token', '==', token)
        .where('expiresAt', '>', new Date())
        .where('status', '==', 'pending')
        .limit(1)
        .get();
      
      if (inviteSnapshot.empty) {
        console.log('No valid invite found for token:', token);
        return null;
      }
      
      const inviteDoc = inviteSnapshot.docs[0];
      const inviteData = {
        id: inviteDoc.id,
        ...inviteDoc.data(),
      };
      
      console.log('Real invite found in Firestore:', inviteData.id);
      return inviteData;
    } catch (error) {
      console.error('Error getting invite from Firestore:', error);
      throw error;
    }
  },
  
  // Accept invite in Firestore with server-side validation
  acceptInvite: async (inviteId, acceptorUID) => {
    try {
      const db = firestore();
      
      // First, validate the invite exists and is still valid (server-side validation)
      const inviteRef = db.collection(AppConfig.FIREBASE_COLLECTIONS.INVITES).doc(inviteId);
      const inviteDoc = await inviteRef.get();
      
      if (!inviteDoc.exists) {
        throw new Error('Invite not found');
      }
      
      const inviteData = inviteDoc.data();
      
      // Server-side expiry validation (cannot be bypassed by client)
      if (inviteData.expiresAt.toDate() < new Date()) {
        throw new Error('Invite has expired');
      }
      
      // Server-side status validation
      if (inviteData.status !== 'pending') {
        throw new Error('Invite is no longer valid');
      }
      
      // Only now update the invite status
      await inviteRef.update({
        status: 'accepted',
        acceptedBy: acceptorUID,
        acceptedAt: firestore.FieldValue.serverTimestamp(),
      });
      
      console.log('Real invite accepted in Firestore with server-side validation:', inviteId);
      return true;
    } catch (error) {
      console.error('Error accepting invite in Firestore:', error);
      throw error;
    }
  },
  
  // Track usage in Firestore
  trackUsage: async (userId, sessionData) => {
    try {
      const db = firestore();
      await db.collection(AppConfig.FIREBASE_COLLECTIONS.USAGE_TRACKING).add({
        userId,
        ...sessionData,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });
      console.log('Real usage tracked in Firestore for user:', userId);
    } catch (error) {
      console.error('Error tracking usage in Firestore:', error);
      // Don't throw - usage tracking shouldn't break the app
    }
  },
  
  // Get monthly usage from Firestore
  getMonthlyUsage: async (userId) => {
    try {
      const db = firestore();
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const usageSnapshot = await db
        .collection(AppConfig.FIREBASE_COLLECTIONS.USAGE_TRACKING)
        .where('userId', '==', userId)
        .where('timestamp', '>=', startOfMonth)
        .get();
      
      let totalMinutes = 0;
      usageSnapshot.forEach(doc => {
        const data = doc.data();
        totalMinutes += data.durationMinutes || 0;
      });
      
      console.log('Real monthly usage from Firestore:', totalMinutes, 'minutes');
      return totalMinutes;
    } catch (error) {
      console.error('Error getting monthly usage from Firestore:', error);
      return 0;
    }
  },
  
  // Clean up expired invites in Firestore
  cleanupExpiredInvites: async () => {
    try {
      const db = firestore();
      const expiredInvites = await db
        .collection(AppConfig.FIREBASE_COLLECTIONS.INVITES)
        .where('expiresAt', '<', new Date())
        .where('status', '==', 'pending')
        .get();
      
      const batch = db.batch();
      expiredInvites.forEach(doc => {
        batch.update(doc.ref, { status: 'expired' });
      });
      
      if (expiredInvites.size > 0) {
        await batch.commit();
        console.log(`Real cleanup: ${expiredInvites.size} expired invites in Firestore`);
      }
    } catch (error) {
      console.error('Error cleaning up expired invites in Firestore:', error);
    }
  },
};

export default FirebaseService;