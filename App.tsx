import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NativeModules, Platform, EmitterSubscription, Alert, AppState } from 'react-native';
import HomeScreen from './screens/HomeScreen';
import ReaderScreen from './screens/ReaderScreen';
import CustomDrawerContent from './components/CustomDrawerContent';
import { NavigationProvider } from './NavigationContext';
import { NavPoint } from './types/NavPoint';

const Drawer = createDrawerNavigator();

export type RootStackParamList = {
  Home: {};
  Reader: { 
    content: string;
    language: string;
    section: NavPoint;
  };
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
          // Both platforms should have TonguesModule now
          if (NativeModules.TonguesModule && NativeModules.TonguesModule.checkPendingFiles) {
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
    
    // Setup event listeners for file opens based on platform
    const handleEpubFileOpen = async (event: any) => {
      console.log('[App] Received openEpubFile event:', event);
      
      const { uri } = event;
      
      if (!uri) {
        console.error('[App] No URI received in openEpubFile event');
        return;
      }
      
      console.log(`[App] Received file URI to open: ${uri}`);
      
      try {
        // Import necessary functions
        const { parseEpub } = require('./parser/EpubLoader');
        const { findFirstContentTag, readTextFile, copyFileToAppStorage } = require('./utils');
        const { useNavigationContext } = require('./NavigationContext');
        
        // Process the epub file properly
        console.log(`[App] Processing epub file: ${uri}`);
        
        // Copy the file to app storage for persistence
        const savedFilePath = await copyFileToAppStorage(uri);
        
        if (savedFilePath) {
          // Parse the epub file
          const book = await parseEpub(savedFilePath);
          
          // Get the first content element
          const firstContentElem = findFirstContentTag(book.navMap);
          const firstContentPath = book.basePath + '/' + firstContentElem.getAttribute('src');
          const firstContents = await readTextFile(firstContentPath);
          
          // Store the book data so it can be accessed by components
          // Define global type if it doesn't exist (needed for TypeScript)
          if (!global.pendingBook) {
            global.pendingBook = null;
          }
          // Store the book data globally
          global.pendingBook = book;
          
          // Navigate to the reader screen
          if (navigationRef.current && navigationRef.current.isReady()) {
            console.log(`[App] Navigation is ready, navigating to Reader with content`);
            navigationRef.current.navigate('Reader', {
              content: firstContents,
              language: book.language,
            });
            console.log(`[App] Navigation.navigate method called`);
          } else {
            console.log(`[App] Navigation not ready yet, setting timeout`);
            // Try again after a delay if navigation isn't ready
            setTimeout(() => {
              if (navigationRef.current && navigationRef.current.isReady()) {
                console.log(`[App] Navigation ready after delay, navigating to Reader`);
                navigationRef.current.navigate('Reader', {
                  content: firstContents,
                  language: book.language,
                });
              } else {
                console.error('[App] Navigation still not ready after delay');
              }
            }, 1000);
          }
        } else {
          console.error('[App] Could not save file to app storage');
        }
      } catch (error) {
        console.error('[App] Error processing epub file:', error);
      }
    };
    
    // Set up event listener for both platforms
    console.log(`[App] Setting up openEpubFile event listener on ${Platform.OS}`);
    const { DeviceEventEmitter } = require('react-native');
    eventListener = DeviceEventEmitter.addListener('openEpubFile', handleEpubFileOpen);
    
    // Check for pending files on both platforms
    setTimeout(() => {
      console.log(`[App] Checking for pending files on ${Platform.OS}`);
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
    
    // Clean up listener on unmount
    return () => {
      if (eventListener) {
        console.log('[App] Removing openEpubFile event listener');
        eventListener.remove();
      }
    };
  }, []);
  
  
  return (
    <NavigationProvider>
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
    </NavigationProvider>
  );
}

export default App
