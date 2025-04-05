import React, { useEffect, useLayoutEffect, useState } from 'react';
import { 
  View, 
  StyleSheet, 
  ActivityIndicator,
  TouchableOpacity,
  Text, 
} from 'react-native';
import Sound from 'react-native-sound';
import { RootStackParamList } from '../App';
import { ElementNode } from '../types/ElementNode';
import GestureText from '../GestureText';
import TranslationModal from '../components/TranslationModal';
import { useNavigationContext } from '../NavigationContext';
import { NavigationProp, RouteProp } from '@react-navigation/native';
import ReadAlongModal from '../components/ReadAlongModal';
import { extractSentences } from '../parser/Sentences';
import LanguageSelectorModal from '../components/LanguageSelectorModal';
import ContentRenderer from '../ContentRenderer';

type ReaderScreenRouteProp = RouteProp<RootStackParamList, 'Reader'>;
type ReaderScreenNavigationProp = NavigationProp<RootStackParamList, 'Reader'>;

type ReaderProps = {
  route: ReaderScreenRouteProp;
  navigation: ReaderScreenNavigationProp;
};

function ReaderScreen({ route, navigation }: ReaderProps) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOriginalText, setSelectedOriginalText] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [sound, setSound] = useState<Sound | null>(null);
  const [languageSelectorVisible, setLanguageSelectorVisible] = useState<boolean>(false);
  const [content, setContent] = useState<ElementNode[]>([]);
  const [sentences, setSentences] = useState<string[]>([]);
  const [contentStylesheets, setContentStylesheets] = useState<any>(null);
  const [readAlongVisible, setReadAlongVisible] = useState<boolean>(false);
  const [scrollToNavId, setScrollToNavId] = useState<string | null>(null);
  const { currentBook, setCurrentBook, isBookLoading } = useNavigationContext();

  useEffect(() => {
    console.log('[ReaderScreen] MOUNTED - component mounted');

    return () => {
      console.log('[ReaderScreen] UNMOUNTED - component will unmount');
    };
  }, []);

  useEffect(() => {
    const updateReader = async () => {
      // Check for pending book from direct file open
      if (global.pendingBook && !currentBook) {
        console.log('[ReaderScreen] Found pending book, setting in context');
        setCurrentBook(global.pendingBook);
        global.pendingBook = null;
      }

      if (route.params.book.content) {
        setContent(route.params.book.content);
        const sentences = extractSentences(route.params.book.content);
        setSentences(sentences);
        setContentStylesheets(route.params.book.styleSheets);
        
        // Check if we have a navId to scroll to from route params
        if (route.params.navId) {
          // Store navId in a variable to ensure it's not undefined later
          const navIdToScrollTo = route.params.navId;
          
          // Clear current value first to ensure the change is detected even if navigating to same ID
          setScrollToNavId(null);
          
          // Use a small delay to ensure state update has propagated
          setTimeout(() => {
            console.log(`[ReaderScreen] Setting scroll to navId: ${navIdToScrollTo}`);
            setScrollToNavId(navIdToScrollTo);
          }, 50);
        }
        
        if (!route.params.book.language) {
          setLanguageSelectorVisible(true);
        }
      } else {
        console.error('[ReaderScreen] No content available to display');
        setError('No content available to display');
      }

      setIsLoading(false);
    }

    updateReader();
  }, [route.params.book, route.params.navId]);

  const handleLanguageSelect = (language: string) => {
    setCurrentBook({
      ...currentBook!,
      language,
    })
  };

  const handleReadAlong = (e: any) => {
    e.preventDefault();
    setReadAlongVisible(true);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity 
          onPress={handleReadAlong}
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>Read Along</Text>
        </TouchableOpacity>
      )
    })
  }, [route.params.book]);

  // Play the audio file
  const playAudio = () => {
    if (sound) {
      setIsPlaying(true);
      sound.play((success) => {
        if (success) {
          console.log('Audio playback finished successfully');
        } else {
          console.log('Audio playback failed');
        }
        setIsPlaying(false);
      });
    }
  };
  
  // Stop audio playback
  const stopAudio = () => {
    if (sound) {
      sound.stop();
      setIsPlaying(false);
    }
  };

  const clearSelection = () => {}
  
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <GestureText 
          style={styles.errorText}
          selectable={false}
        >
          {error}
        </GestureText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ContentRenderer 
        content={content} 
        contentStylesheets={contentStylesheets}
        scrollToNavId={scrollToNavId}
      />
      
      { currentBook &&
        <TranslationModal
          visible={!!translatedText && !!selectedOriginalText}
          originalText={selectedOriginalText}
          translatedText={translatedText}
          language={currentBook.language}
          sound={sound}
          isPlaying={isPlaying}
          onClose={clearSelection}
          onPlayAudio={playAudio}
          onStopAudio={stopAudio}
        />
      }

      { currentBook && 
          <ReadAlongModal
            visible={readAlongVisible}
            onClose={() => setReadAlongVisible(false)}
            language={currentBook.language}
            sentences={sentences}
          />
      }


      { currentBook &&
        <LanguageSelectorModal
          visible={languageSelectorVisible}
          onClose={() => {
            if (currentBook.language) {
              setLanguageSelectorVisible(false);
            }
          }}
          onSelectLanguage={handleLanguageSelect}
        />
      }
      
      {/* Book loading overlay */}
      {isBookLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#1a73e8" />
            <Text style={styles.bookLoadingText}>Opening book...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  headerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  headerButtonText: {
    color: '#1a73e8',
    fontSize: 16,
    fontWeight: '600',
  },
  bookHeaderContainer: {
    marginBottom: 40,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    alignItems: 'center',
  },
  bookTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  bookAuthor: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  sectionContainer: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#e53935',
    textAlign: 'center',
    padding: 20,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  bookLoadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
});

export default ReaderScreen;
