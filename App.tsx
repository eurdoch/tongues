import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import HomeScreen from './HomeScreen';
import ReaderScreen from './ReaderScreen';
import CustomDrawerContent from './CustomDrawerContent';

const Drawer = createDrawerNavigator();

function App() {
  return (
    <NavigationContainer>
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
