import { Text, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Body, Title } from "./Text";

export function EmptyState({ emoji, title, hint }: { emoji: string; title: string; hint: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space.md, padding: theme.space.xxl }}>
      <Text style={{ fontSize: 64 }}>{emoji}</Text>
      <Title size={20}>{title}</Title>
      <Body muted style={{ textAlign: "center" }}>{hint}</Body>
    </View>
  );
}