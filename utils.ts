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
    console.log('Extracting EPUB from URI:', fileUri);
    
    // For content:// URIs or document URIs on Android, we need to copy the file to app's cache directory first
    let sourcePath = fileUri;
    
    if (Platform.OS === 'android') {
      // Check if it's a content:// URI or a document:// URI
      if (fileUri.startsWith('content://') || fileUri.startsWith('document:') || fileUri.includes('document%3A')) {
        // Create a temporary file path in cache directory
        const tempFilePath = `${RNFS.CachesDirectoryPath}/temp_epub_${Date.now()}.epub`;
        console.log('Copying URI to temp file:', tempFilePath);
        
        try {
          // Handle URL encoded paths
          const decodedUri = decodeURIComponent(fileUri);
          console.log('Decoded URI:', decodedUri);
          
          // Special handling for document: URIs
          if (decodedUri.startsWith('document:') || fileUri.includes('document%3A')) {
            console.log('Handling document: URI scheme');
            
            try {
              // Use RNFS.readFile with base64 encoding and then write the file
              const base64Data = await RNFS.readFile(decodedUri, 'base64');
              await RNFS.writeFile(tempFilePath, base64Data, 'base64');
              console.log('Successfully copied document: URI using read/write approach');
              sourcePath = tempFilePath;
            } catch (documentReadError) {
              console.error('Error reading from document: URI:', documentReadError);
              
              // If that fails, try using copyFile with content:// conversion
              try {
                // Some document: URIs can be accessed through content:// 
                const contentUri = decodedUri.replace('document:', 'content://');
                await RNFS.copyFile(contentUri, tempFilePath);
                console.log('Successfully copied using content:// conversion');
                sourcePath = tempFilePath;
              } catch (contentConversionError) {
                console.error('Error copying with content:// conversion:', contentConversionError);
                // Fall through to other methods
              }
            }
          }
          
          // If still not copied, try standard approaches
          if (sourcePath === fileUri) {
            // Try to get file stats to verify it exists and is accessible
            try {
              const stats = await RNFS.stat(decodedUri);
              console.log('File stats:', stats);
            } catch (statError) {
              console.error('Error getting file stats:', statError);
            }
            
            // Copy the file from content/document URI to the temp path
            // First try with decoded URI
            try {
              await RNFS.copyFile(decodedUri, tempFilePath);
              console.log('Successfully copied file using decoded URI to:', tempFilePath);
              sourcePath = tempFilePath;
            } catch (decodedCopyError) {
              console.error('Error copying using decoded URI:', decodedCopyError);
              
              // If that fails, try with original URI
              try {
                await RNFS.copyFile(fileUri, tempFilePath);
                console.log('Successfully copied file using original URI to:', tempFilePath);
                sourcePath = tempFilePath;
              } catch (originalCopyError) {
                console.error('Error copying using original URI:', originalCopyError);
                
                // Check if the problem is related to a file:// prefix
                if (!fileUri.startsWith('file://') && !decodedUri.startsWith('file://')) {
                  try {
                    const fileUriWithPrefix = `file://${decodedUri}`;
                    await RNFS.copyFile(fileUriWithPrefix, tempFilePath);
                    console.log('Successfully copied file using file:// prefix to:', tempFilePath);
                    sourcePath = tempFilePath;
                  } catch (prefixCopyError) {
                    console.error('Error copying with file:// prefix:', prefixCopyError);
                    // Fall back to direct usage if all copy attempts fail
                    sourcePath = fileUri;
                  }
                } else {
                  // Fall back to direct usage if copy fails
                  sourcePath = fileUri;
                }
              }
            }
          }
        } catch (copyError) {
          console.error('All copy attempts failed:', copyError);
          // Fall back to direct usage if copy fails
          sourcePath = fileUri;
        }
      } else if (!fileUri.startsWith('file://') && fileUri.toLowerCase().endsWith('.epub')) {
        // Add file:// prefix for regular file paths if missing
        // React Native file operations need absolute file:// paths on Android
        console.log('Adding file:// prefix to path');
        sourcePath = `file://${fileUri}`;
      }
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
    
    console.log('Final source path for unzipping:', sourcePath);
    
    // Subscribe to unzipping progress (optional)
    const subscription = ZipArchive.subscribe(({ progress, filePath }) => {
      console.log(`Unzipping progress: ${progress}%`);
    });
    
    try {
      // Unzip the file
      const extractedPath = await ZipArchive.unzip(sourcePath, destinationPath);
      
      // Unsubscribe from progress updates
      subscription.remove();
      
      console.log('EPUB extracted to:', extractedPath);
      return extractedPath;
    } catch (unzipError) {
      console.error('Error during unzipping:', unzipError);
      
      // If direct unzipping fails, try one more approach for Android
      if (Platform.OS === 'android' && !sourcePath.startsWith('file://') && 
          typeof sourcePath === 'string' && sourcePath.length > 0) {
        try {
          console.log('Trying unzipping with file:// prefix as fallback');
          const extractedPath = await ZipArchive.unzip(`file://${sourcePath}`, destinationPath);
          console.log('Fallback unzip succeeded to:', extractedPath);
          return extractedPath;
        } catch (fallbackError) {
          console.error('Fallback unzip also failed:', fallbackError);
          throw fallbackError;
        }
      } else {
        throw unzipError;
      }
    }
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
                
                // Normalize path separators and handle relative paths
                let normalizedPath = decodedCoverPath;
                
                // Remove any leading "./" from the path
                if (normalizedPath.startsWith('./')) {
                    normalizedPath = normalizedPath.substring(2);
                }
                
                // Handle parent directory references (../path)
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
                    
                    const fullCoverPath = resultParts.join('/');
                    console.log('Full cover image path (resolved relative):', fullCoverPath);
                    
                    // Check if cover file exists
                    try {
                        const coverExists = await RNFS.exists(fullCoverPath);
                        if (!coverExists) {
                            console.error('Cover file does not exist at resolved path:', fullCoverPath);
                        } else {
                            // Create a stable book ID from the EPUB path
                            const bookId = epubUri.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'unknown';
                            // Create a cached copy of the cover image with a stable filename
                            const coverExt = decodedCoverPath.split('.').pop() || 'jpg';
                            const cachedCoverPath = `${RNFS.CachesDirectoryPath}/book_cover_${bookId}.${coverExt}`;
                            console.log('Copying cover to cache with stable ID:', cachedCoverPath);
                            await RNFS.copyFile(fullCoverPath, cachedCoverPath);
                            coverUri = cachedCoverPath;
                            console.log('Successfully cached cover image at:', cachedCoverPath);
                        }
                    } catch (existsError) {
                        console.error('Error checking cover file existence:', existsError);
                    }
                } else {
                    // Regular path without parent directory references
                    const fullCoverPath = `${basePath}/${normalizedPath}`;
                    console.log('Full cover image path (direct):', fullCoverPath);
                    
                    // Check if cover file exists
                    try {
                        const coverExists = await RNFS.exists(fullCoverPath);
                        if (!coverExists) {
                            console.error('Cover file does not exist at direct path:', fullCoverPath);
                            
                            // Try alternative file resolution approaches
                            const coverFilename = normalizedPath.split('/').pop() || '';
                            console.log('Attempting to find cover by filename:', coverFilename);
                            
                            // Search for the file by name in the extraction directory
                            if (coverFilename) {
                                try {
                                    const foundFile = await findFileByName(extractedPath, coverFilename);
                                    if (foundFile) {
                                        console.log('Found cover file by name search:', foundFile);
                                        
                                        // Create a stable book ID from the EPUB path
                                        const bookId = epubUri.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'unknown';
                                        // Create a cached copy of the cover image with a stable filename
                                        const coverExt = coverFilename.split('.').pop() || 'jpg';
                                        const cachedCoverPath = `${RNFS.CachesDirectoryPath}/book_cover_${bookId}.${coverExt}`;
                                        console.log('Copying found cover to cache with stable ID:', cachedCoverPath);
                                        await RNFS.copyFile(foundFile, cachedCoverPath);
                                        coverUri = cachedCoverPath;
                                        console.log('Successfully cached found cover image at:', cachedCoverPath);
                                    }
                                } catch (searchError) {
                                    console.error('Error searching for cover file by name:', searchError);
                                }
                            }
                        } else {
                            // Create a stable book ID from the EPUB path
                            const bookId = epubUri.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'unknown';
                            // Create a cached copy of the cover image with a stable filename
                            const coverExt = normalizedPath.split('.').pop() || 'jpg';
                            const cachedCoverPath = `${RNFS.CachesDirectoryPath}/book_cover_${bookId}.${coverExt}`;
                            console.log('Copying cover to cache with stable ID:', cachedCoverPath);
                            await RNFS.copyFile(fullCoverPath, cachedCoverPath);
                            coverUri = cachedCoverPath;
                            console.log('Successfully cached cover image at:', cachedCoverPath);
                        }
                    } catch (existsError) {
                        console.error('Error checking cover file existence:', existsError);
                    }
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
