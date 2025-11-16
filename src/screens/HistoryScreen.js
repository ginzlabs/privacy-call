import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SafeAreaView,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { ContactsService } from '../services/ContactsService';

export default function HistoryScreen() {
  const [history, setHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load history when screen focuses (includes server sync automatically)
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async () => {
    try {
      const historyData = await ContactsService.getHistory();
      setHistory(historyData);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const getHistoryIcon = (type) => {
    switch (type) {
      case 'call_outgoing':
        return { name: 'call-made', color: '#34C759' };
      case 'call_incoming':
        return { name: 'call-received', color: '#007AFF' };
      case 'call_missed':
        return { name: 'call-received', color: '#FF3B30' };
      case 'call_failed':
        return { name: 'error', color: '#FF3B30' };
      case 'call_cancelled':
        return { name: 'cancel', color: '#FF9500' };
      case 'call_timeout':
        return { name: 'schedule', color: '#FF9500' };
      case 'call_ended':
        return { name: 'call-end', color: '#34C759' };
      case 'contact_added':
        return { name: 'person-add', color: '#34C759' };
      case 'contact_removed':
        return { name: 'person-remove', color: '#FF3B30' };
      case 'contact_removed_by_other':
        return { name: 'person-remove-outline', color: '#FF9500' };
      case 'contact_updated':
        return { name: 'edit', color: '#FF9500' };
      case 'group_created':
        return { name: 'group-add', color: '#34C759' };
      case 'invite_deleted':
        return { name: 'link-off', color: '#8E8E93' };
      case 'invite_created':
        return { name: 'person-add', color: '#34C759' };
      default:
        return { name: 'history', color: '#8E8E93' };
    }
  };

  const formatHistoryText = (item) => {
    switch (item.type) {
      case 'call_outgoing':
        return `Called ${item.contactName || 'Unknown'}`;
      case 'call_incoming':
        return `Call from ${item.contactName || 'Unknown'}`;
      case 'call_missed':
        return `Missed call from ${item.contactName || 'Unknown'}`;
      case 'call_failed':
        return `Call failed to ${item.contactName || 'Unknown'}`;
      case 'call_cancelled':
        return `Cancelled call to ${item.contactName || 'Unknown'}`;
      case 'call_timeout':
        return `Call timeout: ${item.contactName || 'Unknown'} didn't answer`;
      case 'call_ended':
        const duration = item.duration && typeof item.duration === 'number' && !isNaN(item.duration) ? item.duration : 0;
        const durationText = duration > 0 ? ` (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')})` : '';
        return `Call ended with ${item.contactName || 'Unknown'}${durationText}`;
      case 'contact_added':
        return `Added contact: ${item.contactNickname || 'Unknown'}`;
      case 'contact_removed':
        return `Removed contact: ${item.contactNickname || 'Unknown'}`;
      case 'contact_removed_by_other':
        return `${item.contactNickname || 'Contact'} removed you`;
      case 'contact_updated':
        return `Updated contact: ${item.contactNickname || 'Unknown'}`;
      case 'group_created':
        const memberCount = item.memberCount && typeof item.memberCount === 'number' ? item.memberCount : 0;
        return `Created group: ${item.groupName || 'Unknown'} (${memberCount} members)`;
      case 'invite_deleted':
        return 'Deleted invite';
      case 'invite_created':
        return 'Created invite link';
      default:
        return 'Unknown activity';
    }
  };

  const formatTime = (timestamp) => {
    try {
      if (!timestamp) {
        return 'Unknown time';
      }

      const date = new Date(timestamp);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid time';
      }

      const now = new Date();
      const diffMs = now - date;
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = diffMs / (1000 * 60 * 60);
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      // Show seconds for events under 60 seconds
      if (diffSeconds < 60) {
        return `${Math.max(0, diffSeconds)}s ago`;
      } else if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
      } else if (diffHours < 24) {
        return `${Math.floor(diffHours)}h ago`;
      } else if (diffDays < 7) {
        return `${Math.floor(diffDays)}d ago`;
      } else {
        return date.toLocaleDateString();
      }
    } catch (error) {
      console.warn('HISTORY_ERROR: formatTime error:', error, timestamp);
      return 'Unknown time';
    }
  };

  const formatUTCTimestamp = (timestamp) => {
    try {
      if (!timestamp) {
        return '';
      }

      const date = new Date(timestamp);

      if (isNaN(date.getTime())) {
        return '';
      }

      // Format as UTC with seconds: "2025-01-15 14:23:45 UTC"
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');

      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
    } catch (error) {
      console.warn('HISTORY_ERROR: formatUTCTimestamp error:', error, timestamp);
      return '';
    }
  };

  const renderHistoryItem = ({ item }) => {
    try {
      if (!item) return null;

      const safeItem = {
        type: String(item.type || 'unknown'),
        contactName: String(item.contactName || 'Unknown'),
        timestamp: item.timestamp || Date.now(),
        duration: typeof item.duration === 'number' ? item.duration : 0,
      };

      const iconData = getHistoryIcon(safeItem.type);
      const historyText = String(formatHistoryText(safeItem));
      const timeText = String(formatTime(safeItem.timestamp));
      const utcTimestamp = String(formatUTCTimestamp(safeItem.timestamp));

      return (
        <View style={styles.modernHistoryCard}>
          <View style={styles.modernHistoryItem}>
            <View style={styles.modernIconContainer}>
              <LinearGradient
                colors={[`${iconData.color}20`, `${iconData.color}40`]}
                style={styles.iconGradient}
              >
                <Icon name={iconData.name} size={20} color={iconData.color} />
              </LinearGradient>
            </View>
            <View style={styles.modernHistoryContent}>
              <Text style={styles.modernHistoryText}>{historyText}</Text>
              <View style={styles.historyMeta}>
                <Text style={styles.modernHistoryTime}>{timeText}</Text>
                {safeItem.duration > 0 && (
                  <Text style={styles.modernHistoryDuration}>
                    {Math.floor(safeItem.duration / 60)}:{(safeItem.duration % 60).toString().padStart(2, '0')}
                  </Text>
                )}
              </View>
              {utcTimestamp && (
                <Text style={styles.modernHistoryUTC}>{utcTimestamp}</Text>
              )}
            </View>
          </View>
        </View>
      );
    } catch (error) {
      return (
        <View style={styles.modernHistoryCard}>
          <View style={styles.modernHistoryItem}>
            <Text style={styles.modernHistoryText}>History item error</Text>
          </View>
        </View>
      );
    }
  };

  const renderLoadingState = () => (
    <View style={styles.modernEmptyState}>
      <ActivityIndicator size="large" color="#667eea" style={{ marginBottom: 20 }} />
      <Text style={styles.modernEmptyTitle}>Loading History</Text>
      <Text style={styles.modernEmptySubtitle}>
        Getting your call history and recent activity...
      </Text>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.modernEmptyState}>
      <View style={styles.emptyIconContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.emptyIconGradient}
        >
          <Icon name="history" size={50} color="white" />
        </LinearGradient>
      </View>
      <Text style={styles.modernEmptyTitle}>No History Yet</Text>
      <Text style={styles.modernEmptySubtitle}>
        Your call history and contact changes will appear here
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.modernContainer}>
      <StatusBar style="dark" backgroundColor="#f8fafc" />
      
      
      <View style={styles.simpleHeader}>
        <Text style={styles.simpleHeaderTitle}>History</Text>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item, index) => {
          try {
            return `${item?.timestamp || Date.now()}_${index}`;
          } catch (error) {
            console.warn('HISTORY_ERROR: keyExtractor error:', error, item);
            return `history_${index}_${Date.now()}`;
          }
        }}
        renderItem={renderHistoryItem}
        ListEmptyComponent={loading ? renderLoadingState : renderEmptyState}
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
  modernList: {
    flex: 1,
    paddingTop: 20,
  },
  modernListContent: {
    paddingHorizontal: 20,
    paddingBottom: 100, // Extra space for tab bar
  },
  
  // Modern History Card
  modernHistoryCard: {
    backgroundColor: 'white',
    marginVertical: 6,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  modernHistoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  modernIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  iconGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernHistoryContent: {
    flex: 1,
  },
  modernHistoryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 6,
    lineHeight: 22,
  },
  historyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modernHistoryTime: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  modernHistoryDuration: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  modernHistoryUTC: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  
  // Modern Empty State
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
});