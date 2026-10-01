import { router } from "expo-router";
import { Alert, Pressable, Text, View } from "react-native";
import { renameProject } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { IconButton } from "@/src/ui/IconButton";

export function EditorTopBar({ onExport }: { onExport: () => void }) {
  const name = useEditorStore((s) => s.project?.name ?? "");
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const { undo, redo, apply } = useEditorStore.getState();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space.sm, paddingTop: 54, paddingBottom: theme.space.sm, gap: theme.space.xs }}>
      <IconButton name="chevron-back" accessibilityLabel="Back" onPress={() => router.back()} />
      <Pressable style={{ flex: 1 }} onPress={() => Alert.prompt("Rename project", undefined, (n) => n && apply((p) => renameProject(p, n)), "plain-text", name)}>
        <Text numberOfLines={1} style={{ fontFamily: theme.fonts.heading, fontSize: 22, color: theme.colors.text, letterSpacing: 1 }}>{name}</Text>
      </Pressable>
      <IconButton name="arrow-undo" accessibilityLabel="Undo" disabled={!canUndo} onPress={undo} />
      <IconButton name="arrow-redo" accessibilityLabel="Redo" disabled={!canRedo} onPress={redo} />
      <Pressable accessibilityRole="button" onPress={onExport}
        style={({ pressed }) => ({ backgroundColor: pressed ? theme.colors.accentPressed : theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: 8, paddingHorizontal: 16, marginLeft: theme.space.xs })}>
        <Text style={{ fontFamily: theme.fonts.heading, fontSize: 18, color: theme.colors.text, letterSpacing: 1 }}>Export</Text>
      </Pressable>
    </View>
  );
}
