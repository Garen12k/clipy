import { Icon } from "@/src/ui/Icon";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { ActionSheetIOS, Alert, Pressable, View } from "react-native";
import { renameProject } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
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
  // One undoable step; an empty answer changes nothing. It starts from the name as it is when the prompt opens.
  const rename = () => Alert.prompt("Rename project", undefined, (n) => n && apply((p) => renameProject(p, n)), "plain-text", useEditorStore.getState().project?.name ?? "");
  // iOS can drop a prompt presented while the menu is still closing, so Rename waits as the Home screen's sheet does (`AFTER_SHEET_MS`).
  // One wait at a time, and none is left behind when the editor is left in between.
  const waiting = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forget = () => { if (waiting.current !== null) clearTimeout(waiting.current); waiting.current = null; };
  useEffect(() => forget, []);
  const openMenu = () => ActionSheetIOS.showActionSheetWithOptions({ options: MENU, cancelButtonIndex: MENU.length - 1 }, (index) => {
    if (index !== 0) return;
    forget();
    waiting.current = setTimeout(() => { waiting.current = null; rename(); }, AFTER_SHEET_MS);
  });
  return (
    <View testID="editor-top-bar" style={{ height: theme.size.row, flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space.gutter, paddingBottom: theme.space.sm, gap: theme.space.sm }}>
      <PressableScale accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={SLOP}
        style={{ width: theme.size.iconButton, height: theme.size.iconButton, borderRadius: theme.radius.pill, backgroundColor: theme.elevation.bar, alignItems: "center", justifyContent: "center" }}>
        <Icon name="chevron-back-outline" size={theme.size.icon.md} color={theme.colors.text} />
      </PressableScale>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name}, project`} accessibilityHint="Opens the project menu" onPress={openMenu} hitSlop={{ top: SLOP, bottom: SLOP }}
        style={{ flex: 1, height: theme.size.iconButton, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.xs }}>
        <Title size={theme.type.headline} numberOfLines={1} style={{ flexShrink: 1 }}>{name}</Title>
        <Icon testID="project-menu-chevron" name="chevron-down-outline" size={theme.size.icon.sm} color={theme.colors.textMuted} />
      </Pressable>
      <PrimaryButton compact title="Export" onPress={onExport} icon={<Icon testID="export-symbol" name="share-outline" size={theme.size.icon.sm} color={theme.colors.onAccent} />} />
    </View>
  );
}
