import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NativeModules, Platform, EmitterSubscription, Alert, AppState } from 'react-native';
import HomeScreen from './HomeScreen';
import ReaderScreen from './ReaderScreen';
import CustomDrawerContent from './CustomDrawerContent';

const Drawer = createDrawerNavigator();

export type RootStackParamList = {
  Home: undefined;
  Reader: { fileUri: string };
};

function App() {
  // Create a ref for navigation actions
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  
  // Listen to app state changes
  useEffect(() => {
    const appStateListener = AppState.addEventListener("change", nextAppState => {
      console.log(`[App] App state changed to: ${nextAppState}`);
      if (nextAppState === "active") {
        // Directly try to check for files when app becomes active
        setTimeout(() => {
          console.log("[App] App became active, checking for files");
          if (Platform.OS === 'android' && NativeModules.TonguesModule) {
            NativeModules.TonguesModule.checkPendingFiles()
              .then((result: any) => console.log("[App] checkPendingFiles result:", result))
              .catch((error: any) => console.log("[App] checkPendingFiles error:", error));
          }
        }, 500);
      }
    });
    
    return () => {
      appStateListener.remove();
    };
  }, []);
  
  useEffect(() => {
    let eventListener: EmitterSubscription | undefined;
    
    // Set up event listener for EPUB file opens
    if (Platform.OS === 'android') {
      // Import DeviceEventEmitter directly to avoid NativeEventEmitter issues
      const DeviceEventEmitter = require('react-native').DeviceEventEmitter;
      
      console.log('[App] Setting up openEpubFile event listener with DeviceEventEmitter');
      
      // Add a listener for the openEpubFile event
      eventListener = DeviceEventEmitter.addListener('openEpubFile', (event: any) => {
        console.log('[App] Received openEpubFile event:', event);
        
        const { uri } = event;
        
        if (!uri) {
          console.error('[App] No URI received in openEpubFile event');
          return;
        }
        
        console.log(`[App] Received file URI to open: ${uri}`);
        
        // Simple navigation approach
        try {
          if (navigationRef.current && navigationRef.current.isReady()) {
            console.log(`[App] Navigation is ready, navigating to Reader with URI: ${uri}`);
            
            // Basic navigation parameters
            const params = {
              fileUri: uri,
              shouldRefreshHomeAfterClose: true,
              openedExternally: true,
              timestamp: Date.now(), // Force params to be different
              checkForDuplicates: true // Check for duplicates in the library
            };
            
            // Navigate directly to Reader screen
            navigationRef.current.navigate('Reader', params);
            console.log(`[App] Navigation.navigate method called`);
          } else {
            console.log(`[App] Navigation not ready yet, setting timeout`);
            // Try again after a delay if navigation isn't ready
            setTimeout(() => {
              if (navigationRef.current && navigationRef.current.isReady()) {
                console.log(`[App] Navigation ready after delay, navigating to Reader`);
                navigationRef.current.navigate('Reader', {
                  fileUri: uri,
                  shouldRefreshHomeAfterClose: true,
                  openedExternally: true,
                  timestamp: Date.now(),
                  checkForDuplicates: true
                });
              } else {
                console.error('[App] Navigation still not ready after delay');
              }
            }, 1000);
          }
        } catch (error) {
          console.error('[App] Error during navigation:', error);
        }
      });
      
      // Try to check for pending files
      setTimeout(() => {
        console.log('[App] Checking for pending files');
        try {
          if (NativeModules.TonguesModule && NativeModules.TonguesModule.checkPendingFiles) {
            NativeModules.TonguesModule.checkPendingFiles()
              .then((result: any) => console.log('[App] checkPendingFiles result:', result))
              .catch((error: any) => console.error('[App] checkPendingFiles error:', error));
          }
        } catch (error) {
          console.error('[App] Error checking pending files:', error);
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
        <Drawer.Screen 
          name="Reader" 
          component={ReaderScreen}
          options={{ unmountOnBlur: false }} // Ensure component doesn't unmount between navigations
        />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}

export default App
