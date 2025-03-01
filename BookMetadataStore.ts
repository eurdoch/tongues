import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { extractEpubMetadata } from './utils';

export interface BookMetadata {
  id: string;          // Unique identifier for the book (typically filename or path hash)
  filePath: string;    // Path to the actual EPUB file
  title: string;       // Title from metadata or filename
  coverPath: string | null; // Path to the cached cover image
  lastModified: number;     // Last modification time of the file
  fileSize: number;    // Size of the file in bytes
  lastRead: number;    // Last time the book was opened
}

const METADATA_STORAGE_KEY = 'TONGUES_BOOK_METADATA';

// Save metadata for a single book
export const saveBookMetadata = async (metadata: BookMetadata): Promise<void> => {
  try {
    // Get existing metadata
    const existingMetadata = await getAllBookMetadata();
    
    // Update or add the new metadata
    const updatedMetadata = {
      ...existingMetadata,
      [metadata.id]: metadata,
    };
    
    // Save back to storage
    await AsyncStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(updatedMetadata));
    console.log(`Saved metadata for book: ${metadata.title}`);
  } catch (error) {
    console.error('Error saving book metadata:', error);
  }
};

// Get metadata for a single book by ID
export const getBookMetadata = async (id: string): Promise<BookMetadata | null> => {
  try {
    const metadata = await getAllBookMetadata();
    return metadata[id] || null;
  } catch (error) {
    console.error('Error getting book metadata:', error);
    return null;
  }
};

// Get all book metadata
export const getAllBookMetadata = async (): Promise<Record<string, BookMetadata>> => {
  try {
    const data = await AsyncStorage.getItem(METADATA_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error getting all book metadata:', error);
    return {};
  }
};

// Remove metadata for a book
export const removeBookMetadata = async (id: string): Promise<void> => {
  try {
    const metadata = await getAllBookMetadata();
    if (metadata[id]) {
      delete metadata[id];
      await AsyncStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(metadata));
      console.log(`Removed metadata for book ID: ${id}`);
    }
  } catch (error) {
    console.error('Error removing book metadata:', error);
  }
};

// Create or update metadata for a book file
export const processBookFile = async (filePath: string): Promise<BookMetadata | null> => {
  try {
    // Check if file exists
    const exists = await RNFS.exists(filePath);
    if (!exists) {
      console.log(`File does not exist: ${filePath}`);
      return null;
    }
    
    // Get file stats
    const stats = await RNFS.stat(filePath);
    
    // Create unique ID from the file path
    const id = filePath.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || '';
    
    // Extract metadata (this will be from a modified version in utils.ts)
    const { title, coverUri } = await extractEpubMetadata(filePath);
    
    if (!title) {
      console.log(`Failed to extract title for book: ${filePath}`);
      // Use filename as fallback
      const fileName = filePath.split('/').pop() || 'Unknown';
      const titleFallback = fileName.replace(/\.epub$/i, '');
      
      const metadata: BookMetadata = {
        id,
        filePath,
        title: titleFallback,
        coverPath: coverUri,
        lastModified: stats.mtime?.getTime() || Date.now(),
        fileSize: stats.size,
        lastRead: Date.now(),
      };
      
      await saveBookMetadata(metadata);
      return metadata;
    }
    
    // Create metadata
    const metadata: BookMetadata = {
      id,
      filePath,
      title,
      coverPath: coverUri,
      lastModified: stats.mtime?.getTime() || Date.now(),
      fileSize: stats.size,
      lastRead: Date.now(),
    };
    
    // Save metadata
    await saveBookMetadata(metadata);
    return metadata;
  } catch (error) {
    console.error('Error processing book file:', error);
    return null;
  }
};

// Update last read time for a book
export const updateLastRead = async (id: string): Promise<void> => {
  try {
    const metadata = await getBookMetadata(id);
    if (metadata) {
      await saveBookMetadata({
        ...metadata,
        lastRead: Date.now(),
      });
    }
  } catch (error) {
    console.error('Error updating last read time:', error);
  }
};