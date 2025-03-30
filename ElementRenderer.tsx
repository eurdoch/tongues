import React, { useContext } from 'react';
import { Text, View, StyleSheet, FlatList, ListRenderItem } from 'react-native';
import { ElementNode } from './types/ElementNode';
import GestureText from './GestureText';
import { useNavigationContext } from './NavigationContext';
import { processBookStyles } from './parser/CssParser';

// Create a React context to provide book styles
const BookStylesContext = React.createContext<any>({});

// Hook to use book styles
export const useBookStyles = () => useContext(BookStylesContext);

export const renderNode = (node: ElementNode, index: number, bookStyles: any = {}) => {
  if (typeof node === 'string') {
    return <GestureText selectable={true} key={`text-${index}`}>{node}</GestureText>;
  }
  
  if (node.type === 'text') {
    return (
      <GestureText selectable={true} key={`text-node-${index}`}>
        {node.children?.map((child, childIndex) => 
          typeof child === 'string' ? child : renderNode(child, childIndex, bookStyles)
        )}
      </GestureText>
    );
  }
  
  // Extract style props from node attributes
  const styleProps = extractStyleProps(node.props || {});
  
  // Add CSS styles for this node type if available
  let cssStyles = {};
  if (bookStyles && bookStyles[node.type]) {
    cssStyles = bookStyles[node.type];
  }
  
  // Add class-based styles if node has a class attribute
  if (node.props?.class && typeof node.props.class === 'string') {
    const classNames = node.props.class.split(' ');
    classNames.forEach(className => {
      if (bookStyles && bookStyles[className]) {
        cssStyles = { ...cssStyles, ...bookStyles[className] };
      }
    });
  }
  
  // Add ID-based styles if node has an ID attribute
  if (node.props?.id && bookStyles && bookStyles[node.props.id]) {
    cssStyles = { ...cssStyles, ...bookStyles[node.props.id] };
  }
  
  // Handle specific HTML elements
  switch (node.type) {
    case 'p':
      return (
        <GestureText 
          key={`p-${index}`} 
          style={[styles.paragraph, cssStyles, styleProps]}
          selectable={true} 
        >
          {node.children?.map((child, childIndex) => 
            typeof child === 'string' ? child : renderNode(child, childIndex, bookStyles)
          )}
        </GestureText>
      );
      
    case 'h1':
      return (
        <Text key={`h1-${index}`} style={[styles.h1, cssStyles, styleProps]}>
          {node.children?.map((child, childIndex) => 
            typeof child === 'string' ? child : renderNode(child, childIndex, bookStyles)
          )}
        </Text>
      );
      
    case 'h2':
      return (
        <GestureText selectable={true} key={`h2-${index}`} style={[styles.h2, cssStyles, styleProps]}>
          {node.children?.map((child, childIndex) => 
            typeof child === 'string' ? child : renderNode(child, childIndex, bookStyles)
          )}
        </GestureText>
      );
      
    case 'h3':
      return (
        <Text key={`h3-${index}`} style={[styles.h3, cssStyles, styleProps]}>
          {node.children?.map((child, childIndex) => 
            typeof child === 'string' ? child : renderNode(child, childIndex, bookStyles)
          )}
        </Text>
      );
      
    case 'h4':
    case 'h5':
    case 'h6':
      return (
        <Text key={`h4-6-${index}`} style={[styles.h4, cssStyles, styleProps]}>
          {node.children?.map((child, childIndex) => 
            typeof child === 'string' ? child : renderNode(child, childIndex, bookStyles)
          )}
        </Text>
      );
      
    case 'div':
    case 'section':
    case 'article':
      return (
        <View key={`container-${index}`} style={[cssStyles, styleProps]}>
          {node.children?.map((child, childIndex) => 
            typeof child === 'string' 
              ? <Text key={`text-in-container-${childIndex}`}>{child}</Text> 
              : renderNode(child, childIndex, bookStyles)
          )}
        </View>
      );
      
    case 'strong':
    case 'b':
      return (
        <Text key={`bold-${index}`} style={[styles.bold, cssStyles, styleProps]}>
          {node.children?.map((child, childIndex) => 
            typeof child === 'string' ? child : renderNode(child, childIndex, bookStyles)
          )}
        </Text>
      );
      
    case 'em':
    case 'i':
      return (
        <Text key={`italic-${index}`} style={[styles.italic, cssStyles, styleProps]}>
          {node.children?.map((child, childIndex) => 
            typeof child === 'string' ? child : renderNode(child, childIndex, bookStyles)
          )}
        </Text>
      );
      
    case 'a':
      return (
        <Text 
          key={`link-${index}`} 
          style={[styles.link, cssStyles, styleProps]}
          // You might want to add onPress handler here
        >
          {node.children?.map((child, childIndex) => 
            typeof child === 'string' ? child : renderNode(child, childIndex, bookStyles)
          )}
        </Text>
      );
      
    case 'img':
      return <Text key={`img-${index}`} style={[styles.h1, cssStyles, styleProps]}>Image Placeholder</Text>;
      
    case 'br':
      return <Text key={`br-${index}`}>{"\n"}</Text>;
      
    case 'hr':
      return <View key={`hr-${index}`} style={[styles.horizontalRule, cssStyles, styleProps]} />;
      
    case 'ul':
    case 'ol':
      return (
        <View key={`list-${index}`} style={[styles.list, cssStyles, styleProps]}>
          {node.children?.map((child, childIndex) => 
            typeof child === 'string' 
              ? <Text key={`text-in-list-${childIndex}`}>{child}</Text> 
              : renderNode(child, childIndex, bookStyles)
          )}
        </View>
      );
      
    case 'li':
      const isOrderedList = node.parent?.type === 'ol';
      const bulletOrNumber = isOrderedList ? `${index + 1}. ` : '• ';
      
      return (
        <View key={`li-${index}`} style={[styles.listItem, cssStyles, styleProps]}>
          <Text style={styles.bulletOrNumber}>{bulletOrNumber}</Text>
          <View style={styles.listItemContent}>
            {node.children?.map((child, childIndex) => 
              typeof child === 'string' 
                ? <Text key={`text-in-li-${childIndex}`}>{child}</Text> 
                : renderNode(child, childIndex, bookStyles)
            )}
          </View>
        </View>
      );
    
    // Add more HTML element handlers as needed
      
    default:
      // Generic handler for unsupported elements
      return (
        <View key={`unknown-${index}`} style={[cssStyles, styleProps]}>
          {node.children?.map((child, childIndex) => 
            typeof child === 'string' 
              ? <Text key={`text-in-unknown-${childIndex}`}>{child}</Text> 
              : renderNode(child, childIndex, bookStyles)
          )}
        </View>
      );
  }
};

