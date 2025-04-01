import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import * as ZipArchive from 'react-native-zip-archive';
import TOCItem from './types/TOCItem';
import { NavPoint } from './types/NavPoint';
import StyleSheet from './types/StyleSheet';

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

/**
 * Find a file by name recursively in a directory
 */
const findFileByName = async (directoryPath: string, fileName: string, maxDepth = 3): Promise<string | null> => {
    try {
        if (maxDepth <= 0) return null;
        
        const items = await RNFS.readDir(directoryPath);
        
        // Check for the file in the current directory
        for (const item of items) {
            if (!item.isDirectory() && item.name === fileName) {
                console.log(`Found file ${fileName} at ${item.path}`);
                return item.path;
            }
        }
        
        // If not found, search in subdirectories
        for (const item of items) {
            if (item.isDirectory()) {
                const filePath = await findFileByName(item.path, fileName, maxDepth - 1);
                if (filePath) {
                    return filePath;
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error(`Error searching for file ${fileName}:`, error);
        return null;
    }
};

export const extractEpubMetadata = async (epubUri: string): Promise<{ title: string | null, coverUri: string | null }> => {
    let tempDir = '';
    try {
        console.log('Extracting metadata from EPUB:', epubUri);
        
        // Normalize file URI
        let normalizedUri = epubUri;
        
        // For Android, ensure path has proper format
        if (Platform.OS === 'android') {
            if (!epubUri.startsWith('file://') && epubUri.indexOf('://') === -1) {
                normalizedUri = `file://${epubUri}`;
                console.log('Normalized URI with file:// prefix:', normalizedUri);
            }
            
            // Handle URL encoded paths
            if (epubUri.includes('%')) {
                try {
                    const decodedUri = decodeURIComponent(epubUri);
                    if (decodedUri !== epubUri) {
                        console.log('Using decoded URI:', decodedUri);
                        normalizedUri = decodedUri;
                        
                        // Add file:// prefix if needed
                        if (!normalizedUri.startsWith('file://') && normalizedUri.indexOf('://') === -1) {
                            normalizedUri = `file://${normalizedUri}`;
                        }
                    }
                } catch (decodeError) {
                    console.error('Error decoding URI:', decodeError);
                }
            }
        }
        
        // Verify file exists before attempting to extract
        try {
            const fileExists = await RNFS.exists(normalizedUri);
            if (!fileExists) {
                // Try without file:// prefix as a fallback
                if (normalizedUri.startsWith('file://')) {
                    const withoutPrefix = normalizedUri.substring(7);
                    const existsWithoutPrefix = await RNFS.exists(withoutPrefix);
                    if (existsWithoutPrefix) {
                        console.log('File exists without file:// prefix, using:', withoutPrefix);
                        normalizedUri = withoutPrefix;
                    } else {
                        console.error('File does not exist at path:', normalizedUri);
                        return { title: null, coverUri: null };
                    }
                } else {
                    console.error('File does not exist at path:', normalizedUri);
                    return { title: null, coverUri: null };
                }
            }
        } catch (existsError) {
            console.error('Error checking if file exists:', existsError);
            // Continue anyway, the ZipArchive might handle it differently
        }
        
        // Create a unique temp directory for extraction
        const timestamp = Date.now();
        tempDir = `${RNFS.CachesDirectoryPath}/temp_extract_${timestamp}`;
        await RNFS.mkdir(tempDir);
        console.log('Created temp directory for extraction:', tempDir);

        // Extract the EPUB
        console.log('Unzipping EPUB file to temp directory');
        let extractedPath;
        try {
            extractedPath = await ZipArchive.unzip(normalizedUri, tempDir);
            console.log('Successfully unzipped to:', extractedPath);
        } catch (unzipError) {
            console.error('Error unzipping file:', unzipError);
            // Try one more time with/without the file:// prefix
            try {
                if (normalizedUri.startsWith('file://')) {
                    const withoutPrefix = normalizedUri.substring(7);
                    console.log('Retrying unzip without file:// prefix:', withoutPrefix);
                    extractedPath = await ZipArchive.unzip(withoutPrefix, tempDir);
                } else {
                    console.log('Retrying unzip with file:// prefix:', `file://${normalizedUri}`);
                    extractedPath = await ZipArchive.unzip(`file://${normalizedUri}`, tempDir);
                }
                console.log('Retry unzip succeeded to:', extractedPath);
            } catch (retryError) {
                console.error('Retry unzip also failed:', retryError);
                await RNFS.unlink(tempDir).catch(e => console.log('Error removing temp dir:', e));
                return { title: null, coverUri: null };
            }
        }

        // Find the OPF file
        console.log('Looking for OPF file in:', extractedPath);
        const opfPath = await findOpfFile(extractedPath);
        if (!opfPath) {
            console.log('No OPF file found in extracted EPUB');
            await RNFS.unlink(tempDir).catch(e => console.log('Error removing temp dir:', e));
            return { title: null, coverUri: null };
        }
        console.log('Found OPF file at:', opfPath);

        // Read the OPF file to find metadata and cover image
        const opfContent = await RNFS.readFile(opfPath, 'utf8');
        console.log('Successfully read OPF file content');
        
        // Extract title from metadata
        let title: string | null = null;
        const titlePattern = /<dc:title[^>]*>(.*?)<\/dc:title>/i;
        const titleMatch = opfContent.match(titlePattern);
        
        if (titleMatch) {
            title = titleMatch[1].trim();
            console.log('Extracted title from metadata:', title);
        } else {
            console.log('No title found in metadata');
        }
        
        // Look for cover image in manifest
        const coverPattern = /<item[^>]*id="cover-image"[^>]*href="([^"]*)"[^>]*>/i;
        let match = opfContent.match(coverPattern);
        
        if (!match) {
            // Try alternative patterns for cover image
            const altPatterns = [
                /<item[^>]*id="cover"[^>]*href="([^"]*)"[^>]*>/i,
                /<item[^>]*href="([^"]*)"[^>]*media-type="image\/[^"]*"[^>]*>/i
            ];
            
            for (const pattern of altPatterns) {
                match = opfContent.match(pattern);
                if (match) break;
            }
        }
        
        let coverUri: string | null = null;
        
        if (match) {
            try {
                const coverPath = match[1];
                console.log('Found cover image path in OPF:', coverPath);
                
                // Handle paths with special characters or URL encoding
                const decodedCoverPath = decodeURIComponent(coverPath);
                console.log('Decoded cover path:', decodedCoverPath);
                
                const basePath = opfPath.substring(0, opfPath.lastIndexOf('/'));
                console.log('Base path:', basePath);
                
                // Normalize path separators and handle relative paths
                let normalizedPath = decodedCoverPath;
                
                // Remove any leading "./" from the path
                if (normalizedPath.startsWith('./')) {
                    normalizedPath = normalizedPath.substring(2);
                }
                
                // Extract the cover filename
                const coverFilename = normalizedPath.split('/').pop() || '';
                console.log('Cover filename:', coverFilename);
                
                // List of possible cover paths to try
                const potentialPaths = [];
                
                // 1. Handle parent directory references (../path)
                if (normalizedPath.includes('../')) {
                    const basePathParts = basePath.split('/');
                    const coverPathParts = normalizedPath.split('/');
                    let resultParts = [...basePathParts];
                    
                    for (const part of coverPathParts) {
                        if (part === '..') {
                            resultParts.pop(); // Go up one directory
                        } else if (part !== '.') {
                            resultParts.push(part);
                        }
                    }
                    
                    const resolvedPath = resultParts.join('/');
                    console.log('Potential cover path (resolved relative):', resolvedPath);
                    potentialPaths.push(resolvedPath);
                } 
                
                // 2. Regular path without parent directory references
                const directPath = `${basePath}/${normalizedPath}`;
                console.log('Potential cover path (direct):', directPath);
                potentialPaths.push(directPath);
                
                // 3. Try with OEBPS prefix (common in EPUBs)
                if (!directPath.includes('/OEBPS/') && !normalizedPath.startsWith('/')) {
                    const oebpsPath = `${extractedPath}/OEBPS/${normalizedPath}`;
                    console.log('Potential cover path (OEBPS):', oebpsPath);
                    potentialPaths.push(oebpsPath);
                }
                
                // 4. Try looking in common image directories
                const commonImageDirs = ['Images', 'images', 'Image', 'image', 'IMAGES', 'img', 'IMG'];
                for (const imgDir of commonImageDirs) {
                    if (coverFilename && !normalizedPath.includes(`/${imgDir}/`)) {
                        const imgDirPath = `${extractedPath}/${imgDir}/${coverFilename}`;
                        console.log(`Potential cover path (${imgDir}):`, imgDirPath);
                        potentialPaths.push(imgDirPath);
                        
                        // Also try with OEBPS
                        const oebpsImgPath = `${extractedPath}/OEBPS/${imgDir}/${coverFilename}`;
                        console.log(`Potential cover path (OEBPS/${imgDir}):`, oebpsImgPath);
                        potentialPaths.push(oebpsImgPath);
                    }
                }
                
                // Try all potential paths
                let coverFound = false;
                let foundCoverPath = '';
                
                for (const path of potentialPaths) {
                    try {
                        console.log('Checking if cover exists at:', path);
                        const exists = await RNFS.exists(path);
                        if (exists) {
                            console.log('Cover file found at:', path);
                            foundCoverPath = path;
                            coverFound = true;
                            break;
                        }
                    } catch (error) {
                        console.warn(`Error checking path ${path}:`, error);
                        // Continue to next path
                    }
                }
                
                // If no cover found by direct paths, try a file search
                if (!coverFound && coverFilename) {
                    try {
                        console.log('No cover found in expected locations, searching by filename:', coverFilename);
                        const foundFile = await findFileByName(extractedPath, coverFilename);
                        if (foundFile) {
                            console.log('Found cover file by name search:', foundFile);
                            foundCoverPath = foundFile;
                            coverFound = true;
                        }
                    } catch (searchError) {
                        console.error('Error searching for cover file by name:', searchError);
                    }
                    
                    // Try searching for any image that might be a cover
                    if (!coverFound) {
                        try {
                            console.log('Searching for any cover image file');
                            // Common cover image names
                            const coverNames = ['cover.jpg', 'cover.jpeg', 'cover.png', 
                                              'Cover.jpg', 'Cover.jpeg', 'Cover.png',
                                              'COVER.jpg', 'COVER.jpeg', 'COVER.png'];
                            
                            for (const name of coverNames) {
                                const coverByName = await findFileByName(extractedPath, name);
                                if (coverByName) {
                                    console.log('Found cover image by common name:', coverByName);
                                    foundCoverPath = coverByName;
                                    coverFound = true;
                                    break;
                                }
                            }
                        } catch (genericSearchError) {
                            console.error('Error in generic cover search:', genericSearchError);
                        }
                    }
                }
                
                // If a cover was found, cache it
                if (coverFound && foundCoverPath) {
                    try {
                        // Create a stable book ID from the EPUB path
                        const bookId = epubUri.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'unknown';
                        
                        // Determine file extension from the found path
                        const pathParts = foundCoverPath.split('.');
                        const coverExt = pathParts.length > 1 ? pathParts.pop() || 'jpg' : 'jpg';
                        
                        // Create a cached copy of the cover image with a stable filename
                        const cachedCoverPath = `${RNFS.CachesDirectoryPath}/book_cover_${bookId}.${coverExt}`;
                        console.log('Copying cover to cache with stable ID:', cachedCoverPath);
                        
                        await RNFS.copyFile(foundCoverPath, cachedCoverPath);
                        coverUri = cachedCoverPath;
                        console.log('Successfully cached cover image at:', cachedCoverPath);
                    } catch (cacheError) {
                        console.error('Error caching cover image:', cacheError);
                    }
                } else {
                    console.warn('No cover image found after trying all potential paths');
                }
            } catch (coverError) {
                console.error('Error processing cover image:', coverError);
            }
        } else {
            console.log('No cover image found in OPF file');
        }
        
        // Clean up temp extraction directory
        console.log('Cleaning up temp directory:', tempDir);
        await RNFS.unlink(tempDir).catch(e => console.log('Error removing temp dir:', e));
        
        return { title, coverUri };
    } catch (error) {
        console.error("Error extracting metadata:", error);
        // Clean up temp directory if it exists
        if (tempDir) {
            await RNFS.unlink(tempDir).catch(e => console.log('Error removing temp dir:', e));
        }
        return { title: null, coverUri: null };
    }
};

