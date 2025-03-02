import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableWithoutFeedback,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Sound from 'react-native-sound';
import RNFS from 'react-native-fs';

interface TimestampMark {
  time: number;
  type: string; 
  start: number;
  end: number;
  value: string;
}

interface TimestampData {
  marks: TimestampMark[];
}

interface ReadAlongModalProps {
  visible: boolean;
  onClose: () => void;
  text: string;
  language?: string;
  audioSound?: Sound;
  timestampData: TimestampData;
  translation: string;
  contentSentences?: string[];
  currentSentenceIndex?: number;
  onSentenceComplete?: (index: number) => void;
}

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

const ReadAlongModal: React.FC<ReadAlongModalProps> = ({
  visible,
  onClose,
  text,
  language = 'Spanish',
  audioSound,
  timestampData,
  translation,
  contentSentences = [],
  currentSentenceIndex = 0,
  onSentenceComplete = () => {},
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isChangingSentence, setIsChangingSentence] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sound, setSound] = useState<Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [wordTimestamps, setWordTimestamps] = useState<WordTimestamp[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(-1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function for all timers and audio
  const cleanupResources = useCallback(() => {
    console.log('ReadAlongModal: Cleaning up resources');
    
    // Stop and clean up sound
    if (sound) {
      console.log('ReadAlongModal: Cleaning up sound');
      sound.stop();
      sound.release();
      setSound(null);
    }
    
    // Clear timers
    if (timerRef.current) {
      console.log('ReadAlongModal: Cleaning up timers');
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    // Reset UI state
    setCurrentWordIndex(-1);
    setIsPlaying(false);
    
    // Don't reset loading state here - we handle that separately
  }, [sound]);
  
  // Effect to handle sentence changes
  useEffect(() => {
    // Only care about sentence index changes when visible
    if (!visible) return;
    
    console.log(`ReadAlongModal: Sentence changed to index ${currentSentenceIndex}`);
    
    // Mark that we're changing sentences to prevent flickering
    setIsChangingSentence(true);
    
    // Clean up previous resources
    cleanupResources();
    
    // Cleanup function
    return () => {
      // Don't clear isChangingSentence here because we need it to persist
      // during the transition between sentences
    };
  }, [currentSentenceIndex, visible, cleanupResources]);
  
  // Fetch translation, audio, and word timestamps when visible or when props change
  useEffect(() => {
    console.log('ReadAlongModal: Props changed - reloading data', {
      visible,
      textLength: text?.length,
      language,
      hasSentences: contentSentences?.length > 0,
      sentenceIndex: currentSentenceIndex,
      hasAudio: !!audioSound,
      isChangingSentence
    });
    
    // Always clean up previous resources first (except during sentence changes)
    if (!isChangingSentence) {
      cleanupResources();
    }
    
    // Only load new data if the modal is visible and we have text
    if (visible && text && language) {
      console.log(`ReadAlongModal: Loading data for sentence ${currentSentenceIndex + 1}`);
      loadData();
    }
    
    // Cleanup when unmounting or props change
    return cleanupResources;
  }, [visible, text, language, audioSound, isChangingSentence, cleanupResources]);
  
  // Auto play audio when sound is loaded or text/sentence changes
  useEffect(() => {
    // Log for debugging
    console.log('ReadAlongModal: Sound or content changed', {
      hasSound: !!sound,
      isPlaying,
      textLength: text?.length || 0,
      wordTimestampsLength: wordTimestamps.length,
      sentenceIndex: currentSentenceIndex
    });
    
    if (visible && sound && !isPlaying) {
      // Add a small delay to ensure everything is ready
      const timer = setTimeout(() => {
        console.log('ReadAlongModal: Auto-playing audio after delay');
        playAudio(true);
      }, 500); // Increased delay for better reliability
      
      return () => clearTimeout(timer);
    }
  }, [visible, sound, text, isPlaying, wordTimestamps.length]);

  const loadData = async () => {
    if (!text || !language) return;
    
    // Only show loading if we're not transitioning between sentences
    if (!isChangingSentence) {
      setIsLoading(true);
    }
    
    setError(null);
    
    try {
      console.log('ReadAlongModal: Processing timestamp data for sentence');
      
      // Convert timestamp data to the format needed by the component
      const timestamps = timestampData.marks.map(mark => ({
        word: mark.value,
        start: mark.time / 1000, // Convert to seconds
        end: (mark.time / 1000) + 0.3 // Approximate end time
      }));
      
      setWordTimestamps(timestamps);
      
      // Use the provided audio sound if available
      if (audioSound) {
        console.log('ReadAlongModal: Setting provided audio sound');
        setSound(audioSound);
      }
      
      // All data is loaded, we can reset the changing state
      setIsChangingSentence(false);
    } catch (err) {
      console.error('Error loading read-along data:', err);
      setError('Failed to load data. Please try again.');
      setIsChangingSentence(false);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Note: processAudioBuffer has been removed as we're now using the Sound object directly

  const playAudio = (autoAdvance = true) => {
    if (!sound) {
      console.log('ReadAlongModal: Cannot play - sound is null');
      return;
    }
    
    // Make sure we have word timestamps
    if (!wordTimestamps || wordTimestamps.length === 0) {
      console.log('ReadAlongModal: Warning - playing audio without timestamps');
    }
    
    console.log(`ReadAlongModal: Playing audio for sentence ${currentSentenceIndex + 1}/${contentSentences.length}`);
    
    // Make sure we clear everything before starting
    cleanupResources();
    
    // Reset state for new playback
    setIsPlaying(true);
    setCurrentWordIndex(-1);
    
    // Use a precise synchronization method with audio
    let highlightStarted = false;
    
    // Create an event listener for when audio finishes
    sound.setNumberOfLoops(0); // Ensure it only plays once
    
    // Event listener for audio completion
    const handleAudioComplete = (success: boolean) => {
      console.log(`ReadAlongModal: Audio playback finished with success=${success}`);
      
      // Ensure we clean up all resources
      cleanupResources();
      
      // If there are more sentences, move to the next one
      if (success && autoAdvance && contentSentences.length > 0) {
        const nextIndex = currentSentenceIndex + 1;
        if (nextIndex < contentSentences.length) {
          console.log(`ReadAlongModal: Advancing to next sentence #${nextIndex + 1}`);
          onSentenceComplete(nextIndex);
        } else {
          console.log('ReadAlongModal: Reached the end of content');
        }
      }
    };
    
    // Start the audio with a completion callback
    sound.play(handleAudioComplete);
    
    // Start word highlighting in a timeout to ensure audio begins first
    setTimeout(() => {
      if (isPlaying) {
        console.log('ReadAlongModal: Starting word highlighting');
        startWordHighlighting();
        highlightStarted = true;
      }
    }, 100);
    
    // Return a cleanup function
    return () => {
      if (!highlightStarted && isPlaying) {
        // If highlight didn't start yet, clean up the audio
        if (sound) {
          sound.stop();
          setIsPlaying(false);
        }
      }
    };
  };
  
  const stopAudio = () => {
    // Use our cleanup utility to handle everything
    cleanupResources();
  };
  
  const startWordHighlighting = () => {
    // If we don't have valid timestamps, return early
    if (!wordTimestamps || !wordTimestamps.length) {
      console.log('ReadAlongModal: No valid word timestamps to highlight');
      return;
    }
    
    // Reset to initial state
    setCurrentWordIndex(-1);
    
    // Clean up any existing timers to avoid memory leaks and weird behavior
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    // Create a single coordinating timer instead of many individual ones
    let wordIndex = 0;
    let nextTimerMs = 0;
    
    console.log(`ReadAlongModal: Starting highlight controller for ${wordTimestamps.length} words`);
    
    // Function to schedule the next highlight
    const scheduleNextHighlight = () => {
      // If we're at the end, reset the highlight and exit
      if (wordIndex >= wordTimestamps.length) {
        setCurrentWordIndex(-1);
        return;
      }
      
      // Get the current timestamp
      const timestamp = wordTimestamps[wordIndex];
      
      // Calculate when to show this word
      const delay = timestamp.start * 1000 - nextTimerMs;
      
      // Schedule the next timer
      timerRef.current = setTimeout(() => {
        // Update which word is highlighted
        setCurrentWordIndex(wordIndex);
        
        // Move to the next word for the next timer
        wordIndex++;
        
        // Update our time tracking
        nextTimerMs = timestamp.start * 1000;
        
        // Schedule the next highlight
        scheduleNextHighlight();
      }, Math.max(10, delay)); // Ensure at least 10ms to avoid bunching
    };
    
    // Start the highlighting process
    scheduleNextHighlight();
    
    // Return a cleanup function
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  };

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
            <View style={styles.container}>
              <View style={styles.header}>
                <Text style={styles.headerText}>Read Along</Text>
              </View>
              
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.loadingText}>
                    {isChangingSentence ? 'Preparing next sentence...' : 'Loading...'}
                  </Text>
                </View>
              ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : !sound && audioSound ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.loadingText}>
                    {isChangingSentence ? 'Preparing audio...' : 'Processing audio...'}
                  </Text>
                </View>
              ) : (
                <>
                  <ScrollView style={styles.contentContainer}>
                    {contentSentences.length > 0 && (
                      <View style={styles.progressSection}>
                        <Text style={styles.progressText}>
                          Sentence {currentSentenceIndex + 1} of {contentSentences.length}
                        </Text>
                        <View style={styles.progressBar}>
                          <View 
                            style={[
                              styles.progressFill, 
                              { width: `${(currentSentenceIndex / Math.max(1, contentSentences.length - 1)) * 100}%` }
                            ]} 
                          />
                        </View>
                      </View>
                    )}
                
                    <View style={styles.textSection}>
                      <Text style={styles.sectionTitle}>
                        Original Text ({currentSentenceIndex + 1}/{contentSentences.length})
                      </Text>
                      <View style={styles.highlightContainer}>
                        {wordTimestamps.length > 0 ? (
                          <Text style={styles.originalText}>
                            {wordTimestamps.map((item, index) => (
                              <Text
                                key={index}
                                style={currentWordIndex === index ? styles.highlightedWord : styles.word}
                              >
                                {item.word}{' '}
                              </Text>
                            ))}
                          </Text>
                        ) : (
                          <Text style={styles.originalText}>{text}</Text>
                        )}
                      </View>
                    </View>
                    
                    <View style={styles.textSection}>
                      <Text style={styles.sectionTitle}>Translation:</Text>
                      <Text style={styles.translatedText}>{translation}</Text>
                    </View>
                  </ScrollView>
                  
                  <View style={styles.controls}>
                    {contentSentences.length > 0 && (
                      <TouchableOpacity
                        style={[
                          styles.controlButton, 
                          styles.navButton, 
                          currentSentenceIndex === 0 && { opacity: 0.5 }
                        ]}
                        disabled={currentSentenceIndex === 0}
                        onPress={() => {
                          stopAudio();
                          onSentenceComplete(currentSentenceIndex - 1);
                        }}
                      >
                        <Text style={styles.controlButtonText}>
                          ◀ Prev
                        </Text>
                      </TouchableOpacity>
                    )}
                    
                    <TouchableOpacity
                      style={[styles.controlButton, !sound && { opacity: 0.5 }]}
                      disabled={!sound}
                      onPress={isPlaying ? stopAudio : playAudio}
                    >
                      <Text style={styles.controlButtonText}>
                        {isPlaying ? '■ Stop' : '▶ Play'}
                      </Text>
                    </TouchableOpacity>
                    
                    {contentSentences.length > 0 && (
                      <TouchableOpacity
                        style={[
                          styles.controlButton, 
                          styles.navButton,
                          currentSentenceIndex === contentSentences.length - 1 && { opacity: 0.5 }
                        ]}
                        disabled={currentSentenceIndex === contentSentences.length - 1}
                        onPress={() => {
                          stopAudio();
                          onSentenceComplete(currentSentenceIndex + 1);
                        }}
                      >
                        <Text style={styles.controlButtonText}>
                          Next ▶
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
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
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 18,
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
    fontSize: 18,
    lineHeight: 28,
  },
  word: {
    color: '#FFFFFF',
  },
  highlightedWord: {
    color: '#FFC107',
    fontWeight: 'bold',
  },
  translatedText: {
    color: '#E0E0E0',
    fontSize: 16,
    lineHeight: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: 10,
    borderRadius: 8,
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
