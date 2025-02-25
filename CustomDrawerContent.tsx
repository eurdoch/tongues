import { Text, View, Button } from "react-native";
import { parseEpub } from "./utils";
import { useNavigation } from "@react-navigation/native";
import { pick } from "@react-native-documents/picker";

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
      <View>
        <View>
          <Text>tongues</Text>
        </View>
        <View>
          <Button 
            title="Open Book" 
            onPress={selectAndReadEpub} 
          />
        </View>
      </View>
    );
  }

  export default CustomDrawerContent