/**
 * Reads a text file in UTF-8 encoding from the provided URI
 * 
 * @param fileUri - The URI of the file to read
 * @returns Promise that resolves with the file contents as a string
 * @throws Error if file reading fails
 */
export const readTextFile = async (fileUri: string): Promise<string> => {
  try {
    // Check if the file exists before attempting to read it
    const fileExists = await RNFS.exists(fileUri);
    
    if (!fileExists) {
      throw new Error(`File not found: ${fileUri}`);
    }
    
    // Read the file with UTF-8 encoding
    const fileContents = await RNFS.readFile(fileUri, 'utf8');
    
    return fileContents;
  } catch (error: any) {
    // Re-throw with a more descriptive message
    throw new Error(`Failed to read file at ${fileUri}: ${error.message}`);
  }
};

/**
 * Recursively searches for the first element with the tag name "content"
 * or the first navigable element with an "src" attribute if no content tag is found
 * 
 * @param node - The DOM node to start searching from
 * @returns The first content element found, or null if none exists
 */
export function findFirstContentTag(node: any): any | null {
  // Return null if node doesn't exist
  if (!node) {
    console.log("[findFirstContentTag] No node provided");
    return null;
  }
  
  // Check if this node is a content tag
  if (node.nodeName === 'content') {
    console.log("[findFirstContentTag] Found content tag");
    return node;
  }
  
  // If not a content tag but has src attribute, it might be usable
  if (node.getAttribute && node.getAttribute('src')) {
    console.log("[findFirstContentTag] Found node with src attribute:", node.nodeName);
    return node;
  }
  
  // If node has no children, return null
  if (!node.childNodes || node.childNodes.length === 0) {
    return null;
  }
  
  // Track any potential fallback nodes (with src attribute but not content tag)
  let fallbackNode = null;
  
  // Recursively search child nodes
  for (let i = 0; i < node.childNodes.length; i++) {
    const childNode = node.childNodes[i];
    
    // Skip text nodes and empty nodes
    if (!childNode || childNode.nodeType === 3) {
      continue;
    }
    
    // Check if this child has an src attribute (potential fallback)
    if (!fallbackNode && childNode.getAttribute && childNode.getAttribute('src')) {
      fallbackNode = childNode;
    }
    
    // Search this child for a content tag
    const contentNode = findFirstContentTag(childNode);
    
    // If content node found in children, return it
    if (contentNode) {
      return contentNode;
    }
  }
  
  // If no content tag found but we have a fallback node with src attribute, use it
  if (fallbackNode) {
    console.log("[findFirstContentTag] Using fallback node with src attribute:", fallbackNode.nodeName);
    return fallbackNode;
  }
  
  // No content tag found in this branch
  return null;
}

