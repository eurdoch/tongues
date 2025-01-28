import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Dimensions,
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

  // Create a complete HTML document with CSS
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
          }
          ${cssContent || ''}
        </style>
      </head>
      <body>
        ${content}
      </body>
    </html>
  `;

  return (
    <SafeAreaView style={styles.container}>
      <WebView
        style={styles.webview}
        source={{ html: htmlContent }}
        originWhitelist={['*']}
        showsVerticalScrollIndicator={true}
        scrollEnabled={true}
      />
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
});

export default ContentScreen;