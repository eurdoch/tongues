import React, { useMemo, useRef, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet, TextStyle, ViewStyle, findNodeHandle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet as BookStyleSheet } from './types/StyleSheet';
import { processBookStyles } from './parser/CssParser';
import { ElementNode } from './types/ElementNode';
import ImageFromUri from './components/ImageFromUri';

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
  const scrollViewRef = useRef<ScrollView>(null);
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
  const renderNode = (
    node: ElementNode, 
    index: string | number, 
    bookStyles: Record<string, any>,
    parentIsTextContainer = false
  ) => {
    if (!node) return null;
    
    // Get inline styles from node props
    const cssStyles = node.props?.style ? node.props.style : {};
    
    // Get CSS class styles if available
    let cssClassStyles = {};
    
    // Handle className property from our own React components
    if (node.props?.className && processedStyles) {
      // Handle multiple classes
      const classNames = node.props.className.split(/\s+/);
      for (const className of classNames) {
        // Check in processedStyles first (from the book's CSS)
        if (processedStyles[className]) {
          cssClassStyles = { ...cssClassStyles, ...processedStyles[className] };
        }
        
        // Also check in our own styles (for special classes like epub-section-break)
        if (className === 'epub-section-break' && styles['epub-section-break']) {
          cssClassStyles = { ...cssClassStyles, ...styles['epub-section-break'] };
        }
      }
    }
    
    // IMPORTANT: Also handle regular 'class' property from HTML content
    if (node.props?.class && processedStyles) {
      // Handle multiple classes
      const classNames = node.props.class.split(/\s+/);
      for (const className of classNames) {
        // Check in processedStyles first (from the book's CSS)
        if (processedStyles[className]) {
          cssClassStyles = { ...cssClassStyles, ...processedStyles[className] };
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
    
    // Extract non-style props that can be passed to React Native components
    const nodeProps = node.props && typeof node.props === 'object' 
      ? Object.keys(node.props)
        .filter(key => key !== 'style' && key !== 'id' && key !== 'className' && key !== 'class')
        .reduce((obj: Record<string, any>, key: string) => {
          obj[key] = node.props?.[key];
          return obj;
        }, {})
      : {};

    const renderChildren = (children: (ElementNode | string)[] | undefined, isTextContainer = true) => {
      if (!children) return null;
      return children.map((child, childIndex) => {
        if (typeof child === 'string') {
          // If we're in a text container, just return the string directly
          // Text components will handle strings properly
          return isTextContainer ? child : <Text key={`text-${index}-${childIndex}`}>{child}</Text>;
        } else {
          const renderedChild = renderNode(child, `${index}-${childIndex}`, bookStyles, isTextContainer);
          
          // Ensure we never return a string when not in a text container
          if (!isTextContainer && typeof renderedChild === 'string') {
            return <Text key={`text-${index}-${childIndex}-wrapped`}>{renderedChild}</Text>;
          }
          
          return renderedChild;
        }
      });
    };

    switch (node.type) {
      case 'p':
        return (
          <Text
            key={`p-${index}`}
            style={[styles.paragraph, elementTypeStyles, cssClassStyles, idStyles, cssStyles]}
            selectable={true}
          >
            {renderChildren(node.children, true)}
          </Text>
        );

      case 'h1':
        return (
          <Text 
            key={`h1-${index}`} 
            style={[styles.h1, elementTypeStyles, cssClassStyles, idStyles, cssStyles]}
            selectable={true}
          >
            {renderChildren(node.children, true)}
          </Text>
        );

      case 'h2':
        return (
          <Text 
            key={`h2-${index}`} 
            style={[styles.h2, elementTypeStyles, cssClassStyles, idStyles, cssStyles]}
            selectable={true}
          >
            {renderChildren(node.children, true)}
          </Text>
        );

      case 'h3':
        return (
          <Text 
            key={`h3-${index}`} 
            style={[styles.h3, elementTypeStyles, cssClassStyles, idStyles, cssStyles]}
            selectable={true}
          >
            {renderChildren(node.children, true)}
          </Text>
        );

      case 'h4':
      case 'h5':
      case 'h6':
        return (
          <Text 
            key={`h4-6-${index}`} 
            style={[styles.h4, elementTypeStyles, cssClassStyles, idStyles, cssStyles]}
            selectable={true}
          >
            {renderChildren(node.children, true)}
          </Text>
        );

      case 'div':
      case 'section':
      case 'article':
        return (
          <View key={`container-${index}`} style={[elementTypeStyles, cssClassStyles, idStyles, cssStyles]} {...nodeProps}>
            {renderChildren(node.children, false)}
          </View>
        );

      case 'strong':
      case 'b':
        // Text formatting should be within a parent Text node
        if (parentIsTextContainer) {
          return (
            <Text key={`bold-${index}`} style={[styles.bold, elementTypeStyles, cssClassStyles, idStyles, cssStyles]}>
              {renderChildren(node.children, true)}
            </Text>
          );
        } else {
          return (
            <Text 
              key={`bold-${index}`} 
              style={[styles.bold, elementTypeStyles, cssClassStyles, idStyles, cssStyles]}
              selectable={true}
            >
              {renderChildren(node.children, true)}
            </Text>
          );
        }

      case 'em':
      case 'i':
        // Text formatting should be within a parent Text node
        if (parentIsTextContainer) {
          return (
            <Text key={`italic-${index}`} style={[styles.italic, elementTypeStyles, cssClassStyles, idStyles, cssStyles]}>
              {renderChildren(node.children, true)}
            </Text>
          );
        } else {
          return (
            <Text 
              key={`italic-${index}`} 
              style={[styles.italic, elementTypeStyles, cssClassStyles, idStyles, cssStyles]}
              selectable={true}
            >
              {renderChildren(node.children, true)}
            </Text>
          );
        }

      case 'a':
        // Links should be within a parent Text node
        if (parentIsTextContainer) {
          return (
            <Text key={`link-${index}`} style={[styles.link, elementTypeStyles, cssClassStyles, idStyles, cssStyles]}>
              {renderChildren(node.children, true)}
            </Text>
          );
        } else {
          return (
            <Text
              key={`link-${index}`}
              style={[styles.link, elementTypeStyles, cssClassStyles, idStyles, cssStyles]}
              selectable={true}
            >
              {renderChildren(node.children, true)}
            </Text>
          );
        }

      case 'img':
        const imgSrc = node.props?.src || '';
        return (
          <View key={`img-${index}`} style={[styles.imageContainer, elementTypeStyles, cssClassStyles, idStyles, cssStyles]} {...nodeProps}>
            {imgSrc ? <ImageFromUri uri={imgSrc} /> : <Text style={styles.placeholderText}>Image Missing</Text>}
          </View>
        );

      case 'br':
        return <Text key={`br-${index}`}>{"\n"}</Text>;

      case 'hr':
        return <View key={`hr-${index}`} style={[styles.horizontalRule, elementTypeStyles, cssClassStyles, idStyles, cssStyles]} />;

      case 'ul':
      case 'ol':
        return (
          <View key={`list-${index}`} style={[styles.list, elementTypeStyles, cssClassStyles, idStyles, cssStyles]} {...nodeProps}>
            {renderChildren(node.children, false)}
          </View>
        );

      case 'li':
        const isOrderedList = node.parent?.type === 'ol';
        // Convert index to number if it's a string
        const indexNum = typeof index === 'string' ? parseInt(index, 10) : index;
        const bulletOrNumber = isOrderedList ? `${indexNum + 1}. ` : '• ';

        return (
          <View key={`li-${index}`} style={[styles.listItem, elementTypeStyles, cssClassStyles, idStyles, cssStyles]} {...nodeProps}>
            <Text style={styles.bulletOrNumber}>{bulletOrNumber}</Text>
            <View style={styles.listItemContent}>
              {renderChildren(node.children, false)}
            </View>
          </View>
        );

      case 'text':
        // Wrap text node content in Text component
        const textContent = typeof node.children?.[0] === 'string' ? node.children[0] : '';
        if (parentIsTextContainer) {
          // When in a text container, return the string which will be wrapped by the parent Text
          return textContent;
        } else {
          // Always wrap in Text component when not in a text container
          return <Text key={`text-node-${index}`}>{textContent}</Text>;
        }

      default:
        // Generic handler for unsupported elements
        if (node.type && node.type.match(/^(span|label|small|u|s|sub|sup)$/)) {
          // These are typically inline text elements
          if (parentIsTextContainer) {
            return (
              <Text key={`inline-${index}`} style={[elementTypeStyles, cssClassStyles, idStyles, cssStyles]}>
                {renderChildren(node.children, true)}
              </Text>
            );
          } else {
            return (
              <Text
                key={`inline-${index}`}
                style={[elementTypeStyles, cssClassStyles, idStyles, cssStyles]}
                selectable={true}
              >
                {renderChildren(node.children, true)}
              </Text>
            );
          }
        } else {
          // All other elements get wrapped in a View
          return (
            <View key={`unknown-${index}`} style={[elementTypeStyles, cssClassStyles, idStyles, cssStyles]} {...nodeProps}>
              {renderChildren(node.children, false)}
            </View>
          );
        }
    }
  };

  // Reference to the rendered content is maintained using View refs
  
  // Find the index of the element with the scrollToNavId
  const scrollToIndex = useMemo(() => {
    if (!scrollToNavId) return -1;
    
    const index = flattenedContent.findIndex(item => item.navId === scrollToNavId);
    console.log(`Attempting to scroll to element with navId ${scrollToNavId}, found at index ${index}`);
    return index;
  }, [flattenedContent, scrollToNavId]);
  
  // Create refs for each nav element that we might need to scroll to
  const itemRefs = useRef<{[key: string]: React.RefObject<View>}>({});
  
  // Setup refs for all possible navigation points
  useEffect(() => {
    // Create/update refs for all items with navIds
    flattenedContent.forEach(item => {
      if (item.navId && !itemRefs.current[item.navId]) {
        itemRefs.current[item.navId] = React.createRef<View>();
      }
    });
  }, [flattenedContent]);
  
  // Scroll to the element with the matching navId when it changes
  useEffect(() => {
    if (!scrollToNavId || !scrollViewRef.current) return;
    
    console.log(`Attempting to scroll to element with navId ${scrollToNavId}`);
    
    // We need to wait for layout to complete
    setTimeout(() => {
      if (itemRefs.current[scrollToNavId]?.current) {
        // Get the ref of the target element
        const targetRef = itemRefs.current[scrollToNavId];
        
        // Measure its position and scroll to it
        targetRef.current?.measureLayout(
          // @ts-ignore - findNodeHandle might return null but in this case we know it won't
          findNodeHandle(scrollViewRef.current),
          (x, y) => {
            scrollViewRef.current?.scrollTo({
              y: y,
              animated: true
            });
            console.log(`Scrolled to position y=${y}`);
          },
          (error) => {
            console.warn(`Failed to measure layout for scrolling: ${error}`);
          }
        );
      } else {
        console.warn(`Could not find ref for navId ${scrollToNavId}`);
      }
    }, 300); // Wait for layout to complete
  }, [scrollToNavId, flattenedContent]);

  useEffect(() => console.log('DEBUG flattenedContent: ', flattenedContent), [flattenedContent]);

  // Use flattenedContent directly without optimizations

  return (
    <GestureHandlerRootView style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.contentContainer}
        removeClippedSubviews={true}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={true}
      >
        {flattenedContent.map((item, index) => {
          // For items with navId, we add a ref to enable scrolling to them
          if (item.navId && itemRefs.current[item.navId]) {
            return (
              <View key={item.key} ref={itemRefs.current[item.navId]}>
                {renderNode(item, item.key, bookStyles, false)}
              </View>
            );
          }
          
          // Render regular items without refs
          return (
            <React.Fragment key={item.key}>
              {renderNode(item, item.key, bookStyles, false)}
            </React.Fragment>
          );
        })}
      </ScrollView>
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
    height: 30,
    marginVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
});

export default ContentRenderer;
