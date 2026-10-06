import { Text, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Body, Title } from "./Text";

const EMOJI = 64;

/** A screen with nothing on it yet: a picture, a title shown as typed (sentence case — not the upper case of a screen title) and one line of help. */
export function EmptyState({ emoji, title, hint }: { emoji: string; title: string; hint: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space.md, padding: theme.space.xxl }}>
      <Text style={{ fontSize: EMOJI }}>{emoji}</Text>
      <Title size={theme.type.title} style={{ textTransform: "none", letterSpacing: 0, textAlign: "center" }}>{title}</Title>
      <Body muted style={{ textAlign: "center" }}>{hint}</Body>
    </View>
  );
}
