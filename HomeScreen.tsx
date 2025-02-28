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
import { useNavigation } from "@react-navigation/native";
import * as ZipArchive from 'react-native-zip-archive';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';

interface EpubFile {
    id: string;
    uri: string;
    name: string;
    coverUri: string | null;
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

    useEffect(() => {
        requestStoragePermission().then((granted: boolean) => {
          if (granted) {
            findEpubFiles();
          } else {
            console.log('Permission not granted you loser.');
          }
        });

    }, []);

    const findEpubFiles = async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Define directories to search in
            const directories = [
                RNFS.DocumentDirectoryPath,
                RNFS.DownloadDirectoryPath,
                RNFS.ExternalDirectoryPath,
                RNFS.ExternalStorageDirectoryPath
            ].filter(Boolean); // Filter out undefined directories

            let allEpubs: EpubFile[] = [];
            const foundPaths = new Set<string>(); // Track unique paths

            // Search each directory recursively
            for (const directory of directories) {
                if (directory) {
                    console.log(`Searching directory: ${directory}`);
                    const epubs = await searchDirectoryForEpubs(directory);
                    
                    // Only add unique EPUBs that haven't been found in other directories
                    for (const epub of epubs) {
                        if (!foundPaths.has(epub.uri)) {
                            foundPaths.add(epub.uri);
                            allEpubs.push(epub);
                        }
                    }
                }
            }

            console.log(`Found ${allEpubs.length} unique EPUB files`);

            // Process found EPUBs and extract covers
            const processedEpubs = await Promise.all(
                allEpubs.map(async (epub) => {
                    const coverUri = await extractCoverImage(epub.uri);
                    return {
                        ...epub,
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
                    results.push({
                        id: file.path,
                        uri: file.path,
                        name: file.name.replace(/\.epub$/i, ""),
                        coverUri: null
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

    const extractCoverImage = async (epubUri: string): Promise<string | null> => {
        try {
            // Create a unique temp directory for extraction
            const timestamp = Date.now();
            const tempDir = `${RNFS.CachesDirectoryPath}/temp_extract_${timestamp}`;
            await RNFS.mkdir(tempDir);

            // Extract the EPUB
            const extractedPath = await ZipArchive.unzip(epubUri, tempDir);

            // Find the OPF file
            const opfPath = await findOpfFile(extractedPath);
            if (!opfPath) {
                await RNFS.unlink(tempDir);
                return null;
            }

            // Read the OPF file to find cover image reference
            const opfContent = await RNFS.readFile(opfPath, 'utf8');
            
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
            
            if (match) {
                const coverPath = match[1];
                const basePath = opfPath.substring(0, opfPath.lastIndexOf('/'));
                const fullCoverPath = `${basePath}/${coverPath}`;
                
                // Create a cached copy of the cover image
                const coverExt = coverPath.split('.').pop() || 'jpg';
                const cachedCoverPath = `${RNFS.CachesDirectoryPath}/book_cover_${timestamp}.${coverExt}`;
                await RNFS.copyFile(fullCoverPath, cachedCoverPath);
                
                // Clean up temp extraction directory
                await RNFS.unlink(tempDir);
                
                return cachedCoverPath;
            }
            
            // Clean up if no cover found
            await RNFS.unlink(tempDir);
            return null;
        } catch (error) {
            console.error("Error extracting cover:", error);
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
            <Text style={styles.bookTitle} numberOfLines={2}>{item.name}</Text>
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
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Your Books</Text>
                <TouchableOpacity 
                    style={styles.refreshButton}
                    onPress={findEpubFiles}
                >
                    <Text style={styles.refreshButtonText}>Refresh</Text>
                </TouchableOpacity>
            </View>
            
            {epubFiles.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No EPUB files found</Text>
                    <Text style={styles.emptySubText}>
                        Add EPUB files to your device and they will appear here
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e1e4e8',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    refreshButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#1a73e8',
        borderRadius: 6,
    },
    refreshButtonText: {
        color: 'white',
        fontWeight: '500',
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
