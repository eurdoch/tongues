import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import RNFS from 'react-native-fs';

const ImageFromUri = ({ uri }) => {
  const [imageUri, setImageUri] = useState(null);

  useEffect(() => {
    const loadImage = async () => {
      try {
        // Check if the file exists
        const exists = await RNFS.exists(uri);
        
        if (exists) {
          // For local files, you can use the file:// protocol directly
          if (uri.startsWith('file://')) {
            setImageUri(uri);
          } else {
            // If it's a path without the protocol, add it
            setImageUri(`file://${uri}`);
          }
        } else {
          console.error('File does not exist:', uri);
        }
      } catch (error) {
        console.error('Error loading image:', error);
      }
    };

    loadImage();
  }, [uri]);

  return (
    <View style={styles.container}>
      {imageUri ? (
        <Image 
          source={{ uri: imageUri }} 
          style={styles.image} 
          resizeMode="contain"
        />
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
});

export default ImageFromUri;
