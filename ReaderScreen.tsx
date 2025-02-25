import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRoute } from '@react-navigation/native';

function ReaderScreen() {
  const route = useRoute();
  const { content } = route.params || { content: 'No content available' };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.content}>{content}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
});

export default ReaderScreen;