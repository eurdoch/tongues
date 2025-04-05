import { Text, View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { pick } from "@react-native-documents/picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import RNFS from "react-native-fs";
import { parseEpub } from "../parser/EpubLoader";
import TableOfContents from "./TableOfContents";
import { useNavigationContext } from "../NavigationContext";
import { copyFileToAppStorage } from "../utils";
import { NavPoint } from "../types/NavPoint";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../App";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'CustomDrawerContent'>;

function CustomDrawerContent() {
    const navigation = useNavigation<NavigationProp>();
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const { 
      currentBook, 
      setCurrentBook,
      isBookLoading,
      setIsBookLoading 
    } = useNavigationContext();

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
        
        // Show loading indicator while picking file
        setIsLoading(true);
        
        // TODO set type to application/epub+zip
        const [file] = await pick({
          type: ['*/*'],
          //type: ['application/epub+zip'],
          mode: 'open',
        });
        
        // Now show the book loading overlay
        setIsLoading(false);
        setIsBookLoading(true);
        
        console.log("[CustomDrawerContent] Selected file:", file);
        
        let fileSize = 0;
        try {
          const stats = await RNFS.stat(file.uri);
          fileSize = stats.size;
          console.log(`[CustomDrawerContent] Selected file size: ${fileSize} bytes`);
        } catch (statError) {
          console.log('[CustomDrawerContent] Error getting file stats:', statError);
        }
        
        try {
          // Look for existing files with the same size first
          const existingFiles = await findExistingFiles(fileSize);
          if (existingFiles.length > 0) {
            console.log(`[CustomDrawerContent] Found ${existingFiles.length} potential matches by size`);
            
            // Use the first one - this is likely to be the same file
            const existingPath = existingFiles[0].path;
            console.log(`[CustomDrawerContent] Using existing file: ${existingPath}`);
  
            // Parse the epub file to get full book content
            const book = await parseEpub(existingPath);
            
            if (!book || !book.navMap) {
              throw new Error("Failed to parse book navigation structure");
            }
  
            setCurrentBook(book);
            console.log(`[CustomDrawerContent] Book parsed successfully with ${book.content?.length || 0} content elements`);
            
            // Navigate to reader screen - it will prioritize book.content
            navigation.navigate('Reader', { 
              book,
            });

            return;
          }
          
          // Copy the file to app storage for persistence
          const savedFilePath = await copyFileToAppStorage(file.uri);
          
          if (savedFilePath) {
            // Parse the epub file to get full book content
            const book = await parseEpub(savedFilePath);
            // TODO commented out while changing to spine based parse
            //if (!book || !book.navMap) {
            //  throw new Error("Failed to parse book navigation structure");
            //}
            
            setCurrentBook(book);
            console.log(`[CustomDrawerContent] Book parsed successfully with ${book.content?.length || 0} content elements`);
            
            // Navigate to reader screen - it will prioritize book.content
            navigation.navigate('Reader', { 
              book,
            });
          } else {
            throw new Error("Could not save file.");
          }
        } catch (bookError: any) {
          console.error('[CustomDrawerContent] Error processing book:', bookError);
          Alert.alert(
            "Error Opening Book", 
            "There was a problem opening this book. The file may be corrupted or in an unsupported format."
          );
        }
      } catch (e: any) {
        console.log('[CustomDrawerContent] File picking failed: ', e);
      } finally {
        setIsLoading(false);
        setIsBookLoading(false);
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
        navigation.navigate('Home', {});
        navigation.dispatch(DrawerActions.closeDrawer());
        setCurrentBook(null);
      });
    };
    
    //const handleNavigateSection = async (item: NavPoint) => {
    //  if (currentBook) {
    //    try {
    //      navigation.dispatch(DrawerActions.closeDrawer());
    //      
    //      // We'll still load the individual section content for backward compatibility
    //      // Even though we have the full book content available in currentBook.content
    //      const sectionPathParts = item.src.split('#');
    //      const sectionPath = currentBook.basePath + '/' + sectionPathParts[0];
    //      const content = await readTextFile(sectionPath);
    //      // Navigate to the Reader with the section information
    //      // ReaderScreen will prioritize using currentBook.content
    //      navigation.navigate('Reader', {

    //      });
    //    } catch (e) {
    //      console.error(e);
    //    }
    //  }
    //}

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
            disabled={isLoading || isBookLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Open Book</Text>
            )}
          </TouchableOpacity>
          
        </View>
        { 
          currentBook && currentBook.tableOfContents && 
            <TableOfContents 
              navPoints={currentBook.tableOfContents} 
              onNavigate={(item: NavPoint) => {
                if (currentBook) {
                  console.log(`[CustomDrawerContent] Navigating to section with id: ${item.id}`);
                  navigation.dispatch(DrawerActions.closeDrawer());
                  navigation.navigate('Reader', { 
                    book: currentBook,
                    navId: item.id 
                  });
                }
              }} 
            />
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
