// NavigationContext.tsx
import React, { createContext, useState, useContext, ReactNode } from 'react';

type NavigationContextType = {
  navMap: any;
  setNavMap: (navMap: any) => void;
  currentBasePath: string;
  setCurrentBasePath: (basePath: string) => void;
  // Add other shared state as needed
};

// Create context with default values
const NavigationContext = createContext<NavigationContextType>({
  navMap: null,
  setNavMap: () => {},
  currentBasePath: '',
  setCurrentBasePath: () => {},
});

// Provider component
export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [navMap, setNavMap] = useState<any>(null);
  const [currentBasePath, setCurrentBasePath] = useState<string>('');
  
  return (
    <NavigationContext.Provider
      value={{
        navMap,
        setNavMap,
        currentBasePath,
        setCurrentBasePath
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

// Custom hook for using this context
export const useNavigationContext = () => useContext(NavigationContext);
