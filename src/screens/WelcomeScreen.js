import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import messaging from '@react-native-firebase/messaging';
import { AuthService } from '../services/AuthService';
import { NotificationService } from '../services/NotificationService';

/**
 * Welcome Screen
 * First screen shown to new users
 * Explains privacy-first approach and initiates anonymous authentication
 */

export default function WelcomeScreen({ navigation }) {
  const [loading, setLoading] = useState(false);


  const handleGetStarted = async () => {
    setLoading(true);

    try {
      // Sign in anonymously
      await AuthService.signInAnonymously();

      // CRITICAL: Re-register FCM token now that user is authenticated
      // On fresh install, NotificationService.initialize() runs before auth,
      // so FCM token couldn't be registered with Firestore
      console.log('WELCOME: Retrying FCM token registration after authentication...');
      const fcmToken = await messaging().getToken();
      if (fcmToken) {
        await NotificationService.registerTokenWithBackend(fcmToken);
        console.log('WELCOME: FCM token registered successfully');
      }

      // Navigate to main app
      navigation.replace('MainTabs');

    } catch (error) {
      console.error('Error during sign in:', error);
      Alert.alert(
        'Error',
        'Failed to initialize the app. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#667eea', '#764ba2']}
      style={styles.modernContainer}
    >
      <StatusBar style="light" backgroundColor="#667eea" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.modernContent}>
          {/* Modern App Icon */}
          <View style={styles.modernIconContainer}>
            <LinearGradient
              colors={['#ffffff', '#f8fafc']}
              style={styles.iconGradient}
            >
              <Icon name="security" size={60} color="#667eea" />
            </LinearGradient>
          </View>

          {/* Modern App Title */}
          <Text style={styles.modernTitle}>PrivacyCall</Text>
          
          {/* Modern Subtitle */}
          <Text style={styles.modernSubtitle}>
            Secure, Private Audio Calls
          </Text>

          {/* Modern Features */}
          <View style={styles.modernFeaturesContainer}>
            {[
              { icon: 'security', text: 'No personal data collected' },
              { icon: 'lock', text: 'End-to-end encrypted calls' },
              { icon: 'group', text: '1:1 and group audio calls' },
              { icon: 'link', text: 'Add contacts via invite links' },
            ].map((feature, index) => (
              <View key={index} style={styles.modernFeature}>
                <View style={styles.featureIconContainer}>
                  <Icon name={feature.icon} size={20} color="#00b894" />
                </View>
                <Text style={styles.modernFeatureText}>{feature.text}</Text>
              </View>
            ))}
          </View>

          {/* Modern Privacy Notice */}
          <View style={styles.modernPrivacyNotice}>
            <Text style={styles.modernPrivacyText}>
              Anonymous authentication • No registration required • Contacts stored locally only
            </Text>
          </View>

          {/* Modern Get Started Button */}
          <TouchableOpacity
            style={styles.modernGetStartedButton}
            onPress={handleGetStarted}
            disabled={loading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={loading ? ['#94a3b8', '#64748b'] : ['#ffffff', '#f1f5f9']}
              style={styles.buttonGradient}
            >
              {loading ? (
                <ActivityIndicator color="#667eea" size="small" />
              ) : (
                <>
                  <Text style={styles.modernButtonText}>Get Started</Text>
                  <Icon name="arrow-forward" size={24} color="#667eea" style={styles.modernButtonIcon} />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Modern Footer */}
          <Text style={styles.modernFooter}>
            Privacy-first • No tracking • Open source
          </Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  modernContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  modernContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  modernIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  iconGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -1,
  },
  modernSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 24,
    textAlign: 'center',
    fontWeight: '500',
  },
  modernFeaturesContainer: {
    width: '100%',
    marginBottom: 24,
  },
  modernFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
  },
  featureIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  modernFeatureText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
    flex: 1,
  },
  modernPrivacyNotice: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    padding: 12,
    borderRadius: 20,
    marginBottom: 24,
    width: '100%',
  },
  modernPrivacyText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },
  modernGetStartedButton: {
    width: '100%',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
  },
  modernButtonText: {
    color: '#667eea',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 8,
  },
  modernButtonIcon: {
    marginLeft: 4,
  },
  modernFooter: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginBottom: 24,
    padding: 20,
    borderRadius: 40,
    backgroundColor: '#F0F9FF',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#8E8E93',
    marginBottom: 48,
    textAlign: 'center',
  },
  featuresContainer: {
    width: '100%',
    marginBottom: 40,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  featureText: {
    fontSize: 16,
    color: '#1D1D1F',
    marginLeft: 12,
    flex: 1,
  },
  privacyNotice: {
    backgroundColor: '#F2F2F7',
    padding: 20,
    borderRadius: 12,
    marginBottom: 32,
    width: '100%',
  },
  privacyText: {
    fontSize: 14,
    color: '#3C3C43',
    textAlign: 'center',
    lineHeight: 20,
  },
  getStartedButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    minWidth: 200,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
  },
  footer: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },
});