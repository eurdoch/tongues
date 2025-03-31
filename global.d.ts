import BookData from "./types/BookData";

declare global {
  var pendingBook: BookData | null;
}
