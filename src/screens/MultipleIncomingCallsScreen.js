import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  Vibration,
  Alert,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ContactsService } from '../services/ContactsService';
import { NotificationService } from '../services/NotificationService';
import { getPartialUID } from '../config/AppConfig';

/**
 * Multiple Incoming Calls Screen
 * Shown when user receives multiple incoming calls simultaneously
 * Allows user to choose which call to answer and rejects others
 */

export default function MultipleIncomingCallsScreen({ route, navigation }) {
  const { calls } = route.params || {};
  const [incomingCalls, setIncomingCalls] = useState([]);
  const [isAnswering, setIsAnswering] = useState(false);

  // Load active incoming calls and look up caller names
  useEffect(() => {
    const loadActiveCallsAndNames = async () => {
      try {
        // Use the calls passed directly from the navigation (simple approach)
        let activeCalls = calls || [];
        
        console.log('MULTIPLE_CALLS: Loading', activeCalls.length, 'calls passed from navigation');
        activeCalls.forEach((call, index) => {
          console.log(`MULTIPLE_CALLS: Call ${index + 1} from:`, call.callerUID?.substring(0, 8) + '...');
        });
        
        // Get contacts for caller name lookup
        const contacts = await ContactsService.getContacts();

        // CRITICAL: Filter out system/invalid calls and remove duplicates
        const filteredCalls = activeCalls.filter(call => {
          // Filter out system calls (cancellations, declines, etc.)
          const isSystemCall = !call.callerUID ||
                              call.callerUID === 'system' ||
                              call.callerName === 'Call Cancelled' ||
                              call.callerName === 'Call Declined' ||
                              call.callerUID.length < 10; // Invalid UID

          if (isSystemCall) {
            console.log('FILTER: Removing system/invalid call:', call.callerName, call.callerUID);
            return false;
          }

          return true;
        });

        console.log('MULTIPLE_CALLS: After filtering system calls:', filteredCalls.length, 'valid calls');
        
        // Remove duplicates by callerUID (keep most recent call from each caller)
        const deduplicatedCalls = [];
        const seenCallers = new Set();
        
        // Sort by timestamp (most recent first) and then deduplicate
        const sortedCalls = [...filteredCalls].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        for (const call of sortedCalls) {
          if (!seenCallers.has(call.callerUID)) {
            seenCallers.add(call.callerUID);
            deduplicatedCalls.push(call);
            console.log('DEDUP: ✅ Keeping call from:', call.callerUID?.substring(0, 8) + '...', 'Name:', call.callerName);
          } else {
            console.log('DEDUP: ❌ Removing duplicate call from:', call.callerUID?.substring(0, 8) + '...', 'Name:', call.callerName);
          }
        }
        
        // Look up caller names from contacts (already loaded above for validation)
        const callsWithNames = deduplicatedCalls.map(call => {
          const contact = contacts.find(c => c.uid === call.callerUID);
          return {
            ...call,
            displayName: contact?.nickname || call.callerName || 'Unknown Caller',
          };
        });
        
        console.log('MULTIPLE_CALLS: Final deduplicated calls with names:', callsWithNames.map(c => ({
          caller: c.callerUID?.substring(0, 8) + '...',
          name: c.displayName
        })));

        // If all calls were filtered out (system calls only), silently dismiss
        if (callsWithNames.length === 0) {
          console.log('MULTIPLE_CALLS: All calls filtered out (system calls) - dismissing');
          navigation.navigate('MainTabs', { screen: 'Contacts' });
          return;
        }

        // If only one call remains after filtering, navigate to single incoming call screen
        if (callsWithNames.length === 1) {
          console.log('MULTIPLE_CALLS: Only one valid call after filtering - switching to single call screen');
          const singleCall = callsWithNames[0];
          navigation.replace('IncomingCall', {
            callerName: singleCall.displayName,
            callerUID: singleCall.callerUID,
            roomName: singleCall.roomName,
            callType: singleCall.callType,
            timestamp: singleCall.timestamp,
          });
          return;
        }

        // Set state only once with final deduplicated and named calls
        setIncomingCalls(callsWithNames);
        console.log('MULTIPLE_CALLS: UI updated with', callsWithNames.length, 'unique callers');
      } catch (error) {
        console.error('Error loading active calls:', error);
        setIncomingCalls(calls || []);
      }
    };
    
    loadActiveCallsAndNames();
  }, [calls]);

  // Start vibration pattern for multiple incoming calls
  useEffect(() => {
    const vibrationPattern = [1000, 500, 1000, 500]; // Vibrate pattern
    Vibration.vibrate(vibrationPattern, true); // Repeat until answered

    // Cleanup on unmount
    return () => {
      Vibration.cancel();
    };
  }, []);

  // Set up cancellation listener to remove calls that get cancelled
  useEffect(() => {
    const handleCancellation = () => {
      console.log('MultipleIncomingCallsScreen: A call was cancelled');
      // Reload incoming calls to remove cancelled ones
      // For now, we'll rely on individual call handling
    };

    NotificationService.onCallCancelled = handleCancellation;

    return () => {
      NotificationService.onCallCancelled = null;
    };
  }, []);

  const handleAnswerCall = async (selectedCall) => {
    try {
      setIsAnswering(true);
      Vibration.cancel(); // Stop vibration

      console.log('MULTIPLE_CALLS: User selected call:', selectedCall);

      // Send decline notifications to all OTHER callers
      const otherCalls = incomingCalls.filter(call => call.callerUID !== selectedCall.callerUID);
      
      for (const call of otherCalls) {
        console.log('MULTIPLE_CALLS: Declining call from:', call.callerUID);
        try {
          await NotificationService.sendCallDecline(call.callerUID);
        } catch (error) {
          console.error('Error declining other call:', error);
        }
      }

      // Navigate to the selected call with proper CallScreen parameters
      navigation.replace('Call', { 
        type: selectedCall.callType,
        roomName: selectedCall.roomName,
        contact: {
          uid: selectedCall.callerUID,
          nickname: selectedCall.displayName || selectedCall.callerName,
        },
        isOutgoing: false,
      });
      
      console.log('MULTIPLE_CALLS: Navigating to CallScreen with params:', {
        type: selectedCall.callType,
        roomName: selectedCall.roomName,
        callerUID: selectedCall.callerUID,
        isOutgoing: false,
      });
    } catch (error) {
      console.error('Error answering selected call:', error);
      Alert.alert('Error', 'Unable to answer call. Please try again.');
      setIsAnswering(false);
    }
  };

  const handleDeclineAll = async () => {
    try {
      Vibration.cancel(); // Stop vibration
      
      // Send decline notifications to all callers
      for (const call of incomingCalls) {
        console.log('MULTIPLE_CALLS: Declining call from:', call.callerUID);
        try {
          await NotificationService.sendCallDecline(call.callerUID);
          
          // Log missed call to history for each caller
          const historyEntry = {
            type: 'call_missed',
            timestamp: new Date().toISOString(),
            contactName: call.displayName || call.callerName,
            callerUID: call.callerUID,
          };
          
          await ContactsService.addHistoryEntry(historyEntry);
        } catch (error) {
          console.error('Error declining call from:', call.callerUID, error);
        }
      }
      
      console.log('MULTIPLE_CALLS: Declined all calls');
      navigation.goBack();
    } catch (error) {
      console.error('Error declining all calls:', error);
      navigation.goBack();
    }
  };

  const renderCallItem = ({ item }) => (
    <View style={styles.callCard}>
      <TouchableOpacity
        style={styles.callItem}
        onPress={() => handleAnswerCall(item)}
        disabled={isAnswering}
        activeOpacity={0.7}
      >
        <View style={styles.callerInfo}>
          <View style={styles.avatar}>
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              style={styles.avatarGradient}
            >
              <Icon name="person" size={30} color="white" />
            </LinearGradient>
          </View>
          <View style={styles.callerDetails}>
            <Text style={styles.callerName}>{item.displayName || item.callerName}</Text>
            <Text style={styles.callerUID}>{getPartialUID(item.callerUID)}</Text>
            <Text style={styles.callType}>
              {item.callType === 'group' ? 'Group Call' : 'Direct Call'}
            </Text>
          </View>
        </View>
        <View style={styles.answerButton}>
          <LinearGradient
            colors={['#11998e', '#38ef7d']}
            style={styles.answerButtonGradient}
          >
            <Icon name="call" size={24} color="white" />
          </LinearGradient>
        </View>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Multiple Incoming Calls</Text>
          <Text style={styles.subtitle}>
            {incomingCalls.length} people are calling you. Choose which call to answer:
          </Text>
        </View>

        <FlatList
          data={incomingCalls}
          keyExtractor={(item) => item.callerUID}
          renderItem={renderCallItem}
          style={styles.callsList}
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.actions}>
          <TouchableOpacity 
            style={styles.declineAllButton} 
            onPress={handleDeclineAll}
            disabled={isAnswering}
          >
            <Text style={styles.declineAllText}>Decline All</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1D1D1F',
  },
  content: {
    flex: 1,
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 24,
  },
  callsList: {
    flex: 1,
  },
  callCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  callerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  avatarGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callerDetails: {
    flex: 1,
  },
  callerName: {
    fontSize: 20,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  callerUID: {
    fontSize: 14,
    color: '#8E8E93',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  callType: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  answerButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  answerButtonGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actions: {
    paddingTop: 20,
    alignItems: 'center',
  },
  declineAllButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 25,
    minWidth: 160,
  },
  declineAllText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});