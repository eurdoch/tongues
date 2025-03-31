import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { DOMParser } from 'xmldom';
import { readTextFile } from '../utils';
import BookData from '../types/BookData';
import StyleSheet from '../types/StyleSheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { determineLanguage } from '../services/TranslationService';
import { parseHtml } from './EpubContentParser';

const ISO_TO_LANG = {
  'fr': 'French',
  'es': 'Spanish',
  'de': 'German',
  'nl': 'Dutch',
}

export async function parseEpub(fileUri: string): Promise<BookData> {
  try {
    console.log('Starting to unzip epub file:', fileUri);
    const extractionPath = `${RNFS.CachesDirectoryPath}/epub_extract`;
    
    if (await RNFS.exists(extractionPath)) {
      await RNFS.unlink(extractionPath);
    }

    await AsyncStorage.setItem("current_book", fileUri);
    console.log(`[Async Storage]: Saved current book: ${fileUri}`);

    await RNFS.mkdir(extractionPath);
    const unzipResult = await unzip(fileUri, extractionPath);
    console.log('Epub unzipped to:', unzipResult);

    // Find navigation structure (needed for TOC)
    let navMapObj = null;
    let tableOfContents = [];
    const tocPath = await findFileWithExtension(unzipResult, 'ncx');
    
    if (tocPath) {
      const tocContents = await RNFS.readFile(tocPath, 'utf8');
      const parsedToc = new DOMParser().parseFromString(tocContents);
      navMapObj = findNavMap(parsedToc);
      
      // Extract structured table of contents
      if (navMapObj) {
        try {
          const { extractNavPoints } = require('../components/TableOfContents');
          tableOfContents = extractNavPoints(navMapObj);
          console.log(`Extracted table of contents with ${tableOfContents.length} top-level entries`);
        } catch (tocError) {
          console.error('Error extracting table of contents:', tocError);
        }
      }
    }

    // Find all HTML content files in the EPUB
    console.log('Finding all content files in EPUB...');
    const contentFiles = await findAllContentFiles(unzipResult);
    
    if (contentFiles.length === 0) {
      console.error('No content files found in EPUB');
      throw Error('No content files found in EPUB');
    }
    
    console.log(`Found ${contentFiles.length} content files in EPUB`);
    
    // Parse all content files into ElementNode arrays
    console.log('Parsing all content files...');
    const allContentElements = [];
    
    for (const contentFile of contentFiles) {
      try {
        const fileContent = await readTextFile(contentFile);
        const parsedContent = parseHtml(fileContent);
        allContentElements.push(...parsedContent);
      } catch (parseError) {
        console.error(`Error parsing content file ${contentFile}:`, parseError);
        // Continue with other files even if one fails
      }
    }
    
    console.log(`Successfully parsed ${allContentElements.length} ElementNodes from all content files`);
    
    // Find and extract all stylesheets
    console.log('Finding stylesheets...');
    // Get stylesheets from two sources and merge them
    const [fileStylesheets, opfStylesheets] = await Promise.all([
      findAllStylesheets(unzipResult),
      findOpfStylesheets(unzipResult)
    ]);
    
    // Combine both stylesheet sources, removing duplicates by path
    const allStyleSheets = [...fileStylesheets];
    for (const sheet of opfStylesheets) {
      if (!allStyleSheets.some(s => s.path === sheet.path)) {
        allStyleSheets.push(sheet);
      }
    }
    
    console.log(`Found ${allStyleSheets.length} stylesheets in total`);
    
    // Get book language
    // Use the first content file to determine language
    const lastContentFile = contentFiles[contentFiles.length-1];
    const lastContents = await readTextFile(lastContentFile);
    const determination = await determineLanguage(lastContents);

    console.log('DEBUG content: ', allContentElements);
    return {
      language: determination.language,
      path: unzipResult,
      navMap: navMapObj, // Keep for backward compatibility
      basePath: tocPath ? tocPath.substring(0, tocPath.lastIndexOf('/')) : unzipResult,
      content: allContentElements, // Add the parsed content to the BookData
      styleSheets: allStyleSheets, // Add the parsed stylesheets to the BookData
      tableOfContents: tableOfContents // Add the structured table of contents
    };
  } catch (error) {
    console.error('Epub parsing failed:', error);
    throw Error('Epub parsing failed: ' + error);
  }
}

async function findFileRecursively(dir: string, fileName: string): Promise<string | null> {
  const files = await RNFS.readDir(dir);
  for (const file of files) {
    if (file.isFile() && file.name === fileName) {
      return `${dir}/${fileName}`;
    } else if (file.isDirectory()) {
      const subDir = `${dir}/${file.name}`;
      const foundFile = await findFileRecursively(subDir, fileName);
      if (foundFile) {
        return foundFile;
      }
    }
  }
  return null;
}

