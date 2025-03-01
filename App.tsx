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
      const eventEmitter = new NativeEventEmitter();
      
      console.log('Setting up openEpubFile event listener');
      
      eventListener = eventEmitter.addListener('openEpubFile', (event) => {
        console.log('Received openEpubFile event:', event);
        const { uri } = event;
        
        if (uri && navigationRef.current) {
          console.log('Navigating to Reader with URI:', uri);
          
          // Small delay to ensure navigation is ready
          setTimeout(() => {
            navigationRef.current?.navigate('Reader', { fileUri: uri });
          }, 500);
        } else {
          console.error('Unable to navigate to Reader:', uri, navigationRef.current);
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
