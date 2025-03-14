import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import Epub, { Book } from 'epubjs';
import { parse } from 'node-html-parser';

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
    
    // Find the OPF file to extract the spine
    const opfPath = await findOPFFile(extractionPath);
    if (opfPath) {
      console.log('Found OPF file at:', opfPath);
      
      // Read and parse the OPF file to get the spine items
      const spineItems = await extractSpineItems(opfPath);
      console.log('Spine items:', spineItems);
      
      // Log the content of each spine item
      for (const item of spineItems) {
        await logSpineItemContent(extractionPath, item);
      }
    } else {
      console.log('No OPF file found in the epub');
    }
    
    return unzipResult;
  } catch (error) {
    console.error('Epub parsing failed:', error);
    throw Error('Epub parsing failed: ' + error);
  }
}

// Find the OPF file in the unzipped epub
async function findOPFFile(rootPath: string): Promise<string | null> {
  // First, check if there's a container.xml file
  const containerPath = `${rootPath}/META-INF/container.xml`;
  
  if (await RNFS.exists(containerPath)) {
    try {
      const containerXml = await RNFS.readFile(containerPath, 'utf8');
      const root = parse(containerXml);
      
      // Extract the full-path attribute from rootfile element
      const rootfileElement = root.querySelector('rootfile');
      if (rootfileElement) {
        const fullPath = rootfileElement.getAttribute('full-path');
        if (fullPath) {
          return `${rootPath}/${fullPath}`;
        }
      }
    } catch (error) {
      console.log('Error parsing container.xml:', error);
    }
  }
  
  // Fallback: search for OPF files manually
  return searchForOPFFile(rootPath);
}

// Recursively search for OPF files
async function searchForOPFFile(dirPath: string): Promise<string | null> {
  try {
    const items = await RNFS.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = `${dirPath}/${item}`;
      const stats = await RNFS.stat(itemPath);
      
      if (stats.isDirectory()) {
        const result = await searchForOPFFile(itemPath);
        if (result) return result;
      } else if (item.endsWith('.opf')) {
        return itemPath;
      }
    }
  } catch (error) {
    console.log(`Error searching directory ${dirPath}:`, error);
  }
  
  return null;
}

// Extract spine items from the OPF file
async function extractSpineItems(opfPath: string): Promise<{ id: string, href: string }[]> {
  try {
    const opfContent = await RNFS.readFile(opfPath, 'utf8');
    const root = parse(opfContent);
    
    // Get the spine elements
    const spineElements = root.querySelectorAll('spine itemref');
    const manifestItems = root.querySelectorAll('manifest item');
    
    const spineItems: { id: string, href: string }[] = [];
    
    // Map spine idref to manifest items
    for (const spineEl of spineElements) {
      const idref = spineEl.getAttribute('idref');
      if (idref) {
        // Find the corresponding manifest item
        const manifestItem = manifestItems.find(item => item.getAttribute('id') === idref);
        if (manifestItem) {
          const href = manifestItem.getAttribute('href');
          if (href) {
            spineItems.push({ id: idref, href });
          }
        }
      }
    }
    
    return spineItems;
  } catch (error) {
    console.log('Error extracting spine items:', error);
    return [];
  }
}

// Log the content of a spine item
async function logSpineItemContent(rootPath: string, item: { id: string, href: string }) {
  try {
    // Get the directory of the OPF file
    const opfPath = await findOPFFile(rootPath);
    if (!opfPath) return;
    
    const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/'));
    
    // Resolve the path to the spine item
    const itemPath = `${opfDir}/${item.href}`;
    
    if (await RNFS.exists(itemPath)) {
      const content = await RNFS.readFile(itemPath, 'utf8');
      console.log(`Spine item: ${item.id} - ${item.href}`);
      console.log(`Content preview:\n${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`);
    } else {
      console.log(`Spine item file not found: ${itemPath}`);
    }
  } catch (error) {
    console.log(`Error reading spine item ${item.href}:`, error);
  }
}