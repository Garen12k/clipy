import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ActionSheetIOS, Alert, Pressable, View } from "react-native";
import { renameProject } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Title } from "@/src/ui/Text";

/** The round Back and the name are 40 pt high in a 48-pt row: this much slop each way makes their targets 44. */
const SLOP = (theme.size.touch - theme.size.iconButton) / 2;
/** The project menu: its items, in order. Cancel is last. */
const MENU = ["Rename", "Cancel"];

/** The editor's header: a round Back, the project's name (its tap opens the project menu) and Export — the editor's one gold button. */
export function EditorTopBar({ onExport }: { onExport: () => void }) {
  const name = useEditorStore((s) => s.project?.name ?? "");
  const { apply } = useEditorStore.getState();
  // One undoable step; an empty answer changes nothing.
  const rename = () => Alert.prompt("Rename project", undefined, (n) => n && apply((p) => renameProject(p, n)), "plain-text", name);
  const openMenu = () => ActionSheetIOS.showActionSheetWithOptions({ options: MENU, cancelButtonIndex: MENU.length - 1 }, (index) => { if (index === 0) rename(); });
  return (
    <View testID="editor-top-bar" style={{ height: theme.size.row, flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space.gutter, paddingBottom: theme.space.sm, gap: theme.space.sm }}>
      <PressableScale accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={SLOP}
        style={{ width: theme.size.iconButton, height: theme.size.iconButton, borderRadius: theme.radius.pill, backgroundColor: theme.elevation.bar, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="chevron-back-outline" size={theme.size.icon.md} color={theme.colors.text} />
      </PressableScale>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name}, project`} accessibilityHint="Opens the project menu" onPress={openMenu} hitSlop={{ top: SLOP, bottom: SLOP }}
        style={{ flex: 1, height: theme.size.iconButton, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.xs }}>
        <Title size={theme.type.headline} numberOfLines={1} style={{ flexShrink: 1 }}>{name}</Title>
        <Ionicons testID="project-menu-chevron" name="chevron-down-outline" size={theme.size.icon.sm} color={theme.colors.textMuted} />
      </Pressable>
      <PrimaryButton compact title="Export" onPress={onExport} icon={<Ionicons testID="export-symbol" name="share-outline" size={theme.size.icon.sm} color={theme.colors.onAccent} />} />
    </View>
  );
}
