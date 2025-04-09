import React, { useMemo, useRef, useEffect } from 'react';
import { FlatList, View, Text, StyleSheet, TextStyle, ViewStyle, findNodeHandle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { StyleSheet as BookStyleSheet } from './types/StyleSheet';
import { processBookStyles } from './parser/CssParser';
import { ElementNode } from './types/ElementNode';
import ImageFromUri from './components/ImageFromUri';

interface GestureTextProps {
  children: React.ReactNode;
  style?: TextStyle | TextStyle[];
  selectable?: boolean;
}

// Create a gesture-enabled Text component
const GestureText = ({ children, style, selectable = false }: GestureTextProps) => {
  const tap = Gesture.Tap()
    .onStart(() => {
      // Handle tap gestures if needed
    });

  return (
    <GestureDetector gesture={tap}>
      <Text selectable={selectable} style={style}>{children}</Text>
    </GestureDetector>
  );
};

interface ContentRendererProps {
  content: any;
  contentStylesheets?: BookStyleSheet[];
  bookStyles?: Record<string, any>;
  scrollToNavId?: string | null;
}

const ContentRenderer = ({ 
  content, 
  contentStylesheets = [],
  bookStyles = {},
  scrollToNavId = null
}: ContentRendererProps) => {
  const flatListRef = useRef<FlatList>(null);
  // Process CSS stylesheets into React Native styles
  const processedStyles = useMemo(() => {
    if (contentStylesheets && contentStylesheets.length > 0) {
      return processBookStyles(contentStylesheets);
    }
    return {};
  }, [contentStylesheets]);

  // Convert the content object into a flat array for FlatList
  const flattenedContent = useMemo(() => {
    const items = [];
    // Convert object keys to numerical indices and sort them
    const keys = Object.keys(content)
      .filter(key => !isNaN(parseInt(key)))
      .map(key => parseInt(key))
      .sort((a, b) => a - b);
    
    // Keep track of which items have navIds for debugging
    const navIdItems = [];

    for (const key of keys) {
      const item = {
        ...content[key],
        key: key.toString(),
      };
      
      // Log items with navIds for easier debugging
      if (item.navId) {
        navIdItems.push({ index: key, navId: item.navId });
      }
      
      items.push(item);
    }
    
    // Log navigation points for debugging
    if (navIdItems.length > 0) {
      console.log(`Found ${navIdItems.length} elements with navIds:`, 
        navIdItems.slice(0, 5).map(i => `${i.navId}@${i.index}`).join(', ') + 
        (navIdItems.length > 5 ? ` ... and ${navIdItems.length - 5} more` : '')
      );
    }
    
    return items;
  }, [content]);

  // Render a single node item
  const renderNode = (node: ElementNode, index: string | number, bookStyles: Record<string, any>) => {
    if (!node) return null;
    
    // Get inline styles from node props
    const cssStyles = node.props?.style ? node.props.style : {};
    
    // Get CSS class styles if available
    let cssClassStyles = {};
    if (node.props?.className && processedStyles) {
      // Handle multiple classes
      const classNames = node.props.className.split(/\s+/);
      for (const className of classNames) {
        // Check in processedStyles first (from the book's CSS)
        if (processedStyles[className]) {
          cssClassStyles = { ...cssClassStyles, ...processedStyles[className] };
        }
        
        // Also check in our own styles (for special classes like epub-section-break)
        if (styles[className]) {
          cssClassStyles = { ...cssClassStyles, ...styles[className] };
        }
      }
    }
    
    // Get element type styles from CSS
    let elementTypeStyles = {};
    if (node.type && processedStyles && processedStyles[node.type]) {
      elementTypeStyles = processedStyles[node.type];
    }
    
    // Get ID-based styles if available
    let idStyles = {};
    if (node.props?.id && processedStyles) {
      const idSelector = node.props.id;
      if (processedStyles[idSelector]) {
        idStyles = processedStyles[idSelector];
      }
    }
    
    // Extract non-style props as before
    const styleProps = node.props && typeof node.props === 'object' 
      ? Object.keys(node.props)
        .filter(key => key !== 'style' && key !== 'id' && key !== 'className')
        .reduce((obj: Record<string, any>, key: string) => {
          obj[key] = node.props?.[key];
          return obj;
        }, {})
      : {};

    const renderChildren = (children: (ElementNode | string)[] | undefined) => {
      if (!children) return null;
      return children.map((child, childIndex) =>
        typeof child === 'string' 
          ? <Text key={`text-${index}-${childIndex}`}>{child}</Text>
          : renderNode(child, `${index}-${childIndex}`, bookStyles)
      );
    };

    switch (node.type) {
      case 'p':
        return (
          <GestureText
            key={`p-${index}`}
            style={[styles.paragraph, elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]}
            selectable={true}
          >
            {renderChildren(node.children)}
          </GestureText>
        );

      case 'h1':
        return (
          <Text key={`h1-${index}`} style={[styles.h1, elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]}>
            {renderChildren(node.children)}
          </Text>
        );

      case 'h2':
        return (
          <GestureText selectable={true} key={`h2-${index}`} style={[styles.h2, elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]}>
            {renderChildren(node.children)}
          </GestureText>
        );

      case 'h3':
        return (
          <Text key={`h3-${index}`} style={[styles.h3, elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]}>
            {renderChildren(node.children)}
          </Text>
        );

      case 'h4':
      case 'h5':
      case 'h6':
        return (
          <Text key={`h4-6-${index}`} style={[styles.h4, elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]}>
            {renderChildren(node.children)}
          </Text>
        );

      case 'div':
      case 'section':
      case 'article':
        return (
          <View key={`container-${index}`} style={[elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]}>
            {node.children?.map((child, childIndex: number) =>
              typeof child === 'string'
                ? <Text key={`text-in-container-${childIndex}`}>{child}</Text>
                : renderNode(child, `${index}-${childIndex}`, bookStyles)
            )}
          </View>
        );

      case 'strong':
      case 'b':
        return (
          <Text key={`bold-${index}`} style={[styles.bold, elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]}>
            {renderChildren(node.children)}
          </Text>
        );

      case 'em':
      case 'i':
        return (
          <Text key={`italic-${index}`} style={[styles.italic, elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]}>
            {renderChildren(node.children)}
          </Text>
        );

      case 'a':
        return (
          <Text
            key={`link-${index}`}
            style={[styles.link, elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]}
            // You might want to add onPress handler here
          >
            {renderChildren(node.children)}
          </Text>
        );

      case 'img':
        const imgSrc = node.props?.src || '';
        return (
          <View key={`img-${index}`} style={[styles.imageContainer, elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]}>
            {imgSrc ? <ImageFromUri uri={imgSrc} /> : <Text style={styles.placeholderText}>Image Missing</Text>}
          </View>
        );

      case 'br':
        return <Text key={`br-${index}`}>{"\n"}</Text>;

      case 'hr':
        return <View key={`hr-${index}`} style={[styles.horizontalRule, elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]} />;

      case 'ul':
      case 'ol':
        return (
          <View key={`list-${index}`} style={[styles.list, elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]}>
            {node.children?.map((child, childIndex: number) =>
              typeof child === 'string'
                ? <Text key={`text-in-list-${childIndex}`}>{child}</Text>
                : renderNode(child, `${index}-${childIndex}`, bookStyles)
            )}
          </View>
        );

      case 'li':
        const isOrderedList = node.parent?.type === 'ol';
        // Convert index to number if it's a string
        const indexNum = typeof index === 'string' ? parseInt(index, 10) : index;
        const bulletOrNumber = isOrderedList ? `${indexNum + 1}. ` : '• ';

        return (
          <View key={`li-${index}`} style={[styles.listItem, elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]}>
            <Text style={styles.bulletOrNumber}>{bulletOrNumber}</Text>
            <View style={styles.listItemContent}>
              {node.children?.map((child, childIndex: number) =>
                typeof child === 'string'
                  ? <Text key={`text-in-li-${childIndex}`}>{child}</Text>
                  : renderNode(child, `${index}-${childIndex}`, bookStyles)
              )}
            </View>
          </View>
        );

      case 'text':
        // Wrap text node content in Text component
        const textContent = typeof node.children?.[0] === 'string' ? node.children[0] : '';
        return <Text key={`text-node-${index}`}>{textContent}</Text>;

      default:
        // Generic handler for unsupported elements
        return (
          <View key={`unknown-${index}`} style={[elementTypeStyles, cssClassStyles, idStyles, cssStyles, styleProps]}>
            {node.children?.map((child, childIndex: number) =>
              typeof child === 'string'
                ? <Text key={`text-in-unknown-${childIndex}`}>{child}</Text>
                : renderNode(child, `${index}-${childIndex}`, bookStyles)
            )}
          </View>
        );
    }
  };

  // Render a single item for FlatList
  const renderItem = ({ item }: { item: ElementNode & { key: string } }) => {
    return renderNode(item, item.key, bookStyles);
  };

  // Optimize FlatList with keyExtractor
  const keyExtractor = (item: ElementNode & { key: string }) => item.key;
  
  // Find the index of the element with the scrollToNavId
  const scrollToIndex = useMemo(() => {
    if (!scrollToNavId) return -1;
    
    const index = flattenedContent.findIndex(item => item.navId === scrollToNavId);
    console.log(`Attempting to scroll to element with navId ${scrollToNavId}, found at index ${index}`);
    return index;
  }, [flattenedContent, scrollToNavId]);
  
  // Track scroll attempts to handle retries
  const scrollAttempts = useRef(0);
  const maxScrollAttempts = 5;
  
  // Scroll to the element with the matching navId when it changes
  useEffect(() => {
    if (scrollToIndex === -1 || !flatListRef.current) return;
    
    console.log(`Attempting to scroll to index ${scrollToIndex}, attempt ${scrollAttempts.current + 1}`);
    
    // Progressive backoff for multiple attempts
    const attemptScroll = () => {
      // Reset attempts when scrollToIndex changes
      if (scrollAttempts.current === 0) {
        console.log(`First attempt to scroll to index ${scrollToIndex}`);
      }
      
      // Increment attempt counter
      scrollAttempts.current += 1;
      
      try {
        // Try to scroll to the target index
        flatListRef.current?.scrollToIndex({
          index: scrollToIndex,
          animated: true,
          viewPosition: 0, // position at the top of the screen
        });
        console.log(`Scroll attempt ${scrollAttempts.current} completed`);
      } catch (error) {
        console.warn(`Scroll attempt ${scrollAttempts.current} failed with error:`, error);
      }
      
      // If we haven't reached max attempts, schedule another try with increased delay
      if (scrollAttempts.current < maxScrollAttempts) {
        const delay = 300 * scrollAttempts.current; // Progressive backoff
        console.log(`Scheduling next scroll attempt in ${delay}ms`);
        setTimeout(attemptScroll, delay);
      } else {
        console.log(`Maximum scroll attempts (${maxScrollAttempts}) reached`);
        // Reset for next navigation
        scrollAttempts.current = 0;
      }
    };
    
    // Reset counter when scrollToIndex changes
    scrollAttempts.current = 0;
    
    // Start with a small delay to ensure the list is rendered first
    setTimeout(attemptScroll, 200);
    
    // Cleanup function
    return () => {
      // Reset the attempt counter
      scrollAttempts.current = 0;
    };
  }, [scrollToIndex]);
  
  // Handle scroll error (out of bounds)
  const handleScrollToIndexFailed = (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => {
    console.warn(`Scroll to index failed: ${JSON.stringify(info)}`);
    
    // Get approximate distance to scroll to get to the item
    const estimatedPosition = info.index * info.averageItemLength;
    
    // Scroll to an estimated position, then try again
    if (flatListRef.current) {
      flatListRef.current.scrollToOffset({
        offset: estimatedPosition,
        animated: false,
      });
      
      // Try to scroll exactly after a delay
      setTimeout(() => {
        if (flatListRef.current) {
          try {
            flatListRef.current.scrollToIndex({
              index: info.index,
              animated: true,
              viewPosition: 0,
            });
          } catch (error) {
            console.warn('Secondary scrollToIndex attempt failed:', error);
          }
        }
      }, 200);
    }
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={flattenedContent}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.contentContainer}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        
        // Improve scrolling performance with these props
        initialNumToRender={30}
        maxToRenderPerBatch={20}
        windowSize={21} // 10 screens worth of content above and below
        removeClippedSubviews={true}
        
        // Maintain scroll position
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
          autoscrollToTopThreshold: 10,
        }}
      />
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 12,
    color: '#333',
  },
  h1: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 24,
    color: '#000',
  },
  h2: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 14,
    marginTop: 20,
    color: '#222',
  },
  h3: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    marginTop: 16,
    color: '#333',
  },
  h4: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    marginTop: 14,
    color: '#444',
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  link: {
    color: '#0066cc',
    textDecorationLine: 'underline',
  },
  horizontalRule: {
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 16,
  },
  list: {
    marginBottom: 16,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 16,
  },
  bulletOrNumber: {
    width: 20,
    marginRight: 8,
  },
  listItemContent: {
    flex: 1,
  },
  imageContainer: {
    width: '100%',
    marginVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#999',
    fontStyle: 'italic',
    padding: 20,
  },
  // Add styling for the section breaks between chapters
  'epub-section-break': {
    height: 40,
    marginVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
});

export default ContentRenderer;
