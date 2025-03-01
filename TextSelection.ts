import { NativeModules } from 'react-native';
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
