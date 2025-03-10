import RNFS from 'react-native-fs';
import { parseEpub } from '../../utils';
import TOCItem, { TOCSection } from '../../types/TOCItem';
import { BookMetadata, getBookMetadata, saveBookMetadata } from '../../BookMetadataStore';

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
 * Identifies if a section is the first chapter using the Tongues API
 */
export const identifyFirstChapter = async (sectionId: string, content: string): Promise<boolean> => {
  try {
    // Clean the content to get just text
    const cleanContent = content
      .replace(/<[^>]*>?/gm, ' ')  // Remove HTML tags
      .replace(/\s+/g, ' ')       // Normalize whitespace
      .trim();                    // Trim whitespace
      
    // Take just the first 1000 characters for analysis
    const sampleText = cleanContent.substring(0, 1000);
    
    // Prepare the prompt for analysis
    const prompt = `You are analyzing a section of an ebook to determine if it is the first chapter of the book. 
Based solely on the content provided, respond with "YES" if you believe this is the first chapter of the book, or "NO" if it appears to be something else (like a preface, introduction, table of contents, copyright page, etc.).

Here's the content:
${sampleText}

Is this the first chapter of the book? Respond with only YES or NO.`;

    // Make API call to the Tongues API endpoint
    const response = await fetch('https://tongues.directto.link/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt })
    });
    
    if (!response.ok) {
      console.error(`[EpubLoader] Error from Tongues API: ${response.status} ${response.statusText}`);
      return false;
    }
    
    const result = await response.json();
    const answer = result.answer.trim().toUpperCase();
    
    console.log(`[EpubLoader] API identified section ${sectionId} as first chapter: ${answer === 'YES'}`);
    return answer === 'YES';
    
  } catch (error) {
    console.error('[EpubLoader] Error identifying first chapter:', error);
    return false;
  }
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
): Promise<{ content: string; tableOfContents: TOCItem[]; sections: TOCSection[] }> => {
  console.log('[EpubLoader] Loading EPUB from:', fileUri);
  
  // Parse the epub file
  const tocItems = await parseEpub(fileUri);
  
  if (!tocItems || tocItems.length === 0) {
    throw new Error('No content found in this epub file');
  }
  
  console.log('[EpubLoader] Successfully parsed EPUB, found', tocItems.length, 'TOC items');
  
  // Create ID from the file path for metadata lookup
  const bookId = fileUri.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || '';
  
  // Get current book metadata if it exists
  let bookMetadata = await getBookMetadata(bookId);
  
  // Filter out cover page (typically the first item or items with "cover" in their label/href)
  const filteredTOC = tocItems.filter((item, index) => {
    const isCover = item.label.toLowerCase().includes('cover') || 
                    item.href.toLowerCase().includes('cover') ||
                    (index === 0 && item.label.toLowerCase().includes('title'));
    return !isCover;
  });
  
  // Read content from all files and create section objects
  console.log('[EpubLoader] Reading content from EPUB files');
  const sectionPromises = filteredTOC.map(async (item, index) => {
    try {
      const fileContent = await RNFS.readFile(item.path, 'utf8');
      // Generate a unique ID for the section based on index, filename, and a timestamp
      const sectionId = `section-${index}-${item.href.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;
      
      return {
        id: sectionId,
        title: item.label,
        content: fileContent,
        path: item.path,
        href: item.href
      } as TOCSection;
    } catch (error) {
      console.error(`[EpubLoader] Error reading file ${item.path}:`, error);
      // Even for error cases, provide a unique ID
      return {
        id: `section-error-${index}-${Date.now()}`,
        title: item.label,
        content: '',
        path: item.path,
        href: item.href
      } as TOCSection;
    }
  });
  
  const sections = await Promise.all(sectionPromises);
  
  // Filter out sections with empty content
  const validSections = sections.filter(section => section.content.trim().length > 0);
  
  // For backward compatibility, also create the full text content
  const fullText = validSections.map(section => section.content).join('\n\n');
  
  console.log('[EpubLoader] Successfully created', validSections.length, 'content sections');
  
  // Analyze sections to find first chapter if not already identified
  if (!bookMetadata?.firstChapterId) {
    console.log('[EpubLoader] Identifying first chapter with Anthropic Haiku...');
    
    // Loop through sections to find the first chapter
    for (const section of validSections) {
      // Skip sections with very little content
      if (section.content.length < 200) continue;
      
      const isFirstChapter = await identifyFirstChapter(section.id, section.content);
      
      if (isFirstChapter) {
        console.log(`[EpubLoader] Found first chapter: ${section.title} (ID: ${section.id})`);
        
        // Save this information to metadata
        if (bookMetadata) {
          // Update existing metadata
          bookMetadata.firstChapterId = section.id;
          await saveBookMetadata(bookMetadata);
        } else {
          // If for some reason we don't have metadata yet, just log this
          console.log('[EpubLoader] Book metadata not found, first chapter ID will not be saved');
        }
        
        break; // Stop after finding the first chapter
      }
    }
  } else {
    console.log(`[EpubLoader] First chapter already identified: ${bookMetadata.firstChapterId}`);
  }
  
  return {
    content: fullText,
    tableOfContents: filteredTOC,
    sections: validSections
  };
};