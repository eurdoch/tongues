import React, { useEffect, useMemo, useState } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  Image, 
  ActivityIndicator, 
  GestureResponderEvent,
  Modal,
  TouchableOpacity,
  Pressable 
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { parseEpub } from './utils';
import RNFS from 'react-native-fs';
import GestureText from './GestureText';
import { getSelectedText } from './TextSelection';

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

const renderNodes = (nodes: (ElementNode | string)[], handleTextSelection: (event: GestureResponderEvent) => void): React.ReactNode[] => {
  return nodes.map((node, index) => {
    if (typeof node === 'string') {
      return (
        <GestureText 
          key={index} 
          style={styles.text}
          selectable={true}
          onPressOut={handleTextSelection}
        >
          {node}
        </GestureText>
      );
    }

    switch (node.type) {
      case 'h1':
        return (
          <GestureText 
            key={index} 
            style={[styles.text, styles.h1]}
            selectable={true}
            onPressOut={handleTextSelection}
          >
            {node.children && renderNodes(node.children, handleTextSelection)}
          </GestureText>
        );
      case 'h2':
        return (
          <GestureText 
            key={index} 
            style={[styles.text, styles.h2]}
            selectable={true}
            onPressOut={handleTextSelection}
          >
            {node.children && renderNodes(node.children, handleTextSelection)}
          </GestureText>
        );
      case 'h3':
        return (
          <GestureText 
            key={index} 
            style={[styles.text, styles.h3]}
            selectable={true}
            onPressOut={handleTextSelection}
          >
            {node.children && renderNodes(node.children, handleTextSelection)}
          </GestureText>
        );
      case 'h4':
      case 'h5':
      case 'h6':
        return (
          <GestureText 
            key={index} 
            style={[styles.text, styles.h4]}
            selectable={true}
            onPressOut={handleTextSelection}
          >
            {node.children && renderNodes(node.children, handleTextSelection)}
          </GestureText>
        );
      case 'p':
        return (
          <View key={index} style={styles.paragraph}>
            <GestureText 
              style={styles.text}
              selectable={true}
              onPressOut={handleTextSelection}
            >
              {node.children && renderNodes(node.children, handleTextSelection)}
            </GestureText>
          </View>
        );
      case 'strong':
      case 'b':
        return (
          <GestureText 
            key={index} 
            style={[styles.text, styles.bold]}
            selectable={true}
            onPressOut={handleTextSelection}
          >
            {node.children && renderNodes(node.children, handleTextSelection)}
          </GestureText>
        );
      case 'em':
      case 'i':
        return (
          <GestureText 
            key={index} 
            style={[styles.text, styles.italic]}
            selectable={true}
            onPressOut={handleTextSelection}
          >
            {node.children && renderNodes(node.children, handleTextSelection)}
          </GestureText>
        );
      case 'u':
        return (
          <GestureText 
            key={index} 
            style={[styles.text, styles.underline]}
            selectable={true}
            onPressOut={handleTextSelection}
          >
            {node.children && renderNodes(node.children, handleTextSelection)}
          </GestureText>
        );
      case 'br':
        return <GestureText key={index} selectable={false}>{'\n'}</GestureText>;
      case 'hr':
        return <View key={index} style={styles.hr} />;
      case 'div':
        return (
          <View key={index} style={styles.div}>
            {node.children && renderNodes(node.children, handleTextSelection)}
          </View>
        );
      case 'span':
        return (
          <GestureText 
            key={index} 
            style={styles.text}
            selectable={true}
            onPressOut={handleTextSelection}
          >
            {node.children && renderNodes(node.children, handleTextSelection)}
          </GestureText>
        );
      case 'img':
        return (
          <Image
            key={index}
            source={{ uri: node.props?.src }}
            style={styles.image}
            resizeMode="contain"
          />
        );
      case 'a':
        return (
          <GestureText 
            key={index} 
            style={[styles.text, styles.link]}
            selectable={true}
            onPressOut={handleTextSelection}
          >
            {node.children && renderNodes(node.children, handleTextSelection)}
          </GestureText>
        );
      case 'ul':
        return (
          <View key={index} style={styles.list}>
            {node.children && renderNodes(node.children, handleTextSelection)}
          </View>
        );
      case 'ol':
        return (
          <View key={index} style={styles.list}>
            {node.children && renderNodes(node.children, handleTextSelection)}
          </View>
        );
      case 'li':
        return (
          <View key={index} style={styles.listItem}>
            <GestureText style={styles.bullet} selectable={false}>• </GestureText>
            <GestureText 
              style={styles.text}
              selectable={true}
              onPressOut={handleTextSelection}
            >
              {node.children && renderNodes(node.children, handleTextSelection)}
            </GestureText>
          </View>
        );
      default:
        // For unhandled elements, return the children directly
        return (
          <View key={index}>
            {node.children && renderNodes(node.children, handleTextSelection)}
          </View>
        );
    }
  });
};

