import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  Modal,
  Button,
} from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { pick } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import ContentScreen from './ContentScreen';
import { createDrawerNavigator } from '@react-navigation/drawer';
import TOCItem from './types/TOCItem';
import HomeScreen from './HomeScreen';
import { parseEpub } from './utils';

// Available languages for translation
const languages = [
  { label: 'French', value: 'French' },
  { label: 'Spanish', value: 'Spanish' },
  { label: 'German', value: 'German' },
  { label: 'Italian', value: 'Italian' },
  { label: 'Dutch', value: 'Dutch' },
];

// Step 4: Create custom drawer content component (optional)
function CustomDrawerContent() {
  const navigation = useNavigation();

  const selectAndReadEpub = async () => {
    try {
      const [file] = await pick({
        type: ['application/epub+zip'],
        mode: 'open',
      });

      const contents = await parseEpub(file.uri);
      if (contents) {
        console.log(contents);
      } else {
        console.log('No opf file found.');
      }
    } catch (e: any) {
      console.log('pick failed: ', e);
    }
  };
  
  return (
    <View>
      <View>
        <Text>tongues</Text>
      </View>
      <View>
        <Button 
          title="Open Book" 
          onPress={selectAndReadEpub} 
        />
      </View>
    </View>
  );
}

const Drawer = createDrawerNavigator();

function App() {
  return (
    <NavigationContainer>
      <Drawer.Navigator
        initialRouteName='Home'
        drawerContent={() => <CustomDrawerContent />}
        screenOptions={{
          drawerStyle: {
            width: 240,
          },
        }}
      >
        <Drawer.Screen name="Home" component={HomeScreen} />
      </Drawer.Navigator>
      
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  tocContainer: {
    flex: 1,
    padding: 10,
  },
  tocHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  languageNote: {
    fontSize: 14,
    marginBottom: 5,
    color: '#444',
  },
  changeLanguageButton: {
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 5,
    marginBottom: 15,
    alignSelf: 'flex-start',
  },
  changeLanguageButtonText: {
    fontSize: 14,
    color: '#007AFF',
  },
  tocItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  tocText: {
    fontSize: 16,
  },
  noContentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noContentText: {
    fontSize: 16,
    color: '#666',
  },
  headerButton: {
    padding: 10,
  },
  headerButtonText: {
    fontSize: 24,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '80%',
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  languageList: {
    maxHeight: 300,
  },
  languageItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectedLanguageItem: {
    backgroundColor: '#e6f7ff',
  },
  languageText: {
    fontSize: 16,
  },
  selectedLanguageText: {
    fontWeight: 'bold',
    color: '#007AFF',
  },
  closeButton: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
});

export default App;
