import { NativeModules, Platform } from 'react-native';
const { TextSelectionModule } = NativeModules;

export const getSelectedText = async (): Promise<string | null> => {
    try {
        // Check if the native module is available
        if (!TextSelectionModule) {
            console.error('TextSelectionModule is not available');
            return null;
        }
        
        // Check if the method exists
        if (!TextSelectionModule.getSelectedText) {
            console.error('getSelectedText method is not available');
            return null;
        }
        
        return await TextSelectionModule.getSelectedText();
    } catch (error) {
        console.error('Error getting selected text:', error);
        return null;
    }
};

export const hasSelectedText = async (): Promise<boolean> => {
    try {
        // Check if the native module is available
        if (!TextSelectionModule) {
            console.error('TextSelectionModule is not available');
            return false;
        }
        
        // Check if the method exists
        if (!TextSelectionModule.hasSelectedText) {
            console.error('hasSelectedText method is not available');
            return false;
        }
        
        return await TextSelectionModule.hasSelectedText();
    } catch (error) {
        console.error('Error checking text selection:', error);
        return false;
    }
};

// Helper function to clear text selection on Android
export const clearTextSelection = async (): Promise<void> => {
    if (Platform.OS !== 'android') return;
    
    try {
        // Check if the native module is available
        if (!TextSelectionModule) {
            console.error('TextSelectionModule is not available');
            return;
        }
        
        // First check if we have text selected
        const hasSelection = await hasSelectedText();
        if (!hasSelection) return;
        
        // Use the native clearSelection method if available
        if (TextSelectionModule.clearSelection) {
            await TextSelectionModule.clearSelection();
            return;
        }
        
        // Fallback: For Android, try an alternative approach if clearSelection isn't available
        // Using a native module extension, simulate a UI reset
        if (TextSelectionModule.getSelectedText) {
            // Just getting the selected text and disregarding the result 
            // can help reset the selection state on some devices
            await TextSelectionModule.getSelectedText();
            
            // Add a small delay to let the UI catch up
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    } catch (error) {
        console.error('Error clearing text selection:', error);
    }
};
