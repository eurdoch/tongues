import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableWithoutFeedback,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { SupportedLanguages } from '../types/Language';

interface LanguageSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectLanguage: (language: string) => void;
}

const LanguageSelectorModal: React.FC<LanguageSelectorModalProps> = ({
  visible,
  onClose,
  onSelectLanguage,
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');

  const handleLanguageSelect = (language: string) => {
    setSelectedLanguage(language);
  };

  const handleConfirm = () => {
    if (selectedLanguage) {
      onSelectLanguage(selectedLanguage);
      onClose();
    }
  };

  const renderLanguageItem = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={[
        styles.languageItem,
        selectedLanguage === item && styles.selectedLanguageItem,
      ]}
      onPress={() => handleLanguageSelect(item)}
    >
      <Text
        style={[
          styles.languageText,
          selectedLanguage === item && styles.selectedLanguageText,
        ]}
      >
        {item}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.container}>
              <View style={styles.header}>
                <Text style={styles.headerText}>Select Language</Text>
              </View>
              
              <View style={styles.content}>
                <Text style={styles.instructionText}>
                  We couldn't automatically detect the language of this book.
                  Please select the language:
                </Text>
                
                <FlatList
                  data={Object.keys(SupportedLanguages)}
                  renderItem={renderLanguageItem}
                  keyExtractor={(item) => item}
                  style={styles.languageList}
                />
              </View>
              
              <View style={styles.footer}>
                <TouchableOpacity
                  style={[
                    styles.confirmButton,
                    !selectedLanguage && styles.disabledButton,
                  ]}
                  onPress={handleConfirm}
                  disabled={!selectedLanguage}
                >
                  <Text style={styles.confirmButtonText}>Confirm</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={onClose}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#2A2A2A',
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  header: {
    backgroundColor: 'rgba(0, 122, 255, 0.95)',
    paddingVertical: 15,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  languageList: {
    maxHeight: 200,
  },
  languageItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedLanguageItem: {
    backgroundColor: 'rgba(0, 122, 255, 0.3)',
    borderColor: '#007AFF',
    borderWidth: 1,
  },
  languageText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  selectedLanguageText: {
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  confirmButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    minWidth: 120,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: 'rgba(150, 150, 150, 0.4)',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    minWidth: 120,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});

export default LanguageSelectorModal;
