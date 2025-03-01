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
        // Extract filename from the path or use a timestamp
        const fileName = sourceUri.substring(sourceUri.lastIndexOf('/') + 1);
        const targetFileName = fileName.endsWith('.epub') 
          ? fileName 
          : `${fileName}.epub`;
        
        // Create destination path in app's document directory
        const destPath = `${RNFS.DocumentDirectoryPath}/${targetFileName}`;
        
        console.log(`Copying EPUB from ${sourceUri} to ${destPath}`);
        
        // Copy the file
        await RNFS.copyFile(sourceUri, destPath);
        
        console.log('Successfully copied file to app storage');
        return destPath;
      } catch (error) {
        console.error('Error copying file to app storage:', error);
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
