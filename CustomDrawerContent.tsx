import { Text, View, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { parseEpub } from "./utils";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { pick } from "@react-native-documents/picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import RNFS from "react-native-fs";

function CustomDrawerContent() {
    const navigation = useNavigation();
    const [isLoading, setIsLoading] = useState(false);
  
    const selectAndReadEpub = async () => {
      try {
        // Close drawer immediately
        navigation.dispatch(DrawerActions.closeDrawer());
        
        // Show loading indicator
        setIsLoading(true);
        
        const [file] = await pick({
          type: ['application/epub+zip'],
          mode: 'open',
        });
        
        // Copy the file to app storage for persistence
        const savedFilePath = await copyFileToAppStorage(file.uri);
        
        // Navigate to Reader screen with the file URI
        // If we successfully saved it, use the saved path, otherwise use the original URI
        navigation.navigate('Reader', { 
          fileUri: savedFilePath || file.uri,
          shouldRefreshHomeAfterClose: true // Flag to refresh HomeScreen when done
        });
        
      } catch (e: any) {
        console.log('pick failed: ', e);
      } finally {
        // Hide loading indicator
        setIsLoading(false);
      }
    };
    
    // Function to copy the file to app storage
    const copyFileToAppStorage = async (sourceUri: string): Promise<string | null> => {
      try {
        console.log("Original source URI:", sourceUri);
        
        // Generate a unique target filename with timestamp to avoid conflicts
        const timestamp = Date.now();
        const randomSuffix = Math.floor(Math.random() * 10000);
        
        // Try to extract original filename from URI if possible
        let fileName;
        
        if (sourceUri.includes('/')) {
          fileName = sourceUri.substring(sourceUri.lastIndexOf('/') + 1);
          // For URIs with query parameters, keep only the filename part
          if (fileName.includes('?')) {
            fileName = fileName.substring(0, fileName.indexOf('?'));
          }
        } else {
          // If we can't extract a reasonable filename, create one with the timestamp
          fileName = `book_${timestamp}.epub`;
        }
        
        // Ensure the extension is .epub
        const targetFileName = fileName.toLowerCase().endsWith('.epub') 
          ? `${fileName.substring(0, fileName.length - 5)}_${randomSuffix}.epub` 
          : `${fileName}_${randomSuffix}.epub`;
        
        // Create destination path in app's document directory
        const destPath = `${RNFS.DocumentDirectoryPath}/${targetFileName}`;
        
        console.log(`Attempting to copy EPUB from ${sourceUri} to ${destPath}`);
        
        // Try different methods to copy the file based on the URI type
        if (Platform.OS === 'android' && (sourceUri.startsWith('content://') || 
            sourceUri.startsWith('document:') || sourceUri.includes('document%3A'))) {
          
          try {
            console.log("Using readFile/writeFile method for content:// or document:// URI");
            
            // Read the file content using the original URI
            const base64Data = await RNFS.readFile(sourceUri, 'base64');
            // Write it to the destination
            await RNFS.writeFile(destPath, base64Data, 'base64');
            
            console.log('Successfully copied file to app storage using read/write method');
            return destPath;
          } catch (readWriteError) {
            console.error('Error using readFile/writeFile method:', readWriteError);
            
            // If read/write fails, try direct copyFile
            try {
              console.log("Trying direct copyFile as fallback");
              await RNFS.copyFile(sourceUri, destPath);
              console.log('Successfully copied file to app storage using direct copyFile');
              return destPath;
            } catch (copyError) {
              console.error('Error using direct copyFile:', copyError);
              return null;
            }
          }
        } else {
          // For regular file:// URIs, use copyFile
          try {
            await RNFS.copyFile(sourceUri, destPath);
            console.log('Successfully copied file to app storage');
            return destPath;
          } catch (copyError) {
            console.error('Error copying file:', copyError);
            return null;
          }
        }
      } catch (error) {
        console.error('Error in copyFileToAppStorage:', error);
        return null;
      }
    };

    const goToHome = () => {
      navigation.navigate('Home');
      navigation.dispatch(DrawerActions.closeDrawer());
    };
    
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Tongues</Text>
        </View>
        <View style={styles.content}>
          <TouchableOpacity 
            style={styles.navButton}
            onPress={goToHome}
          >
            <Text style={styles.navButtonText}>Home</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.button}
            onPress={selectAndReadEpub} 
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Open Book</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e4e8',
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a73e8',
  },
  content: {
    padding: 16,
  },
  navButton: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'flex-start',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e1e4e8',
  },
  navButtonText: {
    color: '#333',
    fontWeight: '500',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  }
});

export default CustomDrawerContent
