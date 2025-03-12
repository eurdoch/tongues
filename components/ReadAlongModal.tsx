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
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { fetchSpeechAudio, fetchWordTimestamps, translateText, explainWord } from './reader/TranslationService';
import Sound from 'react-native-sound';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  bookId: string; // Add bookId to identify which book we're reading
}

const ReadAlongModal: React.FC<ReadAlongModalProps> = ({
  visible,
  language,
  onClose,
  sentences,
  bookId,
}) => {
  // Add TranslationPopup component reference
  const translationPopupRef = useRef(null);
  const [words, setWords] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [highlightIndex, setHighlightIndex] = useState<number>(0);
  const [selectedWord, setSelectedWord] = useState<string>('');
  const [selectedWordTranslation, setSelectedWordTranslation] = useState<string>('');
  const [selectedWordExplanation, setSelectedWordExplanation] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isExplaining, setIsExplaining] = useState<boolean>(false);
  const [showTranslationPopup, setShowTranslationPopup] = useState<boolean>(false);
  const [touchPosition, setTouchPosition] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [selectionMode, setSelectionMode] = useState<boolean>(false);
  const [selectedWords, setSelectedWords] = useState<{word: string, index: number}[]>([]);
  const soundRef = useRef<Sound | null>(null);
  const currentSentenceIndex = useRef<number>(0);
  const currentInterval = useRef<any>(null);
  const currentTimestamps = useRef<TimestampMark[]>([]);
  const nextSentenceData = useRef<SentenceData | null>(null);
  const isPreloading = useRef<boolean>(false);

  // Load the saved reading position when the modal becomes visible
  useEffect(() => {
    const loadSavedPosition = async () => {
      if (visible && bookId && sentences.length > 0) {
        try {
          const key = `readAlong_${bookId}`;
          const savedPosition = await AsyncStorage.getItem(key);
          
          if (savedPosition !== null) {
            const savedIndex = parseInt(savedPosition, 10);
            
            // Validate the saved index is within the current sentences array bounds
            if (!isNaN(savedIndex) && savedIndex >= 0 && savedIndex < sentences.length) {
              console.log(`[ReadAlongModal] Restored reading position: sentence ${savedIndex}`);
              currentSentenceIndex.current = savedIndex;
              
              // Set the words for the current sentence to display
              setWords(sentences[savedIndex].split(' '));
            } else {
              console.log(`[ReadAlongModal] Saved position out of range, starting from beginning`);
              currentSentenceIndex.current = 0;
              
              // Set words for the first sentence
              setWords(sentences[0].split(' '));
            }
          } else {
            // No saved position, start from the beginning
            currentSentenceIndex.current = 0;
            setWords(sentences[0].split(' '));
          }
        } catch (error) {
          console.error('[ReadAlongModal] Error loading saved position:', error);
          // In case of error, at least display the first sentence
          setWords(sentences[0].split(' '));
        }
      }
    };
    
    loadSavedPosition();
  }, [visible, bookId, sentences]);
  
  // Save the current reading position whenever it changes
  const saveReadingPosition = async (index: number) => {
    if (bookId) {
      try {
        const key = `readAlong_${bookId}`;
        await AsyncStorage.setItem(key, index.toString());
        console.log(`[ReadAlongModal] Saved reading position: sentence ${index}`);
      } catch (error) {
        console.error('[ReadAlongModal] Error saving reading position:', error);
      }
    }
  };

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
    setSelectedWord('');
    setSelectedWordTranslation('');
    setSelectedWordExplanation('');
    setShowTranslationPopup(false);
    setSelectionMode(false);
    setSelectedWords([]);
    pausedByUser.current = false;
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
    // Don't proceed to next sentence if user manually paused
    if (pausedByUser.current) {
      console.log('[ReadAlongModal] User paused - not advancing to next sentence');
      return;
    }
    
    const next = currentIndex + 1;
    
    // Check if we've reached the end of sentences
    if (next >= sentences.length) {
      console.log('Reached the end of all sentences');
      return;
    }
    
    currentSentenceIndex.current = next;
    // Save the new sentence position
    saveReadingPosition(next);
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
      // Apply current playback speed
      soundRef.current.setSpeed(playbackSpeed);
      nextSentenceData.current = null;
      
      // Start preloading the sentence after this one
      if (next + 1 < sentences.length) {
        preloadNextSentence(next + 1);
      }
      
      soundRef.current.play((success) => {
        if (success && !pausedByUser.current) {
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
      // Apply current playback speed
      soundRef.current.setSpeed(playbackSpeed);
      
      // Start preloading the sentence after this one
      if (next + 1 < sentences.length) {
        preloadNextSentence(next + 1);
      }
      
      soundRef.current.play((success) => {
        if (success && !pausedByUser.current) {
          console.log(`Sentence ${next} finished playing.`);
          handleNextSentencePlay(next);
        }
      });
    }
  }

  const handleStart = async (_e: any) => {
    // Use the saved position or start from the beginning
    const startIndex = currentSentenceIndex.current;
    console.log(`[ReadAlongModal] Starting from sentence ${startIndex}`);
    
    setWords(sentences[startIndex].split(' '));
    setHighlightIndex(0);
    setSelectedWord('');
    setSelectedWordTranslation('');
    setSelectedWordExplanation('');
    
    const timestamps: TimestampMark[] = await fetchWordTimestamps(sentences[startIndex], language);
    currentTimestamps.current = timestamps;
    console.log('Timestamps: ', timestamps);
    const speech = await fetchSpeechAudio(sentences[startIndex], language);
    soundRef.current = speech.sound;
    
    // Apply current playback speed
    soundRef.current.setSpeed(playbackSpeed);
    
    // Save the starting position
    saveReadingPosition(startIndex);
    
    // Preload the next sentence while the first one is playing
    if (sentences.length > startIndex + 1) {
      preloadNextSentence(startIndex + 1);
    }

    setIsPlaying(true);
    // TODO handle errors where soundRef.current is null ?
    soundRef.current.play((success) => {
      if (success) {
        console.log(`Sentence ${startIndex} finished playing.`);
        handleNextSentencePlay(startIndex);
      }
    });
  }

  // Track if playback is paused by user - this helps prevent auto-advancing
  const pausedByUser = useRef<boolean>(false);

  // Track playback speed
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  
  const handleSlowDown = () => {
    if (soundRef.current) {
      // Don't go below 0.5x speed
      const newSpeed = Math.max(0.5, playbackSpeed - 0.5);
      setPlaybackSpeed(newSpeed);
      soundRef.current.setSpeed(newSpeed);
      console.log(`[ReadAlongModal] Playback speed set to ${newSpeed}x`);
    }
  };
  
  const handleTogglePlay = async (_e: any) => {
    // If already playing, just pause
    if (isPlaying && soundRef.current) {
      soundRef.current.pause();
      setIsPlaying(false);
      pausedByUser.current = true; // Set flag to indicate user manually paused
      return;
    }
    
    // If we have a sound loaded, resume playing
    if (soundRef.current) {
      pausedByUser.current = false; // Reset pause flag when manually playing
      // Apply current playback speed
      soundRef.current.setSpeed(playbackSpeed);
      soundRef.current.play((success) => {
        // Only proceed to next sentence if playback completed successfully AND 
        // user didn't manually pause (to prevent auto-advancing after pause)
        if (success && !pausedByUser.current) {
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
    } else {
      // No sound loaded yet, so we need to start from the saved position or beginning
      // This is the same as the handleStart function
      const startIndex = currentSentenceIndex.current;
      console.log(`[ReadAlongModal] Starting from sentence ${startIndex}`);
      
      setWords(sentences[startIndex].split(' '));
      setHighlightIndex(0);
      setSelectedWord('');
      setSelectedWordTranslation('');
      setSelectedWordExplanation('');
      
      const timestamps: TimestampMark[] = await fetchWordTimestamps(sentences[startIndex], language);
      currentTimestamps.current = timestamps;
      console.log('Timestamps: ', timestamps);
      const speech = await fetchSpeechAudio(sentences[startIndex], language);
      soundRef.current = speech.sound;
      
      // Save the starting position
      saveReadingPosition(startIndex);
      
      // Preload the next sentence while the first one is playing
      if (sentences.length > startIndex + 1) {
        preloadNextSentence(startIndex + 1);
      }

      setIsPlaying(true);
      pausedByUser.current = false; // Reset pause flag
      soundRef.current.play((success) => {
        // Only proceed to next sentence if playback completed successfully AND
        // user didn't manually pause (to prevent auto-advancing after pause)
        if (success && !pausedByUser.current) {
          console.log(`Sentence ${startIndex} finished playing.`);
          handleNextSentencePlay(startIndex);
        }
      });
    }
  }

  const handleWordClick = async (word: string, index: number, event: any) => {
    // If in selection mode, add/remove word from selection
    if (selectionMode) {
      // Check if word already selected
      const existingIndex = selectedWords.findIndex(item => item.index === index);
      
      if (existingIndex >= 0) {
        // Remove from selection
        setSelectedWords(selectedWords.filter(item => item.index !== index));
      } else {
        // Add to selection
        setSelectedWords([...selectedWords, { word, index }]);
      }
      
      setHighlightIndex(index);
      return;
    }
    
    // We no longer need tap position as popup has fixed position now
    setTouchPosition({ x: 0, y: 0 }); // Using fixed positioning instead
    
    // Pause the audio
    if (soundRef.current && isPlaying) {
      soundRef.current.pause();
      setIsPlaying(false);
    }
    
    // Set the highlight to the clicked word and store the word itself
    setHighlightIndex(index);
    setSelectedWord(word);
    
    // Clear previous explanation and translation
    setSelectedWordExplanation('');
    setSelectedWordTranslation('');
    
    // Get translation for the word
    setIsTranslating(true);
    try {
      // Fetch only the translation initially
      const translation = await translateText(word, language);
      setSelectedWordTranslation(translation);
      setShowTranslationPopup(true); // Show popup after translation is fetched
    } catch (error) {
      console.error('Error translating word:', error);
      setSelectedWordTranslation('Translation error');
      setShowTranslationPopup(true); // Show popup even if there's an error
    } finally {
      setIsTranslating(false);
    }
  };
  
  const handleExplainWord = async () => {
    // Don't do anything if no word is selected
    if (!selectedWord) {
      return;
    }
    
    // Show loading state
    setIsExplaining(true);
    
    try {
      // Fetch explanation using the stored selected word
      const explanation = await explainWord(selectedWord, language);
      setSelectedWordExplanation(explanation);
    } catch (error) {
      console.error('Error explaining word:', error);
      setSelectedWordExplanation('Explanation not available');
    } finally {
      setIsExplaining(false);
    }
  };
  
  // Handle long press on a word
  const handleWordLongPress = (word: string, index: number) => {
    // Pause the audio if playing
    if (soundRef.current && isPlaying) {
      soundRef.current.pause();
      setIsPlaying(false);
    }
    
    // Enter selection mode
    setSelectionMode(true);
    
    // Add the long-pressed word to selection
    setSelectedWords([{ word, index }]);
    
    // Set highlight
    setHighlightIndex(index);
  };
  
  // Translate selected words
  const handleTranslateSelected = async () => {
    if (selectedWords.length === 0) return;
    
    // Join selected words, sort by index to maintain sentence structure
    const sortedWords = [...selectedWords].sort((a, b) => a.index - b.index);
    const wordText = sortedWords.map(item => item.word).join(' ');
    
    // Set the primary selected word
    setSelectedWord(wordText);
    
    // Clear previous translations and explanations
    setSelectedWordTranslation('');
    setSelectedWordExplanation('');
    
    // Get translation for the phrase
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
                    {words.map((word, index) => {
                      // Check if word is in selected words
                      const isSelected = selectedWords.some(item => item.index === index);
                      const textStyle = [
                        styles.originalText,
                        (highlightIndex === index) && styles.highlightedWord,
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
                      <Text style={styles.controlButtonText}>
                        {isPlaying ? 'Pause' : 'Play'}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
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
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      
      {/* Add the translation popup */}
      <TranslationPopup
        visible={showTranslationPopup}
        onClose={() => {
          setShowTranslationPopup(false);
          setSelectionMode(false);
          setSelectedWords([]);
        }}
        isTranslating={isTranslating}
        selectedWord={selectedWord}
        selectedWordTranslation={selectedWordTranslation}
        touchPosition={touchPosition}
        isExplaining={isExplaining}
        selectedWordExplanation={selectedWordExplanation}
        handleExplainWord={handleExplainWord}
      />
    </>
  );
};

// Separate translation popup component
const TranslationPopup: React.FC<any> = ({ 
  visible, 
  onClose, 
  isTranslating,
  selectedWord,
  selectedWordTranslation,
  touchPosition,
  isExplaining,
  selectedWordExplanation,
  handleExplainWord
}) => {
  const [slideAnim] = useState({ translateX: new Animated.Value(0), translateY: new Animated.Value(0) });
  
  useEffect(() => {
    if (visible) {
      // Reset animation first
      slideAnim.translateX.setValue(0);
      slideAnim.translateY.setValue(0);
      
      // Start animation
      Animated.parallel([
        Animated.timing(slideAnim.translateX, {
          toValue: 10,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim.translateY, {
          toValue: 10,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);
  
  if (!visible) return null;
  
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
        <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View 
              style={[
                styles.container,
                {
                  height: 600,
                  transform: [
                    { translateX: slideAnim.translateX },
                    { translateY: slideAnim.translateY }
                  ]
                }
              ]}>
              <ScrollView style={styles.contentScroll}>
                <View style={styles.sentenceContainer}>
                  <View style={styles.textSection}>
                    {isTranslating ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#007AFF" />
                      </View>
                    ) : (
                      <View style={styles.popupContentContainer}>
                        <Text style={styles.popupOriginalText}>{selectedWord}</Text>
                        <Text style={styles.popupTranslation}>{selectedWordTranslation}</Text>
                        
                        {!selectedWordExplanation && !isExplaining && (
                          <TouchableOpacity
                            onPress={handleExplainWord}
                            style={styles.popupExplainButton}
                          >
                            <Text style={styles.controlButtonText}>✨ Explain</Text>
                          </TouchableOpacity>
                        )}
                        
                        {isExplaining && (
                          <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" color="#007AFF" />
                            <Text style={styles.loadingText}>Explaining...</Text>
                          </View>
                        )}
                        
                        {selectedWordExplanation && (
                          <View style={styles.explanationContainer}>
                            <Text style={styles.popupExplanation}>{selectedWordExplanation}</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </ScrollView>
              
            </Animated.View>
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
  
  // Translation popup styles
  contentScroll: {
    flex: 1,
    width: '100%',
  },
  popupLoadingContainer: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupContentContainer: {
    width: '100%',
    padding: 5,
  },
  popupOriginalText: {
    color: '#FFFFFF',
    fontSize: 22,
    marginBottom: 10,
    textAlign: 'left',
    width: '100%',
  },
  popupTranslation: {
    color: '#E0E0E0',
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'left',
    width: '100%',
  },
  popupExplainButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.6)',
    padding: 8,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
    alignSelf: 'center',
  },
  popupExplanation: {
    color: '#E0E0E0',
    fontSize: 18,
    lineHeight: 26,
    padding: 5,
  },
});

export default ReadAlongModal;

