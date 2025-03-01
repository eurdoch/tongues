import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NativeEventEmitter, NativeModules, Platform, EmitterSubscription } from 'react-native';
import HomeScreen from './HomeScreen';
import ReaderScreen from './ReaderScreen';
import CustomDrawerContent from './CustomDrawerContent';

const Drawer = createDrawerNavigator();

// Type definition for the navigation ref
type RootStackParamList = {
  Home: undefined;
  Reader: { fileUri: string };
};

function App() {
  // Create a ref for navigation actions
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  
  useEffect(() => {
    let eventListener: EmitterSubscription | undefined;
    
    // Set up event listener for EPUB file opens
    if (Platform.OS === 'android') {
      // Import DeviceEventEmitter directly to avoid NativeEventEmitter issues
      const DeviceEventEmitter = require('react-native').DeviceEventEmitter;
      
      console.log('Setting up openEpubFile event listener with DeviceEventEmitter');
      
      // Add a listener for the openEpubFile event
      eventListener = DeviceEventEmitter.addListener('openEpubFile', (event) => {
        console.log('Received openEpubFile event:', event);
        const { uri } = event;
        
        if (uri && navigationRef.current) {
          console.log('Navigating to Reader with URI:', uri);
          
          // Use a multi-attempt approach with increasing delays
          const attemptNavigation = (attempts: number = 0, maxAttempts: number = 5) => {
            if (attempts >= maxAttempts) {
              console.error(`Failed to navigate after ${maxAttempts} attempts`);
              return;
            }
            
            try {
              if (navigationRef.current && navigationRef.current.isReady()) {
                console.log(`Navigation attempt ${attempts+1} successful: ${uri}`);
                navigationRef.current.navigate('Reader', { fileUri: uri });
              } else {
                console.log(`Navigation not ready on attempt ${attempts+1}, retry in ${(attempts+1)*500}ms`);
                setTimeout(() => attemptNavigation(attempts + 1), (attempts + 1) * 500);
              }
            } catch (error) {
              console.error(`Navigation error on attempt ${attempts+1}:`, error);
              setTimeout(() => attemptNavigation(attempts + 1), (attempts + 1) * 500);
            }
          };
          
          // Start navigation attempts
          attemptNavigation();
        } else {
          console.error('Unable to navigate to Reader - missing uri or navigationRef:', {
            hasUri: !!uri,
            hasNavigationRef: !!navigationRef.current
          });
        }
      });
    }
    
    // Clean up listener on unmount
    return () => {
      if (eventListener) {
        console.log('Removing openEpubFile event listener');
        eventListener.remove();
      }
    };
  }, []);
  
  return (
    <NavigationContainer ref={navigationRef}>
      <Drawer.Navigator
        initialRouteName='Home'
        drawerContent={() => <CustomDrawerContent />}
        screenOptions={{
          drawerStyle: {
            width: 240,
          },
        }}
      >
        <Drawer.Screen name="Home" component={HomeScreen} />
        <Drawer.Screen name="Reader" component={ReaderScreen} />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}

export default App
