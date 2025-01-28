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
  const [translation, setTranslation] = useState<string>('');
  const [showSelectionModal, setShowSelectionModal] = useState(false);

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
            -webkit-touch-callout: none !important;
            touch-callout: none !important;
            -webkit-tap-highlight-color: transparent;
          }
          
          * {
            -webkit-touch-callout: none !important;
            touch-callout: none !important;
            -webkit-tap-highlight-color: transparent;
          }

          #content-container {
            -webkit-user-select: text;
            user-select: text;
          }
          
          ::selection {
            background: rgba(0, 125, 255, 0.2);
          }
          ${cssContent || ''}
        </style>
      </head>
      <body>
        <div id="content-container">${content}</div>
      </body>
    </html>
  `;

  const injectedJavaScript = `
    let lastSelection = '';
    let selectionTimer = null;

    // Watch for selection changes
    document.addEventListener('selectionchange', () => {
      // Clear any existing timer
      if (selectionTimer) {
        clearTimeout(selectionTimer);
      }

      // Start a new timer
      selectionTimer = setTimeout(() => {
        const selection = window.getSelection();
        const currentSelection = selection ? selection.toString().trim() : '';

        // Only fire events if selection has changed
        if (currentSelection !== lastSelection) {
          lastSelection = currentSelection;
          
          // First send touchend
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'touchend',
            text: ''
          }));

          // Then, if there's selected text, send it
          if (currentSelection) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'selection',
              text: currentSelection
            }));
          }
        }
      }, 300);  // Wait for selection to stabilize
    });

    // Handle regular taps
    document.addEventListener('touchend', (e) => {
      const selection = window.getSelection();
      const currentSelection = selection ? selection.toString().trim() : '';
      
      // Only send touchend for non-selection touches
      if (!currentSelection) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'touchend',
          text: ''
        }));
      }
    }, false);

    // Enable text selection
    document.documentElement.style.webkitUserSelect = 'text';
    document.documentElement.style.userSelect = 'text';
    document.body.style.webkitUserSelect = 'text';
    document.body.style.userSelect = 'text';

    true;
`;

  const translateSelection = async (text: string, language: string) => {
    try {
      const response = await fetch('https://tongues.directto.link/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text, language })
      });
      const data = await response.json();
      setTranslation(data.translated_text);
      setShowSelectionModal(true);
    } catch (error) {
      console.error(error);
    }
  }
   
  const handleMessage = (event: any) => {
    console.log(event);
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'selection' && data.text.trim()) {
        setSelectedText(data.text);
        translateSelection(data.text, "French");
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
        scalesPageToFit={false}
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
              <Text style={styles.selectedText}>{translation}</Text>
            </ScrollView>
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
