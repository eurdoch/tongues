import RNFS from 'react-native-fs';
import Sound from 'react-native-sound';
import { isInSupportedLanguages } from '../types/Language';

/**
 * Get an explanation of a word using Anthropic's Haiku model
 */
export const explainWord = async (
  word: string,
  language: string
): Promise<string> => {
  // Validate inputs
  if (!word || typeof word !== 'string' || word.trim().length === 0) {
    console.error('Invalid word provided to explainWord:', word);
    throw new Error('Invalid word provided');
  }
  
  if (!language || typeof language !== 'string') {
    console.error('Invalid language provided to explainWord:', language);
    throw new Error('Invalid language provided');
  }
  
  // Make sure first letter is capitalized for consistency
  const normalizedLanguage = language.charAt(0).toUpperCase() + language.slice(1).toLowerCase();
  
  console.log('Explaining word:', { word, language: normalizedLanguage });
  
  try {
    const response = await fetch('https://tongues.directto.link/explain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        word: word,
        language: normalizedLanguage,
      }),
    });
    
    console.log('Explanation API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      console.error('Explanation API error:', errorText);
      throw new Error(`Explanation request failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    if (!data.explanation) {
      throw new Error('Explanation API did not return an explanation');
    }
    
    return data.explanation;
  } catch (error) {
    console.error('Error in explainWord:', error);
    throw error;
  }
};

/**
 * Fetch translation from the API
 */
export const translateText = async (
  text: string,
  language: string
): Promise<string> => {
  // Validate inputs
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    console.error('Invalid text provided to translateText:', text);
    throw new Error('Invalid text provided');
  }
  
  if (!language || typeof language !== 'string') {
    console.error('Invalid language provided to translateText:', language);
    throw new Error('Invalid language provided');
  }
  
  // Make sure first letter is capitalized for consistency
  const normalizedLanguage = language.charAt(0).toUpperCase() + language.slice(1).toLowerCase();
  
  console.log('Translating text:', { textLength: text.length, language: normalizedLanguage });
  
  try {
    const response = await fetch('https://tongues.directto.link/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        language: normalizedLanguage,
      }),
    });
    
    console.log('Translation API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      console.error('Translation API error:', errorText);
      throw new Error(`Translation request failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    if (!data.translated_text) {
      throw new Error('Translation API did not return a translated text');
    }
    
    return data.translated_text;
  } catch (error) {
    console.error('Error in translateText:', error);
    throw error;
  }
};

/**
 * Fetch word timestamps from the API
 */
