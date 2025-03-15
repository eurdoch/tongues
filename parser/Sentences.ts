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
      // Only process elements that have children
      if (element.children && Array.isArray(element.children)) {
        // Process each child in the element
        element.children.forEach((child: any) => {
          // If the child is a string, extract sentences from it
          if (typeof child === 'string') {
            const matches = child.match(sentenceRegex);
            if (matches) {
              // Add the extracted sentences to our result array
              sentences.push(...matches.map(sentence => sentence.trim()));
            }
          }
          // If the child is an object with children, process it recursively
          else if (typeof child === 'object' && child.children) {
            const nestedSentences = extractSentences([child]);
            sentences.push(...nestedSentences);
          }
        });
      }
    });
    
    return sentences;
  }