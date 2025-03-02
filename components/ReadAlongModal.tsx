import React, { useState, useEffect, useRef } from 'react';
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
  audioBuffer?: Blob;
  timestampData: TimestampData;
  translation: string;
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
  audioBuffer,
  timestampData,
  translation,
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sound, setSound] = useState<Sound | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [wordTimestamps, setWordTimestamps] = useState<WordTimestamp[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(-1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch translation, audio, and word timestamps when visible
  useEffect(() => {
    if (visible && text && language) {
      loadData();
    }
    
    return () => {
      // Cleanup when modal is closed
      if (sound) {
        sound.stop();
        sound.release();
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [visible, text, language, audioBuffer, timestampData]);

  const loadData = async () => {
    if (!text || !language) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Convert timestamp data to the format needed by the component
      const timestamps = timestampData.marks.map(mark => ({
        word: mark.value,
        start: mark.time / 1000, // Convert to seconds
        end: (mark.time / 1000) + 0.3 // Approximate end time
      }));
      
      setWordTimestamps(timestamps);
      
      // Use the provided audio buffer if available
      if (audioBuffer) {
        await processAudioBuffer(audioBuffer);
      }
    } catch (err) {
      console.error('Error loading read-along data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const processAudioBuffer = async (buffer: Blob) => {
    // Clean up previous sound if exists
    if (sound) {
      sound.release();
    }
    
    // Clean up previous audio file if exists
    if (audioPath) {
      try {
        await RNFS.unlink(audioPath);
      } catch (e) {
        console.log('Error removing previous audio file:', e);
      }
    }
    
    try {
      // Create a temporary file path
      const tempFilePath = `${RNFS.CachesDirectoryPath}/speech_${Date.now()}.mp3`;
      
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(buffer);
      
      return new Promise<void>((resolve, reject) => {
        reader.onloadend = async () => {
          try {
            if (reader.result) {
              // Extract base64 data (remove the data URL prefix)
              const base64Data = (reader.result as string).split(',')[1];
              
              // Ensure the previous file is deleted if it exists
              const exists = await RNFS.exists(tempFilePath);
              if (exists) {
                await RNFS.unlink(tempFilePath);
              }
              
              // Write the file
              await RNFS.writeFile(tempFilePath, base64Data, 'base64');
              console.log('Speech audio saved to:', tempFilePath);
              
              // Initialize Sound with the file
              Sound.setCategory('Playback');
              const newSound = new Sound(tempFilePath, '', (error) => {
                if (error) {
                  console.error('Failed to load sound:', error);
                  reject(error);
                } else {
                  setSound(newSound);
                  setAudioPath(tempFilePath);
                  resolve();
                }
              });
            }
          } catch (error) {
            console.error('Error saving audio file:', error);
            reject(error);
          }
        };
        
        reader.onerror = reject;
      });
    } catch (error) {
      console.error('Error processing audio buffer:', error);
      throw error;
    }
  };

  const playAudio = () => {
    if (!sound) return;
    
    setIsPlaying(true);
    setCurrentWordIndex(-1);
    
    // Start the audio
    sound.play((success) => {
      if (success) {
        console.log('Audio playback finished successfully');
      } else {
        console.log('Audio playback failed');
      }
      setIsPlaying(false);
      setCurrentWordIndex(-1);
    });
    
    // Start word highlighting based on timestamps
    startWordHighlighting();
  };
  
  const stopAudio = () => {
    if (sound) {
      sound.stop();
      setIsPlaying(false);
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setCurrentWordIndex(-1);
  };
  
  const startWordHighlighting = () => {
    if (!wordTimestamps.length) return;
    
    // Reset current word index
    setCurrentWordIndex(-1);
    
    // Function to schedule highlighting for each word
    const scheduleHighlights = () => {
      wordTimestamps.forEach((timestamp, index) => {
        timerRef.current = setTimeout(() => {
          setCurrentWordIndex(index);
        }, timestamp.start * 1000);
      });
      
      // Reset highlighting after last word
      if (wordTimestamps.length > 0) {
        const lastTimestamp = wordTimestamps[wordTimestamps.length - 1];
        timerRef.current = setTimeout(() => {
          setCurrentWordIndex(-1);
        }, (lastTimestamp.end + 0.5) * 1000);
      }
    };
    
    scheduleHighlights();
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
                  <Text style={styles.loadingText}>Loading...</Text>
                </View>
              ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : !sound && audioBuffer ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.loadingText}>Processing audio...</Text>
                </View>
              ) : (
                <>
                  <ScrollView style={styles.contentContainer}>
                    <View style={styles.textSection}>
                      <Text style={styles.sectionTitle}>Original Text:</Text>
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
                    <TouchableOpacity
                      style={[styles.controlButton, !sound && { opacity: 0.5 }]}
                      disabled={!sound}
                      onPress={isPlaying ? stopAudio : playAudio}
                    >
                      <Text style={styles.controlButtonText}>
                        {isPlaying ? '■ Stop' : '▶ Play'}
                      </Text>
                    </TouchableOpacity>
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
    justifyContent: 'center',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
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
});

export default ReadAlongModal;