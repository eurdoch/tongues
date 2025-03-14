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
      
      // Get the directory of the OPF file for path resolution
      const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/'));
      
      // Loop through spine items to find first chapter
      let firstChapterFound = false;
      for (const item of spineItems) {
        // Skip processing if we've already found the first chapter
        if (firstChapterFound) {
          console.log(`Skipping spine item: ${item.id} - already found first chapter`);
          continue;
        }
        
        // Resolve the path to the spine item
        const itemPath = `${opfDir}/${item.href}`;
        
        if (await RNFS.exists(itemPath)) {
          console.log(`Checking spine item: ${item.id} - ${item.href}`);
          const content = await RNFS.readFile(itemPath, 'utf8');
          
          // Parse HTML to extract text content only
          const root = parse(content);
          const textContent = root.textContent.trim();
          
          // Only query the API if there's meaningful content to analyze
          if (textContent.length > 50) {
            // Create a prompt to determine if this is the first chapter
            const prompt = `The following text is from an ebook. Is this the first chapter of the book? If yes, explain why. If no, explain what this seems to be instead (e.g., table of contents, copyright page, dedication, preface, etc.). Text: ${textContent.substring(0, 1500)}`;
            
            try {
              // Query the API to determine if this is the first chapter
              const response = await queryAI(prompt);
              console.log(`AI response for ${item.id}:`, response);
              
              // Check if the response indicates this is the first chapter
              if (response.toLowerCase().includes('yes') && 
                  (response.toLowerCase().includes('first chapter') || 
                   response.toLowerCase().includes('chapter 1') || 
                   response.toLowerCase().includes('chapter one'))) {
                console.log(`FOUND FIRST CHAPTER: ${item.id} - ${item.href}`);
                firstChapterFound = true;
              }
            } catch (error) {
              console.log(`Error querying AI for spine item ${item.id}:`, error);
            }
          } else {
            console.log(`Spine item ${item.id} has insufficient content for analysis`);
          }
        } else {
          console.log(`Spine item file not found: ${itemPath}`);
        }
      }
      
      if (!firstChapterFound) {
        console.log('Could not definitively identify the first chapter in this book');
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

// Function to query the AI endpoint
async function queryAI(prompt: string): Promise<string> {
  try {
    const response = await fetch('https://tongues.directto.link/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt })
    });
    
    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.answer || 'No answer provided';
  } catch (error) {
    console.error('Error querying AI:', error);
    throw error;
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