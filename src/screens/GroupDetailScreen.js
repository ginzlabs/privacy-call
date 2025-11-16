import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { ContactsService } from '../services/ContactsService';
import { getPartialUID } from '../config/AppConfig';

export default function GroupDetailScreen({ route, navigation }) {
  const { group } = route.params;
  const [groupName, setGroupName] = useState(group.name);
  const [editing, setEditing] = useState(false);

  const handleCall = () => {
    navigation.navigate('Call', {
      type: 'group',
      group,
      isOutgoing: true,
    });
  };

  const handleSave = async () => {
    try {
      await ContactsService.updateGroupName(group.id, groupName);
      setEditing(false);
      Alert.alert('Success', 'Group name updated');
      // Update the group object for navigation
      group.name = groupName;
    } catch (error) {
      Alert.alert('Error', 'Failed to update group name');
    }
  };

  const handleRemove = () => {
    Alert.alert(
      'Delete Group',
      `Delete ${group.name}? This will not remove your contacts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ContactsService.removeGroup(group.id);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete group');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <LinearGradient
            colors={['#ff7b7b', '#667eea']}
            style={styles.avatarGradient}
          >
            <Icon name="group" size={60} color="white" />
          </LinearGradient>

          {editing ? (
            <View style={styles.editContainer}>
              <TextInput
                style={styles.textInput}
                value={groupName}
                onChangeText={setGroupName}
                placeholder="Enter group name"
                autoFocus
              />
              <View style={styles.editButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setGroupName(group.name);
                    setEditing(false);
                  }}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                  <Text style={styles.saveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.infoContainer}>
              <Text style={styles.groupName}>{groupName}</Text>
              <Text style={styles.memberCount}>
                {group.members.length} member{group.members.length !== 1 ? 's' : ''}
              </Text>
              <TouchableOpacity
                style={styles.editNameButton}
                onPress={() => setEditing(true)}
              >
                <Icon name="edit" size={16} color="#667eea" />
                <Text style={styles.editText}>Edit Name</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Members List */}
          <View style={styles.membersCard}>
            <Text style={styles.membersTitle}>Members</Text>
            {group.members.map((member, index) => (
              <View
                key={member.id}
                style={[
                  styles.memberItem,
                  index === group.members.length - 1 && styles.lastMemberItem,
                ]}
              >
                <View style={styles.memberInfo}>
                  <View style={styles.memberAvatar}>
                    <LinearGradient
                      colors={['#667eea', '#764ba2']}
                      style={styles.memberAvatarGradient}
                    >
                      <Icon name="person" size={16} color="white" />
                    </LinearGradient>
                  </View>
                  <View style={styles.memberDetails}>
                    <Text style={styles.memberNickname}>{member.nickname}</Text>
                    <Text style={styles.memberUid}>{getPartialUID(member.uid)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.callButton}
              onPress={handleCall}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#11998e', '#38ef7d']}
                style={styles.callButtonGradient}
              >
                <Icon name="call" size={24} color="white" />
                <Text style={styles.callText}>Call Group</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.removeButton}
              onPress={handleRemove}
              activeOpacity={0.7}
            >
              <Icon name="delete-outline" size={20} color="#FF3B30" />
              <Text style={styles.removeText}>Delete Group</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  content: {
    alignItems: 'center',
  },
  avatarGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  infoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  groupName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  memberCount: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 12,
  },
  editNameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  editText: {
    color: '#667eea',
    marginLeft: 4,
    fontSize: 15,
    fontWeight: '500',
  },
  editContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  textInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    width: '100%',
    textAlign: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  editButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  cancelText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  membersCard: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  membersTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  lastMemberItem: {
    borderBottomWidth: 0,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  memberAvatarGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberDetails: {
    flex: 1,
  },
  memberNickname: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  memberUid: {
    fontSize: 13,
    color: '#64748b',
    fontFamily: 'monospace',
  },
  actions: {
    width: '100%',
    alignItems: 'center',
  },
  callButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#11998e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  callButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  callText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  removeText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 6,
  },
});
