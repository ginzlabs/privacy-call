import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { ContactsService } from '../services/ContactsService';
import { AppConfig } from '../config/AppConfig';

export default function CreateGroupScreen({ route, navigation }) {
  const { contacts } = route.params;
  const [groupName, setGroupName] = useState('');
  const [selectedContacts, setSelectedContacts] = useState([]);

  const handleToggleContact = (contact) => {
    if (selectedContacts.find(c => c.id === contact.id)) {
      setSelectedContacts(prev => prev.filter(c => c.id !== contact.id));
    } else {
      setSelectedContacts(prev => [...prev, contact]);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }
    
    if (selectedContacts.length < 2) {
      Alert.alert('Error', 'Please select at least 2 contacts');
      return;
    }

    try {
      const memberIds = selectedContacts.map(c => c.id);
      await ContactsService.createGroup(groupName.trim(), memberIds);
      Alert.alert('Success', 'Group created successfully');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to create group');
    }
  };

  const renderContact = ({ item }) => {
    const isSelected = selectedContacts.find(c => c.id === item.id);
    
    return (
      <TouchableOpacity
        style={[styles.contactItem, isSelected && styles.selectedContact]}
        onPress={() => handleToggleContact(item)}
      >
        <View style={styles.contactInfo}>
          <View style={styles.avatar}>
            <Icon name="person" size={24} color="#007AFF" />
          </View>
          <Text style={styles.contactName}>{item.nickname}</Text>
        </View>
        {isSelected && <Icon name="check" size={24} color="#34C759" />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Group Name</Text>
          <TextInput
            style={styles.textInput}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Enter group name"
            maxLength={AppConfig.VALIDATION.MAX_GROUP_NAME_LENGTH}
          />
        </View>

        <Text style={styles.sectionTitle}>
          Select Contacts ({selectedContacts.length} selected)
        </Text>

        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={renderContact}
          style={styles.list}
        />

        <TouchableOpacity
          style={[
            styles.createButton,
            (!groupName.trim() || selectedContacts.length < 2) && styles.buttonDisabled
          ]}
          onPress={handleCreateGroup}
          disabled={!groupName.trim() || selectedContacts.length < 2}
        >
          <Text style={styles.buttonText}>Create Group</Text>
        </TouchableOpacity>
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
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 16,
  },
  list: {
    flex: 1,
    marginBottom: 20,
  },
  contactItem: {
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 1,
    borderRadius: 10,
  },
  selectedContact: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#34C759',
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contactName: {
    fontSize: 16,
    color: '#1D1D1F',
  },
  createButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 25,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});