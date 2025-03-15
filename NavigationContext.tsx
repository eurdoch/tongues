import React, { createContext, useState, useContext, ReactNode } from 'react';
import BookData from './types/BookData';

type NavigationContextType = {
  currentBook: BookData,
  setCurrentBook: (book: BookData) => void;
};

const NavigationContext = createContext<NavigationContextType>({
  currentBook: {
    path: '',
    basePath: '',
    language: '',
    navMap: null,
  },
  setCurrentBook: () => {},
});

// Provider component
export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentBook, setCurrentBook] = useState<BookData>({
    path: '',
    basePath: '',
    language: '',
    navMap: null,
  });
  
  return (
    <NavigationContext.Provider
      value={{
        currentBook,
        setCurrentBook,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigationContext = () => useContext(NavigationContext);
