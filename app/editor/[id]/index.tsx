import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { AudioPreview } from "@/src/editor/components/AudioPreview";
import { EditorToolbar } from "@/src/editor/components/EditorToolbar";
import { EditorTopBar } from "@/src/editor/components/EditorTopBar";
import { PreviewPlayer } from "@/src/editor/components/PreviewPlayer";
import { ReorderHandle } from "@/src/editor/components/ReorderHandle";
import { Timeline } from "@/src/editor/components/Timeline";
import { TransportRow } from "@/src/editor/components/TransportRow";
import { TrimHandles } from "@/src/editor/components/TrimHandles";
import type { Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { closeStrip, openStrip } from "@/src/editor/toolStrip";
import { useAutosave } from "@/src/editor/useAutosave";
import { useLoadProject } from "@/src/editor/useLoadProject";
import { storage } from "@/src/projects";
import { theme } from "@/src/theme/theme";
import { Screen } from "@/src/ui/Screen";
import { Body, Title } from "@/src/ui/Text";
import { ToastHost } from "@/src/ui/Toast";

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useLoadProject(id);
  const save = useCallback((p: Project) => storage.saveProject(p), []);
  useAutosave(save);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const project = useEditorStore((s) => s.project);
  const clipById = (clipId: string) => project?.clips.find((c) => c.id === clipId);
  const [panelFor, setPanelFor] = useState<{ id: string; kind: "text" | "sticker" } | null>(null);

  if (load.status === "loading") return <Screen style={{ justifyContent: "center" }}><ActivityIndicator color={theme.colors.accent} /></Screen>;
  if (load.status === "error") return (
    <Screen style={{ justifyContent: "center", alignItems: "center", padding: 32, gap: 12 }}>
      <Title>Can't open project</Title><Body muted>{load.error}</Body>
    </Screen>
  );
  return (
    <Screen>
      <EditorTopBar onExport={() => { closeStrip(); useEditorStore.getState().setPlaying(false); router.push(`/editor/${id}/export`); }} />
      <View testID="slot-preview" style={{ flex: 1 }}>
        <PreviewPlayer onOpenPanel={(overlayId) => {
          const overlay = useEditorStore.getState().project?.overlays.find((o) => o.id === overlayId);
          setPanelFor({ id: overlayId, kind: overlay?.kind === "sticker" ? "sticker" : "text" });
        }} />
        <AudioPreview />
      </View>
      <TransportRow />
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
          onCutPress={(index) => {
            const clip = project?.clips[index];
            if (!clip) return;
            useEditorStore.getState().select(clip.id);
            openStrip("transition");
          }}
        />
      </View>
      <EditorToolbar panelFor={panelFor} onPanelChange={setPanelFor} />
      <ToastHost />
    </Screen>
  );
}
