/**
 * Simple CSS parser to convert CSS rules to React Native style objects
 */

import { StyleSheet as ReactNativeStyleSheet } from 'react-native';
import StyleSheet from '../types/StyleSheet';

// Types for the parsed CSS rules
interface CssRule {
  selector: string;
  properties: Record<string, string>;
}

interface ParsedStyleSheet {
  path: string;
  rules: CssRule[];
}

/**
 * A simplified CSS property mapping from CSS to React Native styles
 */
const cssToReactNativeMap: Record<string, string> = {
  // Text styles
  'color': 'color',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'font-style': 'fontStyle',
  'line-height': 'lineHeight',
  'text-align': 'textAlign',
  'text-decoration': 'textDecorationLine',
  'text-transform': 'textTransform',
  'letter-spacing': 'letterSpacing',
  
  // Layout styles
  'margin': 'margin',
  'margin-top': 'marginTop',
  'margin-right': 'marginRight',
  'margin-bottom': 'marginBottom',
  'margin-left': 'marginLeft',
  'padding': 'padding',
  'padding-top': 'paddingTop',
  'padding-right': 'paddingRight',
  'padding-bottom': 'paddingBottom',
  'padding-left': 'paddingLeft',
  
  // Dimensions
  'width': 'width',
  'height': 'height',
  'max-width': 'maxWidth',
  'max-height': 'maxHeight',
  'min-width': 'minWidth',
  'min-height': 'minHeight',
  
  // Flex layout
  'display': 'display',
  'flex': 'flex',
  'flex-direction': 'flexDirection',
  'flex-wrap': 'flexWrap',
  'justify-content': 'justifyContent',
  'align-items': 'alignItems',
  'align-self': 'alignSelf',
  
  // Borders
  'border-width': 'borderWidth',
  'border-top-width': 'borderTopWidth',
  'border-right-width': 'borderRightWidth',
  'border-bottom-width': 'borderBottomWidth',
  'border-left-width': 'borderLeftWidth',
  'border-color': 'borderColor',
  'border-top-color': 'borderTopColor',
  'border-right-color': 'borderRightColor',
  'border-bottom-color': 'borderBottomColor',
  'border-left-color': 'borderLeftColor',
  'border-radius': 'borderRadius',
  'border-top-left-radius': 'borderTopLeftRadius',
  'border-top-right-radius': 'borderTopRightRadius',
  'border-bottom-left-radius': 'borderBottomLeftRadius',
  'border-bottom-right-radius': 'borderBottomRightRadius',
  
  // Background
  'background-color': 'backgroundColor',
  
  // Positioning
  'position': 'position',
  'top': 'top',
  'right': 'right',
  'bottom': 'bottom',
  'left': 'left',
  'z-index': 'zIndex',
  
  // Other
  'opacity': 'opacity',
  'overflow': 'overflow',
};

/**
 * Parse CSS unit values into React Native compatible values
 */
