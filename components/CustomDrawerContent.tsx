import { Text, View, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { pick } from "@react-native-documents/picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import RNFS from "react-native-fs";
import { parseEpub } from "../parser/EpubLoader";
import TableOfContents from "./TableOfContents";
import { useNavigationContext } from "../NavigationContext";
import { findFirstContentTag, readTextFile, copyFileToAppStorage, checkIfFileExists } from "../utils";
import { NavPoint } from "../types/NavPoint";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeDocumentPicker } from "@react-native-documents/picker/lib/typescript/spec/NativeDocumentPicker";

function CustomDrawerContent() {
    const navigation = useNavigation();
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const { currentBook, setCurrentBook } = useNavigationContext();

    useEffect(() => {
      console.log('[CustomDrawerContent] Component mounted, current navMap:', currentBook?.navMap);
      
      // Check for pending book from direct file open
      if (global.pendingBook && !currentBook) {
        console.log('[CustomDrawerContent] Found pending book, setting in context');
        setCurrentBook(global.pendingBook);
        global.pendingBook = null;
      }
      
      return () => {
        console.log('[CustomDrawerContent] Component unmounting');
      };
    }, [currentBook, setCurrentBook]);
  
    const selectAndReadEpub = async () => {
      try {
        // Close drawer immediately
        navigation.dispatch(DrawerActions.closeDrawer());
        
        // Show loading indicator
        setIsLoading(true);
        
        const [file] = await pick({
          type: ['*/*'],
          //type: ['application/epub+zip'],
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

          const book = await parseEpub(existingPath);

          setCurrentBook(book);
          const firstContentElem = findFirstContentTag(book.navMap);
          const firstContentPath = book.basePath + '/' + firstContentElem.getAttribute('src');
          const firstContents = await readTextFile(firstContentPath);

          // Navigate to reader screen
          navigation.navigate('Reader', { 
            content: firstContents,
            language: book.language,
          });
          return;
        }
        
        // Copy the file to app storage for persistence
        const savedFilePath = await copyFileToAppStorage(file.uri);
        
        if (savedFilePath) {
          const book = await parseEpub(savedFilePath);
          setCurrentBook(book);
          const firstContentElem = findFirstContentTag(book.navMap);
          const firstContentPath = book.basePath + '/' + firstContentElem.getAttribute('src');
          const firstContents = await readTextFile(firstContentPath);
          // TODO check if language is null and if so prmpt user for language

          // Navigate to reader screen
          navigation.navigate('Reader', { 
            content: firstContents,
            language: book.language,
          });
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

    const goToHome = () => {
      AsyncStorage.removeItem("current_book").then(() => {
        navigation.navigate('Home');
        navigation.dispatch(DrawerActions.closeDrawer());
        setCurrentBook(null);
      });
    };
    
    const handleNavigateSection = async (item: NavPoint) => {
      if (currentBook) {
        try {
          navigation.dispatch(DrawerActions.closeDrawer());
          const sectionPathParts = item.src.split('#');
          const sectionPath = currentBook.basePath + '/' + sectionPathParts[0];
          const content = await readTextFile(sectionPath);
          const position = {
            section: item,
            readAlongIndex: 0,
          };
          await AsyncStorage.setItem(`${currentBook.path}_position`, JSON.stringify(position));
          navigation.navigate('Reader', {
            content,
            language: currentBook.language,
            section: item,
          });
        } catch (e) {
          console.error(e);
        }
      }
    }

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
          currentBook && 
            <TableOfContents navMap={currentBook.navMap} onNavigate={handleNavigateSection} />
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
