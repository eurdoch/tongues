import RNFS from 'react-native-fs';
import Epub, { Book } from 'epubjs';

export async function parseEpub(fileUri: string): Promise<Book> {
  try {
    const fileContent = await RNFS.readFile(fileUri, 'base64');
    
    const binaryString = global.atob(fileContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const arrayBuffer = bytes.buffer;
    
    const book = Epub(arrayBuffer);
    await book.ready;
    
    return book;
  } catch (error) {
    throw Error('Epub parsing failed: ' + error);
  }
}
