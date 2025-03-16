import { useEffect, useRef, useState } from "react";
import { View, Animated, Modal, TouchableWithoutFeedback, ScrollView, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import Sound from "react-native-sound";
import Icon from 'react-native-vector-icons/FontAwesome';
import { fetchSpeechAudio } from "../services/TranslationService";
import { useNavigationContext } from "../NavigationContext";

const TranslationPopup: React.FC<any> = ({ 
  visible, 
  onClose, 
  isTranslating,
  text,
  translation,
  isExplaining,
  selectedWordExplanation,
  handleExplainWord,
}) => {
  const [slideAnim] = useState({ translateX: new Animated.Value(0), translateY: new Animated.Value(0) });
  const { currentBook } = useNavigationContext();
  const [translationSound, setTranslationSound] = useState<Sound | null>(null);
  
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

      if (currentBook) {
        console.log('DEBUG text: ', text);
        fetchSpeechAudio(text, currentBook?.language).then(audio => {
            setTranslationSound(audio.sound);
        })
      }
    }
  }, [visible]);
  
  if (!visible) return null;

  const playAudio = (e: any) => {
    e.preventDefault();
    if (translationSound) {
        translationSound.play();
    }
  }
  
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
                        <Text style={styles.popupOriginalText}>{text}</Text>
                        <Text style={styles.popupTranslation}>{translation}</Text>
                        { translationSound && <Icon name="volume-up" onPress={playAudio} /> }
                        
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

export default TranslationPopup;

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
      controlButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '500',
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
      explanationContainer: {
        padding: 10,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
      },
}); 