/**
 * Extracts sentences from a JSON object representing DOM elements
 * @param jsonObject An array of elements with type, props, and children properties
 * @returns An array of sentences extracted from the text content
 */
export function extractSentences(jsonObject: any[]): string[] {
    const sentences: string[] = [];
    const sentenceRegex = /[^.!?]+[.!?]+/g;
    
    // Process each element in the array
    jsonObject.forEach(element => {
      // Skip image elements and other non-text content
      if (element.type === 'img' || element.type === 'image' || element.type === 'svg') {
        return;
      }
      
      // Only process elements that have children
      if (element.children && Array.isArray(element.children)) {
        // Process each child in the element
        element.children.forEach((child: any) => {
          // If the child is a string, extract sentences from it
          if (typeof child === 'string') {
            // Clean the text - replace multiple spaces, newlines and tabs with a single space
            const cleanedText = child.replace(/\s+/g, ' ').trim();
            
            // Skip empty strings
            if (cleanedText.length === 0) {
              return;
            }
            
            const matches = cleanedText.match(sentenceRegex);
            if (matches) {
              // Add the extracted sentences to our result array
              sentences.push(...matches.map(sentence => sentence.trim()));
            } else if (cleanedText.length > 5) {
              // If no matches but text is substantial, it might be a fragment without punctuation
              // Add it as a sentence if it's long enough to be meaningful
              sentences.push(cleanedText);
            }
          }
          // If the child is an object, handle based on type
          else if (typeof child === 'object') {
            // Skip image elements and other non-text content
            if (child.type === 'img' || child.type === 'image' || child.type === 'svg') {
              return;
            }
            
            // If the child has children, process it recursively
            if (child.children) {
              const nestedSentences = extractSentences([child]);
              sentences.push(...nestedSentences);
            }
          }
        });
      }
    });
    
    // Filter out duplicate sentences and very short ones
    const uniqueSentences = Array.from(new Set(sentences))
      .filter(sentence => sentence.trim().length > 3);
    
    return uniqueSentences;
  }