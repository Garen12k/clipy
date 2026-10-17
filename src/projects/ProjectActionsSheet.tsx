import { useRef } from "react";
import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { QuietButton } from "@/src/ui/QuietButton";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Sheet } from "@/src/ui/Sheet";
import { FIND_WORDS } from "./homeFindWords";
import type { ProjectSummary } from "./storage";

type Props = { project: ProjectSummary | null; onClose: () => void; onRename: (p: ProjectSummary) => void; onDuplicate: (p: ProjectSummary) => void; onSaveCopy: (p: ProjectSummary) => void; onSaveStyle: (p: ProjectSummary) => void; onDelete: (p: ProjectSummary) => void;
  /** Home's pins (a phone preference — never the project). Optional: without `onPin` the sheet has no Pin. */ isPinned?: (id: string) => boolean; onPin?: (p: ProjectSummary) => void };

/** iOS silently drops an Alert presented while a Modal is still dismissing, so alert-based actions wait for the sheet to be gone. */
export const AFTER_SHEET_MS = 350;

export function ProjectActionsSheet({ project, onClose, onRename, onDuplicate, onSaveCopy, onSaveStyle, onDelete, isPinned, onPin }: Props) {
  // Keep rendering the last project while the sheet fades out so the title/buttons don't blank.
  const last = useRef<ProjectSummary | null>(project);
  if (project) last.current = project;
  const shown = project ?? last.current;
  // Pin / Unpin as it was when this project's sheet opened: Pin runs at once, so during the fade the pin has already flipped and
  // the button the user just tapped would change its word as it leaves.
  const pinLabel = useRef<{ for: ProjectSummary | null; pinned: boolean }>({ for: null, pinned: false });
  if (!project) pinLabel.current.for = null; // closed: the next opening reads it afresh, even for the same project
  else if (pinLabel.current.for !== project) pinLabel.current = { for: project, pinned: !!isPinned?.(project.id) };

  const run = (fn: (p: ProjectSummary) => void, needsAlert: boolean) => () => {
    if (!project) return;
    onClose();
    if (needsAlert) setTimeout(() => fn(project), AFTER_SHEET_MS);
    else fn(project);
  };
  return (
    <Sheet visible={!!project} onClose={onClose} title={shown?.name ?? ""}>
      <View style={{ gap: theme.space.md }}>
        {shown && !shown.broken && onPin ? <SecondaryButton title={pinLabel.current.pinned ? FIND_WORDS.unpin : FIND_WORDS.pin} onPress={run(onPin, false)} /> : null}
        {shown?.broken ? null : <SecondaryButton title="Rename" onPress={run(onRename, true)} />}
        {shown?.broken ? null : <SecondaryButton title="Duplicate" onPress={run(onDuplicate, false)} />}
        {/* A prompt for the name: after the sheet is gone, like Rename. */}
        {shown?.broken ? null : <SecondaryButton title="Save As Style" onPress={run(onSaveStyle, true)} />}
        {/* After the sheet is gone, like an alert: iOS drops the share sheet if it is presented while this Modal is still leaving. */}
        {shown?.broken ? null : <SecondaryButton title="Save a Copy" onPress={run(onSaveCopy, true)} />}
        <QuietButton title="Delete" danger onPress={run(onDelete, true)} />
      </View>
    </Sheet>
  );
}
