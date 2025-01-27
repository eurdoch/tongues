import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Button,
  View,
  Alert,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';

function App(): React.JSX.Element {
  const selectAndReadEpub = async () => {
    try {
      const result = await DocumentPicker.pick({
        type: ['application/epub+zip'],
        copyTo: 'cachesDirectory',
      });

      const file = result[0];
      
      // Verify file extension as a backup check
      if (!file.name?.toLowerCase().endsWith('.epub')) {
        Alert.alert('Invalid File', 'Please select an EPUB file');
        return;
      }

      console.log('Selected EPUB file:', {
        name: file.name,
        size: file.size,
        type: file.type,
        uri: file.uri,
      });

      // If you want to read the actual file contents, you would need react-native-fs
      // For now, we just log the file metadata as requested
      
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        console.log('User cancelled the picker');
      } else {
        console.error('Error picking file:', err);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.buttonContainer}>
        <Button
          title="Select EPUB File"
          onPress={selectAndReadEpub}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default App;