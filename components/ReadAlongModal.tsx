import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableWithoutFeedback,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { fetchSpeechAudio, fetchWordTimestamps, translateText, explainWord } from '../services/TranslationService';
import Sound from 'react-native-sound';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TimestampMark from '../types/TimestampMark';
import SentenceData from '../types/SentenceData';
import TranslationPopup from './TranslationPopup';
import { useNavigationContext } from '../NavigationContext';
import { NavPoint } from '../types/NavPoint';

interface ReadAlongModalProps {
  visible: boolean;
  onClose: () => void;
  language: string;
  sentences: string[];
  initialSentenceIndex?: number;
  section: NavPoint;
}

const ReadAlongModal: React.FC<ReadAlongModalProps> = ({
  visible,
  language,
  onClose,
  sentences,
  section,
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
  const { currentBook } = useNavigationContext();

  const saveReadingPosition = async (index: number) => {
    try {
      const position = await AsyncStorage.getItem(`${currentBook!.path}_position`);
      let positionJson = JSON.parse(position!); // position is set before entering ReaderScreen
      positionJson.readAlongIndex = index;
      await AsyncStorage.setItem(`${currentBook!.path}_position`, JSON.stringify(positionJson));
      console.log(`[ReadAlongModal] Saved reading position: sentence ${index}`);
    } catch (error) {
      console.error('[ReadAlongModal] Error saving reading position:', error);
    }
  };
  
  // Function to preload the next sentence
  const preloadNextSentence = async (nextIndex: number) => {
    if (nextIndex >= sentences.length || isPreloading.current) {
      return;
    }
    
    isPreloading.current = true;
    try {
      console.log(`[ReadAlongModal] Preloading next sentence ${nextIndex}: "${sentences[nextIndex].substring(0, 30)}..."`);
      
      // Preload audio, timestamps, and translation simultaneously
      const [timestamps, speech, translation] = await Promise.all([
        fetchWordTimestamps(sentences[nextIndex], language),
        fetchSpeechAudio(sentences[nextIndex], language),
        translateText(sentences[nextIndex], language)
      ]);
      
      if (speech && speech.sound) {
        // Configure sound
        speech.sound.setVolume(1.0);
        speech.sound.setSpeed(playbackSpeed);
        speech.sound.pause(); // Ensure it's paused
        
        // Store the preloaded data
        nextSentenceData.current = {
          sound: speech.sound,
          timestamps: timestamps,
          words: sentences[nextIndex].split(' '),
          translation: translation // Store the preloaded translation
        };
        
        console.log('[ReadAlongModal] Next sentence preloaded successfully with translation');
      }
    } catch (error) {
      console.error('[ReadAlongModal] Error preloading next sentence:', error);
      nextSentenceData.current = null;
    } finally {
      isPreloading.current = false;
    }
  };

  // Loading state to prevent play before audio is ready
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sentenceTranslation, setSentenceTranslation] = useState<string>('');
  const [isTranslatingSentence, setIsTranslatingSentence] = useState<boolean>(false);

  // Initialize with the selected sentence when the modal becomes visible
  useEffect(() => {
    // Use the extracted initializeModal function
    initializeModal();
  }, [visible, sentences, language]);
  
  // Translate current sentence whenever it changes
  useEffect(() => {
    if (visible && sentences.length > 0 && !isLoading) {
      translateCurrentSentence();
    }
  }, [currentSentenceIndex, sentences, language, visible, isLoading]);
  
  // Function to translate the current sentence
  const translateCurrentSentence = async () => {
    if (!sentences[currentSentenceIndex]) return;
    
    // If we already have a translation (e.g. from preloading), no need to translate again
    if (sentenceTranslation && sentenceTranslation.length > 0) {
      console.log('[ReadAlongModal] Translation already available, skipping translation request');
      return;
    }
    
    setIsTranslatingSentence(true);
    try {
      const translation = await translateText(sentences[currentSentenceIndex], language);
      setSentenceTranslation(translation);
    } catch (error) {
      console.error('[ReadAlongModal] Error translating sentence:', error);
      setSentenceTranslation('Translation failed');
    } finally {
      setIsTranslatingSentence(false);
    }
  };

  const loadNextSentence = async () => {
    // Check if we have more sentences
    const nextIndex = currentSentenceIndex + 1;
    if (nextIndex >= sentences.length) {
      console.log('[ReadAlongModal] Reached the end of all sentences');
      return false;
    }
    
    try {
      setIsLoading(true);
      
      // Reset sentence translation
      setSentenceTranslation('');
      
      // Save the new position
      await saveReadingPosition(nextIndex);
      setCurrentSentenceIndex(nextIndex);
      setHighlightIndex(0);
      currentHighlightIndex.current = 0;
      
      // Clear the current audio
      if (soundRef.current) {
        soundRef.current.release();
        soundRef.current = null;
      }
      
      // If we have preloaded data, use it
      if (nextSentenceData.current) {
        console.log('[ReadAlongModal] Using preloaded data for next sentence');
        soundRef.current = nextSentenceData.current.sound;
        currentTimestamps.current = nextSentenceData.current.timestamps;
        
        // If we have a preloaded translation, use it
        if (nextSentenceData.current.translation) {
          console.log('[ReadAlongModal] Using preloaded translation');
          setSentenceTranslation(nextSentenceData.current.translation);
        }
        
        nextSentenceData.current = null; // Clear the preloaded data
        
        // Preload the sentence after this one
        const sentenceAfterNextIndex = nextIndex + 1;
        if (sentenceAfterNextIndex < sentences.length) {
          preloadNextSentence(sentenceAfterNextIndex);
        }
        
        return true;
      } else {
        // If no preloaded data, load the next sentence now
        console.log(`[ReadAlongModal] Loading next sentence ${nextIndex} on demand`);
        const sentence = sentences[nextIndex];
        
        // Fetch timestamps and audio in parallel
        const [timestamps, speech] = await Promise.all([
          fetchWordTimestamps(sentence, language),
          fetchSpeechAudio(sentence, language)
        ]);
        
        // Set the timestamps
        currentTimestamps.current = timestamps;
        
        // Set the sound
        if (speech && speech.sound) {
          soundRef.current = speech.sound;
          soundRef.current.setVolume(1.0);
          soundRef.current.setSpeed(playbackSpeed);
          
          // Preload the sentence after this one
          const sentenceAfterNextIndex = nextIndex + 1;
          if (sentenceAfterNextIndex < sentences.length) {
            preloadNextSentence(sentenceAfterNextIndex);
          }
          
          return true;
        }
      }
    } catch (error) {
      console.error('[ReadAlongModal] Error loading next sentence:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
    
    return false;
  };

  // Track if a sentence has just completed playing
  const [sentenceFinished, setSentenceFinished] = useState<boolean>(false);
  
  // Add a useEffect to handle auto-advancing to the next sentence
  useEffect(() => {
    // Only run this effect when a sentence has completed
    if (sentenceFinished) {
      console.log('[ReadAlongModal] Detected sentence completion, auto-advancing');
      
      // Load and play the next sentence
      const autoAdvance = async () => {
        try {
          const nextLoaded = await loadNextSentence();
          if (nextLoaded && soundRef.current) {
            console.log('[ReadAlongModal] Saving current position');
            const position = {
              section,
              readAlongIndex: currentSentenceIndex,
            };
            await AsyncStorage.setItem(`${currentBook!.path}_position`, JSON.stringify(position));

            console.log('[ReadAlongModal] Starting playback of next sentence');
            soundRef.current.play((nextSuccess) => {
              if (nextSuccess) {
                console.log('[ReadAlongModal] Next sentence completed successfully');
                // Signal another sentence has finished
                setSentenceFinished(true);
              } else {
                console.error('[ReadAlongModal] Next sentence playback error');
                setIsPlaying(false);
                setSentenceFinished(false);
              }
            });
          } else {
            // No more sentences or loading failed
            console.log('[ReadAlongModal] No more sentences or load failed');
            setIsPlaying(false);
            setSentenceFinished(false);
          }
        } catch (error) {
          console.error('[ReadAlongModal] Error in auto-advance:', error);
          setIsPlaying(false);
          setSentenceFinished(false);
        }
      };
      
      autoAdvance();
      // Reset the flag
      setSentenceFinished(false);
    }
  }, [sentenceFinished, sentences, language, currentSentenceIndex, playbackSpeed]);

  const handleTogglePlay = (e: any) => {
    e.preventDefault();
    
    // Prevent play actions while loading audio
    if (isLoading) {
      console.log('[ReadAlongModal] Ignoring play request - audio still loading');
      return;
    }
    
    if (soundRef.current) {
      if (!isPlaying) {
        // Reset highlight index when starting playback from beginning
        if (soundRef.current.getCurrentTime) {
          soundRef.current.getCurrentTime((seconds) => {
            if (seconds < 0.1) {
              // Starting from beginning
              currentHighlightIndex.current = 0;
              setHighlightIndex(0);
            } else {
              // If we're resuming from middle, find the right word to highlight
              const milliseconds = seconds * 1000;
              let wordIndex = 0;
              
              // Find the appropriate word based on current playback position
              for (let i = 0; i < currentTimestamps.current.length; i++) {
                const timestamp = currentTimestamps.current[i];
                if (!timestamp) continue;
                
                if (timestamp.time <= milliseconds) {
                  wordIndex = i;
                } else {
                  break;
                }
              }
              
              currentHighlightIndex.current = wordIndex;
              setHighlightIndex(wordIndex);
            }
          });
        }

        // Start playback
        soundRef.current.play((success) => {
          if (success) {
            console.log('[ReadAlongModal] Sound finished playing successfully');
            // Signal that a sentence has completed
            setSentenceFinished(true);
          } else {
            console.error('[ReadAlongModal] Sound playback encountered an error');
            setIsPlaying(false);
          }
        });
        
        setIsPlaying(true);
      } else {
        // Pause playback but maintain current highlight position
        soundRef.current.pause();
        
        // Get current time to make sure highlight stays at right position
        if (soundRef.current.getCurrentTime) {
          soundRef.current.getCurrentTime((seconds) => {
            const milliseconds = seconds * 1000;
            let wordIndex = currentHighlightIndex.current; // Start with current value
            
            // Find the appropriate word based on current playback position
            for (let i = 0; i < currentTimestamps.current.length; i++) {
              const timestamp = currentTimestamps.current[i];
              if (!timestamp) continue;
              
              if (timestamp.time <= milliseconds) {
                wordIndex = i;
              } else {
                break;
              }
            }
            
            // Update both ref and state to ensure consistency
            currentHighlightIndex.current = wordIndex;
            setHighlightIndex(wordIndex);
            
            // Reset the sentence finished flag to prevent auto-advancing
            setSentenceFinished(false);
          });
        }
        
        setIsPlaying(false);
      }
    } else {
      console.error('[ReadAlongModal] Cannot play sound - sound object not initialized');
      // Try to reload the audio if it failed to load
      initializeModal();
    }
  }
  
  // Extract initialization to a named function so it can be called from handleTogglePlay
  const initializeModal = async () => {
    if (visible && sentences.length > 0) {
      try {
        setIsLoading(true);
        
        // Reset sentence translation
        setSentenceTranslation('');
        
        // Get stored position or default to first sentence
        const position = await AsyncStorage.getItem(`${currentBook!.path}_position`);
        let index;
        if (position) {
          const positionJson = JSON.parse(position);
          index = positionJson.readAlongIndex;
          setCurrentSentenceIndex(index);
        } else {
          setCurrentSentenceIndex(0);
        }
        
        setHighlightIndex(0); // Reset highlight when loading a new sentence
        if (currentHighlightIndex) {
          currentHighlightIndex.current = 0; // Also reset the ref
        }
        
        if (soundRef.current) {
          soundRef.current.release();
          soundRef.current = null;
        }
        
        currentTimestamps.current = [];
        
        const sentence = sentences[index];
        console.log(`[ReadAlongModal] Loading sentence ${index}: "${sentence.substring(0, 30)}..."`);
        
        const [timestamps, speech] = await Promise.all([
          fetchWordTimestamps(sentence, language),
          fetchSpeechAudio(sentence, language)
        ]);
        
        // Set the timestamps
        currentTimestamps.current = timestamps;
        console.log('[ReadAlongModal] Timestamps loaded:', timestamps.length);
        
        if (speech && speech.sound) {
          soundRef.current = speech.sound;
          soundRef.current.setVolume(1.0);
          soundRef.current.setSpeed(playbackSpeed);
          soundRef.current.pause();
          console.log('[ReadAlongModal] Sound loaded successfully (paused)');
          
          const nextIndex = index + 1;
          if (nextIndex < sentences.length) {
            preloadNextSentence(nextIndex);
          }
        } else {
          console.error('[ReadAlongModal] Failed to load audio');
        }
      } catch (error) {
        console.error('[ReadAlongModal] Error loading sentence:', error);
      } finally {
        setIsLoading(false); // Mark loading as complete regardless of success/failure
      }
    }
  }

  // Create stable reference for current highlight index
  const currentHighlightIndex = useRef<number>(0);
  
  // Set up the interval for tracking word highlighting
  useEffect(() => {
    console.log('[ReadAlongModal] Setting up highlight tracking');
    
    if (visible) {
      // Only reset highlight when first becoming visible, not on every isPlaying change
      if (!currentInterval.current) {
        setHighlightIndex(0);
        currentHighlightIndex.current = 0;
      }
      
      // If playing, set up interval for continuous updates
      if (isPlaying) {
        const interval = setInterval(() => {
          if (soundRef.current && currentTimestamps.current && currentTimestamps.current.length > 0) {
            soundRef.current.getCurrentTime((seconds, _isPlaying) => {
              // Convert to milliseconds for comparison with timestamps
              const milliseconds = seconds * 1000;
              
              // Find the correct word to highlight based on current time
              let newHighlightIndex = currentHighlightIndex.current; // Start with current value
              
              // Find the last timestamp that is earlier than or equal to the current time
              for (let i = 0; i < currentTimestamps.current.length; i++) {
                const timestamp = currentTimestamps.current[i];
                if (!timestamp) continue;
                
                // If this timestamp is in the future, we've gone too far
                if (timestamp.time > milliseconds) {
                  break;
                }
                
                // This timestamp is earlier than current time, so update index
                newHighlightIndex = i;
              }
              
              // Only update if changed to avoid unnecessary re-renders
              if (newHighlightIndex !== currentHighlightIndex.current) {
                currentHighlightIndex.current = newHighlightIndex;
                setHighlightIndex(newHighlightIndex);
              }
            });
          }
        }, 100); // More frequent updates for better responsiveness
  
        currentInterval.current = interval;
      }
      
      return () => {
        // On cleanup, clear the interval but DO NOT reset the highlight position
        console.log('[ReadAlongModal] Cleaning up highlight tracking');
        if (currentInterval.current) {
          clearInterval(currentInterval.current);
          currentInterval.current = null;
        }
      };
    }
  }, [visible, isPlaying]); // Remove highlightIndex dependency to prevent flashing

  const handleClose = async () => {
    setIsPlaying(false);
    setHighlightIndex(0);
    currentHighlightIndex.current = 0; // Reset ref
    setSelectedWord('');
    setSelectedWordTranslation('');
    setSelectedWordExplanation('');
    setShowTranslationPopup(false);
    setSelectionMode(false);
    setSelectedWords([]);
    currentTimestamps.current = [];
    setSentenceFinished(false);
    
    // Clean up any intervals
    if (currentInterval.current) {
      clearInterval(currentInterval.current);
      currentInterval.current = null;
    }
    
    // Release current sound
    if (soundRef.current) {
      soundRef.current.pause();
      soundRef.current.release();
      soundRef.current = null;
    }
    
    // Release preloaded sound if exists
    if (nextSentenceData.current?.sound) {
      nextSentenceData.current.sound.release();
      nextSentenceData.current = null;
    }
    
    // Reset loading and preloading flags
    setIsLoading(false);
    isPreloading.current = false;
    
    // Store current position for next time
    await saveReadingPosition(currentSentenceIndex);
    
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
  
  const handleRestartSentence = () => {
    if (soundRef.current) {
      console.log('[ReadAlongModal] Restarting current sentence from beginning');
      
      // Pause if currently playing
      if (isPlaying) {
        soundRef.current.pause();
      }
      
      // Reset to beginning
      soundRef.current.setCurrentTime(0);
      
      // Reset highlight index to the first word
      setHighlightIndex(0);
      currentHighlightIndex.current = 0;
      
      // Resume playing if it was playing before
      if (isPlaying) {
        soundRef.current.play((success) => {
          if (success) {
            console.log('[ReadAlongModal] Sound finished playing successfully');
            setSentenceFinished(true);
          } else {
            console.error('[ReadAlongModal] Sound playback encountered an error');
            setIsPlaying(false);
          }
        });
      }
    }
  };
  
  const handlePreviousSentence = async () => {
    // Only proceed if not at the first sentence already
    if (currentSentenceIndex > 0 && !isLoading) {
      console.log('[ReadAlongModal] Moving to previous sentence');
      
      // Stop current playback
      if (soundRef.current) {
        const wasPlaying = isPlaying;
        
        if (isPlaying) {
          soundRef.current.pause();
          setIsPlaying(false);
        }
        
        // Clean up current sound
        soundRef.current.release();
        soundRef.current = null;
      }
      
      try {
        setIsLoading(true);
        
        // Calculate the new index
        const newIndex = currentSentenceIndex - 1;
        
        // Update the tracking state
        setCurrentSentenceIndex(newIndex);
        setHighlightIndex(0);
        currentHighlightIndex.current = 0;
        
        // Reset sentence translation
        setSentenceTranslation('');
        
        // Save the new position
        await saveReadingPosition(newIndex);
        
        // Load the previous sentence
        const sentence = sentences[newIndex];
        console.log(`[ReadAlongModal] Loading previous sentence ${newIndex}: "${sentence.substring(0, 30)}..."`);
        
        // Fetch timestamps and audio
        const [timestamps, speech] = await Promise.all([
          fetchWordTimestamps(sentence, language),
          fetchSpeechAudio(sentence, language)
        ]);
        
        // Set the timestamps
        currentTimestamps.current = timestamps;
        
        // Set the sound
        if (speech && speech.sound) {
          soundRef.current = speech.sound;
          soundRef.current.setVolume(1.0);
          soundRef.current.setSpeed(playbackSpeed);
          
          // Start playing automatically
          soundRef.current.play((success) => {
            if (success) {
              console.log('[ReadAlongModal] Previous sentence completed successfully');
              setSentenceFinished(true);
            } else {
              console.error('[ReadAlongModal] Previous sentence playback error');
              setIsPlaying(false);
            }
          });
          
          // Update playing state
          setIsPlaying(true);
        } else {
          console.error('[ReadAlongModal] Failed to load audio for previous sentence');
        }
        
        // Preload the sentence after this one (which is the current sentence)
        preloadNextSentence(currentSentenceIndex);
      } catch (error) {
        console.error('[ReadAlongModal] Error loading previous sentence:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };
  
  const handleNextSentence = async () => {
    // Only proceed if not at the last sentence already
    if (currentSentenceIndex < sentences.length - 1 && !isLoading) {
      console.log('[ReadAlongModal] Manually advancing to next sentence');
      
      // This is similar to automatic advancement but triggered manually
      const nextLoaded = await loadNextSentence();
      
      if (nextLoaded && soundRef.current) {
        console.log('[ReadAlongModal] Starting playback of next sentence');
        soundRef.current.play((success) => {
          if (success) {
            console.log('[ReadAlongModal] Next sentence completed successfully');
            setSentenceFinished(true);
          } else {
            console.error('[ReadAlongModal] Next sentence playback error');
            setIsPlaying(false);
          }
        });
        
        setIsPlaying(true);
      }
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
                  <View style={styles.sentenceHeader}>
                    <Text style={styles.sentencePosition}>
                      {`Sentence ${currentSentenceIndex + 1} of ${sentences.length}`}
                    </Text>
                  </View>
                  
                  {isLoading ? (
                    <View style={styles.loadingContainer}>
                      <Text style={styles.loadingText}>
                        Loading next sentence...
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.textSection}>
                        {sentences[currentSentenceIndex] && sentences[currentSentenceIndex].split(' ').map((word, index) => {
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
                      
                      {/* Sentence translation section */}
                      <View style={styles.sentenceTranslationContainer}>
                        {isTranslatingSentence ? (
                          <Text style={styles.translatingText}>Translating...</Text>
                        ) : (
                          <Text style={styles.sentenceTranslation}>{sentenceTranslation}</Text>
                        )}
                      </View>
                    </>
                  )}
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
                
                {/* All controls in a single row */}
                {!selectionMode && (
                  <View style={styles.allControls}>
                    {/* Previous button */}
                    <TouchableOpacity
                      onPress={handlePreviousSentence}
                      style={[
                        styles.iconButton, 
                        styles.sideButton,
                        (isLoading || currentSentenceIndex === 0) && styles.disabledButton
                      ]}
                      disabled={isLoading || currentSentenceIndex === 0}
                    >
                      <Icon
                        name="chevron-left" 
                        color="#FFFFFF"
                        size={24}
                        style={(isLoading || currentSentenceIndex === 0) && {opacity: 0.5}}
                      />
                    </TouchableOpacity>
                    
                    {/* Restart button */}
                    <TouchableOpacity
                      onPress={handleRestartSentence}
                      style={[styles.iconButton, styles.sideButton, styles.restartButton]}
                      disabled={isLoading}
                    >
                      <Icon
                        name="refresh" 
                        color="#FFFFFF"
                        size={24}
                      />
                    </TouchableOpacity>
                    
                    {/* Center Play/Pause button */}
                    {isLoading ? (
                      <View style={styles.playButton}>
                        <ActivityIndicator size="large" color="#FFFFFF" />
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={handleTogglePlay}
                        style={styles.playButton}
                        disabled={isLoading}
                      >
                        <Icon
                          name={isPlaying ? 'pause' : 'play'} 
                          color="#FFFFFF"
                          size={36}
                        />
                      </TouchableOpacity>
                    )}
                    
                    {/* Speed button */}
                    <TouchableOpacity
                      onPress={handleSlowDown}
                      style={[styles.iconButton, styles.sideButton, styles.speedButton]}
                      disabled={isLoading}
                    >
                      <Icon
                        name="tachometer" 
                        color="#FFFFFF"
                        size={24}
                      />
                    </TouchableOpacity>
                    
                    {/* Next button */}
                    <TouchableOpacity
                      onPress={handleNextSentence}
                      style={[
                        styles.iconButton, 
                        styles.sideButton,
                        (isLoading || currentSentenceIndex === sentences.length - 1) && styles.disabledButton
                      ]}
                      disabled={isLoading || currentSentenceIndex === sentences.length - 1}
                    >
                      <Icon
                        name="chevron-right" 
                        color="#FFFFFF"
                        size={24}
                        style={(isLoading || currentSentenceIndex === sentences.length - 1) && {opacity: 0.5}}
                      />
                    </TouchableOpacity>
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
        handleExplainWord={() => {
          console.log('Explaining word from parent ReadAlongModal');
        }}
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
  loadingButton: {
    backgroundColor: 'rgba(150, 150, 150, 0.5)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentenceHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 5,
  },
  sentencePosition: {
    color: '#FFFFFF',
    fontSize: 14,
    opacity: 0.8,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  sentenceTranslationContainer: {
    marginTop: 15,
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    width: '100%',
  },
  sentenceTranslation: {
    color: '#E0E0E0',
    fontSize: 18,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  translatingText: {
    color: '#AAAAAA',
    fontSize: 16,
    fontStyle: 'italic',
    textAlign: 'center',
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
  speedButton: {
    backgroundColor: 'rgba(255, 193, 7, 0.8)',
  },
  restartButton: {
    backgroundColor: 'rgba(76, 175, 80, 0.8)',
  },
  allControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  sideButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.6)',
  },
  playButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.9)',
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 5,
  },
  disabledButton: {
    backgroundColor: 'rgba(150, 150, 150, 0.5)',
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

