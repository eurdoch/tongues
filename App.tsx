import React, { useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Button,
  View,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import * as ZipArchive from 'react-native-zip-archive';

interface TOCItem {
  label: string;
  href: string;
  path: string;
}

function App(): React.JSX.Element {
  const [tableOfContents, setTableOfContents] = useState<TOCItem[]>([]);
  const [epubBasePath, setEpubBasePath] = useState<string>('');

  const extractTitle = async (filePath: string): Promise<string> => {
    try {
      const content = await RNFS.readFile(filePath, 'utf8');
      
      // Try to get the title from the HTML title tag first
      let titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1].trim()) {
        return titleMatch[1].trim();
      }
      
      // If no title tag, try to find first heading or significant content
      titleMatch = content.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                  content.match(/<h2[^>]*>([^<]+)<\/h2>/i) ||
                  content.match(/<div[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/i);
      
      if (titleMatch && titleMatch[1].trim()) {
        return titleMatch[1].trim();
      }
      
      // Remove HTML tags and try to get first meaningful text
      const textContent = content.replace(/<[^>]+>/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim();
      const firstLine = textContent.split('.')[0].trim();
      if (firstLine.length > 0 && firstLine.length < 100) {
        return firstLine;
      }
      
      // If all else fails, return the filename
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
      
      // First, extract just the manifest section to work with
      const manifestSection = content.match(/<manifest[^>]*>([\s\S]*?)<\/manifest>/);
      if (!manifestSection) {
        console.error('No manifest section found');
        return [];
      }

      // Parse manifest items
      const manifestItems: { [key: string]: string } = {};
      const manifestContent = manifestSection[1];
      
      // Use a simpler regex to match item elements
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

      console.log('\nTotal manifest items:', Object.keys(manifestItems).length);

      // Extract spine section
      const spineSection = content.match(/<spine[^>]*>([\s\S]*?)<\/spine>/);
      if (!spineSection) {
        console.error('No spine section found');
        return [];
      }

      // Parse spine items
      const tocItems: TOCItem[] = [];
      const spineContent = spineSection[1];
      const spineMatches = spineContent.match(/<itemref[^>]+>/g) || [];

      console.log('\nParsing spine items...');
      
      // Use Promise.all to process all items in parallel
      const tocPromises = spineMatches.map(async (item) => {
        const idrefMatch = item.match(/idref="([^"]+)"/);
        if (idrefMatch && manifestItems[idrefMatch[1]]) {
          const id = idrefMatch[1];
          const href = manifestItems[id];
          const fullPath = `${opfPath.substring(0, opfPath.lastIndexOf('/'))}/${href}`;
          
          // Extract title from the content file
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

  const selectAndReadEpub = async () => {
    let tempDir = '';
    try {
      // Select the EPUB file
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

      // Create a temporary directory for unzipping
      tempDir = `${RNFS.CachesDirectoryPath}/epubtemp_${Date.now()}`;
      await RNFS.mkdir(tempDir);
      console.log('Created temp directory:', tempDir);
      
      // Get the correct file path and unzip
      const sourceFilePath = decodeURIComponent(file.fileCopyUri.replace('file://', ''));
      console.log('Unzipping from:', sourceFilePath);
      const unzipPath = await ZipArchive.unzip(sourceFilePath, tempDir);
      console.log('Successfully unzipped to:', unzipPath);

      // Read container.xml
      const containerXmlPath = `${unzipPath}/META-INF/container.xml`;
      console.log('Reading container.xml from:', containerXmlPath);
      const containerXml = await RNFS.readFile(containerXmlPath, 'utf8');
      
      // Get root file path
      const rootFileMatch = containerXml.match(/full-path="([^"]*)"/)
      if (!rootFileMatch) {
        throw new Error('Could not find root file path in container.xml');
      }
      const rootFilePath = rootFileMatch[1];
      console.log('Found root file path:', rootFilePath);

      const fullRootPath = `${unzipPath}/${rootFilePath}`;
      console.log('Full root path:', fullRootPath);

      // Parse content.opf and create table of contents
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
  };

  const handleTocItemPress = async (item: TOCItem) => {
    try {
      console.log(`\n--- ${item.label} ---`);
      const content = await RNFS.readFile(item.path, 'utf8');
      console.log(content);
    } catch (error) {
      console.error('Error reading content:', error);
      Alert.alert('Error', 'Failed to read content');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.buttonContainer}>
        <Button
          title="Select EPUB File"
          onPress={selectAndReadEpub}
        />
      </View>
      
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  buttonContainer: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
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
});

export default App;