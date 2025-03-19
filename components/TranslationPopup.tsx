import { useEffect, useState } from "react";
import { View, Animated, Modal, TouchableWithoutFeedback, ScrollView, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from "react-native";
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
  handleExplainWord: parentHandleExplainWord,
}) => {
  const [slideAnim] = useState({ translateX: new Animated.Value(0), translateY: new Animated.Value(0) });
  const { currentBook } = useNavigationContext();
  const [translationSound, setTranslationSound] = useState<Sound | null>(null);
  const [isExplainingLocal, setIsExplainingLocal] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  
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
        fetchSpeechAudio(text, currentBook.language).then(audio => {
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

  const handleExplainWord = async (e: any) => {
    e.preventDefault();
    
    if (!currentBook || !text) return;
    
    setIsExplainingLocal(true);
    setExplanation(null);
    
    try {
      const response = await fetch('https://tongues.directto.link/explain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          word: text, 
          language: currentBook.language 
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setExplanation(data.explanation);
      
      // Also call parent handler if provided
      if (parentHandleExplainWord) {
        parentHandleExplainWord(e);
      }
    } catch (error) {
      console.error('Error explaining text:', error);
      Alert.alert('Error', 'Failed to get explanation. Please try again.');
    } finally {
      setIsExplainingLocal(false);
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
                        <View style={styles.originalTextContainer}>
                          <Text style={styles.popupOriginalText}>{text}</Text>
                          {translationSound && (
                            <Icon name="volume-up" size={22} color="#FFFFFF" onPress={playAudio} style={styles.volumeIcon} />
                          )}
                        </View>
                        <Text style={styles.popupTranslation}>{translation}</Text>
                        
                        {!selectedWordExplanation && !isExplaining && !isExplainingLocal && !explanation && (
                          <TouchableOpacity
                            onPress={handleExplainWord}
                            style={styles.popupExplainButton}
                          >
                            <Text style={styles.controlButtonText}>✨ Explain</Text>
                          </TouchableOpacity>
                        )}
                        
                        {(isExplaining || isExplainingLocal) && (
                          <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" color="#007AFF" />
                            <Text style={styles.loadingText}>Explaining...</Text>
                          </View>
                        )}
                        
                        {selectedWordExplanation && (
                          <View style={styles.explanationContainerWrapper}>
                            <ScrollView style={styles.explanationScrollView}>
                              <View style={styles.explanationContainer}>
                                <Text style={styles.popupExplanation}>{selectedWordExplanation}</Text>
                              </View>
                            </ScrollView>
                          </View>
                        )}
                        
                        {explanation && (
                          <View style={styles.explanationContainerWrapper}>
                            <ScrollView style={styles.explanationScrollView}>
                              <View style={styles.explanationContainer}>
                                <Text style={styles.popupExplanation}>{explanation}</Text>
                              </View>
                            </ScrollView>
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
      flexDirection: 'column',
      flex: 0, // Use flex to naturally size to content
    },
    contentScroll: {
        flexGrow: 0,
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
        paddingBottom: 15, // Add padding at bottom to ensure content isn't cut off
      },
      originalTextContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
      },
      popupOriginalText: {
        color: '#FFFFFF',
        fontSize: 22,
        textAlign: 'left',
        flex: 1,
      },
      volumeIcon: {
        marginLeft: 10,
        padding: 5,
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
        paddingBottom: 10,
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
        flexDirection: 'column',
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
      explanationContainerWrapper: {
        width: '100%',
        maxHeight: 200,
        marginTop: 10,
        marginBottom: 10,
      },
      explanationScrollView: {
        maxHeight: 200,
        width: '100%',
      },
      explanationContainer: {
        padding: 10,
        width: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 8,
      },
}); 
