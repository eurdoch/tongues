import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { NavPoint } from '../types/NavPoint';

/**
 * Extracts NavPoints from the navMap object returned by xmldom's DOMParser
 */
export function extractNavPoints(navMap: any): NavPoint[] {
  const navPoints: NavPoint[] = [];

  // Helper function to process a navPoint node
  function processNavPoint(node: any): NavPoint | null {
    if (node.nodeName !== 'navPoint') return null;

    const id = node.getAttribute('id') || '';
    const playOrder = node.getAttribute('playOrder') || '';
    
    // Extract label text
    let label = '';
    let src = '';
    
    // Find the text and content elements
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      
      // Get text label from navLabel -> text
      if (child.nodeName === 'navLabel') {
        for (let j = 0; j < child.childNodes.length; j++) {
          const textNode = child.childNodes[j];
          if (textNode.nodeName === 'text') {
            label = textNode.textContent || '';
            break;
          }
        }
      }
      
      // Get src from content element
      if (child.nodeName === 'content') {
        src = child.getAttribute('src') || '';
      }
    }
    
    // Process any child navPoints
    const children: NavPoint[] = [];
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeName === 'navPoint') {
        const childNavPoint = processNavPoint(child);
        if (childNavPoint) {
          children.push(childNavPoint);
        }
      }
    }
    
    return { id, playOrder, label, src, children };
  }
  
  // Process all top-level navPoint nodes
  for (let i = 0; i < navMap.childNodes.length; i++) {
    const node = navMap.childNodes[i];
    if (node.nodeName === 'navPoint') {
      const navPoint = processNavPoint(node);
      if (navPoint) {
        navPoints.push(navPoint);
      }
    }
  }
  
  return navPoints;
}

type TableOfContentsProps = {
  navPoints?: NavPoint[];
  navMap?: any; // For backward compatibility
  onNavigate: (item: NavPoint) => void;
};

/**
 * Render a recursive table of contents component
 */
const TableOfContents: React.FC<TableOfContentsProps> = ({ navPoints, navMap, onNavigate }) => {
  // Use provided navPoints or extract from navMap if not provided
  const toc = navPoints || (navMap ? extractNavPoints(navMap) : []);
  
  // Recursive component to render nav points with their children
  const renderNavPoint = ({ item, level = 0 }: { item: NavPoint, level?: number }) => {
    return (
      <View>
        <TouchableOpacity 
          style={[styles.navItem, { paddingLeft: 16 + level * 16 }]}
          onPress={() => onNavigate(item)}
        >
          <Text style={styles.navText}>{item.label}</Text>
        </TouchableOpacity>
        
        {item.children.map((child, index) => (
          <View key={child.id || index}>
            {renderNavPoint({ item: child, level: level + 1 })}
          </View>
        ))}
      </View>
    );
  };
  
  // Flat list for better performance with large TOCs
  const renderItem = ({ item }: { item: NavPoint }) => renderNavPoint({ item });
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Table of Contents</Text>
      <FlatList
        data={toc}
        renderItem={renderItem}
        keyExtractor={(item) => item.id || item.playOrder || item.label}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  navItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  navText: {
    fontSize: 16,
  },
});

export default TableOfContents;
