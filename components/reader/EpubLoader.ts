import RNFS from 'react-native-fs';
import { parseEpub } from '../../utils';
import TOCItem from '../../types/TOCItem';

/**
 * Extracts a sample of content for language detection
 */
export const extractContentSample = (text: string): string => {
  // Find a paragraph with a reasonable length
  const paragraphs = text.split(/\n+/);
  const validParagraphs = paragraphs.filter(p => p.trim().length > 100 && p.trim().length < 1000);
  
  if (validParagraphs.length > 0) {
    // Get a random paragraph
    const randomIndex = Math.floor(Math.random() * validParagraphs.length);
    return validParagraphs[randomIndex].trim();
  }
  
  // If no suitable paragraphs, take a section from the middle of the text
  if (text.length > 500) {
    const startPos = Math.floor(text.length / 2) - 250;
    return text.substring(startPos, startPos + 500);
  }
  
  // Just return what we have
  return text.trim();
};

/**
 * Detects the language of the provided text
 */
export const detectLanguage = async (text: string, supportedLanguages: string[]): Promise<string> => {
  const response = await fetch('https://tongues.directto.link/language', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  
  if (!response.ok) {
    throw new Error(`Language detection failed with status: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Check if returned language is in our supported list
  if (data.language && supportedLanguages.includes(data.language)) {
    return data.language;
  }
  
  // Default to French if not supported
  return 'French';
};

/**
 * Loads and processes an EPUB file
 */
export const loadEpubContent = async (
  fileUri: string
): Promise<{ content: string; tableOfContents: TOCItem[] }> => {
  console.log('[EpubLoader] Loading EPUB from:', fileUri);
  
  // Parse the epub file
  const tocItems = await parseEpub(fileUri);
  
  if (!tocItems || tocItems.length === 0) {
    throw new Error('No content found in this epub file');
  }
  
  console.log('[EpubLoader] Successfully parsed EPUB, found', tocItems.length, 'TOC items');
  
  // Filter out cover page (typically the first item or items with "cover" in their label/href)
  const filteredTOC = tocItems.filter((item, index) => {
    const isCover = item.label.toLowerCase().includes('cover') || 
                    item.href.toLowerCase().includes('cover') ||
                    (index === 0 && item.label.toLowerCase().includes('title'));
    return !isCover;
  });
  
  // Read content from all files
  console.log('[EpubLoader] Reading content from EPUB files');
  const allContentPromises = tocItems.map(async (item) => {
    try {
      const fileContent = await RNFS.readFile(item.path, 'utf8');
      return fileContent;
    } catch (error) {
      console.error(`[EpubLoader] Error reading file ${item.path}:`, error);
      return '';
    }
  });
  
  const allContents = await Promise.all(allContentPromises);
  const fullText = allContents.join('\n\n');
  
  console.log('[EpubLoader] Successfully read', allContents.length, 'content files');
  
  return {
    content: fullText,
    tableOfContents: filteredTOC
  };
};