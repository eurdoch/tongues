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
      
      console.log('[App] Setting up openEpubFile event listener with DeviceEventEmitter');
      
      // Add a listener for the openEpubFile event
      eventListener = DeviceEventEmitter.addListener('openEpubFile', (event) => {
        console.log('[App] Received openEpubFile event:', event);
        const { uri } = event;
        
        if (!uri) {
          console.error('[App] No URI received in openEpubFile event');
          return;
        }
        
        console.log(`[App] Received file URI to open: ${uri}`);
        
        // Use a multi-attempt approach with increasing delays
        const attemptNavigation = (attempts: number = 0, maxAttempts: number = 10) => {
          if (attempts >= maxAttempts) {
            console.error(`[App] Failed to navigate after ${maxAttempts} attempts`);
            return;
          }
          
          try {
            if (navigationRef.current && navigationRef.current.isReady()) {
              console.log(`[App] Navigation attempt ${attempts+1} successful, navigating to Reader with URI: ${uri}`);
              
              // Get current state to preserve drawer state
              const currentState = navigationRef.current.getState();
              
              console.log(`[App] Navigating directly to Reader with file: ${uri}`);
              
              // Directly navigate to Reader screen
              setTimeout(() => {
                navigationRef.current.dispatch({
                  type: 'NAVIGATE',
                  payload: {
                    name: 'Reader',
                    params: {
                      fileUri: uri,
                      shouldRefreshHomeAfterClose: true,
                      openedExternally: true,
                      timestamp: Date.now(), // Force params to be different
                      checkForDuplicates: true // Flag to indicate we should check for duplicates
                    }
                  }
                });
                
                // Log success
                console.log(`[App] Navigation to Reader dispatched successfully`);
              }, 100);
            } else {
              console.log(`[App] Navigation not ready on attempt ${attempts+1}, retry in ${(attempts+1)*500}ms`);
              setTimeout(() => attemptNavigation(attempts + 1), (attempts + 1) * 500);
            }
          } catch (error) {
            console.error(`[App] Navigation error on attempt ${attempts+1}:`, error);
            setTimeout(() => attemptNavigation(attempts + 1), (attempts + 1) * 500);
          }
        };
        
        // Start navigation attempts
        attemptNavigation();
      });
      
      // Try to manually trigger the event if there's a pending file
      // This helps ensure we don't miss events that happened before the listener was ready
      setTimeout(() => {
        console.log('[App] Checking for early file open events that might have been missed');
        try {
          // This is a no-op if NativeModules.TonguesModule doesn't exist
          if (NativeModules.TonguesModule && NativeModules.TonguesModule.checkPendingFiles) {
            NativeModules.TonguesModule.checkPendingFiles();
          }
        } catch (error) {
          console.log('[App] No pending file check method available:', error);
        }
      }, 2000);
    }
    
    // Clean up listener on unmount
    return () => {
      if (eventListener) {
        console.log('[App] Removing openEpubFile event listener');
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
