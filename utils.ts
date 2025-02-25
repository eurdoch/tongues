import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import * as ZipArchive from 'react-native-zip-archive';
import TOCItem from './types/TOCItem';

interface StyleSheet {
  path: string;
  content: string;
}

const languages = [
  { label: 'French', value: 'French' },
  { label: 'Spanish', value: 'Spanish' },
  { label: 'German', value: 'German' },
  { label: 'Italian', value: 'Italian' },
  { label: 'Dutch', value: 'Dutch' },
];

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
    
    // Create a unique destination folder with timestamp
    const timestamp = Date.now();
    const destinationPath = `${RNFS.CachesDirectoryPath}/extracted_epub_${timestamp}`;
    
    // Ensure the destination directory exists
    try {
      // Check if the destination directory already exists and remove it
      const exists = await RNFS.exists(destinationPath);
      if (exists) {
        await RNFS.unlink(destinationPath);
      }
      
      // Create the directory
      await RNFS.mkdir(destinationPath);
    } catch (error) {
      console.error('Error preparing extraction directory:', error);
      // Still create the directory if it doesn't exist
      await RNFS.mkdir(destinationPath);
    }
    
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

export const parseEpub = async (uri: string) => {
    const extractedPath = await extractEpub(uri);
    const opfPath = await findOpfFile(extractedPath);
    if (opfPath) {
        const content = readContentOpf(opfPath);
        return content;
    }
    return null;
}
