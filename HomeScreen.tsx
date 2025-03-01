import React, { useState, useEffect } from "react";
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
import { useNavigation, useRoute } from "@react-navigation/native";
import * as ZipArchive from 'react-native-zip-archive';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';

interface EpubFile {
    id: string;
    uri: string;
    name: string;  // Filename without extension
    title: string; // Actual book title from metadata
    coverUri: string | null;
    size: number;
    lastModified?: number;
}

const requestStoragePermission = async () => {
  // Different permissions for different Android versions
  const permission = Platform.Version >= 33
    ? PERMISSIONS.ANDROID.READ_MEDIA_IMAGES
    : PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE;
  
  try {
    const result = await request(permission);
    
    switch (result) {
      case RESULTS.GRANTED:
        console.log('Storage permission granted');
        // Permission granted, you can now access storage
        break;
      case RESULTS.DENIED:
        console.log('Storage permission denied');
        // Permission denied, but not permanently
        break;
      case RESULTS.BLOCKED:
        console.log('Storage permission blocked');
        Alert.alert(
          'Storage Permission',
          'Storage permission is blocked. Please enable it in app settings.',
          [
            { text: 'OK' }
          ]
        );
        break;
    }
    
    return result === RESULTS.GRANTED;
  } catch (error) {
    console.error('Error requesting storage permission:', error);
    return false;
  }
};

