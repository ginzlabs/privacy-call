import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { ContactsService } from '../services/ContactsService';
import { getPartialUID } from '../config/AppConfig';

export default function ContactDetailScreen({ route, navigation }) {
  const { contact } = route.params;
  const [nickname, setNickname] = useState(contact.nickname);
  const [editing, setEditing] = useState(false);

  const handleCall = () => {
    navigation.navigate('Call', { 
      type: 'direct', 
      contact,
      isOutgoing: true 
    });
  };

  const handleSave = async () => {
    try {
      await ContactsService.updateContactNickname(contact.id, nickname);
      setEditing(false);
      Alert.alert('Success', 'Nickname updated');
    } catch (error) {
      Alert.alert('Error', 'Failed to update nickname');
    }
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove Contact',
      `Remove ${contact.nickname} from your contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await ContactsService.removeContact(contact.id);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to remove contact');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.avatar}>
          <Icon name="person" size={60} color="#007AFF" />
        </View>

        {editing ? (
          <View style={styles.editContainer}>
            <TextInput
              style={styles.textInput}
              value={nickname}
              onChangeText={setNickname}
              placeholder="Enter nickname"
              autoFocus
            />
            <View style={styles.editButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.infoContainer}>
            <Text style={styles.nickname}>{nickname}</Text>
            <Text style={styles.uid}>{getPartialUID(contact.uid)}</Text>
            <TouchableOpacity style={styles.editNicknameButton} onPress={() => setEditing(true)}>
              <Icon name="edit" size={16} color="#007AFF" />
              <Text style={styles.editText}>Edit Nickname</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.callButton} onPress={handleCall}>
            <Icon name="call" size={24} color="white" />
            <Text style={styles.callText}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.removeButton} onPress={handleRemove}>
            <Icon name="person-remove" size={20} color="#FF3B30" />
            <Text style={styles.removeText}>Remove Contact</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  infoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  nickname: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginBottom: 8,
  },
  uid: {
    fontSize: 16,
    color: '#8E8E93',
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  editNicknameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  editText: {
    color: '#007AFF',
    marginLeft: 4,
  },
  editContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 40,
  },
  textInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    width: '80%',
    textAlign: 'center',
    marginBottom: 16,
  },
  editButtons: {
    flexDirection: 'row',
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 10,
  },
  cancelText: {
    color: '#8E8E93',
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  actions: {
    width: '100%',
    alignItems: 'center',
  },
  callButton: {
    backgroundColor: '#34C759',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 25,
    marginBottom: 20,
  },
  callText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
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
    marginLeft: 6,
  },
});