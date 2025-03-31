import React, { useMemo } from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

// Create a gesture-enabled Text component
const GestureText = ({ children, style, selectable = false }) => {
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

const ContentRenderer = ({ content, bookStyles = {} }) => {
  // Convert the content object into a flat array for FlatList
  const flattenedContent = useMemo(() => {
    const items = [];
    // Convert object keys to numerical indices and sort them
    const keys = Object.keys(content)
      .filter(key => !isNaN(parseInt(key)))
      .map(key => parseInt(key))
      .sort((a, b) => a - b);

    for (const key of keys) {
      items.push({
        ...content[key],
        key: key.toString(),
      });
    }
    return items;
  }, [content]);

  // Render a single node item
  const renderNode = (node, index, bookStyles) => {
    if (!node) return null;
    
    const cssStyles = node.props?.style ? node.props.style : {};
    const styleProps = node.props && typeof node.props === 'object' 
      ? Object.keys(node.props)
        .filter(key => key !== 'style' && key !== 'id')
        .reduce((obj, key) => {
          obj[key] = node.props[key];
          return obj;
        }, {})
      : {};

    const renderChildren = (children) => {
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
            style={[styles.paragraph, cssStyles, styleProps]}
            selectable={true}
          >
            {renderChildren(node.children)}
          </GestureText>
        );

      case 'h1':
        return (
          <Text key={`h1-${index}`} style={[styles.h1, cssStyles, styleProps]}>
            {renderChildren(node.children)}
          </Text>
        );

      case 'h2':
        return (
          <GestureText selectable={true} key={`h2-${index}`} style={[styles.h2, cssStyles, styleProps]}>
            {renderChildren(node.children)}
          </GestureText>
        );

      case 'h3':
        return (
          <Text key={`h3-${index}`} style={[styles.h3, cssStyles, styleProps]}>
            {renderChildren(node.children)}
          </Text>
        );

      case 'h4':
      case 'h5':
      case 'h6':
        return (
          <Text key={`h4-6-${index}`} style={[styles.h4, cssStyles, styleProps]}>
            {renderChildren(node.children)}
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
                : renderNode(child, `${index}-${childIndex}`, bookStyles)
            )}
          </View>
        );

      case 'strong':
      case 'b':
        return (
          <Text key={`bold-${index}`} style={[styles.bold, cssStyles, styleProps]}>
            {renderChildren(node.children)}
          </Text>
        );

      case 'em':
      case 'i':
        return (
          <Text key={`italic-${index}`} style={[styles.italic, cssStyles, styleProps]}>
            {renderChildren(node.children)}
          </Text>
        );

      case 'a':
        return (
          <Text
            key={`link-${index}`}
            style={[styles.link, cssStyles, styleProps]}
            // You might want to add onPress handler here
          >
            {renderChildren(node.children)}
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
                : renderNode(child, `${index}-${childIndex}`, bookStyles)
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
                  : renderNode(child, `${index}-${childIndex}`, bookStyles)
              )}
            </View>
          </View>
        );

      case 'text':
        // Wrap text node content in Text component
        return <Text key={`text-node-${index}`}>{node.children?.[0] || ''}</Text>;

      default:
        // Generic handler for unsupported elements
        return (
          <View key={`unknown-${index}`} style={[cssStyles, styleProps]}>
            {node.children?.map((child, childIndex) =>
              typeof child === 'string'
                ? <Text key={`text-in-unknown-${childIndex}`}>{child}</Text>
                : renderNode(child, `${index}-${childIndex}`, bookStyles)
            )}
          </View>
        );
    }
  };

  // Render a single item for FlatList
  const renderItem = ({ item }) => {
    return renderNode(item, item.key, bookStyles);
  };

  // Optimize FlatList with keyExtractor
  const keyExtractor = (item) => item.key;

  return (
    <GestureHandlerRootView style={styles.container}>
      <FlatList
        data={flattenedContent}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.contentContainer}
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
});

export default ContentRenderer;
