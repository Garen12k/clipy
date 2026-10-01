import { Image, Pressable, Text, View } from "react-native";
import { formatDuration, relativeTime } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import type { ProjectSummary } from "./storage";

type Props = { summary: ProjectSummary; onPress: () => void; onLongPress: () => void };

export function ProjectCard({ summary, onPress, onLongPress }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={summary.name} onPress={onPress} onLongPress={onLongPress} delayLongPress={350}
      style={({ pressed }) => ({ flex: 1, margin: theme.space.sm, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.straw,
        backgroundColor: theme.colors.surface, overflow: "hidden", opacity: pressed ? 0.85 : 1 })}>
      <View style={{ aspectRatio: 9 / 16, maxHeight: 180, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
        {summary.thumbUri ? <Image source={{ uri: summary.thumbUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          : <Text style={{ color: theme.colors.textMuted }}>{summary.broken ? "!" : "No preview"}</Text>}
      </View>
      <View style={{ padding: theme.space.md, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: summary.broken ? theme.colors.danger : theme.colors.text, fontWeight: "600" }}>{summary.name}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>{formatDuration(summary.durationSec)}</Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>{summary.updatedAt ? relativeTime(summary.updatedAt) : ""}</Text>
        </View>
      </View>
    </Pressable>
  );
}
