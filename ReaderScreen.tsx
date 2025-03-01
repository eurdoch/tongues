import React, { useEffect, useState } from 'react';
import { 
  View, 
  StyleSheet, 
  FlatList,
  Image, 
  ActivityIndicator, 
  GestureResponderEvent,
  Modal,
  TouchableOpacity,
  Clipboard,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { parseEpub } from './utils';
import RNFS from 'react-native-fs';
import GestureText from './GestureText';
import { getSelectedText } from './TextSelection';
import Sound from 'react-native-sound';
import TOCItem from './types/TOCItem';

type ElementNode = {
  type: string;
  props?: Record<string, any>;
  children?: (ElementNode | string)[];
};

function parseHtml(html: string): ElementNode[] {
  // Clean the HTML by removing doctype, html, head, and script tags
  const cleanedHtml = html
    .replace(/<\!DOCTYPE[^>]*>/gi, '')
    .replace(/<html[^>]*>([\s\S]*?)<\/html>/gi, '$1')
    .replace(/<head[^>]*>([\s\S]*?)<\/head>/gi, '')
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '');

  // Split content into body sections if they exist
  const bodyMatches = cleanedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/gi);
  
  // If there are body tags, process their content, otherwise process the whole cleaned HTML
  const contentToProcess = bodyMatches 
    ? bodyMatches.map(body => body.replace(/<body[^>]*>([\s\S]*?)<\/body>/i, '$1')).join('\n\n')
    : cleanedHtml;

  // Parse the content into a simple structure that we can render
  return parseElements(contentToProcess);
}

function parseElements(html: string): ElementNode[] {
  const result: ElementNode[] = [];
  let currentIndex = 0;
  
  // Simple regex for matching HTML tags
  // This is a simplified approach and won't handle all HTML cases correctly
  const tagRegex = /<(\/?)([\w-]+)([^>]*)>|([^<]+)/g;
  
  const elementStack: ElementNode[] = [];
  let currentElement: ElementNode | null = null;
  
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const [fullMatch, isClosing, tagName, attributes, textContent] = match;
    
    if (textContent) {
      // This is a text node
      const decodedText = decodeHtmlEntities(textContent.trim());
      if (decodedText) {
        if (currentElement) {
          if (!currentElement.children) currentElement.children = [];
          currentElement.children.push(decodedText);
        } else {
          result.push({ type: 'text', children: [decodedText] });
        }
      }
    } else if (isClosing) {
      // This is a closing tag
      if (elementStack.length > 0) {
        // Pop the last element from the stack
        const element = elementStack.pop();
        
        // If the stack is empty, add it to the result
        if (elementStack.length === 0) {
          if (element) result.push(element);
          currentElement = null;
        } else {
          // Otherwise, add it as a child to the parent element
          currentElement = elementStack[elementStack.length - 1];
        }
      }
    } else {
      // This is an opening tag
      const parsedAttrs = parseAttributes(attributes);
      
      // Create a new element
      const newElement: ElementNode = {
        type: tagName.toLowerCase(),
        props: parsedAttrs,
        children: [],
      };
      
      // Self-closing tags like <img>, <br>, <hr>
      const selfClosingTags = ['img', 'br', 'hr', 'input', 'meta', 'link'];
      const isSelfClosing = selfClosingTags.includes(tagName.toLowerCase()) || 
                           attributes.trim().endsWith('/');
      
      if (isSelfClosing) {
        // Add self-closing tags directly
        if (currentElement) {
          if (!currentElement.children) currentElement.children = [];
          currentElement.children.push(newElement);
        } else {
          result.push(newElement);
        }
      } else {
        // Regular opening tag
        if (currentElement) {
          if (!currentElement.children) currentElement.children = [];
          currentElement.children.push(newElement);
        }
        
        elementStack.push(newElement);
        currentElement = newElement;
      }
    }
  }
  
  return result;
}

