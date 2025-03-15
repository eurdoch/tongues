import React, { createContext, useState, useContext, ReactNode } from 'react';
import BookData from './types/BookData';

type NavigationContextType = {
  currentBook: BookData | null,
  setCurrentBook: (book: BookData | null) => void;
};

const NavigationContext = createContext<NavigationContextType>({
  currentBook: null,
  setCurrentBook: () => {},
});

// Provider component
export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentBook, setCurrentBook] = useState<BookData | null>(null);
  
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
