import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import { AppConfig, generateInviteToken } from '../config/AppConfig';
import { FirebaseService } from './FirebaseService';
import { AuthService } from './AuthService';
import { validateContact, validateGroup, validateHistoryEntry, sanitizeNickname, sanitizeGroupName } from '../utils/validation';

/**
 * Real Contacts Service
 * Handles all contact-related operations using AsyncStorage for local storage
 * and Firebase for invite system
 */

export const ContactsService = {
  /**
   * Get all contacts from AsyncStorage
   */
  getContacts: async () => {
    try {
      const contactsJson = await AsyncStorage.getItem(AppConfig.STORAGE_KEYS.CONTACTS);
      const contacts = contactsJson ? JSON.parse(contactsJson) : [];
      
      return contacts;
    } catch (error) {
      console.error('Error getting contacts from AsyncStorage:', error);
      return [];
    }
  },

  /**
   * Save contacts to AsyncStorage
   */
  saveContacts: async (contacts) => {
    try {
      await AsyncStorage.setItem(AppConfig.STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
      console.log('Saved contacts to AsyncStorage:', contacts.length);
    } catch (error) {
      console.error('Error saving contacts to AsyncStorage:', error);
      throw error;
    }
  },

  /**
   * Add a new contact (with real validation)
   */
  addContact: async (nickname, uid, isNewInvite = false) => {
    try {
      const contacts = await ContactsService.getContacts();
      
      // Sanitize and validate inputs - auto-generate nickname if not provided
      let sanitizedNickname = sanitizeNickname(nickname);
      if (!sanitizedNickname) {
        // Auto-generate privacy-focused nickname based on UID
        sanitizedNickname = `Contact ${uid.substring(0, 3)}...${uid.substring(uid.length - 3)}`;
        console.log('Auto-generated nickname for privacy:', sanitizedNickname);
      }
      
      if (!uid || typeof uid !== 'string') {
        throw new Error('Valid user ID is required');
      }
      
      // If this is a new invite acceptance, clear from blacklist
      if (isNewInvite) {
        console.log('New invite acceptance - clearing from blacklist if present');
        await ContactsService.removeFromBlacklist(uid);
      }
      
      // Check if contact already exists
      const existingContact = contacts.find(c => c.uid === uid);
      if (existingContact) {
        throw new Error('Contact already exists');
      }

      const newContact = {
        id: `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        nickname: sanitizedNickname,
        uid,
        addedAt: new Date().toISOString(),
      };

      // Validate the complete contact object
      const validatedContact = validateContact(newContact);
      
      const updatedContacts = [...contacts, validatedContact];
      await ContactsService.saveContacts(updatedContacts);

      // Log contact addition to history
      const historyEntry = {
        type: 'contact_added',
        contactNickname: sanitizedNickname,
        timestamp: new Date().toISOString(),
      };
      
      const validatedHistoryEntry = validateHistoryEntry(historyEntry);
      await ContactsService.addHistoryEntry(validatedHistoryEntry);

      console.log('Added real contact:', validatedContact.nickname);
      return validatedContact;
    } catch (error) {
      console.error('Error adding contact:', error);
      throw error;
    }
  },

  /**
   * Update contact nickname
   */
  updateContactNickname: async (contactId, newNickname) => {
    try {
      const sanitizedNickname = sanitizeNickname(newNickname);
      if (!sanitizedNickname) {
        throw new Error('Nickname is required');
      }

      const contacts = await ContactsService.getContacts();
      const contactIndex = contacts.findIndex(c => c.id === contactId);
      
      if (contactIndex === -1) {
        throw new Error('Contact not found');
      }

      const oldNickname = contacts[contactIndex].nickname;
      contacts[contactIndex].nickname = sanitizedNickname;
      contacts[contactIndex].updatedAt = new Date().toISOString();

      await ContactsService.saveContacts(contacts);

      // Log nickname change to history
      const historyEntry = {
        type: 'contact_updated',
        contactNickname: `${oldNickname} → ${sanitizedNickname}`,
        timestamp: new Date().toISOString(),
      };
      
      const validatedHistoryEntry = validateHistoryEntry(historyEntry);
      await ContactsService.addHistoryEntry(validatedHistoryEntry);

      console.log('Updated contact nickname:', oldNickname, '→', sanitizedNickname);
      return contacts[contactIndex];
    } catch (error) {
      console.error('Error updating contact nickname:', error);
      throw error;
    }
  },

  /**
   * Remove a contact
   */
  removeContact: async (contactId) => {
    try {
      const contacts = await ContactsService.getContacts();
      const contactIndex = contacts.findIndex(c => c.id === contactId);
      
      if (contactIndex === -1) {
        throw new Error('Contact not found');
      }

      const removedContact = contacts[contactIndex];
      const updatedContacts = contacts.filter(c => c.id !== contactId);
      await ContactsService.saveContacts(updatedContacts);

      // Delete contact_relationship on server to prevent re-sync on reinstall
      try {
        const currentUserId = await AuthService.getCurrentUserId();
        const db = FirebaseService.firestore();

        // Find and delete the contact_relationship
        const relationships1 = await db
          .collection('contact_relationships')
          .where('user1', '==', currentUserId)
          .where('user2', '==', removedContact.uid)
          .get();

        const relationships2 = await db
          .collection('contact_relationships')
          .where('user1', '==', removedContact.uid)
          .where('user2', '==', currentUserId)
          .get();

        const batch = db.batch();
        let deletedCount = 0;

        relationships1.docs.forEach(doc => {
          batch.delete(doc.ref);
          deletedCount++;
        });

        relationships2.docs.forEach(doc => {
          batch.delete(doc.ref);
          deletedCount++;
        });

        if (deletedCount > 0) {
          await batch.commit();
          console.log('CONTACT_DELETE: Deleted', deletedCount, 'contact_relationships from server');
        }

        // Send mutual deletion request so other user gets notified
        await db.collection('contact_deletion_requests').add({
          fromUserId: currentUserId,
          toUserId: removedContact.uid,
          createdAt: firestore.FieldValue.serverTimestamp(),
          processed: false,
        });

        console.log('MUTUAL_DELETE: Sent deletion request to:', removedContact.uid.substring(0, 8) + '...');
      } catch (serverError) {
        console.error('MUTUAL_DELETE: Error with server deletion:', serverError);
        // Continue with local deletion even if server operations fail
      }

      // Remove contact from all groups
      const groups = await ContactsService.getGroups();
      let groupsModified = false;
      const affectedGroups = [];

      const updatedGroups = groups.map(group => {
        const originalMemberCount = group.members.length;
        const updatedMembers = group.members.filter(member => member.uid !== removedContact.uid);

        if (updatedMembers.length < originalMemberCount) {
          console.log('CONTACT_DELETE: Removed from group:', group.name);
          affectedGroups.push(group.name);
          groupsModified = true;
          return { ...group, members: updatedMembers };
        }
        return group;
      });

      if (groupsModified) {
        // Remove groups with less than 2 members
        const validGroups = updatedGroups.filter(g => g.members.length >= 2);
        await AsyncStorage.setItem('@privacycall/groups', JSON.stringify(validGroups));
        console.log('CONTACT_DELETE: Updated groups, removed from', affectedGroups.length, 'groups');

        // Log affected groups
        if (affectedGroups.length > 0) {
          console.log('CONTACT_DELETE: Affected groups:', affectedGroups);
        }
      }

      // If contact was added recently (within 15 minutes), add to sync blacklist
      const contactAge = Date.now() - new Date(removedContact.addedAt).getTime();
      const fifteenMinutes = 15 * 60 * 1000;

      if (contactAge < fifteenMinutes) {
        console.log('Contact deleted within 15-minute server window - adding to sync blacklist');
        await ContactsService.addToSyncBlacklist(removedContact.uid);
      }

      // Log contact removal to history
      const historyEntry = {
        type: 'contact_removed',
        contactNickname: removedContact.nickname,
        timestamp: new Date().toISOString(),
      };
      
      const validatedHistoryEntry = validateHistoryEntry(historyEntry);
      await ContactsService.addHistoryEntry(validatedHistoryEntry);

      console.log('Removed contact:', removedContact.nickname);
      return true;
    } catch (error) {
      console.error('Error removing contact:', error);
      throw error;
    }
  },

  /**
   * Create an invite (OPTIMISTIC - shows immediately in UI)
   */
  createInvite: async () => {
    try {
      const currentUserId = await AuthService.getCurrentUserId();
      if (!currentUserId) {
        throw new Error('User not authenticated');
      }

      const token = generateInviteToken();
      const tempInviteId = `temp_invite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const tempExpiresAt = new Date(Date.now() + AppConfig.INVITE_EXPIRATION_MINUTES * 60 * 1000).toISOString();

      // OPTIMISTIC: Create local invite immediately for instant UI update
      const optimisticInvite = {
        id: tempInviteId,
        token,
        createdAt: new Date().toISOString(),
        expiresAt: tempExpiresAt,
        status: 'pending',
        isOptimistic: true, // Flag to indicate this is temporary
      };

      console.log('OPTIMISTIC: Creating invite locally first for instant UI');
      await ContactsService.storePendingInvite(optimisticInvite);

      // Generate invite link immediately
      const inviteLink = `https://privacycall.app/invite/${token}`;

      // BACKGROUND: Create invite on server (don't await - let it happen in background)
      const inviteData = {
        token,
        createdBy: currentUserId,
        status: 'pending',
      };

      // Start server creation in background
      FirebaseService.createInvite(inviteData)
        .then(async (inviteResult) => {
          // Handle both old format (string) and new format (object)
          const serverInviteId = typeof inviteResult === 'string' ? inviteResult : inviteResult.inviteId;
          const serverExpiresAt = typeof inviteResult === 'object' ? inviteResult.expiresAt : tempExpiresAt;

          console.log('BACKGROUND: Server created invite, updating local invite with real ID');

          // Replace temporary invite with server invite
          const invites = await ContactsService.getPendingInvitesRaw(); // Use raw getter to avoid server checks
          const updatedInvites = invites.map(inv =>
            inv.id === tempInviteId
              ? { ...inv, id: serverInviteId, expiresAt: serverExpiresAt, isOptimistic: false }
              : inv
          );
          await AsyncStorage.setItem('@privacycall/pending_invites', JSON.stringify(updatedInvites));

          // Log invite creation to history with real ID
          const historyEntry = {
            type: 'invite_created',
            timestamp: new Date().toISOString(),
            inviteId: serverInviteId,
          };
          const validatedHistoryEntry = validateHistoryEntry(historyEntry);
          await ContactsService.addHistoryEntry(validatedHistoryEntry);

          console.log('BACKGROUND: Invite fully synced with server:', serverInviteId);
        })
        .catch((error) => {
          console.error('BACKGROUND: Error creating invite on server:', error);
          // Remove optimistic invite if server creation failed
          ContactsService.getPendingInvitesRaw().then(async (invites) => {
            const updatedInvites = invites.filter(inv => inv.id !== tempInviteId);
            await AsyncStorage.setItem('@privacycall/pending_invites', JSON.stringify(updatedInvites));
            console.log('BACKGROUND: Removed failed optimistic invite');
          });
        });

      // Return optimistic invite immediately
      return {
        invite: optimisticInvite,
        inviteLink,
      };
    } catch (error) {
      console.error('Error creating optimistic invite:', error);
      throw error;
    }
  },

  /**
   * Accept an invite (real Firebase implementation)
   */
  acceptInvite: async (token) => {
    try {
      const currentUserId = await AuthService.getCurrentUserId();
      if (!currentUserId) {
        throw new Error('User not authenticated');
      }

      // Get invite from Firebase
      const invite = await FirebaseService.getInviteByToken(token);
      if (!invite) {
        throw new Error('Invalid or expired invite');
      }

      if (invite.createdBy === currentUserId) {
        throw new Error('Cannot accept your own invite');
      }

      // Accept the invite in Firebase
      await FirebaseService.acceptInvite(invite.id, currentUserId);

      // Add the contact locally
      await ContactsService.addContact(invite.createdByNickname, invite.createdBy);

      console.log('Accepted real invite:', invite.id);
      return true;
    } catch (error) {
      console.error('Error accepting real invite:', error);
      throw error;
    }
  },

  /**
   * Store pending invite locally
   */
  storePendingInvite: async (invite) => {
    try {
      const invites = await ContactsService.getPendingInvitesRaw(); // Use raw to avoid server checks during creation
      const updatedInvites = [...invites, invite];
      await AsyncStorage.setItem('@privacycall/pending_invites', JSON.stringify(updatedInvites));
      console.log('Stored pending invite locally:', invite.id);
    } catch (error) {
      console.error('Error storing pending invite:', error);
      throw error;
    }
  },

  /**
   * Get pending invites from AsyncStorage WITHOUT server checks (for internal use)
   */
  getPendingInvitesRaw: async () => {
    try {
      const invitesJson = await AsyncStorage.getItem('@privacycall/pending_invites');
      const invites = invitesJson ? JSON.parse(invitesJson) : [];
      return invites;
    } catch (error) {
      console.error('Error getting raw pending invites:', error);
      return [];
    }
  },

  /**
   * Get pending invites from AsyncStorage with real-time server status sync
   * Respects local deletion blacklist for optimistic deletions
   * skipServerCheck parameter for fast initial loads (relies on Firestore listener for updates)
   */
  getPendingInvites: async (skipServerCheck = false) => {
    try {
      const invitesJson = await AsyncStorage.getItem('@privacycall/pending_invites');
      const invites = invitesJson ? JSON.parse(invitesJson) : [];

      // Get deletion blacklist
      const deletionBlacklist = await ContactsService.getInviteDeletionBlacklist();

      // Check server status for each invite and update accordingly
      const now = new Date();
      const validInvites = [];

      for (const invite of invites) {
        // CRITICAL: Skip if in deletion blacklist (optimistically deleted)
        if (deletionBlacklist[invite.id]) {
          console.log('OPTIMISTIC: Skipping deleted invite from blacklist:', invite.id);
          continue;
        }

        // Skip expired invites
        if (new Date(invite.expiresAt) <= now) {
          console.log('Removing expired invite:', invite.id);
          continue;
        }

        // Skip optimistic invites that are still being created (don't check server yet)
        if (invite.isOptimistic) {
          console.log('OPTIMISTIC: Keeping optimistic invite without server check:', invite.id);
          validInvites.push(invite);
          continue;
        }

        // Skip server checks if requested (for fast initial load)
        // Firestore listener will handle real-time updates
        if (skipServerCheck) {
          validInvites.push(invite);
          continue;
        }

        // Check server status for non-expired invites
        try {
          const serverStatus = await ContactsService.checkInviteServerStatus(invite.id);

          if (serverStatus === 'accepted') {
            console.log('Invite accepted on server - removing from pending list:', invite.id);
            continue; // Don't include in validInvites (remove from list)
          } else if (serverStatus === 'pending') {
            validInvites.push(invite); // Keep in pending list
          }
          // If status is 'expired' or unknown, remove from list
        } catch (error) {
          console.warn('Could not check server status for invite:', invite.id);
          validInvites.push(invite); // Keep invite if server check fails
        }
      }

      // Update storage with synced invites
      if (validInvites.length !== invites.length) {
        await AsyncStorage.setItem('@privacycall/pending_invites', JSON.stringify(validInvites));
        console.log('Synced invite status - removed', invites.length - validInvites.length, 'processed invites');

        // If invites were processed (accepted/expired), trigger mutual contact sync
        console.log('Invite status changed - triggering mutual contact sync');
        const newContactsAdded = await ContactsService.syncMutualContacts();

        // Store flag to indicate contacts list should be refreshed
        if (newContactsAdded > 0) {
          await AsyncStorage.setItem('@privacycall/contacts_need_refresh', 'true');
          console.log('New contacts added via invite sync - flagged for refresh');
        }
      }

      return validInvites;
    } catch (error) {
      console.error('Error getting pending invites:', error);
      return [];
    }
  },

  /**
   * Check invite status on server
   */
  checkInviteServerStatus: async (inviteId) => {
    try {
      const db = FirebaseService.firestore();
      const inviteDoc = await db.collection('Invites').doc(inviteId).get();
      
      if (!inviteDoc.exists) {
        console.log('Invite not found on server:', inviteId);
        return 'expired';
      }
      
      const inviteData = inviteDoc.data();
      const serverStatus = inviteData.status;
      
      console.log('Server invite status for', inviteId, ':', serverStatus);
      return serverStatus; // 'pending', 'accepted', or 'expired'
    } catch (error) {
      console.error('Error checking invite server status:', error);
      throw error;
    }
  },

  /**
   * Delete a pending invite (OPTIMISTIC - removes immediately from UI)
   */
  deleteInvite: async (inviteId) => {
    try {
      console.log('OPTIMISTIC: Deleting invite immediately from UI:', inviteId);

      // OPTIMISTIC: Remove from local storage immediately
      const invites = await ContactsService.getPendingInvitesRaw();
      const updatedInvites = invites.filter(invite => invite.id !== inviteId);
      await AsyncStorage.setItem('@privacycall/pending_invites', JSON.stringify(updatedInvites));

      // OPTIMISTIC: Add to deletion blacklist (lasts 10 minutes)
      await ContactsService.addToInviteDeletionBlacklist(inviteId);

      // Log invite deletion to history immediately
      const historyEntry = {
        type: 'invite_deleted',
        timestamp: new Date().toISOString(),
      };

      const validatedHistoryEntry = validateHistoryEntry(historyEntry);
      await ContactsService.addHistoryEntry(validatedHistoryEntry);

      console.log('OPTIMISTIC: Invite removed from UI immediately');

      // BACKGROUND: Delete from server (don't await - let it happen in background)
      // Note: If invite hasn't been created on server yet (still optimistic), this will fail silently
      FirebaseService.firestore()
        .collection('Invites')
        .doc(inviteId)
        .delete()
        .then(() => {
          console.log('BACKGROUND: Invite deleted from server:', inviteId);
        })
        .catch((error) => {
          console.log('BACKGROUND: Could not delete invite from server (may be optimistic/temp):', error.message);
          // This is expected for optimistic invites that haven't synced yet
        });

      return true;
    } catch (error) {
      console.error('Error deleting invite optimistically:', error);
      throw error;
    }
  },

  /**
   * Get groups from AsyncStorage
   */
  getGroups: async () => {
    try {
      const groupsJson = await AsyncStorage.getItem('@privacycall/groups');
      const groups = groupsJson ? JSON.parse(groupsJson) : [];
      
      return groups;
    } catch (error) {
      console.error('Error getting groups:', error);
      return [];
    }
  },

  /**
   * Create a group
   */
  createGroup: async (name, memberIds) => {
    try {
      const sanitizedName = sanitizeGroupName(name);
      if (!sanitizedName) {
        throw new Error('Group name is required');
      }

      const groups = await ContactsService.getGroups();
      const contacts = await ContactsService.getContacts();

      // Validate member IDs
      const validMembers = contacts.filter(contact => memberIds.includes(contact.id));
      if (validMembers.length !== memberIds.length) {
        throw new Error('One or more selected contacts not found');
      }

      if (validMembers.length > AppConfig.MAX_GROUP_PARTICIPANTS) {
        throw new Error(`Groups cannot have more than ${AppConfig.MAX_GROUP_PARTICIPANTS} members`);
      }

      const newGroup = {
        id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: sanitizedName,
        members: validMembers.map(contact => ({
          id: contact.id,
          nickname: contact.nickname,
          uid: contact.uid,
        })),
        createdAt: new Date().toISOString(),
      };

      // Validate the complete group object
      const validatedGroup = validateGroup(newGroup);

      const updatedGroups = [...groups, validatedGroup];
      await AsyncStorage.setItem('@privacycall/groups', JSON.stringify(updatedGroups));

      // Log group creation to history
      const historyEntry = {
        type: 'group_created',
        groupName: sanitizedName,
        memberCount: validMembers.length,
        timestamp: new Date().toISOString(),
      };
      
      const validatedHistoryEntry = validateHistoryEntry(historyEntry);
      await ContactsService.addHistoryEntry(validatedHistoryEntry);

      console.log('Created real group:', validatedGroup.name, 'with', validMembers.length, 'members');
      return validatedGroup;
    } catch (error) {
      console.error('Error creating group:', error);
      throw error;
    }
  },

  /**
   * Update group name
   */
  updateGroupName: async (groupId, newName) => {
    try {
      const sanitizedName = sanitizeGroupName(newName);
      if (!sanitizedName) {
        throw new Error('Group name is required');
      }

      const groups = await ContactsService.getGroups();
      const groupIndex = groups.findIndex(g => g.id === groupId);

      if (groupIndex === -1) {
        throw new Error('Group not found');
      }

      const oldName = groups[groupIndex].name;
      groups[groupIndex].name = sanitizedName;
      groups[groupIndex].updatedAt = new Date().toISOString();

      await AsyncStorage.setItem('@privacycall/groups', JSON.stringify(groups));

      console.log('Updated group name:', oldName, '→', sanitizedName);
      return groups[groupIndex];
    } catch (error) {
      console.error('Error updating group name:', error);
      throw error;
    }
  },

  /**
   * Remove a group
   */
  removeGroup: async (groupId) => {
    try {
      const groups = await ContactsService.getGroups();
      const groupIndex = groups.findIndex(g => g.id === groupId);

      if (groupIndex === -1) {
        throw new Error('Group not found');
      }

      const removedGroup = groups[groupIndex];
      const updatedGroups = groups.filter(g => g.id !== groupId);
      await AsyncStorage.setItem('@privacycall/groups', JSON.stringify(updatedGroups));

      console.log('Removed group:', removedGroup.name);
      return true;
    } catch (error) {
      console.error('Error removing group:', error);
      throw error;
    }
  },

  /**
   * Add entry to call history
   */
  addHistoryEntry: async (entry) => {
    try {
      // Validate the history entry
      const validatedEntry = validateHistoryEntry(entry);
      
      const historyJson = await AsyncStorage.getItem(AppConfig.STORAGE_KEYS.CALL_HISTORY);
      const history = historyJson ? JSON.parse(historyJson) : [];
      
      const updatedHistory = [validatedEntry, ...history].slice(0, 1000); // Keep last 1000 entries
      await AsyncStorage.setItem(AppConfig.STORAGE_KEYS.CALL_HISTORY, JSON.stringify(updatedHistory));
      
      console.log('Added history entry:', entry.type);
    } catch (error) {
      console.error('Error adding history entry:', error);
    }
  },

  /**
   * Get call history from AsyncStorage and sync with server history
   */
  getHistory: async () => {
    try {
      // First, sync with server-side history for missed notifications
      await ContactsService.syncServerHistory();
      
      const historyJson = await AsyncStorage.getItem(AppConfig.STORAGE_KEYS.CALL_HISTORY);
      const history = historyJson ? JSON.parse(historyJson) : [];
      
      return history;
    } catch (error) {
      console.error('Error getting history:', error);
      return [];
    }
  },

  /**
   * Sync server-side history to local storage (for missed notifications)
   */
  syncServerHistory: async () => {
    try {
      const currentUserId = await AuthService.getCurrentUserId();
      if (!currentUserId) {
        return;
      }

      console.log('📝 SERVER_SYNC: Syncing server history for missed notifications');

      // Get server-side history entries
      const serverHistorySnapshot = await FirebaseService.firestore()
        .collection('user_history')
        .doc(currentUserId)
        .collection('entries')
        .orderBy('timestamp', 'desc')
        .limit(50) // Get recent entries
        .get();

      if (serverHistorySnapshot.empty) {
        console.log('📝 SERVER_SYNC: No server history found');
        return;
      }

      // Get current local history
      const localHistoryJson = await AsyncStorage.getItem(AppConfig.STORAGE_KEYS.CALL_HISTORY);
      const localHistory = localHistoryJson ? JSON.parse(localHistoryJson) : [];

      let newEntriesAdded = 0;

      // Add server entries that aren't in local history
      serverHistorySnapshot.docs.forEach(doc => {
        const serverEntry = doc.data();
        
        // Check if this entry is already in local history
        const isDuplicate = localHistory.some(localEntry => 
          localEntry.callerUID === serverEntry.callerUID &&
          localEntry.type === serverEntry.type &&
          Math.abs(new Date(localEntry.timestamp).getTime() - new Date(serverEntry.timestamp).getTime()) < 30000
        );

        if (!isDuplicate) {
          localHistory.unshift(serverEntry); // Add to beginning
          newEntriesAdded++;
          console.log('📝 SERVER_SYNC: Added missed notification:', serverEntry.type, 'from', serverEntry.callerUID?.substring(0, 8) + '...');
        }
      });

      if (newEntriesAdded > 0) {
        // Sort by timestamp and keep last 1000 entries
        const sortedHistory = localHistory
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 1000);

        await AsyncStorage.setItem(AppConfig.STORAGE_KEYS.CALL_HISTORY, JSON.stringify(sortedHistory));
        console.log('📝 SERVER_SYNC: Added', newEntriesAdded, 'missed notification entries to local history');
      } else {
        console.log('📝 SERVER_SYNC: All server history already in local storage');
      }
      
      // CRITICAL: Always delete ALL server history entries after sync for privacy compliance
      if (!serverHistorySnapshot.empty) {
        try {
          console.log('🗑️ PRIVACY_DELETE: Deleting user history entries from server for privacy');
          
          const batch = FirebaseService.firestore().batch();
          serverHistorySnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          await batch.commit();
          console.log('🗑️ PRIVACY_DELETE: Successfully deleted', serverHistorySnapshot.docs.length, 'user history entries from server');
        } catch (deleteError) {
          console.error('🗑️ PRIVACY_DELETE: Error deleting server history:', deleteError);
          // Don't throw - sync succeeded, deletion failure shouldn't block user
        }
      }

    } catch (error) {
      console.error('📝 SERVER_SYNC: Error syncing server history:', error);
    }
  },

  /**
   * Clear all contacts and groups (for account reset)
   */
  clearAllData: async () => {
    try {
      await AsyncStorage.multiRemove([
        AppConfig.STORAGE_KEYS.CONTACTS,
        '@privacycall/groups',
        '@privacycall/pending_invites',
        AppConfig.STORAGE_KEYS.CALL_HISTORY,
      ]);
      
      console.log('Cleared all contact data from AsyncStorage');
    } catch (error) {
      console.error('Error clearing contacts data:', error);
      throw error;
    }
  },

  /**
   * Sync contacts from Firestore mutual relationships (with 15-minute expiry)
   * Call this periodically to get contacts from accepted invites
   */
  syncMutualContacts: async () => {
    try {
      const currentUserId = await AuthService.getCurrentUserId();
      if (!currentUserId) {
        console.warn('No authenticated user to sync contacts');
        return;
      }

      // CRITICAL: Trigger cleanup of expired relationships before syncing
      try {
        console.log('PRIVACY_CLEANUP: Triggering cleanup before contact sync');
        const cleanupFunction = FirebaseService.functions().httpsCallable('cleanupExpiredContactRelationships');
        const cleanupResult = await cleanupFunction();
        console.log('PRIVACY_CLEANUP: Cleanup result:', cleanupResult.data);
      } catch (cleanupError) {
        console.error('PRIVACY_CLEANUP: Error during cleanup:', cleanupError);
        // Continue with sync even if cleanup fails
      }

      // Get contact relationships where current user is either user1 or user2
      // Only get non-expired relationships
      const db = FirebaseService.firestore();
      const now = new Date();
      
      const relationships1 = await db
        .collection('contact_relationships')
        .where('user1', '==', currentUserId)
        .where('expiresAt', '>', now)
        .get();
        
      const relationships2 = await db
        .collection('contact_relationships')
        .where('user2', '==', currentUserId)
        .where('expiresAt', '>', now)
        .get();

      // Get current local contacts to avoid duplicates
      const existingContacts = await ContactsService.getContacts();
      const existingUIDs = new Set(existingContacts.map(c => c.uid));

      let newContactsAdded = 0;

      // Process relationships where current user is user1 (they created the invite)
      for (const doc of relationships1.docs) {
        const data = doc.data();
        const otherUserUID = data.user2;
        const relationshipCreatedAt = data.createdAt.toDate();
        
        // Check if this is a fresh relationship (created in last 30 seconds)
        const relationshipAge = Date.now() - relationshipCreatedAt.getTime();
        const isFreshRelationship = relationshipAge < (30 * 1000); // 30 seconds only
        
        // Check if contact exists and is not blacklisted from sync
        const isBlacklisted = await ContactsService.isBlacklisted(otherUserUID);
        
        if (!existingUIDs.has(otherUserUID)) {
          if (isFreshRelationship && isBlacklisted) {
            // Check if relationship was created AFTER the contact was deleted
            const blacklistJson = await AsyncStorage.getItem('@privacycall/sync_blacklist');
            const blacklist = blacklistJson ? JSON.parse(blacklistJson) : {};
            const blacklistEntry = blacklist[otherUserUID];
            const deletedAt = blacklistEntry?.deletedAt || 0;
            
            if (relationshipCreatedAt.getTime() > deletedAt) {
              console.log('Fresh relationship AFTER deletion - clearing blacklist and adding contact:', otherUserUID);
              await ContactsService.removeFromBlacklist(otherUserUID);
              await ContactsService.addContact(null, otherUserUID);
              newContactsAdded++;

              // Report to server that we synced this contact
              try {
                const reportSyncFunction = FirebaseService.functions().httpsCallable('reportContactSynced');
                const result = await reportSyncFunction({ otherUserId: otherUserUID });
                console.log('SYNC_REPORT: Reported sync to server:', result.data.message);
              } catch (syncError) {
                console.error('SYNC_REPORT: Error reporting sync:', syncError);
              }
            } else {
              console.log('Relationship predates deletion - keeping blacklist:', otherUserUID);
            }
          } else if (!isBlacklisted) {
            // No nickname transmitted - will auto-generate privacy-focused nickname
            await ContactsService.addContact(null, otherUserUID);
            newContactsAdded++;
            console.log('Added mutual contact (as inviter) with auto-generated nickname');

            // Report to server that we synced this contact
            try {
              const reportSyncFunction = FirebaseService.functions().httpsCallable('reportContactSynced');
              const result = await reportSyncFunction({ otherUserId: otherUserUID });
              console.log('SYNC_REPORT: Reported sync to server:', result.data.message);
            } catch (syncError) {
              console.error('SYNC_REPORT: Error reporting sync:', syncError);
              // Continue even if report fails
            }
          } else {
            console.log('Skipping blacklisted contact from sync (not fresh):', otherUserUID);
          }
        }
      }

      // Process relationships where current user is user2 (they accepted the invite)
      for (const doc of relationships2.docs) {
        const data = doc.data();
        const otherUserUID = data.user1;
        const relationshipCreatedAt = data.createdAt.toDate();
        
        // Check if this is a fresh relationship (created in last 30 seconds)
        const relationshipAge = Date.now() - relationshipCreatedAt.getTime();
        const isFreshRelationship = relationshipAge < (30 * 1000); // 30 seconds only
        
        // Check if contact exists and is not blacklisted from sync
        const isBlacklisted = await ContactsService.isBlacklisted(otherUserUID);
        
        if (!existingUIDs.has(otherUserUID)) {
          if (isFreshRelationship && isBlacklisted) {
            // Check if relationship was created AFTER the contact was deleted
            const blacklistJson = await AsyncStorage.getItem('@privacycall/sync_blacklist');
            const blacklist = blacklistJson ? JSON.parse(blacklistJson) : {};
            const blacklistEntry = blacklist[otherUserUID];
            const deletedAt = blacklistEntry?.deletedAt || 0;
            
            if (relationshipCreatedAt.getTime() > deletedAt) {
              console.log('Fresh relationship AFTER deletion - clearing blacklist and adding contact:', otherUserUID);
              await ContactsService.removeFromBlacklist(otherUserUID);
              await ContactsService.addContact(null, otherUserUID);
              newContactsAdded++;

              // Report to server that we synced this contact
              try {
                const reportSyncFunction = FirebaseService.functions().httpsCallable('reportContactSynced');
                const result = await reportSyncFunction({ otherUserId: otherUserUID });
                console.log('SYNC_REPORT: Reported sync to server:', result.data.message);
              } catch (syncError) {
                console.error('SYNC_REPORT: Error reporting sync:', syncError);
              }
            } else {
              console.log('Relationship predates deletion - keeping blacklist:', otherUserUID);
            }
          } else if (!isBlacklisted) {
            // No nickname transmitted - will auto-generate privacy-focused nickname
            await ContactsService.addContact(null, otherUserUID);
            newContactsAdded++;
            console.log('Added mutual contact (as acceptor) with auto-generated nickname');

            // Report to server that we synced this contact
            try {
              const reportSyncFunction = FirebaseService.functions().httpsCallable('reportContactSynced');
              const result = await reportSyncFunction({ otherUserId: otherUserUID });
              console.log('SYNC_REPORT: Reported sync to server:', result.data.message);
            } catch (syncError) {
              console.error('SYNC_REPORT: Error reporting sync:', syncError);
              // Continue even if report fails
            }
          } else {
            console.log('Skipping blacklisted contact from sync (not fresh):', otherUserUID);
          }
        }
      }

      console.log('Mutual contact sync complete. New contacts added:', newContactsAdded);
      return newContactsAdded;
    } catch (error) {
      console.error('Error syncing mutual contacts:', error);
      return 0;
    }
  },

  /**
   * Add contact UID to sync blacklist (prevents re-syncing recently deleted contacts)
   */
  addToSyncBlacklist: async (uid) => {
    try {
      const blacklistJson = await AsyncStorage.getItem('@privacycall/sync_blacklist');
      const blacklist = blacklistJson ? JSON.parse(blacklistJson) : {};
      
      // Add UID with expiration time (15 minutes from now) and deletion timestamp
      blacklist[uid] = {
        expiresAt: Date.now() + (15 * 60 * 1000),
        deletedAt: Date.now(),
      };
      
      await AsyncStorage.setItem('@privacycall/sync_blacklist', JSON.stringify(blacklist));
      console.log('Added to sync blacklist:', uid);
    } catch (error) {
      console.error('Error adding to sync blacklist:', error);
    }
  },

  /**
   * Check if UID is blacklisted from sync
   */
  isBlacklisted: async (uid) => {
    try {
      const blacklistJson = await AsyncStorage.getItem('@privacycall/sync_blacklist');
      if (!blacklistJson) return false;
      
      const blacklist = JSON.parse(blacklistJson);
      const entry = blacklist[uid];
      
      if (!entry) return false;
      
      // Handle old format (just expiration number) and new format (object)
      const expiration = entry.expiresAt || entry;
      
      // Check if blacklist entry has expired
      if (Date.now() > expiration) {
        // Clean up expired entry
        delete blacklist[uid];
        await AsyncStorage.setItem('@privacycall/sync_blacklist', JSON.stringify(blacklist));
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error checking sync blacklist:', error);
      return false;
    }
  },

  /**
   * Remove UID from sync blacklist (for new invite acceptances)
   */
  removeFromBlacklist: async (uid) => {
    try {
      const blacklistJson = await AsyncStorage.getItem('@privacycall/sync_blacklist');
      if (!blacklistJson) return;
      
      const blacklist = JSON.parse(blacklistJson);
      if (blacklist[uid]) {
        delete blacklist[uid];
        await AsyncStorage.setItem('@privacycall/sync_blacklist', JSON.stringify(blacklist));
        console.log('Removed from sync blacklist:', uid);
      }
    } catch (error) {
      console.error('Error removing from sync blacklist:', error);
    }
  },

  /**
   * Check and process contact deletion requests from server
   * Called when app comes to foreground
   */
  processDeletionRequests: async () => {
    try {
      const currentUserId = await AuthService.getCurrentUserId();
      if (!currentUserId) {
        return { deletedContacts: [], deletedFromGroups: [] };
      }

      console.log('MUTUAL_DELETE: Checking for deletion requests...');

      const db = FirebaseService.firestore();
      const deletionRequestsSnapshot = await db
        .collection('contact_deletion_requests')
        .where('toUserId', '==', currentUserId)
        .where('processed', '==', false)
        .get();

      if (deletionRequestsSnapshot.empty) {
        console.log('MUTUAL_DELETE: No deletion requests found');
        return { deletedContacts: [], deletedFromGroups: [] };
      }

      console.log('MUTUAL_DELETE: Found', deletionRequestsSnapshot.size, 'deletion requests');

      const deletedContacts = [];
      const deletedFromGroups = [];
      const contacts = await ContactsService.getContacts();
      const groups = await ContactsService.getGroups();

      // Process each deletion request
      for (const doc of deletionRequestsSnapshot.docs) {
        const request = doc.data();
        const deletingUserId = request.fromUserId;

        console.log('MUTUAL_DELETE: Processing deletion from:', deletingUserId.substring(0, 8) + '...');

        // Find and remove contact locally
        const contactToRemove = contacts.find(c => c.uid === deletingUserId);
        if (contactToRemove) {
          const updatedContacts = contacts.filter(c => c.uid !== deletingUserId);
          await ContactsService.saveContacts(updatedContacts);
          deletedContacts.push(contactToRemove.nickname);
          console.log('MUTUAL_DELETE: Removed contact:', contactToRemove.nickname);

          // Log to history that contact was removed by other party
          const historyEntry = {
            type: 'contact_removed_by_other',
            contactNickname: contactToRemove.nickname,
            timestamp: new Date().toISOString(),
          };

          const validatedHistoryEntry = validateHistoryEntry(historyEntry);
          await ContactsService.addHistoryEntry(validatedHistoryEntry);
          console.log('MUTUAL_DELETE: Logged removal to history');

          // CRITICAL: Add to sync blacklist to prevent re-adding from server relationships
          await ContactsService.addToSyncBlacklist(deletingUserId);
          console.log('MUTUAL_DELETE: Added to sync blacklist to prevent re-sync');
        }

        // Remove from all groups
        let groupsModified = false;
        const updatedGroups = groups.map(group => {
          const originalMemberCount = group.members.length;
          const updatedMembers = group.members.filter(member => member.uid !== deletingUserId);

          if (updatedMembers.length < originalMemberCount) {
            console.log('MUTUAL_DELETE: Removed from group:', group.name);
            deletedFromGroups.push(group.name);
            groupsModified = true;
            return { ...group, members: updatedMembers };
          }
          return group;
        });

        if (groupsModified) {
          // Remove empty groups (less than 2 members)
          const nonEmptyGroups = updatedGroups.filter(g => g.members.length >= 2);
          await AsyncStorage.setItem('@privacycall/groups', JSON.stringify(nonEmptyGroups));
        }

        // Mark request as processed on server
        try {
          await doc.ref.update({ processed: true });
          console.log('MUTUAL_DELETE: Marked request as processed');
        } catch (updateError) {
          console.error('MUTUAL_DELETE: Error marking request as processed:', updateError);
        }
      }

      return { deletedContacts, deletedFromGroups };
    } catch (error) {
      console.error('MUTUAL_DELETE: Error processing deletion requests:', error);
      return { deletedContacts: [], deletedFromGroups: [] };
    }
  },

  /**
   * Add some demo contacts for testing (call this from Profile screen)
   */
  addDemoContacts: async () => {
    try {
      const demoContacts = [
        { nickname: 'Alice Johnson', uid: 'demo_alice_123456' },
        { nickname: 'Bob Smith', uid: 'demo_bob_789012' },
        { nickname: 'Carol Davis', uid: 'demo_carol_345678' },
      ];

      for (const contact of demoContacts) {
        try {
          await ContactsService.addContact(contact.nickname, contact.uid);
        } catch (error) {
          console.log('Demo contact already exists:', contact.nickname);
        }
      }

      console.log('Added demo contacts for testing');
      return true;
    } catch (error) {
      console.error('Error adding demo contacts:', error);
      throw error;
    }
  },

  /**
   * Add invite ID to deletion blacklist (prevents showing deleted invites for 10 minutes)
   */
  addToInviteDeletionBlacklist: async (inviteId) => {
    try {
      const blacklistJson = await AsyncStorage.getItem('@privacycall/invite_deletion_blacklist');
      const blacklist = blacklistJson ? JSON.parse(blacklistJson) : {};

      // Add invite ID with expiration time (10 minutes from now)
      blacklist[inviteId] = {
        deletedAt: Date.now(),
        expiresAt: Date.now() + (10 * 60 * 1000), // 10 minutes
      };

      await AsyncStorage.setItem('@privacycall/invite_deletion_blacklist', JSON.stringify(blacklist));
      console.log('OPTIMISTIC: Added invite to deletion blacklist:', inviteId);
    } catch (error) {
      console.error('Error adding to invite deletion blacklist:', error);
    }
  },

  /**
   * Get invite deletion blacklist (auto-cleans expired entries)
   */
  getInviteDeletionBlacklist: async () => {
    try {
      const blacklistJson = await AsyncStorage.getItem('@privacycall/invite_deletion_blacklist');
      if (!blacklistJson) return {};

      const blacklist = JSON.parse(blacklistJson);
      const now = Date.now();
      const cleanedBlacklist = {};

      // Remove expired entries
      for (const [inviteId, entry] of Object.entries(blacklist)) {
        if (entry.expiresAt > now) {
          cleanedBlacklist[inviteId] = entry;
        } else {
          console.log('OPTIMISTIC: Removing expired blacklist entry:', inviteId);
        }
      }

      // Update storage if we cleaned any entries
      if (Object.keys(cleanedBlacklist).length !== Object.keys(blacklist).length) {
        await AsyncStorage.setItem('@privacycall/invite_deletion_blacklist', JSON.stringify(cleanedBlacklist));
      }

      return cleanedBlacklist;
    } catch (error) {
      console.error('Error getting invite deletion blacklist:', error);
      return {};
    }
  },
};

export default ContactsService;