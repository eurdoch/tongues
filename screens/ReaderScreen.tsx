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
import { parseHtml } from '../parser/EpubContentParser';
import GestureText from '../GestureText';
import { EpubHtmlRenderer } from '../ElementRenderer';
import TranslationModal from '../components/TranslationModal';
import { useNavigationContext } from '../NavigationContext';
import { RouteProp } from '@react-navigation/native';
import ReadAlongModal from '../components/ReadAlongModal';
import { extractSentences } from '../parser/Sentences';
import LanguageSelectorModal from '../components/LanguageSelectorModal';
import { SupportedLanguages } from '../types/Language';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ReaderScreenRouteProp = RouteProp<RootStackParamList, 'Reader'>;

type ReaderProps = {
  route: ReaderScreenRouteProp;
  navigation: any,
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
  const [readAlongVisible, setReadAlongVisible] = useState<boolean>(false);
  const { currentBook, setCurrentBook } = useNavigationContext();

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

      const parsedContent = parseHtml(route.params.content); 
      setContent(parsedContent);
      const sentences = extractSentences(parsedContent);
      setSentences(sentences);

      setIsLoading(false);

      if (currentBook && !currentBook.language) {
        setLanguageSelectorVisible(true);
      }
    }

    updateReader();
  }, [route.params.content, currentBook, setCurrentBook]);

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
  }, [route.params.content]);

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
      <EpubHtmlRenderer content={content} />
      
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
            section={route.params.section}
          />
      }

      { currentBook &&
        <LanguageSelectorModal
          visible={languageSelectorVisible}
          supportedLanguages={SupportedLanguages}
          onClose={() => {
            if (currentBook.language) {
              setLanguageSelectorVisible(false);
            }
          }}
          onSelectLanguage={handleLanguageSelect}
        />
      }
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
});

export default ReaderScreen;
