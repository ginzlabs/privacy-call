import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { AudioSession } from '@livekit/react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Platform } from 'react-native';

/**
 * Audio Routing Test Component
 *
 * TEST COMPONENT - For verifying speaker/earpiece switching works
 * Uses the same AudioSession API as actual calls
 * Tests the API calls and provides haptic feedback
 * Can be commented out after testing is complete
 */

export default function AudioRoutingTest() {
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [audioSessionActive, setAudioSessionActive] = useState(false);

  // Initialize audio session when component mounts
  useEffect(() => {
    const initAudioSession = async () => {
      try {
        console.log('TEST_AUDIO: Initializing audio session...');

        await AudioSession.configureAudio({
          android: {
            preferredOutputList: ['earpiece'],
            audioTypeOptions: {
              manageAudioFocus: true,
              audioMode: 'communication',
              audioFocusMode: 'gainTransient',
              audioStreamType: 'voiceCall',
              audioAttributesUsageType: 'voiceCommunication',
              audioAttributesContentType: 'speech',
            },
          },
          ios: {
            defaultOutput: 'earpiece',
          },
        });

        await AudioSession.startAudioSession();
        setAudioSessionActive(true);
        console.log('TEST_AUDIO: Audio session started with earpiece routing');
      } catch (error) {
        console.error('TEST_AUDIO: Error initializing audio session:', error);
        Alert.alert('Error', 'Failed to initialize audio session');
      }
    };

    initAudioSession();

    // Cleanup
    return () => {
      if (audioSessionActive) {
        AudioSession.stopAudioSession()
          .then(() => console.log('TEST_AUDIO: Audio session stopped'))
          .catch(err => console.error('TEST_AUDIO: Error stopping session:', err));
      }
      if (sound) {
        sound.unloadAsync()
          .catch(err => console.error('TEST_AUDIO: Error unloading sound:', err));
      }
    };
  }, []);

  const playTestSound = async () => {
    try {
      console.log('TEST_AUDIO: Playing test sound');

      // If already playing, stop first
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
      }

      // Set audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });

      // Use a simple online test tone (440 Hz beep)
      // Alternative: Use any small mp3 URL or local asset
      const soundUri = 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3';

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: soundUri },
        { shouldPlay: true, isLooping: true },
        onPlaybackStatusUpdate
      );

      setSound(newSound);
      setIsPlaying(true);
      console.log('TEST_AUDIO: Sound playing');
    } catch (error) {
      console.error('TEST_AUDIO: Error playing sound:', error);
      Alert.alert('Error', 'Failed to play test sound: ' + error.message);
    }
  };

  const stopTestSound = async () => {
    try {
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        setIsPlaying(false);
        console.log('TEST_AUDIO: Sound stopped');
      }
    } catch (error) {
      console.error('TEST_AUDIO: Error stopping sound:', error);
    }
  };

  const onPlaybackStatusUpdate = (status) => {
    if (status.didJustFinish) {
      setIsPlaying(false);
    }
  };

  const toggleSpeaker = async () => {
    try {
      const newSpeakerState = !isSpeakerOn;
      console.log('TEST_AUDIO: Toggling speaker to:', newSpeakerState ? 'ON' : 'OFF');

      // Use the SAME logic as actual calls
      await AudioSession.stopAudioSession();

      await AudioSession.configureAudio({
        android: {
          preferredOutputList: [newSpeakerState ? 'speaker' : 'earpiece'],
          audioTypeOptions: {
            manageAudioFocus: true,
            audioMode: 'communication',
            audioFocusMode: 'gainTransient',
            audioStreamType: 'voiceCall',
            audioAttributesUsageType: 'voiceCommunication',
            audioAttributesContentType: 'speech',
          },
        },
        ios: {
          defaultOutput: newSpeakerState ? 'speaker' : 'earpiece',
        },
      });

      await AudioSession.startAudioSession();

      setIsSpeakerOn(newSpeakerState);
      console.log('TEST_AUDIO: Speaker toggled to:', newSpeakerState ? 'speaker' : 'earpiece');

      Alert.alert(
        'Audio Output Changed',
        `Audio is now playing through: ${newSpeakerState ? 'LOUDSPEAKER (bottom)' : 'EARPIECE (top)'}`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('TEST_AUDIO: Error toggling speaker:', error);
      Alert.alert('Error', 'Failed to toggle speaker');

      // Try to restart audio session
      try {
        await AudioSession.startAudioSession();
      } catch (restartError) {
        console.error('TEST_AUDIO: Could not restart audio session:', restartError);
      }
    }
  };

  return (
    <View style={styles.testContainer}>
      <View style={styles.testCard}>
        <Text style={styles.testTitle}>🔊 Audio Routing Test</Text>
        <Text style={styles.testSubtitle}>
          Test speaker/earpiece switching on physical device
        </Text>

        {/* Current Output Display */}
        <View style={styles.statusBadge}>
          <Icon
            name={isSpeakerOn ? 'volume-up' : 'hearing'}
            size={20}
            color={isSpeakerOn ? '#3b82f6' : '#10b981'}
          />
          <Text style={styles.statusText}>
            {isSpeakerOn ? 'Loudspeaker (Bottom)' : 'Earpiece (Top)'}
          </Text>
        </View>

        {/* Play/Stop Sound Button */}
        <TouchableOpacity
          style={styles.playButton}
          onPress={isPlaying ? stopTestSound : playTestSound}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={isPlaying ? ['#ef4444', '#dc2626'] : ['#10b981', '#059669']}
            style={styles.playButtonGradient}
          >
            <Icon name={isPlaying ? 'stop' : 'play-arrow'} size={32} color="white" />
            <Text style={styles.playButtonText}>
              {isPlaying ? 'Stop Test Sound' : 'Play Test Sound'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Toggle Speaker Button */}
        <TouchableOpacity
          style={styles.toggleButton}
          onPress={toggleSpeaker}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.toggleButtonGradient}
          >
            <Icon
              name={isSpeakerOn ? 'hearing' : 'volume-up'}
              size={24}
              color="white"
            />
            <Text style={styles.toggleButtonText}>
              Switch to {isSpeakerOn ? 'Earpiece' : 'Speaker'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.instructionsText}>
          1. Tap "Play Test Sound"{'\n'}
          2. Hold phone to ear - sound should come from top{'\n'}
          3. Tap "Switch to Speaker"{'\n'}
          4. Sound should move to bottom speaker{'\n'}
          5. Tap "Switch to Earpiece" to test return
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  testContainer: {
    padding: 20,
  },
  testCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  testTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  testSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
    textAlign: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginLeft: 8,
  },
  playButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  playButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  playButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 12,
  },
  toggleButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  toggleButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  toggleButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  instructionsText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 20,
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
  },
});
