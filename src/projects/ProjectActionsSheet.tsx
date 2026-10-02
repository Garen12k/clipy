import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Sheet } from "@/src/ui/Sheet";
import type { ProjectSummary } from "./storage";

type Props = { project: ProjectSummary | null; onClose: () => void; onRename: (p: ProjectSummary) => void; onDuplicate: (p: ProjectSummary) => void; onDelete: (p: ProjectSummary) => void };

export function ProjectActionsSheet({ project, onClose, onRename, onDuplicate, onDelete }: Props) {
  const run = (fn: (p: ProjectSummary) => void) => () => { if (project) { onClose(); fn(project); } };
  return (
    <Sheet visible={!!project} onClose={onClose} title={project?.name ?? ""}>
      <View style={{ gap: theme.space.md }}>
        {project?.broken ? null : <SecondaryButton title="Rename" onPress={run(onRename)} />}
        {project?.broken ? null : <SecondaryButton title="Duplicate" onPress={run(onDuplicate)} />}
        <SecondaryButton title="Delete" danger onPress={run(onDelete)} />
      </View>
    </Sheet>
  );
}
