import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Alert, AppState, View, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';

// LiveKit setup
import { registerGlobals } from '@livekit/react-native';
import * as SplashScreen from 'expo-splash-screen';

registerGlobals();

// Keep splash screen visible during initialization
SplashScreen.preventAutoHideAsync();

// Suppress React Native Firebase deprecation warnings
import { LogBox } from 'react-native';
LogBox.ignoreLogs([
  /This method is deprecated.*React Native Firebase/,
  /Method called was/,
  /Please use.*instead/,
  /migration guide/,
  /rnfirebase.io/,
]);

// Also suppress console warnings
const originalWarn = console.warn;
console.warn = (...args) => {
  const message = args.join(' ');
  if (message.includes('React Native Firebase') || 
      message.includes('migration guide') || 
      message.includes('rnfirebase.io')) {
    return; // Suppress Firebase deprecation warnings
  }
  originalWarn.apply(console, args);
};

// Firebase imports
import { initializeFirebase, FirebaseService } from './src/services/FirebaseService';
import { NotificationService } from './src/services/NotificationService';

// Import screens
import ContactsScreen from './src/screens/ContactsScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AddContactScreen from './src/screens/AddContactScreen';
import AcceptInviteScreen from './src/screens/AcceptInviteScreen';
import ContactDetailScreen from './src/screens/ContactDetailScreen';
import GroupDetailScreen from './src/screens/GroupDetailScreen';
import CreateGroupScreen from './src/screens/CreateGroupScreen';
import IncomingCallScreen from './src/screens/IncomingCallScreen';
import MultipleIncomingCallsScreen from './src/screens/MultipleIncomingCallsScreen';
import CallScreen from './src/screens/CallScreen';