/**
 * Helper function to get the src attribute from the first content tag
 * 
 * @param node - The DOM node to start searching from
 * @returns The src attribute value of the first content tag, or null if not found
 */
export function getFirstContentSrc(node: any): string | null {
  if (!node) {
    console.error("[getFirstContentSrc] No node provided");
    return null;
  }

  try {
    const contentTag = findFirstContentTag(node);
    
    if (!contentTag) {
      console.error("[getFirstContentSrc] No content tag found");
      return null;
    }
    
    if (!contentTag.getAttribute) {
      console.error("[getFirstContentSrc] Content tag doesn't have getAttribute method");
      return null;
    }
    
    const src = contentTag.getAttribute('src');
    if (!src) {
      console.error("[getFirstContentSrc] Content tag has no src attribute");
      return null;
    }
    
    return src;
  } catch (error) {
    console.error("[getFirstContentSrc] Error getting src attribute:", error);
    return null;
  }
}

export const copyFileToAppStorage = async (sourceUri: string): Promise<string | null> => {
  try {
    console.log("Original source URI:", sourceUri);
    
    // Check if file already exists in app storage
    const existingFilePath = await checkIfFileExists(sourceUri);
    if (existingFilePath) {
      console.log("File already exists in app storage, using existing file");
      return existingFilePath;
    }
    
    // Generate a unique target filename with timestamp to avoid conflicts
    const timestamp = Date.now();
    
    // Try to extract original filename from URI if possible
    let fileName;
    
    if (sourceUri.includes('/')) {
      fileName = sourceUri.substring(sourceUri.lastIndexOf('/') + 1);
      // For URIs with query parameters, keep only the filename part
      if (fileName.includes('?')) {
        fileName = fileName.substring(0, fileName.indexOf('?'));
      }
      
      // Handle encoded characters in filename
      try {
        const decodedFileName = decodeURIComponent(fileName);
        if (decodedFileName !== fileName) {
          console.log(`Decoded filename from ${fileName} to ${decodedFileName}`);
          fileName = decodedFileName;
        }
      } catch (decodeError) {
        console.log("Error decoding filename:", decodeError);
        // Continue with the original filename
      }
      
      // Remove any strange characters from the filename
      fileName = fileName.replace(/[^\w\d.-]/g, '_');
    } else {
      // If we can't extract a reasonable filename, create one with the timestamp
      fileName = `book_${timestamp}.epub`;
    }
    
    // Don't add any random suffixes or timestamps to the filename
    // This helps prevent duplicates when the same file is selected multiple times
    const targetFileName = fileName.toLowerCase().endsWith('.epub') 
      ? fileName 
      : `${fileName}.epub`;
    
    // Create destination path in app's document directory
    const destPath = `${RNFS.DocumentDirectoryPath}/${targetFileName}`;
    
    console.log(`Attempting to copy EPUB from ${sourceUri} to ${destPath}`);
    
    // Try different methods to copy the file based on the URI type
    if (Platform.OS === 'android' && (sourceUri.startsWith('content://') || 
        sourceUri.startsWith('document:') || sourceUri.includes('document%3A'))) {
      
      try {
        console.log("Using readFile/writeFile method for content:// or document:// URI");
        
        // Read the file content using the original URI
        const base64Data = await RNFS.readFile(sourceUri, 'base64');
        // Write it to the destination
        await RNFS.writeFile(destPath, base64Data, 'base64');
        
        console.log('Successfully copied file to app storage using read/write method');
        return destPath;
      } catch (readWriteError) {
        console.error('Error using readFile/writeFile method:', readWriteError);
        
        // If read/write fails, try direct copyFile
        try {
          console.log("Trying direct copyFile as fallback");
          await RNFS.copyFile(sourceUri, destPath);
          console.log('Successfully copied file to app storage using direct copyFile');
          return destPath;
        } catch (copyError) {
          console.error('Error using direct copyFile:', copyError);
          return null;
        }
      }
    } else {
      // For regular file:// URIs, use copyFile
      try {
        await RNFS.copyFile(sourceUri, destPath);
        console.log('Successfully copied file to app storage');
        return destPath;
      } catch (copyError) {
        console.error('Error copying file:', copyError);
        return null;
      }
    }
  } catch (error) {
    console.error('Error in copyFileToAppStorage:', error);
    return null;
  }
};

