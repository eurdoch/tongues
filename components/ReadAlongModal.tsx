import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableWithoutFeedback,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { fetchSpeechAudio, fetchWordTimestamps, translateText, explainWord } from '../services/TranslationService';
import Sound from 'react-native-sound';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TimestampMark from '../types/TimestampMark';
import SentenceData from '../types/SentenceData';
import TranslationPopup from './TranslationPopup';

interface ReadAlongModalProps {
  visible: boolean;
  onClose: () => void;
  language: string;
  sentences: string[];
  initialSentenceIndex?: number;
}

const ReadAlongModal: React.FC<ReadAlongModalProps> = ({
  visible,
  language,
  onClose,
  sentences,
}) => {
  const [highlightIndex, setHighlightIndex] = useState<number>(0);
  const [selectedWord, setSelectedWord] = useState<string>('');
  const [selectedWordTranslation, setSelectedWordTranslation] = useState<string>('');
  const [selectedWordExplanation, setSelectedWordExplanation] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isExplaining, setIsExplaining] = useState<boolean>(false);
  const [showTranslationPopup, setShowTranslationPopup] = useState<boolean>(false);
  const [selectionMode, setSelectionMode] = useState<boolean>(false);
  const [selectedWords, setSelectedWords] = useState<{word: string, index: number}[]>([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const soundRef = useRef<Sound | null>(null);
  const currentInterval = useRef<any>(null);
  const currentTimestamps = useRef<TimestampMark[]>([]);
  const nextSentenceData = useRef<SentenceData | null>(null);
  const isPreloading = useRef<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  const saveReadingPosition = async (index: number) => {
    try {
      const key = `read_along_current_index`;
      await AsyncStorage.setItem(key, index.toString());
      console.log(`[ReadAlongModal] Saved reading position: sentence ${index}`);
    } catch (error) {
      console.error('[ReadAlongModal] Error saving reading position:', error);
    }
  };

  // Initialize with the selected sentence when the modal becomes visible
  useEffect(() => {
    const initializeModal = async () => {
      if (visible && sentences.length > 0) {
        try {
          // Get stored position or default to first sentence
          const storedIndex = await AsyncStorage.getItem("read_along_current_index");
          const parsedIndex = storedIndex ? parseInt(storedIndex) : 0;
          const validIndex = isNaN(parsedIndex) || parsedIndex >= sentences.length ? 0 : parsedIndex;
          
          setCurrentSentenceIndex(validIndex);
          setHighlightIndex(0); // Reset highlight when loading a new sentence
          
          // Clear any previous audio and timestamps
          if (soundRef.current) {
            soundRef.current.release();
            soundRef.current = null;
          }
          
          currentTimestamps.current = [];
          
          // Load current sentence
          const sentence = sentences[validIndex];
          console.log(`[ReadAlongModal] Loading sentence ${validIndex}: "${sentence.substring(0, 30)}..."`);
          
          // Fetch timestamps and audio in parallel
          const [timestamps, speech] = await Promise.all([
            fetchWordTimestamps(sentence, language),
            fetchSpeechAudio(sentence, language)
          ]);
          
          // Set the timestamps
          currentTimestamps.current = timestamps;
          console.log('[ReadAlongModal] Timestamps loaded:', timestamps.length);
          
          // Set the sound
          if (speech && speech.sound) {
            soundRef.current = speech.sound;
            // Configure sound
            soundRef.current.setVolume(1.0);
            soundRef.current.setSpeed(playbackSpeed);
          } else {
            console.error('[ReadAlongModal] Failed to load audio');
          }
        } catch (error) {
          console.error('[ReadAlongModal] Error loading sentence:', error);
        }
      }
    }

    initializeModal();
  }, [sentences]);

  const handleTogglePlay = (e: any) => {
    e.preventDefault();
    
    if (soundRef.current) {
      if (!isPlaying) {
        // Reset highlight index when starting playback from beginning
        if (soundRef.current.getCurrentTime) {
          soundRef.current.getCurrentTime((seconds) => {
            if (seconds < 0.1) {
              setHighlightIndex(0);
            }
          });
        }

        // Start playback
        soundRef.current.play((success: boolean) => {
          if (success) {
            console.log('[ReadAlongModal] Sound finished playing successfully');
          } else {
            console.error('[ReadAlongModal] Sound playback encountered an error');
          }
          // Automatically set playing to false when done
          setIsPlaying(false);
        });
        
        setIsPlaying(true);
      } else {
        // Pause playback
        soundRef.current.pause();
        setIsPlaying(false);
      }
    } else {
      console.error('[ReadAlongModal] Cannot play sound - sound object not initialized');
    }
  }

  // Set up the interval for tracking word highlighting
  useEffect(() => {
    console.log('Setting up interval');
    
    if (visible) {
      const interval = setInterval(() => {
        if (soundRef.current && currentTimestamps.current) {
          soundRef.current.getCurrentTime((seconds, _isPlaying) => {
            const milliseconds = seconds * 1000;
            for (let index = highlightIndex; index < currentTimestamps.current.length; index++) {
              //console.log('DEBUG currentTimestamps: ', currentTimestamps.current[index]);
              if (currentTimestamps.current.length === index + 1) {
                setHighlightIndex(index);
                break;
              } else if (currentTimestamps.current[index] && currentTimestamps.current[index].time > milliseconds) {
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
  }, [visible, highlightIndex]);

  const handleClose = async () => {
    setIsPlaying(false);
    setHighlightIndex(0);
    setSelectedWord('');
    setSelectedWordTranslation('');
    setSelectedWordExplanation('');
    setShowTranslationPopup(false);
    setSelectionMode(false);
    setSelectedWords([]);
    currentTimestamps.current = [];
    setCurrentSentenceIndex(0);
    
    if (soundRef.current) {
      soundRef.current.pause();
      soundRef.current.release();
    }
    
    if (nextSentenceData.current?.sound) {
      nextSentenceData.current.sound.release();
      nextSentenceData.current = null;
    }
    
    onClose();
  }

  const handleSlowDown = () => {
    if (soundRef.current) {
      // Don't go below 0.5x speed
      const newSpeed = Math.max(0.5, playbackSpeed - 0.5);
      setPlaybackSpeed(newSpeed);
      soundRef.current.setSpeed(newSpeed);
      console.log(`[ReadAlongModal] Playback speed set to ${newSpeed}x`);
    }
  };

  const handleWordLongPress = (word: string, index: number) => {
    // If playing audio, pause it during selection
    if (soundRef.current && isPlaying) {
      soundRef.current.pause();
      setIsPlaying(false);
    }
    
    // Enter selection mode
    setSelectionMode(true);
    
    // Add the long-pressed word to selection (or if it's already there, this is the only selected word)
    setSelectedWords([{ word, index }]);
    
    // Set highlight to the selected word
    setHighlightIndex(index);
  };

  const handleTranslateSelected = async () => {
    if (selectedWords.length === 0) return;
    
    const sortedWords = [...selectedWords].sort((a, b) => a.index - b.index);
    const wordText = sortedWords.map(item => item.word).join(' ');
    
    setSelectedWord(wordText);
    
    setSelectedWordTranslation('');
    setSelectedWordExplanation('');
    
    setIsTranslating(true);
    try {
      const translation = await translateText(wordText, language);
      setSelectedWordTranslation(translation);
      setShowTranslationPopup(true);
    } catch (error) {
      console.error('Error translating phrase:', error);
      setSelectedWordTranslation('Translation error');
      setShowTranslationPopup(true);
    } finally {
      setIsTranslating(false);
    }
  };

  // Create long press gesture for each word
  const longPressGesture = Gesture.LongPress()
    .minDuration(500) // 500ms for long press
    .onStart(({ x, y }) => {
      // This is handled in the component directly
    });

  const handleExplainWord = (e: any) => {
    console.log('handleExplainWord');
  }

  const handleWordClick = (word: string, index: number, event: any) => {
    event.preventDefault();
    
    // If we're in selection mode, add this word to the selection
    if (selectionMode) {
      // Check if the word is already selected
      const isAlreadySelected = selectedWords.some(item => item.index === index);
      
      if (isAlreadySelected) {
        // Remove the word if it's already selected
        setSelectedWords(selectedWords.filter(item => item.index !== index));
      } else {
        // Add the word to the selection
        setSelectedWords([...selectedWords, { word, index }]);
      }
    } else {
      // If not in selection mode, just translate the single word
      setSelectedWord(word);
      setSelectedWords([{ word, index }]);
      
      // Translate the word
      setIsTranslating(true);
      translateText(word, language)
        .then(translation => {
          setSelectedWordTranslation(translation);
          setShowTranslationPopup(true);
        })
        .catch(error => {
          console.error('Error translating word:', error);
          setSelectedWordTranslation('Translation error');
          setShowTranslationPopup(true);
        })
        .finally(() => {
          setIsTranslating(false);
        });
    }
  }
    
  return (
    <>
      <Modal
        transparent
        visible={visible}
        animationType="fade"
        onRequestClose={handleClose}
      >
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.container} testID="readAlongContainer">
                {/* Current sentence section */}
                <View style={styles.sentenceContainer}>
                  <View style={styles.textSection}>
                    {sentences[currentSentenceIndex].split(' ').map((word, index) => {
                      // Check if word is in selected words
                      const isSelected = selectedWords.some(item => item.index === index);
                      const textStyle = [
                        styles.originalText,
                        (highlightIndex === index && !selectionMode) && styles.highlightedWord,
                        isSelected && styles.selectedWord
                      ];
                      return (
                        <GestureDetector 
                          key={index}
                          gesture={longPressGesture}
                        >
                          <TouchableOpacity 
                            onPress={(event) => handleWordClick(word, index, event)}
                            onLongPress={() => handleWordLongPress(word, index)}
                            delayLongPress={500}
                            activeOpacity={0.7}
                          >
                            <Text style={textStyle}>
                              {word}{' '}
                            </Text>
                          </TouchableOpacity>
                        </GestureDetector>
                      );
                    })}
                  </View>
                </View>
                
                {/* Selection mode controls */}
                {selectionMode && (
                  <View style={styles.selectionControls}>
                    <TouchableOpacity
                      onPress={() => {
                        setSelectionMode(false);
                        setSelectedWords([]);
                      }}
                      style={[styles.controlButton, styles.cancelButton]}
                    >
                      <Text style={styles.controlButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      onPress={handleTranslateSelected}
                      style={styles.controlButton}
                      disabled={selectedWords.length === 0}
                    >
                      <Text style={styles.controlButtonText}>Translate Selected</Text>
                    </TouchableOpacity>
                  </View>
                )}
                
                {/* Playback controls */}
                {!selectionMode && (
                  <View style={styles.controls}>
                    <TouchableOpacity
                      onPress={handleTogglePlay}
                      style={styles.controlButton}
                    >
                      <Icon
                        name={isPlaying ? 'pause' : 'play'} 
                        color="#FFFFFF"
                        size={18} 
                        style={{marginRight: 6}}
                      />
                    </TouchableOpacity>
                    
                    {/* <TouchableOpacity
                      onPress={handleSlowDown}
                      style={[styles.controlButton, styles.speedButton]}
                    >
                      <Icon
                        name="backward" 
                        color="#FFFFFF"
                        size={18} 
                        style={{marginRight: 6}}
                      />
                      <Text style={styles.controlButtonText}>
                        Slow Down ({playbackSpeed}x)
                      </Text>
                    </TouchableOpacity> */}
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      
      <TranslationPopup
        visible={showTranslationPopup}
        onClose={() => {
          setShowTranslationPopup(false);
          setSelectionMode(false);
          setSelectedWords([]);
        }}
        isTranslating={isTranslating}
        text={selectedWord}
        translation={selectedWordTranslation}
        isExplaining={isExplaining}
        selectedWordExplanation={selectedWordExplanation}
        handleExplainWord={handleExplainWord}
      />
    </>
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
    display: 'flex',
    flexDirection: 'column',
  },
  selectionControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
  },
  selectedWord: {
    backgroundColor: 'rgba(0, 122, 255, 0.3)',
    borderRadius: 4,
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
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 10,
    fontSize: 14,
  },
  errorText: {
    color: '#FF6B6B',
    textAlign: 'center',
    padding: 30,
    fontSize: 16,
  },
  sentenceContainer: {
    padding: 20,
    flex: 0,
  },
  textSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    width: '100%',
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
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    padding: 15,
    width: '100%',
    flex: 0,
  },
  explanationOuterContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    width: '100%',
    minHeight: 150,
    maxHeight: 200,
  },
  explanationContainer: {
    padding: 10,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  translationSection: {
    marginBottom: 15,
    width: '100%',
    padding: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 5,
    width: '100%',
  },
  explainButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.6)',
    padding: 8,
    borderRadius: 20,
    position: 'absolute',
    right: 15,
    top: 50,
    zIndex: 10,
  },
  translatedText: {
    color: '#E0E0E0',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: 12,
    paddingRight: 40,
    borderRadius: 8,
    width: '100%',
    flexWrap: 'wrap',
  },
  explanationText: {
    color: '#E0E0E0',
    fontSize: 16,
    lineHeight: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: 12,
    borderRadius: 8,
    width: '100%',
    flexWrap: 'wrap',
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
    flexDirection: 'row',
    justifyContent: 'center',
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

