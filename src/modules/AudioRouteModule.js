/**
 * AudioRouteModule
 *
 * Native module wrapper for direct iOS AVAudioSession control
 * This bypasses LiveKit's automatic audio management
 *
 * For now, this is a JavaScript-only implementation that attempts
 * to use LiveKit's AudioSession API more aggressively
 */

import { Platform, NativeModules } from 'react-native';
import { AudioSession } from '@livekit/react-native';

export const AudioRouteModule = {
  /**
   * Force audio to speaker (loudspeaker)
   */
  async setToSpeaker() {
    try {
      console.log('AUDIO_ROUTE: Forcing speaker output');

      if (Platform.OS === 'ios') {
        // Try multiple approaches for iOS

        // Approach 1: Reconfigure without stopping (might work better during active call)
        await AudioSession.configureAudio({
          ios: {
            defaultOutput: 'speaker',
          },
        });

        // Small delay to let configuration apply
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('AUDIO_ROUTE: Speaker set via configureAudio');
        return true;
      } else {
        // Android
        await AudioSession.configureAudio({
          android: {
            preferredOutputList: ['speaker'],
            audioTypeOptions: {
              manageAudioFocus: true,
              audioMode: 'communication',
            },
          },
        });
        return true;
      }
    } catch (error) {
      console.error('AUDIO_ROUTE: Error setting speaker:', error);
      return false;
    }
  },

  /**
   * Force audio to earpiece (receiver)
   */
  async setToEarpiece() {
    try {
      console.log('AUDIO_ROUTE: Forcing earpiece output');

      if (Platform.OS === 'ios') {
        // Try multiple approaches for iOS

        // Approach 1: Reconfigure without stopping
        await AudioSession.configureAudio({
          ios: {
            defaultOutput: 'earpiece',
          },
        });

        // Small delay to let configuration apply
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('AUDIO_ROUTE: Earpiece set via configureAudio');
        return true;
      } else {
        // Android
        await AudioSession.configureAudio({
          android: {
            preferredOutputList: ['earpiece'],
            audioTypeOptions: {
              manageAudioFocus: true,
              audioMode: 'communication',
            },
          },
        });
        return true;
      }
    } catch (error) {
      console.error('AUDIO_ROUTE: Error setting earpiece:', error);
      return false;
    }
  },
};

export default AudioRouteModule;
