import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppConfig } from '../config/AppConfig';

/**
 * Authentication Service
 * Handles Firebase Anonymous Authentication and user state management
 * Privacy-first: No personal data collection, only anonymous UIDs
 */

const FIRST_TIME_KEY = '@privacycall/first_time';

export const AuthService = {
  /**
   * Check if this is a first-time user
   */
  isFirstTimeUser: async () => {
    try {
      const firstTime = await AsyncStorage.getItem(FIRST_TIME_KEY);
      return firstTime === null;
    } catch (error) {
      console.error('Error checking first time user:', error);
      return true; // Default to first-time on error
    }
  },

  /**
   * Mark user as no longer first-time
   */
  markNotFirstTime: async () => {
    try {
      await AsyncStorage.setItem(FIRST_TIME_KEY, 'false');
    } catch (error) {
      console.error('Error marking not first time:', error);
    }
  },

  /**
   * Sign in anonymously
   * This creates a persistent anonymous user ID without collecting personal data
   */
  signInAnonymously: async () => {
    try {
      const userCredential = await auth().signInAnonymously();
      const user = userCredential.user;
      
      if (!user || !user.uid) {
        throw new Error('Failed to create anonymous user');
      }
      
      // Store user ID locally for quick access
      await AsyncStorage.setItem(AppConfig.STORAGE_KEYS.USER_ID, user.uid);
      
      // Mark as not first-time user
      await AuthService.markNotFirstTime();
      
      if (AppConfig.DEBUG.ENABLE_LOGS) {
        console.log('Anonymous sign-in successful:', user.uid);
      }
      
      return user;
    } catch (error) {
      console.error('Anonymous sign-in error:', error);
      
      // Provide user-friendly error messages
      if (error.code === 'auth/network-request-failed') {
        throw new Error('Network connection required. Please check your internet connection.');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Too many attempts. Please try again later.');
      } else {
        throw new Error('Authentication failed. Please try again.');
      }
    }
  },

  /**
   * Get current user
   */
  getCurrentUser: () => {
    return auth().currentUser;
  },

  /**
   * Get current user ID
   */
  getCurrentUserId: async () => {
    const user = auth().currentUser;
    if (user) {
      return user.uid;
    }
    
    // Try to get from local storage as fallback
    try {
      return await AsyncStorage.getItem(AppConfig.STORAGE_KEYS.USER_ID);
    } catch (error) {
      console.error('Error getting user ID from storage:', error);
      return null;
    }
  },

  /**
   * Delete account and all local data
   * This removes the anonymous account and clears all local storage
   */
  deleteAccount: async () => {
    try {
      const user = auth().currentUser;
      
      if (user) {
        // Delete the Firebase anonymous account
        await user.delete();
      }
      
      // Clear all local storage
      await AuthService.clearAllLocalData();
      
      if (AppConfig.DEBUG.ENABLE_LOGS) {
        console.log('Account deleted successfully');
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  },

  /**
   * Reset account (sign out and clear data, but don't delete Firebase account)
   */
  resetAccount: async () => {
    try {
      // Sign out
      await auth().signOut();
      
      // Clear all local storage
      await AuthService.clearAllLocalData();
      
      if (AppConfig.DEBUG.ENABLE_LOGS) {
        console.log('Account reset successfully');
      }
      
      return true;
    } catch (error) {
      console.error('Error resetting account:', error);
      throw error;
    }
  },

  /**
   * Clear all local data
   */
  clearAllLocalData: async () => {
    try {
      const keys = Object.values(AppConfig.STORAGE_KEYS);
      keys.push(FIRST_TIME_KEY); // Also clear first-time flag
      
      await AsyncStorage.multiRemove(keys);
      
      if (AppConfig.DEBUG.ENABLE_LOGS) {
        console.log('All local data cleared');
      }
    } catch (error) {
      console.error('Error clearing local data:', error);
      throw error;
    }
  },

  /**
   * Sign out current user
   */
  signOut: async () => {
    try {
      await auth().signOut();
      
      if (AppConfig.DEBUG.ENABLE_LOGS) {
        console.log('User signed out');
      }
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  },

  /**
   * Get authentication state observer
   */
  onAuthStateChanged: (callback) => {
    return auth().onAuthStateChanged(callback);
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated: () => {
    return auth().currentUser !== null;
  },

  /**
   * Get partial UID for display (privacy-friendly)
   */
  getPartialUID: () => {
    const user = auth().currentUser;
    if (!user) return null;
    
    const uid = user.uid;
    if (uid.length < 6) return uid;
    
    return `${uid.substring(0, 3)}...${uid.substring(uid.length - 3)}`;
  },

  /**
   * Get full UID (for verification purposes)
   */
  getFullUID: () => {
    const user = auth().currentUser;
    return user ? user.uid : null;
  },
};

export default AuthService;