import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  StyleSheet, 
  FlatList,
  ActivityIndicator, 
  GestureResponderEvent,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import RNFS from 'react-native-fs';
import GestureText from './GestureText';
import { getSelectedText, clearTextSelection } from './TextSelection';
import Sound from 'react-native-sound';
import TOCItem from './types/TOCItem';

// Import refactored components
import { parseHtml } from './components/reader/EpubContentParser';
import { renderNode } from './components/reader/EpubContentRenderer';
import { 
  loadEpubContent, 
  extractContentSample, 
  detectLanguage 
} from './components/reader/EpubLoader';
import { 
  fetchSpeechAudio, 
  translateText 
} from './components/reader/TranslationService';
import TranslationModal from './components/reader/TranslationModal';
import { ElementNode } from './components/reader/types';

// Define available languages for reference
const supportedLanguages = [
  'French',
  'Spanish',
  'German',
  'Italian',
  'Dutch',
];

function ReaderScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { fileUri, shouldRefreshHomeAfterClose, openedExternally, checkForDuplicates } = route.params || {};
  
  // Component mount tracking for debugging
  useEffect(() => {
    console.log('[ReaderScreen] MOUNTED - component mounted');
    
    return () => {
      console.log('[ReaderScreen] UNMOUNTED - component will unmount');
    };
  }, []);
  
  // Log route params for debugging
  useEffect(() => {
    console.log('[ReaderScreen] Route params:', 
      route.params ? JSON.stringify(route.params) : 'undefined');
    
    // Force refresh if params changed but component didn't remount
    if (route.params?.fileUri !== fileUri && route.params?.fileUri) {
      console.log('[ReaderScreen] fileUri changed in params, updating state');
      console.log('[ReaderScreen] Old fileUri:', fileUri);
      console.log('[ReaderScreen] New fileUri:', route.params.fileUri);
      
      // Reset component state based on new params
      setIsLoading(true);
      setError(null);
    } else if (!route.params?.fileUri) {
      console.log('[ReaderScreen] WARNING: No fileUri in route params');
    }
  }, [route.params, fileUri]);

  // State variables
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [tableOfContents, setTableOfContents] = useState<TOCItem[]>([]);
  const [parsedContent, setParsedContent] = useState<ElementNode[]>([]);
  const [selectedOriginalText, setSelectedOriginalText] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [sound, setSound] = useState<Sound | null>(null);
  
  // When component is unmounted, refresh the HomeScreen if requested
  useEffect(() => {
    return () => {
      if (shouldRefreshHomeAfterClose) {
        // Wait a moment for navigation to complete, then refresh the Home screen
        setTimeout(() => {
          navigation.navigate('Home', { refreshBooks: true });
        }, 300);
      }
    };
  }, [shouldRefreshHomeAfterClose, navigation]);

  // Reset state when a new file is selected
  useEffect(() => {
    // Only proceed if we have a fileUri
    if (!fileUri) {
      console.log('[ReaderScreen] No fileUri provided');
      setError('No file selected');
      setIsLoading(false);
      return;
    }
    
    console.log('[ReaderScreen] FileUri changed, resetting states:', fileUri);
    
    // Reset states when fileUri changes
    setContent('');
    setError(null);
    setIsLoading(true);
    setTranslatedText(null);
    setAudioPath(null);
    setTableOfContents([]);
    if (sound) {
      sound.release();
      setSound(null);
    }
  }, [fileUri]);
  
  // Set title in navigation header from metadata when EPUB loads
  useEffect(() => {
    if (fileUri) {
      // Get book metadata to set title from metadata store
      const getBookTitle = async () => {
        try {
          const { getBookMetadata } = await import('./BookMetadataStore');
          // Create id from file path (same logic as in metadata store)
          const id = fileUri.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || '';
          const metadata = await getBookMetadata(id);
          
          if (metadata && metadata.title) {
            // Set title from metadata
            navigation.setOptions({
              title: metadata.title,
              headerTitleAlign: 'center',
            });
          } else if (tableOfContents.length > 0) {
            // Fallback to TOC if metadata not available
            const bookTitle = tableOfContents[0]?.label || 'Book';
            navigation.setOptions({
              title: bookTitle,
              headerTitleAlign: 'center',
            });
          }
        } catch (error) {
          console.error('[ReaderScreen] Error getting book metadata for title:', error);
          // Fallback to TOC
          if (tableOfContents.length > 0) {
            const bookTitle = tableOfContents[0]?.label || 'Book';
            navigation.setOptions({
              title: bookTitle,
              headerTitleAlign: 'center',
            });
          }
        }
      };
      
      getBookTitle();
    }
  }, [fileUri, tableOfContents, navigation]);

  // Define loadEpub with useCallback
  const loadEpub = useCallback(async () => {
    if (!fileUri) {
      setError('No file selected');
      setIsLoading(false);
      return;
    }
    
    console.log('[ReaderScreen] Loading ePub from:', fileUri);
    
    try {
      // Load EPUB content using the refactored function
      const { content: epubContent, tableOfContents: toc } = await loadEpubContent(fileUri);
      
      // Store table of contents
      setTableOfContents(toc);
      setContent(epubContent);
      
      // Detect language from content sample
      try {
        const contentSample = extractContentSample(epubContent);
        const detectedLanguage = await detectLanguage(contentSample, supportedLanguages);
        setSelectedLanguage(detectedLanguage);
      } catch (langError) {
        console.error('[ReaderScreen] Error detecting language:', langError);
        setSelectedLanguage('French'); // Default
      }
      
      console.log('[ReaderScreen] EPUB loaded successfully');
      setIsLoading(false);
    } catch (error) {
      console.error('[ReaderScreen] Error loading epub:', error);
      setError('Failed to load the book');
      setIsLoading(false);
    }
  }, [fileUri]);

  // Effect to load the EPUB when fileUri changes or on initial load
  useEffect(() => {
    console.log('[ReaderScreen] Load effect triggered with fileUri:', fileUri);
    
    // Safety check: ensure fileUri exists
    if (!fileUri) {
      console.error('[ReaderScreen] No fileUri provided, cannot load book');
      setError('No file selected');
      setIsLoading(false);
      return;
    }
    
    // Check file exists before proceeding
    RNFS.exists(fileUri)
      .then(exists => {
        if (!exists) {
          // Try with file:// prefix
          return RNFS.exists(`file://${fileUri}`).then(existsWithPrefix => {
            if (!existsWithPrefix) {
              throw new Error(`File does not exist at path: ${fileUri}`);
            }
            console.log(`[ReaderScreen] File exists with file:// prefix: file://${fileUri}`);
            return true;
          });
        }
        console.log(`[ReaderScreen] File exists: ${fileUri}`);
        return true;
      })
      .then(fileOk => {
        if (!fileOk) {
          throw new Error(`File does not exist or cannot be accessed: ${fileUri}`);
        }
        
        // Continue with normal book loading process
        // Check if we're opening an external book that might be a duplicate
        if (checkForDuplicates) {
          // For externally opened files, we need to verify if this book already exists
          // to prevent duplicate entries in the library
          return import('./BookMetadataStore').then(async ({ checkIfBookExists, getAllBookMetadata }) => {
            try {
              // Get just the filename for comparison
              const filename = fileUri.split('/').pop()?.toLowerCase() || '';
              console.log('[ReaderScreen] Checking if book already exists:', filename);
              console.log('[ReaderScreen] Full path of file to check:', fileUri);
              
              // Get all existing books
              const allMetadata = await getAllBookMetadata();
              let existingBook = null;
              
              console.log('[ReaderScreen] Found', Object.keys(allMetadata).length, 'books in metadata store');
              
              // Search through metadata for a book with the same filename
              for (const bookId in allMetadata) {
                const book = allMetadata[bookId];
                const existingFilename = book.filePath.split('/').pop()?.toLowerCase() || '';
                
                // Get filenames without extensions
                const filenameNoExt = filename.replace(/\.epub$/i, '');
                const existingFilenameNoExt = existingFilename.replace(/\.epub$/i, '');
                
                // Check for exact match or name match (without extension)
                if (existingFilename === filename || existingFilenameNoExt === filenameNoExt) {
                  console.log('[ReaderScreen] Found existing book with matching filename:');
                  console.log(`  - New: ${filename} (${fileUri})`);
                  console.log(`  - Existing: ${existingFilename} (${book.filePath})`);
                  existingBook = book;
                  
                  // Break the loop once we find a match
                  break;
                }
              }
              
              if (existingBook) {
                console.log('[ReaderScreen] Using existing book instead of duplicate:', existingBook.filePath);
                
                // Update the last read time for the existing book
                const { updateLastRead } = await import('./BookMetadataStore');
                await updateLastRead(existingBook.id);
                
                // If we found an existing book with the same name,
                // update the navigation to use that book instead
                navigation.setParams({ 
                  fileUri: existingBook.filePath,
                  checkForDuplicates: false,  // Prevent infinite loop
                  timestamp: Date.now()  // Force a reload with new params
                });
                
                // Try to delete the duplicate file to prevent clutter
                try {
                  console.log('[ReaderScreen] Attempting to delete duplicate file:', fileUri);
                  await RNFS.unlink(fileUri).catch(e => {
                    console.log('[ReaderScreen] Could not delete duplicate file:', e);
                  });
                } catch (deleteError) {
                  console.log('[ReaderScreen] Error trying to delete duplicate:', deleteError);
                }
                
                return; // Don't load the duplicate, we'll load the existing book when params change
              }
              
              // If no duplicate was found, load this book
              loadEpub();
            } catch (error) {
              console.error('[ReaderScreen] Error checking for duplicate:', error);
              // Still try to load even if duplicate check failed
              loadEpub();
            }
          });
        } else {
          // Normal flow for books opened from within the app
          loadEpub();
        }
      })
      .catch(error => {
        console.error('[ReaderScreen] Error checking file existence:', error);
        setError(`Could not access file: ${error.message}`);
        setIsLoading(false);
      });
  }, [fileUri, checkForDuplicates, navigation, loadEpub]);

  // Parse HTML content when it changes
  useEffect(() => {
    try {
      const parsed = parseHtml(content);
      setParsedContent(parsed);
    } catch (error) {
      console.error('Error parsing HTML:', error);
      setParsedContent([{ type: 'text', children: ['Error parsing content'] }]);
    }
  }, [content]);

  // Play the audio file
  const playAudio = () => {
    if (sound) {
      setIsPlaying(true);
      sound.play((success) => {
        if (success) {
          console.log('Audio playback finished successfully');
        } else {
          console.log('Audio playback failed');
        }
        setIsPlaying(false);
      });
    }
  };
  
  // Stop audio playback
  const stopAudio = () => {
    if (sound) {
      sound.stop();
      setIsPlaying(false);
    }
  };
  
  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      if (sound) {
        sound.release();
      }
      if (audioPath) {
        RNFS.unlink(audioPath).catch(e => 
          console.log('Error cleaning up audio file:', e)
        );
      }
    };
  }, [sound, audioPath]);
  
  // Handle text selection
  const handleTextSelection = async (_event: GestureResponderEvent) => {
    try {
      // Add a small delay to ensure selection is complete
      setTimeout(async () => {
        try {
          const selectedText = await getSelectedText();
          if (selectedText && selectedLanguage) {
            console.log('Selected text:', selectedText);
            
            // Store the original selected text
            setSelectedOriginalText(selectedText);
            
            // Get translation using the refactored service
            try {
              const translated = await translateText(selectedText, selectedLanguage);
              setTranslatedText(translated);
              
              // Fetch speech audio for the original text
              try {
                const { sound: newSound, audioPath: newAudioPath } = 
                  await fetchSpeechAudio(selectedText, selectedLanguage, sound, audioPath);
                setSound(newSound);
                setAudioPath(newAudioPath);
              } catch (audioError) {
                console.error('Error fetching speech audio:', audioError);
              }
            } catch (translationError) {
              console.error('Error fetching translation:', translationError);
            }
          }
        } catch (selectionError) {
          console.error('Error in text selection handler:', selectionError);
        }
      }, 100);
    } catch (error) {
      console.error('Error handling text selection or translation:', error);
    }
  };

  // Clear selection and resources
  const clearSelection = () => {
    try {
      // Set UI states to null
      setSelectedOriginalText(null);
      setTranslatedText(null);
      
      // Clean up sound resources if they exist
      if (sound) {
        sound.stop();
        sound.release();
        setSound(null);
      }
      
      // Clean up audio file if it exists - safely
      if (audioPath) {
        RNFS.exists(audioPath)
          .then(exists => {
            if (exists) {
              return RNFS.unlink(audioPath);
            }
            return Promise.resolve();
          })
          .then(() => {
            setAudioPath(null);
          })
          .catch(e => {
            console.log('Error cleaning up audio file:', e);
            // Still set audioPath to null even if cleanup fails
            setAudioPath(null);
          });
      }
      
      // Clear text selection - both immediate and delayed
      clearTextSelection().catch(() => {});
      
      setTimeout(() => {
        clearTextSelection().catch(() => {});
        
        // On Android, also try to dismiss the keyboard as a fallback
        if (Platform.OS === 'android') {
          try {
            const { Keyboard } = require('react-native');
            Keyboard.dismiss();
          } catch (e) {
            // Ignore any errors
          }
        }
      }, 150);
    } catch (error) {
      console.error('Error closing translation modal:', error);
      // Ensure states are reset even if there's an error
      setSelectedOriginalText(null);
      setTranslatedText(null);
      setSound(null);
      setAudioPath(null);
    }
  };

  // Render item for FlatList
  const renderItemForFlatList = ({ item, index }: { item: ElementNode; index: number }) => {
    return (
      <View key={index}>
        {renderNode(item, handleTextSelection)}
      </View>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#1a73e8" />
        <GestureText 
          style={styles.loadingText}
          selectable={false}
        >
          Loading your book...
        </GestureText>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <GestureText 
          style={styles.errorText}
          selectable={false}
        >
          {error}
        </GestureText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={parsedContent}
        renderItem={renderItemForFlatList}
        keyExtractor={(_, index) => index.toString()}
        style={styles.scrollView}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={false}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          // Clear selections when scrolling
          if (selectedOriginalText || translatedText) {
            clearSelection();
          }
        }}
      />
      
      {/* Translation result popup */}
      <TranslationModal
        visible={!!translatedText && !!selectedOriginalText}
        originalText={selectedOriginalText}
        translatedText={translatedText}
        language={selectedLanguage}
        sound={sound}
        isPlaying={isPlaying}
        onClose={clearSelection}
        onPlayAudio={playAudio}
        onStopAudio={stopAudio}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#e53935',
    textAlign: 'center',
    padding: 20,
  },
});

export default ReaderScreen;