async function findFileWithExtension(dir: string, extension: string): Promise<string | null> {
  const files = await RNFS.readDir(dir);
  for (const file of files) {
    if (file.isFile() && file.name.endsWith(extension)) {
      return `${dir}/${file.name}`;
    } else if (file.isDirectory()) {
      const subDir = `${dir}/${file.name}`;
      const foundFile = await findFileWithExtension(subDir, extension);
      if (foundFile) {
        return foundFile;
      }
    }
  }
  return null;
}

/**
 * Finds all HTML content files in the EPUB extraction directory
 * 
 * @param dir - The root directory of the extracted EPUB
 * @returns Array of paths to all HTML content files
 */
async function findAllContentFiles(dir: string): Promise<string[]> {
  const contentFiles: string[] = [];
  
  // Function to recursively find HTML files
  async function findHtmlFiles(directory: string): Promise<void> {
    try {
      const files = await RNFS.readDir(directory);
      
      for (const file of files) {
        const filePath = `${directory}/${file.name}`;
        
        if (file.isFile()) {
          // Check if the file is HTML content
          const lowerName = file.name.toLowerCase();
          if (lowerName.endsWith('.html') || 
              lowerName.endsWith('.xhtml') || 
              lowerName.endsWith('.htm')) {
            contentFiles.push(filePath);
          }
        } else if (file.isDirectory()) {
          // Recursively search subdirectories
          await findHtmlFiles(filePath);
        }
      }
    } catch (error) {
      console.error(`Error searching directory ${directory}:`, error);
    }
  }
  
  // Start the recursive search
  await findHtmlFiles(dir);
  return contentFiles;
}

/**
 * Finds all CSS files in the EPUB extraction directory
 * 
 * @param dir - The root directory of the extracted EPUB
 * @returns Array of StyleSheet objects
 */
async function findAllStylesheets(dir: string): Promise<StyleSheet[]> {
  const styleSheets: StyleSheet[] = [];
  
  // Function to recursively find CSS files
  async function findCssFiles(directory: string): Promise<void> {
    try {
      const files = await RNFS.readDir(directory);
      
      for (const file of files) {
        const filePath = `${directory}/${file.name}`;
        
        if (file.isFile()) {
          // Check if the file is CSS
          const lowerName = file.name.toLowerCase();
          if (lowerName.endsWith('.css')) {
            try {
              const content = await RNFS.readFile(filePath, 'utf8');
              styleSheets.push({ path: filePath, content });
              console.log('Found stylesheet:', filePath);
            } catch (error) {
              console.error(`Error reading CSS file ${filePath}:`, error);
            }
          } else if (lowerName.endsWith('.html') || lowerName.endsWith('.xhtml') || lowerName.endsWith('.htm')) {
            // Also check HTML files for embedded styles
            try {
              const content = await RNFS.readFile(filePath, 'utf8');
              const styleMatches = content.match(/<style[^>]*>([\s\S]*?)<\/style>/g);
              if (styleMatches) {
                styleMatches.forEach((match, index) => {
                  const styleContent = match.replace(/<style[^>]*>|<\/style>/g, '');
                  styleSheets.push({ 
                    path: `${filePath}#style-${index}`, 
                    content: styleContent 
                  });
                  console.log(`Found inline style #${index} in:`, filePath);
                });
              }
            } catch (error) {
              console.error(`Error checking for inline styles in ${filePath}:`, error);
            }
          }
        } else if (file.isDirectory()) {
          // Recursively search subdirectories
          await findCssFiles(filePath);
        }
      }
    } catch (error) {
      console.error(`Error searching directory ${directory}:`, error);
    }
  }
  
  // Start the recursive search
  await findCssFiles(dir);
  return styleSheets;
}

/**
 * Find stylesheets referenced in the container.opf manifest
 * 
 * @param extractionPath - The EPUB extraction directory
 * @returns Array of StyleSheet objects
 */
