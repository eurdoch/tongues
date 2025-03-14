import React, { useEffect, useState } from 'react';
import { 
  View, 
  StyleSheet, 
  FlatList,
  ActivityIndicator, 
  Text
} from 'react-native';
import GestureText from './GestureText';
import Sound from 'react-native-sound';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from './App';

const supportedLanguages = [
  'French',
  'Spanish',
  'German',
  'Italian',
  'Dutch',
];

type ProfileScreenRouteProp = RouteProp<RootStackParamList, 'Reader'>;

type ProfileProps = {
  route: ProfileScreenRouteProp;
};

function ReaderScreen({ route }: any) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [selectedOriginalText, setSelectedOriginalText] = useState<string | null>(null);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [sound, setSound] = useState<Sound | null>(null);
  const [languageSelectorVisible, setLanguageSelectorVisible] = useState<boolean>(false);
  const [content, setContent] = useState<string>("");

  useEffect(() => {
    console.log('[ReaderScreen] MOUNTED - component mounted');

    return () => {
      console.log('[ReaderScreen] UNMOUNTED - component will unmount');
    };
  }, []);

  useEffect(() => {
    setContent(route.params.content);
  }, [route.params.content]);
  
  // Helper function to decode HTML entities
  const decodeHtmlEntities = (text: string) => {
    if (!text) return '';
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&ndash;/g, '–')
      .replace(/&mdash;/g, '—')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
      .replace(/&#x([0-9A-F]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  };

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
  
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#1a73e8" />
        <GestureText 
          style={styles.loadingText}
          selectable={false}
        >
          Loading your book...
        </GestureText>
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
      <Text>{content}</Text>
      <FlatList
        data={[{'id': 'helo'}]}
        renderItem={({ item, index }) => <View>Hello</View>}
        keyExtractor={(item) => item.id}
        style={styles.scrollView}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={false}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          // Clear selections when scrolling
          if (selectedOriginalText || translatedText) {
            //clearSelection();
          }
        }}
      />
      
      {/* Translation result popup */}
      {/* <TranslationModal
        visible={!!translatedText && !!selectedOriginalText}
        originalText={selectedOriginalText}
        translatedText={translatedText}
        language={selectedLanguage}
        sound={sound}
        isPlaying={isPlaying}
        onClose={clearSelection}
        onPlayAudio={playAudio}
        onStopAudio={stopAudio}
      /> */}


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
