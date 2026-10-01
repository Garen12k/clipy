import { StyleSheet, Text, View } from "react-native";
import { hello } from "../modules/clipy-video";

function nativeGreeting(): string {
  try {
    return hello();
  } catch (e) {
    return `Native module unavailable: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export default function HomeScreen() {
  const greeting = nativeGreeting();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Clipy</Text>
      <Text style={styles.greeting} testID="native-greeting">
        {greeting}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { color: "#fff", fontSize: 32, fontWeight: "700", marginBottom: 16 },
  greeting: { color: "#9f9", fontSize: 16, textAlign: "center" },
});
