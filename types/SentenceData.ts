import Sound from "react-native-sound";
import TimestampMark from "./TimestampMark";

export default interface SentenceData {
  sound: Sound;
  timestamps: TimestampMark[];
  words: string[];
}