function parseAttributes(attributeString: string): Record<string, any> {
  const result: Record<string, any> = {};
  
  // Match attribute name-value pairs
  const attrRegex = /(\w+)(?:=["']([^"']*)["'])?/g;
  
  let match;
  while ((match = attrRegex.exec(attributeString)) !== null) {
    const [_, name, value] = match;
    result[name] = value || true; // Set boolean true for attributes without value
  }
  
  return result;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
}

// Render a single node instead of an array
const renderNode = (node: ElementNode | string, handleTextSelection: (event: GestureResponderEvent) => void): React.ReactNode => {
  if (typeof node === 'string') {
    return (
      <GestureText 
        style={styles.text}
        selectable={true}
        onPressOut={handleTextSelection}
      >
        {node}
      </GestureText>
    );
  }

  // Helper function to render children
  const renderChildren = (children?: (ElementNode | string)[]) => {
    if (!children || children.length === 0) return null;
    return children.map((child, index) => (
      <React.Fragment key={index}>
        {renderNode(child, handleTextSelection)}
      </React.Fragment>
    ));
  };

  switch (node.type) {
    case 'h1':
      return (
        <GestureText 
          style={[styles.text, styles.h1]}
          selectable={true}
          onPressOut={handleTextSelection}
        >
          {renderChildren(node.children)}
        </GestureText>
      );
    case 'h2':
      return (
        <GestureText 
          style={[styles.text, styles.h2]}
          selectable={true}
          onPressOut={handleTextSelection}
        >
          {renderChildren(node.children)}
        </GestureText>
      );
    case 'h3':
      return (
        <GestureText 
          style={[styles.text, styles.h3]}
          selectable={true}
          onPressOut={handleTextSelection}
        >
          {renderChildren(node.children)}
        </GestureText>
      );
    case 'h4':
    case 'h5':
    case 'h6':
      return (
        <GestureText 
          style={[styles.text, styles.h4]}
          selectable={true}
          onPressOut={handleTextSelection}
        >
          {renderChildren(node.children)}
        </GestureText>
      );
    case 'p':
      return (
        <View style={styles.paragraph}>
          <GestureText 
            style={styles.text}
            selectable={true}
            onPressOut={handleTextSelection}
          >
            {renderChildren(node.children)}
          </GestureText>
        </View>
      );
    case 'strong':
    case 'b':
      return (
        <GestureText 
          style={[styles.text, styles.bold]}
          selectable={true}
          onPressOut={handleTextSelection}
        >
          {renderChildren(node.children)}
        </GestureText>
      );
    case 'em':
    case 'i':
      return (
        <GestureText 
          style={[styles.text, styles.italic]}
          selectable={true}
          onPressOut={handleTextSelection}
        >
          {renderChildren(node.children)}
        </GestureText>
      );
    case 'u':
      return (
        <GestureText 
          style={[styles.text, styles.underline]}
          selectable={true}
          onPressOut={handleTextSelection}
        >
          {renderChildren(node.children)}
        </GestureText>
      );
    case 'br':
      return <GestureText selectable={false}>{'\n'}</GestureText>;
    case 'hr':
      return <View style={styles.hr} />;
    case 'div':
      return (
        <View style={styles.div}>
          {renderChildren(node.children)}
        </View>
      );
    case 'span':
      return (
        <GestureText 
          style={styles.text}
          selectable={true}
          onPressOut={handleTextSelection}
        >
          {renderChildren(node.children)}
        </GestureText>
      );
    case 'img':
      return (
        <Image
          source={{ uri: node.props?.src }}
          style={styles.image}
          resizeMode="contain"
        />
      );
    case 'a':
      return (
        <GestureText 
          style={[styles.text, styles.link]}
          selectable={true}
          onPressOut={handleTextSelection}
        >
          {renderChildren(node.children)}
        </GestureText>
      );
    case 'ul':
      return (
        <View style={styles.list}>
          {renderChildren(node.children)}
        </View>
      );
    case 'ol':
      return (
        <View style={styles.list}>
          {renderChildren(node.children)}
        </View>
      );
    case 'li':
      return (
        <View style={styles.listItem}>
          <GestureText style={styles.bullet} selectable={false}>• </GestureText>
          <GestureText 
            style={styles.text}
            selectable={true}
            onPressOut={handleTextSelection}
          >
            {renderChildren(node.children)}
          </GestureText>
        </View>
      );
    default:
      // For unhandled elements, return the children directly
      return (
        <View>
          {renderChildren(node.children)}
        </View>
      );
  }
};

