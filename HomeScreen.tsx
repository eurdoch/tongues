import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function HomeScreen(): React.JSX.Element {
    return (
        <SafeAreaView>
            <View>
                <Text>Home</Text>
            </View>
        </SafeAreaView>
    );
}

export default HomeScreen
