import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Dimensions,
  View,
  TouchableOpacity,
  Text,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';

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
  const { content, title, cssContent } = route.params;
  const [selectedText, setSelectedText] = useState<string>('');
  const [showSelectionModal, setShowSelectionModal] = useState(false);

  // JavaScript to inject for handling text selection
  const injectedJavaScript = `
    let selectionInProgress = false;
    let touchTimeout;

    document.addEventListener('touchstart', () => {
      selectionInProgress = true;
      // Clear any existing timeout
      if (touchTimeout) clearTimeout(touchTimeout);
    });

    document.addEventListener('touchend', () => {
      // Set a small timeout to let the selection finish
      touchTimeout = setTimeout(() => {
        if (selectionInProgress) {
          const selection = window.getSelection();
          const selectedText = selection ? selection.toString() : '';
          if (selectedText) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'selection',
              text: selectedText
            }));
          }
          selectionInProgress = false;
        }
      }, 200);
    });

    // Enable text selection
    document.documentElement.style.webkitUserSelect = 'text';
    document.documentElement.style.userSelect = 'text';

    true;
  `;

  // Create a complete HTML document with CSS and selection handling
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
        <style>
          body {
            font-family: system-ui;
            line-height: 1.5;
            padding: 16px;
            margin: 0;
            font-size: 16px;
            color: #000;
            -webkit-user-select: text;
            user-select: text;
          }
          ::selection {
            background: rgba(0, 125, 255, 0.2);
          }
          * {
            -webkit-touch-callout: default;
          }
          ${cssContent || ''}
        </style>
      </head>
      <body>
        ${content}
      </body>
    </html>
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'selection' && data.text.trim()) {
        setSelectedText(data.text);
        setShowSelectionModal(true);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  };

  const handleCopyText = () => {
    if (selectedText) {
      // Copy to clipboard functionality would go here
      console.log('Copied text:', selectedText);
    }
    setShowSelectionModal(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <WebView
        style={styles.webview}
        source={{ html: htmlContent }}
        originWhitelist={['*']}
        showsVerticalScrollIndicator={true}
        scrollEnabled={true}
        injectedJavaScript={injectedJavaScript}
        onMessage={handleMessage}
        textInteractionEnabled={true}
        allowFileAccess={true}
        domStorageEnabled={true}
        javaScriptEnabled={true}
        mixedContentMode="always"
      />

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
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.button}
                onPress={handleCopyText}
              >
                <Text style={styles.buttonText}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.button, styles.cancelButton]}
                onPress={() => setShowSelectionModal(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
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
  webview: {
    flex: 1,
    width: Dimensions.get('window').width,
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
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ContentScreen;