// Define available languages for reference
const supportedLanguages = [
  'French',
  'Spanish',
  'German',
  'Italian',
  'Dutch',
];

// Helper function to extract a sample of content for language detection
const extractContentSample = (text: string): string => {
  // Find a paragraph with a reasonable length
  const paragraphs = text.split(/\n+/);
  const validParagraphs = paragraphs.filter(p => p.trim().length > 100 && p.trim().length < 1000);
  
  if (validParagraphs.length > 0) {
    // Get a random paragraph
    const randomIndex = Math.floor(Math.random() * validParagraphs.length);
    return validParagraphs[randomIndex].trim();
  }
  
  // If no suitable paragraphs, take a section from the middle of the text
  if (text.length > 500) {
    const startPos = Math.floor(text.length / 2) - 250;
    return text.substring(startPos, startPos + 500);
  }
  
  // Just return what we have
  return text.trim();
};

// Function to detect language using the API
const detectLanguage = async (text: string): Promise<string> => {
  const response = await fetch('https://tongues.directto.link/language', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  
  if (!response.ok) {
    throw new Error(`Language detection failed with status: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Check if returned language is in our supported list
  if (data.language && supportedLanguages.includes(data.language)) {
    return data.language;
  }
  
  // Default to French if not supported
  return 'French';
};

function ReaderScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { fileUri, shouldRefreshHomeAfterClose } = route.params || {};
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [tableOfContents, setTableOfContents] = useState<TOCItem[]>([]);
  
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

  useEffect(() => {
    const loadEpub = async () => {
      if (!fileUri) {
        setError('No file selected');
        setIsLoading(false);
        return;
      }
      
      console.log('Loading ePub from:', fileUri);
      
      // Clear clipboard to prevent accidental text pasting
      try {
        await Clipboard.setString('');
        console.log('Clipboard cleared before loading EPUB');
      } catch (clipboardError) {
        console.error('Error clearing clipboard:', clipboardError);
      }

      try {
        // Parse the epub file
        const tocItems = await parseEpub(fileUri);
        
        if (!tocItems || tocItems.length === 0) {
          setError('No content found in this epub file');
          setIsLoading(false);
          return;
        }
        
        // Filter out cover page (typically the first item or items with "cover" in their label/href)
        const filteredTOC = tocItems.filter((item, index) => {
          const isCover = item.label.toLowerCase().includes('cover') || 
                          item.href.toLowerCase().includes('cover') ||
                          (index === 0 && item.label.toLowerCase().includes('title'));
          return !isCover;
        });
        
        // Store filtered table of contents
        setTableOfContents(filteredTOC);
        
        // Log table of contents to console
        console.log('Table of Contents (excluding cover):');
        filteredTOC.forEach((item, index) => {
          console.log(`${index + 1}. ${item.label} (${item.href})`);
        });

        // Read content from all files
        const allContentPromises = tocItems.map(async (item) => {
          try {
            const fileContent = await RNFS.readFile(item.path, 'utf8');
            return fileContent;
          } catch (error) {
            console.error(`Error reading file ${item.path}:`, error);
            return '';
          }
        });
        
        const allContents = await Promise.all(allContentPromises);
        const fullText = allContents.join('\n\n');
        
        setContent(fullText);
        
        // Detect language from content sample
        try {
          // Get a random section of content for language detection
          const contentSample = extractContentSample(fullText);
          const detectedLanguage = await detectLanguage(contentSample);
          setSelectedLanguage(detectedLanguage);
        } catch (langError) {
          console.error('Error detecting language:', langError);
          // Default to French if detection fails
          setSelectedLanguage('French');
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading epub:', error);
        setError('Failed to load the book');
        setIsLoading(false);
      }
    };

    loadEpub();
  }, [fileUri]);

  const [parsedContent, setParsedContent] = useState<ElementNode[]>([]);
  
  useEffect(() => {
    try {
      const parsed = parseHtml(content);
      setParsedContent(parsed);
    } catch (error) {
      console.error('Error parsing HTML:', error);
      setParsedContent([{ type: 'text', children: ['Error parsing content'] }]);
    }
  }, [content]);

  const [selectedOriginalText, setSelectedOriginalText] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [sound, setSound] = useState<Sound | null>(null);

  // Fetch speech audio from the API and save it to a temporary file
  const fetchSpeechAudio = async (text: string, language: string) => {
    try {
      // Release previous sound if exists
      if (sound) {
        sound.release();
        setSound(null);
      }
      
      // Clear previous audio path
      if (audioPath) {
        try {
          await RNFS.unlink(audioPath);
        } catch (e) {
          console.log('Error removing previous audio file:', e);
        }
      }
      
      // Make API call to speech service
      const response = await fetch('https://tongues.directto.link/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          language: language,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Speech request failed with status: ${response.status}`);
      }
      
      // Get audio data as blob
      const audioBlob = await response.blob();
      
      // Create a temporary file path
      const tempFilePath = `${RNFS.CachesDirectoryPath}/speech_${Date.now()}.mp3`;
      
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      return new Promise<void>((resolve, reject) => {
        reader.onloadend = async () => {
          try {
            if (reader.result) {
              // Extract base64 data (remove the data URL prefix)
              const base64Data = (reader.result as string).split(',')[1];
              
              // Ensure the previous file is deleted if it exists
              const exists = await RNFS.exists(tempFilePath);
              if (exists) {
                await RNFS.unlink(tempFilePath);
              }
              
              // Write the file
              await RNFS.writeFile(tempFilePath, base64Data, 'base64');
              setAudioPath(tempFilePath);
              console.log('Speech audio saved to:', tempFilePath);
              
              // Initialize Sound with the file
              Sound.setCategory('Playback');
              const newSound = new Sound(tempFilePath, '', (error) => {
                if (error) {
                  console.error('Failed to load sound:', error);
                  reject(error);
                } else {
                  setSound(newSound);
                  resolve();
                }
              });
            }
          } catch (error) {
            console.error('Error saving audio file:', error);
            reject(error);
          }
        };
        
        reader.onerror = reject;
      });
    } catch (error) {
      console.error('Error fetching speech audio:', error);
    }
  };
  
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
      // Clear clipboard when leaving the screen
      Clipboard.setString('').catch(e => 
        console.log('Error clearing clipboard on unmount:', e)
      );
      
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
  
  const handleTextSelection = async (event: GestureResponderEvent) => {
    try {
      // Add a small delay to ensure selection is complete before trying to read it
      setTimeout(async () => {
        const selectedText = await getSelectedText();
        if (selectedText && selectedLanguage) {
          console.log('Selected text:', selectedText);
          
          // Clear clipboard after getting selected text to prevent interference
          try {
            await Clipboard.setString('');
          } catch (clipboardError) {
            console.error('Error clearing clipboard after selection:', clipboardError);
          }
          
          // Store the original selected text
          setSelectedOriginalText(selectedText);
          
          // Make API call to translation service
          const response = await fetch('https://tongues.directto.link/translate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: selectedText,
              language: selectedLanguage,
            }),
          });
          
          if (!response.ok) {
            console.error(`Translation request failed with status: ${response.status}`);
            return;
          }
          
          const data = await response.json();
          if (data.translated_text) {
            setTranslatedText(data.translated_text);
            console.log('Translation:', data.translated_text);
            
            // Fetch speech audio for the original text (not the translation)
            await fetchSpeechAudio(selectedText, selectedLanguage);
          }
        }
      }, 100);
    } catch (error) {
      console.error('Error handling text selection or translation:', error);
    }
  };

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

  // Render item for FlatList
  const renderItem = ({ item, index }: { item: ElementNode; index: number }) => {
    return (
      <View key={index}>
        {renderNode(item, handleTextSelection)}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={parsedContent}
        renderItem={renderItem}
        keyExtractor={(_, index) => index.toString()}
        style={styles.scrollView}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={false}
        scrollEventThrottle={16}
      />
      
      {/* Translation result popup */}
      {translatedText && selectedOriginalText && (
        <View style={styles.translationContainer}>
          <View style={styles.translationResult}>
            <View style={styles.translationHeader}>
              <GestureText style={styles.translationHeaderText} selectable={false}>
                {selectedLanguage}
              </GestureText>
              
              <View style={styles.translationControls}>
                {sound && (
                  <TouchableOpacity 
                    style={[styles.audioButton, isPlaying && styles.audioButtonActive]}
                    onPress={isPlaying ? stopAudio : playAudio}
                  >
                    <GestureText style={styles.audioButtonText} selectable={false}>
                      {isPlaying ? '■' : '▶'}
                    </GestureText>
                  </TouchableOpacity>
                )}
              </View>
              
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => {
                  setSelectedOriginalText(null);
                  setTranslatedText(null);
                  if (sound) {
                    sound.stop();
                    sound.release();
                    setSound(null);
                  }
                  if (audioPath) {
                    RNFS.unlink(audioPath).catch(e => 
                      console.log('Error removing audio file:', e)
                    );
                    setAudioPath(null);
                  }
                }}
              >
                <GestureText style={styles.closeButtonText} selectable={false}>
                  ✕
                </GestureText>
              </TouchableOpacity>
            </View>

            <View style={styles.originalTextContainer}>
              <GestureText style={styles.originalText} selectable={true}>
                {selectedOriginalText}
              </GestureText>
            </View>
            
            <View style={styles.translatedTextContainer}>
              <GestureText style={styles.translatedText} selectable={true}>
                {translatedText}
              </GestureText>
            </View>
          </View>
        </View>
      )}
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
  text: {
    fontSize: 18,
    lineHeight: 28,
    color: '#333',
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
  // Translation styles
  translationContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 30,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  translationResult: {
    backgroundColor: 'rgba(33, 33, 33, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  translationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(26, 115, 232, 0.9)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  translationHeaderText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  translationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    marginRight: 30,
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  originalTextContainer: {
    padding: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  originalText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 15,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  translatedTextContainer: {
    padding: 16,
    paddingTop: 8,
  },
  translatedText: {
    color: 'white',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  audioButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  audioButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  audioButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  h1: {
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 24,
    marginBottom: 12,
    color: '#222',
  },
  h2: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 22,
    marginBottom: 10,
    color: '#333',
  },
  h3: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 8,
    color: '#444',
  },
  h4: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 18,
    marginBottom: 6,
    color: '#555',
  },
  paragraph: {
    marginVertical: 14,
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  underline: {
    textDecorationLine: 'underline',
  },
  div: {
    marginVertical: 4,
  },
  hr: {
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 15,
  },
  image: {
    width: '100%',
    height: 200,
    marginVertical: 10,
  },
  link: {
    color: '#1a73e8',
    textDecorationLine: 'underline',
  },
  list: {
    marginVertical: 14,
    paddingLeft: 14,
  },
  listItem: {
    flexDirection: 'row',
    marginVertical: 8,
    paddingLeft: 12,
  },
  bullet: {
    marginRight: 5,
  },
});

export default ReaderScreen;
