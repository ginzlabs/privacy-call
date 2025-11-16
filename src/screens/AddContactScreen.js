import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
  Share,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import QRCode from 'react-native-qrcode-svg';
import { ContactsService } from '../services/ContactsService';
import { AppConfig } from '../config/AppConfig';

/**
 * Add Contact Screen
 * Allows users to create invite links and QR codes
 */

export default function AddContactScreen({ navigation, route }) {
  const [nickname, setNickname] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [inviteExpiresAt, setInviteExpiresAt] = useState(null);

  // Check if we're viewing an existing invite
  const existingInvite = route.params?.existingInvite;

  // Load existing invite data if available
  useEffect(() => {
    if (existingInvite) {
      console.log('Loading existing invite data:', existingInvite);
      
      // Reconstruct invite link from token
      const reconstructedLink = `https://privacycall.app/invite/${existingInvite.token}`;
      setInviteLink(reconstructedLink);
      setInviteToken(existingInvite.token);
      
      // Set expiration time for countdown
      const expirationTime = new Date(existingInvite.expiresAt);
      setInviteExpiresAt(expirationTime);
    }
  }, [existingInvite]);

  const handleCreateInvite = async () => {
    setLoading(true);
    try {
      // Create invite without nickname - privacy-focused approach
      const result = await ContactsService.createInvite();
      setInviteLink(result.inviteLink);
      setInviteToken(result.invite.token);
      
      // Set expiration timestamp for real-time calculation
      const expirationTime = new Date(Date.now() + AppConfig.INVITE_EXPIRATION_MINUTES * 60 * 1000);
      setInviteExpiresAt(expirationTime);
      
      Alert.alert('Success', 'Invite created! Share the link or show the QR code.');
    } catch (error) {
      console.error('Error creating invite:', error);
      Alert.alert('Error', 'Failed to create invite');
    } finally {
      setLoading(false);
    }
  };

  const handleShareLink = async () => {
    try {
      await Share.share({
        message: `Join me on PrivacyCall! 

Copy this link and paste it into the PrivacyCall app (+ button → Enter invite link):

${inviteLink}`,
        title: 'PrivacyCall Invite',
      });
    } catch (error) {
      console.error('Error sharing link:', error);
    }
  };

  // Real-time countdown timer that works when app is backgrounded
  useEffect(() => {
    if (!inviteExpiresAt) return;
    
    const updateTimer = () => {
      const now = new Date();
      const remainingMs = inviteExpiresAt - now;
      const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
      
      setTimeRemaining(remainingSeconds);
      
      if (remainingSeconds <= 0) {
        console.log('Invite expired - real time calculation');
      }
    };
    
    // Update immediately
    updateTimer();
    
    // Update every second
    const timer = setInterval(updateTimer, 1000);
    
    return () => clearInterval(timer);
  }, [inviteExpiresAt]);

  const formatTimeRemaining = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!inviteLink ? (
          // Modern create invite card
          <View style={styles.createForm}>
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              style={styles.iconGradient}
            >
              <Icon name="person-add" size={48} color="white" />
            </LinearGradient>

            <Text style={styles.title}>Invite New Contact</Text>
            <Text style={styles.subtitle}>
              Create a secure, privacy-focused invite. Only your anonymous ID is shared—no personal information.
            </Text>

            <TouchableOpacity
              style={[styles.createButton, loading && styles.buttonDisabled]}
              onPress={handleCreateInvite}
              disabled={loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={loading ? ['#cbd5e1', '#94a3b8'] : ['#667eea', '#764ba2']}
                style={styles.createButtonGradient}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Creating Invite...' : 'Create Invite'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          // Modern invite details cards
          <View style={styles.inviteDetails}>
            <View style={styles.successCard}>
              <LinearGradient
                colors={['#10b981', '#059669']}
                style={styles.successIconGradient}
              >
                <Icon name="check-circle" size={36} color="white" />
              </LinearGradient>

              <Text style={styles.successTitle}>Invite Created!</Text>

              {timeRemaining > 0 ? (
                <View style={styles.timerBadge}>
                  <Icon name="schedule" size={16} color="#FF9500" />
                  <Text style={styles.timerText}>
                    Expires in {formatTimeRemaining(timeRemaining)}
                  </Text>
                </View>
              ) : (
                <View style={styles.expiredBadge}>
                  <Icon name="error-outline" size={16} color="#FF3B30" />
                  <Text style={styles.expiredText}>Invite Expired</Text>
                </View>
              )}
            </View>

            {/* QR Code Card */}
            <View style={styles.qrCard}>
              <Text style={styles.qrTitle}>QR Code</Text>
              <View style={styles.qrCodeWrapper}>
                <QRCode
                  value={inviteLink}
                  size={180}
                  color="#1e293b"
                  backgroundColor="#FFFFFF"
                  quietZone={10}
                />
              </View>
              <Text style={styles.qrText}>Scan with another device to accept</Text>
            </View>

            {/* Share Button */}
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShareLink}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#3b82f6', '#2563eb']}
                style={styles.shareButtonGradient}
              >
                <Icon name="share" size={20} color="white" />
                <Text style={styles.shareButtonText}>Share Invite Link</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Link Display Card */}
            <View style={styles.linkCard}>
              <Text style={styles.linkLabel}>Invite Link</Text>
              <View style={styles.linkBox}>
                <Text style={styles.linkText} numberOfLines={2}>
                  {inviteLink}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.createAnotherButton}
              onPress={() => {
                setInviteLink('');
                setInviteToken('');
                setNickname('');
                setTimeRemaining(0);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.createAnotherText}>Create Another Invite</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 40,
  },
  createForm: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  iconGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  createButton: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  createButtonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  inviteDetails: {
    width: '100%',
  },
  successCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  successIconGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  timerText: {
    fontSize: 16,
    color: '#f59e0b',
    fontWeight: '600',
    marginLeft: 6,
  },
  expiredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  expiredText: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '600',
    marginLeft: 6,
  },
  qrCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 20,
  },
  qrCodeWrapper: {
    backgroundColor: '#f8fafc',
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
  },
  qrText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  shareButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  shareButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  shareButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
    marginLeft: 8,
  },
  linkCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  linkLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  linkBox: {
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  linkText: {
    fontSize: 13,
    color: '#3b82f6',
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  createAnotherButton: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  createAnotherText: {
    color: '#667eea',
    fontSize: 17,
    fontWeight: '600',
  },
});