import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  Button,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import * as ZipArchive from 'react-native-zip-archive';
import ContentScreen from './ContentScreen';

interface TOCItem {
  label: string;
  href: string;
  path: string;
}

interface StyleSheet {
  path: string;
  content: string;
}

type RootStackParamList = {
  Home: undefined;
  Content: { content: string; title: string; cssContent?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function HomeScreen({ navigation }: any): React.JSX.Element {
  const [tableOfContents, setTableOfContents] = useState<TOCItem[]>([]);
  const [epubBasePath, setEpubBasePath] = useState<string>('');
  const [styleSheets, setStyleSheets] = useState<StyleSheet[]>([]);

  const findStyleSheets = async (opfPath: string, manifestItems: { [key: string]: string }) => {
    const stylesheets: StyleSheet[] = [];
    const basePath = opfPath.substring(0, opfPath.lastIndexOf('/'));

    // Find CSS files from manifest
    for (const [id, href] of Object.entries(manifestItems)) {
      if (href.endsWith('.css') || 
          (href.includes('.') && manifestItems[id].includes('text/css'))) {
        const cssPath = `${basePath}/${href}`;
        try {
          const content = await RNFS.readFile(cssPath, 'utf8');
          stylesheets.push({ path: cssPath, content });
          console.log('Found stylesheet:', href);
        } catch (error) {
          console.error('Error reading CSS file:', error);
        }
      }
    }

    // Also look for inline styles in content files
    for (const href of Object.values(manifestItems)) {
      if (href.endsWith('.xhtml') || href.endsWith('.html') || href.endsWith('.htm')) {
        const htmlPath = `${basePath}/${href}`;
        try {
          const content = await RNFS.readFile(htmlPath, 'utf8');
          const styleMatches = content.match(/<style[^>]*>([\s\S]*?)<\/style>/g);
          if (styleMatches) {
            styleMatches.forEach(match => {
              const styleContent = match.replace(/<style[^>]*>|<\/style>/g, '');
              stylesheets.push({ path: htmlPath, content: styleContent });
              console.log('Found inline style in:', href);
            });
          }
        } catch (error) {
          console.error('Error checking for inline styles:', error);
        }
      }
    }

    return stylesheets;
  };

  const extractTitle = async (filePath: string): Promise<string> => {
    try {
      const content = await RNFS.readFile(filePath, 'utf8');
      
      let titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1].trim()) {
        return titleMatch[1].trim();
      }
      
      titleMatch = content.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                  content.match(/<h2[^>]*>([^<]+)<\/h2>/i) ||
                  content.match(/<div[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/i);
      
      if (titleMatch && titleMatch[1].trim()) {
        return titleMatch[1].trim();
      }
      
      const textContent = content.replace(/<[^>]+>/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim();
      const firstLine = textContent.split('.')[0].trim();
      if (firstLine.length > 0 && firstLine.length < 100) {
        return firstLine;
      }
      
      return filePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Untitled';
    } catch (error) {
      console.error('Error reading file for title:', error);
      return filePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Untitled';
    }
  };

  const readContentOpf = async (opfPath: string) => {
    try {
      console.log('Reading OPF file from path:', opfPath);
      const content = await RNFS.readFile(opfPath, 'utf8');
      
      const manifestSection = content.match(/<manifest[^>]*>([\s\S]*?)<\/manifest>/);
      if (!manifestSection) {
        console.error('No manifest section found');
        return [];
      }

      const manifestItems: { [key: string]: string } = {};
      const manifestContent = manifestSection[1];
      const itemMatches = manifestContent.match(/<item[^>]+>/g) || [];
      
      console.log('\nParsing manifest items...');
      itemMatches.forEach(item => {
        const idMatch = item.match(/id="([^"]+)"/);
        const hrefMatch = item.match(/href="([^"]+)"/);
        
        if (idMatch && hrefMatch) {
          const id = idMatch[1];
          const href = hrefMatch[1];
          manifestItems[id] = href;
          console.log('Found manifest item:', { id, href });
        }
      });

      // Find and store stylesheets
      const sheets = await findStyleSheets(opfPath, manifestItems);
      setStyleSheets(sheets);
      console.log('Found', sheets.length, 'stylesheets');

      const spineSection = content.match(/<spine[^>]*>([\s\S]*?)<\/spine>/);
      if (!spineSection) {
        console.error('No spine section found');
        return [];
      }

      const tocItems: TOCItem[] = [];
      const spineContent = spineSection[1];
      const spineMatches = spineContent.match(/<itemref[^>]+>/g) || [];

      console.log('\nParsing spine items...');
      
      const tocPromises = spineMatches.map(async (item) => {
        const idrefMatch = item.match(/idref="([^"]+)"/);
        if (idrefMatch && manifestItems[idrefMatch[1]]) {
          const id = idrefMatch[1];
          const href = manifestItems[id];
          const fullPath = `${opfPath.substring(0, opfPath.lastIndexOf('/'))}/${href}`;
          
          const title = await extractTitle(fullPath);
          
          return {
            label: title,
            href: href,
            path: fullPath,
          };
        }
        return null;
      });
      
      const resolvedItems = await Promise.all(tocPromises);
      tocItems.push(...resolvedItems.filter((item): item is TOCItem => item !== null));

      console.log(`\nFinal TOC items: ${tocItems.length}`);
      return tocItems;
    } catch (error) {
      console.error('Error reading content.opf:', error);
      return [];
    }
  };

  const selectAndReadEpub = useCallback(async () => {
    let tempDir = '';
    try {
      const result = await DocumentPicker.pick({
        type: ['application/epub+zip'],
        copyTo: 'cachesDirectory',
      });

      const file = result[0];
      
      if (!file.name?.toLowerCase().endsWith('.epub')) {
        Alert.alert('Invalid File', 'Please select an EPUB file');
        return;
      }

      if (!file.fileCopyUri) {
        throw new Error('Failed to get local file path');
      }

      tempDir = `${RNFS.CachesDirectoryPath}/epubtemp_${Date.now()}`;
      await RNFS.mkdir(tempDir);
      console.log('Created temp directory:', tempDir);
      
      const sourceFilePath = decodeURIComponent(file.fileCopyUri.replace('file://', ''));
      console.log('Unzipping from:', sourceFilePath);
      const unzipPath = await ZipArchive.unzip(sourceFilePath, tempDir);
      console.log('Successfully unzipped to:', unzipPath);

      const containerXmlPath = `${unzipPath}/META-INF/container.xml`;
      console.log('Reading container.xml from:', containerXmlPath);
      const containerXml = await RNFS.readFile(containerXmlPath, 'utf8');
      
      const rootFileMatch = containerXml.match(/full-path="([^"]*)"/)
      if (!rootFileMatch) {
        throw new Error('Could not find root file path in container.xml');
      }
      const rootFilePath = rootFileMatch[1];
      console.log('Found root file path:', rootFilePath);

      const fullRootPath = `${unzipPath}/${rootFilePath}`;
      console.log('Full root path:', fullRootPath);

      const toc = await readContentOpf(fullRootPath);
      console.log('Setting table of contents:', toc);
      setTableOfContents(toc);
      setEpubBasePath(unzipPath);
      
      console.log('Process completed. TOC items:', toc.length);
      
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        console.log('User cancelled the picker');
      } else {
        console.error('Error processing EPUB:', err);
        Alert.alert('Error', 'Failed to process EPUB file');
      }
    }
  }, []);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button
          onPress={() => {console.log('pressed'); selectAndReadEpub();}}
          title="Select"
        />
      ),
    });
  }, [navigation, selectAndReadEpub]);

  const handleTocItemPress = async (item: TOCItem) => {
    try {
      const content = await RNFS.readFile(item.path, 'utf8');
      const combinedCss = styleSheets.map(sheet => sheet.content).join('\n');
      
      navigation.navigate('Content', {
        content,
        title: item.label,
        cssContent: combinedCss,
      });
    } catch (error) {
      console.error('Error reading content:', error);
      Alert.alert('Error', 'Failed to read content');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {tableOfContents.length > 0 ? (
        <ScrollView style={styles.tocContainer}>
          <Text style={styles.tocHeader}>Table of Contents ({tableOfContents.length} items)</Text>
          {tableOfContents.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.tocItem}
              onPress={() => handleTocItemPress(item)}
            >
              <Text style={styles.tocText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.noContentContainer}>
          <Text style={styles.noContentText}>No content loaded</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen 
            name="Home" 
            component={HomeScreen} 
            options={{ title: 'EPUB Reader' }}
          />
          <Stack.Screen 
            name="Content" 
            component={ContentScreen}
            options={({ route }: any) => ({ title: route.params.title })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  tocContainer: {
    flex: 1,
    padding: 10,
  },
  tocHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  tocItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  tocText: {
    fontSize: 16,
  },
  noContentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noContentText: {
    fontSize: 16,
    color: '#666',
  },
  headerButton: {
    padding: 10,
  },
  headerButtonText: {
    fontSize: 24,
  },
});

export default App;
