import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Button,
  View,
  Alert,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import * as ZipArchive from 'react-native-zip-archive';

function App(): React.JSX.Element {
  const selectAndReadEpub = async () => {
    let tempDir = '';
    try {
      // Select the EPUB file
      const result = await DocumentPicker.pick({
        type: ['application/epub+zip'],
        copyTo: 'cachesDirectory',
      });

      const file = result[0];
      
      // Verify file extension
      if (!file.name?.toLowerCase().endsWith('.epub')) {
        Alert.alert('Invalid File', 'Please select an EPUB file');
        return;
      }

      console.log('Selected EPUB file:', {
        name: file.name,
        size: file.size,
        type: file.type,
        uri: file.uri,
        fileCopyUri: file.fileCopyUri,
      });

      if (!file.fileCopyUri) {
        throw new Error('Failed to get local file path');
      }

      // Create a temporary directory for unzipping
      tempDir = `${RNFS.CachesDirectoryPath}/epubtemp_${Date.now()}`;
      await RNFS.mkdir(tempDir);
      
      try {
        // Get the correct file path
        const sourceFilePath = decodeURIComponent(file.fileCopyUri.replace('file://', ''));
        console.log('Attempting to unzip from:', sourceFilePath);
        console.log('Unzipping to:', tempDir);

        // Unzip the EPUB
        const unzipPath = await ZipArchive.unzip(sourceFilePath, tempDir);
        console.log('Successfully unzipped to:', unzipPath);
        
        // Recursively read and log all files
        const readAllFiles = async (dirPath: string) => {
          const items = await RNFS.readDir(dirPath);
          for (const item of items) {
            if (item.isFile()) {
              // Read and log file content
              console.log(`\nFile: ${item.name}`);
              try {
                const content = await RNFS.readFile(item.path, 'utf8');
                console.log(`Content: ${content.substring(0, 1000)}...`); // Only show first 1000 chars
              } catch (readError) {
                console.log('Could not read file as text:', item.name);
              }
            } else if (item.isDirectory()) {
              // Recursively read subdirectories
              console.log(`\nEntering directory: ${item.name}`);
              await readAllFiles(item.path);
            }
          }
        };

        await readAllFiles(unzipPath);
        console.log('Finished reading all files');
        
      } catch (error) {
        console.error('Error processing EPUB:', error);
        Alert.alert('Error', 'Failed to process EPUB file');
      }
      
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        console.log('User cancelled the picker');
      } else {
        console.error('Error picking file:', err);
        Alert.alert('Error', 'Failed to select file');
      }
    } finally {
      // Clean up in finally block to ensure it runs
      if (tempDir) {
        try {
          await RNFS.unlink(tempDir);
          console.log('Cleanup completed');
        } catch (cleanupError) {
          console.error('Cleanup failed:', cleanupError);
        }
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