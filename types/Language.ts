export function isInSupportedLanguages(value: string): value is SupportedLanguages {
  return Object.values(SupportedLanguages).includes(value as SupportedLanguages);
} 

export enum SupportedLanguages {
  French = 'French',
  Spanish = 'Spanish',
  German = 'German',
  Dutch = 'Dutch', 
  Italian = 'Italian'
}