// Services
import { AuthService } from './src/services/AuthService';
import { ContactsService } from './src/services/ContactsService';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Main tab navigator for authenticated users
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size, focused }) => {
          let iconName;
          
          if (route.name === 'Contacts') {
            iconName = focused ? 'contacts' : 'contacts';
          } else if (route.name === 'History') {
            iconName = focused ? 'history' : 'history';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }
          
          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#667eea',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopWidth: 0,
          paddingBottom: 8,
          paddingTop: 8,
          height: 88,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
          elevation: 8,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          position: 'absolute',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen 
        name="Contacts" 
        component={ContactsScreen}
        options={{ tabBarLabel: 'Contacts' }}
      />
      <Tab.Screen 
        name="History" 
        component={HistoryScreen}
        options={{ tabBarLabel: 'History' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigationRef = useRef();

  useEffect(() => {
    // Initialize with mock services
    const initApp = async () => {
      const startTime = Date.now();
      console.log('⏱️ STARTUP: Initialization starting...');

      try {
        // Initialize Firebase
        const firebaseStart = Date.now();
        initializeFirebase();
        console.log('⏱️ STARTUP: Firebase init took', Date.now() - firebaseStart, 'ms');

        // Initialize Firebase Cloud Messaging
        const fcmStart = Date.now();
        console.log('📱 APP: Initializing NotificationService...');
        const initResult = await NotificationService.initialize();
        console.log('⏱️ STARTUP: NotificationService.initialize() took', Date.now() - fcmStart, 'ms');
        console.log('📱 APP: NotificationService.initialize() result:', initResult);

        // Set up incoming call handler
        console.log('📱 APP: Setting up onIncomingCall callback...');
        NotificationService.onIncomingCall = (callData) => {
          console.log('Navigating to IncomingCallScreen with data:', callData);
          
          // For cold start, wait until navigation is ready
          const attemptNavigation = () => {
            if (navigationRef.current) {
              console.log('COLD_START: Navigation ready - proceeding to IncomingCallScreen');
              navigationRef.current.navigate('IncomingCall', {
                callerName: callData.callerName,
                callerUID: callData.callerUID,
                roomName: callData.roomName,
                callType: callData.callType,
                timestamp: callData.timestamp,
              });
            } else {
              console.log('COLD_START: Navigation not ready - retrying in 100ms');
              setTimeout(attemptNavigation, 100);
            }
          };
          
          attemptNavigation();
        };
        console.log('📱 APP: onIncomingCall callback set successfully');

        // Set up multiple incoming calls handler
        console.log('📱 APP: Setting up onMultipleIncomingCalls callback...');
        NotificationService.onMultipleIncomingCalls = (calls) => {
          console.log('Navigating to MultipleIncomingCallsScreen with calls:', calls.length);
          
          // Wait for navigation to be ready (same pattern as single calls)
          const attemptNavigation = () => {
            if (navigationRef.current) {
              console.log('MULTIPLE_CALLS: Navigation ready - proceeding to MultipleIncomingCallsScreen');
              navigationRef.current.navigate('MultipleIncomingCalls', { calls });
            } else {
              console.log('MULTIPLE_CALLS: Navigation not ready - retrying in 100ms');
              setTimeout(attemptNavigation, 100);
            }
          };
          
          attemptNavigation();
        };
        console.log('📱 APP: onMultipleIncomingCalls callback set successfully');

        // Set up call cancellation handler
        console.log('📱 APP: Setting up onCallCancelled callback...');
        NotificationService.onCallCancelled = () => {
          console.log('App.js: Call was cancelled - navigating away from IncomingCallScreen');
          
          // CRITICAL: Set prevention flag to block future incoming call notifications
          console.log('App.js: Setting prevention flag to block incoming call');
          NotificationService.shouldBlockNextIncomingCall = true;
          
          // Clear the flag after 1 second (just enough time to block the rapid incoming call)
          setTimeout(() => {
            NotificationService.shouldBlockNextIncomingCall = false;
            console.log('App.js: Cleared prevention flag');
          }, 1000);
          
          navigationRef.current?.navigate('MainTabs', { screen: 'Contacts' });
        };

        // Set up call decline handler
        console.log('📱 APP: Setting up onCallDeclined callback...');
        NotificationService.onCallDeclined = () => {
          console.log('Call was declined - ending calling state');
          // This will be handled by the active CallScreen
        };
        console.log('📱 APP: onCallDeclined callback set successfully');

        console.log('📱 APP: ✅ All NotificationService callbacks configured and ready');

        // Auto sign in (no welcome screen)
        const authStart = Date.now();
        console.log('APP_INIT: Auto-signing in anonymously...');
        const userResult = await AuthService.signInAnonymously();
        setUser(userResult.user);
        const currentUserId = userResult.user.uid; // Store UID for background checks
        console.log('⏱️ STARTUP: Auth took', Date.now() - authStart, 'ms');

        // Re-register FCM token now that user is authenticated
        const tokenStart = Date.now();
        console.log('APP_INIT: Registering FCM token after authentication...');
        const fcmToken = await NotificationService.getFCMToken();
        if (fcmToken) {
          await NotificationService.registerTokenWithBackend(fcmToken);
        }
        console.log('⏱️ STARTUP: FCM token registration took', Date.now() - tokenStart, 'ms');

        // Check for incoming call data (from FCM notification)
        const incomingCallData = await NotificationService.getAndClearIncomingCallData();

        // Privacy cleanup (non-blocking background - doesn't delay startup)
        FirebaseService.functions().httpsCallable('cleanupExpiredContactRelationships')()
          .then(result => console.log('PRIVACY_CLEANUP: Background cleanup result:', result.data))
          .catch(err => console.error('PRIVACY_CLEANUP: Background cleanup error:', err));

        // CRITICAL: Preload contacts/invites data before showing UI
        // This prevents showing empty ContactsScreen before data loads
        if (!incomingCallData) {
          const dataLoadStart = Date.now();
          console.log('APP_INIT: Preloading contacts and invites data...');
          try {
            await Promise.all([
              ContactsService.getContacts(),
              ContactsService.getGroups(),
              ContactsService.getPendingInvites(true), // Skip server checks for speed - listener handles updates
            ]);
            console.log('⏱️ STARTUP: Data preload took', Date.now() - dataLoadStart, 'ms');
          } catch (dataError) {
            console.error('APP_INIT: Error preloading data:', dataError);
            // Continue anyway - ContactsScreen will load it on focus
          }
        }

        // Show UI (data is now loaded or we have incoming call)
        setLoading(false);

        // Hide splash screen - app is ready
        try {
          await SplashScreen.hideAsync();
          console.log('⏱️ STARTUP: Splash screen hidden, total time:', Date.now() - startTime, 'ms');
        } catch (splashError) {
          console.warn('Failed to hide splash screen:', splashError);
        }

        // Check for active incoming calls (NON-BLOCKING - runs in background)
        if (!incomingCallData && currentUserId) {
          const activeCallStart = Date.now();
          FirebaseService.functions().httpsCallable('checkActiveCallsToUser')({ targetUserUID: currentUserId })
            .then(result => {
              console.log('⏱️ STARTUP: Active call check completed in', Date.now() - activeCallStart, 'ms (background)');

              if (result.data.activeCalls && result.data.activeCalls.length > 0) {
                console.log('ACTIVE_CALL_CHECK: Found active calls, navigating...');

                // Only navigate if still on Contacts (user hasn't navigated away)
                const currentRoute = navigationRef.current?.getCurrentRoute();
                if (currentRoute?.name !== 'Contacts') {
                  console.log('ACTIVE_CALL_CHECK: User already navigated away, skipping');
                  return;
                }

                const activeCalls = result.data.activeCalls;

                // Navigate based on number of calls
                if (activeCalls.length === 1) {
                  navigationRef.current?.navigate('IncomingCall', {
                    callerName: 'Unknown Caller',
                    callerUID: activeCalls[0].callerUID,
                    roomName: activeCalls[0].roomName,
                    callType: activeCalls[0].callType,
                  });
                } else {
                  const callsData = activeCalls.map(call => ({
                    callerName: 'Unknown Caller',
                    callerUID: call.callerUID,
                    roomName: call.roomName,
                    callType: call.callType,
                    timestamp: Date.now(),
                  }));
                  navigationRef.current?.navigate('MultipleIncomingCalls', { calls: callsData });
                }
              }
            })
            .catch(err => console.error('ACTIVE_CALL_CHECK: Background error:', err));
        }
      } catch (error) {
        console.error('App initialization error:', error);
        setLoading(false);
        // Hide splash even on error
        try {
          await SplashScreen.hideAsync();
        } catch (splashError) {
          console.warn('Failed to hide splash on error:', splashError);
        }
      }
    };

    initApp();
  }, []);

  // AppState listener to detect when app becomes active
  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      console.log('APP_STATE: App state changed to:', nextAppState);

      if (nextAppState === 'active') {
        console.log('APP_STATE: App became active - checking for active calls');

        // CRITICAL: Don't navigate if user is already in a call screen
        // This prevents re-showing incoming call screen after permission dialogs
        const currentRoute = navigationRef.current?.getCurrentRoute();
        const currentRouteName = currentRoute?.name;
        console.log('APP_STATE: Current route:', currentRouteName);

        if (currentRouteName === 'Call' || currentRouteName === 'IncomingCall' || currentRouteName === 'MultipleIncomingCalls') {
          console.log('APP_STATE: User already in call screen - skipping navigation');
          return;
        }

        // Wait a moment for any background cleanup to finish
        // Prevents ghost calls when switching apps immediately after ending call
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
          const currentUserId = await AuthService.getCurrentUserId();
          if (!currentUserId) {
            console.log('APP_STATE: No authenticated user - skipping active call check');
            return;
          }

          const checkActiveCallsFunction = FirebaseService.functions().httpsCallable('checkActiveCallsToUser');
          const result = await checkActiveCallsFunction({
            targetUserUID: currentUserId,
          });

          if (result.data.activeCalls && result.data.activeCalls.length > 0) {
            console.log('APP_STATE: Found', result.data.activeCalls.length, 'active calls - filtering recently ended');

            // Filter out rooms we just left (prevents ghost calls)
            const LiveKitService = require('./src/services/LiveKitService').LiveKitService;
            const activeCalls = result.data.activeCalls.filter(call => {
              if (LiveKitService.wasRecentlyEnded(call.roomName)) {
                console.log('APP_STATE: Skipping recently ended room:', call.roomName);
                return false;
              }
              return true;
            });

            if (activeCalls.length === 0) {
              console.log('APP_STATE: All calls were recently ended - skipping navigation');
              return;
            }

            console.log('APP_STATE: Navigating to', activeCalls.length, 'active call(s)');

            if (activeCalls.length === 1) {
              // Single active call
              const activeCall = activeCalls[0];
              console.log('APP_STATE: Navigating to single incoming call');
              navigationRef.current?.navigate('IncomingCall', {
                callerName: 'Unknown Caller',
                callerUID: activeCall.callerUID,
                roomName: activeCall.roomName,
                callType: activeCall.callType,
              });
            } else {
              // Multiple active calls
              console.log('APP_STATE: Navigating to multiple incoming calls');
              const callsData = activeCalls.map(call => ({
                callerName: 'Unknown Caller',
                callerUID: call.callerUID,
                roomName: call.roomName,
                callType: call.callType,
                timestamp: Date.now(),
              }));

              navigationRef.current?.navigate('MultipleIncomingCalls', { calls: callsData });
            }
          } else {
            console.log('APP_STATE: No active calls found');
          }
        } catch (error) {
          console.error('APP_STATE: Error checking for active calls:', error);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
    };
  }, []);


  if (loading) {
    // Show purple loading screen (fallback if splash screen doesn't work)
    return (
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        <ActivityIndicator size="large" color="white" />
      </LinearGradient>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar style="auto" />
      <Stack.Navigator
        initialRouteName="MainTabs"
        screenOptions={{
          headerShown: false,
        }}
      >
        
        {/* Main app screens */}
        <Stack.Screen 
          name="MainTabs" 
          component={MainTabs}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen 
          name="AddContact" 
          component={AddContactScreen}
          options={{
            headerShown: true,
            title: 'Add Contact',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen 
          name="AcceptInvite" 
          component={AcceptInviteScreen}
          options={{
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="ContactDetail"
          component={ContactDetailScreen}
          options={{
            headerShown: true,
            title: 'Contact Details',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="GroupDetail"
          component={GroupDetailScreen}
          options={{
            headerShown: true,
            title: 'Group Details',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="CreateGroup"
          component={CreateGroupScreen}
          options={{
            headerShown: true,
            title: 'Create Group',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen 
          name="IncomingCall" 
          component={IncomingCallScreen}
          options={{
            gestureEnabled: false,
            presentation: 'fullScreenModal',
          }}
        />
        <Stack.Screen 
          name="MultipleIncomingCalls" 
          component={MultipleIncomingCallsScreen}
          options={{
            gestureEnabled: false,
            presentation: 'fullScreenModal',
          }}
        />
        <Stack.Screen 
          name="Call" 
          component={CallScreen}
          options={{
            gestureEnabled: false,
            presentation: 'fullScreenModal',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}