function parseCssValue(property: string, value: string): any {
  // Remove !important flags
  value = value.replace(/\s*!important\s*$/, '').trim();
  
  // Handle pixel values
  if (value.endsWith('px')) {
    const numVal = parseFloat(value);
    return isNaN(numVal) ? value : numVal;
  }
  
  // Handle em and rem values - convert to pixel equivalents
  // assuming 1em = 16px as a base conversion
  if (value.endsWith('em') || value.endsWith('rem')) {
    const numVal = parseFloat(value);
    if (!isNaN(numVal)) {
      // Convert em/rem to a pixel value approximation (1em = 16px)
      return numVal * 16;
    }
    return value;
  }
  
  // Handle unitless numbers
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value);
  }
  
  // Handle percentages for supported properties
  if (value.endsWith('%')) {
    // For width and height, convert percentages to strings
    if (['width', 'height', 'max-width', 'max-height'].includes(property)) {
      return value;
    }
    // For other properties, just remove the % sign
    const numVal = parseFloat(value);
    return isNaN(numVal) ? value : numVal / 100;
  }
  
  // Handle color values
  if (property.includes('color')) {
    return value;
  }
  
  // Handle font-weight
  if (property === 'font-weight') {
    // Map named weights to numeric values
    const fontWeightMap: Record<string, string> = {
      'normal': '400',
      'bold': '700',
      'lighter': '300',
      'bolder': '800',
    };
    return fontWeightMap[value] || value;
  }
  
  // Handle display property
  if (property === 'display') {
    if (value === 'flex' || value === 'none') {
      return value;
    }
    // Treat block and inline-block as flex in React Native
    if (value === 'block' || value === 'inline-block') {
      return 'flex';
    }
    return undefined; // Skip unsupported values
  }
  
  // Handle text-align
  if (property === 'text-align') {
    if (['auto', 'left', 'right', 'center', 'justify'].includes(value)) {
      return value;
    }
    return undefined;
  }
  
  // Handle text-decoration
  if (property === 'text-decoration') {
    if (value.includes('line-through')) {
      return 'line-through';
    }
    if (value.includes('underline')) {
      return 'underline';
    }
    if (value.includes('none')) {
      return 'none';
    }
    return undefined;
  }
  
  // For all other values, return as is
  return value;
}

/**
 * Parse a CSS stylesheet content into rules
 */
function parseCssRules(cssContent: string): CssRule[] {
  const rules: CssRule[] = [];
  
  // Remove comments
  const cleanedCss = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Extract rule blocks
  const ruleBlocks = cleanedCss.match(/[^{]*\{[^}]*\}/g) || [];
  
  for (const block of ruleBlocks) {
    // Split into selector and properties
    const parts = block.split('{');
    if (parts.length !== 2) continue;
    
    const selector = parts[0].trim();
    const propertiesBlock = parts[1].replace('}', '').trim();
    
    // Skip empty selectors or empty property blocks
    if (!selector || !propertiesBlock) continue;
    
    // Extract individual properties
    const properties: Record<string, string> = {};
    const propertyList = propertiesBlock.split(';').filter(Boolean);
    
    for (const prop of propertyList) {
      const [key, ...valueParts] = prop.split(':');
      if (!key || valueParts.length === 0) continue;
      
      const propName = key.trim();
      const propValue = valueParts.join(':').trim(); // Rejoin for values that might contain colons (like URLs)
      
      if (propName && propValue) {
        properties[propName] = propValue;
      }
    }
    
    // Add the rule
    rules.push({ selector, properties });
  }
  
  return rules;
}

/**
 * Convert a CSS rule to a React Native style object
 */
function cssRuleToReactNativeStyle(rule: CssRule): Record<string, any> {
  const rnStyle: Record<string, any> = {};
  
  try {
    for (const [cssProperty, cssValue] of Object.entries(rule.properties)) {
      // Skip empty values
      if (!cssValue) continue;
      
      // Find the React Native property name
      const rnProperty = cssToReactNativeMap[cssProperty];
      if (!rnProperty) continue; // Skip unsupported properties
      
      try {
        // Convert the value
        const rnValue = parseCssValue(cssProperty, cssValue);
        if (rnValue !== undefined) {
          rnStyle[rnProperty] = rnValue;
        }
      } catch (valueError) {
        console.warn(`Error parsing CSS value "${cssValue}" for property "${cssProperty}":`, valueError);
        // Continue with other properties even if one fails
      }
    }
  } catch (error) {
    console.warn('Error converting CSS rule to React Native style:', error);
  }
  
  return rnStyle;
}

/**
 * Parse all CSS stylesheets into a map of selector-based styles
 */
