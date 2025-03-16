import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { DOMParser } from 'xmldom';
import { readTextFile } from '../utils';
import BookData from '../types/BookData';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { determineLanguage } from '../services/TranslationService';

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

    let navMapObj = null;
    const tocPath = await findFileWithExtension(unzipResult, 'ncx');
    
    if (tocPath) {
      const tocContents = await RNFS.readFile(tocPath, 'utf8');
      const parsedToc = new DOMParser().parseFromString(tocContents);
      navMapObj = findNavMap(parsedToc);
    }

    const lastContentNode = findLastContentTag(navMapObj);
    const lastContents = await readTextFile(unzipResult + '/' + lastContentNode.attributes[0].value)
    const determination = await determineLanguage(lastContents);

    return {
      language: determination.language,
      path: unzipResult,
      navMap: navMapObj,
      basePath: tocPath ? tocPath.substring(0, tocPath.lastIndexOf('/')) : unzipResult
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
