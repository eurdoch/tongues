import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableWithoutFeedback,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { fetchSpeechAudio, fetchWordTimestamps, translateText } from './reader/TranslationService';
import Sound from 'react-native-sound';

interface TimestampMark {
  time: number;
  type: string; 
  start: number;
  end: number;
  value: string;
}

interface SentenceData {
  sound: Sound;
  timestamps: TimestampMark[];
  words: string[];
}

interface ReadAlongModalProps {
  visible: boolean;
  onClose: () => void;
  language: string;
  sentences: string[];
}

const ReadAlongModal: React.FC<ReadAlongModalProps> = ({
  visible,
  language,
  onClose,
  sentences,
}) => {
  const [words, setWords] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [highlightIndex, setHighlightIndex] = useState<number>(0);
  const [selectedWordTranslation, setSelectedWordTranslation] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const soundRef = useRef<Sound | null>(null);
  const currentSentenceIndex = useRef<number>(0);
  const currentInterval = useRef<any>(null);
  const currentTimestamps = useRef<TimestampMark[]>([]);
  const nextSentenceData = useRef<SentenceData | null>(null);
  const isPreloading = useRef<boolean>(false);

  // Add a debug log at the start of your interval to confirm it's running
  useEffect(() => {
    console.log('Setting up interval');
    
    if (visible) {
      const interval = setInterval(() => {
        if (soundRef.current) {
          soundRef.current.getCurrentTime((seconds, _isPlaying) => {
            const milliseconds = seconds * 1000;
            for (let index = highlightIndex; index < currentTimestamps.current.length; index++) {
              if (currentTimestamps.current.length === index + 1) {
                setHighlightIndex(index);
                break;
              } else if (currentTimestamps.current[index].time > milliseconds) {
                setHighlightIndex(index-1);
                break;
              }
            }
          });
        }
      }, 100);

      currentInterval.current = interval;
    } else {
      console.log('Cleaning up interval');
      if (currentInterval.current) {
        clearInterval(currentInterval.current);
      }
    }
  }, [visible]);

  const handleClose = async () => {
    setWords([]);
    setIsPlaying(false);
    setHighlightIndex(0);
    setSelectedWordTranslation('');
    currentTimestamps.current = [];
    currentSentenceIndex.current = 0;
    
    // Clean up current sound
    if (soundRef.current) {
      soundRef.current.pause();
      soundRef.current.release();
    }
    
    // Clean up next sound if it exists
    if (nextSentenceData.current?.sound) {
      nextSentenceData.current.sound.release();
      nextSentenceData.current = null;
    }
    
    onClose();
  }

  // Function to preload the next sentence data
  const preloadNextSentence = async (nextIndex: number): Promise<void> => {
    // Don't preload if we're already preloading or if there's no next sentence
    if (isPreloading.current || nextIndex >= sentences.length) {
      return;
    }
    
    isPreloading.current = true;
    console.log(`Preloading sentence ${nextIndex}`);
    
    try {
      const timestamps = await fetchWordTimestamps(sentences[nextIndex], language);
      const speech = await fetchSpeechAudio(sentences[nextIndex], language);
      const words = sentences[nextIndex].split(' ');
      
      nextSentenceData.current = {
        sound: speech.sound,
        timestamps,
        words
      };
      
      console.log(`Preloaded sentence ${nextIndex} successfully`);
    } catch (error) {
      console.error(`Error preloading sentence ${nextIndex}:`, error);
      nextSentenceData.current = null;
    } finally {
      isPreloading.current = false;
    }
  };

  const handleNextSentencePlay = async (currentIndex: number) => {
    const next = currentIndex + 1;
    
    // Check if we've reached the end of sentences
    if (next >= sentences.length) {
      console.log('Reached the end of all sentences');
      return;
    }
    
    currentSentenceIndex.current = next;
    setHighlightIndex(0);
    
    // If we have preloaded data for the next sentence, use it
    if (nextSentenceData.current) {
      console.log(`Using preloaded data for sentence ${next}`);
      currentTimestamps.current = nextSentenceData.current.timestamps;
      setWords(nextSentenceData.current.words);
      
      // Clean up previous sound if it exists
      if (soundRef.current) {
        soundRef.current.release();
      }
      
      soundRef.current = nextSentenceData.current.sound;
      nextSentenceData.current = null;
      
      // Start preloading the sentence after this one
      if (next + 1 < sentences.length) {
        preloadNextSentence(next + 1);
      }
      
      soundRef.current.play((success) => {
        if (success) {
          console.log(`Sentence ${next} finished playing.`);
          handleNextSentencePlay(next);
        }
      });
    } else {
      // If we don't have preloaded data, load it now
      console.log(`Loading sentence ${next} data on demand`);
      const timestamps = await fetchWordTimestamps(sentences[next], language);
      currentTimestamps.current = timestamps;
      const speech = await fetchSpeechAudio(sentences[next], language);
      setWords(sentences[next].split(' '));
      
      // Clean up previous sound if it exists
      if (soundRef.current) {
        soundRef.current.release();
      }
      
      soundRef.current = speech.sound;
      
      // Start preloading the sentence after this one
      if (next + 1 < sentences.length) {
        preloadNextSentence(next + 1);
      }
      
      soundRef.current.play((success) => {
        if (success) {
          console.log(`Sentence ${next} finished playing.`);
          handleNextSentencePlay(next);
        }
      });
    }
  }

  const handleStart = async (_e: any) => {
    setWords(sentences[0].split(' '));
    setHighlightIndex(0);
    setSelectedWordTranslation('');
    //const translation = await translateText(sentences[0], language);
    const timestamps: TimestampMark[] = await fetchWordTimestamps(sentences[0], language);
    currentTimestamps.current = timestamps;
    console.log('Timestamps: ', timestamps);
    const speech = await fetchSpeechAudio(sentences[0], language);
    soundRef.current = speech.sound;
    
    // Preload the next sentence while the first one is playing
    if (sentences.length > 1) {
      preloadNextSentence(1);
    }

    setIsPlaying(true);
    // TODO handle errors where soundRef.current is null ?
    soundRef.current.play((success) => {
      if (success) {
        console.log(`Sentence 0 finished playing.`);
        handleNextSentencePlay(0);
      }
    });
  }

  const handleTogglePlay = (_e: any) => {
    if (soundRef.current) {
      if (isPlaying) {
        soundRef.current.pause();
        setIsPlaying(false);
      } else {
        soundRef.current.play((success) => {
          if (success) {
            console.log(`Sentence ${currentSentenceIndex.current} finished playing.`);
            handleNextSentencePlay(currentSentenceIndex.current);
          }
        });
        setIsPlaying(true);
        
        // If we're resuming and don't have the next sentence preloaded, start preloading
        const nextIndex = currentSentenceIndex.current + 1;
        if (nextIndex < sentences.length && !nextSentenceData.current && !isPreloading.current) {
          preloadNextSentence(nextIndex);
        }
      }
    }
  }

  const handleWordClick = async (word: string, index: number) => {
    // Pause the audio
    if (soundRef.current && isPlaying) {
      soundRef.current.pause();
      setIsPlaying(false);
    }
    
    // Set the highlight to the clicked word
    setHighlightIndex(index);
    
    // Get translation for the word
    setIsTranslating(true);
    try {
      const translation = await translateText(word, language);
      setSelectedWordTranslation(translation);
    } catch (error) {
      console.error('Error translating word:', error);
      setSelectedWordTranslation('Translation error');
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.container}>
              <ScrollView style={styles.contentContainer}>
                <View style={styles.textSection}>
                  {words.map((word, index) => (
                    <TouchableOpacity 
                      key={index} 
                      onPress={() => handleWordClick(word, index)}
                    >
                      <Text 
                        style={(highlightIndex === index) ? [styles.originalText, styles.highlightedWord] : styles.originalText}
                      >
                        {word}{' '}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              
              <View style={styles.controls}>
                <TouchableOpacity
                  onPress={handleStart}
                  style={styles.controlButton}
                >
                  <Text style={styles.controlButtonText}>
                    {'Start'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleTogglePlay}
                  style={styles.controlButton}
                >
                  <Text style={styles.controlButtonText}>
                    {isPlaying ? 'Pause' : 'Play'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              {(isTranslating || selectedWordTranslation) && (
                <View style={styles.translationContainer}>
                  {isTranslating ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <Text style={styles.translatedText}>
                      {selectedWordTranslation}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>

  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#2A2A2A',
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  header: {
    backgroundColor: 'rgba(0, 122, 255, 0.95)',
    paddingVertical: 15,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  playButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 15,
    fontSize: 16,
  },
  errorText: {
    color: '#FF6B6B',
    textAlign: 'center',
    padding: 30,
    fontSize: 16,
  },
  contentContainer: {
    padding: 20,
    maxHeight: '70%',
  },
  textSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#007AFF',
    fontSize: 16,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  highlightContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: 10,
    borderRadius: 8,
  },
  originalText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 38,
  },
  word: {
    color: '#FFFFFF',
  },
  highlightedWord: {
    color: '#00ff00',
    fontWeight: 'bold',
  },
  translationContainer: {
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  translatedText: {
    color: '#E0E0E0',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: 10,
    borderRadius: 8,
    width: '100%',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  navButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.4)',
    minWidth: 80,
  },
  controlButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
  },
  speedButton: {
    backgroundColor: 'rgba(255, 193, 7, 0.8)',
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  progressSection: {
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  progressText: {
    color: '#E0E0E0',
    fontSize: 14,
    marginBottom: 5,
    textAlign: 'center',
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
  },
});

export default ReadAlongModal;

