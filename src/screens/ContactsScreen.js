import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Alert,
  RefreshControl,
  Modal,
  Platform,
  Animated,
  StatusBar,
  AppState,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ContactsService } from '../services/ContactsService'; // Using mock for MVP
import { AuthService } from '../services/AuthService';
import { FirebaseService } from '../services/FirebaseService';
import { AppConfig, getPartialUID } from '../config/AppConfig';

/**
 * Contacts Screen
 * Main screen showing contacts, groups, and pending invites
 * Includes search functionality and quick actions
 */

export default function ContactsScreen({ navigation }) {
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showContactsMenu, setShowContactsMenu] = useState(false);
  const [showInviteLinkModal, setShowInviteLinkModal] = useState(false);
  const [inviteLinkInput, setInviteLinkInput] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now()); // For real-time countdown
  const [initialLoading, setInitialLoading] = useState(true); // Prevent empty state flash

  // Ref for FlatList to enable scrolling
  const flatListRef = useRef(null);

  // Load data when screen focuses
  useFocusEffect(
    useCallback(() => {
      loadData();
      // Sync mutual contacts but respect local deletions via blacklist
      syncContacts();
      // Check for mutual deletion requests from other users
      checkDeletionRequests();
    }, [])
  );

  const checkDeletionRequests = async () => {
    try {
      const result = await ContactsService.processDeletionRequests();

      if (result.deletedContacts.length > 0) {
        const deletedNames = result.deletedContacts.join(', ');
        const groupInfo = result.deletedFromGroups.length > 0
          ? `\n\nAlso removed from groups: ${result.deletedFromGroups.join(', ')}`
          : '';

        Alert.alert(
          'Contact Removed',
          `The following contact(s) removed you:\n\n${deletedNames}${groupInfo}`,
          [
            {
              text: 'OK',
              onPress: () => {
                // Reload data to reflect deletions
                loadData();
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error checking deletion requests:', error);
    }
  };

  // Filter contacts based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredContacts(contacts);
    } else {
      const filtered = contacts.filter(contact =>
        contact.nickname.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredContacts(filtered);
    }
  }, [contacts, searchQuery]);

  const loadData = async () => {
    try {
      // Check if contacts need refresh due to invite processing
      const needsRefresh = await AsyncStorage.getItem('@privacycall/contacts_need_refresh');
      if (needsRefresh === 'true') {
        console.log('Contacts flagged for refresh - clearing flag');
        await AsyncStorage.removeItem('@privacycall/contacts_need_refresh');
      }

      // Load data - skip invite server checks on initial load for speed
      // Firestore listener will handle real-time invite status updates
      const skipInviteServerChecks = initialLoading; // Skip checks only on first load
      const [contactsData, groupsData, invitesData] = await Promise.all([
        ContactsService.getContacts(),
        ContactsService.getGroups(),
        ContactsService.getPendingInvites(skipInviteServerChecks), // Fast on initial load
      ]);

      setContacts(contactsData);
      setGroups(groupsData);
      setPendingInvites(invitesData);

      // Mark initial loading complete (prevents empty state flash)
      if (initialLoading) {
        setInitialLoading(false);
      }

      // If flag was set, check again for new contacts after invite sync
      if (needsRefresh === 'true') {
        console.log('Re-checking contacts after invite sync');
        const refreshedContacts = await ContactsService.getContacts();
        setContacts(refreshedContacts);
      }
    } catch (error) {
      console.error('Error loading contacts data:', error);
      Alert.alert('Error', 'Failed to load contacts data');
      // Even on error, stop showing loading screen
      setInitialLoading(false);
    }
  };

  const syncContacts = async () => {
    try {
      const newContactsAdded = await ContactsService.syncMutualContacts();
      console.log('Mutual contact sync result:', newContactsAdded, 'new contacts');
      
      if (newContactsAdded > 0) {
        // Reload data if new contacts were added
        console.log('New contacts added - refreshing contact list');
        await loadData();
      }
    } catch (error) {
      console.error('Error syncing contacts:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await syncContacts(); // This will call loadData() if new contacts are found
    await loadData(); // Always refresh current data
    setRefreshing(false);
  };

  // Real-time listener for invite status changes (replaces inefficient polling)
  useEffect(() => {
    let unsubscribe = null;
    
    const setupInviteListener = async () => {
      try {
        const currentUserId = await AuthService.getCurrentUserId();
        if (!currentUserId) return;

        console.log('INVITE_LISTENER: Setting up real-time invite listener');

        // Set up Firestore real-time listener for invites
        const db = FirebaseService.firestore();
        unsubscribe = db
          .collection('Invites')
          .where('createdBy', '==', currentUserId)
          .onSnapshot(
            (snapshot) => {
              console.log('INVITE_LISTENER: Invite status changed - refreshing data');
              if (!refreshing) {
                loadData(); // Refresh when invite status changes
              }
            },
            (error) => {
              console.error('INVITE_LISTENER: Error in invite listener:', error);
            }
          );
      } catch (error) {
        console.error('INVITE_LISTENER: Error setting up listener:', error);
      }
    };

    setupInviteListener();

    return () => {
      if (unsubscribe) {
        console.log('INVITE_LISTENER: Cleaning up real-time listener');
        unsubscribe();
      }
    };
  }, [refreshing]);

  // AppState listener to refresh data when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'active') {
        console.log('CONTACTS_REFRESH: App became active - refreshing invite timers');
        if (!refreshing) {
          loadData(); // Refresh data to update invite countdown timers
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [refreshing]);

  // Real-time countdown timer - updates every second
  useEffect(() => {
    // Only run timer if there are pending invites
    if (pendingInvites.length === 0) return;

    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000); // Update every second

    return () => {
      clearInterval(timer);
    };
  }, [pendingInvites.length]);

  const handleContactPress = (contact) => {
    navigation.navigate('ContactDetail', { contact });
  };

  const handleGroupPress = (group) => {
    // Navigate to group detail screen for management
    navigation.navigate('GroupDetail', { group });
  };

  const handleAddContact = () => {
    setShowContactsMenu(false);
    navigation.navigate('AddContact');
  };

  const handleCreateGroup = () => {
    setShowContactsMenu(false);
    if (contacts.length < 2) {
      Alert.alert(
        'Cannot Create Group',
        'You need at least 2 contacts to create a group.'
      );
      return;
    }
    navigation.navigate('CreateGroup', { contacts });
  };

  const handleScanQRCode = () => {
    setShowContactsMenu(false);
    navigation.navigate('AcceptInvite');
  };

  const handleEnterInviteLink = () => {
    setShowContactsMenu(false);
    
    if (Platform.OS === 'ios') {
      // Use Alert.prompt on iOS
      Alert.prompt(
        'Enter Invite Link',
        'Paste the full invite link here:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Accept Invite',
            onPress: (link) => {
              if (link && link.trim()) {
                // Extract token from link like "https://privacycall.app/invite/TOKEN"
                const match = link.match(/\/invite\/([a-zA-Z0-9]+)$/);
                if (match) {
                  const token = match[1];
                  console.log('DEBUG: Extracted token from iOS prompt:', token);
                  // Force fresh navigation with timestamp to avoid caching
                  navigation.navigate('AcceptInvite', { 
                    inviteToken: token,
                    timestamp: Date.now() // Force fresh params
                  });
                } else {
                  Alert.alert('Invalid Link', 'Please enter a valid PrivacyCall invite link.');
                }
              }
            }
          }
        ],
        'plain-text'
      );
    } else {
      // Use modal on Android
      setInviteLinkInput('');
      setShowInviteLinkModal(true);
    }
  };

  const handleSubmitInviteLink = () => {
    if (inviteLinkInput && inviteLinkInput.trim()) {
      // Extract token from link like "https://privacycall.app/invite/TOKEN"
      const match = inviteLinkInput.match(/\/invite\/([a-zA-Z0-9]+)$/);
      if (match) {
        const token = match[1];
        console.log('DEBUG: Extracted token from link input:', token);
        console.log('DEBUG: Full link entered:', inviteLinkInput);
        setShowInviteLinkModal(false);
        // Force fresh navigation with timestamp to avoid caching
        navigation.navigate('AcceptInvite', { 
          inviteToken: token,
          timestamp: Date.now() // Force fresh params
        });
      } else {
        Alert.alert('Invalid Link', 'Please enter a valid PrivacyCall invite link.');
      }
    }
  };

  const handleCallContact = (contact) => {
    navigation.navigate('Call', { 
      type: 'direct', 
      contact,
      isOutgoing: true 
    });
  };

  const handleViewInvite = (invite) => {
    // Navigate to AddContactScreen with existing invite data
    console.log('Viewing existing invite:', invite.id);
    navigation.navigate('AddContact', { 
      existingInvite: invite,
      inviteToken: invite.token 
    });
  };

  const handleDeleteInvite = async (inviteId) => {
    try {
      // OPTIMISTIC: Remove from UI immediately
      setPendingInvites(currentInvites => currentInvites.filter(inv => inv.id !== inviteId));

      // Delete in background (ContactsService.deleteInvite is already optimistic)
      ContactsService.deleteInvite(inviteId).catch(error => {
        console.error('Background error deleting invite:', error);
        // Reload data on error to restore correct state
        loadData();
      });
    } catch (error) {
      console.error('Error deleting invite:', error);
      Alert.alert('Error', 'Failed to delete invite');
      // Reload to restore correct state
      loadData();
    }
  };

  const renderContactItem = ({ item }) => (
    <View style={styles.modernContactCard}>
      <TouchableOpacity
        style={styles.modernContactItem}
        onPress={() => handleContactPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.modernContactInfo}>
          <View style={styles.modernAvatar}>
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              style={styles.avatarGradient}
            >
              <Icon name="person" size={24} color="white" />
            </LinearGradient>
          </View>
          <View style={styles.modernContactDetails}>
            <Text style={styles.modernContactName}>{item.nickname}</Text>
            <Text style={styles.modernContactId}>{getPartialUID(item.uid)}</Text>
          </View>
        </View>
        <View style={styles.modernContactActions}>
          <TouchableOpacity 
            style={styles.modernCallButton} 
            onPress={() => handleCallContact(item)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#11998e', '#38ef7d']}
              style={styles.callButtonGradient}
            >
              <Icon name="call" size={20} color="white" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderGroupItem = ({ item }) => (
    <View style={styles.modernGroupCard}>
      <TouchableOpacity
        style={styles.modernGroupItem}
        onPress={() => handleGroupPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.modernGroupInfo}>
          <View style={styles.modernGroupAvatar}>
            <LinearGradient
              colors={['#ff7b7b', '#667eea']}
              style={styles.groupAvatarGradient}
            >
              <Icon name="group" size={24} color="white" />
            </LinearGradient>
          </View>
          <View style={styles.modernGroupDetails}>
            <Text style={styles.modernGroupName}>{item.name}</Text>
            <Text style={styles.modernGroupMembers}>
              {item.members.length} member{item.members.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <Icon name="chevron-right" size={24} color="#94a3b8" />
      </TouchableOpacity>
    </View>
  );

  const renderPendingInvite = ({ item }) => (
    <View style={styles.modernInviteCard}>
      <TouchableOpacity
        style={styles.modernInviteItem}
        onPress={() => handleViewInvite(item)}
        activeOpacity={0.7}
      >
        <View style={styles.modernInviteInfo}>
          <View style={styles.modernInviteAvatar}>
            <LinearGradient
              colors={['#FF9500', '#FF6B00']}
              style={styles.inviteAvatarGradient}
            >
              <Icon name="schedule" size={24} color="white" />
            </LinearGradient>
          </View>
          <View style={styles.modernInviteDetails}>
            <Text style={styles.modernInviteName}>Pending Invite</Text>
            <Text style={styles.modernInviteTime}>
              {(() => {
                try {
                  // Timezone-safe expiry calculation using currentTime state for real-time updates
                  const expiryTime = item.expiresAt instanceof Date ? item.expiresAt : new Date(item.expiresAt);
                  const timeRemaining = Math.max(0, expiryTime.getTime() - currentTime);
                  const minutesLeft = Math.floor(timeRemaining / 60000);
                  const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);

                  if (timeRemaining <= 0) {
                    return 'Expired';
                  } else if (minutesLeft > 0) {
                    return `Expires in ${minutesLeft}m ${secondsLeft}s`;
                  } else {
                    return `Expires in ${secondsLeft}s`;
                  }
                } catch (error) {
                  return 'Expiry unknown';
                }
              })()}
            </Text>
          </View>
        </View>
        <View style={styles.modernInviteActions}>
          <TouchableOpacity
            style={styles.modernDeleteButton}
            onPress={(e) => {
              e.stopPropagation(); // Prevent triggering the card press
              handleDeleteInvite(item.id);
            }}
            activeOpacity={0.6}
          >
            <View style={styles.deleteButtonInner}>
              <Icon name="close" size={20} color="#FF3B30" />
            </View>
          </TouchableOpacity>
          <Icon name="chevron-right" size={20} color="#94a3b8" style={{ marginLeft: 8 }} />
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderHeader = () => (
    <View>

      {/* Modern Contacts Menu */}
      {showContactsMenu && (
        <View style={styles.contactsMenu}>
          <TouchableOpacity
            style={styles.modernMenuItem}
            onPress={handleAddContact}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#e0e7ff' }]}>
              <Icon name="person-add" size={20} color="#667eea" />
            </View>
            <Text style={styles.modernMenuText}>Invite new contact</Text>
            <Icon name="chevron-right" size={20} color="#cbd5e1" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modernMenuItem}
            onPress={handleScanQRCode}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#ddd6fe' }]}>
              <Icon name="qr-code-scanner" size={20} color="#8b5cf6" />
            </View>
            <Text style={styles.modernMenuText}>Scan QR code</Text>
            <Icon name="chevron-right" size={20} color="#cbd5e1" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modernMenuItem}
            onPress={handleEnterInviteLink}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#fef3c7' }]}>
              <Icon name="link" size={20} color="#f59e0b" />
            </View>
            <Text style={styles.modernMenuText}>Enter invite link</Text>
            <Icon name="chevron-right" size={20} color="#cbd5e1" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modernMenuItem, styles.lastMenuItem]}
            onPress={handleCreateGroup}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#d1fae5' }]}>
              <Icon name="group-add" size={20} color="#10b981" />
            </View>
            <Text style={styles.modernMenuText}>Create group</Text>
            <Icon name="chevron-right" size={20} color="#cbd5e1" />
          </TouchableOpacity>
        </View>
      )}

      {/* Pending Invites Section */}
      {pendingInvites.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pending Invites</Text>
          {pendingInvites.map((invite) => (
            <View key={invite.id}>
              {renderPendingInvite({ item: invite })}
            </View>
          ))}
        </View>
      )}

      {/* Groups Section */}
      {groups.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Groups</Text>
          {groups.map((group) => (
            <View key={group.id}>
              {renderGroupItem({ item: group })}
            </View>
          ))}
        </View>
      )}

      {/* Contacts Section Header */}
      {contacts.length > 0 && (
        <Text style={styles.sectionTitle}>
          Contacts ({filteredContacts.length})
        </Text>
      )}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.modernEmptyState}>
      <View style={styles.emptyIconContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.emptyIconGradient}
        >
          <Icon name="contacts" size={50} color="white" />
        </LinearGradient>
      </View>
      <Text style={styles.modernEmptyTitle}>No Contacts Yet</Text>
      <Text style={styles.modernEmptySubtitle}>
        Tap the + button to invite your first contact and start making secure calls
      </Text>
    </View>
  );

  // Show loading screen on first render until data loads
  if (initialLoading) {
    return (
      <SafeAreaView style={styles.modernContainer}>
        <StatusBar style="dark" backgroundColor="#f8fafc" />
        <View style={styles.simpleHeader}>
          <Text style={styles.simpleHeaderTitle}>Contacts</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#667eea" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.modernContainer}>
      <StatusBar style="dark" backgroundColor="#f8fafc" />
      
      {/* Simple Header */}
      <View style={styles.simpleHeader}>
        <Text style={styles.simpleHeaderTitle}>Contacts</Text>
      </View>

      {/* Modern Search Bar */}
      <View style={styles.modernSearchContainer}>
        <View style={styles.modernSearchBar}>
          <Icon name="search" size={20} color="#8E8E93" style={styles.modernSearchIcon} />
          <TextInput
            style={styles.modernSearchInput}
            placeholder="Search contacts..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#8E8E93"
          />
        </View>
        <TouchableOpacity
          style={styles.modernAddButton}
          onPress={() => {
            // Scroll to top first so menu is visible
            if (flatListRef.current) {
              flatListRef.current.scrollToOffset({ offset: 0, animated: true });
            }
            setShowContactsMenu(!showContactsMenu);
          }}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.addButtonGradient}
          >
            <Icon name="add" size={24} color="white" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={filteredContacts}
        keyExtractor={(item) => item.id}
        renderItem={renderContactItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={contacts.length === 0 ? renderEmptyState : null}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#667eea"
            colors={['#667eea']}
          />
        }
        style={styles.modernList}
        contentContainerStyle={styles.modernListContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Android Invite Link Modal */}
      <Modal
        visible={showInviteLinkModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInviteLinkModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowInviteLinkModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Enter Invite Link</Text>
            <TouchableOpacity
              style={styles.modalSubmitButton}
              onPress={handleSubmitInviteLink}
            >
              <Text style={styles.modalSubmitText}>Accept</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            <Text style={styles.modalDescription}>
              Paste the full invite link here:
            </Text>
            <TextInput
              style={styles.modalTextInput}
              value={inviteLinkInput}
              onChangeText={setInviteLinkInput}
              placeholder="https://privacycall.app/invite/..."
              placeholderTextColor="#8E8E93"
              multiline
              autoFocus
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Modern Design System
  modernContainer: {
    flex: 1,
    backgroundColor: '#f8fafc', // Light gray background
  },
  simpleHeader: {
    paddingHorizontal: 24,
    paddingTop: 70,
    paddingBottom: 16,
    backgroundColor: '#f8fafc',
  },
  simpleHeaderTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
  },
  modernSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 12,
  },
  modernSearchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  modernSearchIcon: {
    marginRight: 12,
  },
  modernSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
  },
  modernAddButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  addButtonGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernList: {
    flex: 1,
  },
  modernListContent: {
    paddingBottom: 100, // Extra space for tab bar
  },
  
  // Modern Contact Card Styles
  modernContactCard: {
    marginHorizontal: 20,
    marginVertical: 6,
    backgroundColor: 'white',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  modernContactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  modernContactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modernAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 16,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernContactDetails: {
    flex: 1,
  },
  modernContactName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  modernContactId: {
    fontSize: 14,
    color: '#64748b',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modernContactActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modernCallButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  callButtonGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Modern Group Card Styles
  modernGroupCard: {
    marginHorizontal: 20,
    marginVertical: 6,
    backgroundColor: 'white',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  modernGroupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  modernGroupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modernGroupAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 16,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  groupAvatarGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernGroupDetails: {
    flex: 1,
  },
  modernGroupName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  modernGroupMembers: {
    fontSize: 14,
    color: '#64748b',
  },
  modernGroupActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  // Modern Empty State Styles
  modernEmptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 24,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  emptyIconGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernEmptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  modernEmptySubtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
  },
  
  // Modern Section Styles
  section: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  
  // Modern Menu Styles
  contactsMenu: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  modernMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: 'white',
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modernMenuText: {
    fontSize: 16,
    color: '#1e293b',
    flex: 1,
    fontWeight: '500',
  },
  
  // Modern Invite Card Styles
  modernInviteCard: {
    marginHorizontal: 20,
    marginVertical: 6,
    backgroundColor: 'white',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  modernInviteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  modernInviteInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modernInviteAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 16,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  inviteAvatarGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernInviteDetails: {
    flex: 1,
  },
  modernInviteName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  modernInviteTime: {
    fontSize: 14,
    color: '#FF9500',
    fontWeight: '500',
  },
  modernInviteActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modernDeleteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: { flex: 1, backgroundColor: '#F2F2F7' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  modalCancelButton: { paddingVertical: 8 },
  modalCancelText: { fontSize: 16, color: '#007AFF' },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#1D1D1F' },
  modalSubmitButton: { paddingVertical: 8 },
  modalSubmitText: { fontSize: 16, fontWeight: '600', color: '#007AFF' },
  modalContent: { padding: 20 },
  modalDescription: { fontSize: 16, color: '#8E8E93', marginBottom: 16, textAlign: 'center' },
  modalTextInput: { backgroundColor: 'white', borderRadius: 10, padding: 16, fontSize: 16, minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#E5E5EA' },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D1D1F',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  contactItem: {
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 1,
    borderRadius: 10,
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contactDetails: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  contactId: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  callButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  groupItem: {
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 1,
    borderRadius: 10,
  },
  groupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  groupDetails: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  groupMembers: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  callButton: {
    backgroundColor: '#34C759',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1D1D1F',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
  },
  // Modal styles for Android invite link input
  modalContainer: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: 'white',
  },
  modalCancelButton: {
    paddingVertical: 8,
  },
  modalCancelText: {
    fontSize: 16,
    color: '#007AFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  modalSubmitButton: {
    paddingVertical: 8,
  },
  modalSubmitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  modalContent: {
    padding: 20,
  },
  modalDescription: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalTextInput: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 16,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
});