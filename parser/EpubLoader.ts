import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { DOMParser } from 'xmldom';
import { readTextFile } from '../utils';
import BookData from '../types/BookData';

export async function parseEpub(fileUri: string): Promise<BookData> {
  try {
    console.log('Starting to unzip epub file:', fileUri);
    const extractionPath = `${RNFS.CachesDirectoryPath}/epub_extract`;
    
    if (await RNFS.exists(extractionPath)) {
      await RNFS.unlink(extractionPath);
    }
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

    let language = null;
    const opfPath = await findFileWithExtension(unzipResult, 'opf');
    if (opfPath) {
      const opfContent = await readTextFile(opfPath);
      language = extractLanguageFromOpf(opfContent);
    }
    
    return {
      language,
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
