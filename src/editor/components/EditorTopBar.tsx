import { router } from "expo-router";
import { Alert, Pressable, View } from "react-native";
import { renameProject } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { IconButton } from "@/src/ui/IconButton";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Title } from "@/src/ui/Text";

export function EditorTopBar({ onExport }: { onExport: () => void }) {
  const name = useEditorStore((s) => s.project?.name ?? "");
  const { apply } = useEditorStore.getState();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space.sm, paddingTop: 54, paddingBottom: theme.space.sm, gap: theme.space.xs }}>
      <IconButton name="chevron-back" accessibilityLabel="Back" onPress={() => router.back()} />
      <Pressable style={{ flex: 1 }} onPress={() => Alert.prompt("Rename project", undefined, (n) => n && apply((p) => renameProject(p, n)), "plain-text", name)}>
        <Title size={16} numberOfLines={1} style={{ textAlign: "center" }}>{name}</Title>
      </Pressable>
      <PrimaryButton compact title="Export" onPress={onExport} />
    </View>
  );
}