/**
 * Adapter function to use renderNode as a FlatList renderItem function
 * 
 * @param item - The {item, index} object from FlatList
 * @returns React Native component
 */
//export const renderNodeForFlatList: ListRenderItem<ElementNode> = ({ item, index }) => {
//  return renderNode(item, index);
//};

/**
 * Extract only the top-level nodes from the HTML content
 * Used for optimizing FlatList rendering
 * 
 * @param nodes - The parsed HTML content as ElementNode array
 * @returns Array of top-level ElementNode objects
 */
export const getTopLevelNodes = (nodes: ElementNode[]): ElementNode[] => {
  return nodes.filter(node => 
    typeof node !== 'string' && 
    ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'section', 'article', 'ul', 'ol', 'img', 'hr'].includes(node.type)
  );
};

/**
 * Extracts style properties from node props
 * 
 * @param props - The ElementNode props
 * @returns StyleSheet compatible object
 */
const extractStyleProps = (props: Record<string, any>) => {
  const styles: Record<string, any> = {};
  
  // Handle inline style attribute
  if (props.style && typeof props.style === 'string') {
    // Parse simple inline CSS
    const cssProps = props.style.split(';');
    cssProps.forEach((prop: string) => {
      const [key, value] = prop.split(':').map(part => part.trim());
      if (key && value) {
        // Convert CSS property names to React Native style names
        const rnKey = key.replace(/-([a-z])/g, g => g[1].toUpperCase());
        styles[rnKey] = value;
      }
    });
  }
  
  // Handle align attribute
  if (props.align) {
    styles.textAlign = props.align;
  }
  
  // Handle class attribute (basic implementation)
  if (props.class) {
    // Add support for common class names
    const classNames = props.class.split(' ');
    if (classNames.includes('center')) {
      styles.textAlign = 'center';
    }
    if (classNames.includes('bold')) {
      styles.fontWeight = 'bold';
    }
    // Add more class name mappings as needed
  }
  
  return styles;
};

// Base styles for elements
const styles = StyleSheet.create({
  paragraph: {
    marginBottom: 10,
    fontSize: 24,
    lineHeight: 40,
  },
  h1: {
    fontSize: 32,
    fontWeight: 'bold',
    marginVertical: 12,
  },
  h2: {
    fontSize: 30,
    fontWeight: 'bold',
    marginVertical: 10,
  },
  h3: {
    fontSize: 26,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  h4: {
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 6,
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  link: {
    color: '#2196F3',
    textDecorationLine: 'underline',
  },
  image: {
    alignSelf: 'center',
    margin: 10,
  },
  horizontalRule: {
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginVertical: 10,
  },
  list: {
    marginBottom: 10,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  bulletOrNumber: {
    width: 20,
    marginRight: 5,
  },
  listItemContent: {
    flex: 1,
  }
});

/**
 * Main component that renders HTML content from ElementNode[] using FlatList
 */
export const EpubHtmlRenderer: React.FC<{
  content: ElementNode[];
  containerStyle?: any;
}> = ({ content, containerStyle }) => {
  // Get the current book from context
  const { currentBook } = useNavigationContext();
  
  // Process book stylesheets into React Native styles
  const [bookStyles, setBookStyles] = React.useState<any>({});
  
  // Process the stylesheets when the book changes
  React.useEffect(() => {
    if (currentBook?.styleSheets && currentBook.styleSheets.length > 0) {
      console.log(`Processing ${currentBook.styleSheets.length} stylesheets...`);
      const processedStyles = processBookStyles(currentBook.styleSheets);
      setBookStyles(processedStyles);
    } else {
      setBookStyles({});
    }
  }, [currentBook?.styleSheets]);
  
  // Custom renderer that passes the book styles
  const renderItemWithStyles: ListRenderItem<ElementNode> = ({ item, index }) => {
    return renderNode(item, index, bookStyles);
  };
  
  // Extract top-level nodes for better FlatList performance
  const topLevelNodes = getTopLevelNodes(content);
  
  return (
    <BookStylesContext.Provider value={bookStyles}>
      <FlatList
        data={topLevelNodes}
        renderItem={renderItemWithStyles}
        keyExtractor={(_, index) => `node-${index}`}
        style={[{ flex: 1 }, containerStyle]}
        removeClippedSubviews={true}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={10}
      />
    </BookStylesContext.Provider>
  );
};
