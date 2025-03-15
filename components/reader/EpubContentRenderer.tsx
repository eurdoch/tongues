import React from 'react';
import { GestureResponderEvent, Image, StyleSheet, View } from 'react-native';
import GestureText from '../../GestureText';
import { ElementNode } from './types';
import { useNavigationContext } from '../../NavigationContext';
import ImageFromUri from '../../ImageFromUri';

/**
 * Renders a single node from the parsed EPUB content
 */
export const renderNode = (
  node: ElementNode | string, 
  handleTextSelection: (event: GestureResponderEvent) => void
): React.ReactNode => {
  const { currentBasePath } = useNavigationContext();

  if (typeof node === 'string') {
    return (
      <GestureText 
        style={styles.text}
        selectable={true}
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
        >
          {renderChildren(node.children)}
        </GestureText>
      );
    case 'h2':
      return (
        <GestureText 
          style={[styles.text, styles.h2]}
          selectable={true}
        >
          {renderChildren(node.children)}
        </GestureText>
      );
    case 'h3':
      return (
        <GestureText 
          style={[styles.text, styles.h3]}
          selectable={true}
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
        >
          {renderChildren(node.children)}
        </GestureText>
      );
    case 'u':
      return (
        <GestureText 
          style={[styles.text, styles.underline]}
          selectable={true}
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
        >
          {renderChildren(node.children)}
        </GestureText>
      );
    case 'img':
      return (
        <ImageFromUri uri={currentBasePath + '/' + node.props?.src} />
      );
    case 'a':
      return (
        <GestureText 
          style={[styles.text, styles.link]}
          selectable={true}
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

const styles = StyleSheet.create({
  text: {
    fontSize: 30,
    lineHeight: 34,
    color: '#333',
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
