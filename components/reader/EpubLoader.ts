import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';
import { DOMParser } from 'xmldom';

export async function parseEpub(fileUri: string) {
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
    
    return {
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
