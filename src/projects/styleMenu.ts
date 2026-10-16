import { ActionSheetIOS, Alert } from "react-native";
import { AFTER_SHEET_MS } from "./ProjectActionsSheet";
import type { UserStyle } from "./userStyles";

/** Touch and hold on one of the owner's styles: the system action sheet, Apple's wording (EditorTopBar's MENU pattern). */
export const STYLE_MENU = ["Rename", "Delete", "Cancel"] as const;

/**
 * The prompt and the alert wait `AFTER_SHEET_MS` for the action sheet to be gone (iOS drops one presented while it leaves). Nothing
 * here holds a guard: the menu, the prompt and the alert are system sheets, and only their answers start our own work.
 */
export function openStyleMenu(style: UserStyle, act: { rename: (id: string, name: string) => void; remove: (id: string) => void }): void {
  ActionSheetIOS.showActionSheetWithOptions({ title: style.name, options: [...STYLE_MENU], destructiveButtonIndex: 1, cancelButtonIndex: 2 }, (index) => {
    if (index === 0) setTimeout(() => Alert.prompt("Rename style", undefined, (name) => { if (name) act.rename(style.id, name); }, "plain-text", style.name), AFTER_SHEET_MS);
    if (index === 1) setTimeout(() => Alert.alert("Delete style?", "Projects made with it stay as they are.", [
      { text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => act.remove(style.id) }]), AFTER_SHEET_MS);
  });
}
