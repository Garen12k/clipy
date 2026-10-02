import { useRef } from "react";
import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Sheet } from "@/src/ui/Sheet";
import type { ProjectSummary } from "./storage";

type Props = { project: ProjectSummary | null; onClose: () => void; onRename: (p: ProjectSummary) => void; onDuplicate: (p: ProjectSummary) => void; onDelete: (p: ProjectSummary) => void };

/** iOS silently drops an Alert presented while a Modal is still dismissing, so alert-based actions wait for the sheet to be gone. */
export const AFTER_SHEET_MS = 350;

export function ProjectActionsSheet({ project, onClose, onRename, onDuplicate, onDelete }: Props) {
  // Keep rendering the last project while the sheet fades out so the title/buttons don't blank.
  const last = useRef<ProjectSummary | null>(project);
  if (project) last.current = project;
  const shown = project ?? last.current;

  const run = (fn: (p: ProjectSummary) => void, needsAlert: boolean) => () => {
    if (!project) return;
    onClose();
    if (needsAlert) setTimeout(() => fn(project), AFTER_SHEET_MS);
    else fn(project);
  };
  return (
    <Sheet visible={!!project} onClose={onClose} title={shown?.name ?? ""}>
      <View style={{ gap: theme.space.md }}>
        {shown?.broken ? null : <SecondaryButton title="Rename" onPress={run(onRename, true)} />}
        {shown?.broken ? null : <SecondaryButton title="Duplicate" onPress={run(onDuplicate, false)} />}
        <SecondaryButton title="Delete" danger onPress={run(onDelete, true)} />
      </View>
    </Sheet>
  );
}