// Define available languages
const languages = [
  { label: 'French', value: 'French' },
  { label: 'Spanish', value: 'Spanish' },
  { label: 'German', value: 'German' },
  { label: 'Italian', value: 'Italian' },
  { label: 'Dutch', value: 'Dutch' },
];

function ReaderScreen() {
  const route = useRoute();
  const { fileUri } = route.params || {};
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showLanguageModal, setShowLanguageModal] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');

  useEffect(() => {
    const loadEpub = async () => {
      if (!fileUri) {
        setError('No file selected');
        setIsLoading(false);
        return;
      }

      try {
        // Parse the epub file
        const tocItems = await parseEpub(fileUri);
        
        if (!tocItems || tocItems.length === 0) {
          setError('No content found in this epub file');
          setIsLoading(false);
          return;
        }

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
        setIsLoading(false);
        setShowLanguageModal(true);
      } catch (error) {
        console.error('Error loading epub:', error);
        setError('Failed to load the book');
        setIsLoading(false);
      }
    };

    loadEpub();
  }, [fileUri]);

  const parsedContent = useMemo(() => {
    try {
      return parseHtml(content);
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return [{ type: 'text', children: ['Error parsing content'] }];
    }
  }, [content]);

  const [translatedText, setTranslatedText] = useState<string | null>(null);

  const handleTextSelection = async (event: GestureResponderEvent) => {
    try {
      const selectedText = await getSelectedText();
      if (selectedText && selectedLanguage) {
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
        }
      }
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

  const renderLanguageModal = () => {
    return (
      <Modal
        animationType="fade"
        transparent={true}
        visible={showLanguageModal}
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowLanguageModal(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <GestureText 
                style={styles.modalTitle}
                selectable={false}
              >
                Select Language
              </GestureText>
              <View style={styles.languageOptionsContainer}>
                {languages.map((language) => (
                  <TouchableOpacity
                    key={language.value}
                    style={[
                      styles.languageOption,
                      selectedLanguage === language.value && styles.selectedLanguageOption
                    ]}
                    onPress={() => {
                      setSelectedLanguage(language.value);
                      setShowLanguageModal(false);
                    }}
                  >
                    <GestureText 
                      style={[
                        styles.languageOptionText,
                        selectedLanguage === language.value && styles.selectedLanguageOptionText
                      ]}
                      selectable={false}
                    >
                      {language.label}
                    </GestureText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {renderNodes(parsedContent, handleTextSelection)}
      </ScrollView>
      
      {/* Language selection modal */}
      {renderLanguageModal()}
      
      {selectedLanguage ? (
        <View style={styles.languageBadge}>
          <GestureText style={styles.languageBadgeText} selectable={false}>
            {selectedLanguage}
          </GestureText>
        </View>
      ) : null}
      
      {/* Translation result popup */}
      {translatedText && (
        <View style={styles.translationContainer}>
          <View style={styles.translationResult}>
            <GestureText style={styles.translatedText} selectable={true}>
              {translatedText}
            </GestureText>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setTranslatedText(null)}
            >
              <GestureText style={styles.closeButtonText} selectable={false}>
                ✕
              </GestureText>
            </TouchableOpacity>
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
    padding: 16,
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalContent: {
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  languageOptionsContainer: {
    marginTop: 8,
  },
  languageOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 4,
    backgroundColor: '#f0f0f0',
  },
  selectedLanguageOption: {
    backgroundColor: '#1a73e8',
  },
  languageOptionText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
  selectedLanguageOptionText: {
    color: 'white',
    fontWeight: 'bold',
  },
  // Language badge
  languageBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#1a73e8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  languageBadgeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Translation styles
  translationContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 30,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  translationResult: {
    backgroundColor: 'rgba(26, 115, 232, 0.9)',
    padding: 16,
    paddingRight: 40,
  },
  translatedText: {
    color: 'white',
    fontSize: 16,
    lineHeight: 24,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  h1: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    color: '#222',
  },
  h2: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 18,
    marginBottom: 8,
    color: '#333',
  },
  h3: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 6,
    color: '#444',
  },
  h4: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 14,
    marginBottom: 4,
    color: '#555',
  },
  paragraph: {
    marginVertical: 10,
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
    marginVertical: 10,
    paddingLeft: 10,
  },
  listItem: {
    flexDirection: 'row',
    marginVertical: 5,
    paddingLeft: 10,
  },
  bullet: {
    marginRight: 5,
  },
});

export default ReaderScreen;