// Function to check if a file exists in the documents directory 
export const checkIfFileExists = async (sourceUri: string): Promise<string | null> => {
  try {
    console.log("Checking if file already exists locally");
    // List all files in DocumentDirectoryPath
    const files = await RNFS.readDir(RNFS.DocumentDirectoryPath);
    const epubFiles = files.filter(file => file.name.toLowerCase().endsWith('.epub'));
    
    // If there's no source URI or no local files, return null
    if (!sourceUri || epubFiles.length === 0) {
      console.log("No existing files found or no source URI provided");
      return null;
    }
    
    // For content:// or document:// URIs, we need to compare by content hash
    if (Platform.OS === 'android' && (sourceUri.startsWith('content://') || 
        sourceUri.startsWith('document:') || sourceUri.includes('document%3A'))) {
      
      try {
        const sourceContent = await RNFS.readFile(sourceUri, 'base64');
        console.log(`Read source file sample: ${sourceContent.substring(0, 20)}...`);
        
        // Check each epub file by reading the same byte range
        for (const file of epubFiles) {
          try {
            const localContent = await RNFS.readFile(file.path, 'base64');
            if (sourceContent === localContent) {
              console.log(`Found matching file content: ${file.path}`);
              return file.path;
            }
          } catch (localReadError) {
            console.log(`Error reading local file ${file.name}:`, localReadError);
            // Continue to next file
          }
        }
      } catch (sourceReadError) {
        console.log('Error reading source file for comparison:', sourceReadError);
        // Fall through to metadata comparison
      }
      
      // If content comparison fails, we can't reliably determine if it's a duplicate
      console.log("Content comparison did not find a match");
      return null;
    } else {
      // For regular URIs, extract the filename and check if we already have it
      let originalFileName = '';
      if (sourceUri.includes('/')) {
        originalFileName = sourceUri.substring(sourceUri.lastIndexOf('/') + 1);
        // Remove query parameters if present
        if (originalFileName.includes('?')) {
          originalFileName = originalFileName.substring(0, originalFileName.indexOf('?'));
        }
        originalFileName = originalFileName.toLowerCase();
      }
      
      // Look for files with similar names (without considering unique suffixes)
      for (const file of epubFiles) {
        // Clean up the local filename for comparison
        const localFileName = file.name.toLowerCase();
        
        if (originalFileName && localFileName.includes(originalFileName.replace(/\.epub$/, ''))) {
          console.log(`Found file with similar name: ${file.path}`);
          return file.path;
        }
      }
    }
    
    console.log("No existing matching file found");
    return null;
  } catch (error) {
    console.error('Error checking if file exists:', error);
    return null;
  }
};
