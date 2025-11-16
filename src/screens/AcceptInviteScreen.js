import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { ContactsService } from '../services/ContactsService';
import { FirebaseService } from '../services/FirebaseService';
import { AuthService } from '../services/AuthService';
import { AppConfig, getPartialUID } from '../config/AppConfig';

/**
 * Accept Invite Screen
 * Handles accepting invites via QR code scanning or direct token entry
 */

export default function AcceptInviteScreen({ navigation, route }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteData, setInviteData] = useState(null);
  const [showScanner, setShowScanner] = useState(true);
  const [manualToken, setManualToken] = useState('');

  // Get invite token from navigation params (if coming from deep link)
  const inviteToken = route.params?.inviteToken;

  useEffect(() => {
    getCameraPermissions();
    
    console.log('DEBUG: AcceptInviteScreen mounted with route params:', route.params);
    console.log('DEBUG: inviteToken from params:', inviteToken);
    
    // Clear any previous state first
    setInviteData(null);
    setScanned(false);
    setShowScanner(true);
    
    // If we have an invite token from navigation, process it immediately
    if (inviteToken) {
      console.log('DEBUG: Processing invite token from route params:', inviteToken);
      setShowScanner(false);
      handleInviteToken(inviteToken);
    }
  }, [route.params?.inviteToken, route.params?.timestamp]);

  const getCameraPermissions = async () => {
    const { status } = await BarCodeScanner.requestPermissionsAsync();
    setHasPermission(status === 'granted');
  };

  const handleBarCodeScanned = ({ data }) => {
    setScanned(true);
    setShowScanner(false);
    
    // Extract token from QR code data (should be invite link)
    const token = extractTokenFromLink(data);
    if (token) {
      handleInviteToken(token);
    } else {
      Alert.alert('Invalid QR Code', 'This QR code is not a valid PrivacyCall invite.');
      resetScanner();
    }
  };

  const extractTokenFromLink = (link) => {
    // Extract token from link like "https://privacycall.app/invite/TOKEN"
    const match = link.match(/\/invite\/([a-zA-Z0-9]+)$/);
    return match ? match[1] : null;
  };

  const handleInviteToken = async (token) => {
    setLoading(true);
    try {
      console.log('DEBUG: handleInviteToken called with token:', token);
      console.log('DEBUG: Route params inviteToken:', route.params?.inviteToken);
      
      // Get invite from Firestore
      const invite = await FirebaseService.getInviteByToken(token);
      
      if (!invite) {
        Alert.alert(
          'Invalid Invite',
          'This invite is invalid, expired, or has already been used.',
          [{ text: 'OK', onPress: resetScanner }]
        );
        return;
      }

      setInviteData(invite);
    } catch (error) {
      console.error('Error fetching invite:', error);
      Alert.alert(
        'Error',
        'Unable to load invite. Please check your connection and try again.',
        [{ text: 'OK', onPress: resetScanner }]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!inviteData) return;

    setLoading(true);
    try {
      // Get current user ID
      const currentUserId = await AuthService.getCurrentUserId();
      if (!currentUserId) {
        throw new Error('User not authenticated');
      }

      // Accept invite with temporary mutual contact addition via Cloud Function (no nicknames)
      const acceptInviteWithMutualContacts = FirebaseService.functions().httpsCallable('acceptInviteWithMutualContacts');
      const result = await acceptInviteWithMutualContacts({
        inviteId: inviteData.id,
        // Remove acceptorNickname for privacy
      });

      console.log('Invite accepted with temporary mutual contacts:', result.data);

      // Add contact locally with default nickname (user can edit later)
      const defaultNickname = `Contact ${getPartialUID(inviteData.createdBy)}`;
      await ContactsService.addContact(
        defaultNickname,
        inviteData.createdBy,
        true // isNewInvite = true (clears blacklist)
      );

      Alert.alert(
        'Contact Added!',
        `Contact has been added to your contacts. You can edit their nickname and they can call you for the next 15 minutes!`,
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('MainTabs', { screen: 'Contacts' })
          }
        ]
      );
    } catch (error) {
      console.error('Error accepting invite:', error);
      
      // Handle specific error cases with friendly messages
      if (error.message.includes('Contact already exists')) {
        Alert.alert(
          'Already in Contacts',
          'This person is already in your contact list! You can find them in the Contacts tab.',
          [
            {
              text: 'View Contacts',
              onPress: () => navigation.navigate('MainTabs', { screen: 'Contacts' })
            },
            {
              text: 'OK',
              onPress: () => navigation.navigate('MainTabs', { screen: 'Contacts' }),
              style: 'cancel'
            }
          ]
        );
      } else if (error.message.includes('Invalid or expired invite')) {
        Alert.alert(
          'Invite Expired',
          'This invite link has expired or is no longer valid.',
          [{ 
            text: 'OK', 
            onPress: () => navigation.navigate('MainTabs', { screen: 'Contacts' })
          }]
        );
      } else if (error.message.includes('Cannot accept your own invite')) {
        Alert.alert(
          'Own Invite',
          'You cannot accept your own invite link.',
          [{ 
            text: 'OK', 
            onPress: () => navigation.navigate('MainTabs', { screen: 'Contacts' })
          }]
        );
      } else {
        Alert.alert(
          'Error',
          'Unable to accept invite. Please try again.',
          [{ 
            text: 'OK', 
            onPress: () => navigation.navigate('MainTabs', { screen: 'Contacts' })
          }]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const resetScanner = () => {
    setScanned(false);
    setInviteData(null);
    setShowScanner(true);
  };

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.permissionText}>Requesting camera permission...</Text>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Icon name="camera-alt" size={60} color="#8E8E93" />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            Please enable camera access in your device settings to scan QR codes.
          </Text>
          <TouchableOpacity style={styles.button} onPress={getCameraPermissions}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>
            {inviteData ? 'Accepting invite...' : 'Loading invite...'}
          </Text>
        </View>
      ) : inviteData ? (
        // Show invite details for acceptance
        <View style={styles.inviteContainer}>
          <View style={styles.inviteIcon}>
            <Icon name="person-add" size={60} color="#34C759" />
          </View>
          
          <Text style={styles.inviteTitle}>You're Invited!</Text>
          <Text style={styles.inviteUID}>
            From User ID: {getPartialUID(inviteData.createdBy)}
          </Text>
          
          <Text style={styles.inviteDescription}>
            Accept this invite to add this user to your contacts and start making private calls. 
            You can set a nickname for them after adding.
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[styles.button, styles.acceptButton]} 
              onPress={handleAcceptInvite}
            >
              <Text style={[styles.buttonText, styles.acceptButtonText]}>
                Accept Invite
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, styles.cancelButton]} 
              onPress={() => navigation.goBack()}
            >
              <Text style={[styles.buttonText, styles.cancelButtonText]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : showScanner ? (
        // Show QR code scanner
        <View style={styles.scannerContainer}>
          <BarCodeScanner
            onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
            style={styles.scanner}
          />
          
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerHeader}>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => navigation.goBack()}
              >
                <Icon name="arrow-back" size={24} color="white" />
              </TouchableOpacity>
              
              <Text style={styles.scannerTitle}>Scan QR Code</Text>
              <View style={styles.placeholder} />
            </View>
            
            <View style={styles.scannerFrame}>
              <View style={styles.scannerCorner} />
            </View>
            
            <View style={styles.manualEntryContainer}>
              <Text style={styles.scannerText}>
                Point your camera at a PrivacyCall invite QR code
              </Text>
              
              <Text style={styles.orText}>OR</Text>
              
              <TextInput
                style={styles.tokenInput}
                placeholder="Enter invite token manually"
                value={manualToken}
                onChangeText={setManualToken}
                placeholderTextColor="#8E8E93"
              />
              
              <TouchableOpacity
                style={[styles.manualButton, !manualToken.trim() && styles.buttonDisabled]}
                onPress={() => {
                  if (manualToken.trim()) {
                    handleInviteToken(manualToken.trim());
                  }
                }}
                disabled={!manualToken.trim()}
              >
                <Text style={styles.manualButtonText}>Use Token</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 16,
  },
  inviteContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteIcon: {
    marginBottom: 24,
  },
  inviteTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginBottom: 8,
  },
  inviteFrom: {
    fontSize: 20,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 4,
  },
  inviteUID: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 24,
  },
  inviteDescription: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  buttonContainer: {
    width: '100%',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  acceptButton: {
    backgroundColor: '#34C759',
  },
  acceptButtonText: {
    color: 'white',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#8E8E93',
  },
  cancelButtonText: {
    color: '#8E8E93',
  },
  scannerContainer: {
    flex: 1,
  },
  scanner: {
    flex: 1,
  },
  scannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  backButton: {
    padding: 8,
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
  placeholder: {
    width: 40,
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 12,
    position: 'relative',
  },
  scannerCorner: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#34C759',
    borderTopLeftRadius: 12,
  },
  scannerText: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    paddingHorizontal: 40,
    marginBottom: 20,
  },
  manualEntryContainer: {
    alignItems: 'center',
    paddingBottom: 60,
  },
  orText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginVertical: 16,
  },
  tokenInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 16,
    width: 280,
    textAlign: 'center',
  },
  manualButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  manualButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});