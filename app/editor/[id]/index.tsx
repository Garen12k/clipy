import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { AudioPreview } from "@/src/editor/components/AudioPreview";
import { EditorToolbar } from "@/src/editor/components/EditorToolbar";
import { EditorTopBar } from "@/src/editor/components/EditorTopBar";
import { PreviewPlayer } from "@/src/editor/components/PreviewPlayer";
import { ReorderHandle } from "@/src/editor/components/ReorderHandle";
import { Timeline } from "@/src/editor/components/Timeline";
import { TrimHandles } from "@/src/editor/components/TrimHandles";
import type { Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useAutosave } from "@/src/editor/useAutosave";
import { useLoadProject } from "@/src/editor/useLoadProject";
import { storage } from "@/src/projects";
import { theme } from "@/src/theme/theme";
import { Body, Heading } from "@/src/ui/Text";
import { ToastHost } from "@/src/ui/Toast";

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useLoadProject(id);
  const save = useCallback((p: Project) => storage.saveProject(p), []);
  useAutosave(save);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const project = useEditorStore((s) => s.project);
  const clipById = (clipId: string) => project?.clips.find((c) => c.id === clipId);
  const [textPanelFor, setTextPanelFor] = useState<string | null>(null);

  if (load.status === "loading") return <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}><ActivityIndicator color={theme.colors.accent} /></View>;
  if (load.status === "error") return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center", alignItems: "center", padding: 32, gap: 12 }}>
      <Heading>Can't open project</Heading><Body muted>{load.error}</Body>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <EditorTopBar onExport={() => { useEditorStore.getState().setPlaying(false); router.push(`/editor/${id}/export`); }} />
      <View testID="slot-preview" style={{ flex: 1 }}>
        <PreviewPlayer onOpenTextPanel={setTextPanelFor} />
        <AudioPreview />
      </View>
      <View testID="slot-timeline">
        <Timeline
          renderStripExtras={(clipId, index) => {
            if (clipId !== selectedClipId) return null;
            const clip = clipById(clipId);
            if (!clip) return null;
            return (
              <>
                <TrimHandles clip={clip} />
                <ReorderHandle clipId={clipId} index={index} />
              </>
            );
          }}
        />
      </View>
      <EditorToolbar textPanelFor={textPanelFor} onTextPanelChange={setTextPanelFor} />
      <ToastHost />
    </View>
  );
}
