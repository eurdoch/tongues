import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { parseEpub } from './utils';
import RNFS from 'react-native-fs';

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

const renderNodes = (nodes: (ElementNode | string)[]): React.ReactNode[] => {
  return nodes.map((node, index) => {
    if (typeof node === 'string') {
      return <Text key={index} style={styles.text}>{node}</Text>;
    }

    switch (node.type) {
      case 'h1':
        return (
          <Text key={index} style={[styles.text, styles.h1]}>
            {node.children && renderNodes(node.children)}
          </Text>
        );
      case 'h2':
        return (
          <Text key={index} style={[styles.text, styles.h2]}>
            {node.children && renderNodes(node.children)}
          </Text>
        );
      case 'h3':
        return (
          <Text key={index} style={[styles.text, styles.h3]}>
            {node.children && renderNodes(node.children)}
          </Text>
        );
      case 'h4':
      case 'h5':
      case 'h6':
        return (
          <Text key={index} style={[styles.text, styles.h4]}>
            {node.children && renderNodes(node.children)}
          </Text>
        );
      case 'p':
        return (
          <View key={index} style={styles.paragraph}>
            <Text style={styles.text}>
              {node.children && renderNodes(node.children)}
            </Text>
          </View>
        );
      case 'strong':
      case 'b':
        return (
          <Text key={index} style={[styles.text, styles.bold]}>
            {node.children && renderNodes(node.children)}
          </Text>
        );
      case 'em':
      case 'i':
        return (
          <Text key={index} style={[styles.text, styles.italic]}>
            {node.children && renderNodes(node.children)}
          </Text>
        );
      case 'u':
        return (
          <Text key={index} style={[styles.text, styles.underline]}>
            {node.children && renderNodes(node.children)}
          </Text>
        );
      case 'br':
        return <Text key={index}>{'\n'}</Text>;
      case 'hr':
        return <View key={index} style={styles.hr} />;
      case 'div':
        return (
          <View key={index} style={styles.div}>
            {node.children && renderNodes(node.children)}
          </View>
        );
      case 'span':
        return (
          <Text key={index} style={styles.text}>
            {node.children && renderNodes(node.children)}
          </Text>
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
          <Text key={index} style={[styles.text, styles.link]}>
            {node.children && renderNodes(node.children)}
          </Text>
        );
      case 'ul':
        return (
          <View key={index} style={styles.list}>
            {node.children && renderNodes(node.children)}
          </View>
        );
      case 'ol':
        return (
          <View key={index} style={styles.list}>
            {node.children && renderNodes(node.children)}
          </View>
        );
      case 'li':
        return (
          <View key={index} style={styles.listItem}>
            <Text style={styles.bullet}>• </Text>
            <Text style={styles.text}>
              {node.children && renderNodes(node.children)}
            </Text>
          </View>
        );
      default:
        // For unhandled elements, return the children directly
        return (
          <View key={index}>
            {node.children && renderNodes(node.children)}
          </View>
        );
    }
  });
};

function ReaderScreen() {
  const route = useRoute();
  const { fileUri } = route.params || {};
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#1a73e8" />
        <Text style={styles.loadingText}>Loading your book...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {renderNodes(parsedContent)}
      </ScrollView>
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