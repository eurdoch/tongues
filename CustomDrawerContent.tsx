import { Text, View, StyleSheet, TouchableOpacity } from "react-native";
import { parseEpub } from "./utils";
import { useNavigation } from "@react-navigation/native";
import { pick } from "@react-native-documents/picker";
import { SafeAreaView } from "react-native-safe-area-context";

function CustomDrawerContent() {
    const navigation = useNavigation();
  
    const selectAndReadEpub = async () => {
      try {
        const [file] = await pick({
          type: ['application/epub+zip'],
          mode: 'open',
        });
  
        const contents = await parseEpub(file.uri);
        if (contents) {
          console.log(contents);
        } else {
          console.log('No opf file found.');
        }
      } catch (e: any) {
        console.log('pick failed: ', e);
      }
    };
    
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Tongues</Text>
        </View>
        <View style={styles.content}>
          <TouchableOpacity 
            style={styles.button}
            onPress={selectAndReadEpub} 
          >
            <Text style={styles.buttonText}>Open Book</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e4e8',
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a73e8',
  },
  content: {
    padding: 16,
  },
  button: {
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  }
});

export default CustomDrawerContent
