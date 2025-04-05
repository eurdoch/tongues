import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { DOMParser } from 'xmldom';
import { readTextFile } from '../utils';
import BookData from '../types/BookData';
import StyleSheet from '../types/StyleSheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { determineLanguage } from '../services/TranslationService';
import { parseHtml } from './EpubContentParser';
import { ElementNode } from '../types/ElementNode';
import { NavPoint } from '../types/NavPoint';
import { isInSupportedLanguages } from '../types/Language';

export async function parseEpub(fileUri: string): Promise<BookData> {
  try {
    console.log('Starting to unzip epub file:', fileUri);
    const extractionPath = `${RNFS.CachesDirectoryPath}/epub_extract`;
    
    if (await RNFS.exists(extractionPath)) {
      await RNFS.unlink(extractionPath);
    }

    // TODO this should not be here, it is not part of parsing logic!
    await AsyncStorage.setItem("current_book", fileUri);
    console.log(`[Async Storage]: Saved current book: ${fileUri}`);

    await RNFS.mkdir(extractionPath);
    const unzipResult = await unzip(fileUri, extractionPath);
    console.log('Epub unzipped to:', unzipResult);

    // Find the OPF file which contains the spine and manifest
    const opfPath = await findFileWithExtension(unzipResult, 'opf');
    if (!opfPath) {
      throw new Error('No OPF file found in EPUB');
    }
    
    console.log('Found OPF file:', opfPath);
    const opfContent = await RNFS.readFile(opfPath, 'utf8');
    const opfBasePath = opfPath.substring(0, opfPath.lastIndexOf('/'));
    
    // Parse the OPF content to get the spine and manifest
    const parsedOpf = new DOMParser().parseFromString(opfContent);
    
    // Extract the manifest items (mapping ids to file paths)
    const manifestItems = new Map<string, string>();
    const manifest = findElement(parsedOpf, 'manifest');
    
    if (manifest) {
      for (let i = 0; i < manifest.childNodes.length; i++) {
        const item = manifest.childNodes[i];
        if (item.nodeName === 'item') {
          const id = item.getAttribute('id');
          const href = item.getAttribute('href');
          
          if (id && href) {
            manifestItems.set(id, href);
          }
        }
      }
    }
    
    console.log(`Extracted ${manifestItems.size} items from manifest`);
    
    // Extract the spine items (ordered content files)
    const spineItemRefs: string[] = [];
    const spine = findElement(parsedOpf, 'spine');
    
    if (spine) {
      for (let i = 0; i < spine.childNodes.length; i++) {
        const itemref = spine.childNodes[i];
        if (itemref.nodeName === 'itemref') {
          const idref = itemref.getAttribute('idref');
          if (idref) {
            spineItemRefs.push(idref);
          }
        }
      }
    }
    
    console.log(`Extracted ${spineItemRefs.length} items from spine`);
    
    // Parse content files based on spine order
    console.log('Parsing content files from spine...');
    const allContentElements = [];
    const processedPaths = new Set<string>();
    
    // Process each content file from the spine
    for (const idref of spineItemRefs) {
      try {
        const href = manifestItems.get(idref);
        if (!href) {
          console.log(`Skipping spine item ${idref}: no matching href in manifest`);
          continue;
        }
        
        // Resolve the full path to the content file
        const fullPath = `${opfBasePath}/${href}`;
        
        // Skip if we've already processed this path
        if (processedPaths.has(fullPath)) {
          console.log(`Skipping duplicate spine content file: ${fullPath}`);
          continue;
        }
        
        console.log(`Processing spine content file: ${fullPath}`);
        processedPaths.add(fullPath);
        
        const fileContent = await readTextFile(fullPath);
        const parsedContent = parseHtml(fileContent);
        
        // Get the directory of the current content file for resolving relative paths
        const contentFileDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        
        // Process image tags in this content file to convert relative paths to absolute
        processImagePaths(parsedContent, contentFileDir);
        
        // Set navId to null for all elements to ensure the field exists
        // This can be used later when TOC implementation is added back
        parsedContent.forEach(element => {
          element.navId = null;
        });
        
        allContentElements.push(...parsedContent);
      } catch (parseError) {
        console.error(`Error parsing spine content file for ${idref}:`, parseError);
        // Continue with other files even if one fails
      }
    }

    console.log('DEBUG allContentElements: ', JSON.stringify(allContentElements));
    
    // TODO temp remove
    // Find and extract all stylesheets
    //console.log('Finding stylesheets...');
    //// Get stylesheets from two sources and merge them
    //const [fileStylesheets, opfStylesheets] = await Promise.all([
    //  findAllStylesheets(unzipResult),
    //  findOpfStylesheets(unzipResult)
    //]);
    //
    //// Combine both stylesheet sources, removing duplicates by path
    //const allStyleSheets = [...fileStylesheets];
    //for (const sheet of opfStylesheets) {
    //  if (!allStyleSheets.some(s => s.path === sheet.path)) {
    //    allStyleSheets.push(sheet);
    //  }
    //}
    const allStyleSheets: any[] = [];
    
    console.log(`Found ${allStyleSheets.length} stylesheets in total`);
    
    // Determine the book language
    // First try to get it from the OPF metadata
    let language = null;
    try {
      language = extractLanguageFromOpf(opfContent);
      if (language) {
        if (isInSupportedLanguages(language)) {
          console.log(`Language from OPF metadata: ${language}`);
        } else {
          language = null;
        }
      }
    } catch (langError) {
      console.error('Error extracting language from OPF:', langError);
    }
    
    // If language not found in OPF, analyze content
    if (!language) {
      let contentToAnalyze = '';
      
      // Use the content elements if we have any
      if (allContentElements.length > 0) {
        // Extract text content from the parsed elements (just enough for language detection)
        contentToAnalyze = extractTextExcerpt(allContentElements, 500);
      } else {
        // Fallback: find any content file to analyze
        const contentFiles = await findAllContentFiles(unzipResult);
        if (contentFiles.length > 0) {
          const lastContentFile = contentFiles[contentFiles.length-1];
          const fullContent = await readTextFile(lastContentFile);
          // Extract a reasonable excerpt (first 500 chars is usually enough for language detection)
          contentToAnalyze = fullContent.slice(0, 500);
        }
      }
      
      console.log(`Using ${contentToAnalyze.length} characters for language detection`);
      const determination = await determineLanguage(contentToAnalyze);
      language = determination.language;
    }

    // For backward compatibility, set navMap to null (we'll implement TOC generation later)
    const navMapObj = null;
    const tableOfContents: NavPoint[] = [];

    return {
      language: language,
      path: unzipResult,
      navMap: navMapObj, // Keep for backward compatibility
      basePath: opfBasePath,
      content: allContentElements, // Add the parsed content to the BookData
      styleSheets: allStyleSheets, // Add the parsed stylesheets to the BookData
      tableOfContents // Empty for now, will be implemented later
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
/**
 * Processes a collection of element nodes to convert relative image paths to absolute paths
 * 
 * @param elements - Array of ElementNode objects to process
 * @param basePath - The base directory path to resolve relative image paths against
 */
function processImagePaths(elements: ElementNode[], basePath: string): void {
  // Function to recursively process an element and its children
  function processElement(element: ElementNode): void {
    // Check if this is an image element with a src attribute
    if (element.type === 'img' && element.props?.src) {
      const src = element.props.src;
      
      // Only process if it's a relative path and not already absolute or external
      if (!src.startsWith('http') && !src.startsWith('file://') && !src.startsWith('/')) {
        // Resolve the relative path against the base path
        element.props.src = `${basePath}/${src}`;
        console.log(`Converted image path from ${src} to ${element.props.src}`);
      }
    }
    
    // Process children recursively
    if (element.children && element.children.length > 0) {
      for (const child of element.children) {
        if (typeof child !== 'string') {
          processElement(child);
        }
      }
    }
  }
  
  // Process each top-level element
  for (const element of elements) {
    processElement(element);
  }
}

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

/**
 * Recursively finds an element with the given name in an XML document
 * 
 * @param node - The node to start searching from
 * @param elementName - The name of the element to search for
 * @returns The found element, or null if not found
 */
function findElement(node: any, elementName: string): any {
  if (node.nodeName === elementName) {
    return node;
  }

  const childNodes = node.childNodes;
  if (childNodes) {
    for (let i = 0; i < childNodes.length; i++) {
      const foundElement = findElement(childNodes[i], elementName);
      if (foundElement) {
        return foundElement;
      }
    }
  }

  return null;
}

/**
 * Finds the navMap element in an XML document (kept for backward compatibility)
 * 
 * @param parsedXml - The XML document to search in
 * @returns The navMap element, or null if not found
 */
function findNavMap(parsedXml: any): any {
  return findElement(parsedXml, 'navMap');
}

/**
 * Extracts a limited excerpt of text from an array of ElementNode objects
 * Stops collecting text once the character limit is reached
 * 
 * @param elements - Array of ElementNode objects
 * @param charLimit - Maximum number of characters to extract
 * @returns Limited excerpt of text content
 */
function extractTextExcerpt(elements: ElementNode[], charLimit: number): string {
  let text = '';
  let charsCollected = 0;
  let done = false;
  
  function extractFromElement(element: ElementNode): void {
    if (done) return;
    
    // If element has children, extract from them
    if (element.children && element.children.length > 0) {
      for (const child of element.children) {
        if (done) return;
        
        if (typeof child === 'string') {
          // Add text content but respect the character limit
          const remainingChars = charLimit - charsCollected;
          if (remainingChars <= 0) {
            done = true;
            return;
          }
          
          const textToAdd = child.slice(0, remainingChars);
          text += textToAdd + ' ';
          charsCollected += textToAdd.length + 1; // +1 for the space
          
          if (charsCollected >= charLimit) {
            done = true;
            return;
          }
        } else {
          // Recursively extract from child elements
          extractFromElement(child);
        }
      }
    }
  }
  
  // Extract text from elements until we hit the character limit
  for (const element of elements) {
    if (done) break;
    extractFromElement(element);
  }
  
  return text.trim();
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