async function findOpfStylesheets(extractionPath: string): Promise<StyleSheet[]> {
  const stylesheets: StyleSheet[] = [];
  
  try {
    // First find the OPF file
    const opfPath = await findFileWithExtension(extractionPath, 'opf');
    if (!opfPath) {
      console.log('No OPF file found');
      return stylesheets;
    }
    
    // Read the OPF file content
    const opfContent = await RNFS.readFile(opfPath, 'utf8');
    const basePath = opfPath.substring(0, opfPath.lastIndexOf('/'));
    
    // Extract manifest items
    const manifestItems: Record<string, {href: string, mediaType: string}> = {};
    const manifestRegex = /<manifest[^>]*>([\s\S]*?)<\/manifest>/;
    const manifestMatch = opfContent.match(manifestRegex);
    
    if (manifestMatch) {
      const manifestContent = manifestMatch[1];
      // We need to use multiple passes to handle different attribute ordering in item tags
      const items = manifestContent.match(/<item[^>]+>/g) || [];
      
      items.forEach(item => {
        const idMatch = item.match(/id="([^"]*)"/);
        const hrefMatch = item.match(/href="([^"]*)"/);
        const mediaTypeMatch = item.match(/media-type="([^"]*)"/);
        
        if (idMatch && hrefMatch) {
          const id = idMatch[1];
          const href = hrefMatch[1];
          const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : '';
          manifestItems[id] = { href, mediaType };
        }
      });
      
      // Find CSS files in the manifest
      for (const [id, item] of Object.entries(manifestItems)) {
        if (item.mediaType === 'text/css' || 
            item.href.toLowerCase().endsWith('.css')) {
          try {
            const cssPath = `${basePath}/${item.href}`;
            const content = await RNFS.readFile(cssPath, 'utf8');
            stylesheets.push({ path: cssPath, content });
            console.log('Found stylesheet in OPF:', item.href);
          } catch (error) {
            console.error(`Error reading CSS file ${item.href}:`, error);
          }
        }
      }
    }
    
    return stylesheets;
  } catch (error) {
    console.error('Error extracting stylesheets from OPF:', error);
    return stylesheets;
  }
}

/**
 * Recursively searches for the last element with the tag name "content"
 *
 * @param node - The DOM node to start searching from
 * @returns The last content element found, or null if none exists
 */
export function findLastContentTag(node: any): any | null {
  if (!node) {
    return null;
  }
  
  let lastContentNode = null;
  
  // Check if the current node is a content node
  if (node.nodeName === 'content') {
    lastContentNode = node;
  }
  
  // Recursively search child nodes in reverse order
  // This is optional, but can be more efficient in some cases
  if (node.childNodes && node.childNodes.length > 0) {
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
      const childNode = node.childNodes[i];
      const contentNodeInChild = findLastContentTag(childNode);
      
      // If content node found in children, remember it
      if (contentNodeInChild) {
        lastContentNode = contentNodeInChild;
        break; // We can break early since we're traversing in reverse
      }
    }
  }
  
  return lastContentNode;
}

/**
 * Finds the last node in a DOM-like structure by traversing the tree
 * This follows the pattern of going to the deepest level and rightmost node
 * 
 * @param node - The starting node to search from
 * @returns The last node in the tree
 */
function findLastNode(node: any): any {
  // Base case: If we have no node, return null
  if (!node) {
    return null;
  }
  
  if (node.childNodes && Object.keys(node.childNodes).length > 0) {
    // Get the numeric keys and find the highest index
    const childKeys = Object.keys(node.childNodes)
                          .filter(key => !isNaN(Number(key)))
                          .map(Number);
    
    if (childKeys.length > 0) {
      const lastChildIndex = Math.max(...childKeys);
      return findLastNode(node.childNodes[lastChildIndex]);
    }
  }
  
  if (node.lastChild) {
    return findLastNode(node.lastChild);
  }
  
  if (node.nextSibling) {
    return findLastNode(node.nextSibling);
  }
  
  return node;
}

function findNavMap(parsedXml: any): any {
  if (parsedXml.nodeName === 'navMap') {
    return parsedXml;
  }

  const childNodes = parsedXml.childNodes;
  if (childNodes) {
    for (let i = 0; i < childNodes.length; i++) {
      const foundNavMap = findNavMap(childNodes[i]);
      if (foundNavMap) {
        return foundNavMap;
      }
    }
  }

  return null;
}

/**
 * Extracts the language from an OPF file content.
 * 
 * @param opfContent - The content of the OPF file as a string
 * @returns The language code if found, otherwise null
 */
function extractLanguageFromOpf(opfContent: string): string | null {
  // Try to parse the XML content
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(opfContent, "text/xml");
    
    // First, try the standard dc:language tag
    const languageElements = xmlDoc.getElementsByTagName("dc:language");
    if (languageElements.length > 0) {
      return languageElements[0].textContent?.trim() || null;
    }
    
    // Try alternative: namespace-less language tag
    const plainLanguageElements = xmlDoc.getElementsByTagName("language");
    if (plainLanguageElements.length > 0) {
      return plainLanguageElements[0].textContent?.trim() || null;
    }
    
    // If we have metadata, try to find language within it using a more general approach
    const metadataElements = xmlDoc.getElementsByTagName("metadata");
    if (metadataElements.length > 0) {
      // Search through all children of metadata
      const metadata = metadataElements[0];
      for (let i = 0; i < metadata.childNodes.length; i++) {
        const node = metadata.childNodes[i];
        if (node.nodeType === 1) { // Element node
          const element = node as Element;
          if (element.localName?.toLowerCase() === "language") {
            return element.textContent?.trim() || null;
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error parsing OPF content:", error);
    
    // Fallback to regex approach if XML parsing fails
    const basicRegex = /<dc:language[^>]*>(.*?)<\/dc:language>/;
    const match = opfContent.match(basicRegex);
    
    return match ? match[1].trim() : null;
  }
}
