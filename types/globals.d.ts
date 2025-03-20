import BookData from './BookData';

declare global {
  namespace NodeJS {
    interface Global {
      pendingBook: BookData | null;
    }
  }
}