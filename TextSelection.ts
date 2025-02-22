import { NativeModules } from 'react-native';
const { TextSelectionModule } = NativeModules;

export const getSelectedText = async (): Promise<string | null> => {
    try {
        return await TextSelectionModule.getSelectedText();
    } catch (error) {
        console.error('Error getting selected text:', error);
        return null;
    }
};

export const hasSelectedText = async (): Promise<boolean> => {
    try {
        return await TextSelectionModule.hasSelectedText();
    } catch (error) {
        console.error('Error checking text selection:', error);
        return false;
    }
};