export const fetchWordTimestamps = async (
  text: string,
  language: string
): Promise<Array<{ time: number; type: string; start: number; end: number; value: string }>> => {
  // Validate inputs
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    console.error('Invalid text provided to fetchWordTimestamps:', text);
    throw new Error('Invalid text provided');
  }
  
  if (!language || typeof language !== 'string') {
    console.error('Invalid language provided to fetchWordTimestamps:', language);
    throw new Error('Invalid language provided');
  }
  
  // Make sure first letter is capitalized for consistency
  const normalizedLanguage = language.charAt(0).toUpperCase() + language.slice(1).toLowerCase();
  
  console.log('Fetching timestamps for:', { text, language: normalizedLanguage });
  
  try {
    const response = await fetch('https://tongues.directto.link/marks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        language: normalizedLanguage,
      }),
    });
    
    console.log('Timestamp API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      console.error('Timestamp API error:', errorText);
      throw new Error(`Word timestamps request failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Timestamp API response data:', data);
    
    // The API returns an object with a 'marks' property containing the array
    if (!data || typeof data !== 'object') {
      throw new Error('Timestamps API did not return a valid object');
    }
    
    // Extract the marks array
    if (!data.marks || !Array.isArray(data.marks)) {
      throw new Error('Timestamps API did not return a marks array');
    }
    
    // Verify the structure of at least one item
    if (data.marks.length > 0) {
      const firstItem = data.marks[0];
      if (typeof firstItem.time !== 'number' || typeof firstItem.value !== 'string') {
        console.error('Unexpected timestamp format:', firstItem);
        throw new Error('Timestamps have unexpected format');
      }
    }
    
    return data.marks;
  } catch (error) {
    console.error('Error in fetchWordTimestamps:', error);
    throw error;
  }
};

/**
 * Fetch speech audio from the API and save it to a temporary file
 */
export const fetchSpeechAudio = async (
  text: string,
  language: string,
  previousSound?: Sound | null,
  previousAudioPath?: string | null
): Promise<{ sound: Sound; audioPath: string }> => {
  // Validate inputs
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    console.error('Invalid text provided to fetchSpeechAudio:', text);
    throw new Error('Invalid text provided');
  }
  
  if (!language || typeof language !== 'string') {
    console.error('Invalid language provided to fetchSpeechAudio:', language);
    throw new Error('Invalid language provided');
  }
  
  // Make sure first letter is capitalized for consistency
  const normalizedLanguage = language.charAt(0).toUpperCase() + language.slice(1).toLowerCase();
  
  console.log('Fetching speech audio:', { textLength: text.length, language: normalizedLanguage });
  
  // TODO this should not be in this function, it's creating state side effects outsdie of component
  // Release previous sound if exists
  if (previousSound) {
    previousSound.release();
  }

  // Clear previous audio path
  if (previousAudioPath) {
    try {
      await RNFS.unlink(previousAudioPath);
    } catch (e) {
      console.log('Error removing previous audio file:', e);
    }
  }

  // Make API call to speech service
  const response = await fetch('https://tongues.directto.link/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text,
      language: normalizedLanguage,
    }),
  });

  if (!response.ok) {
    throw new Error(`Speech request failed with status: ${response.status}`);
  }

  // Get audio data as blob
  const audioBlob = await response.blob();

  // Create a temporary file path
  const tempFilePath = `${RNFS.CachesDirectoryPath}/speech_${Date.now()}.mp3`;

  // Convert blob to base64
  const reader = new FileReader();
  reader.readAsDataURL(audioBlob);

  return new Promise((resolve, reject) => {
    reader.onloadend = async () => {
      try {
        if (reader.result) {
          // Extract base64 data (remove the data URL prefix)
          const base64Data = (reader.result as string).split(',')[1];

          // Ensure the previous file is deleted if it exists
          const exists = await RNFS.exists(tempFilePath);
          if (exists) {
            await RNFS.unlink(tempFilePath);
          }

          // Write the file
          await RNFS.writeFile(tempFilePath, base64Data, 'base64');
          console.log('Speech audio saved to:', tempFilePath);

          // Initialize Sound with the file
          Sound.setCategory('Playback');
          const newSound = new Sound(tempFilePath, '', (error) => {
            if (error) {
              console.error('Failed to load sound:', error);
              reject(error);
            } else {
              resolve({ sound: newSound, audioPath: tempFilePath });
            }
          });
        }
      } catch (error) {
        console.error('Error saving audio file:', error);
        reject(error);
      }
    };

    reader.onerror = reject;
  });
};

export async function loadFileToBlob(filePath: string) {
  try {
    // Read the file as base64
    const base64Data = await RNFS.readFile(filePath, 'base64');
    
    // Determine MIME type based on file extension (you can expand this)
    const extension = filePath.split('.').pop()?.toLowerCase() || '';
    let mimeType = 'application/octet-stream'; // Default
    
    // Set common MIME types
    if (extension === 'mp3') mimeType = 'audio/mp3';
    else if (extension === 'wav') mimeType = 'audio/wav';
    else if (extension === 'aac') mimeType = 'audio/aac';
    else if (extension === 'ogg') mimeType = 'audio/ogg';
    else if (extension === 'm4a') mimeType = 'audio/mp4';
    
    // Convert base64 to a Blob
    const response = await fetch(`data:${mimeType};base64,${base64Data}`);
    const blob = await response.blob();
    
    return blob;
  } catch (error) {
    console.error('Error loading file to Blob:', error);
    throw error;
  }
}

export const determineLanguage = async (excerpt: string) => {
  const response = await fetch('https://tongues.directto.link/language', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: excerpt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error details');
    throw new Error(`Language request failed with status: ${response.status} ${errorText}`);
  }

  const jsonResponse = await response.json();

  if (!isInSupportedLanguages) {
    return { language: null };
  } else {
    return jsonResponse;
  }
}
