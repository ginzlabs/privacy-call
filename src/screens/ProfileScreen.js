import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
  RefreshControl,
  StatusBar,
  Platform,
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthService } from '../services/AuthService';
import { ContactsService } from '../services/ContactsService';
import { FirebaseService } from '../services/FirebaseService';
import { AppConfig } from '../config/AppConfig';

/**
 * Profile Screen
 * Manages local settings and account actions
 * Privacy-focused with option to delete/reset account
 */

export default function ProfileScreen() {
  const [userUID, setUserUID] = useState('');
  const [partialUID, setPartialUID] = useState('');
  const [settings, setSettings] = useState({
    soundEnabled: true,
    vibrationEnabled: true,
  });
  const [monthlyUsage, setMonthlyUsage] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingUsage, setLoadingUsage] = useState(true);

  useEffect(() => {
    loadUserData();
    loadSettings();
    loadMonthlyUsage();
  }, []);

  // Auto-refresh usage data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadMonthlyUsage();
    }, [])
  );

  const loadUserData = async () => {
    try {
      const fullUID = AuthService.getFullUID();
      const partial = AuthService.getPartialUID();
      setUserUID(fullUID || '');
      setPartialUID(partial || '');
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const settingsJson = await AsyncStorage.getItem(AppConfig.STORAGE_KEYS.USER_SETTINGS);
      if (settingsJson) {
        setSettings(JSON.parse(settingsJson));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadMonthlyUsage = async () => {
    try {
      const currentUser = await AuthService.getCurrentUserId();
      if (!currentUser) {
        console.log('No authenticated user for usage tracking');
        return;
      }

      // Get real usage data from server-side Firestore
      const realUsage = await FirebaseService.getMonthlyUsage(currentUser);
      setMonthlyUsage(realUsage);
      
      console.log('Loaded real monthly usage from server:', realUsage, 'minutes');
    } catch (error) {
      console.error('Error loading monthly usage from server:', error);
      // Fallback to 0 if server request fails
      setMonthlyUsage(0);
    } finally {
      setLoadingUsage(false);
    }
  };

  const saveSettings = async (newSettings) => {
    try {
      await AsyncStorage.setItem(AppConfig.STORAGE_KEYS.USER_SETTINGS, JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const handleSettingChange = (key, value) => {
    const newSettings = { ...settings, [key]: value };
    saveSettings(newSettings);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadMonthlyUsage();
    } catch (error) {
      console.error('Error refreshing usage data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyUID = async () => {
    try {
      // Use Share API to provide native copy functionality (like invite sharing)
      await Share.share({
        message: `My PrivacyCall ID: ${userUID}`,
        title: 'PrivacyCall User ID',
      });
    } catch (error) {
      console.error('Error sharing UID:', error);
      Alert.alert('Error', 'Failed to copy UID');
    }
  };

  const handleResetAccount = () => {
    Alert.alert(
      'Reset Account',
      'This will sign you out and clear all your contacts and data. Your anonymous account will remain but all local data will be lost. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await AuthService.resetAccount();
              await ContactsService.clearAllData();
              // Navigation will be handled by auth state change
            } catch (error) {
              Alert.alert('Error', 'Failed to reset account');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your anonymous account and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await AuthService.deleteAccount();
              // Navigation will be handled by auth state change
            } catch (error) {
              Alert.alert('Error', 'Failed to delete account');
            }
          },
        },
      ]
    );
  };


  const usagePercentage = (monthlyUsage / AppConfig.MONTHLY_QUOTA_MINUTES) * 100;
  const isNearQuota = usagePercentage >= AppConfig.USAGE_WARNING_THRESHOLD * 100;

  return (
    <SafeAreaView style={styles.modernContainer}>
      <StatusBar style="dark" backgroundColor="#f8fafc" />
      
      {/* Simple Header */}
      <View style={styles.simpleHeader}>
        <Text style={styles.simpleHeaderTitle}>Profile</Text>
      </View>

      <ScrollView
        style={styles.modernContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#667eea"
            colors={['#667eea']}
            title="Refreshing usage data..."
          />
        }
      >
        {/* Modern User ID Card */}
        <View style={styles.modernCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderIcon}>
              <LinearGradient
                colors={['#667eea', '#764ba2']}
                style={styles.cardIconGradient}
              >
                <Icon name="fingerprint" size={20} color="white" />
              </LinearGradient>
            </View>
            <Text style={styles.cardTitle}>Anonymous ID</Text>
          </View>
          
          <TouchableOpacity style={styles.modernUidContainer} onPress={handleCopyUID} activeOpacity={0.7}>
            <View style={styles.uidDisplayArea}>
              <Text style={styles.modernUidLabel}>Your ID</Text>
              <Text style={styles.modernUidValue}>{partialUID}</Text>
            </View>
            <View style={styles.copyIconContainer}>
              <Icon name="content-copy" size={20} color="#667eea" />
            </View>
          </TouchableOpacity>
          
          <Text style={styles.modernUidHelp}>
            Others can verify your identity using this anonymous ID. Tap to copy.
          </Text>
        </View>

        {/* Modern Usage Card */}
        <View style={styles.modernCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderIcon}>
              <LinearGradient
                colors={isNearQuota ? ['#ff6b6b', '#ee5a24'] : ['#00d2d3', '#54a0ff']}
                style={styles.cardIconGradient}
              >
                <Icon name="access-time" size={20} color="white" />
              </LinearGradient>
            </View>
            <Text style={styles.cardTitle}>Monthly Usage</Text>
            <TouchableOpacity onPress={handleRefresh} disabled={isRefreshing} style={styles.refreshButton}>
              <Icon 
                name="refresh" 
                size={20} 
                color={isRefreshing ? "#64748b" : "#667eea"} 
              />
            </TouchableOpacity>
          </View>
          
          <View style={styles.modernUsageContainer}>
            <View style={styles.usageStats}>
              <View style={styles.usageStatItem}>
                <Text style={styles.usageStatNumber}>
                  {loadingUsage ? '...' : Math.floor(monthlyUsage)}
                </Text>
                <Text style={styles.usageStatLabel}>Minutes Used</Text>
              </View>
              <View style={styles.usageStatItem}>
                <Text style={styles.usageStatNumber}>
                  {loadingUsage ? '...' : (AppConfig.MONTHLY_QUOTA_MINUTES - Math.floor(monthlyUsage))}
                </Text>
                <Text style={styles.usageStatLabel}>Remaining</Text>
              </View>
              <View style={styles.usageStatItem}>
                <Text style={[styles.usageStatNumber, { color: isNearQuota ? '#ef4444' : '#10b981' }]}>
                  {loadingUsage ? '...' : `${Math.round(usagePercentage)}%`}
                </Text>
                <Text style={styles.usageStatLabel}>Used</Text>
              </View>
            </View>
            
            <View style={styles.modernUsageBar}>
              <View style={styles.usageBarTrack}>
                <LinearGradient
                  colors={isNearQuota ? ['#ef4444', '#dc2626'] : ['#10b981', '#059669']}
                  style={[styles.usageBarProgress, { width: `${Math.min(usagePercentage, 100)}%` }]}
                />
              </View>
            </View>
            
            {isNearQuota && (
              <View style={styles.modernWarningContainer}>
                <View style={styles.warningIconContainer}>
                  <Icon name="warning" size={16} color="#f59e0b" />
                </View>
                <Text style={styles.modernWarningText}>Approaching monthly limit</Text>
              </View>
            )}
          </View>
        </View>

        {/* Modern Privacy Card */}
        <View style={styles.modernCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderIcon}>
              <LinearGradient
                colors={['#a8e6cf', '#88d8c0']}
                style={styles.cardIconGradient}
              >
                <Icon name="security" size={20} color="#00b894" />
              </LinearGradient>
            </View>
            <Text style={styles.cardTitle}>Privacy First</Text>
          </View>
          
          <View style={styles.modernPrivacyContainer}>
            {[
              { icon: 'visibility-off', text: 'No personal data collected' },
              { icon: 'storage', text: 'Contacts stored locally only' },
              { icon: 'person-outline', text: 'Anonymous authentication' },
              { icon: 'lock', text: 'End-to-end encrypted calls' },
              { icon: 'block', text: 'No tracking or analytics' },
            ].map((item, index) => (
              <View key={index} style={styles.privacyFeature}>
                <View style={styles.privacyIconContainer}>
                  <Icon name={item.icon} size={16} color="#00b894" />
                </View>
                <Text style={styles.modernPrivacyText}>{item.text}</Text>
              </View>
            ))}
          </View>
        </View>
        
        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Modern Design System
  modernContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
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
  modernContent: {
    flex: 1,
    paddingTop: 20,
  },
  bottomSpacer: {
    height: 120, // Extra space for tab bar
  },
  
  // Modern Card System
  modernCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  cardIconGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
  },
  refreshButton: {
    padding: 8,
  },
  
  // Modern UID Section
  modernUidContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  uidDisplayArea: {
    flex: 1,
  },
  modernUidLabel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  modernUidValue: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#1e293b',
    fontWeight: '600',
  },
  copyIconContainer: {
    padding: 8,
  },
  modernUidHelp: {
    fontSize: 14,
    color: '#64748b',
    paddingHorizontal: 20,
    paddingBottom: 20,
    lineHeight: 20,
  },
  
  // Modern Usage Styles
  modernUsageContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  usageStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  usageStatItem: {
    alignItems: 'center',
  },
  usageStatNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  usageStatLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modernUsageBar: {
    marginBottom: 16,
  },
  usageBarTrack: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  usageBarProgress: {
    height: '100%',
    borderRadius: 4,
  },
  modernWarningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 12,
  },
  warningIconContainer: {
    marginRight: 8,
  },
  modernWarningText: {
    fontSize: 14,
    color: '#92400e',
    fontWeight: '500',
  },
  
  // Modern Settings Styles
  modernSettingsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  modernSettingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  modernSettingInfo: {
    flex: 1,
    marginRight: 16,
  },
  modernSettingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  modernSettingDescription: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 18,
  },
  settingDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginHorizontal: 0,
  },
  
  // Modern Actions Styles
  modernActionsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  modernActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  actionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  modernActionInfo: {
    flex: 1,
  },
  modernActionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  modernActionDescription: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 18,
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginHorizontal: 0,
  },
  
  // Modern Privacy Styles
  modernPrivacyContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  privacyFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  privacyIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  modernPrivacyText: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '500',
    lineHeight: 20,
  },
  uidInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uidLabel: {
    fontSize: 16,
    color: '#8E8E93',
    marginRight: 8,
  },
  uidValue: {
    fontSize: 16,
    fontFamily: 'monospace',
    color: '#1D1D1F',
  },
  uidHelp: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
    lineHeight: 18,
  },
  usageContainer: {
    marginTop: 8,
  },
  usageInfo: {
    marginBottom: 8,
  },
  usageLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 4,
  },
  usageSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  usagePercentage: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 6,
    textAlign: 'right',
  },
  usageBar: {
    height: 6,
    backgroundColor: '#E5E5EA',
    borderRadius: 3,
    overflow: 'hidden',
  },
  usageProgress: {
    height: '100%',
    borderRadius: 3,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#FF9500',
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: '#1D1D1F',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    color: '#8E8E93',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  actionText: {
    fontSize: 16,
    marginLeft: 12,
  },
  privacySection: {
    backgroundColor: 'white',
    marginTop: 20,
    marginHorizontal: 16,
    marginBottom: 40,
    borderRadius: 10,
    padding: 16,
  },
  privacyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#34C759',
    marginBottom: 8,
  },
  privacyText: {
    fontSize: 14,
    color: '#1D1D1F',
    lineHeight: 20,
  },
});