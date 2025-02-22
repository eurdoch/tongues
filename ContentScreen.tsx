import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  Modal,
  GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Sound from 'react-native-sound';
import RNFS from 'react-native-fs';
import HTMLParser from 'node-html-parser';
import GestureText from './GestureText';
import { getSelectedText } from './TextSelection';

type ContentScreenProps = {
  route: {
    params: {
      content: string;
      title: string;
      cssContent?: string;
    };
  };
};

function ContentScreen({ route }: ContentScreenProps): React.JSX.Element {
  const { content, title } = route.params;
  const [selectedText, setSelectedText] = useState<string>('');
  const [translation, setTranslation] = useState<string>('');
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [parsedContent, setParsedContent] = useState<any[]>([]);

  useEffect(() => {
    parseContent();
  }, [content]);

  const parseContent = () => {
    // Parse the HTML content
    const root = HTMLParser.parse(content);
    const elements = parseElement(root);
    setParsedContent(elements);
  };

  const parseElement = (node: any): any[] => {
    if (!node) return [];

    // If the node is a text node, return it directly
    if (node.nodeType === 3) {
      return [{ type: 'text', content: node.text.trim() }];
    }

    let elements: any[] = [];
    
    // Parse child nodes
    node.childNodes.forEach((child: any) => {
      if (child.nodeType === 3 && child.text.trim()) {
        // Text node
        elements.push({ type: 'text', content: child.text.trim() });
      } else if (child.nodeType === 1) {
        // Element node
        switch (child.tagName.toLowerCase()) {
          case 'h1':
          case 'h2':
          case 'h3':
          case 'h4':
          case 'h5':
          case 'h6':
            elements.push({
              type: 'heading',
              level: parseInt(child.tagName[1]),
              content: child.text.trim(),
            });
            break;
          case 'p':
            elements.push({
              type: 'paragraph',
              content: child.text.trim(),
            });
            break;
          case 'ul':
          case 'ol':
            elements.push({
              type: child.tagName.toLowerCase(),
              items: child.querySelectorAll('li').map((li: any) => li.text.trim()),
            });
            break;
          case 'div':
            elements = [...elements, ...parseElement(child)];
            break;
          default:
            if (child.text.trim()) {
              elements.push({ type: 'text', content: child.text.trim() });
            }
        }
      }
    });

    return elements;
  };

  // Function to convert Uint8Array to base64
  const arrayBufferToBase64 = (buffer: Uint8Array): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const translateSelection = async (text: string, language: string) => {
    try {
      // Translation request
      const translateResponse = await fetch('https://tongues.directto.link/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text, language })
      });
      const translateData = await translateResponse.json();
      setTranslation(translateData.translated_text);
      console.log("Translated text: ", translateData);

      // Speech request
      const speechResponse = await fetch('https://tongues.directto.link/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text, language })
      });

      // Get array buffer from response and convert to Uint8Array
      const buffer = await speechResponse.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      setAudioData(uint8Array);
      
      setShowSelectionModal(true);
    } catch (error) {
      console.error(error);
    }
  };

  const handleTextSelection = (text: string) => {
    setSelectedText(text);
    translateSelection(text, "French");
  };

  const playAudio = async () => {
    if (!audioData || isPlaying) return;

    try {
      setIsPlaying(true);

      // Create a temporary file to play the audio
      const tempFile = `${RNFS.CachesDirectoryPath}/temp_audio_${Date.now()}.mp3`;
      
      // Write the binary data to file using our base64 conversion
      await RNFS.writeFile(
        tempFile,
        arrayBufferToBase64(audioData),
        'base64'
      );

      // Initialize sound with the correct file path
      const sound = new Sound(tempFile, '', (error) => {
        if (error) {
          console.error('Error loading sound:', error);
          setIsPlaying(false);
          // Clean up temp file
          RNFS.unlink(tempFile).catch(err => 
            console.error('Error removing temporary audio file:', err)
          );
          return;
        }

        // Play the sound
        sound.play((success) => {
          if (!success) {
            console.error('Sound playback failed');
          }
          sound.release();
          setIsPlaying(false);
          // Clean up temp file
          RNFS.unlink(tempFile).catch(err => 
            console.error('Error removing temporary audio file:', err)
          );
        });
      });
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlaying(false);
    }
  };

  const renderContent = (element: any, index: number) => {
    switch (element.type) {
      case 'heading':
        return (
          <GestureText
            onPressOut={handleOnPressOut}
            key={index}
            style={[styles.heading, { fontSize: 28 - (element.level * 2) }]}
            selectable
          >
            {element.content}
          </GestureText>
        );
      case 'paragraph':
        return (
          <GestureText
            onPressOut={handleOnPressOut}
            key={index}
            style={styles.paragraph}
            selectable
          >
            {element.content}
          </GestureText>
        );
      case 'ul':
      case 'ol':
        return (
          <View key={index} style={styles.list}>
            {element.items.map((item: string, idx: number) => (
              <View key={idx} style={styles.listItem}>
                <Text style={styles.bullet}>
                  {element.type === 'ul' ? '•' : `${idx + 1}.`}
                </Text>
                <Text
                  style={styles.listItemText}
                  selectable
                >
                  {item}
                </Text>
              </View>
            ))}
          </View>
        );
      case 'text':
        return (
          <GestureText
            onPressOut={handleOnPressOut}
            key={index}
            style={styles.text}
            selectable
          >
            {element.content}
          </GestureText>
        );
      default:
        return null;
    }
  };

  const handleOnPressOut = async (_event: GestureResponderEvent) => {
    const selectedText = await getSelectedText();
    if (selectedText) {
      handleTextSelection(selectedText);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {parsedContent.map((element, index) => renderContent(element, index))}
      </ScrollView>

      <Modal
        visible={showSelectionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSelectionModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSelectionModal(false)}
        >
          <View style={styles.modalContent}>
            <ScrollView style={styles.selectedTextContainer}>
              <Text style={styles.selectedText}>{selectedText}</Text>
              <Text style={styles.selectedText}>{translation}</Text>
            </ScrollView>
            {audioData && (
              <TouchableOpacity
                style={[styles.button, styles.playButton]}
                onPress={playAudio}
                disabled={isPlaying}
              >
                <Text style={styles.buttonText}>
                  {isPlaying ? 'Playing...' : 'Play Audio'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  heading: {
    fontWeight: 'bold',
    marginVertical: 8,
    color: '#000',
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    marginVertical: 8,
    color: '#000',
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
    marginVertical: 4,
    color: '#000',
  },
  list: {
    marginVertical: 8,
  },
  listItem: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingLeft: 16,
  },
  bullet: {
    width: 20,
    fontSize: 16,
    color: '#000',
  },
  listItemText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: '#000',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '80%',
    maxHeight: '50%',
  },
  selectedTextContainer: {
    maxHeight: 200,
    marginBottom: 20,
  },
  selectedText: {
    fontSize: 16,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  playButton: {
    backgroundColor: '#34C759',
    marginTop: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ContentScreen;
