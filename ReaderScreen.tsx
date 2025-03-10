import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  StyleSheet, 
  FlatList,
  ActivityIndicator, 
  GestureResponderEvent,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import RNFS from 'react-native-fs';
import GestureText from './GestureText';
import { getSelectedText, clearTextSelection } from './TextSelection';
import Sound from 'react-native-sound';
import TOCItem, { TOCSection } from './types/TOCItem';

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
  translateText,
  fetchWordTimestamps, 
} from './components/reader/TranslationService';
import TranslationModal from './components/reader/TranslationModal';
import ReadAlongModal from './components/ReadAlongModal';
import LanguageSelectorModal from './components/LanguageSelectorModal';
import { ElementNode } from './components/reader/types';
import { Text } from 'react-native-gesture-handler';

const supportedLanguages = [
  'French',
  'Spanish',
  'German',
  'Italian',
  'Dutch',
];

function ReaderScreen() {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [tableOfContents, setTableOfContents] = useState<TOCItem[]>([]);
  const [sections, setSections] = useState<TOCSection[]>([]);
  const [selectedOriginalText, setSelectedOriginalText] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [sound, setSound] = useState<Sound | null>(null);
  const [readAlongVisible, setReadAlongVisible] = useState<boolean>(false);
  const [contentSentences, setContentSentences] = useState<string[]>([]);
  const [languageSelectorVisible, setLanguageSelectorVisible] = useState<boolean>(false);
  const [bookTitle, setBookTitle] = useState<string>('');
  const [bookAuthor, setBookAuthor] = useState<string>('');
  const [firstChapterId, setFirstChapterId] = useState<string | null>(null);

  const extractSentences = () => {
    if (!content) return ['Hello, welcome to Read Along mode'];
    
    try {
      const stripHtml = (html: string) => {
        // Simple regex-based HTML tag removal for React Native
        const noTags = html
          .replace(/<[^>]*>?/gm, ' ') // Replace HTML tags with space
          .replace(/\s+/g, ' ')       // Normalize whitespace
          .trim();                    // Trim leading/trailing whitespace
          
        // Decode entities after removing tags
        return decodeHtmlEntities(noTags);
      };
      
      // Process sections if available
      if (sections && sections.length > 0) {
        console.log('[ReaderScreen] Processing content from sections');
        
        // Get the sections to use - either from first chapter onwards or all sections
        const sectionsToUse = getDisplaySections();
        
        // Process each section to extract sentences
        let allSentences: string[] = [];
        
        sectionsToUse.forEach(section => {
          if (!section.content || section.content.trim().length === 0) return;
          
          // Clean the section content of HTML tags
          const cleanedSectionContent = stripHtml(section.content);
          
          // Break the content into paragraphs
          const paragraphs = cleanedSectionContent.split(/\n+/).filter(p => p.trim().length > 0);
          
          // Process each paragraph to extract sentences
          paragraphs.forEach(paragraph => {
            // Match sentences ending with ., !, or ? followed by a space or end of string
            const sentencesInParagraph: string[] = paragraph.match(/[^.!?]+[.!?]+(\s|$)/g) || [];
            
            // Clean up each sentence
            const cleanSentences = sentencesInParagraph
              .map(s => s.trim())
              // Keep sentences of reasonable length (between 15 and 150 characters)
              .filter(s => s.length >= 15 && s.length <= 150)
              // Remove sentences with XML/HTML remnants
              .filter(s => !s.includes('<') && !s.includes('>'));
            
            allSentences = [...allSentences, ...cleanSentences];
          });
        });
        
        if (allSentences.length > 0) {
          return allSentences;
        }
      }
      
      // Fallback to processing content as a whole if sections are empty or failed
      // Clean the content of HTML tags
      const cleanedContent = stripHtml(content);
      console.log('[ReaderScreen] Fallback: Content length after HTML cleaning:', cleanedContent.length);
      
      // Break the content into paragraphs first
      const paragraphs = cleanedContent.split(/\n+/).filter(p => p.trim().length > 0);
      
      // Process each paragraph to extract sentences
      let allSentences: string[] = [];
      paragraphs.forEach(paragraph => {
        // Match sentences ending with ., !, or ? followed by a space or end of string
        const sentencesInParagraph: string[] = paragraph.match(/[^.!?]+[.!?]+(\s|$)/g) || [];
        
        // Clean up each sentence
        const cleanSentences = sentencesInParagraph
          .map(s => s.trim())
          // Keep sentences of reasonable length (between 15 and 150 characters)
          .filter(s => s.length >= 15 && s.length <= 150)
          // Remove sentences with XML/HTML remnants
          .filter(s => !s.includes('<') && !s.includes('>'));
        
        allSentences = [...allSentences, ...cleanSentences];
      });
      
      console.log(`[ReaderScreen] Extracted ${allSentences.length} readable sentences`);
      
      // If we couldn't extract any good sentences, return a default
      if (allSentences.length === 0) {
        return ['Hello, welcome to Read Along mode'];
      }
      
      return allSentences;
    } catch (error) {
      console.error('Error extracting sentences:', error);
      return ['Hello, welcome to Read Along mode'];
    }
  };
  
  // Function to get a sample sentence for read-along mode
  const getSampleSentence = () => {
    const sentences = extractSentences();
    const randomIndex = Math.floor(Math.random() * Math.min(5, sentences.length));
    return sentences[randomIndex];
  };
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

    
  // Helper function to decode HTML entities
  const decodeHtmlEntities = (text) => {
    if (!text) return '';
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&ndash;/g, '–')
      .replace(/&mdash;/g, '—')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
      .replace(/&#x([0-9A-F]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  };

  // Helper function to generate fallback timestamps
  const generateFallbackTimestamps = (text) => {
    const words = text.split(/\s+/);
    const marks = [];
    let startPos = 0;
    
    words.forEach((word, index) => {
      const start = text.indexOf(word, startPos);
      const end = start + word.length;
      
      marks.push({
        time: index * 500, // Spread words 500ms apart
        type: 'word',
        start: start,
        end: end,
        value: word
      });
      
      startPos = end;
    });
    
    return { marks };
  };

  // Function to prepare data for a single sentence
  // TODO FLAGGED for removal
  const prepareSentenceData = async (sentence, language = 'Spanish') => {
    // Ensure we have a valid language
    if (!language || typeof language !== 'string' || language.trim() === '') {
      language = 'Spanish'; // Default fallback
    }
    
    const result = {
      text: sentence,
      translation: "Translation not available",
      audioBlob: null,
      timestampData: generateFallbackTimestamps(sentence)
    };
    
    try {
      // Try to get translation
      result.translation = await translateText(sentence, language);
    } catch (translationError) {
      console.error('Translation error:', translationError);
    }
    
    try {
      // Ensure language has proper capitalization for consistency
      const normalizedLanguage = language.charAt(0).toUpperCase() + language.slice(1).toLowerCase();
      
      console.log('Fetching speech for:', { textLength: sentence.length, language: normalizedLanguage });
      
      const audioResponse = await fetch('https://tongues.directto.link/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: sentence,
          language: normalizedLanguage,
        }),
      });
      
      if (audioResponse.ok) {
        result.audioBlob = await audioResponse.blob();
      }
    } catch (audioError) {
      console.error('Audio fetch error:', audioError);
    }
    
    try {
      // Try to get word timestamps from API
      const marks = await fetchWordTimestamps(sentence, language);
      result.timestampData = { marks };
    } catch (timestampError) {
      console.error('Timestamp error:', timestampError);
      // We'll use the fallback timestamps already generated
    }
    
    return result;
  };
  
  const handleReadAlongPress = async () => {
    console.log('[ReaderScreen] Preparing content for read-along from main content...');
    
    // Create an array to store all sentences from main content onwards
    const allReadingContent: string[] = [];
    
    // Check if we have a firstChapterId
    if (firstChapterId && sections.length > 0) {
      // Find the index of the section with the firstChapterId
      const firstChapterIndex = sections.findIndex(section => section.id === firstChapterId);
      
      if (firstChapterIndex !== -1) {
        // Get only sections from main content onwards
        const mainContentSections = sections.slice(firstChapterIndex);
        console.log(`[ReaderScreen] Found main content at index ${firstChapterIndex}, using ${mainContentSections.length} sections`);
        
        // Process each section to extract clean text
        mainContentSections.forEach(section => {
          if (!section.content || section.content.trim().length === 0) return;
          
          // Clean the content of HTML tags
          const cleanContent = section.content
            .replace(/<[^>]*>?/gm, ' ')  // Remove HTML tags
            .replace(/\s+/g, ' ')        // Normalize whitespace
            .trim();                     // Trim whitespace
          
          // Decode HTML entities
          const decodedContent = decodeHtmlEntities(cleanContent);
          
          // Find sentences - match anything ending with ., !, or ? followed by space or end of string
          const sentencesMatch = decodedContent.match(/[^.!?]+[.!?]+(\s|$)/g) || [];
          
          // Clean up each sentence
          const cleanSentences = sentencesMatch
            .map(s => s.trim())
            // Keep sentences of reasonable length
            .filter(s => s.length >= 15 && s.length <= 200)
            // Remove any with HTML remnants
            .filter(s => !s.includes('<') && !s.includes('>'));
          
          // Add these sentences to our collection
          allReadingContent.push(...cleanSentences);
        });
      } else {
        console.log('[ReaderScreen] Could not find main content section, falling back to all content');
        allReadingContent.push(...extractSentences());
      }
    } else {
      // If no firstChapterId or no sections, fall back to extracting from all content
      console.log('[ReaderScreen] No main content marker found, using all content');
      allReadingContent.push(...extractSentences());
    }
    
    // Limit to a reasonable number of sentences for better performance
    let sentences = allReadingContent;
    if (sentences.length > 100) {
      console.log(`[ReaderScreen] Limiting sentences from ${sentences.length} to 100 for better performance`);
      sentences = sentences.slice(0, 100);
    }
    
    console.log(`[ReaderScreen] Ready for read-along with ${sentences.length} sentences`);
    setContentSentences(sentences);
    setReadAlongVisible(true);
  };
  
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
  
  // Update navigation header based on loading state
  useEffect(() => {
    if (fileUri) {
      if (!isLoading) {
        navigation.setOptions({
          headerRight: () => (
            <TouchableOpacity
              onPress={handleReadAlongPress}
              style={{ marginRight: 16 }}
            >
              <Text style={{ fontSize: 22, color: '#007AFF' }}>
                🎧
              </Text>
            </TouchableOpacity>
          ),
        });
      } else {
        navigation.setOptions({
          headerRight: () => null,
        });
      }
    }
  }, [isLoading, navigation, fileUri, handleReadAlongPress]);

  // Handler for language selection from the modal
  const handleLanguageSelect = (language: string) => {
    console.log('[ReaderScreen] User selected language:', language);
    setSelectedLanguage(language);
    setLanguageSelectorVisible(false);
    setIsLoading(false);
  };

  const loadEpub = useCallback(async () => {
    if (!fileUri) {
      setError('No file selected');
      setIsLoading(false);
      return;
    }
    
    console.log('[ReaderScreen] Loading ePub from:', fileUri);
    
    try {
      // Load EPUB content using the refactored function
      const { content: epubContent, tableOfContents: toc, sections: contentSections } = await loadEpubContent(fileUri);
      
      // Get book metadata to find the first chapter ID
      const bookId = fileUri.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || '';
      const { getBookMetadata } = await import('./BookMetadataStore');
      const metadata = await getBookMetadata(bookId);
      
      // Set book information
      setBookTitle(metadata?.title || toc[0]?.label || 'Book');
      // Try to find author information in the first few sections
      let author = '';
      for (const section of contentSections.slice(0, 3)) {
        if (section.content.includes('author') || section.title.toLowerCase().includes('copyright')) {
          const authorMatch = section.content.match(/author[:\s]+([^<\n]+)/i);
          if (authorMatch && authorMatch[1]) {
            author = authorMatch[1].trim();
            break;
          }
        }
      }
      setBookAuthor(author);
      
      // Store the first chapter ID if available
      if (metadata?.firstChapterId) {
        setFirstChapterId(metadata.firstChapterId);
      }
      
      // Store table of contents and all sections
      console.log(contentSections);
      setTableOfContents(toc);
      setSections(contentSections);
      setContent(epubContent);
      
      // Detect language from content sample
      try {
        const contentSample = extractContentSample(epubContent);
        const detectedLanguage = await detectLanguage(contentSample, supportedLanguages);
        setSelectedLanguage(detectedLanguage);
        setIsLoading(false);
      } catch (langError) {
        console.error('[ReaderScreen] Error detecting language:', langError);
        // Instead of defaulting to French, show the language selector modal
        console.log('[ReaderScreen] Showing language selector modal due to detection error');
        // Set loading to false so the main UI renders and can show the modal
        setIsLoading(false);
        // Now show the language selection modal
        setLanguageSelectorVisible(true);
      }
      
      console.log('[ReaderScreen] EPUB loaded successfully');
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

  // We no longer need to parse the entire content at once
  // as we're parsing each section individually in renderSection

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

  // Render the book header with title and author
  const renderBookHeader = () => {
    return (
      <View style={styles.bookHeaderContainer}>
        <GestureText style={styles.bookTitle} selectable={false}>
          {bookTitle}
        </GestureText>
        {bookAuthor && (
          <GestureText style={styles.bookAuthor} selectable={false}>
            by {bookAuthor}
          </GestureText>
        )}
      </View>
    );
  };
  
  // Render a section for the content (without title)
  const renderSection = (section: TOCSection, index: number) => {
    try {
      const parsedSection = parseHtml(section.content);
      return (
        <View key={index} style={styles.sectionContainer}>
          {parsedSection.map((node, nodeIndex) => (
            <View key={`node-${index}-${nodeIndex}`}>
              {renderNode(node, handleTextSelection)}
            </View>
          ))}
        </View>
      );
    } catch (error) {
      console.error(`Error parsing section ${index}:`, error);
      return (
        <View key={index} style={styles.sectionContainer}>
          <GestureText style={styles.errorText}>Error rendering content</GestureText>
        </View>
      );
    }
  };

  // We no longer use this rendering method as we're using sections only

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

  // Filter sections to only include main content (from identified main content onwards)
  const getDisplaySections = () => {
    if (!firstChapterId || sections.length === 0) {
      return sections; // If no main content identified, show all sections
    }
    
    // Find the index of the main content section
    const mainContentIndex = sections.findIndex(section => section.id === firstChapterId);
    
    if (mainContentIndex === -1) {
      return sections; // If main content not found in sections, show all
    }
    
    // Return only sections from main content onwards
    return sections.slice(mainContentIndex);
  };
  
  // Get the filtered sections to display
  const displaySections = getDisplaySections();
  
  return (
    <View style={styles.container}>
      <FlatList
        data={displaySections}
        renderItem={({ item, index }) => renderSection(item, index)}
        keyExtractor={(item) => item.id}
        style={styles.scrollView}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={false}
        ListHeaderComponent={renderBookHeader}
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

      {/* Read Along Modal */}
      <ReadAlongModal
        visible={readAlongVisible}
        onClose={() => setReadAlongVisible(false)}
        language={selectedLanguage}
        sentences={contentSentences}
        bookId={fileUri?.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || ''}
      />

      {/* Language Selector Modal */}
      <LanguageSelectorModal
        visible={languageSelectorVisible}
        supportedLanguages={supportedLanguages}
        onClose={() => {
          // If user closes without selecting, default to French
          setSelectedLanguage('French');
          setLanguageSelectorVisible(false);
          setIsLoading(false);
        }}
        onSelectLanguage={handleLanguageSelect}
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
  bookHeaderContainer: {
    marginBottom: 40,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    alignItems: 'center',
  },
  bookTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  bookAuthor: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  sectionContainer: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
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
