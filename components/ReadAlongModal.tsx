import React, { useEffect, useState } from 'react';
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
  handleAudioFinish: (success: boolean) => void;
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
  audioSound,
  timestampData,
  translation,
  handleAudioFinish,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHalfSpeed, setIsHalfSpeed] = useState(false);

  useEffect(() => {
    if (audioSound) {
      audioSound.setSpeed(isHalfSpeed ? 0.5 : 1.0);
      audioSound.play(handleAudioFinish);
      setIsPlaying(true);
    }
    return () => {
      if (audioSound && isPlaying) {
        audioSound.pause();
        setIsPlaying(false);
      }
    };
  }, [audioSound]);
  
  useEffect(() => {
    if (!visible && audioSound && isPlaying) {
      audioSound.pause();
      setIsPlaying(false);
    }
  }, [visible]);

  const handlePlayAudio = () => {
    if (!audioSound) return;
    
    if (isPlaying) {
      audioSound.pause();
      setIsPlaying(false);
    } else {
      audioSound.play(handleAudioFinish);
      setIsPlaying(true);
    }
  };
  
  const togglePlaybackSpeed = () => {
    if (!audioSound) return;
    
    const newSpeed = isHalfSpeed ? 1.0 : 0.5;
    audioSound.setSpeed(newSpeed);
    setIsHalfSpeed(!isHalfSpeed);
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
                <TouchableOpacity onPress={handlePlayAudio} style={styles.playButton}>
                  <Text style={styles.playButtonText}>{isPlaying ? 'Pause' : 'Play'}</Text>
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.contentContainer}>
                <View style={styles.textSection}>
                  <Text style={styles.sectionTitle}>
                    Original Text
                  </Text>
                  <Text style={styles.originalText}>{text}</Text>
                </View>
              </ScrollView>
              
              <View style={styles.controls}>
                <TouchableOpacity
                  onPress={handlePlayAudio}
                  style={styles.controlButton}
                >
                  <Text style={styles.controlButtonText}>
                    {isPlaying ? 'Pause' : 'Play'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  onPress={togglePlaybackSpeed}
                  style={[styles.controlButton, styles.speedButton]}
                >
                  <Text style={styles.controlButtonText}>
                    {isHalfSpeed ? 'Normal Speed' : 'Slow Speed'}
                  </Text>
                </TouchableOpacity>
              </View>
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

