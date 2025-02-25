import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  Modal,
  Button,
  Platform,
} from 'react-native';
import { NavigationContainer, createStaticNavigation, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { pick } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import * as ZipArchive from 'react-native-zip-archive';
import ContentScreen from './ContentScreen';
import { createDrawerNavigator } from '@react-navigation/drawer';

/**
 * Recursively searches for an OPF file in the given directory
 * @param {string} directoryPath - The directory to search in
 * @returns {Promise<string|null>} - The absolute path to the OPF file or null if not found
 */
const findOpfFile = async (directoryPath: string): Promise<string | null> => {
  try {
    // Read all items in the current directory
    const items = await RNFS.readDir(directoryPath);
    
    // First, check for OPF files in the current directory
    for (const item of items) {
      if (!item.isDirectory() && item.name.endsWith('.opf')) {
        console.log('Found OPF file:', item.path);
        return item.path;
      }
    }
    
    // If not found in current directory, search in subdirectories
    for (const item of items) {
      if (item.isDirectory()) {
        const opfPath: string | null = await findOpfFile(item.path);
        if (opfPath) {
          return opfPath; // Return if found in subdirectory
        }
      }
    }
    
    // If we got here, no OPF file was found
    return null;
  } catch (error) {
    console.error('Error searching for OPF file:', error);
    throw error;
  }
};

const extractEpub = async (fileUri: string) => {
  try {
    // For content:// URIs on Android, we need to copy the file to app's cache directory first
    let sourcePath = fileUri;
    
    if (Platform.OS === 'android' && fileUri.startsWith('content://')) {
      // Create a temporary file path in cache directory
      const tempFilePath = `${RNFS.CachesDirectoryPath}/temp_epub.epub`;
      
      // Copy the file from content URI to the temp path
      await RNFS.copyFile(fileUri, tempFilePath);
      sourcePath = tempFilePath;
    }
    
    // Create destination folder
    const destinationPath = `${RNFS.CachesDirectoryPath}/extracted_epub`;
    
    // Ensure the destination directory exists
    await RNFS.mkdir(destinationPath);
    
    // Subscribe to unzipping progress (optional)
    const subscription = ZipArchive.subscribe(({ progress, filePath }) => {
      console.log(`Unzipping progress: ${progress}%`);
    });
    
    // Unzip the file
    const extractedPath = await ZipArchive.unzip(sourcePath, destinationPath);
    
    // Unsubscribe from progress updates
    subscription.remove();
    
    console.log('EPUB extracted to:', extractedPath);
    return extractedPath;
  } catch (error) {
    console.error('Error extracting EPUB:', error);
    throw error;
  }
};

interface TOCItem {
  label: string;
  href: string;
  path: string;
}

interface StyleSheet {
  path: string;
  content: string;
}

function HomeScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const [tableOfContents, setTableOfContents] = useState<TOCItem[]>([]);
  const [epubBasePath, setEpubBasePath] = useState<string>('');
  const [styleSheets, setStyleSheets] = useState<StyleSheet[]>([]);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('French');

  // Available languages for translation
  const languages = [
    { label: 'French', value: 'French' },
    { label: 'Spanish', value: 'Spanish' },
    { label: 'German', value: 'German' },
    { label: 'Italian', value: 'Italian' },
    { label: 'Dutch', value: 'Dutch' },
  ];

  

  

  

  return (
    <SafeAreaView style={styles.container}>
      {tableOfContents.length > 0 ? (
        <ScrollView style={styles.tocContainer}>
          <Text style={styles.tocHeader}>Table of Contents ({tableOfContents.length} items)</Text>
          <Text style={styles.languageNote}>Selected language: {selectedLanguage}</Text>
          <TouchableOpacity 
            style={styles.changeLanguageButton}
            onPress={() => setShowLanguageModal(true)}
          >
            <Text style={styles.changeLanguageButtonText}>Change Language</Text>
          </TouchableOpacity>
          {tableOfContents.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.tocItem}
              //onPress={() => handleTocItemPress(item)}
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

      {/* Language Selection Modal */}
      <Modal
        visible={showLanguageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Translation Language</Text>
            <ScrollView style={styles.languageList}>
              {languages.map((language) => (
                <TouchableOpacity
                  key={language.value}
                  style={[
                    styles.languageItem,
                    selectedLanguage === language.value && styles.selectedLanguageItem
                  ]}
                  onPress={() => {
                    setSelectedLanguage(language.value);
                    setShowLanguageModal(false);
                  }}
                >
                  <Text 
                    style={[
                      styles.languageText,
                      selectedLanguage === language.value && styles.selectedLanguageText
                    ]}
                  >
                    {language.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowLanguageModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

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
    
    //setStyleSheets(sheets);
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

// Step 4: Create custom drawer content component (optional)
function CustomDrawerContent() {
  const navigation = useNavigation();

  const selectAndReadEpub = async () => {
    try {
      const [file] = await pick({
        type: ['application/epub+zip'],
        mode: 'open',
      });

      const extractedPath = await extractEpub(file.uri);
      const opfPath = await findOpfFile(extractedPath);
      if (opfPath) {
        const content = readContentOpf(opfPath);
        console.log(content);
      } else {
        console.log('opfPath null');
      }
    } catch (e: any) {
      console.log('pick failed: ', e);
    }
  };
  
  return (
    <View>
      <View>
        <Text>tongues</Text>
      </View>
      <View>
        <Button 
          title="Open Book" 
          onPress={selectAndReadEpub} 
        />
      </View>
    </View>
  );
}

const Drawer = createDrawerNavigator();

function App() {
  return (
    <NavigationContainer>
      <Drawer.Navigator
        initialRouteName='Home'
        drawerContent={() => <CustomDrawerContent />}
        screenOptions={{
          drawerStyle: {
            width: 240,
          },
        }}
      >
        <Drawer.Screen name="Home" component={HomeScreen} />
        <Drawer.Screen name="Content" component={ContentScreen} />
      </Drawer.Navigator>
      
    </NavigationContainer>
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
  languageNote: {
    fontSize: 14,
    marginBottom: 5,
    color: '#444',
  },
  changeLanguageButton: {
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 5,
    marginBottom: 15,
    alignSelf: 'flex-start',
  },
  changeLanguageButtonText: {
    fontSize: 14,
    color: '#007AFF',
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '80%',
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  languageList: {
    maxHeight: 300,
  },
  languageItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectedLanguageItem: {
    backgroundColor: '#e6f7ff',
  },
  languageText: {
    fontSize: 16,
  },
  selectedLanguageText: {
    fontWeight: 'bold',
    color: '#007AFF',
  },
  closeButton: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
});

export default App;
