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

    const tocPath = await findFileRecursively(unzipResult, 'toc.ncx');
    if (tocPath) {
      const tocContents = await RNFS.readFile(tocPath, 'utf8');
      const parsedToc = new DOMParser().parseFromString(tocContents);
      const navMap = findNavMap(parsedToc);
      console.log('navMap: ', navMap);
    }
    
    return {
      path: unzipResult,
      toc: 'toc'
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

function findNavMap(parsedXml: any): any {
  if (parsedXml.tagName === 'navMap') {
    return parsedXml;
  }

  const childNodes = parsedXml.childNodes;
  if (childNodes) {
    for (const key in childNodes) {
      const foundNavMap = findNavMap(childNodes[key]);
      if (foundNavMap) {
        return foundNavMap;
      }
    }

  }

  return null;
}

