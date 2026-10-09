import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Body, Title } from "./Text";

const EMOJI = 64;
type Props = { /** The picture, as an emoji … */ emoji?: string; /** … or as a gold symbol on a rounded tile (it wins over `emoji`). */ icon?: keyof typeof Ionicons.glyphMap;
  title: string; hint: string; /** A quiet last line pointing down at the screen's actions. */ pointer?: string };

/** A screen with nothing on it yet: a picture, a title shown as typed, one line of help and — when given — a quiet pointer to the actions below. */
export function EmptyState({ emoji, icon, title, hint, pointer }: Props) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space.md, padding: theme.space.xxl }}>
      {icon ? (
        <View testID="empty-emblem" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={{ width: theme.size.emblem, height: theme.size.emblem, borderRadius: theme.radius.emblem, backgroundColor: theme.screen.tile, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={theme.size.icon.hero} color={theme.colors.accent} />
        </View>
      ) : emoji ? <Text style={{ fontSize: EMOJI }}>{emoji}</Text> : null}
      <Title size={theme.type.title} style={{ textAlign: "center" }}>{title}</Title>
      <Body muted style={{ textAlign: "center" }}>{hint}</Body>
      {pointer ? (
        <View testID="empty-pointer" style={{ flexDirection: "row", alignItems: "center", gap: theme.space.xs }}>
          <Ionicons name="arrow-down-outline" size={theme.size.icon.sm} color={theme.screen.muted} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <Body muted>{pointer}</Body>
        </View>
      ) : null}
    </View>
  );
}
