import { Text, View, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { pick } from "@react-native-documents/picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import RNFS from "react-native-fs";
import { parseEpub } from "./components/reader/EpubLoader";
import TableOfContents from "./components/TableOfContents";
import { useNavigationContext } from "./NavigationContext";
import { findFirstContentTag, readTextFile } from "./utils";

function CustomDrawerContent() {
    const navigation = useNavigation();
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const { navMap, setNavMap } = useNavigationContext();

    useEffect(() => {
      // Example: Initialize or update navMap if needed
      console.log('[CustomDrawerContent] Component mounted, current navMap:', navMap);
      
      // If you need to set initial navMap data:
      // setNavMap(initialData);
      
      // Clean up if necessary
      return () => {
        console.log('[CustomDrawerContent] Component unmounting');
      };
    }, []);
  
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
        
        console.log("Selected file:", file);
        
        let fileSize = 0;
        try {
          const stats = await RNFS.stat(file.uri);
          fileSize = stats.size;
          console.log(`Selected file size: ${fileSize} bytes`);
        } catch (statError) {
          console.log('Error getting file stats:', statError);
        }
        
        // Look for existing files with the same size first
        const existingFiles = await findExistingFiles(fileSize);
        if (existingFiles.length > 0) {
          console.log(`Found ${existingFiles.length} potential matches by size`);
          
          // Use the first one - this is likely to be the same file
          // TODO this is terrible change to ensure sameness
          const existingPath = existingFiles[0].path;
          console.log(`Using existing file: ${existingPath}`);

          const result = await parseEpub(existingPath);
          const firstContentElem = findFirstContentTag(result.navMap);
          const firstContentPath = result.basePath + '/' + firstContentElem.getAttribute('src');
          const firstContents = await readTextFile(firstContentPath);
          setNavMap(result.navMap);

          // Navigate to reader screen
          navigation.navigate('Reader', { content: firstContents });
          return;
        }
        
        // Copy the file to app storage for persistence
        const savedFilePath = await copyFileToAppStorage(file.uri);
        
        if (savedFilePath) {
          const result = await parseEpub(savedFilePath);
          const firstContentElem = findFirstContentTag(result.navMap);
          const firstContentPath = result.basePath + '/' + firstContentElem.getAttribute('src');
          const firstContents = await readTextFile(firstContentPath);
          setNavMap(result.navMap);

          // Navigate to reader screen
          navigation.navigate('Reader', { content: firstContents });
        } else {
          throw new Error("Could not save file.");
        }
      } catch (e: any) {
        console.log('pick failed: ', e);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Function to find existing files with the same size
    const findExistingFiles = async (fileSize: number): Promise<Array<{path: string, name: string}>> => {
      if (fileSize === 0) return [];
      
      try {
        // Get all EPUB files in the app's storage
        const files = await RNFS.readDir(RNFS.DocumentDirectoryPath);
        const epubFiles = files.filter(file => file.name.toLowerCase().endsWith('.epub'));
        
        console.log(`Found ${epubFiles.length} EPUB files in app storage`);
        
        // Check each file's size
        const sizeMatches = [];
        for (const file of epubFiles) {
          try {
            const stats = await RNFS.stat(file.path);
            console.log(`File ${file.name}: ${stats.size} bytes`);
            
            // The file size is a reliable way to identify the same file
            if (stats.size === fileSize) {
              console.log(`Size match found: ${file.path}`);
              sizeMatches.push({ path: file.path, name: file.name });
            }
          } catch (statError) {
            console.log(`Error checking file size for ${file.name}:`, statError);
          }
        }
        
        return sizeMatches;
      } catch (error) {
        console.error('Error finding existing files:', error);
        return [];
      }
    };
    
    // Function to check if the file already exists in the documents directory
    const checkIfFileExists = async (sourceUri: string): Promise<string | null> => {
      try {
        console.log("Checking if file already exists locally");
        // List all files in DocumentDirectoryPath
        const files = await RNFS.readDir(RNFS.DocumentDirectoryPath);
        const epubFiles = files.filter(file => file.name.toLowerCase().endsWith('.epub'));
        
        // If there's no source URI or no local files, return null
        if (!sourceUri || epubFiles.length === 0) {
          console.log("No existing files found or no source URI provided");
          return null;
        }
        
        // For content:// or document:// URIs, we need to compare by content hash
        if (Platform.OS === 'android' && (sourceUri.startsWith('content://') || 
            sourceUri.startsWith('document:') || sourceUri.includes('document%3A'))) {
          
          try {
            // Try to read a small sample of the source file to create a fingerprint
            const sourceContent = await RNFS.readFile(sourceUri, 'base64', 1024); // Read first 1KB
            console.log(`Read source file sample: ${sourceContent.substring(0, 20)}...`);
            
            // Check each epub file by reading the same byte range
            for (const file of epubFiles) {
              try {
                const localContent = await RNFS.readFile(file.path, 'base64', 1024);
                if (sourceContent === localContent) {
                  console.log(`Found matching file content: ${file.path}`);
                  return file.path;
                }
              } catch (localReadError) {
                console.log(`Error reading local file ${file.name}:`, localReadError);
                // Continue to next file
              }
            }
          } catch (sourceReadError) {
            console.log('Error reading source file for comparison:', sourceReadError);
            // Fall through to metadata comparison
          }
          
          // If content comparison fails, we can't reliably determine if it's a duplicate
          console.log("Content comparison did not find a match");
          return null;
        } else {
          // For regular URIs, extract the filename and check if we already have it
          let originalFileName = '';
          if (sourceUri.includes('/')) {
            originalFileName = sourceUri.substring(sourceUri.lastIndexOf('/') + 1);
            // Remove query parameters if present
            if (originalFileName.includes('?')) {
              originalFileName = originalFileName.substring(0, originalFileName.indexOf('?'));
            }
            originalFileName = originalFileName.toLowerCase();
          }
          
          // Look for files with similar names (without considering unique suffixes)
          for (const file of epubFiles) {
            // Clean up the local filename for comparison
            const localFileName = file.name.toLowerCase();
            
            if (originalFileName && localFileName.includes(originalFileName.replace(/\.epub$/, ''))) {
              console.log(`Found file with similar name: ${file.path}`);
              return file.path;
            }
          }
        }
        
        console.log("No existing matching file found");
        return null;
      } catch (error) {
        console.error('Error checking if file exists:', error);
        return null;
      }
    };
    
    // Function to copy the file to app storage
    const copyFileToAppStorage = async (sourceUri: string): Promise<string | null> => {
      try {
        console.log("Original source URI:", sourceUri);
        
        // First, check if we already have this file in our app storage
        const existingFilePath = await checkIfFileExists(sourceUri);
        if (existingFilePath) {
          console.log("File already exists in app storage, using existing file");
          return existingFilePath;
        }
        
        // Generate a unique target filename with timestamp to avoid conflicts
        const timestamp = Date.now();
        
        // Try to extract original filename from URI if possible
        let fileName;
        
        if (sourceUri.includes('/')) {
          fileName = sourceUri.substring(sourceUri.lastIndexOf('/') + 1);
          // For URIs with query parameters, keep only the filename part
          if (fileName.includes('?')) {
            fileName = fileName.substring(0, fileName.indexOf('?'));
          }
          
          // Handle encoded characters in filename
          try {
            const decodedFileName = decodeURIComponent(fileName);
            if (decodedFileName !== fileName) {
              console.log(`Decoded filename from ${fileName} to ${decodedFileName}`);
              fileName = decodedFileName;
            }
          } catch (decodeError) {
            console.log("Error decoding filename:", decodeError);
            // Continue with the original filename
          }
          
          // Remove any strange characters from the filename
          fileName = fileName.replace(/[^\w\d.-]/g, '_');
        } else {
          // If we can't extract a reasonable filename, create one with the timestamp
          fileName = `book_${timestamp}.epub`;
        }
        
        // Don't add any random suffixes or timestamps to the filename
        // This helps prevent duplicates when the same file is selected multiple times
        const targetFileName = fileName.toLowerCase().endsWith('.epub') 
          ? fileName 
          : `${fileName}.epub`;
        
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
      navigation.navigate('Home', {
        setNavMap: setNavMap,
      });
      navigation.dispatch(DrawerActions.closeDrawer());
    };
    
    return (
      <SafeAreaView style={styles.container}>
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
        { 
          navMap && 
            <TableOfContents navMap={navMap} onNavigate={() => {console.log('navigate clicked')}} />
        }
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