export function parseAllStylesheets(styleSheets: StyleSheet[]): Record<string, any> {
  const parsedSheets: ParsedStyleSheet[] = [];
  
  // Parse each stylesheet with error handling
  for (const sheet of styleSheets) {
    try {
      parsedSheets.push({
        path: sheet.path,
        rules: parseCssRules(sheet.content)
      });
    } catch (parseError) {
      console.warn(`Error parsing stylesheet ${sheet.path}:`, parseError);
      // Continue with other stylesheets even if one fails
    }
  }
  
  // Combine all rules into a single selector-based map
  const allStyles: Record<string, any> = {};
  
  for (const sheet of parsedSheets) {
    for (const rule of sheet.rules) {
      try {
        // Convert the CSS rule to a React Native style object
        const rnStyle = cssRuleToReactNativeStyle(rule);
        
        // Skip empty style objects
        if (Object.keys(rnStyle).length === 0) continue;
        
        // Process the selector - split multiple selectors
        const selectors = rule.selector.split(',').map(s => s.trim());
        
        for (const selector of selectors) {
          try {
            // Clean and normalize selector
            const normalizedSelector = normalizeCssSelector(selector);
            
            if (!normalizedSelector) continue;
            
            // Store the styles for this selector
            if (!allStyles[normalizedSelector]) {
              allStyles[normalizedSelector] = rnStyle;
            } else {
              // Merge with existing styles for this selector
              allStyles[normalizedSelector] = {
                ...allStyles[normalizedSelector],
                ...rnStyle
              };
            }
          } catch (selectorError) {
            console.warn(`Error processing selector "${selector}":`, selectorError);
            // Continue with other selectors even if one fails
          }
        }
      } catch (ruleError) {
        console.warn(`Error processing CSS rule:`, ruleError);
        // Continue with other rules even if one fails
      }
    }
  }
  
  return allStyles;
}

/**
 * Normalize CSS selectors to a simplified format usable in React Native
 */
function normalizeCssSelector(selector: string): string | null {
  // Remove pseudo-classes and pseudo-elements
  selector = selector.replace(/::?[a-zA-Z-]+((\([^)]+\))?)/g, '');
  
  // Simplify attribute selectors
  selector = selector.replace(/\[[^\]]+\]/g, '');
  
  // Basic selector normalization - just return element name, class name, or ID
  const parts = selector.trim().split(/\s+/);
  const lastPart = parts[parts.length - 1].trim();
  
  // Extract element type
  let elementType = lastPart.match(/^[a-zA-Z0-9-]+/)?.[0] || '';
  
  // Extract class name
  let className = '';
  const classMatch = lastPart.match(/\.([a-zA-Z0-9_-]+)/);
  if (classMatch) {
    className = classMatch[1];
  }
  
  // Extract ID
  let id = '';
  const idMatch = lastPart.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    id = idMatch[1];
  }
  
  // Return the appropriate identifier
  if (id) {
    return `#${id}`;
  } else if (className) {
    return `.${className}`;
  } else if (elementType) {
    return elementType;
  }
  
  return null;
}

/**
 * Create React Native StyleSheet from the CSS parsed styles
 */
export function createStyleSheet(styles: Record<string, any>): ReactNativeStyleSheet.NamedStyles<any> {
  const rnStyles: Record<string, any> = {};
  
  // Convert CSS selector-based styles to named React Native styles
  for (const [selector, style] of Object.entries(styles)) {
    // For element types, use the element name directly
    if (!selector.startsWith('.') && !selector.startsWith('#')) {
      rnStyles[selector] = style;
    } 
    // For class selectors, remove the leading dot
    else if (selector.startsWith('.')) {
      rnStyles[selector.substring(1)] = style;
    }
    // For ID selectors, remove the leading #
    else if (selector.startsWith('#')) {
      rnStyles[selector.substring(1)] = style;
    }
  }
  
  return ReactNativeStyleSheet.create(rnStyles);
}

/**
 * Main function to process all CSS from the book and return a React Native StyleSheet
 */
export function processBookStyles(styleSheets: StyleSheet[]): ReactNativeStyleSheet.NamedStyles<any> {
  try {
    // Parse all stylesheets into a selector-based style map
    const parsedStyles = parseAllStylesheets(styleSheets);
    
    // Convert to React Native StyleSheet
    return createStyleSheet(parsedStyles);
  } catch (error) {
    console.warn('Error processing book styles:', error);
    // Return an empty stylesheet if there's an error
    return ReactNativeStyleSheet.create({});
  }
}