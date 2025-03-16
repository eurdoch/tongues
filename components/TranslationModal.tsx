import React from 'react';
import { StyleSheet, View, Modal, TouchableOpacity } from 'react-native';
import GestureText from '../GestureText';
import Sound from 'react-native-sound';

interface TranslationModalProps {
  visible: boolean;
  originalText: string | null;
  translatedText: string | null;
  language: string;
  sound: Sound | null;
  isPlaying: boolean;
  onClose: () => void;
  onPlayAudio: () => void;
  onStopAudio: () => void;
}

// TODO flagged for deletion
const TranslationModal: React.FC<TranslationModalProps> = ({
  visible,
  originalText,
  translatedText,
  language,
  sound,
  isPlaying,
  onClose,
  onPlayAudio,
  onStopAudio
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity 
          activeOpacity={1}
          style={styles.translationContainer}
          onPress={(e) => e.stopPropagation()} // Prevent touch events from bubbling to parent
        >
          <View style={styles.translationResult}>
            <View style={styles.translationHeader}>
              <GestureText style={styles.translationHeaderText} selectable={false}>
                {language} Translation
              </GestureText>
              
              <View style={styles.translationControls}>
                {sound && (
                  <TouchableOpacity 
                    style={[styles.audioButton, isPlaying && styles.audioButtonActive]}
                    onPress={isPlaying ? onStopAudio : onPlayAudio}
                  >
                    <GestureText style={styles.audioButtonText} selectable={false}>
                      {isPlaying ? '■' : '▶'}
                    </GestureText>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.originalTextContainer}>
              <GestureText style={styles.originalText} selectable={true}>
                {originalText}
              </GestureText>
            </View>
            
            <View style={styles.translatedTextContainer}>
              <GestureText style={styles.translatedText} selectable={true}>
                {translatedText}
              </GestureText>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
    paddingBottom: 40,
  },
  translationContainer: {
    marginHorizontal: 20,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  translationResult: {
    backgroundColor: 'rgba(28, 28, 30, 0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  translationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(0, 122, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
  },
  translationHeaderText: {
    color: 'white',
    fontSize: 17,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  translationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    marginRight: 30,
  },
  originalTextContainer: {
    padding: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(45, 45, 48, 0.5)',
  },
  originalText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 16,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  translatedTextContainer: {
    padding: 20,
    paddingTop: 14,
    backgroundColor: 'rgba(28, 28, 30, 0.97)',
  },
  translatedText: {
    color: 'white',
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  audioButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  audioButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  audioButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default TranslationModal;
