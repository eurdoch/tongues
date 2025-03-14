import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import Epub, { Book } from 'epubjs';

export async function parseEpub(fileUri: string) {
  try {
    console.log('Starting to unzip epub file:', fileUri);
    const extractionPath = `${RNFS.CachesDirectoryPath}/epub_extract`;
    
    // Ensure the extraction directory exists and is empty
    if (await RNFS.exists(extractionPath)) {
      await RNFS.unlink(extractionPath);
    }
    await RNFS.mkdir(extractionPath);
    
    // Unzip the epub file using react-native-zip-archive
    const unzipResult = await unzip(fileUri, extractionPath);
    console.log('Epub unzipped to:', unzipResult);
    
    // Read and log the contents of the extraction directory
    const files = await RNFS.readdir(extractionPath);
    console.log('Files in the epub root:', files);
    
    // Recursively read subdirectories to get a complete picture of the epub contents
    await logDirectoryContents(extractionPath, '');
    
    return unzipResult;
  } catch (error) {
    console.error('Epub parsing failed:', error);
    throw Error('Epub parsing failed: ' + error);
  }
}

// Helper function to recursively read and log directory contents
async function logDirectoryContents(basePath: string, relativePath: string) {
  const currentPath = relativePath ? `${basePath}/${relativePath}` : basePath;
  
  try {
    const items = await RNFS.readdir(currentPath);
    
    for (const item of items) {
      const itemPath = relativePath ? `${relativePath}/${item}` : item;
      const fullPath = `${basePath}/${itemPath}`;
      
      try {
        const stats = await RNFS.stat(fullPath);
        
        if (stats.isDirectory()) {
          console.log(`[DIR] ${itemPath}`);
          await logDirectoryContents(basePath, itemPath);
        } else {
          console.log(`[FILE] ${itemPath} (${stats.size} bytes)`);
          
          // For text files, you might want to read and log their content
          if (item.endsWith('.opf') || item.endsWith('.ncx') || item.endsWith('.html') || 
              item.endsWith('.xhtml') || item.endsWith('.xml') || item.endsWith('.json')) {
            try {
              const content = await RNFS.readFile(fullPath, 'utf8');
              console.log(`Content of ${itemPath}:\n${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`);
            } catch (error) {
              console.log(`Could not read content of ${itemPath}: ${error}`);
            }
          }
        }
      } catch (error) {
        console.log(`Error processing ${itemPath}: ${error}`);
      }
    }
  } catch (error) {
    console.log(`Error reading directory ${currentPath}: ${error}`);
  }
}