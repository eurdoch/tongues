import React, { createContext, useState, useContext, ReactNode } from 'react';
import BookData from './types/BookData';

type NavigationContextType = {
  currentBook: BookData | null,
  setCurrentBook: (book: BookData | null) => void;
  isBookLoading: boolean;
  setIsBookLoading: (isLoading: boolean) => void;
};

const NavigationContext = createContext<NavigationContextType>({
  currentBook: null,
  setCurrentBook: () => {},
  isBookLoading: false,
  setIsBookLoading: () => {},
});

// Provider component
export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentBook, setCurrentBook] = useState<BookData | null>(null);
  const [isBookLoading, setIsBookLoading] = useState<boolean>(false);
  
  return (
    <NavigationContext.Provider
      value={{
        currentBook,
        setCurrentBook,
        isBookLoading,
        setIsBookLoading,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigationContext = () => useContext(NavigationContext);
