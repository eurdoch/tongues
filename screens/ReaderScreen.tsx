import React, { useEffect, useState } from 'react';
import { 
  View, 
  StyleSheet, 
  ActivityIndicator, 
} from 'react-native';
import GestureText from './GestureText';
import Sound from 'react-native-sound';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from './App';
import { parseHtml } from './parser/EpubContentParser';
import { ElementNode } from './types/ElementNode';
import { EpubHtmlRenderer } from './ElementRenderer';
import TranslationModal from './components/TranslationModal';

const supportedLanguages = [
  'French',
  'Spanish',
  'German',
  'Italian',
  'Dutch',
];

type ReaderScreenRouteProp = RouteProp<RootStackParamList, 'Reader'>;

type ReaderProps = {
  route: ReaderScreenRouteProp;
};

function ReaderScreen({ route }: ReaderProps) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [selectedOriginalText, setSelectedOriginalText] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [sound, setSound] = useState<Sound | null>(null);
  const [languageSelectorVisible, setLanguageSelectorVisible] = useState<boolean>(false);
  const [content, setContent] = useState<ElementNode[]>([]);

  useEffect(() => {
    console.log('[ReaderScreen] MOUNTED - component mounted');

    return () => {
      console.log('[ReaderScreen] UNMOUNTED - component will unmount');
    };
  }, []);

  useEffect(() => {
    const parsedContent = parseHtml(route.params.content); 
    setContent(parsedContent);
    setIsLoading(false);
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
      
      <TranslationModal
        visible={!!translatedText && !!selectedOriginalText}
        originalText={selectedOriginalText}
        translatedText={translatedText}
        language={selectedLanguage}
        sound={sound}
        isPlaying={isPlaying}
        onClose={clearSelection}
        onPlayAudio={playAudio}
        onStopAudio={stopAudio}
      />


      {/* Read Along Modal */}
      {/* <ReadAlongModal
        visible={readAlongVisible}
        onClose={() => setReadAlongVisible(false)}
        language={selectedLanguage}
        sentences={contentSentences}
        bookId={fileUri?.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '') || ''}
      /> */}


      {/* Language Selector Modal 
      <LanguageSelectorModal
        visible={languageSelectorVisible}
        supportedLanguages={supportedLanguages}
        onClose={() => {
          // If user closes without selecting, default to French
          setSelectedLanguage('French');
          setLanguageSelectorVisible(false);
          setIsLoading(false);
        }}
        onSelectLanguage={handleLanguageSelect}
      />*/}
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
