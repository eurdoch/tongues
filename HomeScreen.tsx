import React, { useState, useEffect, useLayoutEffect } from "react";
import { 
    Text, 
    View, 
    FlatList, 
    StyleSheet, 
    TouchableOpacity, 
    Image, 
    ActivityIndicator, 
    Platform,
    Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import RNFS from "react-native-fs";
import { RouteProp, useNavigation } from "@react-navigation/native";
import * as ZipArchive from 'react-native-zip-archive';
import { BookMetadata, getAllBookMetadata, processBookFile, updateLastRead, removeBookMetadata } from './BookMetadataStore';
import { parseEpub } from "./components/reader/EpubLoader";
import { RootStackParamList } from "./App";
import { findFirstContentTag, readTextFile } from "./utils";
import { useNavigationContext } from "./NavigationContext";

interface EpubFile {
    id: string;
    uri: string;
    name: string;  // Filename without extension
    title: string; // Actual book title from metadata
    coverUri: string | null;
    size: number;
    lastModified?: number;
}

type HomeScreenRouteProp = RouteProp<RootStackParamList, 'Home'>;

type HomeProps = {
  route: HomeScreenRouteProp
};

function HomeScreen({ route }: HomeProps): React.JSX.Element {
    const [epubFiles, setEpubFiles] = useState<EpubFile[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
    const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
    const navigation = useNavigation();
    const { navMap, setNavMap } = useNavigationContext();

    // Handle select all books
    const handleSelectAll = () => {
        const allBookIds = new Set(epubFiles.map(book => book.id));
        setSelectedBooks(allBookIds);
    };
    
    // Configure header buttons based on selection mode
    useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <View style={styles.headerButtons}>
                    {isSelectMode ? (
                        <>
                            <TouchableOpacity 
                                style={styles.headerButton} 
                                onPress={handleDeleteSelected}
                                disabled={selectedBooks.size === 0}
                            >
                                <Text style={[
                                    styles.headerButtonText, 
                                    selectedBooks.size === 0 ? styles.disabledText : styles.deleteText
                                ]}>
                                    Delete
                                </Text>
                            </TouchableOpacity>
                            {selectedBooks.size < epubFiles.length ? (
                                <TouchableOpacity 
                                    style={styles.headerButton} 
                                    onPress={handleSelectAll}
                                >
                                    <Text style={styles.headerButtonText}>Select All</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity 
                                    style={styles.headerButton} 
                                    onPress={() => setSelectedBooks(new Set())}
                                >
                                    <Text style={styles.headerButtonText}>Deselect All</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity 
                                style={styles.headerButton} 
                                onPress={() => {
                                    setIsSelectMode(false);
                                    setSelectedBooks(new Set());
                                }}
                            >
                                <Text style={styles.headerButtonText}>Cancel</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <TouchableOpacity 
                            style={styles.headerButton} 
                            onPress={() => setIsSelectMode(true)}
                            disabled={epubFiles.length === 0}
                        >
                            <Text style={[
                                styles.headerButtonText,
                                epubFiles.length === 0 ? styles.disabledText : null
                            ]}>
                                Select
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            ),
        });
    }, [navigation, isSelectMode, selectedBooks, epubFiles]);

    // Add a focus listener to refresh books whenever the screen gains focus
    useEffect(() => {
        let isMounted = true;
        
        // Initial load when component mounts
        const loadInitialBooks = async () => {
            // Only continue if component is still mounted
            if (!isMounted) return;
            
            console.log('Initial book scan');
            findEpubFiles();
        };
        
        loadInitialBooks();
        
        // Set up a focus listener to refresh the book list whenever screen comes into focus
        const unsubscribe = navigation.addListener('focus', () => {
            if (isMounted) {
                console.log('HomeScreen focused - refreshing books');
                findEpubFiles();
            }
        });
        
        // Cleanup function to prevent state updates after unmount
        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, [navigation]);
    
    // Also refresh the book list when returning with refreshBooks flag
    // (Keeping this for backward compatibility)
    useEffect(() => {
        if (route.params?.refreshBooks) {
            console.log('Refreshing book list due to navigation param');
            findEpubFiles();
            
            // Clear the parameter after using it
            navigation.setParams({ refreshBooks: undefined });
        }
    }, [route.params?.refreshBooks]);

    const findDuplicateEpubs = (epubs: EpubFile[]): Map<string, EpubFile[]> => {
        // Group EPUBs by name only (without considering size)
        // This is more reliable since size might vary slightly between copies
        const duplicateGroups = new Map<string, EpubFile[]>();
        
        // First, normalize filenames and group by name
        const normalizeName = (name: string): string => {
            // Remove extension if present
            let normalized = name.replace(/\.epub$/i, "").trim();
            // Replace special characters and spaces with underscores
            normalized = normalized.replace(/[^a-z0-9]/gi, "_").toLowerCase();
            return normalized;
        };
        
        // Group by normalized name
        const groupedByName = new Map<string, EpubFile[]>();
        
        epubs.forEach(epub => {
            const normalizedName = normalizeName(epub.name);
            if (!groupedByName.has(normalizedName)) {
                groupedByName.set(normalizedName, []);
            }
            groupedByName.get(normalizedName)?.push(epub);
        });
        
        // Filter out groups with more than one file (these are potential duplicates)
        for (const [key, group] of groupedByName.entries()) {
            if (group.length > 1) {
                console.log(`Found potential duplicates for "${key}": ${group.length} files`);
                group.forEach(epub => {
                    console.log(` - ${epub.name} (${epub.uri})`);
                });
                duplicateGroups.set(key, group);
            }
        }
        
        return duplicateGroups;
    };
    
    const removeDuplicateEpubs = async (duplicateGroups: Map<string, EpubFile[]>): Promise<number> => {
        let removedCount = 0;
        
        for (const group of duplicateGroups.values()) {
            // Skip very small groups (could be false positives)
            if (group.length <= 1) {
                continue;
            }
            
            console.log(`Processing duplicate group with ${group.length} files:`, group.map(f => f.name).join(', '));
            
            try {
                // Sort by last modified (most recent first)
                group.sort((a, b) => {
                    const aTime = a.lastModified || 0;
                    const bTime = b.lastModified || 0;
                    return bTime - aTime;
                });
                
                // Keep the most recently modified file, delete the rest
                const [keepFile, ...duplicatesToRemove] = group;
                
                // Skip if no duplicates to remove
                if (duplicatesToRemove.length === 0) {
                    continue;
                }
                
                // Log which file we're keeping and which we're removing
                console.log(`Keeping most recent file: ${keepFile.name} (${keepFile.uri})`);
                console.log(`Last modified: ${new Date(keepFile.lastModified || 0).toLocaleString()}`);
                
                // Check that keepFile actually exists first
                const keepFileExists = await RNFS.exists(keepFile.uri);
                if (!keepFileExists) {
                    console.error(`Error: The file we want to keep doesn't exist: ${keepFile.uri}`);
                    continue; // Skip this group if the file we want to keep doesn't exist
                }
                
                for (const duplicate of duplicatesToRemove) {
                    try {
                        // First verify that this file exists and is different from the one we're keeping
                        if (duplicate.uri === keepFile.uri) {
                            console.log(`Skipping identical file path: ${duplicate.uri}`);
                            continue;
                        }
                        
                        const duplicateExists = await RNFS.exists(duplicate.uri);
                        if (!duplicateExists) {
                            console.log(`File already doesn't exist: ${duplicate.uri}`);
                            continue;
                        }
                        
                        console.log(`Removing duplicate: ${duplicate.name} (${duplicate.uri})`);
                        console.log(`Last modified: ${new Date(duplicate.lastModified || 0).toLocaleString()}`);
                        
                        await RNFS.unlink(duplicate.uri);
                        removedCount++;
                    } catch (error) {
                        console.error(`Failed to remove duplicate file ${duplicate.uri}:`, error);
                    }
                }
            } catch (groupError) {
                console.error('Error processing duplicate group:', groupError);
            }
        }
        
        return removedCount;
    };

    const findEpubFiles = async () => {
        try {
            setIsLoading(true);
            setError(null);

            // First, try to load books from metadata store
            const storedMetadata = await getAllBookMetadata();
            console.log(`Found ${Object.keys(storedMetadata).length} books in metadata store`);

            // Check if stored metadata files still exist
            const validStoredBooks: BookMetadata[] = [];
            for (const bookId in storedMetadata) {
                const book = storedMetadata[bookId];
                try {
                    const exists = await RNFS.exists(book.filePath);
                    if (exists) {
                        validStoredBooks.push(book);
                    } else {
                        console.log(`Book no longer exists: ${book.filePath}`);
                        // Could remove the metadata for this book here
                    }
                } catch (error) {
                    console.error(`Error checking if book exists: ${book.filePath}`, error);
                }
            }

            // Now search the app directory for any EPUBs not in our metadata store
            const appDataDirectory = RNFS.DocumentDirectoryPath;
            console.log(`Searching app data directory for new EPUBs: ${appDataDirectory}`);
            const epubs = await searchDirectoryForEpubs(appDataDirectory);
            
            // Check for and remove duplicates
            const duplicateGroups = findDuplicateEpubs(epubs);
            let removedCount = 0;
            
            if (duplicateGroups.size > 0) {
                console.log(`Found ${duplicateGroups.size} groups of duplicate EPUBs`);
                removedCount = await removeDuplicateEpubs(duplicateGroups);
                
                if (removedCount > 0) {
                    console.log(`Removed ${removedCount} duplicate EPUB files`);
                    // Re-scan after removing duplicates
                    const updatedEpubs = await searchDirectoryForEpubs(appDataDirectory);
                    
                    // Process new EPUBs that aren't in our metadata store
                    // Use more robust filename-based duplicate detection instead of exact path matching
                    const newEpubs = updatedEpubs.filter(epub => {
                        // Get the filename without path
                        const epubFilename = epub.uri.split('/').pop()?.toLowerCase() || '';
                        
                        // Check if this filename already exists in our valid stored books
                        return !validStoredBooks.some(book => {
                            const bookFilename = book.filePath.split('/').pop()?.toLowerCase() || '';
                            return bookFilename === epubFilename;
                        });
                    });
                    
                    console.log(`Found ${newEpubs.length} new EPUB files not in metadata store`);
                    
                    // Process and store metadata for new EPUBs
                    const newProcessedBooks: BookMetadata[] = [];
                    for (const epub of newEpubs) {
                        const metadata = await processBookFile(epub.uri);
                        if (metadata) {
                            newProcessedBooks.push(metadata);
                        }
                    }
                    
                    // Convert all BookMetadata to EpubFile format for display
                    const allBooks: EpubFile[] = [
                        ...validStoredBooks.map(book => ({
                            id: book.id,
                            uri: book.filePath,
                            name: book.filePath.split('/').pop()?.replace(/\.epub$/i, '') || 'Unknown',
                            title: book.title,
                            coverUri: book.coverPath,
                            size: book.fileSize,
                            lastModified: book.lastModified
                        })),
                        ...newProcessedBooks.map(book => ({
                            id: book.id,
                            uri: book.filePath,
                            name: book.filePath.split('/').pop()?.replace(/\.epub$/i, '') || 'Unknown',
                            title: book.title,
                            coverUri: book.coverPath,
                            size: book.fileSize,
                            lastModified: book.lastModified
                        }))
                    ];
                    
                    // Sort by last modified date (newest first)
                    allBooks.sort((a, b) => {
                        const aTime = a.lastModified || 0;
                        const bTime = b.lastModified || 0;
                        return bTime - aTime;
                    });
                    
                    setEpubFiles(allBooks);
                    
                    if (removedCount === 1) {
                        Alert.alert("Duplicate Removed", `Removed 1 duplicate EPUB file`);
                    } else {
                        Alert.alert("Duplicates Removed", `Removed ${removedCount} duplicate EPUB files`);
                    }
                    setIsLoading(false);
                    return;
                }
            }
            
            // Process new EPUBs that aren't in our metadata store
            // Use more robust filename-based duplicate detection instead of exact path matching
            const newEpubs = epubs.filter(epub => {
                // Get the filename without path
                const epubFilename = epub.uri.split('/').pop()?.toLowerCase() || '';
                
                // Log the filename we're checking for duplicates
                console.log(`Checking if ${epubFilename} is already in metadata store`);
                
                // Check if this filename already exists in our valid stored books
                const isDuplicate = validStoredBooks.some(book => {
                    const bookFilename = book.filePath.split('/').pop()?.toLowerCase() || '';
                    
                    // Check for exact match or filename without extension
                    const exactMatch = bookFilename === epubFilename;
                    
                    // Also check for names without extensions (for more robust matching)
                    const bookNameNoExt = bookFilename.replace(/\.epub$/i, '');
                    const epubNameNoExt = epubFilename.replace(/\.epub$/i, '');
                    const nameMatch = bookNameNoExt === epubNameNoExt;
                    
                    // Log detailed matching information
                    if (exactMatch || nameMatch) {
                        console.log(`Found duplicate match: 
                            - Existing book: ${bookFilename} (${book.filePath})
                            - New book: ${epubFilename} (${epub.uri})
                            - Exact match: ${exactMatch}
                            - Name match: ${nameMatch}`);
                    }
                    
                    return exactMatch || nameMatch;
                });
                
                // If duplicate, update the 'lastModified' date of the existing book
                // to make sure it appears at the top of the list
                if (isDuplicate) {
                    const epubFilename = epub.uri.split('/').pop()?.toLowerCase() || '';
                    
                    validStoredBooks.forEach(async book => {
                        const bookFilename = book.filePath.split('/').pop()?.toLowerCase() || '';
                        const bookNameNoExt = bookFilename.replace(/\.epub$/i, '');
                        const epubNameNoExt = epubFilename.replace(/\.epub$/i, '');
                        
                        if (bookFilename === epubFilename || bookNameNoExt === epubNameNoExt) {
                            console.log(`Updating lastModified date for duplicate book: ${book.filePath}`);
                            // Import the function dynamically to avoid circular references
                            const { updateLastRead } = require('./BookMetadataStore');
                            await updateLastRead(book.id);
                        }
                    });
                }
                
                return !isDuplicate;
            });
            
            console.log(`Found ${newEpubs.length} new EPUB files not in metadata store`);
            
            // Process and store metadata for new EPUBs
            const newProcessedBooks: BookMetadata[] = [];
            for (const epub of newEpubs) {
                const metadata = await processBookFile(epub.uri);
                if (metadata) {
                    newProcessedBooks.push(metadata);
                }
            }
            
            // Convert all BookMetadata to EpubFile format for display
            const allBooks: EpubFile[] = [
                ...validStoredBooks.map(book => ({
                    id: book.id,
                    uri: book.filePath,
                    name: book.filePath.split('/').pop()?.replace(/\.epub$/i, '') || 'Unknown',
                    title: book.title,
                    coverUri: book.coverPath,
                    size: book.fileSize,
                    lastModified: book.lastModified
                })),
                ...newProcessedBooks.map(book => ({
                    id: book.id,
                    uri: book.filePath,
                    name: book.filePath.split('/').pop()?.replace(/\.epub$/i, '') || 'Unknown',
                    title: book.title,
                    coverUri: book.coverPath,
                    size: book.fileSize,
                    lastModified: book.lastModified
                }))
            ];
            
            // Sort by last modified date (newest first)
            allBooks.sort((a, b) => {
                const aTime = a.lastModified || 0;
                const bTime = b.lastModified || 0;
                return bTime - aTime;
            });
            
            setEpubFiles(allBooks);
            
        } catch (err) {
            console.error("Error finding EPUB files:", err);
            setError("Failed to scan for EPUB files");
        } finally {
            setIsLoading(false);
        }
    };

    const searchDirectoryForEpubs = async (directory: string, maxDepth = 3): Promise<EpubFile[]> => {
        try {
            if (maxDepth <= 0) return [];

            // Check if directory exists
            const dirExists = await RNFS.exists(directory);
            if (!dirExists) {
                console.log(`Directory does not exist: ${directory}`);
                return [];
            }

            const files = await RNFS.readDir(directory);
            let results: EpubFile[] = [];
            
            console.log(`Found ${files.length} files/folders in ${directory}`);

            // Process file by file to prevent duplicate additions
            const processedPaths = new Set<string>();

            for (const file of files) {
                // Skip if we've already processed this exact path
                if (processedPaths.has(file.path)) {
                    console.log(`Skipping already processed path: ${file.path}`);
                    continue;
                }
                
                processedPaths.add(file.path);

                if (file.isFile() && file.name.toLowerCase().endsWith(".epub")) {
                    try {
                        console.log(`Found EPUB file: ${file.name} at ${file.path}`);
                        
                        // Check if the file still exists
                        const fileExists = await RNFS.exists(file.path);
                        if (!fileExists) {
                            console.log(`File doesn't exist anymore: ${file.path}`);
                            continue;
                        }
                        
                        const stat = await RNFS.stat(file.path);
                        
                        // Generate a unique ID for the file
                        const uniqueId = `${file.path}_${stat.size}_${stat.mtime?.getTime() || 0}`;
                        
                        results.push({
                            id: uniqueId,
                            uri: file.path,
                            name: file.name.replace(/\.epub$/i, ""),
                            title: file.name.replace(/\.epub$/i, ""), // Default to filename, will update with real title later
                            coverUri: null,
                            size: stat.size,
                            lastModified: stat.mtime?.getTime()
                        });
                    } catch (statError) {
                        console.error(`Error getting stats for ${file.path}:`, statError);
                    }
                } else if (file.isDirectory()) {
                    try {
                        console.log(`Searching subdirectory: ${file.path}`);
                        const subResults = await searchDirectoryForEpubs(file.path, maxDepth - 1);
                        
                        // Only add unique results
                        for (const result of subResults) {
                            if (!processedPaths.has(result.uri)) {
                                processedPaths.add(result.uri);
                                results.push(result);
                            }
                        }
                    } catch (e) {
                        // Skip inaccessible directories
                        console.log(`Skipping directory ${file.path}: ${e}`);
                    }
                }
            }

            console.log(`Found ${results.length} EPUB files in ${directory} and subdirectories`);
            return results;
        } catch (error) {
            console.log(`Error reading directory ${directory}:`, error);
            return [];
        }
    };

    const extractEpubMetadata = async (epubUri: string): Promise<{ title: string | null, coverUri: string | null }> => {
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
                                // Create a cached copy of the cover image with a stable filename based on book path
                                const coverExt = decodedCoverPath.split('.').pop() || 'jpg';
                                // Create a stable ID from the EPUB path to ensure covers are associated with books
                                const bookId = epubUri.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'unknown';
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
                                            
                                            // Create a cached copy of the cover image with a stable filename
                                            const coverExt = coverFilename.split('.').pop() || 'jpg';
                                            // Create a stable ID from the EPUB path to ensure covers are associated with books
                                            const bookId = epubUri.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'unknown';
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
                                // Create a cached copy of the cover image with a stable filename
                                const coverExt = normalizedPath.split('.').pop() || 'jpg';
                                // Create a stable ID from the EPUB path to ensure covers are associated with books
                                const bookId = epubUri.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'unknown';
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
    
    // Function to find a file by name recursively in a directory
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

    const findOpfFile = async (directoryPath: string): Promise<string | null> => {
        try {
            const items = await RNFS.readDir(directoryPath);
            
            // First, check for OPF files in the current directory
            for (const item of items) {
                if (!item.isDirectory() && item.name.endsWith('.opf')) {
                    return item.path;
                }
            }
            
            // If not found in current directory, search in subdirectories
            for (const item of items) {
                if (item.isDirectory()) {
                    const opfPath = await findOpfFile(item.path);
                    if (opfPath) {
                        return opfPath;
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error searching for OPF file:', error);
            return null;
        }
    };

    const openBook = async (item: EpubFile) => {
      try {
        if (isSelectMode) {
            // Toggle selection
            const newSelected = new Set(selectedBooks);
            if (newSelected.has(item.id)) {
                newSelected.delete(item.id);
            } else {
                newSelected.add(item.id);
            }
            setSelectedBooks(newSelected);
        } else {
            // Update last read time in metadata
            await updateLastRead(item.id);
            
            const result = await parseEpub(item.uri);
            const firstContentElem = findFirstContentTag(result.navMap);
            const firstContentPath = result.basePath + '/' + firstContentElem.getAttribute('src');
            const firstContents = await readTextFile(firstContentPath);
            setNavMap(result.navMap);

            // Navigate to reader screen
            navigation.navigate('Reader', { 
              content: firstContents,
              basePath: result.basePath,
            });
        }
      } catch (err: any) {
        console.error(err);
      }
    };
    
    // Handle deletion of selected books
    const handleDeleteSelected = () => {
        if (selectedBooks.size === 0) return;
        
        Alert.alert(
            "Confirm Deletion",
            `Delete ${selectedBooks.size} selected book${selectedBooks.size > 1 ? 's' : ''}?`,
            [
                {
                    text: "Cancel",
                    style: "cancel"
                },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        // Create an array of books to delete
                        const booksToDelete = epubFiles.filter(book => selectedBooks.has(book.id));
                        
                        // Delete each book
                        for (const book of booksToDelete) {
                            try {
                                // Delete the file
                                if (await RNFS.exists(book.uri)) {
                                    await RNFS.unlink(book.uri);
                                }
                                
                                // Delete the cover if it exists
                                if (book.coverUri && await RNFS.exists(book.coverUri)) {
                                    await RNFS.unlink(book.coverUri);
                                }
                                
                                // Remove from metadata
                                await removeBookMetadata(book.id);
                            } catch (error) {
                                console.error(`Error deleting book ${book.title}:`, error);
                            }
                        }
                        
                        // Refresh the book list
                        setIsSelectMode(false);
                        setSelectedBooks(new Set());
                        findEpubFiles();
                    }
                }
            ]
        );
    };

    const renderEpubItem = ({ item }: { item: EpubFile }) => (
        <TouchableOpacity 
            style={[
                styles.bookItem, 
                isSelectMode && selectedBooks.has(item.id) && styles.selectedBookItem
            ]} 
            onPress={() => openBook(item)}
        >
            <View style={styles.bookItemContent}>
                {item.coverUri ? (
                    <Image 
                        source={{ uri: `file://${item.coverUri}` }} 
                        style={styles.bookCover}
                        resizeMode="cover"
                    />
                ) : (
                    <View style={styles.placeholderCover}>
                        <Text style={styles.placeholderText}>No Cover</Text>
                    </View>
                )}
                {isSelectMode && (
                    <View style={styles.selectionOverlay}>
                        <View style={[
                            styles.selectionIndicator,
                            selectedBooks.has(item.id) && styles.selectionIndicatorSelected
                        ]}>
                            {selectedBooks.has(item.id) && (
                                <Text style={styles.checkmark}>✓</Text>
                            )}
                        </View>
                    </View>
                )}
                <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
            </View>
        </TouchableOpacity>
    );

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#1a73e8" />
                    <Text style={styles.loadingText}>Scanning for EPUB files...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (error) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity 
                        style={styles.retryButton}
                        onPress={findEpubFiles}
                    >
                        <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {epubFiles.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No EPUB files found</Text>
                    <Text style={styles.emptySubText}>
                        EPUB files opened with this app will appear here
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={epubFiles}
                    renderItem={renderEpubItem}
                    keyExtractor={(item) => item.id}
                    numColumns={2}
                    contentContainerStyle={styles.bookList}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    headerButtons: {
        flexDirection: 'row',
        paddingRight: 16,
    },
    headerButton: {
        marginLeft: 15,
        paddingVertical: 5,
    },
    headerButtonText: {
        fontSize: 16,
        color: '#1a73e8',
        fontWeight: '500',
    },
    disabledText: {
        color: '#aaa',
    },
    deleteText: {
        color: '#d32f2f',
    },
    bookList: {
        padding: 16,
    },
    bookItem: {
        flex: 1,
        margin: 8,
        maxWidth: '45%',
        backgroundColor: 'white',
        borderRadius: 8,
        overflow: 'hidden',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
    },
    selectedBookItem: {
        borderWidth: 2,
        borderColor: '#1a73e8',
    },
    bookItemContent: {
        position: 'relative',
        flex: 1,
    },
    bookCover: {
        width: '100%',
        height: 180,
        backgroundColor: '#eee',
    },
    placeholderCover: {
        width: '100%',
        height: 180,
        backgroundColor: '#e0e0e0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderText: {
        color: '#888',
        fontSize: 16,
    },
    bookTitle: {
        padding: 8,
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
    },
    selectionOverlay: {
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 10,
    },
    selectionIndicator: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'white',
        borderWidth: 2,
        borderColor: '#ccc',
        justifyContent: 'center',
        alignItems: 'center',
    },
    selectionIndicatorSelected: {
        backgroundColor: '#1a73e8',
        borderColor: '#1a73e8',
    },
    checkmark: {
        color: 'white',
        fontWeight: 'bold',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        color: '#666',
        fontSize: 16,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    errorText: {
        color: '#d32f2f',
        fontSize: 16,
        marginBottom: 16,
        textAlign: 'center',
    },
    retryButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#1a73e8',
        borderRadius: 8,
    },
    retryButtonText: {
        color: 'white',
        fontWeight: '500',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '500',
        color: '#555',
        marginBottom: 8,
    },
    emptySubText: {
        fontSize: 14,
        color: '#777',
        textAlign: 'center',
    },
});

export default HomeScreen