function HomeScreen(): React.JSX.Element {
    const [epubFiles, setEpubFiles] = useState<EpubFile[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const navigation = useNavigation();
    const route = useRoute();

    // Load books when the component mounts
    useEffect(() => {
        requestStoragePermission().then((granted: boolean) => {
          if (granted) {
            findEpubFiles();
          } else {
            console.log('Permission not granted');
            setIsLoading(false);
          }
        });
    }, []);
    
    // Also refresh the book list when returning with refreshBooks flag
    useEffect(() => {
        if (route.params?.refreshBooks) {
            console.log('Refreshing book list due to navigation param');
            findEpubFiles();
            
            // Clear the parameter after using it
            navigation.setParams({ refreshBooks: undefined });
        }
    }, [route.params?.refreshBooks]);

    const findDuplicateEpubs = (epubs: EpubFile[]): Map<string, EpubFile[]> => {
        // Group EPUBs by name and size
        const duplicateGroups = new Map<string, EpubFile[]>();
        
        // First, group by title and size
        const groupKey = (epub: EpubFile) => `${epub.title}_${epub.size}`;
        const groupedEpubs = new Map<string, EpubFile[]>();
        
        epubs.forEach(epub => {
            const key = groupKey(epub);
            if (!groupedEpubs.has(key)) {
                groupedEpubs.set(key, []);
            }
            groupedEpubs.get(key)?.push(epub);
        });
        
        // Filter out groups with more than one file (these are potential duplicates)
        for (const [key, group] of groupedEpubs.entries()) {
            if (group.length > 1) {
                duplicateGroups.set(key, group);
            }
        }
        
        return duplicateGroups;
    };
    
    const removeDuplicateEpubs = async (duplicateGroups: Map<string, EpubFile[]>): Promise<number> => {
        let removedCount = 0;
        
        for (const group of duplicateGroups.values()) {
            // Sort by last modified (most recent first)
            group.sort((a, b) => {
                const aTime = a.lastModified || 0;
                const bTime = b.lastModified || 0;
                return bTime - aTime;
            });
            
            // Keep the most recently modified file, delete the rest
            const [keepFile, ...duplicatesToRemove] = group;
            
            // Log which file we're keeping and which we're removing
            console.log(`Keeping: ${keepFile.name} (${keepFile.uri})`);
            
            for (const duplicate of duplicatesToRemove) {
                try {
                    console.log(`Removing duplicate: ${duplicate.name} (${duplicate.uri})`);
                    await RNFS.unlink(duplicate.uri);
                    removedCount++;
                } catch (error) {
                    console.error(`Failed to remove duplicate file ${duplicate.uri}:`, error);
                }
            }
        }
        
        return removedCount;
    };

    const findEpubFiles = async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Only search in app's data directory
            const appDataDirectory = RNFS.DocumentDirectoryPath;
            console.log(`Searching app data directory: ${appDataDirectory}`);

            // Only search the app's data directory
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
                    
                    // Process found EPUBs and extract metadata
                    const processedEpubs = await Promise.all(
                        updatedEpubs.map(async (epub) => {
                            const { title, coverUri } = await extractEpubMetadata(epub.uri);
                            return {
                                ...epub,
                                title: title || epub.name, // Fall back to filename if no title found
                                coverUri
                            };
                        })
                    );
                    
                    setEpubFiles(processedEpubs);
                    if (removedCount === 1) {
                        Alert.alert("Duplicate Removed", `Removed 1 duplicate EPUB file`);
                    } else {
                        Alert.alert("Duplicates Removed", `Removed ${removedCount} duplicate EPUB files`);
                    }
                    setIsLoading(false);
                    return;
                }
            }
            
            console.log(`Found ${epubs.length} EPUB files`);

            // Process found EPUBs and extract metadata
            const processedEpubs = await Promise.all(
                epubs.map(async (epub) => {
                    const { title, coverUri } = await extractEpubMetadata(epub.uri);
                    return {
                        ...epub,
                        title: title || epub.name, // Fall back to filename if no title found
                        coverUri
                    };
                })
            );

            setEpubFiles(processedEpubs);
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

            const files = await RNFS.readDir(directory);
            let results: EpubFile[] = [];

            for (const file of files) {
                if (file.isFile() && file.name.toLowerCase().endsWith(".epub")) {
                    const stat = await RNFS.stat(file.path);
                    results.push({
                        id: file.path,
                        uri: file.path,
                        name: file.name.replace(/\.epub$/i, ""),
                        title: file.name.replace(/\.epub$/i, ""), // Default to filename, will update with real title later
                        coverUri: null,
                        size: stat.size,
                        lastModified: stat.mtime?.getTime()
                    });
                } else if (file.isDirectory()) {
                    try {
                        const subResults = await searchDirectoryForEpubs(file.path, maxDepth - 1);
                        results = [...results, ...subResults];
                    } catch (e) {
                        // Skip inaccessible directories
                        console.log(`Skipping directory ${file.path}: ${e}`);
                    }
                }
            }

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
                    const basePath = opfPath.substring(0, opfPath.lastIndexOf('/'));
                    const fullCoverPath = `${basePath}/${coverPath}`;
                    console.log('Full cover image path:', fullCoverPath);
                    
                    // Check if cover file exists
                    const coverExists = await RNFS.exists(fullCoverPath);
                    if (!coverExists) {
                        console.error('Cover file does not exist at path:', fullCoverPath);
                    } else {
                        // Create a cached copy of the cover image
                        const coverExt = coverPath.split('.').pop() || 'jpg';
                        const cachedCoverPath = `${RNFS.CachesDirectoryPath}/book_cover_${timestamp}.${coverExt}`;
                        console.log('Copying cover to cache:', cachedCoverPath);
                        await RNFS.copyFile(fullCoverPath, cachedCoverPath);
                        coverUri = cachedCoverPath;
                        console.log('Successfully cached cover image at:', cachedCoverPath);
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
    
    // Kept for compatibility, now delegates to extractEpubMetadata
    const extractCoverImage = async (epubUri: string): Promise<string | null> => {
        const { coverUri } = await extractEpubMetadata(epubUri);
        return coverUri;
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

    const openBook = (item: EpubFile) => {
        navigation.navigate('Reader', { fileUri: item.uri });
    };

    const renderEpubItem = ({ item }: { item: EpubFile }) => (
        <TouchableOpacity 
            style={styles.bookItem} 
            onPress={() => openBook(item)}
        >
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
            <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
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
