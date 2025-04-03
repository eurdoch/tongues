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
  
  // Handle multi-value properties like margin and padding
  if (['margin', 'padding'].includes(property) && value.includes(' ')) {
    // Check if this is a multi-value property (1-4 values separated by spaces)
    const parts = value.trim().split(/\s+/);
    
    // If this is a multi-value property, handle each value separately
    if (parts.length >= 2 && parts.length <= 4) {
      // Convert each part to a number if possible
      const convertedParts = parts.map(part => {
        // Use a simpler conversion process for each part
        let numValue = 0;
        
        if (part.endsWith('px')) {
          numValue = parseFloat(part);
        } else if (part.endsWith('em') || part.endsWith('rem')) {
          numValue = parseFloat(part) * 16; // 1em = 16px
        } else if (part.endsWith('pt')) {
          numValue = parseFloat(part) * 1.333; // 1pt = 1.333px
        } else if (part === '0') {
          numValue = 0;
        } else if (part === 'auto') {
          // Special handling for 'auto' in margin
          return 'auto';
        } else {
          // Try to parse as a number
          const parsed = parseFloat(part);
          if (!isNaN(parsed)) {
            numValue = parsed;
          } else {
            console.warn(`Cannot parse value "${part}" in "${property}: ${value}"`);
            numValue = 0; // Default to 0 for unparseable values
          }
        }
        
        return numValue;
      });
      
      // For margin and padding in React Native, we need to set individual properties
      // instead of using CSS-style shorthand
      if (property === 'margin') {
        const result: Record<string, any> = {}; // Change to any to allow 'auto' value
        
        // CSS shorthand: 1 value = all sides
        if (convertedParts.length === 1) {
          return convertedParts[0]; // Single value can be used directly in RN
        }
        // CSS shorthand: 2 values = vertical, horizontal
        else if (convertedParts.length === 2) {
          result.marginVertical = convertedParts[0];
          result.marginHorizontal = convertedParts[1];
          return result;
        }
        // CSS shorthand: 3 values = top, horizontal, bottom
        else if (convertedParts.length === 3) {
          result.marginTop = convertedParts[0];
          result.marginHorizontal = convertedParts[1];
          result.marginBottom = convertedParts[2];
          return result;
        }
        // CSS shorthand: 4 values = top, right, bottom, left
        else if (convertedParts.length === 4) {
          result.marginTop = convertedParts[0];
          result.marginRight = convertedParts[1];
          result.marginBottom = convertedParts[2];
          result.marginLeft = convertedParts[3];
          return result;
        }
      }
      
      // Similar handling for padding
      if (property === 'padding') {
        const result: Record<string, any> = {}; // Change to any to allow 'auto' value
        
        // CSS shorthand: 1 value = all sides
        if (convertedParts.length === 1) {
          return convertedParts[0]; // Single value can be used directly in RN
        }
        // CSS shorthand: 2 values = vertical, horizontal
        else if (convertedParts.length === 2) {
          result.paddingVertical = convertedParts[0];
          result.paddingHorizontal = convertedParts[1];
          return result;
        }
        // CSS shorthand: 3 values = top, horizontal, bottom
        else if (convertedParts.length === 3) {
          result.paddingTop = convertedParts[0];
          result.paddingHorizontal = convertedParts[1];
          result.paddingBottom = convertedParts[2];
          return result;
        }
        // CSS shorthand: 4 values = top, right, bottom, left
        else if (convertedParts.length === 4) {
          result.paddingTop = convertedParts[0];
          result.paddingRight = convertedParts[1];
          result.paddingBottom = convertedParts[2];
          result.paddingLeft = convertedParts[3];
          return result;
        }
      }
    }
  }
  
  // Continue with regular value parsing for other cases
  
  // Handle common CSS units
  // Handle pixel values
  if (value.endsWith('px')) {
    const numVal = parseFloat(value);
    return isNaN(numVal) ? value : numVal;
  }
  
  // Handle point values (1pt = 1.333px)
  if (value.endsWith('pt')) {
    const numVal = parseFloat(value);
    return isNaN(numVal) ? value : numVal * 1.333;
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
  
  // Handle other CSS units
  if (value.endsWith('cm')) {
    // 1cm = 37.8px
    const numVal = parseFloat(value);
    return isNaN(numVal) ? value : numVal * 37.8;
  }
  
  if (value.endsWith('mm')) {
    // 1mm = 3.78px
    const numVal = parseFloat(value);
    return isNaN(numVal) ? value : numVal * 3.78;
  }
  
  if (value.endsWith('in')) {
    // 1in = 96px
    const numVal = parseFloat(value);
    return isNaN(numVal) ? value : numVal * 96;
  }
  
  if (value.endsWith('pc')) {
    // 1pc = 16px
    const numVal = parseFloat(value);
    return isNaN(numVal) ? value : numVal * 16;
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
  
  // Handle font-size keywords
  if (property === 'font-size') {
    // Map font-size keywords to pixel values
    const fontSizeMap: Record<string, number> = {
      'xx-small': 8,
      'x-small': 10,
      'small': 12,
      'medium': 14,
      'large': 18,
      'x-large': 24,
      'xx-large': 32,
      'smaller': 12, // Relative, but we'll use fixed values
      'larger': 18,  // Relative, but we'll use fixed values
    };
    
    if (fontSizeMap[value]) {
      return fontSizeMap[value];
    }
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
  
  // Handle font-family - extract the first font in the list and strip quotes
  if (property === 'font-family') {
    // Extract first font family, handling quotes and commas
    let fontFamily = value.split(',')[0].trim();
    // Remove quotes if present
    fontFamily = fontFamily.replace(/^['"]|['"]$/g, '');
    return fontFamily;
  }
  
  // Handle line-height for React Native (must be a number)
  if (property === 'line-height') {
    // Handle 'normal' value (default line height)
    if (value === 'normal') {
      return 1.2; // Standard approximation of 'normal' line height
    }
    // Handle numeric values without units
    if (!value.match(/[a-z%]/i)) {
      return parseFloat(value);
    }
    // Handle values with units (px, em, rem)
    if (value.endsWith('px')) {
      // For line-height in pixels, we need to convert to a unitless number
      // This is approximate but better than failing
      return parseFloat(value) / 16; // Dividing by base font size to get relative value
    }
    if (value.endsWith('em') || value.endsWith('rem')) {
      return parseFloat(value);
    }
    if (value.endsWith('%')) {
      return parseFloat(value) / 100; // Convert percentage to decimal
    }
    // Default for unrecognized formats
    return 1.2;
  }
  
  // Generic handler for various CSS units when we can't determine the specific unit
  // This extracts numeric values from strings like "10pt", "5vw", etc.
  const unitMatch = value.match(/^(-?\d+(\.\d+)?)(pt|px|em|rem|%|vh|vw|vmin|vmax|ex|ch|cm|mm|in|pc)$/);
  if (unitMatch) {
    const numVal = parseFloat(unitMatch[1]);
    const unit = unitMatch[3];
    
    // For layout properties that need number values in React Native
    const layoutProperties = [
      'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
      'top', 'right', 'bottom', 'left', 'border-width', 'border-radius',
      'font-size', 'line-height'
    ];
    
    if (layoutProperties.includes(property)) {
      // For percent values in width/height, keep the string format
      if (unit === '%' && ['width', 'height', 'max-width', 'max-height', 'min-width', 'min-height'].includes(property)) {
        return value;
      }
      
      // For other properties, return the number value
      return numVal;
    }
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
          // List of properties that must be numeric in React Native
          const numericProperties = ['fontSize', 'lineHeight', 'flex', 'opacity', 'zIndex', 
            'borderRadius', 'borderWidth', 'borderTopWidth', 'borderRightWidth', 
            'borderBottomWidth', 'borderLeftWidth', 'margin', 'marginTop', 'marginRight', 
            'marginBottom', 'marginLeft', 'padding', 'paddingTop', 'paddingRight', 
            'paddingBottom', 'paddingLeft', 'top', 'right', 'bottom', 'left'];
          
          // Check if the value is a complex object (for multi-value properties like margin/padding)
          if (typeof rnValue === 'object' && rnValue !== null) {
            // Merge the object properties into the style object directly
            Object.assign(rnStyle, rnValue);
          }
          // Check if this property needs to be numeric
          else if (numericProperties.includes(rnProperty)) {
            // Special case for 'auto' value in margin properties
            if (rnValue === 'auto' && rnProperty.startsWith('margin')) {
              rnStyle[rnProperty] = 'auto';
            }
            // If value is not a number, convert or use default
            else if (typeof rnValue !== 'number') {
              // Try to convert string numbers
              if (typeof rnValue === 'string' && /^-?\d+(\.\d+)?$/.test(rnValue)) {
                rnStyle[rnProperty] = parseFloat(rnValue);
              } else {
                // Use property-specific defaults
                let defaultValue = 0;
                
                if (rnProperty === 'fontSize') defaultValue = 14;
                else if (rnProperty === 'lineHeight') defaultValue = 1.2;
                else if (rnProperty === 'opacity') defaultValue = 1;
                else if (rnProperty === 'flex') defaultValue = 1;
                
                console.warn(`Cannot use non-numeric value "${rnValue}" for property "${rnProperty}", using default ${defaultValue}`);
                rnStyle[rnProperty] = defaultValue;
              }
            } else {
              rnStyle[rnProperty] = rnValue;
            }
          } else {
            // For non-numeric properties, use the value as is
            rnStyle[rnProperty] = rnValue;
          }
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